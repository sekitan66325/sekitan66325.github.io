var $ = (s, root = document) => root.querySelector(s);

var $$ = (s, root = document) => [...root.querySelectorAll(s)];

var DATA = { stations: [], timetable: [], prevTimetable: [], status: null, operationVehicles: {} };

var state = {
  view: "position",
  serviceDate: "2026-11-05",
  currentMinutes: null,
  liveClock: true,
  diagramDir: "all",
  timetableDir: "up",
  selectedStationCode: "M07",
  stationDirFilter: "all"
};

// 車両アイコンパスの取得

function getVehicleIconSrc(vehicleId) {
  if (!vehicleId) return "../assets/moka14.png";
  const id = vehicleId.trim();
  if (id.includes("キハ20") || id.includes("247")) return "../assets/j52.png";
  if (id.includes("C12")) return "../assets/c12mk.png";
  if (id.includes("DE10")) return "../assets/de10j1.png";
  if (id.includes("50") || id.includes("オハ")) return "../assets/moka50.png";
  return "../assets/moka14.png";
}

function getSpreadsheetId() {

  if (typeof CONFIG !== "undefined" && CONFIG.UNYOU_SPREADSHEET_ID) {
    return CONFIG.UNYOU_SPREADSHEET_ID;
  }

  if (typeof window !== "undefined" && window.CONFIG && window.CONFIG.UNYOU_SPREADSHEET_ID) {
    return window.CONFIG.UNYOU_SPREADSHEET_ID;
  }

  return "1tzgW4fok2NkcoO2816NcEYSw7zv_jeobifrPIqh4vQY";

}

// CSVパーサー（引用符・改行・カンマ対応）

function parseSpreadsheetCSV(text) {

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
        row.push(cell);
        cell = "";
      } else if (c === '\r') {
        if (next === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += c;
      }

    }

  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;

}

// スプレッドシートCSVパース

function parseSpreadsheetMonthCsv(year, month, csvText) {

  const rows = parseSpreadsheetCSV(csvText);

  if (rows.length === 0) return null;

  let vColIdx = 1;

  let currentDayCols = {};

  const vehicles = [];

  for (let i = 0; i < rows.length; i++) {

    const r = rows[i];

    if (!r || r.length === 0 || r.every(c => !c || c.trim() === "")) continue;

    const firstCell = (r[0] || "").trim();

    if (firstCell.startsWith("◆") || firstCell.startsWith("※") || firstCell.startsWith("（") || firstCell.startsWith("(")) {
      continue;
    }

    for (let c = 0; c < r.length; c++) {

      if ((r[c] || "").includes("車両番号")) {
        vColIdx = c;
        break;
      }

    }

    let hasDates = false;

    const newDayCols = {};

    for (let c = 0; c < r.length; c++) {

      const parts = (r[c] || "").trim().split("/");

      if (parts[0] && /^\d+$/.test(parts[0])) {

        const dNum = parseInt(parts[0], 10);

        if (dNum >= 1 && dNum <= 31) {
          newDayCols[dNum] = c;
          hasDates = true;
        }

      }

    }

    if (hasDates) {
      currentDayCols = newDayCols;
      continue;
    }

    if (r.length > vColIdx) {

      const vid = (r[vColIdx] || "").trim();

      if (!vid || vid === "車両番号" || vid.includes("形式") || vid.endsWith("月")) {
        continue;
      }

      let vObj = vehicles.find(v => v.id === vid);

      if (!vObj) {

        vObj = { id: vid, records: {} };

        vehicles.push(vObj);

      }

      Object.keys(currentDayCols).forEach(dStr => {

        const d = parseInt(dStr, 10);

        const colIdx = currentDayCols[d];

        if (colIdx < r.length) {

          const val = (r[colIdx] || "").trim();

          if (val) {
            vObj.records[dStr] = val;
          }

        }

      });

    }

  }

  return { year, month, vehicles };

}

const operationMonthCache = {};

// 組み込みフォールバックデータ

