/* ==========================================================================
   車両運用資料スクリプト
   - 1. PDFファイルサイズ自動取得
   - 2. 日別 車両運用充当・ステータス表示エンジン（Googleスプレッドシート連携対応）
   ========================================================================== */

// 車両アイコン解決ヘルパー
function getVehicleIconSrc(vehicleId) {
  if (vehicleId.includes("14-1") || vehicleId.includes("14-2")) {
    return "../../assets/moka14b.png"; // 赤帯
  }
  if (vehicleId.includes("モオカ14")) {
    return "../../assets/moka14.png";  // 緑帯
  }
  if (vehicleId.includes("C12")) {
    return "../../assets/c12mk.png";   // SL
  }
  if (vehicleId.includes("DE10")) {
    return "../../assets/de10j1.png";  // DL
  }
  if (vehicleId.includes("50") || vehicleId.includes("オハ")) {
    return "../../assets/moka50.png";  // 客車
  }
  return null;
}

// 軽量CSVパーサー (RFC 4180準拠)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(cell.trim());
        cell = "";
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && next === '\n') i++;
        row.push(cell.trim());
        if (row.some(x => x.length > 0)) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += c;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some(x => x.length > 0)) rows.push(row);
  }
  return rows;
}

// CSVを月データオブジェクトへ変換
function parseCsvToMonthData(year, month, csvText) {
  const rows = parseCSV(csvText);
  if (!rows || rows.length === 0) return null;

  let headerRow = null;
  let headerIdx = -1;
  let vColIdx = 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const vIdx = r.findIndex(c => c.includes("車両番号"));
    if (vIdx !== -1) {
      headerRow = r;
      headerIdx = i;
      vColIdx = vIdx;
      break;
    }
    if (r.some(c => /^\d{1,2}\//.test(c))) {
      headerRow = r;
      headerIdx = i;
      break;
    }
  }

  if (!headerRow) headerRow = rows[0];

  const dayCols = {};
  headerRow.forEach((c, idx) => {
    const parts = c.split("/");
    if (/^\d+$/.test(parts[0])) {
      dayCols[parseInt(parts[0], 10)] = idx;
    }
  });

  function getVehicleType(vid) {
    if (vid.includes("モオカ14")) return "moka14";
    if (vid.includes("C12")) return "sl";
    if (vid.includes("DE10")) return "dl";
    if (vid.includes("50") || vid.includes("オハ")) return "pc";
    if (vid.includes("キハ")) return "kiha20";
    return "other";
  }

  const vehicles = [];
  const notes = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 0) continue;

    const firstCell = r[0] || "";
    if (firstCell.startsWith("◆") || firstCell.startsWith("※") || firstCell.startsWith("（") || firstCell.startsWith("(")) {
      notes.push(firstCell);
      continue;
    }

    if (r.length <= vColIdx) continue;
    const vid = r[vColIdx].trim();
    if (!vid || vid === "車両番号" || vid.includes("形式")) {
      r.forEach((c, idx) => {
        const parts = c.split("/");
        if (/^\d+$/.test(parts[0])) {
          dayCols[parseInt(parts[0], 10)] = idx;
        }
      });
      continue;
    }

    let vObj = vehicles.find(v => v.id === vid);
    if (!vObj) {
      vObj = {
        id: vid,
        type: getVehicleType(vid),
        records: {}
      };
      vehicles.push(vObj);
    }

    Object.entries(dayCols).forEach(([dayNum, cIdx]) => {
      if (cIdx < r.length && r[cIdx]) {
        vObj.records[dayNum] = r[cIdx].trim();
      }
    });
  }

  const daysFound = Object.keys(dayCols).map(Number);
  const daysInMonth = daysFound.length > 0 ? Math.max(...daysFound) : 31;

  return {
    year,
    month,
    daysInMonth,
    vehicles,
    notes
  };
}

