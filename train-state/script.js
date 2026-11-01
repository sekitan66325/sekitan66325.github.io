var $ = (s, root = document) => root.querySelector(s);
var $$ = (s, root = document) => [...root.querySelectorAll(s)];
var DATA = { stations: [], timetable: [], prevTimetable: [], status: null };
var state = { view: "position", serviceDate: "2026-08-15", currentMinutes: null, liveClock: true, diagramDir: "all", timetableDir: "up" };

function formatStationName(name) {
  if (!name) return name;
  return name === "下館二高前" ? "二高前" : name;
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
  return { ...effectiveTrain, override: ov, actual, result, position: positionForState(effectiveTrain, actual, result) };
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
  const d = direction === "down" ? "M3 9 L8 4 L13 9" : "M3 5 L8 10 L13 5";
  return `<svg viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${d}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
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
      <div class="pos-station-name-col">${formatStationName(s.name)}</div>
      <div class="pos-trains-container pos-trains-down" id="pos-down-${s.code}"></div>
      <div class="pos-rail-area ${i === 0 ? 'rail-first' : ''} ${i === stationsReversed.length - 1 ? 'rail-last' : ''}"><div class="pos-station-dot"></div></div>
      <div class="pos-trains-container pos-trains-up" id="pos-up-${s.code}"></div>
    `;
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

  infoHTML += `<span class="pos-train-dest">${t.destination}行</span>`;
  info.innerHTML = infoHTML;

  if (t.direction === "down") {
    card.appendChild(info);
    card.appendChild(shield);
  } else {
    card.appendChild(shield);
    card.appendChild(info);
  }

  card.onclick = () => openTrainModal(t);
  card.title = `${t.train_no} ${t.destination}行`;
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
  destRow.innerHTML = `<th>行先</th>` + trains.map(t => `<th>${formatStationName(t.destination)}</th>`).join("");
  th.appendChild(destRow);

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
  const displayOpId = opIds.join('＋') || "—";

  $("#modal-body").innerHTML = `
    <span class="modal-kicker">列車詳細 (${t.train_id})</span>
    <h3 class="modal-title">${t.train_no}</h3>
    <div class="modal-badges">
      <span class="badge ${typeBadgeColor}">${tStyle.label}</span>
      <span class="badge">${t.direction === "up" ? "上り" : "下り"}</span>
      <span class="badge">${formatStationName(t.destination)}行</span>
      <span class="badge ${statusBadgeColor}">${statusText}</span>
      ${t.variant_label ? `<span class="badge orange">${t.variant_label}</span>` : ""}
    </div>
    <div class="detail-grid"><div class="detail-cell"><small>運用番号</small><strong>${displayOpId}</strong></div></div>
    ${formation.length ? `<div class="formation"><h4>編成</h4><div class="formation-list">${formation.map(x => `<span>${x}</span>`).join("")}</div></div>` : ""}
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
        if (Array.isArray(t)) DATA.timetable = t;
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

  renderNotice();
  renderAll();
}

function renderAll() { renderPosition(); renderDiagram(); renderTimetable() }
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

$("#date-input").addEventListener("change", e => {
  state.serviceDate = e.target.value;
  state.liveClock = false;
  const timeInput = $("#time-input") ? $("#time-input").value : "12:00";
  const [h, m] = (timeInput || "12:00").split(":").map(Number);
  state.currentMinutes = h * 60 + m;
  renderNotice(); renderAll()
});
const timeInputEl2 = $("#time-input");
if (timeInputEl2) {
  timeInputEl2.addEventListener("change", e => {
    state.liveClock = false;
    const timeInput = e.target.value || "12:00";
    const [h, m] = timeInput.split(":").map(Number);
    state.currentMinutes = h * 60 + m;
    renderNotice(); renderAll()
  });
}
$("#now-btn").addEventListener("click", () => {
  state.liveClock = true;
  const c = normalizeToServiceContext(new Date());
  state.serviceDate = c.service_date;
  state.currentMinutes = c.service_minutes;
  $("#date-input").value = state.serviceDate;
  const h = Math.floor(state.currentMinutes / 60) % 24;
  const m = state.currentMinutes % 60;
  if ($("#time-input")) $("#time-input").value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $("#diagram-scroll").dataset.didAutoScroll = "";
  renderAll()
});
$$(".seg-btn").forEach(b => b.addEventListener("click", () => { const d = b.dataset.dir; if (b.classList.contains("tt-dir")) { state.timetableDir = d; $$(".tt-dir").forEach(x => x.classList.toggle("active", x === b)); renderTimetable() } else { state.diagramDir = d; $$(".dir-filter").forEach(x => x.classList.toggle("active", x === b)); renderDiagram() } }));
$("#modal-close").onclick = () => $("#train-modal").classList.add("hidden"); $("#train-modal").addEventListener("click", e => { if (e.target.id === "train-modal") $("#train-modal").classList.add("hidden") });

var STATIONS_FALLBACK = [];

setInterval(updateClock, 1000);

loadData();

window.addEventListener("load", () => setView(state.view || "position"));