const EMBEDDED_FALLBACK_202610 = {"year": 2026, "month": 10, "vehicles": [{"id": "モオカ14-1", "records": {"1": "A4", "2": "A2", "3": "A6", "4": "A1", "5": "A4", "6": "真岡", "7": "A3", "8": "真岡", "9": "A4", "10": "A12/A5", "11": "A3", "12": "A12/A5", "13": "A13/A22", "14": "A2/A31", "15": "A11/(A6)", "16": "(A1)", "17": "真岡", "18": "A2/A31", "19": "A11/A6", "20": "A1", "21": "A12", "22": "真岡", "23": "A4", "24": "A12/A5", "25": "A3", "26": "A4", "27": "A12", "28": "A3", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-2", "records": {"1": "合同訓練", "2": "真岡", "3": "真岡", "4": "真岡", "5": "DC検修3", "6": "DC検修3", "7": "DC検修3", "8": "DC検修3", "9": "DC検修3", "10": "DC検修3", "11": "DC検修3", "12": "DC検修3", "13": "DC検修3", "14": "真岡", "15": "真岡", "16": "真岡", "17": "A6", "18": "A1", "19": "真岡", "20": "A4", "21": "A12/A5", "22": "A13/A22", "23": "A2", "24": "A6", "25": "A1", "26": "真岡", "27": "A1", "28": "A3", "29": "A4", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-3", "records": {"1": "変A13", "2": "A4", "3": "A2", "4": "A6", "5": "A1", "6": "A4", "7": "A4", "8": "A12/A5", "9": "A13/A22", "10": "A2", "11": "A6", "12": "A1", "13": "A3", "14": "真岡", "15": "A4", "16": "A12/A5", "17": "A3", "18": "A12/A5", "19": "A13/A22", "20": "A2/A31", "21": "A11/A6", "22": "A1", "23": "A3", "24": "真岡", "25": "A4", "26": "A4", "27": "A12/A5", "28": "A13/A22", "29": "A2/A31", "30": "A11/A6", "31": "陶器市"}}, {"id": "モオカ14-4", "records": {"1": "A2/A31", "2": "A11/A6", "3": "A1/A5", "4": "A3", "5": "A12/A5", "6": "変A13", "7": "A2/A31", "8": "A11/A6", "9": "A1", "10": "真岡", "11": "A2", "12": "A6", "13": "A1", "14": "A3", "15": "(真岡)", "16": "(真岡)", "17": "A4", "18": "真岡", "19": "A3", "20": "真岡", "21": "A4", "22": "A12/A5", "23": "A13/A22", "24": "A2", "25": "A6", "26": "A1", "27": "陶器市", "28": "陶器市", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-5", "records": {"1": "A1", "2": "A3", "3": "A12", "4": "真岡", "5": "真岡", "6": "A3", "7": "A12/A5", "8": "A13/A22", "9": "A2", "10": "A6", "11": "A1/A5", "12": "A3", "13": "A12/A5", "14": "A13/(A6)", "15": "(A1)", "16": "(A3)", "17": "真岡", "18": "DC検修3", "19": "DC検修3", "20": "DC検修3", "21": "DC検修3", "22": "DC検修3", "23": "DC検修3", "24": "DC検修3", "25": "DC検修3", "26": "DC検修3", "27": "DC検修3", "28": "DC検修3", "29": "DC検修3", "30": "DC検修3", "31": "DC検修3"}}, {"id": "モオカ14-6", "records": {"1": "A11/A6", "2": "A1", "3": "真岡", "4": "A4", "5": "A2/A31", "6": "A11/A6", "7": "A1/A63", "8": "A3", "9": "真岡", "10": "(A4)", "11": "A4", "12": "真岡", "13": "真岡", "14": "A4", "15": "A12/A5", "16": "A13/A22", "17": "A2", "18": "A6", "19": "A1", "20": "A3", "21": "真岡", "22": "A4", "23": "A12/A5", "24": "A3", "25": "A12/A5", "26": "A13/A22", "27": "A2/A31", "28": "A11/A6", "29": "A1", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-7", "records": {"1": "真岡", "2": "真岡", "3": "真岡", "4": "A2/A31", "5": "A11/A6", "6": "A1/A63", "7": "真岡", "8": "A4", "9": "A12/A5", "10": "A3", "11": "A12", "12": "真岡", "13": "A2/A31", "14": "A11/(A22)", "15": "A2/A31", "16": "A11/A6", "17": "A1", "18": "A4", "19": "A4", "20": "A12/A5", "21": "A13/A22", "22": "A2/A31", "23": "A11/A6", "24": "A1", "25": "真岡", "26": "A2/A31", "27": "A11/A6", "28": "A1/A5", "29": "A13/A22", "30": "A2/A31", "31": "陶器市"}}, {"id": "モオカ14-8", "records": {"1": "A3", "2": "A12/A5", "3": "A3", "4": "A12/A5", "5": "変A13", "6": "A2/A31", "7": "A11/A6", "8": "A1/A63", "9": "A3", "10": "(真岡)", "11": "真岡", "12": "A2/A31", "13": "A11/A6", "14": "A1", "15": "A3", "16": "A4", "17": "A12/A5", "18": "A3", "19": "A12/A5", "20": "A13/A22", "21": "A2/A31", "22": "A11/A6", "23": "A1", "24": "真岡", "25": "A2/A31", "26": "A11/A6", "27": "A1", "28": "A4", "29": "陶器市", "30": "陶器市", "31": "陶器市"}}, {"id": "モオカ14-9", "records": {"1": "A12/A5", "2": "変A13", "3": "A4", "4": "真岡", "5": "A3", "6": "A12/A5", "7": "A13/A22", "8": "A2/A31", "9": "A11/A6", "10": "A1", "11": "真岡", "12": "A4", "13": "A4", "14": "A12/A5", "15": "A13/A22", "16": "A2", "17": "真岡", "18": "真岡", "19": "A2/A31", "20": "A11/A6", "21": "A1", "22": "A3", "23": "真岡", "24": "A4", "25": "真岡", "26": "真岡", "27": "A4", "28": "A12/A5", "29": "A13/A22", "30": "陶器市", "31": "陶器市"}}, {"id": "C12 66", "records": {"1": "OM(全検)", "2": "OM(全検)", "3": "OM(全検)", "4": "OM(全検)", "5": "OM(全検)", "6": "OM(全検)", "7": "OM(全検)", "8": "OM(全検)", "9": "OM(全検)", "10": "OM(全検)", "11": "OM(全検)", "12": "OM(全検)", "13": "OM(全検)", "14": "OM(全検)", "15": "OM(全検)", "16": "OM(全検)", "17": "OM(全検)", "18": "OM(全検)", "19": "OM(全検)", "20": "OM(全検)", "21": "OM(全検)", "22": "OM(全検)", "23": "OM(全検)", "24": "OM(全検)", "25": "OM(全検)", "26": "OM(全検)", "27": "OM(全検)", "28": "OM(全検)", "29": "OM(全検)", "30": "OM(全検)", "31": "OM(全検)"}}, {"id": "DE10 1535", "records": {"1": "SL庫", "2": "SL庫", "3": "SL庫", "4": "SL庫", "5": "SL庫", "6": "SL庫", "7": "SL庫", "8": "SL庫", "9": "SL庫", "10": "SL庫", "11": "SL庫", "12": "SL庫", "13": "SL庫", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "展示", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡", "31": "真岡"}}, {"id": "オハ50 11", "records": {"1": "下2", "2": "下2", "3": "下2", "4": "下2", "5": "下2", "6": "下2", "7": "下2", "8": "下2", "9": "下2", "10": "下2", "11": "下2", "12": "下2", "13": "下2", "14": "下2", "15": "下2", "16": "下2", "17": "下2", "18": "下2", "19": "下2", "20": "下2", "21": "下2", "22": "下2", "23": "下2", "24": "下2", "25": "下2", "26": "下2", "27": "下2", "28": "下2", "29": "下2", "30": "下2", "31": "下2"}}, {"id": "オハ50 22", "records": {"1": "下2", "2": "下2", "3": "下2", "4": "下2", "5": "下2", "6": "下2", "7": "下2", "8": "下2", "9": "下2", "10": "下2", "11": "下2", "12": "下2", "13": "下2", "14": "下2", "15": "下2", "16": "下2", "17": "下2", "18": "下2", "19": "下2", "20": "下2", "21": "下2", "22": "下2", "23": "下2", "24": "下2", "25": "下2", "26": "下2", "27": "下2", "28": "下2", "29": "下2", "30": "下2", "31": "下2"}}, {"id": "オハフ50 33", "records": {"1": "下2", "2": "下2", "3": "下2", "4": "下2", "5": "下2", "6": "下2", "7": "下2", "8": "下2", "9": "下2", "10": "下2", "11": "下2", "12": "下2", "13": "下2", "14": "下2", "15": "下2", "16": "下2", "17": "下2", "18": "下2", "19": "下2", "20": "下2", "21": "下2", "22": "下2", "23": "下2", "24": "下2", "25": "下2", "26": "下2", "27": "下2", "28": "下2", "29": "下2", "30": "下2", "31": "下2"}}, {"id": "キハ20 247", "records": {"1": "新庫", "2": "新庫", "3": "新庫", "4": "新庫", "5": "新庫", "6": "新庫", "7": "新庫", "8": "新庫", "9": "新庫", "10": "新庫", "11": "新庫", "12": "新庫", "13": "新庫", "14": "新庫", "15": "新庫", "16": "新庫", "17": "新庫", "18": "新庫", "19": "新庫", "20": "構内試運転", "21": "新庫", "22": "新庫", "23": "新庫", "24": "新庫", "25": "構内走行", "26": "新庫", "27": "新庫", "28": "新庫", "29": "新庫", "30": "新庫", "31": "新庫"}}]};

const EMBEDDED_FALLBACK_202611 = {"year": 2026, "month": 11, "vehicles": [{"id": "モオカ14-1", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "真岡", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-2", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A3", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-3", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A11", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-4", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A4", "5": "A12/A5", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-5", "records": {"1": "新庫", "2": "新庫", "3": "新庫", "4": "新庫", "5": "新庫", "6": "新庫", "7": "新庫", "8": "新庫", "9": "新庫", "10": "新庫", "11": "新庫", "12": "新庫", "13": "新庫", "14": "新庫", "15": "新庫", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-6", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A13", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-7", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A1", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-8", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A2", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "モオカ14-9", "records": {"1": "陶器市", "2": "陶器市", "3": "陶器市", "4": "A12", "5": "", "6": "", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}, {"id": "C12 66", "records": {"1": "OM(全検)", "2": "OM(全検)", "3": "OM(全検)", "4": "OM(全検)", "5": "OM(全検)", "6": "OM(全検)", "7": "OM(全検)", "8": "OM(全検)", "9": "OM(全検)", "10": "OM(全検)", "11": "OM(全検)", "12": "OM(全検)", "13": "OM(全検)", "14": "OM(全検)", "15": "OM(全検)", "16": "OM(全検)", "17": "OM(全検)", "18": "OM(全検)", "19": "OM(全検)", "20": "OM(全検)", "21": "OM(全検)", "22": "OM(全検)", "23": "OM(全検)", "24": "OM(全検)", "25": "OM(全検)", "26": "OM(全検)", "27": "OM(全検)", "28": "OM(全検)", "29": "OM(全検)", "30": "OM(全検)"}}, {"id": "DE10 1535", "records": {"1": "SL庫", "2": "SL庫", "3": "SL庫", "4": "SL庫", "5": "SL庫", "6": "SL庫", "7": "SL庫", "8": "SL庫", "9": "SL庫", "10": "SL庫", "11": "SL庫", "12": "SL庫", "13": "SL庫", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "真岡", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡"}}, {"id": "オハ50 11", "records": {"1": "下二", "2": "下二", "3": "下二", "4": "下二", "5": "下二", "6": "下二", "7": "下二", "8": "下二", "9": "真岡", "10": "真岡", "11": "真岡", "12": "真岡", "13": "真岡", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "真岡", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡"}}, {"id": "オハ50 22", "records": {"1": "下二", "2": "下二", "3": "下二", "4": "下二", "5": "下二", "6": "下二", "7": "下二", "8": "下二", "9": "真岡", "10": "真岡", "11": "真岡", "12": "真岡", "13": "真岡", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "真岡", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡"}}, {"id": "オハフ50 33", "records": {"1": "下二", "2": "下二", "3": "下二", "4": "下二", "5": "下二", "6": "下二", "7": "下二", "8": "下二", "9": "真岡", "10": "真岡", "11": "真岡", "12": "真岡", "13": "真岡", "14": "真岡", "15": "真岡", "16": "真岡", "17": "真岡", "18": "真岡", "19": "真岡", "20": "真岡", "21": "真岡", "22": "真岡", "23": "真岡", "24": "真岡", "25": "真岡", "26": "真岡", "27": "真岡", "28": "真岡", "29": "真岡", "30": "真岡"}}, {"id": "キハ20 247", "records": {"1": "下五", "2": "下五", "3": "下五", "4": "下五", "5": "下五", "6": "下五", "7": "", "8": "", "9": "", "10": "", "11": "", "12": "", "13": "", "14": "", "15": "", "16": "", "17": "", "18": "", "19": "", "20": "", "21": "", "22": "", "23": "", "24": "", "25": "", "26": "", "27": "", "28": "", "29": "", "30": ""}}]};

// 月別運用データの取得

async function fetchOperationMonthData(year, month) {

  const sheetName = `${year}${String(month).padStart(2, "0")}`;

  if (operationMonthCache[sheetName]) {
    return operationMonthCache[sheetName];
  }

  const spreadsheetId = getSpreadsheetId();

  if (spreadsheetId) {

    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}&t=${Date.now()}`;

    try {

      const res = await fetch(csvUrl);

      if (res.ok) {

        const text = await res.text();

        if (!text.trim().startsWith("<!DOCTYPE") && !text.includes("<html")) {

          const parsed = parseSpreadsheetMonthCsv(year, month, text);

          if (parsed && parsed.vehicles.length > 0) {
            operationMonthCache[sheetName] = parsed;
            return parsed;
          }

        }

      }

    } catch (err) {
      console.warn("[TrainState] スプレッドシート運用データ取得エラー:", err);
    }

  }

  // フォールバック

  if (sheetName === "202610") return EMBEDDED_FALLBACK_202610;

  if (sheetName === "202611") return EMBEDDED_FALLBACK_202611;

  return null;

}

// 指定日における「運用番号 ↔ 充当車両」マップの構築

async function buildDailyVehicleMap(serviceDate) {

  if (!serviceDate) return;

  const parts = serviceDate.split("-");

  if (parts.length !== 3) return;

  const year = parseInt(parts[0], 10);

  const month = parseInt(parts[1], 10);

  const day = parseInt(parts[2], 10);

  const monthData = await fetchOperationMonthData(year, month);

  const dayOpVehicles = {};

  if (monthData && monthData.vehicles) {

    monthData.vehicles.forEach(v => {

      const raw = v.records ? (v.records[String(day)] || "") : "";

      if (!raw) return;

      // "A1", "A12/A5", "A11/(A6)", "変A13" 等から運用トークンを抽出

      const matches = raw.match(/A\d+/g);

      if (matches) {

        matches.forEach(token => {

          if (!dayOpVehicles[token]) dayOpVehicles[token] = [];

          if (!dayOpVehicles[token].includes(v.id)) {
            dayOpVehicles[token].push(v.id);
          }

        });

      }

      // SL運行関連（C12 66, DE10 1535, 50系客車）の特別処理

      if (raw.includes("601") || raw.includes("SL") || raw.includes("もおか")) {

        if (!dayOpVehicles["A601"]) dayOpVehicles["A601"] = [];

        if (!dayOpVehicles["A601"].includes(v.id)) {
          dayOpVehicles["A601"].push(v.id);
        }

      }

    });

  }

  DATA.operationVehicles = dayOpVehicles;

}

async function syncDailyOperations(serviceDate) {

  try {
    await buildDailyVehicleMap(serviceDate);
  } catch (err) {
    console.error("[TrainState] 日別運用同期エラー:", err);
  }

}

// 列車に対応する充当車両ID配列の取得

function getTrainAssignedVehicles(train, serviceDate) {

  if (!train || !train.operation_id) return [];

  const opStr = train.operation_id;

  const tokens = opStr.split(/[,/\s]+/).filter(Boolean);

  const result = [];

  tokens.forEach(tok => {

    // 1. 直接一致

    if (DATA.operationVehicles[tok]) {

      DATA.operationVehicles[tok].forEach(vid => {
        if (!result.includes(vid)) result.push(vid);
      });

    }

    // 2. 相互乗り入れ・前日/半日運用の互換マッチング

    // 真岡鐵道ダイヤ規約: A12は午前・A5は午後、A11は午前・A6は午後

    if (tok === "A5" && DATA.operationVehicles["A12"]) {

      DATA.operationVehicles["A12"].forEach(vid => {
        if (!result.includes(vid)) result.push(vid);
      });

    } else if (tok === "A6" && DATA.operationVehicles["A11"]) {

      DATA.operationVehicles["A11"].forEach(vid => {
        if (!result.includes(vid)) result.push(vid);
      });

    } else if (tok === "A12" && DATA.operationVehicles["A5"]) {

      DATA.operationVehicles["A5"].forEach(vid => {
        if (!result.includes(vid)) result.push(vid);
      });

    } else if (tok === "A11" && DATA.operationVehicles["A6"]) {

      DATA.operationVehicles["A6"].forEach(vid => {
        if (!result.includes(vid)) result.push(vid);
      });

    }

    // 3. SL運用の補正

    if ((tok === "A601" || tok === "A301" || train.type === "sl") && result.length === 0) {

      if (DATA.operationVehicles["A601"] && DATA.operationVehicles["A601"].length > 0) {

        DATA.operationVehicles["A601"].forEach(vid => {
          if (!result.includes(vid)) result.push(vid);
        });

      }

    }

  });

  return result;

}

function formatStationName(name) {
  if (!name) return name;
  return name === "下館二高前" ? "二高前" : name;
}
function getTrainDestination(train) {
  if (!train) return "";
  // 1. 手動上書き（手動で任意の行先を介入したい場合）を最優先
  if (train.destination_override && String(train.destination_override).trim()) {
    return String(train.destination_override).trim();
  }
  if (train.manual_dest && String(train.manual_dest).trim()) {
    return String(train.manual_dest).trim();
  }
  // 2. デフォルト自動算出: 有効な発着時刻が存在する最後の停車駅
  const list = train.actual || train.stations;
  if (list && list.length > 0) {
    const valid = list.filter(s => (s.arr != null || s.dep != null) && !s.is_cancelled);
    if (valid.length > 0) {
      const lastCode = valid[valid.length - 1].code;
      const st = DATA.stations.find(s => s.code === lastCode);
      if (st) return st.name;
    }
  }
  // 3. フォールバック
  return train.destination || "";
}


var ARRIVED_HOLD_MINUTES = 3; // 終着駅到着後の保持時間

var DEPARTURE_HOLD_MINUTES = 15; // 始発駅発車前の保持時間

function timeStringToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**

 * 日本の祝日（振替休日・国民の休日含む）判定

 */

function isJapaneseHoliday(dateStr) {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);

  const getHolidaysForYear = (year) => {

    const list = new Set();

    const add = (mon, day) => {

      if (day != null) list.add(`${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

    };

    // 固定祝日

    add(1, 1);   // 元日

    add(2, 11);  // 建国記念の日

    if (year >= 2020) add(2, 23); // 天皇誕生日

    add(4, 29);  // 昭和の日

    add(5, 3);   // 憲法記念日

    add(5, 4);   // みどりの日

    add(5, 5);   // こどもの日

    if (year >= 2016) add(8, 11); // 山の日

    add(11, 3);  // 文化の日

    add(11, 23); // 勤労感謝の日

    // ハッピーマンデー（第N月曜日）

    const getNthMonday = (mon, n) => {

      let count = 0;

      for (let day = 1; day <= 31; day++) {

        const dt = new Date(year, mon - 1, day);

        if (dt.getMonth() !== mon - 1) break;

        if (dt.getDay() === 1) {
          count++;
          if (count === n) return day;
        }

      }

      return null;

    };

    add(1, getNthMonday(1, 2));   // 成人の日 (1月第2月曜)

    add(7, getNthMonday(7, 3));   // 海の日 (7月第3月曜)

    add(9, getNthMonday(9, 3));   // 敬老の日 (9月第3月曜)

    add(10, getNthMonday(10, 2)); // スポーツの日 (10月第2月曜)

    // 春分の日・秋分の日 (2000〜2099年近似式)

    const vernalDay = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

    add(3, vernalDay);

    const autumnDay = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

    add(9, autumnDay);

    // 国民の休日（祝日に挟まれた平日）

    for (let mon = 1; mon <= 12; mon++) {

      for (let day = 2; day <= 30; day++) {

        const prev = `${year}-${String(mon).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;

        const curr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const next = `${year}-${String(mon).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;

        if (list.has(prev) && list.has(next) && !list.has(curr)) {

          const dt = new Date(year, mon - 1, day);

          if (dt.getDay() !== 0) {
            list.add(curr);
          }

        }

      }

    }

    // 振替休日（祝日が日曜日の場合、翌日以降の直近の平日）

    const rawHolidays = Array.from(list).sort();

    rawHolidays.forEach(hStr => {

      const [hy, hm, hd] = hStr.split('-').map(Number);

      const hDate = new Date(hy, hm - 1, hd);

      if (hDate.getDay() === 0) {

        let check = new Date(hDate);

        while (true) {

          check.setDate(check.getDate() + 1);

          const cStr = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;

          if (!list.has(cStr)) {
            list.add(cStr);
            break;
          }

        }

      }

    });

    return list;

  };

  return getHolidaysForYear(y).has(dateStr);

}

// Evaluate a single date rule (e.g. '2026-08-15', '2026-08-10~2026-08-15', 'mon', 'holiday', 'train:103', 'op:A1')

function evaluateDateRule(rule, serviceDate, isHoliday, evaluatedTrains = new Set()) {

  if (!rule || typeof rule !== 'string') return false;

  rule = rule.trim();

  if (!rule) return false;

  if (isHoliday === undefined) {
    isHoliday = isJapaneseHoliday(serviceDate);
  }

  // 1. Period / Range (e.g. '2026-08-10~2026-08-15' or '2026-08-10..2026-08-15')

  if (rule.includes('~') || rule.includes('..')) {

    const parts = rule.includes('~') ? rule.split('~') : rule.split('..');

    if (parts.length === 2) {

      const start = parts[0].trim();

      const end = parts[1].trim();

      if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return serviceDate >= start && serviceDate <= end;
      }

    }

  }

  // 2. Specific Single Date (e.g. '2026-08-15')

  if (/^\d{4}-\d{2}-\d{2}$/.test(rule)) {
    return rule === serviceDate;
  }

  const lower = rule.toLowerCase();

  // 3. Holiday token ('holiday', '祝', '祝日')

  if (lower === 'holiday' || lower === '祝' || lower === '祝日') {
    return !!isHoliday;
  }

  // 4. Day of Week ('sun', 'mon', ..., 'sat' or '日', '月'...)

  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  const dayJa = ['日', '月', '火', '水', '木', '金', '土'];

  const d = new Date(serviceDate + 'T00:00:00+09:00');

  const dayIdx = d.getDay();

  if (dayKeys.includes(lower)) {
    return dayKeys[dayIdx] === lower;
  }

  if (dayJa.includes(rule)) {
    return dayJa[dayIdx] === rule;
  }

  // 5. Link to another Train ('train:103', 'train:6001')

  if (lower.startsWith('train:')) {

    const targetId = rule.substring(6).trim();

    const evalKey = 'train:' + targetId.toLowerCase();

    if (!targetId || evaluatedTrains.has(evalKey)) return false;

    evaluatedTrains.add(evalKey);

    const targetTrain = DATA.timetable.find(t => 

      (t.train_id && String(t.train_id).toLowerCase() === targetId.toLowerCase()) || 

      (t.train_no && String(t.train_no).toLowerCase() === targetId.toLowerCase())

    );

    if (targetTrain) {
      return isTrainOperatingOnDate(targetTrain, serviceDate, isHoliday, evaluatedTrains);
    }

    return false;

  }

  // 6. Link to an Operation ID ('op:A1', 'op:A601')

  if (lower.startsWith('op:')) {

    const targetOp = rule.substring(3).trim();

    const evalKey = 'op:' + targetOp.toLowerCase();

    if (!targetOp || evaluatedTrains.has(evalKey)) return false;

    evaluatedTrains.add(evalKey);

    const opTrains = DATA.timetable.filter(t => {
      const ops = getTrainOperations(t, serviceDate);
      return ops.some(o => o.toLowerCase() === targetOp.toLowerCase());
    });

    if (opTrains.length > 0) {
      return opTrains.some(t => isTrainOperatingOnDate(t, serviceDate, isHoliday, evaluatedTrains));
    }

    return false;

  }

  return false;

}

/**

 * 1. 運行日判定ロジック

 */

function isTrainOperatingOnDate(train, serviceDate, isHoliday, evaluatedTrains = new Set()) {

  if (!train) return false;

  if (!evaluatedTrains.has(train.train_id)) {
    evaluatedTrains.add(train.train_id);
  }

  if (isHoliday === undefined) {
    isHoliday = isJapaneseHoliday(serviceDate);
  }

  const rule = train.operation_rule || {};

  const datesOff = rule.dates_off || [];

  const datesRun = rule.dates_run || [];

  const daysOff = rule.days_off || [];

  // 1. 特定運休日・期間チェック (dates_off) -> 最優先で運休

  if (datesOff.some(r => evaluateDateRule(r, serviceDate, isHoliday, evaluatedTrains))) {
    return false;
  }

  // 2. 部分運休 (partial_cancellations) -> 該当日は区間運転として運行

  if (train.partial_cancellations && train.partial_cancellations.some(p => p.date && evaluateDateRule(p.date, serviceDate, isHoliday, evaluatedTrains))) {
    return true;
  }

  // 3. 特定運転日・期間チェック (dates_run) -> 運転

  if (datesRun.some(r => evaluateDateRule(r, serviceDate, isHoliday, evaluatedTrains))) {
    return true;
  }

  // 4. 臨時列車 (extra) -> dates_run に指定がなければ運休

  if (rule.service_type === 'extra') {
    return false;
  }

  const d = new Date(serviceDate + 'T00:00:00+09:00');

  const dayIdx = d.getDay();

  // 5. SL列車 (sl)

  if (rule.service_type === 'sl') {

    if (isHoliday) {
      if (daysOff.includes('holiday')) return false;
      return true;
    }

    if (daysOff.includes(dayIdx)) {
      return false;
    }

    return true;

  }

  // 6. 一般・回送列車 (regular / deadhead)

  if (isHoliday && daysOff.includes('holiday')) {
    return false;
  }

  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIdx];

  if (daysOff.includes(dayIdx) || daysOff.includes(dayKey)) {
    return false;
  }

  return true;

}

/**

 * 各駅の実効時刻・遅延・区間運休フラグを計算

 */

function calculateActualTimetable(train, override) {

  const baseDelay = override?.delay_minutes || 0;

  const stationDelays = override?.station_delays || {};

  let actualStart = train.stations[0].code;

  let actualEnd = train.stations[train.stations.length - 1].code;

  if (override?.actual_start && override?.actual_end) {

    const startIdx = train.stations.findIndex(s => s.code === override.actual_start);

    const endIdx = train.stations.findIndex(s => s.code === override.actual_end);

    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      actualStart = override.actual_start;
      actualEnd = override.actual_end;
    } else {

      console.warn(`[Data Anomaly] Invalid or reversed actual_start/end for ${train.train_id}. Falling back to full route.`);

    }

  }

  let isWithinActiveSegment = false;

  return train.stations.map((st) => {

    if (st.code === actualStart) isWithinActiveSegment = true;

    const isCancelled = !isWithinActiveSegment;

    const currentDelay = stationDelays[st.code] !== undefined ? stationDelays[st.code] : baseDelay;

    const arrScheduledMin = timeStringToMinutes(st.arr);

    const depScheduledMin = timeStringToMinutes(st.dep);

    const arrMinutes = arrScheduledMin !== null ? arrScheduledMin + currentDelay : null;

    const depMinutes = depScheduledMin !== null ? depScheduledMin + currentDelay : null;

    const result = {
      code: st.code,
      arr_scheduled: st.arr,
      dep_scheduled: st.dep,
      arr_actual: arrMinutes,
      dep_actual: depMinutes,
      delay_minutes: currentDelay,
      is_cancelled: isCancelled
    };

    if (st.code === actualEnd) isWithinActiveSegment = false;

    return result;

  });

}

function evaluateTrainState(actualStations, currentMinutes) {

  // 鬩募ｶ・ｽE・ｽ隨ｬ谺陞ｳ螢ｹ・ｽE・ｽE・ｽ・ｽ蠕娯ｻ邵ｺ繝ｻ竊醍ｸｺ繝ｻ諤剰怏・ｽE・ｽ鬯ｧ繝ｻ縺晉ｹｧ・ｽE・ｽ郢晢ｽ｡郢晢ｽｳ郢晏現・ｽE・ｽ隰夲ｽｽ陷・・ｽ・ｽ

  const activeStations = actualStations.filter(s => !s.is_cancelled);

  if (activeStations.length < 2) return { state: 'OUT_OF_SERVICE' };

  const firstStation = activeStations[0];

  const lastStation = activeStations[activeStations.length - 1];

  // 1. 陝狗距蛹ｱ騾具ｽｺ髴・・ｽ・ｽ辯慕ｹ晢ｿｽE縺臥ｹ晢ｿｽE縺・

  if (currentMinutes < firstStation.dep_actual) {

    if (currentMinutes >= firstStation.dep_actual - DEPARTURE_HOLD_MINUTES) {

      return {
        state: 'PRE_DEPARTURE',
        station_code: firstStation.code
      };

    }

    return { state: 'OUT_OF_SERVICE' };

  }

  // 2. 驍ｨ繧画昆鬯ｧ繝ｻ闃ｦ騾ｹﾂ陟募ｾ鯉ｿｽE闖ｫ譎・・ｽ・ｽ (5陋ｻ繝ｻ菫｣) 邵ｺ鄙ｫ・ｽE・ｽ邵ｺ・ｽE・ｽ陜ｨ荳橸ｽ､螟懶ｿｽE驕假ｽｻ

  if (currentMinutes >= lastStation.arr_actual) {

    if (currentMinutes < lastStation.arr_actual + ARRIVED_HOLD_MINUTES) {

      return {
        state: 'ARRIVED',
        station_code: lastStation.code
      };

    }

    return { state: 'OUT_OF_SERVICE' };

  }

  // 3. 陷ｷ繝ｻ・ｽE・ｽ繝ｻ縲堤ｸｺ・ｽE・ｽ陋帶㊥・ｽE・ｽ鄙ｫ繝｡郢ｧ・ｽE・ｽ郢晢ｿｽE縺・

  for (let i = 0; i < activeStations.length; i++) {

    const st = activeStations[i];

    if (st.arr_actual !== null && st.dep_actual !== null) {

      // 騾具ｽｺ騾ｹﾂ隴弱ｇ邯ｾ邵ｺ謔滂ｿｽE闕ｳﾂ繝ｻ蝓滓ｲｻ隴弱ｋ・ｽE・ｽ繝ｻ縲堤ｸｺ・ｽE・ｽ邵ｺ繝ｻﾂ螟絶с/闕ｳﾂ霑ｸ・ｽE・ｽ陋帶㊥・ｽE・ｽ螂・・ｽ・ｽ蟲ｨ繝ｻ1陋ｻ繝ｻ菫｣陝・・ｽ・ｽ陟｢繝ｻ

      if (st.arr_actual === st.dep_actual && currentMinutes === st.arr_actual) {

        return {
          state: 'STOPPED',
          station_code: st.code,
          is_instant_stop: true
        };

      }

      if (st.arr_actual <= currentMinutes && currentMinutes < st.dep_actual) {

        return {
          state: 'STOPPED',
          station_code: st.code,
          is_instant_stop: false
        };

      }

    }

  }

  // 4. 鬯ｧ繝ｻ菫｣隘搾ｽｰ髯ｦ蠕後Γ郢ｧ・ｽE・ｽ郢晢ｿｽE縺托ｿｽE逎ｯ竕ｦ陝抵ｽｶ陜玲ｧｫ・ｽE・ｽ・ｽE・ｽ隴弱ｅ繝ｻ郢ｧ・ｽE・ｽ郢晢ｽｭ鬮ｯ・ｽE・ｽ驍ょ干縺守ｹ晢ｽｼ郢晢ｿｽE・ｽE・ｽ蛛・・ｽ・ｽ繝ｻ

  for (let i = 0; i < activeStations.length - 1; i++) {

    const fromSt = activeStations[i];

    const toSt = activeStations[i + 1];

    if (fromSt.dep_actual !== null && toSt.arr_actual !== null) {

      if (fromSt.dep_actual <= currentMinutes && currentMinutes < toSt.arr_actual) {

        // 隰・・ｽ髫補扱蜃ｾ鬮｢阮吮ｲ郢ｧ・ｽE・ｽ郢晢ｽｭ邵ｺ・ｽE・ｽ邵ｺ貅假ｿｽE髮具ｿｽ邵ｺ・ｽE・ｽ邵ｺ・ｽE・ｽ郢ｧ蜿･螻楢包ｽｩ鬩慕事・ｽE・ｽ・ｽE・ｽ闕ｳ閧ｴ邏幄惺蛹ｻ竏育ｸｺ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｼ郢昜ｼ夲ｽｼ蝓滓呵氣荵怜恍髫補扱蜃ｾ鬮｢阮呻ｽ・陋ｻ繝ｻ竊楢摎・ｽE・ｽ陞ｳ螟ｲ・ｽE・ｽ繝ｻ

        const totalTime = Math.max(1, toSt.arr_actual - fromSt.dep_actual);

        const elapsedTime = currentMinutes - fromSt.dep_actual;

        const progress = Math.min(1.0, Math.max(0.0, elapsedTime / totalTime));

        return {
          state: 'RUNNING',
          from_station: fromSt.code,
          to_station: toSt.code,
          progress: progress
        };

      }

    }

  }

  return { state: 'OUT_OF_SERVICE' };

}

function computeAllTrainStates(timetable, todayStatus, currentMinutes, isHoliday = false) {

  const serviceDate = todayStatus.service_date;

  const overrides = todayStatus.train_overrides || {};

  return timetable.map(train => {

    const isOperating = isTrainOperatingOnDate(train, serviceDate, isHoliday);

    if (!isOperating) {

      return {

        train_id: train.train_id,

        train_no: train.train_no,

        direction: train.direction,

        is_operating: false,

        state_info: { state: 'OUT_OF_SERVICE' }

      };

    }

    const override = overrides[train.train_id] || null;

    const actualStations = calculateActualTimetable(train, override);

    const stateInfo = evaluateTrainState(actualStations, currentMinutes);

    return {
      train_id: train.train_id,
      train_no: train.train_no,
      direction: train.direction,
      operation_id: train.operation_id,
      destination: train.destination,
      is_operating: true,
      actual_stations: actualStations,
      state_info: stateInfo
    };

  });

}

function formatYMD(date) {

  const y = date.getFullYear();

  const m = String(date.getMonth() + 1).padStart(2, "0");

  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;

}

function normalizeToServiceContext(d) {

  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));

  let h = Number(p.hour);

  let base = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));

  let mins = h * 60 + Number(p.minute);

  if (h < 4) {
    base.setDate(base.getDate() - 1);
    mins += 1440;
  }

  return { service_date: formatYMD(base), service_minutes: mins };

}