// 月データキャッシュ
const monthCache = {};

// 月データの取得
async function fetchMonthData(year, month) {
  const sheetName = `${year}${String(month).padStart(2, "0")}`; // "202611" など
  if (monthCache[sheetName]) {
    return monthCache[sheetName];
  }

  // 1. スプレッドシートID設定がある場合（Google Visualization API）
  if (window.CONFIG && window.CONFIG.UNYOU_SPREADSHEET_ID) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${window.CONFIG.UNYOU_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}&t=${Date.now()}`;
    try {
      const res = await fetch(csvUrl);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseCsvToMonthData(year, month, text);
        if (parsed && parsed.vehicles.length > 0) {
          console.log(`[Unyou] Googleスプレッドシート(${sheetName})からデータを取得しました`);
          monthCache[sheetName] = parsed;
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[Unyou] スプレッドシート取得失敗、フォールバックを試行します:`, err);
    }
  }

  // 2. ローカルキャッシュJSONへのフォールバック
  try {
    const res = await fetch(`data/sample_${sheetName}.json`);
    if (res.ok) {
      const data = await res.json();
      monthCache[sheetName] = data;
      return data;
    }
  } catch (err) {
    // ignore
  }

  // 3. デフォルトサンプルデータ
  const defRes = await fetch("data/sample_202610.json");
  if (defRes.ok) {
    const data = await defRes.json();
    return data;
  }

  throw new Error(`運用データ (${sheetName}) を読み込めませんでした。`);
}

/**
 * 車両運用パーサー
 */
class DailyOperationParser {
  constructor(monthData) {
    this.monthData = monthData;
    this.year = monthData.year;
    this.month = monthData.month;
  }

