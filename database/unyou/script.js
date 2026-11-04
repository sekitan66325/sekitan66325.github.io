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

const FALLBACK_202610_DATA = {"year": 2026, "month": 10, "title": "真岡鐵道 車両運用記録（2026年10月）", "daysInMonth": 31, "vehicles": [{"id": "モオカ14-1", "type": "moka14", "records": {"1": "A4", "2": "A2", "3": "A6", "4": "A1", "5": "A4", "6": "真岡", "7": "A3", "8": "真岡", "9": "A4", "10": "A12/A5", "11": "A3", "12": "A12/A5", "13": "A13/A22", "14": "A2/A31", "15": "A11/(A6)", "16": "(A1)", "17": "真岡", "18": "A2/A31", "19": "A11/A6", "20": "A1", "21": "A12", "22": "真岡", "23": "A4", "24": "A12/A5", "25": "A3", "26": "A4", "27": "A12", "28": "A3", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-2", "type": "moka14", "records": {"1": "合同訓練", "2": "真岡", "3": "真岡", "4": "真岡", "5": "DC検修3", "6": "DC検修3", "7": "DC検修3", "8": "DC検修3", "9": "DC検修3", "10": "DC検修3", "11": "DC検修3", "12": "DC検修3", "13": "DC検修3", "14": "真岡", "15": "真岡", "16": "真岡", "17": "A6", "18": "A1", "19": "真岡", "20": "A4", "21": "A12/A5", "22": "A13/A22", "23": "A2", "24": "A6", "25": "A1", "26": "真岡", "27": "A1", "28": "A3", "29": "A4", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-3", "type": "moka14", "records": {"1": "変A13", "2": "A4", "3": "A2", "4": "A6", "5": "A1", "6": "A4", "7": "A4", "8": "A12/A5", "9": "A13/A22", "10": "A2", "11": "A6", "12": "A1", "13": "A3", "14": "真岡", "15": "A4", "16": "A12/A5", "17": "A3", "18": "A12/A5", "19": "A13/A22", "20": "A2/A31", "21": "A11/A6", "22": "A1", "23": "A3", "24": "真岡", "25": "A4", "26": "A4", "27": "A12/A5", "28": "A13/A22", "29": "A2/A31", "30": "A11/A6", "31": "陶器市"}}, {"id": "モオカ14-4", "type": "moka14", "records": {"1": "A2/A31", "2": "A11/A6", "3": "A1/A5", "4": "A3", "5": "A12/A5", "6": "変A13", "7": "A2/A31", "8": "A11/A6", "9": "A1", "10": "真岡", "11": "A2", "12": "A6", "13": "A1", "14": "A3", "15": "(真岡)", "16": "(真岡)", "17": "A4", "18": "真岡", "19": "A3", "20": "真岡", "21": "A4", "22": "A12/A5", "23": "A13/A22", "24": "A2", "25": "A6", "26": "A1", "27": "陶器市", "28": "陶器市", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-5", "type": "moka14", "records": {"1": "A1", "2": "A3", "3": "A12", "4": "真岡", "5": "真岡", "6": "A3", "7": "A12/A5", "8": "A13/A22", "9": "A2", "10": "A6", "11": "A1/A5", "12": "A3", "13": "A12/A5", "14": "A13/(A6)", "15": "(A1)", "16": "(A3)", "17": "真岡", "18": "DC検修3", "19": "DC検修3", "20": "DC検修3", "21": "DC検修3", "22": "DC検修3", "23": "DC検修3", "24": "DC検修3", "25": "DC検修3", "26": "DC検修3", "27": "DC検修3", "28": "DC検修3", "29": "DC検修3", "30": "DC検修3", "31": "DC検修3"}}, {"id": "モオカ14-6", "type": "moka14", "records": {"1": "A11/A6", "2": "A1", "3": "真岡", "4": "A4", "5": "A2/A31", "6": "A11/A6", "7": "A1/A63", "8": "A3", "9": "真岡", "10": "(A4)", "11": "A4", "12": "真岡", "13": "真岡", "14": "A4", "15": "A12/A5", "16": "A13/A22", "17": "A2", "18": "A6", "19": "A1", "20": "A3", "21": "真岡", "22": "A4", "23": "A12/A5", "24": "A3", "25": "A12/A5", "26": "A13/A22", "27": "A2/A31", "28": "A11/A6", "29": "A1", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-7", "type": "moka14", "records": {"1": "真岡", "2": "真岡", "3": "真岡", "4": "A2/A31", "5": "A11/A6", "6": "A1/A63", "7": "真岡", "8": "A4", "9": "A12/A5", "10": "A3", "11": "A12", "12": "真岡", "13": "A2/A31", "14": "A11/(A22)", "15": "A2/A31", "16": "A11/A6", "17": "A1", "18": "A4", "19": "A4", "20": "A12/A5", "21": "A13/A22", "22": "A2/A31", "23": "A11/A6", "24": "A1", "25": "真岡", "26": "A2/A31", "27": "A11/A6", "28": "A1/A5", "29": "A13/A22", "30": "A2/A31", "31": "陶器市"}}, {"id": "モオカ14-8", "type": "moka14", "records": {"1": "A3", "2": "A12/A5", "3": "A3", "4": "A12/A5", "5": "変A13", "6": "A2/A31", "7": "A11/A6", "8": "A1/A63", "9": "A3", "10": "(真岡)", "11": "真岡", "12": "A2/A31", "13": "A11/A6", "14": "A1", "15": "A3", "16": "A4", "17": "A12/A5", "18": "A3", "19": "A12/A5", "20": "A13/A22", "21": "A2/A31", "22": "A11/A6", "23": "A1", "24": "真岡", "25": "A2/A31", "26": "A11/A6", "27": "A1", "28": "A4", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-9", "type": "moka14", "records": {"1": "A12/A5", "2": "変A13", "3": "A4", "4": "真岡", "5": "A3", "6": "A12/A5", "7": "A13/A22", "8": "A2/A31", "9": "A11/A6", "10": "A1", "11": "真岡", "12": "A4", "13": "A4", "14": "A12/A5", "15": "A13/A22", "16": "A2", "17": "真岡", "18": "真岡", "19": "A2/A31", "20": "A11/A6", "21": "A1", "22": "A3", "23": "真岡", "24": "A4", "25": "真岡", "26": "真岡", "27": "A4", "28": "A12/A5", "29": "A13/A22", "30": "陶器市", "31": "陶器市"}}, {"id": "C12 66", "type": "sl", "records": {"1": "OM(全検)", "2": "OM(全検)", "3": "OM(全検)", "4": "OM(全検)", "5": "OM(全検)", "6": "OM(全検)", "7": "OM(全検)", "8": "OM(全検)", "9": "OM(全検)", "10": "OM(全検)", "11": "OM(全検)", "12": "OM(全検)", "13": "OM(全検)", "14": "OM(全検)", "15": "OM(全検)", "16": "OM(全検)", "17": "OM(全検)", "18": "OM(全検)", "19": "OM(全検)", "20": "OM(全検)", "21": "OM(全検)", "22": "OM(全検)", "23": "OM(全検)", "24": "OM(全検)", "25": "OM(全検)", "26": "OM(全検)", "27": "OM(全検)", "28": "OM(全検)", "29": "OM(全検)", "30": "OM(全検)", "31": "OM(全検)"}}, {"id": "DE10 1535", "type": "dl", "records": {"1": "SL庫", "2": "SL庫", "3": "SL庫", "4": "SL庫", "5": "SL庫", "6": "SL庫", "7": "SL庫", "8": "SL庫", "9": "SL庫", "10": "SL庫", "11": "SL庫", "12": "SL庫", "13": "SL庫", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "展示", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡", "31": "真岡"}}, {"id": "オハ50系", "type": "pc", "records": {"1": "下2", "2": "下2", "3": "下2", "4": "下2", "5": "下2", "6": "下2", "7": "下2", "8": "下2", "9": "下2", "10": "下2", "11": "下2", "12": "下2", "13": "下2", "14": "下2", "15": "下2", "16": "下2", "17": "下2", "18": "下2", "19": "下2", "20": "下2", "21": "下2", "22": "下2", "23": "下2", "24": "下2", "25": "下2", "26": "下2", "27": "下2", "28": "下2", "29": "下2", "30": "下2", "31": "下2"}}, {"id": "キハ20 247", "type": "kiha20", "records": {"1": "新庫", "2": "新庫", "3": "新庫", "4": "新庫", "5": "新庫", "6": "新庫", "7": "新庫", "8": "新庫", "9": "新庫", "10": "新庫", "11": "新庫", "12": "新庫", "13": "新庫", "14": "新庫", "15": "新庫", "16": "新庫", "17": "新庫", "18": "新庫", "19": "新庫", "20": "構内試運転", "21": "新庫", "22": "新庫", "23": "新庫", "24": "新庫", "25": "構内走行", "26": "新庫", "27": "新庫", "28": "新庫", "29": "新庫", "30": "新庫", "31": "新庫"}}], "notes": ["◆1・2・5・6日は茂木高校で中間試験。", "◆6〜9日は真岡高校・真岡女子高校で中間試験。", "◆1日の「合同訓練」は真岡駅下り1番線にて栃木県警察と真岡鐵道が行った「不審者対応合同訓練」。", "◆25日のDE10 1535はSLフェスタでの展示。", "◆25日のキハ20 247は「SLフェスタ2026」の企画「〜昔の真岡線に乗ってみよう〜キハ20 タイムスリップ乗車体験」等。", "※（）付・最終更新日以降のデータは予測に基づくものです。"]};

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
      if (res.status === 401 || res.status === 403) {
        throw new Error("AUTH_401");
      }
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith("<!DOCTYPE") || text.includes("<html")) {
          throw new Error("INVALID_RESPONSE");
        }
        const parsed = parseCsvToMonthData(year, month, text);
        if (parsed && parsed.vehicles.length > 0) {
          console.log(`[Unyou] Googleスプレッドシート(${sheetName})からデータを取得しました`);
          monthCache[sheetName] = parsed;
          return parsed;
        }
      }
    } catch (err) {
      if (err.message === "AUTH_401") {
        throw err;
      }
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

  // 3. デフォルトサンプルデータ（2026年10月）
  if (sheetName === "202610" || !window.CONFIG || !window.CONFIG.UNYOU_SPREADSHEET_ID) {
    if (typeof FALLBACK_202610_DATA !== "undefined") {
      monthCache["202610"] = FALLBACK_202610_DATA;
      return FALLBACK_202610_DATA;
    }
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
        let msg = `${year}年${month}月の運用データを読み込めませんでした。`;
        if (err.message === "AUTH_401") {
          msg = `<strong>Googleスプレッドシートのアクセス権限エラー (401 Unauthorized)</strong><br>` +
                `<span style="display:inline-block; margin-top:6px; font-size:0.85rem; color:var(--c-fg);">Googleスプレッドシートの「共有」設定で、一般的なアクセスを「<strong>リンクを知っている全員が閲覧可能</strong>」に変更してください。</span>`;
        }
        container.innerHTML = `<div class="empty-message" style="color: #dc2626; line-height: 1.6;">${msg}</div>`;
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