function formatServiceTime(m) {

  if (m == null) return "—";

  let h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");

  return `${String(h).padStart(2, "0")}:${mm}`;

}

function serviceDateLabel(s) {

  const d = new Date(`${s}T12:00:00+09:00`);

  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;

}

function serviceRuns(train, date) {
  return isTrainOperatingOnDate(train, date, isJapaneseHoliday(date));
}

function getTrainType(train) {
  if (train.train_no && train.train_no.startsWith("回")) return "empty";
  if (train.train_no && train.train_no.startsWith("6")) return "sl";
  if (train.operation_rule?.service_type === "sl") return "sl";
  if (train.operation_rule?.service_type === "extra") return "extra";
  if (train.operation_rule?.service_type === "deadhead") return "empty";
  return "local";
}

function getTrainTypeStyle(type) {

  switch (type) {

    case "sl":

      return { stroke: "var(--train-sl)", width: 2.8, dash: "", label: "SLもおか", shortLabel: "SL" };

    case "extra":

      return { stroke: "var(--train-extra)", width: 2.1, dash: "", label: "臨時", shortLabel: "臨時" };

    case "empty":

      return { stroke: "var(--train-empty)", width: 1.4, dash: "4,3", label: "回送", shortLabel: "回送" };

    default:

      return { stroke: "var(--train-local)", width: 1.9, dash: "", label: "普通", shortLabel: "普通" };

  }

}