  getDaySnapshot(day) {
    const dayStr = String(day);
    const dateObj = new Date(this.year, this.month - 1, day);
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][dateObj.getDay()];
    const dateFormatted = `${this.year}-${String(this.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const opMap = {};
    const depotVehicles = [];
    const allVehicles = [];

    const getOpOrder = (code) => {
      const match = code.match(/^[変]?[A-Za-z]+(\d+)/);
      if (match) return parseInt(match[1], 10);
      return 999;
    };

    for (const v of this.monthData.vehicles) {
      const raw = (v.records && v.records[dayStr] ? v.records[dayStr] : "").trim();
      if (!raw) continue;

      const parsedVehicle = this.parseCell(v.id, v.type, raw);
      allVehicles.push(parsedVehicle);

      if (parsedVehicle.category === "running") {
        for (const op of parsedVehicle.assignedOps) {
          if (!opMap[op.opCode]) {
            opMap[op.opCode] = [];
          }
          opMap[op.opCode].push({
            vehicleId: v.id,
            vehicleType: v.type,
            phase: op.phase,
            isModified: op.isModified,
            isPredicted: op.isPredicted,
            rawText: raw,
            note: op.note
          });
        }
      } else {
        depotVehicles.push({
          vehicleId: v.id,
          vehicleType: v.type,
          statusText: raw,
          categoryLabel: parsedVehicle.statusCategoryLabel
        });
      }
    }

    const sortedOps = Object.keys(opMap)
      .sort((a, b) => getOpOrder(a) - getOpOrder(b))
      .map(opCode => ({
        opCode,
        assignments: opMap[opCode]
      }));

    return {
      date: dateFormatted,
      day,
      dayOfWeek,
      operations: sortedOps,
      depotVehicles,
      allVehicles,
      notes: this.monthData.notes || []
    };
  }

  parseCell(vehicleId, vehicleType, rawText) {
    const clean = rawText.trim();

    // 1. 車庫・留置系
    const depotKeywords = ["真岡", "新庫", "SL庫", "下2"];
    for (const kw of depotKeywords) {
      if (clean.includes(kw)) {
        return {
          vehicleId,
          vehicleType,
          rawText,
          category: "depot",
          statusCategoryLabel: "車庫・留置",
          statusText: clean
        };
      }
    }

    // 2. 検査・入場系
    if (clean.includes("検修") || clean.includes("OM") || clean.includes("全検")) {
      return {
        vehicleId,
        vehicleType,
        rawText,
        category: "inspection",
        statusCategoryLabel: "検査・入場",
        statusText: clean
      };
    }

    // 3. 訓練・特定行事系
    const eventKeywords = ["合同訓練", "展示", "構内試運転", "構内走行", "陶器市"];
    for (const kw of eventKeywords) {
      if (clean.includes(kw)) {
        return {
          vehicleId,
          vehicleType,
          rawText,
          category: "event",
          statusCategoryLabel: "訓練・行事",
          statusText: clean
        };
      }
    }

    // 4. 本線運行（A1, A12/A5 など）
    const parts = clean.split("/");
    const assignedOps = [];

    parts.forEach((part, index) => {
      const isPredicted = part.includes("(") && part.includes(")");
      const isModified = part.includes("変");
      const opCode = part.replace(/[()変]/g, "").trim();

      let phase = "all";
      let note = "";
      if (parts.length > 1) {
        if (index === 0) {
          phase = "first";
          note = `前半（後半 ${parts[1]} へ交代）`;
        } else {
          phase = "second";
          note = `後半（前半 ${parts[0]} から交代）`;
        }
      } else {
        if (isModified) note = "変更運用";
        if (isPredicted) note = "予測";
      }

      if (opCode) {
        assignedOps.push({
          opCode,
          phase,
          isModified,
          isPredicted,
          note
        });
      }
    });

    return {
      vehicleId,
      vehicleType,
      rawText,
      category: assignedOps.length > 0 ? "running" : "other",
      statusCategoryLabel: "本線稼働",
      statusText: clean,
      assignedOps
    };
  }
}

// 状態管理
const state = {
  parser: null,
  currentYear: 2026,
  currentMonth: 10,
  currentDay: 1,
  viewMode: "ops" // "ops" | "vehs"
};

// UIレンダリング
function renderDailyOperation() {
  const container = document.getElementById("daily-op-content");
  const notesContainer = document.getElementById("daily-op-notes");
  if (!container || !state.parser) return;

  const snap = state.parser.getDaySnapshot(state.currentDay);

  // 日付入力欄の同期
  const dateInput = document.getElementById("op-date-input");
  if (dateInput) {
    dateInput.value = snap.date;
  }

  let html = "";

  if (state.viewMode === "ops") {
    // 1. 運用行路別ビュー
    html += `
      <div class="op-table-wrap">
        <div class="op-table-title">本線稼働 運用充当一覧 (${snap.operations.length}行路)</div>
        <table class="op-table">
          <thead>
            <tr>
              <th class="col-opcode">運用</th>
              <th class="col-vehicle">充当車両</th>
              <th class="col-detail">備考・交代状況</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (snap.operations.length === 0) {
      html += `<tr><td colspan="3" class="col-detail" style="text-align: center; color: var(--c-muted); padding: 18px;">稼働列車のデータがありません</td></tr>`;
    } else {
      snap.operations.forEach(op => {
        op.assignments.forEach((asg, idx) => {
          const iconSrc = getVehicleIconSrc(asg.vehicleId);
          const iconHTML = iconSrc ? `<img src="${iconSrc}" class="v-icon" alt="" aria-hidden="true">` : "";
          const tagPred = asg.isPredicted ? `<span class="v-tag-pred">予測</span>` : "";
          const tagMod = asg.isModified ? `<span class="v-tag-mod">変更</span>` : "";

          html += `
            <tr>
              <td class="col-opcode">
                ${idx === 0 ? `<span class="op-badge op-badge-local">${op.opCode}</span>` : ""}
              </td>
              <td class="col-vehicle">
                <span class="v-item">${iconHTML}${asg.vehicleId}${tagPred}${tagMod}</span>
              </td>
              <td class="col-detail">
                <span class="v-note-sub">${asg.note || "終日充当"}</span>
              </td>
            </tr>
          `;
        });
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    // 留置・車庫・検査状況テーブル
    html += `
      <div class="op-table-wrap">
        <div class="op-table-title">基地・車庫・検査状況 (${snap.depotVehicles.length}両)</div>
        <table class="op-table">
          <thead>
            <tr>
              <th class="col-vehicle">車両番号</th>
              <th class="col-status">状態・場所</th>
              <th class="col-cat">区分</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (snap.depotVehicles.length === 0) {
      html += `<tr><td colspan="3" class="col-detail" style="text-align: center; color: var(--c-muted); padding: 18px;">該当車両はありません</td></tr>`;
    } else {
      snap.depotVehicles.forEach(dv => {
        const iconSrc = getVehicleIconSrc(dv.vehicleId);
        const iconHTML = iconSrc ? `<img src="${iconSrc}" class="v-icon" alt="" aria-hidden="true">` : "";

        html += `
          <tr>
            <td class="col-vehicle">
              <span class="v-item">${iconHTML}${dv.vehicleId}</span>
            </td>
            <td class="col-status" style="font-weight: 600;">
              ${dv.statusText}
            </td>
            <td class="col-cat">
              <span class="v-note-sub">${dv.categoryLabel}</span>
            </td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

  } else {
    // 2. 車両ステータス別ビュー（全車両）
    html += `
      <div class="op-table-wrap">
        <div class="op-table-title">所属車両ステータス一覧 (${snap.allVehicles.length}両)</div>
        <table class="op-table">
          <thead>
            <tr>
              <th class="col-vehicle">車両番号</th>
              <th class="col-status">本日の現況 / 充当</th>
              <th class="col-cat">状態区分</th>
            </tr>
          </thead>
          <tbody>
    `;

    snap.allVehicles.forEach(v => {
      const iconSrc = getVehicleIconSrc(v.vehicleId);
      const iconHTML = iconSrc ? `<img src="${iconSrc}" class="v-icon" alt="" aria-hidden="true">` : "";

      let statusDisplay = v.statusText;
      if (v.category === "running") {
        const ops = v.assignedOps.map(o => {
          let s = o.opCode;
          if (o.isModified) s = `変${s}`;
          if (o.isPredicted) s = `(${s})`;
          return s;
        }).join(" / ");
        statusDisplay = `<span class="op-badge op-badge-local">${ops}</span>`;
      }

      html += `
        <tr>
          <td class="col-vehicle">
            <span class="v-item">${iconHTML}${v.vehicleId}</span>
          </td>
          <td class="col-status">
            ${statusDisplay}
          </td>
          <td class="col-cat">
            <span class="v-note-sub">${v.statusCategoryLabel}</span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = html;

  // 備考・注記欄の更新
  if (notesContainer && snap.notes && snap.notes.length > 0) {
    notesContainer.style.display = "block";
    notesContainer.innerHTML = `
      <strong>特記事項・備考</strong>
      <ul>${snap.notes.map(n => `<li>${n}</li>`).join("")}</ul>
    `;
  } else if (notesContainer) {
    notesContainer.style.display = "none";
  }
}

// 月データのロードと更新
async function loadDate(year, month, day) {
  if (state.currentYear !== year || state.currentMonth !== month || !state.parser) {
    try {
      const monthData = await fetchMonthData(year, month);
      state.parser = new DailyOperationParser(monthData);
      state.currentYear = year;
      state.currentMonth = month;
    } catch (err) {
      console.error("[Load Date Error]", err);
      const container = document.getElementById("daily-op-content");
      if (container) {
        container.innerHTML = `<div class="empty-message" style="color: #dc2626;">${year}年${month}月の運用データを読み込めませんでした。</div>`;
      }
      return;
    }
  }

  state.currentDay = Math.min(day, state.parser.monthData.daysInMonth || 31);
  renderDailyOperation();
}

// 初期化
async function initDailyOperation() {
  try {
    // 初期日付は現在日付、または2026年10月1日（サンプル）
    const now = new Date();
    // もし現在が2026年内なら現在日を、それ以外なら2026年10月1日をデフォルトに
    let y = 2026, m = 10, d = 1;
    if (now.getFullYear() === 2026 && now.getMonth() + 1 >= 10) {
      y = now.getFullYear();
      m = now.getMonth() + 1;
      d = now.getDate();
    }

    await loadDate(y, m, d);

    // イベントリスナーの登録
    const prevBtn = document.getElementById("op-prev-btn");
    const nextBtn = document.getElementById("op-next-btn");
    const todayBtn = document.getElementById("op-today-btn");
    const dateInput = document.getElementById("op-date-input");
    const btnViewOps = document.getElementById("btn-view-ops");
    const btnViewVehs = document.getElementById("btn-view-vehs");

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (state.currentDay > 1) {
          state.currentDay--;
          renderDailyOperation();
        } else {
          // 前月末日へ
          let prevY = state.currentYear;
          let prevM = state.currentMonth - 1;
          if (prevM < 1) { prevM = 12; prevY--; }
          const daysInPrev = new Date(prevY, prevM, 0).getDate();
          loadDate(prevY, prevM, daysInPrev);
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (state.parser && state.currentDay < state.parser.monthData.daysInMonth) {
          state.currentDay++;
          renderDailyOperation();
        } else {
          // 翌月1日へ
          let nextY = state.currentYear;
          let nextM = state.currentMonth + 1;
          if (nextM > 12) { nextM = 1; nextY++; }
          loadDate(nextY, nextM, 1);
        }
      };
    }

    if (todayBtn) {
      todayBtn.onclick = () => {
        const todayNow = new Date();
        if (todayNow.getFullYear() === 2026) {
          loadDate(todayNow.getFullYear(), todayNow.getMonth() + 1, todayNow.getDate());
        } else {
          loadDate(2026, 10, 1);
        }
      };
    }

    if (dateInput) {
      dateInput.addEventListener("change", (e) => {
        const val = e.target.value; // YYYY-MM-DD
        const parts = val.split("-");
        if (parts.length === 3) {
          const yNum = parseInt(parts[0], 10);
          const mNum = parseInt(parts[1], 10);
          const dNum = parseInt(parts[2], 10);
          if (yNum && mNum && dNum) {
            loadDate(yNum, mNum, dNum);
          }
        }
      });
    }

    if (btnViewOps && btnViewVehs) {
      btnViewOps.onclick = () => {
        state.viewMode = "ops";
        btnViewOps.classList.add("active");
        btnViewVehs.classList.remove("active");
        renderDailyOperation();
      };
      btnViewVehs.onclick = () => {
        state.viewMode = "vehs";
        btnViewVehs.classList.add("active");
        btnViewOps.classList.remove("active");
        renderDailyOperation();
      };
    }
  } catch (err) {
    console.error("[Daily Operation Init Error]", err);
  }
}

// 既存のPDFファイルサイズ取得処理
document.addEventListener("DOMContentLoaded", () => {
  initDailyOperation();

  const sizeBadges = document.querySelectorAll("[data-file-size]");
  sizeBadges.forEach(async (badge) => {
    const fileUrl = badge.getAttribute("data-file-size");
    if (!fileUrl) return;

    try {
      const response = await fetch(fileUrl, { method: "HEAD" });
      if (!response.ok) return;

      const contentLength = response.headers.get("Content-Length");
      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        badge.textContent = `[PDF/${formatBytes(bytes)}]`;
      }
    } catch (error) {
      // ignore
    }
  });
});

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return "0KB";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}
