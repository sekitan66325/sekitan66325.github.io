#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真岡鐵道 データベース 自動同期・バックアップ管理ツール (sync.py)
GitHub（Web公開データ）とローカルPCデータ間の自動差分検知・安全マージ・自動バックアップを提供します。
"""

import os
import sys
import json
import shutil
import datetime
import urllib.request

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

REPO_OWNER = "sekitan66325"
REPO_NAME = "sekitan66325.github.io"
BRANCH = "main"

RAW_BASE = f"https://raw.githubusercontent.com/{REPO_OWNER}/{REPO_NAME}/{BRANCH}"
API_BASE = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "train-state", "data")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")

TARGET_FILES = [
    "train-state/data/timetable.json",
    "train-state/data/stations.json"
]

def make_backup(filename):
    """ローカルファイルのタイムスタンプ付きバックアップを作成"""
    src_path = os.path.join(BASE_DIR, filename.replace("/", os.sep))
    if not os.path.exists(src_path):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = os.path.basename(filename)
    backup_name = f"{os.path.splitext(base_name)[0]}_{ts}.json"
    dest_path = os.path.join(BACKUP_DIR, backup_name)
    shutil.copy2(src_path, dest_path)
    return dest_path

def fetch_github_json(relative_path):
    """GitHubから最新のJSONデータを取得"""
    url = f"{RAW_BASE}/{relative_path}?_t={datetime.datetime.now().timestamp()}"
    req = urllib.request.Request(url, headers={"User-Agent": "Moka-Sync-Tool/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[エラー] GitHubからの取得に失敗しました ({url}): {e}")
        return None

def fetch_latest_commit():
    """最新コミット情報を取得"""
    url = f"{API_BASE}/commits/{BRANCH}"
    req = urllib.request.Request(url, headers={"User-Agent": "Moka-Sync-Tool/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "sha": data.get("sha", "")[:8],
                "message": data.get("commit", {}).get("message", "").split("\n")[0],
                "date": data.get("commit", {}).get("author", {}).get("date", ""),
                "author": data.get("commit", {}).get("author", {}).get("name", "")
            }
    except Exception as e:
        return {"error": str(e)}

def merge_timetables(local_trains, gh_trains):
    """
    スマート・マージ処理:
    Web側（管理画面）で行われた運行日ルール（operation_rule）などの更新と、
    ローカル側で行われた駅情報・行先修正を列車単位・フィールド単位で安全に結合。
    """
    gh_map = {t["train_id"]: t for t in gh_trains}
    merged = []
    diff_logs = []

    for loc_t in local_trains:
        tid = loc_t.get("train_id")
        if tid not in gh_map:
            merged.append(loc_t)
            diff_logs.append(f"  [ローカル新規列車] {tid}")
            continue

        gh_t = gh_map[tid]
        merged_t = dict(loc_t)

        # 1. 運行日ルール（operation_rule / dates_run 等）はWeb側の最新指定を優先
        if json.dumps(loc_t.get("operation_rule")) != json.dumps(gh_t.get("operation_rule")):
            merged_t["operation_rule"] = gh_t.get("operation_rule")
            diff_logs.append(f"  [運行ルール同期] 列車 {loc_t.get('train_no')}: Web側の最新設定を採用")

        # 2. 臨時運行日・除外日
        for f in ["dates_run", "dates_off", "days_off"]:
            if f in gh_t and gh_t[f] != loc_t.get(f):
                merged_t[f] = gh_t[f]

        # 3. 運用記号
        if gh_t.get("operation_id") and gh_t.get("operation_id") != loc_t.get("operation_id"):
            merged_t["operation_id"] = gh_t.get("operation_id")
            diff_logs.append(f"  [運用記号同期] 列車 {loc_t.get('train_no')}: {loc_t.get('operation_id')} -> {gh_t.get('operation_id')}")

        merged.append(merged_t)

    # Web側で新規追加された列車があれば追加
    loc_ids = {t["train_id"] for t in local_trains}
    for gh_t in gh_trains:
        if gh_t.get("train_id") not in loc_ids:
            merged.append(gh_t)
            diff_logs.append(f"  [Web側新規列車を追加] {gh_t.get('train_id')}")

    return merged, diff_logs

def cmd_check():
    """差分チェック"""
    print("=" * 60)
    print("【真岡鐵道 データベース 同期状況チェック】")
    print("=" * 60)

    commit = fetch_latest_commit()
    if "error" not in commit:
        print(f"GitHub最新コミット: [{commit['sha']}] {commit['message']} ({commit['date']}) by {commit['author']}")
    else:
        print(f"GitHubコミット情報取得失敗: {commit['error']}")
    print("-" * 60)

    # 1. timetable.json チェック
    gh_tt = fetch_github_json("train-state/data/timetable.json")
    loc_tt_path = os.path.join(DATA_DIR, "timetable.json")
    if gh_tt and os.path.exists(loc_tt_path):
        with open(loc_tt_path, "r", encoding="utf-8") as f:
            loc_tt = json.load(f)

        gh_map = {t["train_id"]: t for t in gh_tt}
        loc_map = {t["train_id"]: t for t in loc_tt}

        diffs = []
        for tid, loc_t in loc_map.items():
            gh_t = gh_map.get(tid)
            if not gh_t:
                diffs.append(f"列車 {tid}: ローカルにのみ存在")
                continue
            if json.dumps(loc_t.get("operation_rule")) != json.dumps(gh_t.get("operation_rule")):
                diffs.append(f"列車 {loc_t.get('train_no')}: 運行ルール（平日/土休日設定）に差分あり")
            if loc_t.get("destination") != gh_t.get("destination"):
                diffs.append(f"列車 {loc_t.get('train_no')}: 行先に差分あり (ローカル: {loc_t.get('destination')} / Web: {gh_t.get('destination')})")
            if loc_t.get("operation_id") != gh_t.get("operation_id"):
                diffs.append(f"列車 {loc_t.get('train_no')}: 運用番号に差分あり (ローカル: {loc_t.get('operation_id')} / Web: {gh_t.get('operation_id')})")

        if diffs:
            print(f"◆ timetable.json: {len(diffs)} 件の差分が見つかりました：")
            for d in diffs:
                print(f"  - {d}")
        else:
            print("◆ timetable.json: Webとローカルの内容は完全に一致しています（差分なし）")

    # 2. stations.json チェック
    gh_st = fetch_github_json("train-state/data/stations.json")
    loc_st_path = os.path.join(DATA_DIR, "stations.json")
    if gh_st and os.path.exists(loc_st_path):
        with open(loc_st_path, "r", encoding="utf-8") as f:
            loc_st = json.load(f)
        if len(gh_st) != len(loc_st):
            print(f"◆ stations.json: 駅数に差分があります (ローカル: {len(loc_st)} / Web: {len(gh_st)})")
        else:
            # Check if local has deep research fields that GitHub doesn't
            has_more = any(len(loc_st[i].keys()) > len(gh_st[i].keys()) for i in range(len(loc_st)))
            if has_more:
                print("◆ stations.json: ローカル側に最新の詳細リサーチデータ（電報略号、開業日、配線等）が追加されています（Web未反映）")
            else:
                print("◆ stations.json: 一致しています")

    print("=" * 60)

def cmd_pull():
    """GitHubから最新データを取り込みマージ"""
    print("=" * 60)
    print("【GitHubからの安全同期（Pull & Merge）】")
    print("=" * 60)

    # 1. バックアップ
    tt_file = "train-state/data/timetable.json"
    bk = make_backup(tt_file)
    if bk:
        print(f"[バックアップ完了] {os.path.basename(bk)}")

    # 2. timetable.json の取得とマージ
    gh_tt = fetch_github_json(tt_file)
    loc_tt_path = os.path.join(DATA_DIR, "timetable.json")
    if gh_tt and os.path.exists(loc_tt_path):
        with open(loc_tt_path, "r", encoding="utf-8") as f:
            loc_tt = json.load(f)

        merged, diff_logs = merge_timetables(loc_tt, gh_tt)
        if diff_logs:
            print("\n以下の変更を安全にマージしました：")
            for l in diff_logs:
                print(l)
            with open(loc_tt_path, "w", encoding="utf-8") as f:
                json.dump(merged, f, ensure_ascii=False, indent=2)
            print(f"\n[更新完了] {loc_tt_path} を最新状態に同期しました。")
        else:
            print("\n[確認] Web側からの新しい変更はありません。すでに同期されています。")

    print("=" * 60)

def cmd_backup():
    """手動スナップショット作成"""
    print("=" * 60)
    print("【全データの手動バックアップスナップショット作成】")
    print("=" * 60)
    for tf in TARGET_FILES:
        bk = make_backup(tf)
        if bk:
            print(f"  作成: {os.path.basename(bk)}")
    print("バックアップフォルダ: train-state/data/backups/")
    print("=" * 60)

if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "check"
    if action == "check":
        cmd_check()
    elif action == "pull":
        cmd_pull()
    elif action == "backup":
        cmd_backup()
    else:
        print("使い方:")
        print("  python sync.py check   : Web（GitHub）とローカルの差分を一覧確認")
        print("  python sync.py pull    : Webの最新変更を安全にマージして取り込む（自動バックアップ付）")
        print("  python sync.py backup  : 現在のローカルデータのスナップショットを作成")