function validateStatus(s) {
  return !!s && typeof s.service_date === "string" && s.official_info && s.operations && s.train_overrides;
}

function getTrainOperations(train, dateStr) {

  if (!train) return [];

  let opStr = train.operation_id || "";

  if (train.operation_dict) {

    const day = new Date(`${dateStr}T12:00:00+09:00`).getDay();

    const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];

    if (train.operation_dict[key] !== undefined) {
      opStr = train.operation_dict[key];
    }

  }

  return opStr.toString().split(',').map(s => s.trim()).filter(s => s);

}

function hasMatchingOperation(trainA, trainB, dateStr) {
  const opsA = getTrainOperations(trainA, dateStr);
  const opsB = getTrainOperations(trainB, dateStr);
  if (opsA.length === 0 || opsB.length === 0) return false;
  return opsA.some(op => opsB.includes(op));
}

function stationPos(code) { return DATA.stations.findIndex(s => s.code === code) }

function positionForState(train, actual, result) {

  if (result.state === "OUT_OF_SERVICE") return null;

  if (result.state === "STOPPED" || result.state === "ARRIVED" || result.state === "PRE_DEPARTURE") {

    const idx = actual.findIndex(s => s.code === result.station_code);

    return { station: idx, progress: 0 };

  }

  if (result.state === "RUNNING") {

    const from = stationPos(result.from_station), to = stationPos(result.to_station);

    return { station: from, progress: result.progress * (to - from) };

  }

  return null;

}

function getPrevDate(dateStr) {

  const d = new Date(`${dateStr}T12:00:00+09:00`);

  d.setDate(d.getDate() - 1);

  return formatYMD(d);

}

function buildTrainEntry(train, currentMins) {

  let effectiveTrain = train;

  const isHoliday = isJapaneseHoliday(state.serviceDate);

  // Check schedule_variants for date-specific timetable / destination overrides

  if (train.schedule_variants && train.schedule_variants.length > 0) {

    const matchingVariant = train.schedule_variants.find(v => {
      return v.dates && v.dates.some(r => evaluateDateRule(r, state.serviceDate, isHoliday));
    });

    if (matchingVariant) {

      effectiveTrain = {
        ...train,
        stations: matchingVariant.stations || train.stations,
        destination: matchingVariant.destination || train.destination,
        train_no: matchingVariant.train_no || train.train_no,
        variant_label: matchingVariant.label || "特別ダイヤ"
      };

    }

  }

  let ov = (DATA.status && DATA.status.train_overrides && DATA.status.train_overrides[effectiveTrain.train_id]) || {};

  // Inject static partial_cancellations if applicable for today (supports date range and single date)

  if (effectiveTrain.partial_cancellations) {

    const pc = effectiveTrain.partial_cancellations.find(p => p.date && evaluateDateRule(p.date, state.serviceDate, isHoliday));

    if (pc) {

      ov = { ...ov };

      if (!ov.actual_start) ov.actual_start = pc.actual_start;

      if (!ov.actual_end) ov.actual_end = pc.actual_end;

    }

  }

  const actual = calculateActualTimetable(effectiveTrain, ov);

  const result = evaluateTrainState(actual, currentMins ?? 720);

  const destination = getTrainDestination({ ...effectiveTrain, actual });
  return { ...effectiveTrain, destination, override: ov, actual, result, position: positionForState(effectiveTrain, actual, result) };

}

function effectiveTrains() {

  const cur = state.currentMinutes ?? 720;

  const isHoliday = isJapaneseHoliday(state.serviceDate);

  const today = DATA.timetable

    .filter(t => isTrainOperatingOnDate(t, state.serviceDate, isHoliday))

    .map(t => buildTrainEntry(t, cur));

  let crossover = [];

  if (cur < 300 && DATA.prevTimetable.length) {
    const prevDate = getPrevDate(state.serviceDate);
    const prevHoliday = isJapaneseHoliday(prevDate);
    const extendedMins = cur + 1440;
    crossover = DATA.prevTimetable
      .filter(t => isTrainOperatingOnDate(t, prevDate, prevHoliday))
      .filter(t => t.stations.some(s => (s.arr && timeStringToMinutes(s.arr) >= 1440) || (s.dep && timeStringToMinutes(s.dep) >= 1440)))
      .map(t => buildTrainEntry(t, extendedMins));
  }

  const allTrains = [...crossover, ...today];

  return allTrains.sort((a, b) => {
    const aTime = a.actual[0]?.dep_actual ?? 9999;
    const bTime = b.actual[0]?.dep_actual ?? 9999;
    return aTime - bTime;
  });

}

function renderNotice() {

  const box = $("#notice");

  const icon = $("#notice-icon");

  const title = $("#notice-title");

  const updated = $("#notice-updated");

  const link = $("#notice-link");

  const banner = $("#irregular-banner");

  const warningModal = $("#warning-modal");

  if (!DATA.status) {
    box.className = "notice-bar status-loading";
    if (icon) icon.textContent = "…";
    title.textContent = "公式運行情報を取得しています…";
    updated.textContent = "取得中…";
    link.classList.add("hidden");
    return;
  }

  const n = DATA.status.official_info || {};

  const statusCode = n.status_code || "unknown";

  box.className =

    "notice-bar " +

    (

      statusCode === "delay" || statusCode === "suspend"

        ? "status-delay"

        : statusCode === "unknown"

          ? "status-unknown"

          : "status-normal"

    );

  if (icon) {
    icon.textContent =
      statusCode === "delay" || statusCode === "suspend"
        ? "!"
        : statusCode === "unknown"
          ? "?"
          : "✓";
  }

  if (statusCode === "delay" || statusCode === "suspend") {

    if (banner) banner.classList.remove("hidden");

    if (warningModal && !warningModal.dataset.shown) {
      warningModal.classList.remove("hidden");
      warningModal.dataset.shown = "true";
    }

  } else {
    if (banner) banner.classList.add("hidden");
  }

  const btn = $("#warning-confirm-btn");

  if (btn && warningModal) {

    btn.onclick = () => { warningModal.classList.add("hidden"); };

  }

  let fallbackText = n.text || "公式運行情報を取得できませんでした";

  if (fallbackText.startsWith("公式: ")) fallbackText = fallbackText.substring(4).trim();

  else if (fallbackText.startsWith("公式：")) fallbackText = fallbackText.substring(3).trim();

  if (n.link_url) {

    title.innerHTML = `<a href="${n.link_url}" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">${fallbackText}</a>`;

  } else {
    title.textContent = fallbackText;
  }

  box.title =

    `更新: ${n.fetched_at

      ? new Date(n.fetched_at).toLocaleString(

        "ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }

      )

      : "不明"

    }\n${fallbackText}`;

  if (n.link_url) {
    link.href = n.link_url;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }

  updated.textContent =

    `取得: ${n.fetched_at

      ? new Date(n.fetched_at).toLocaleString(

        "ja-JP",

        {
          timeZone: "Asia/Tokyo",
          hour12: false
        }

      )

      : "-"

    }`;

}

function shieldSVG(type, direction) {

  const st = getTrainTypeStyle(type);

  const transform = direction === "up" ? `transform="rotate(180 12 13.5)"` : "";

  return `<svg viewBox="0 0 24 27" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">

    <g ${transform}>

      <path d="M12 1.5 L22.5 10.5 L22.5 23.5 Q22.5 25.5 20.5 25.5 L3.5 25.5 Q1.5 25.5 1.5 23.5 L1.5 10.5 Z"

            fill="${st.stroke}"/>

      <path d="M7.5 16.5 L12 11.5 L16.5 16.5"

            fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>

    </g>

  </svg>`;

}

function renderStations() {

  const host = $("#position-body");

  if (!host) return;

  host.innerHTML = "";

  host.style.position = "relative";

  host.style.display = "flex";

  host.style.flexDirection = "column";

  const stationsReversed = [...DATA.stations].reverse();

  stationsReversed.forEach((s, i) => {

    const isTerminal = i === 0 || i === stationsReversed.length - 1;

    const stRow = document.createElement("div");

    stRow.className = "pos-station-row" + ((s.can_exchange || isTerminal) ? " can-exchange" : "");

    stRow.dataset.station = s.code;

    stRow.innerHTML = `

      <div class="pos-station-name-col clickable-station" title="${s.name}駅の時刻表・駅情報を見る">${formatStationName(s.name)}</div>

      <div class="pos-trains-container pos-trains-down" id="pos-down-${s.code}"></div>

      <div class="pos-rail-area ${i === 0 ? 'rail-first' : ''} ${i === stationsReversed.length - 1 ? 'rail-last' : ''}"><div class="pos-station-dot"></div></div>

      <div class="pos-trains-container pos-trains-up" id="pos-up-${s.code}"></div>

    `;

    const nameCol = stRow.querySelector(".pos-station-name-col");

    if (nameCol) {

      nameCol.addEventListener("click", () => {
        selectStation(s.code);
        setView("station");
      });

    }

    host.appendChild(stRow);

    if (i < stationsReversed.length - 1) {

      const nextS = stationsReversed[i + 1];

      const bwRow = document.createElement("div");

      bwRow.className = "pos-between-row";

      bwRow.dataset.from = s.code;

      bwRow.dataset.to = nextS.code;

      bwRow.innerHTML = `

        <div class="pos-station-name-col"></div>

        <div class="pos-trains-container pos-trains-down" id="pos-bw-down-${s.code}-${nextS.code}"></div>

        <div class="pos-rail-area"></div>

        <div class="pos-trains-container pos-trains-up" id="pos-bw-up-${s.code}-${nextS.code}"></div>

      `;

      host.appendChild(bwRow);

    }

  });

}

/**

 * 荳贋ｸ句・霆翫・莠､謠帙′陦後ｏ繧後※縺・ｋ鬧・さ繝ｼ繝峨・ Set 繧定ｿ斐☆

 * 縲悟・縺ｫ蛻ｰ逹縺吶ｋ蛻苓ｻ翫′蛻ｰ逹縺励◆縺ｨ縺阪阪°繧峨悟・縺ｫ逋ｺ霆翫☆繧句・霆翫′蜃ｺ逋ｺ縺励◆縺ｨ縺阪阪∪縺ｧ

 */

