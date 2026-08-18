/**
 * 真岡線 列車状態計算エンジン
 * (TrainStateEngine.js)
 */

const ARRIVED_HOLD_MINUTES = 5; // 終着駅到着後の保持時間（分）

/**
 * HH:MM 形式の時刻文字列をサービス分数(300〜1739)に変換
 * @param {string} timeStr - "06:02" や "25:15" などの時刻文字列
 * @returns {number|null} サービス分数 (例: 05:00 -> 300)
 */
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
 * 1. 運行日判定ロジック
 * 指定日(serviceDate)に対して対象列車が運行されるか評価
 * * 優先順位:
 * 1. dates_off（特定運休日）➔ false
 * 2. dates_run（特定運転日）➔ true
 * 3. service_type === "extra"（臨時列車）➔ false
 * 4. days_off（曜日・祝日運休設定）➔ false
 * 5. それ以外 ➔ true
 * * @param {Object} train - 基本ダイヤの列車オブジェクト
 * @param {string} serviceDate - "YYYY-MM-DD"
 * @param {boolean} isHoliday - 当日が土日祝日かどうか
 * @returns {boolean} 運行される場合 true
 */
function isTrainOperatingOnDate(train, serviceDate, isHoliday = false) {
  const rule = train.operation_rule || {};
  const datesOff = rule.dates_off || [];
  const datesRun = rule.dates_run || [];
  const daysOff = rule.days_off || [];

  // 1. 特定運休日チェック
  if (datesOff.includes(serviceDate)) return false;

  // 2. 特定運転日チェック
  if (datesRun.includes(serviceDate)) return true;

  // 3. 臨時列車チェック（dates_run に非該当の臨時列車は運休）
  if (rule.service_type === 'extra') return false;

  // 4. 曜日・祝日運休チェック
  if (isHoliday && (daysOff.includes('sat') || daysOff.includes('sun') || daysOff.includes('holiday'))) {
    return false;
  }

  // 5. デフォルト運転
  return true;
}

/**
 * 2. 実効時刻の算出（遅延回復・区間運休の適用）
 * * @param {Object} train - 基本ダイヤの列車オブジェクト
 * @param {Object} override - 当日オーバーライドデータ (train_overrides[train_id])
 * @returns {Array<Object>} 各駅の実効時刻・遅延・運休フラグ配列
 */
function calculateActualTimetable(train, override) {
  const baseDelay = override?.delay_minutes || 0;
  const stationDelays = override?.station_delays || {};

  let actualStart = train.stations[0].code;
  let actualEnd = train.stations[train.stations.length - 1].code;

  // 区間運休のバリデーション（存在検証 & 進行方向の順序検証）
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

/**
 * 3. 列車状態の判定（4状態）
 * * @param {Array<Object>} actualStations - calculateActualTimetable() の戻り値
 * @param {number} currentMinutes - 現在のサービス分数 (300〜1739)
 * @returns {Object} { state, station_code, from_station, to_station, progress }
 */
function evaluateTrainState(actualStations, currentMinutes) {
  // 運休指定されていない有効駅セグメントを抽出
  const activeStations = actualStations.filter(s => !s.is_cancelled);
  if (activeStations.length < 2) return { state: 'OUT_OF_SERVICE' };

  const firstStation = activeStations[0];
  const lastStation = activeStations[activeStations.length - 1];

  // 1. 始発発車前チェック
  if (currentMinutes < firstStation.dep_actual) {
    return { state: 'OUT_OF_SERVICE' };
  }

  // 2. 終着駅到着後の保持 (5分間) および圏外遷移
  if (currentMinutes >= lastStation.arr_actual) {
    if (currentMinutes < lastStation.arr_actual + ARRIVED_HOLD_MINUTES) {
      return { 
        state: 'ARRIVED', 
        station_code: lastStation.code 
      };
    }
    return { state: 'OUT_OF_SERVICE' };
  }

  // 3. 各駅での停車チェック
  for (let i = 0; i < activeStations.length; i++) {
    const st = activeStations[i];
    if (st.arr_actual !== null && st.dep_actual !== null) {
      // 発着時刻が同一（採時駅でない通過/一瞬停車）の1分間対応
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

  // 4. 駅間走行チェック（遅延回復時のゼロ除算ガード付）
  for (let i = 0; i < activeStations.length - 1; i++) {
    const fromSt = activeStations[i];
    const toSt = activeStations[i + 1];
    
    if (fromSt.dep_actual !== null && toSt.arr_actual !== null) {
      if (fromSt.dep_actual <= currentMinutes && currentMinutes < toSt.arr_actual) {
        // 所要時間がゼロまたは負になる回復運転不整合へのガード（最小所要時間を1分に固定）
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

/**
 * 4. メイン公開関数: ダイヤ全列車の状態一括計算
 * * @param {Array<Object>} timetable - 基本ダイヤ配列
 * @param {Object} todayStatus - GAS APIから取得した当日ステータス
 * @param {number} currentMinutes - 計算対象時刻（サービス分数）
 * @param {boolean} isHoliday - 土日祝判定
 * @returns {Array<Object>} 状態計算結果を含んだ列車リスト
 */
function computeAllTrainStates(timetable, todayStatus, currentMinutes, isHoliday = false) {
  const serviceDate = todayStatus.service_date;
  const overrides = todayStatus.train_overrides || {};

  return timetable.map(train => {
    // 運行日判定
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

    // オーバーライド取得 ＆ 実効時刻計算
    const override = overrides[train.train_id] || null;
    const actualStations = calculateActualTimetable(train, override);

    // 列車状態計算
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

// Node.js環境（テスト等）向けのエクスポート対応
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    timeStringToMinutes,
    isTrainOperatingOnDate,
    calculateActualTimetable,
    evaluateTrainState,
    computeAllTrainStates
  };
}
