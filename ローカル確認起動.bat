@echo off
chcp 65001 > nul
echo ========================================================
echo   真岡鐵道 データベース ローカルプレビューサーバー
echo ========================================================
echo.
echo ブラウザで以下のURLを開いて確認できます：
echo.
echo  ◆ 管理画面 (駅情報編集・パスキーUI確認):
echo     http://localhost:8080/admin/index.html?dev=1^&tab=stations
echo.
echo  ◆ 管理ログイン画面 (パスキーボタン確認):
echo     http://localhost:8080/admin/index.html
echo.
echo  ◆ 列車走行位置 (次の列車カウントダウン・行先表示):
echo     http://localhost:8080/train-state/index.html
echo.
echo  ◆ 公開ポータルトップ:
echo     http://localhost:8080/index.html
echo.
echo ※ 終了するときは、このウィンドウを閉じるか Ctrl+C を押してください。
echo ========================================================
echo.
start http://localhost:8080/admin/index.html?dev=1^&tab=stations
python -m http.server 8080
pause