function computeExchangingStations(trains, currentMinutes) {

  const exchanging = new Set();

  const stationCodes = DATA.stations.map(s => s.code);

  // Get all stop windows (arr_actual to dep_actual) for trains at a given station code

  const getStopWindows = (trainList, stCode) => {

    const windows = [];

    trainList.forEach(t => {

      if (!t.actual) return;

      const st = t.actual.find(s => s.code === stCode && !s.is_cancelled);

      if (!st) return;

      // Allow fallback if it's an origin or terminal station

      const arr = st.arr_actual != null ? st.arr_actual : st.dep_actual;

      const dep = st.dep_actual != null ? st.dep_actual : st.arr_actual;

      if (arr == null || dep == null) return;

      windows.push({ arr, dep });

    });

    return windows;

  };

  stationCodes.forEach(code => {

    const upWindows  = getStopWindows(trains.filter(t => t.direction === 'up'),   code);

    const downWindows = getStopWindows(trains.filter(t => t.direction === 'down'), code);

    for (const uw of upWindows) {

      for (const dw of downWindows) {

        // Check if the two stop windows actually overlap

        const overlapStart = Math.max(uw.arr, dw.arr);

        const overlapEnd   = Math.min(uw.dep, dw.dep);

        const hasOverlap   = overlapEnd >= overlapStart;

        if (!hasOverlap) continue;

        // Per spec: animate from first-arriving train's arrival to first-departing train's departure

        const exchangeStart = Math.min(uw.arr, dw.arr);

        const exchangeEnd   = Math.min(uw.dep, dw.dep);

        if (currentMinutes >= exchangeStart && currentMinutes < exchangeEnd) {
          exchanging.add(code);
        }

      }

    }

  });

  return exchanging;

}

function renderPosition() {

  renderStations(); // Re-build DOM layout first

  const host = $("#position-body");

  const trains = effectiveTrains();

  const cur = state.currentMinutes ?? 720;

  const stationsReversed = [...DATA.stations].reverse();

  const trainsWithPos = trains.filter(t => t.position);

  // 蜷御ｸ驕狗畑逡ｪ蜿ｷ繧呈戟縺､蛻苓ｻ雁酔螢ｫ縺ｮ謗剃ｻ門宛蠕｡・亥ｧ狗匱菫晄戟繝ｻ邨ら捩菫晄戟縺ｮ驥崎､・ｄ譛ｬ邱夊ｵｰ陦後→縺ｮ遏帷崟繧呈賜髯､・・

  const filteredTrains = trainsWithPos.filter(t => {

    const isHoldState = t.result.state === "PRE_DEPARTURE" || t.result.state === "ARRIVED";

    for (const t2 of trainsWithPos) {

      if (t2.train_id === t.train_id) continue;

      if (!hasMatchingOperation(t, t2, state.serviceDate)) continue;

      // 1. 蜷御ｸ驕狗畑縺ｮ蛻･蛻苓ｻ翫′譛ｬ邱壹ｒ襍ｰ陦御ｸｭ(RUNNING)縺ｾ縺溘・鬧・↓蛛懆ｻ贋ｸｭ(STOPPED)縺ｮ蝣ｴ蜷医∽ｿ晄戟迥ｶ諷・蟋狗匱菫晄戟/邨ら捩菫晄戟)縺ｮ蛻苓ｻ閣縺ｯ髱櫁｡ｨ遉ｺ

      if (isHoldState && (t2.result.state === "RUNNING" || t2.result.state === "STOPPED")) {
        return false;
      }

      // 2. 蛻苓ｻ閣縺檎ｵら捩菫晄戟(ARRIVED)縺ｧ縲∝酔荳驕狗畑縺ｮ謚倥ｊ霑斐＠蛻苓ｻ閣2縺悟ｧ狗匱菫晄戟(PRE_DEPARTURE)縺ｮ蝣ｴ蜷医∫ｵら捩菫晄戟t縺ｯ髱櫁｡ｨ遉ｺ縺ｫ縺励※蟋狗匱菫晄戟t2繧定｡ｨ遉ｺ

      if (t.result.state === "ARRIVED" && t2.result.state === "PRE_DEPARTURE") {
        return false;
      }

      // 3. 荳｡譁ｹ縺ｨ繧ょｧ狗匱菫晄戟(PRE_DEPARTURE)縺ｮ蝣ｴ蜷医∫匱霆頑凾蛻ｻ縺碁≦縺・婿縺ｮ蛻苓ｻ翫ｒ髱櫁｡ｨ遉ｺ

      if (t.result.state === "PRE_DEPARTURE" && t2.result.state === "PRE_DEPARTURE") {
        const tDep = t.actual[0]?.dep_actual ?? 9999;
        const t2Dep = t2.actual[0]?.dep_actual ?? 9999;
        if (tDep > t2Dep) return false;
      }

      // 4. 荳｡譁ｹ縺ｨ繧らｵら捩菫晄戟(ARRIVED)縺ｮ蝣ｴ蜷医∝芦逹譎ょ綾縺悟商縺・婿縺ｮ蛻苓ｻ翫ｒ髱櫁｡ｨ遉ｺ

      if (t.result.state === "ARRIVED" && t2.result.state === "ARRIVED") {
        const tArr = t.actual[t.actual.length - 1]?.arr_actual ?? 0;
        const t2Arr = t2.actual[t2.actual.length - 1]?.arr_actual ?? 0;
        if (tArr < t2Arr) return false;
      }

    }

    return true;

  });

  filteredTrains.forEach(t => {

    const card = createTrainCard(t);

    if (t.result.state === "STOPPED" || t.result.state === "ARRIVED" || t.result.state === "PRE_DEPARTURE") {

      const code = t.result.station_code;

      const container = document.getElementById(`pos-${t.direction}-${code}`);

      if (container) container.appendChild(card);

    } else if (t.result.state === "RUNNING") {

      // Find the correct between row based on stationsReversed order

      let fromIdx = stationsReversed.findIndex(s => s.code === t.result.from_station);

      let toIdx = stationsReversed.findIndex(s => s.code === t.result.to_station);

      if (fromIdx !== -1 && toIdx !== -1) {

        // The between row ID is based on the top station to bottom station

        const topCode = stationsReversed[Math.min(fromIdx, toIdx)].code;

        const bottomCode = stationsReversed[Math.max(fromIdx, toIdx)].code;

        const container = document.getElementById(`pos-bw-${t.direction}-${topCode}-${bottomCode}`);

        if (container) container.appendChild(card);

      }

    }

  });

  // Mark exchanging stations

  const exchangingCodes = computeExchangingStations(trains, cur);

  document.querySelectorAll('.pos-station-row').forEach(row => {
    const code = row.dataset.station;
    row.classList.toggle('is-exchanging', exchangingCodes.has(code));
  });

  $("#summary-grid").innerHTML = "";

  $("#position-current-time").textContent = formatServiceTime(state.currentMinutes);

}

function createTrainCard(t) {

  const type = getTrainType(t);

  const card = document.createElement("div");

  card.className = `pos-train-card type-${type} dir-${t.direction}`;

  const isStopped = t.result.state === "STOPPED" || t.result.state === "ARRIVED" || t.result.state === "PRE_DEPARTURE";

  const shield = document.createElement("div");

  shield.className = "pos-train-shield";

  shield.innerHTML = shieldSVG(type, t.direction);

  const info = document.createElement("div");

  info.className = "pos-train-info";

  let infoHTML = `<span class="pos-train-no">${t.train_no}</span>`;

  if (isStopped) {

    const badgeText = t.result.state === "PRE_DEPARTURE" ? "始発" : (t.result.state === "ARRIVED" ? "終着" : "停車中");

    const badgeMod = t.result.state === "PRE_DEPARTURE" ? " badge-origin" : (t.result.state === "ARRIVED" ? " badge-arrived" : "");

    infoHTML += `<span class="pos-stopped-badge${badgeMod}">${badgeText}</span>`;

  }

  const maxDelay = Math.max(0, ...t.actual.filter(s => !s.is_cancelled).map(s => s.delay_minutes || 0));

  if (maxDelay > 0) {

    infoHTML += `<span class="pos-delay-badge">+${maxDelay}分</span>`;

  }

  infoHTML += `<span class="pos-train-dest">${getTrainDestination(t)}行</span>`;

  // 充当車両バッジの付与

  const assignedVehs = getTrainAssignedVehicles(t, state.serviceDate);

  if (assignedVehs && assignedVehs.length > 0) {

    const vehLabel = assignedVehs.join(" ");

    infoHTML += `<span class="pos-veh-badge" title="充当車両: ${vehLabel}">${vehLabel}</span>`;

  } else if (t.operation_id) {

    infoHTML += `<span class="pos-veh-badge pos-veh-badge--op" title="運用番号: ${t.operation_id}">${t.operation_id}</span>`;

  }

  info.innerHTML = infoHTML;

  if (t.direction === "down") {
    card.appendChild(info);
    card.appendChild(shield);
  } else {
    card.appendChild(shield);
    card.appendChild(info);
  }

  card.onclick = () => openTrainModal(t);

  card.title = `${t.train_no} ${getTrainDestination(t)}行`;

  return card;

}

function svgEl(name, attrs = {}) { const e = document.createElementNS("http://www.w3.org/2000/svg", name); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e }

function renderDiagram() {

  const svg = $("#diagram-svg"); svg.innerHTML = "";

  const axisSvg = $("#diagram-axis"); if (axisSvg) axisSvg.innerHTML = "";

  const trains = effectiveTrains().filter(t => state.diagramDir === "all" || t.direction === state.diagramDir);

  const maxDist = DATA.stations[DATA.stations.length - 1].distance_km;

  const axisWidth = 78;

  const width = 4400, left = axisSvg ? 16 : 82, topPad = 38, bottomPad = 40;

  const container = $("#diagram-scroll");

  const availableHeight = window.innerHeight - container.getBoundingClientRect().top - 56;

  const height = Math.max(availableHeight, 560);

  const chartHeight = height - topPad - bottomPad;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  svg.setAttribute("width", width);

  svg.setAttribute("height", height);

  if (axisSvg) {

    axisSvg.setAttribute("viewBox", `0 0 ${axisWidth} ${height}`);

    axisSvg.setAttribute("width", axisWidth);

    axisSvg.setAttribute("height", height);

    const axisHead = svgEl("text", { x: 10, y: 20, fill: "var(--svg-grid-text)", "font-size": "11", "font-weight": "600" });

    axisHead.textContent = "駅名";

    axisSvg.appendChild(axisHead);

  }

  const maxM = 1740, minM = 300;

  const timeX = m => left + (m - minM) * 3;

  const yOf = code => {
    const st = DATA.stations.find(s => s.code === code);
    if (!st) return topPad;
    const ratio = (maxDist - st.distance_km) / maxDist;
    return topPad + ratio * chartHeight;
  };

  for (let m = 300; m <= 1740; m += 60) {

    const x = timeX(m);

    const isMajor = m % 360 === 300;

    svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: height, stroke: isMajor ? "var(--svg-grid-line-major)" : "var(--svg-grid-line)", "stroke-width": isMajor ? 1 : 0.7 }));

    const txt = svgEl("text", { x: x + 3, y: 20, fill: "var(--svg-grid-text)", "font-size": "11" });

    txt.textContent = formatServiceTime(m); svg.appendChild(txt);

  }

  const stationsReversed = [...DATA.stations].reverse();

  stationsReversed.forEach((s, i) => {

    const isTerminal = i === 0 || i === stationsReversed.length - 1;

    const isExchange = s.can_exchange || isTerminal;

    const y = yOf(s.code);

    svg.appendChild(svgEl("line", { x1: 0, y1: y, x2: width, y2: y, stroke: isExchange ? "var(--svg-station-line)" : "var(--svg-station-line-alt)", "stroke-width": isExchange ? 1 : 0.7 }));

    if (axisSvg) {

      axisSvg.appendChild(svgEl("line", { x1: 0, y1: y, x2: axisWidth, y2: y, stroke: isExchange ? "var(--svg-station-line)" : "var(--svg-station-line-alt)", "stroke-width": isExchange ? 1 : 0.5, opacity: "0.55" }));

      const label = svgEl("text", { x: 10, y: y + 4, fill: isExchange ? "var(--svg-station-text)" : "var(--svg-station-text-alt)", "font-size": "11", "font-weight": isExchange ? 700 : 400 });

      label.textContent = formatStationName(s.name);

      axisSvg.appendChild(label);

    } else {

      const label = svgEl("text", { x: 8, y: y + 4, fill: isExchange ? "var(--svg-station-text)" : "var(--svg-station-text-alt)", "font-size": "11", "font-weight": isExchange ? 600 : 400 });

      label.textContent = formatStationName(s.name); svg.appendChild(label);

    }

  });

  trains.forEach(t => {

    const pts = [];

    t.stations.forEach(st => {
      const arrM = timeStringToMinutes(st.arr);
      const depM = timeStringToMinutes(st.dep);
      if (arrM != null) pts.push([timeX(arrM), yOf(st.code)]);
      if (depM != null && depM !== arrM) pts.push([timeX(depM), yOf(st.code)]);
    });

    if (pts.length < 2) return;

    const type = getTrainType(t);

    const tStyle = getTrainTypeStyle(type);

    const hasOverride = t.actual.some(s => s.delay_minutes || s.is_cancelled);

    if (hasOverride) {

      const path = svgEl("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: tStyle.stroke, "stroke-width": 1.2, opacity: 0.35, "stroke-dasharray": "3,3", "data-train-id": t.train_id });

      path.style.cursor = "pointer"; path.addEventListener("click", () => openTrainModal(t)); svg.appendChild(path);

    }

    const actPts = [];

    t.actual.filter(s => !s.is_cancelled).forEach(s => {
      if (s.arr_actual != null) actPts.push([timeX(s.arr_actual), yOf(s.code)]);
      if (s.dep_actual != null && s.dep_actual !== s.arr_actual) actPts.push([timeX(s.dep_actual), yOf(s.code)]);
    });

    if (actPts.length > 1) {

      const polyAttrs = {

        points: actPts.map(p => `${p[0]},${p[1]}`).join(" "),

        fill: "none",

        stroke: tStyle.stroke,

        "stroke-width": tStyle.width,

        "data-train-id": t.train_id,

        "stroke-linecap": "round",

        "stroke-linejoin": "round"

      };

      if (tStyle.dash) polyAttrs["stroke-dasharray"] = tStyle.dash;

      const ap = svgEl("polyline", polyAttrs);

      ap.style.cursor = "pointer"; ap.addEventListener("click", () => openTrainModal(t)); svg.appendChild(ap);

    }

    const targetPoints = [];

    if (pts.length > 1) {

      targetPoints.push({ x: pts[0][0], y: pts[0][1], nextX: pts[1][0], nextY: pts[1][1] });

      const mokaCode = DATA.stations.find(s => s.name === "真岡")?.code;

      if (mokaCode && t.stations[0].code !== mokaCode) {

        const mokaY = yOf(mokaCode);

        const mokaPtIdx = pts.findLastIndex(p => Math.abs(p[1] - mokaY) < 1);

        if (mokaPtIdx !== -1 && mokaPtIdx < pts.length - 1) {

          targetPoints.push({
            x: pts[mokaPtIdx][0], y: pts[mokaPtIdx][1],
            nextX: pts[mokaPtIdx + 1][0], nextY: pts[mokaPtIdx + 1][1]
          });

        }

      }

    }

    targetPoints.forEach(tp => {

      const dx = tp.nextX - tp.x;

      const dy = tp.nextY - tp.y;

      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      const lab = svgEl("text", {

        fill: tStyle.stroke,

        stroke: "#ffffff",

        "stroke-width": "3",

        "paint-order": "stroke",

        "font-size": "9.5",

        "font-weight": "700",

        "data-train-id": t.train_id,

        transform: `translate(${tp.x}, ${tp.y}) rotate(${angle})`,

        dx: "8",

        dy: t.direction === "up" ? "12" : "-4"

      });

      lab.textContent = t.train_no;

      svg.appendChild(lab);

    });

  });

  if (state.currentMinutes != null && state.currentMinutes >= minM && state.currentMinutes <= maxM) {

    const nx = timeX(state.currentMinutes);

    svg.appendChild(svgEl("line", { x1: nx, y1: topPad, x2: nx, y2: topPad + chartHeight, stroke: "var(--svg-now-line)", "stroke-width": 1.5, "stroke-dasharray": "6,3", opacity: .7 }));

    const nowLabel = svgEl("text", { x: nx + 3, y: topPad - 4, fill: "var(--svg-now-line)", "font-size": "9", "font-weight": "700" });

    nowLabel.textContent = "現在";

    svg.appendChild(nowLabel);

  }

  const scroll = $("#diagram-scroll");

  if (!scroll.dataset.didAutoScroll && state.currentMinutes != null) {
    const nx = timeX(state.currentMinutes);
    scroll.scrollLeft = Math.max(0, nx - scroll.clientWidth / 2);
    scroll.dataset.didAutoScroll = "true";
  }

}

function renderTimetable() {

  const trains = effectiveTrains().filter(t => t.direction === state.timetableDir);

  const th = $("#timetable-table thead"), tb = $("#timetable-table tbody");

  th.innerHTML = ""; tb.innerHTML = "";

  let orderedStations;

  if (state.timetableDir === "up") {
    orderedStations = [...DATA.stations].reverse();
  } else {
    orderedStations = [...DATA.stations];
  }

  const typeRow = document.createElement("tr");

  typeRow.className = "tt-header-row tt-type";

  typeRow.innerHTML = `<th>種別</th>` + trains.map(t => {

    const type = getTrainType(t);

    const st = getTrainTypeStyle(type);

    return `<th class="tt-type-${type}">${st.shortLabel}</th>`;

  }).join("");

  th.appendChild(typeRow);

  const trainNoRow = document.createElement("tr");

  trainNoRow.className = "tt-header-row tt-trainno";

  trainNoRow.innerHTML = `<th>列車番号</th>` + trains.map(t => {

    const type = getTrainType(t);

    const mod = (type === "sl" || type === "extra") ? ` class="tt-type-${type}"` : "";

    return `<th${mod}>${t.train_no}</th>`;

  }).join("");

  th.appendChild(trainNoRow);

  const destRow = document.createElement("tr");

  destRow.className = "tt-header-row tt-dest";

  destRow.innerHTML = `<th>行先</th>` + trains.map(t => `<th>${formatStationName(getTrainDestination(t))}</th>`).join("");

  th.appendChild(destRow);

  const vehRow = document.createElement("tr");

  vehRow.className = "tt-header-row tt-vehicle";

  vehRow.innerHTML = `<th>充当車両</th>` + trains.map(t => {

    const v = getTrainAssignedVehicles(t, state.serviceDate);

    const label = v.length ? v.join("<br>") : (t.operation_id ? `<span class="tt-op-badge">${t.operation_id}</span>` : "—");

    return `<th class="tt-veh-cell">${label}</th>`;

  }).join("");

  th.appendChild(vehRow);

  orderedStations.forEach((s, idx) => {

    const tr = document.createElement("tr");

    if (s.can_exchange || idx === 0 || idx === orderedStations.length - 1) {
      tr.className = "tt-exchange-row";
    }

    const stCell = document.createElement("td");

    let isStart = false;

    let isEnd = false;

    if (state.timetableDir === "up") {
      isStart = (s.code === "M17");
      isEnd = (s.code === "M01");
    } else {
      isStart = (s.code === "M01");
      isEnd = (s.code === "M17");
    }

    let labelsHTML = `<span>着</span><span>発</span>`;

    if (isStart) labelsHTML = `<span>発</span>`;

    if (isEnd) labelsHTML = `<span>着</span>`;

    stCell.innerHTML = `<div class="tt-st-cell"><strong>${formatStationName(s.name)}</strong><div class="tt-st-labels">${labelsHTML}</div></div>`;

    tr.appendChild(stCell);

    trains.forEach(t => {

      const st = t.stations.find(x => x.code === s.code);

      const actual = t.actual.find(x => x.code === s.code);

      const td = document.createElement("td");

      if (!st) {
        td.innerHTML = ``;
      } else if (actual?.is_cancelled) {
        td.innerHTML = `<span class="tt-cancel">運休</span>`;
      } else {

        let a = st.arr;

        let d = st.dep;

        if (isStart) a = null;

        if (isEnd) d = null;

        if (a === "pass" || d === "pass" || a === "レ" || d === "レ") {
          td.innerHTML = `<span class="tt-pass">レ</span>`;
        } else if (a === null && d === null) {
          td.innerHTML = ``;
        } else if (isStart) {

          td.innerHTML = `<div class="tt-times"><span class="tt-dep">${d || ""}</span></div>`;

        } else if (isEnd) {

          td.innerHTML = `<div class="tt-times"><span class="tt-dep">${a || ""}</span></div>`;

        } else if (a !== null && d === null) {

          if (s.code === "M07") {

            td.innerHTML = `<div class="tt-times"><span class="tt-dep">${a}</span><span class="tt-dep">＝</span></div>`;

          } else {

            td.innerHTML = `<div class="tt-times"><span class="tt-arr">${a}</span><span class="tt-dep" style="visibility:hidden;">—</span></div>`;

          }

        } else if (a === null && d !== null) {

          td.innerHTML = `<div class="tt-times"><span class="tt-arr" style="visibility:hidden;">—</span><span class="tt-dep">${d}</span></div>`;

        } else {

          td.innerHTML = `<div class="tt-times"><span class="tt-arr">${a}</span><span class="tt-dep">${d}</span></div>`;

        }

      }

      td.style.cursor = "pointer";

      td.addEventListener("click", () => openTrainModal(t));

      tr.appendChild(td);

    });

    tb.appendChild(tr);

  });

}

function openTrainModal(t) {

  const type = getTrainType(t);

  const tStyle = getTrainTypeStyle(type);

  const typeBadgeColor = type === "sl" ? "orange" : (type === "extra" ? "red" : (type === "local" ? "blue" : ""));

  let statusText = "";

  let statusBadgeColor = "";

  if (t.actual.some(s => s.is_cancelled)) {
    statusText = "区間運休";
    statusBadgeColor = "red";
  } else {

    statusText = {
      RUNNING: "駅間走行中",
      STOPPED: "駅停車中",
      ARRIVED: "終着駅着",
      PRE_DEPARTURE: "始発駅停車中",
      OUT_OF_SERVICE: "運転時間外"
    }[t.result.state] || "不明";

    if (t.result.state === "RUNNING" || t.result.state === "STOPPED") {
      statusBadgeColor = "green";
    } else if (t.result.state === "PRE_DEPARTURE") {
      statusBadgeColor = "blue";
    }

  }

  let formation = [];

  const opIds = getTrainOperations(t, state.serviceDate);

  opIds.forEach(id => {

    if (DATA.status && DATA.status.operations && DATA.status.operations[id] && DATA.status.operations[id].formation) {
      formation = formation.concat(DATA.status.operations[id].formation);
    }

  });

  const assignedVehicles = getTrainAssignedVehicles(t, state.serviceDate);

  const effectiveCars = formation.length ? formation : assignedVehicles;

  const displayOpId = opIds.join('＋') || (t.operation_id || "—");

  $("#modal-body").innerHTML = `

    <span class="modal-kicker">列車詳細 (${t.train_id})</span>

    <h3 class="modal-title">${t.train_no}</h3>

    <div class="modal-badges">

      <span class="badge ${typeBadgeColor}">${tStyle.label}</span>

      <span class="badge">${t.direction === "up" ? "上り" : "下り"}</span>

      <span class="badge">${formatStationName(getTrainDestination(t))}行</span>

      <span class="badge ${statusBadgeColor}">${statusText}</span>

      ${t.variant_label ? `<span class="badge orange">${t.variant_label}</span>` : ""}

    </div>

    <div class="detail-grid">

      <div class="detail-cell"><small>運用番号</small><strong>${displayOpId}</strong></div>

      <div class="detail-cell"><small>充当車両</small><strong>${assignedVehicles.length ? assignedVehicles.join(" + ") : "未定"}</strong></div>

    </div>

    ${effectiveCars.length ? `

      <div class="formation">

        <h4>充当車両・編成</h4>

        <div class="formation-list">

          ${effectiveCars.map(c => `

            <span class="formation-car">

              <img src="${getVehicleIconSrc(c)}" alt="${c}" class="formation-icon" onerror="this.style.display='none'">

              <strong>${c}</strong>

            </span>

          `).join("")}

        </div>

      </div>

    ` : ""}

    ${t.override.memo ? `<div class="memo">${t.override.memo}</div>` : ""}

    <div class="station-detail"><h4>各駅の発着時刻</h4>${t.stations.map(st => {

    let a = st.arr;

    let d = st.dep;

    if (t.direction === "down" && st.code === "M01") a = null;

    if (t.direction === "up" && st.code === "M17") a = null;

    if (t.direction === "down" && st.code === "M17") d = "＝";

    if (t.direction === "up" && st.code === "M01") d = "＝";

    if (st.arr !== null && st.dep === null && st.code === "M07") d = "＝";

    const arrStr = a === "pass" || a === "レ" ? "レ" : (a || "");

    const depStr = d === "pass" || d === "レ" ? "レ" : (d || "");

    const isCancel = t.actual.find(x => x.code === st.code)?.is_cancelled;

    return `<div class="stop-row ${isCancel ? "cancel" : ""}"><span>${formatStationName(DATA.stations.find(x => x.code === st.code)?.name || st.code)}</span><span>${arrStr}</span><span>${depStr}</span></div>`;

  }).join("")}</div>`;

  $("#train-modal").classList.remove("hidden");

}

function updateClock() {

  if (!state.liveClock) return;

  const ctx = normalizeToServiceContext(new Date());

  if (ctx.service_date !== state.serviceDate) {
    DATA.prevTimetable = [...DATA.timetable]; // 蜑肴律繝繧､繝､繧呈律縺ｾ縺溘℃蛻苓ｻ顔畑縺ｫ菫晏ｭ・
    state.serviceDate = ctx.service_date;
    state.currentMinutes = ctx.service_minutes;
    $("#date-input").value = state.serviceDate;
    loadData();
    return;
  }

  const minutesChanged = state.currentMinutes !== ctx.service_minutes;

  state.currentMinutes = ctx.service_minutes;

  $("#clock").textContent = new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

  $("#service-date-label").textContent = serviceDateLabel(state.serviceDate);

  $("#date-title").textContent = serviceDateLabel(state.serviceDate);

  if (minutesChanged) {

    const h = Math.floor(state.currentMinutes / 60) % 24;

    const m = state.currentMinutes % 60;

    const timeInputEl = $("#time-input");

    if (timeInputEl) timeInputEl.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    renderPosition();

    if (state.view === "diagram") renderDiagram();

    if (state.view === "station") {
      const st = DATA.stations.find(s => s.code === state.selectedStationCode) || DATA.stations[0];
      if (st) {
        renderNextTrainsCard(st);
        renderStationTimetableContent(st);
      }
    }

  }

}

async function loadData() {

  try {

    const statusApiUrl = (typeof CONFIG !== 'undefined' && CONFIG.STATUS_API_URL) ? CONFIG.STATUS_API_URL : "";

    const fetchStatusPromise = statusApiUrl 

      ? fetch(statusApiUrl).then(r => r.json()).catch(e => { console.error("GAS Status fetch failed", e); return null; })

      : Promise.resolve(null);

    const [s, t, st, live] = await Promise.all([

      fetch("data/stations.json").then(r => r.json()),

      fetch("data/timetable.json").then(r => r.json()),

      fetch("data/today_status.json").then(r => r.json()),

      fetchStatusPromise

    ]);

    if (!Array.isArray(s) || !Array.isArray(t) || !validateStatus(st))

      throw new Error("schema");

    DATA.stations = s;

    DATA.timetable = t;
    DATA.timetable.forEach(tr => {
      tr.destination = getTrainDestination(tr);
    });

    DATA.status = st;

    if (live && live.official_info) {
      DATA.status.official_info = live.official_info;
      if (live.service_date) DATA.status.service_date = live.service_date;
      if (live.updated_at) DATA.status.updated_at = live.updated_at;
    }

    DATA.status = st;

  } catch (e) {

    console.error(e);

    $("#offline-banner").classList.remove("hidden");

    // Try loading local data at minimum

    try {

      if (!DATA.stations.length) {
        const s = await fetch("data/stations.json").then(r => r.json());
        if (Array.isArray(s)) DATA.stations = s;
      }

      if (!DATA.timetable.length) {
        const t = await fetch("data/timetable.json").then(r => r.json());
        if (Array.isArray(t)) {
          DATA.timetable = t;
          DATA.timetable.forEach(tr => {
            tr.destination = getTrainDestination(tr);
          });
        }
      }

    } catch (e2) { console.error(e2); }

    if (!DATA.stations.length) DATA.stations = STATIONS_FALLBACK;

    DATA.status = {

      service_date: state.serviceDate,

      official_info: {
        status_code: "unknown",
        text: "公式運行情報を取得できませんでした",
        link_url: "",
        has_detail: false,
        fetched_at: null
      },

      operations: {},

      train_overrides: {}

    };

  }

  // Initialize current time automatically

  const ctx = normalizeToServiceContext(new Date());

  state.serviceDate = ctx.service_date;

  state.currentMinutes = ctx.service_minutes;

  state.liveClock = true;

  $("#date-input").value = state.serviceDate;

  const h = Math.floor(state.currentMinutes / 60) % 24;

  const m = state.currentMinutes % 60;

  const timeInputEl = $("#time-input");

  if (timeInputEl) timeInputEl.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // URLクエリパラメータの反映 (?view=station&station=M07&date=YYYY-MM-DD&time=HH:MM)

  try {

    const params = new URLSearchParams(window.location.search);

    const paramDate = params.get('date') || params.get('d');

    const paramTime = params.get('time') || params.get('t');

    const paramView = params.get('view') || params.get('tab');

    const paramStation = params.get('station') || params.get('code') || params.get('st');

    if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
      state.serviceDate = paramDate;
      state.liveClock = false;
      $("#date-input").value = state.serviceDate;
    }

    if (paramTime && /^\d{1,2}:\d{2}$/.test(paramTime)) {

      state.liveClock = false;

      const [h, m] = paramTime.split(':').map(Number);

      state.currentMinutes = h * 60 + m;

      if ($("#time-input")) $("#time-input").value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    }

    if (paramStation) {
      const matchSt = DATA.stations.find(s => s.code.toUpperCase() === paramStation.toUpperCase() || s.name === paramStation);
      if (matchSt) state.selectedStationCode = matchSt.code;
    }

    if (paramView && ["position", "diagram", "timetable", "station"].includes(paramView)) {
      state.view = paramView;
    }

  } catch (err) {
    console.warn("URL params parsing error:", err);
  }

  await syncDailyOperations(state.serviceDate);

  renderNotice();

  renderAll();

  setView(state.view);

}

function renderAll() {
  if ($("#service-date-label")) $("#service-date-label").textContent = serviceDateLabel(state.serviceDate);
  if ($("#date-title")) $("#date-title").textContent = serviceDateLabel(state.serviceDate);
  renderPosition();
  renderDiagram();
  renderTimetable();
  renderStationView();
}

$$(".view-tab").forEach(b => b.addEventListener("click", () => {
  setView(b.dataset.view);
}));

function setView(v) {
  state.view = v;
  $$(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".view-panel").forEach(p => p.classList.toggle("active", p.id === "view-" + v));
  if (v === "position") renderPosition();
  if (v === "diagram") renderDiagram();
  if (v === "timetable") renderTimetable();
  if (v === "station") renderStationView();
}

var _resizeTimer;

var _resizeObs = new ResizeObserver(() => {

  clearTimeout(_resizeTimer);

  _resizeTimer = setTimeout(() => {
    if (state.view === "position") renderPosition();
    else if (state.view === "diagram") renderDiagram();
  }, 150);

});

_resizeObs.observe(document.body);

$("#date-input").addEventListener("change", async e => {
  state.serviceDate = e.target.value;
  state.liveClock = false;
  const timeInput = $("#time-input") ? $("#time-input").value : "12:00";
  const [h, m] = (timeInput || "12:00").split(":").map(Number);
  state.currentMinutes = h * 60 + m;
  await syncDailyOperations(state.serviceDate);
  renderNotice();
  renderAll();
});

const timeInputEl2 = $("#time-input");

if (timeInputEl2) {

  timeInputEl2.addEventListener("change", e => {
    state.liveClock = false;
    const timeInput = e.target.value || "12:00";
    const [h, m] = timeInput.split(":").map(Number);
    state.currentMinutes = h * 60 + m;
    renderNotice();
    renderAll();
  });

}

$("#now-btn").addEventListener("click", async () => {

  state.liveClock = true;

  const c = normalizeToServiceContext(new Date());

  state.serviceDate = c.service_date;

  state.currentMinutes = c.service_minutes;

  $("#date-input").value = state.serviceDate;

  const h = Math.floor(state.currentMinutes / 60) % 24;

  const m = state.currentMinutes % 60;

  if ($("#time-input")) $("#time-input").value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  $("#diagram-scroll").dataset.didAutoScroll = "";

  await syncDailyOperations(state.serviceDate);

  renderAll();

});

// 各駅時刻表の方向フィルターイベント設定

$$(".st-dir-filter button").forEach(b => {

  b.addEventListener("click", () => {
    $$(".st-dir-filter button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    state.stationDirFilter = b.dataset.stdir;
    const station = DATA.stations.find(s => s.code === state.selectedStationCode) || DATA.stations[0];
    if (station) renderStationTimetableContent(station);
  });

});

// ==========================================

// 4. 各駅時刻表・駅情報ビュー実装

// ==========================================

function selectStation(code) {
  state.selectedStationCode = code;
  renderStationView();
}

function renderNextTrainsCard(station) {
  const container = $("#station-next-trains-card");
  if (!container || !station) return;

  const nowM = state.currentMinutes != null
    ? state.currentMinutes
    : (new Date().getHours() * 60 + new Date().getMinutes());

  const allTrains = effectiveTrains();

  // 補助関数: 当該駅からの発車列車を抽出・ソート
  function getUpcomingDepartures(direction) {
    const list = [];
    allTrains.forEach(t => {
      if (t.direction !== direction) return;
      const stEntry = t.stations.find(s => s.code === station.code);
      if (!stEntry) return;
      if (stEntry.arr === "pass" || stEntry.dep === "pass" || stEntry.arr === "レ" || stEntry.dep === "レ") return;

      const actual = t.actual ? t.actual.find(s => s.code === station.code) : null;
      if (actual?.is_cancelled) return;

      // 終着駅判定 (当駅止まりは乗車不可のため除外)
      const validStations = (t.actual || t.stations).filter(s => (s.arr != null || s.dep != null) && !s.is_cancelled);
      const lastValidSt = validStations.length > 0 ? validStations[validStations.length - 1] : null;
      if (lastValidSt && lastValidSt.code === station.code) return;

      const depTimeStr = stEntry.dep || stEntry.arr;
      if (!depTimeStr || depTimeStr === "＝") return;

      const depMins = timeStringToMinutes(depTimeStr);
      if (depMins == null) return;

      // 発車後1分までは「まもなく発車 / 停車中」として表示、それ以降は次へ
      if (depMins >= nowM - 1) {
        list.push({
          train: t,
          depTimeStr,
          depMins,
          arrTimeStr: stEntry.arr,
          diff: depMins - nowM
        });
      }
    });

    list.sort((a, b) => a.depMins - b.depMins);
    return list;
  }

  const downDepartures = station.code !== "M17" ? getUpcomingDepartures("down") : [];
  const upDepartures = station.code !== "M01" ? getUpcomingDepartures("up") : [];

  // カウントダウンバッジのフォーマット
  function formatCountdown(dep) {
    const diff = dep.diff;
    if (diff < 0) {
      return `<span class="cd-chip cd-departing">発車</span>`;
    } else if (diff <= 1) {
      return `<span class="cd-chip cd-imminent">まもなく発車</span>`;
    } else if (diff <= 3) {
      return `<span class="cd-chip cd-urgent">あと${diff}分</span>`;
    } else if (diff < 60) {
      return `<span class="cd-chip cd-normal">あと${diff}分</span>`;
    } else {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return `<span class="cd-chip cd-normal">あと${h}時間${m > 0 ? m + '分' : ''}</span>`;
    }
  }

  function renderDirectionColumn(dirKey, dirLabel, iconArrow, departures) {
    const isDown = dirKey === 'down';
    const dirClass = isDown ? 'dir-down' : 'dir-up';
    const next = departures.length > 0 ? departures[0] : null;
    const following = departures.length > 1 ? departures[1] : null;

    let contentHtml = '';
    if (!next) {
      contentHtml = `
        <div class="next-train-empty">
          <span class="empty-icon">✓</span>
          <span class="empty-text">本日の運行は終了しました</span>
        </div>
      `;
    } else {
      const t = next.train;
      const type = getTrainType(t);
      const tStyle = getTrainTypeStyle(type);
      const destName = formatStationName(getTrainDestination(t));
      const vehs = getTrainAssignedVehicles(t, state.serviceDate);
      const vehHtml = vehs.length > 0
        ? `<span class="next-veh-pill"><img src="${getVehicleIconSrc(vehs[0])}" class="mini-veh-icon" alt=""> ${vehs.join(' ')}</span>`
        : (t.operation_id ? `<span class="next-veh-pill op-pill">${t.operation_id}運用</span>` : '');

      const folHtml = following ? `
        <div class="following-train-row">
          <span class="fol-tag">次々発</span>
          <strong class="fol-time">${following.depTimeStr}発</strong>
          <span class="fol-dest">${formatStationName(getTrainDestination(following.train))}行</span>
          <span class="fol-train-no">${following.train.train_no}</span>
          <span class="fol-diff">(${following.diff < 60 ? `あと${following.diff}分` : `あと${Math.floor(following.diff/60)}時間${following.diff%60}分`})</span>
        </div>
      ` : '';

      contentHtml = `
        <div class="next-train-primary">
          <div class="next-time-box">
            <span class="next-dep-time">${next.depTimeStr}</span>
            <span class="next-dep-unit">発</span>
          </div>
          <div class="next-dest-box">
            <div class="next-dest-row">
              <span class="badge ${tStyle.badgeClass}">${tStyle.label}</span>
              <strong class="next-dest-name">${destName}行</strong>
            </div>
            <div class="next-meta-row">
              <span class="next-train-no">${t.train_no}</span>
              ${vehHtml}
            </div>
          </div>
          <div class="next-countdown-box">
            ${formatCountdown(next)}
          </div>
        </div>
        ${folHtml}
      `;
    }

    return `
      <div class="next-col ${dirClass}">
        <div class="next-col-header">
          <span class="next-col-arrow">${iconArrow}</span>
          <span class="next-col-title">${dirLabel}</span>
        </div>
        <div class="next-col-body">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  const isDownOnly = station.code === "M01";
  const isUpOnly = station.code === "M17";

  let colsHtml = '';
  if (isDownOnly) {
    colsHtml = renderDirectionColumn('down', '下り 茂木方面', '↓', downDepartures);
  } else if (isUpOnly) {
    colsHtml = renderDirectionColumn('up', '上り 下館方面', '↑', upDepartures);
  } else {
    colsHtml = `
      ${renderDirectionColumn('down', '下り 茂木方面', '↓', downDepartures)}
      ${renderDirectionColumn('up', '上り 下館方面', '↑', upDepartures)}
    `;
  }

  container.innerHTML = `
    <div class="next-trains-card-inner ${isDownOnly || isUpOnly ? 'single-col' : 'two-cols'}">
      <div class="next-trains-title-bar">
        <span class="next-trains-title">次の発車列車</span>
        <span class="next-trains-clock-sync">リアルタイム</span>
      </div>
      <div class="next-trains-grid">
        ${colsHtml}
      </div>
    </div>
  `;
}

function renderStationView() {

  const station = DATA.stations.find(s => s.code === state.selectedStationCode) || DATA.stations[0];

  if (!station) return;

  // 1. 駅セレクターバーの描画

  const bar = $("#station-selector-bar");

  if (bar) {

    bar.innerHTML = DATA.stations.map(s => {

      const isActive = s.code === station.code;

      return `<button type="button" class="st-sel-btn ${isActive ? 'active' : ''}" data-code="${s.code}">

        <span class="st-sel-code">${s.code}</span>

        <span class="st-sel-name">${formatStationName(s.name)}</span>

      </button>`;

    }).join("");

    bar.querySelectorAll(".st-sel-btn").forEach(btn => {

      btn.addEventListener("click", () => {

        selectStation(btn.dataset.code);

        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

      });

    });

    const activeBtn = bar.querySelector(".st-sel-btn.active");

    if (activeBtn) {

      activeBtn.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });

    }

  }

  // 前の駅・次の駅ボタン

  const currentIndex = DATA.stations.findIndex(s => s.code === station.code);

  const prevBtn = $("#st-prev-btn");

  const nextBtn = $("#st-next-btn");

  if (prevBtn) {

    prevBtn.disabled = currentIndex <= 0;

    prevBtn.onclick = () => {
      if (currentIndex > 0) selectStation(DATA.stations[currentIndex - 1].code);
    };

  }

  if (nextBtn) {

    nextBtn.disabled = currentIndex >= DATA.stations.length - 1;

    nextBtn.onclick = () => {
      if (currentIndex < DATA.stations.length - 1) selectStation(DATA.stations[currentIndex + 1].code);
    };

  }

  // 1.5 次の列車カウントダウンカードの描画
  renderNextTrainsCard(station);

  // 2. 駅情報カードの描画

  const infoCard = $("#station-info-card");

  if (infoCard) {

    const connHtml = (station.connections && station.connections.length)

      ? station.connections.map(c => `<span class="st-tag st-tag-conn">${c}</span>`).join(" ")

      : '<span class="st-meta-val muted">接続路線・バスなし</span>';

    // 開業日フォーマット (YYYY-MM-DD -> YYYY年M月D日)

    let openingText = '—';

    if (station.opening_date) {

      const parts = station.opening_date.split('-');

      if (parts.length === 3) {

        openingText = `${parseInt(parts[0], 10)}年${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;

      } else {
        openingText = station.opening_date;
      }

    }

    const isManned = station.station_type && station.station_type.includes('有人');

    const typeClass = isManned ? 'type-manned' : 'type-unmanned';

    const ticketTag = station.has_ticket_window

      ? '<span class="st-tag st-tag-yes">出札窓口あり</span>'

      : '<span class="st-tag st-tag-no">窓口なし</span>';

    const vendingTag = station.has_vending_machine

      ? '<span class="st-tag st-tag-yes">自動券売機あり</span>'

      : '<span class="st-tag st-tag-no">券売機なし</span>';

    const slBadge = station.sl_stop

      ? '<span class="st-sl-badge sl-stops">SLもおか停車駅</span>'

      : '<span class="st-sl-badge sl-passes">SL通過</span>';

    infoCard.innerHTML = `

      <div class="st-info-header">

        <div class="st-title-group">

          <span class="st-code-pill">${station.code}</span>

          <div class="st-names">

            <div class="st-main-name-row">

              <h3 class="st-main-name">${station.name}</h3>

              ${station.telegram_code ? `<span class="st-telegram-pill" title="電報略号">${station.telegram_code}</span>` : ''}

            </div>

            <span class="st-sub-name">${station.kana || ''} / ${station.romaji || ''}</span>

          </div>

        </div>

        <div class="st-header-badges">

          <span class="st-type-pill ${typeClass}">${station.station_type || '無人駅'}</span>

          <span class="st-exchange-badge ${station.can_exchange ? 'exchange-yes' : 'exchange-no'}">

            ${station.can_exchange ? '列車交換可能' : '棒線駅'}

          </span>

          ${slBadge}

        </div>

      </div>

      <div class="st-meta-grid">

        <div class="st-meta-item">

          <span class="st-meta-lbl">起点（下館）距離</span>

          <span class="st-meta-val"><strong>${station.distance_km.toFixed(1)}</strong> km</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">開業年月日</span>

          <span class="st-meta-val">${openingText}</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">ホーム・線路配線</span>

          <span class="st-meta-val">${station.platform_layout || '—'}</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">所在地</span>

          <span class="st-meta-val">${station.address || '—'}</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">出札窓口・券売機</span>

          <div class="st-meta-val st-tags-wrap">${ticketTag} ${vendingTag}</div>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">トイレ設備</span>

          <span class="st-meta-val">${station.restroom || 'なし'}</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">駐車場・駐輪場</span>

          <span class="st-meta-val">${station.parking || '—'}</span>

        </div>

        <div class="st-meta-item">

          <span class="st-meta-lbl">接続交通・のりかえ</span>

          <div class="st-meta-val st-tags-wrap">${connHtml}</div>

        </div>

      </div>

      ${station.features ? `

        <div class="st-desc-box st-features-box">

          <span class="st-box-label">駅の特徴・構造</span>

          <span class="st-box-text">${station.features}</span>

        </div>

      ` : ''}

      ${station.highlights ? `

        <div class="st-desc-box st-highlights-box">

          <span class="st-box-label">周辺案内・見どころ・撮影スポット</span>

          <span class="st-box-text">${station.highlights}</span>

        </div>

      ` : ''}

    `;

  }

  // 3. 発車時刻表の見出し更新

  const ttTitle = $("#st-tt-title");

  if (ttTitle) ttTitle.textContent = `${station.name}駅 発車時刻表`;

  const ttDate = $("#st-tt-date");

  if (ttDate) ttDate.textContent = `${state.serviceDate} 所定ダイヤ`;

  renderStationTimetableContent(station);

}

function renderStationTimetableContent(station) {

  const container = $("#station-timetable-content");

  if (!container) return;

  const allTrains = effectiveTrains();

  const dirFilter = state.stationDirFilter || "all";

  const departures = [];

  allTrains.forEach(t => {

    if (dirFilter !== "all" && t.direction !== dirFilter) return;

    const stEntry = t.stations.find(s => s.code === station.code);

    if (!stEntry) return;

    if (stEntry.arr === "pass" || stEntry.dep === "pass" || stEntry.arr === "レ" || stEntry.dep === "レ") {
      return;
    }

    const actual = t.actual ? t.actual.find(s => s.code === station.code) : null;

    const isCancelled = actual?.is_cancelled || false;

    const validStations = (t.actual || t.stations).filter(s => (s.arr != null || s.dep != null) && !s.is_cancelled);
    const lastValidSt = validStations.length > 0 ? validStations[validStations.length - 1] : null;
    const isTerminatingHere = (lastValidSt && lastValidSt.code === station.code);

    let displayTime = null;
    if (isTerminatingHere) {
      displayTime = stEntry.arr || stEntry.dep;
    } else {
      displayTime = stEntry.dep || stEntry.arr;
    }

    if (!displayTime || displayTime === "＝") return;

    const timeMins = timeStringToMinutes(displayTime) ?? 9999;

    const assignedVehicles = getTrainAssignedVehicles(t, state.serviceDate);

    let statusText = "所定";

    let statusClass = "status-normal";

    if (isCancelled) {
      statusText = "運休";
      statusClass = "status-cancel";
    } else if (t.result) {

      const cur = state.currentMinutes;

      const depMins = timeStringToMinutes(stEntry.dep || stEntry.arr);

      if (t.result.station_code === station.code && (t.result.state === "STOPPED" || t.result.state === "PRE_DEPARTURE")) {
        statusText = "当駅停車中";
        statusClass = "status-current pulse";
      } else if (depMins != null && cur != null && cur > depMins + 3) {
        statusText = "発車済";
        statusClass = "status-departed";
      } else if (t.result.state === "RUNNING") {
        statusText = "運行中";
        statusClass = "status-running";
      }

    }

    departures.push({
      train: t,
      time: displayTime,
      timeMins,
      isTerminatingHere,
      assignedVehicles,
      statusText,
      statusClass
    });

  });

  departures.sort((a, b) => a.timeMins - b.timeMins);

  if (departures.length === 0) {
    container.innerHTML = `<div class="st-tt-empty">該当する列車はありません。</div>`;
    return;
  }

  let html = `

    <div class="st-tt-table-wrap">

      <table class="st-tt-table">

        <thead>

          <tr>

            <th class="col-time">発車時刻</th>

            <th class="col-dir">方面・行先</th>

            <th class="col-type">種別</th>

            <th class="col-trainno">列車番号</th>

            <th class="col-op">運用</th>

            <th class="col-veh">充当車両</th>

            <th class="col-status">運行状況</th>

          </tr>

        </thead>

        <tbody>

  `;

  departures.forEach(dep => {

    const t = dep.train;

    const type = getTrainType(t);

    const typeStyle = getTrainTypeStyle(type);

    const dirLabel = t.direction === "down" ? "下り" : "上り";

    const dirClass = t.direction === "down" ? "dir-down" : "dir-up";

    const destStationName = getTrainDestination(t);
    const destName = dep.isTerminatingHere ? `${formatStationName(destStationName)}着 (当駅止)` : `${formatStationName(destStationName)}行`;

    let vehDisplayHTML = "";

    if (dep.assignedVehicles && dep.assignedVehicles.length > 0) {

      vehDisplayHTML = dep.assignedVehicles.map(v => `

        <span class="st-tt-veh-pill">

          <img src="${getVehicleIconSrc(v)}" alt="${v}" class="st-tt-veh-icon" onerror="this.style.display='none'">

          <span>${v}</span>

        </span>

      `).join(" ");

    } else {
      vehDisplayHTML = `<span class="st-tt-veh-unassigned">未定</span>`;
    }

    html += `

      <tr class="st-tt-row" data-trainid="${t.train_id}">

        <td class="col-time"><span class="st-tt-time">${dep.time}</span></td>

        <td class="col-dir">

          <span class="st-dir-badge ${dirClass}">${dirLabel}</span>

          <strong class="st-dest-text">${destName}</strong>

        </td>

        <td class="col-type"><span class="st-type-badge type-${type}">${typeStyle.shortLabel}</span></td>

        <td class="col-trainno"><span class="st-trainno-text">${t.train_no}</span></td>

        <td class="col-op"><span class="st-op-pill">${t.operation_id || '—'}</span></td>

        <td class="col-veh">${vehDisplayHTML}</td>

        <td class="col-status"><span class="st-status-badge ${dep.statusClass}">${dep.statusText}</span></td>

      </tr>

    `;

  });

  html += `

        </tbody>

      </table>

    </div>

  `;

  container.innerHTML = html;

  container.querySelectorAll(".st-tt-row").forEach(row => {

    row.addEventListener("click", () => {
      const trainId = row.dataset.trainid;
      const targetTrain = allTrains.find(t => t.train_id === trainId);
      if (targetTrain) openTrainModal(targetTrain);
    });

  });

}

$$(".seg-btn").forEach(b => b.addEventListener("click", () => { const d = b.dataset.dir; if (b.classList.contains("tt-dir")) { state.timetableDir = d; $$(".tt-dir").forEach(x => x.classList.toggle("active", x === b)); renderTimetable() } else { state.diagramDir = d; $$(".dir-filter").forEach(x => x.classList.toggle("active", x === b)); renderDiagram() } }));

$("#modal-close").onclick = () => $("#train-modal").classList.add("hidden"); $("#train-modal").addEventListener("click", e => { if (e.target.id === "train-modal") $("#train-modal").classList.add("hidden") });

var STATIONS_FALLBACK = [];

setInterval(updateClock, 1000);

loadData();

// PWA & オフライン対応
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js').catch(err => {
      console.warn('PWA ServiceWorker registration failed:', err);
    });
  });
}

function updateOnlineStatus() {
  const banner = $("#offline-banner");
  if (banner) {
    if (!navigator.onLine) {
      banner.textContent = "📶 オフライン表示中（端末に保存された時刻表データを表示しています）";
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
if (typeof navigator !== 'undefined' && !navigator.onLine) updateOnlineStatus();

window.addEventListener("load", () => setView(state.view || "position"));

