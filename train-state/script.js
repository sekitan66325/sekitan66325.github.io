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

/**
 * HH:MM 蠖｢蠑上E譎ょ綾譁EE怜E繧偵し繝ｼ繝薙せ蛻・焁E300縲・739)縺E螟画鋤
 * @param {string} timeStr - "06:02" 繧・"25:15" 縺E縺E縺E譎ょ綾譁EE怜E
 * @returns {number|null} 繧E繝ｼ繝薙せ蛻・焁E(萓E 05:00 -> 300)
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
 * 1. 驕玖�E�梧律蛻�E�螳壹Ο繧�E�繝�EぁE
 * 謖�E�E�壽征EserviceDate)縺�E�蟁E��縺励※蟁E��雎｡蛻苓ｻ翫′驕玖�E�後！E��後ｋ縺玖ｩ穂ｾ�E�
 * * 蜁E��蜈磯�E�・�E�・
 * 1. dates_off・育音螳夐°莨第律�E俁E��Efalse
 * 2. dates_run・育音螳夐°霁E��譌･・俁E��Etrue
 * 3. service_type === "extra"・郁�E譎ょ・霁E��E��俁E��Efalse
 * 4. days_off・域屁E��･繝ｻ逾晁E��驕倶�E�題ｨ�E�螳夲�E�俁E��Efalse
 * 5. 縺昴�E�莉�E�螟�E筐�Etrue
 * * @param {Object} train - 蝓ｺ譛ｬ繝繧�E�繝､縺�E�蛻苓ｻ翫が繝悶ず繧�E�繧�E�繝�E
 * @param {string} serviceDate - "YYYY-MM-DD"
 * @param {boolean} isHoliday - 蠖捺律縺悟悄譌･逾晁E��縺九�E縺・°
 * @returns {boolean} 驕玖�E�後！E��後ｋ蝣�E�蜷・true
 */
function isTrainOperatingOnDate(train, serviceDate, isHoliday = false) {
  const rule = train.operation_rule || {};
  const datesOff = rule.dates_off || [];
  const datesRun = rule.dates_run || [];
  const daysOff = rule.days_off || [];

  // 1. 迚ｹ螳夐°莨第律繝�Eぉ繝�EぁE
  if (datesOff.includes(serviceDate)) return false;

  // 2. 迚ｹ螳夐°霁E��譌･繝�Eぉ繝�EぁE
  if (datesRun.includes(serviceDate)) return true;

  // 3. 閾�E�譎ょ・霁E��メ繧�E�繝�Eけ�E・ates_run 縺�E�髱櫁E���E�蠖薙・閾�E�譎ょ・霁E��・驕倶�E�托ｼ・
  if (rule.service_type === 'extra') return false;

  // 4. 譖懈律繝ｻ逾晁E��驕倶�E�代メ繧�E�繝�EぁE
  if (isHoliday && (daysOff.includes('sat') || daysOff.includes('sun') || daysOff.includes('holiday'))) {
    return false;
  }

  // 5. 繝�Eヵ繧�E�繝ｫ繝磯°霁E��
  return true;
}

/**
 * 2. 螳溷柑譎ょ綾縺�E�邂怜�E・磯≦蟒ｶ蝗槫�E��E�繝ｻ蛹�E�髢馴°莨代・驕ｩ逕ｨ・・
 * * @param {Object} train - 蝓ｺ譛ｬ繝繧�E�繝､縺�E�蛻苓ｻ翫が繝悶ず繧�E�繧�E�繝�E
 * @param {Object} override - 蠖捺律繧�E�繝ｼ繝�E・繝ｩ繧�E�繝峨ョ繝ｼ繧�E� (train_overrides[train_id])
 * @returns {Array<Object>} 蜷・�E�・・螳溷柑譎ょ綾繝ｻ驕�E�E��E�繝ｻ驕倶�E�代ヵ繝ｩ繧�E�驟榊�E
 */
function calculateActualTimetable(train, override) {
  const baseDelay = override?.delay_minutes || 0;
  const stationDelays = override?.station_delays || {};

  let actualStart = train.stations[0].code;
  let actualEnd = train.stations[train.stations.length - 1].code;

  // 蛹�E�髢馴°莨代・繝�EΜ繝�E・繧�E�繝ｧ繝ｳ・亥�E�伜惠讀懁E���E� & 騾�E�陦梧婿蜷代・鬁E�E�E�乗､懁E���E�・・
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
 * 3. 蛻苓ｻ顔�E諷九�E蛻�E�螳夲�E�・迥�E�諷具�E�・
 * * @param {Array<Object>} actualStations - calculateActualTimetable() 縺�E�謌ｻ繧雁E��E�
 * @param {number} currentMinutes - 迴�E�蝨�E�縺�E�繧�E�繝ｼ繝薙せ蛻・焁E(300縲・739)
 * @returns {Object} { state, station_code, from_station, to_station, progress }
 */
function evaluateTrainState(actualStations, currentMinutes) {
  // 驕倶�E�第欠螳壹�E�E��後※縺・↑縺・怏蜉�E�鬧・そ繧�E�繝｡繝ｳ繝医�E�謚ｽ蜁E��
  const activeStations = actualStations.filter(s => !s.is_cancelled);
  if (activeStations.length < 2) return { state: 'OUT_OF_SERVICE' };

  const firstStation = activeStations[0];
  const lastStation = activeStations[activeStations.length - 1];

  // 1. 蟋狗匱逋ｺ霁E��燕繝�Eぉ繝�EぁE
  if (currentMinutes < firstStation.dep_actual) {
    if (currentMinutes >= firstStation.dep_actual - DEPARTURE_HOLD_MINUTES) {
      return { 
        state: 'PRE_DEPARTURE', 
        station_code: firstStation.code 
      };
    }
    return { state: 'OUT_OF_SERVICE' };
  }

  // 2. 邨ら捩鬧・芦逹蠕後�E菫晁E�� (5蛻・俣) 縺翫�E�縺�E�蝨丞､夜�E遘ｻ
  if (currentMinutes >= lastStation.arr_actual) {
    if (currentMinutes < lastStation.arr_actual + ARRIVED_HOLD_MINUTES) {
      return { 
        state: 'ARRIVED', 
        station_code: lastStation.code 
      };
    }
    return { state: 'OUT_OF_SERVICE' };
  }

  // 3. 蜷・�E�・〒縺�E�蛛懆�E�翫メ繧�E�繝�EぁE
  for (let i = 0; i < activeStations.length; i++) {
    const st = activeStations[i];
    if (st.arr_actual !== null && st.dep_actual !== null) {
      // 逋ｺ逹譎ょ綾縺悟�E荳・域治譎る�E�・〒縺�E�縺・夐℃/荳迸�E�蛛懆�E�奁E��峨・1蛻・俣蟁E��蠢・
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

  // 4. 鬧・俣襍ｰ陦後メ繧�E�繝�Eけ�E磯≦蟒ｶ蝗槫�E��E�譎ゅ・繧�E�繝ｭ髯�E�邂励ぎ繝ｼ繝�E�E�偁E��・
  for (let i = 0; i < activeStations.length - 1; i++) {
    const fromSt = activeStations[i];
    const toSt = activeStations[i + 1];
    
    if (fromSt.dep_actual !== null && toSt.arr_actual !== null) {
      if (fromSt.dep_actual <= currentMinutes && currentMinutes < toSt.arr_actual) {
        // 謁E�隕∵凾髢薙′繧�E�繝ｭ縺�E�縺溘�E雋�縺�E�縺�E�繧句屓蠕ｩ驕玖�E��E�荳肴紛蜷医∈縺�E�繧�E�繝ｼ繝会ｼ域怙蟆乗園隕∵凾髢薙ａE蛻・↓蝗�E�螳夲�E�・
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
 * 4. 繝｡繧�E�繝ｳ蜈ｬ髢矩未謨�E�: 繝繧�E�繝､蜈ｨ蛻苓ｻ翫・迥�E�諷倶�E�諡�E�險育�E�・
 * * @param {Array<Object>} timetable - 蝓ｺ譛ｬ繝繧�E�繝､驟榊�E
 * @param {Object} todayStatus - GAS API縺九ｉ蜿門�E�励�E�縺溷�E�捺律繧�E�繝�E・繧�E�繧�E�
 * @param {number} currentMinutes - 險育�E�怜ｯ�E�雎｡譎ょ綾・医し繝ｼ繝薙せ蛻・焚�E・
 * @param {boolean} isHoliday - 蝨滓律逾晏�E螳・
 * @returns {Array<Object>} 迥�E�諷玖ｨ育�E�礼�E�先棡繧貞性繧薙□蛻苓ｻ翫Μ繧�E�繝�E
 */
function computeAllTrainStates(timetable, todayStatus, currentMinutes, isHoliday = false) {
  const serviceDate = todayStatus.service_date;
  const overrides = todayStatus.train_overrides || {};

  return timetable.map(train => {
    // 驕玖�E�梧律蛻�E�螳・
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

    // 繧�E�繝ｼ繝�E・繝ｩ繧�E�繝牙叙蠕�E・・螳溷柑譎ょ綾險育�E�・
    const override = overrides[train.train_id] || null;
    const actualStations = calculateActualTimetable(train, override);

    // 蛻苓ｻ顔�E諷玖ｨ育�E�・
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
  if (m == null) return "—"; let h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0"); return `${String(h).padStart(2, "0")}:${mm}`;
}
function serviceDateLabel(s) {
  const d = new Date(`${s}T12:00:00+09:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
}
function serviceRuns(train, date) {
  const r = train.operation_rule || {};
  if ((r.dates_off || []).includes(date)) return false;
  if ((r.dates_run || []).includes(date)) return true;
  if (r.service_type === "extra") return false;
  const day = new Date(`${date}T12:00:00+09:00`).getDay();
  const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];
  return !(r.days_off || []).includes(key);
}

function getTrainType(train) {
  if (train.train_no.startsWith("回")) return "empty";
  if (train.train_no.startsWith("6")) return "sl";
  if (train.operation_rule?.service_type === "extra") return "extra";
  return "local";
}
function getTrainTypeColor(type) {
  switch (type) {
    case "sl": return "var(--train-sl)";
    case "extra": return "var(--train-extra)";
    case "empty": return "var(--train-empty)";
    default: return "var(--train-local)";
  }
}

function validateStatus(s) {
  return !!s && typeof s.service_date === "string" && s.official_info && s.operations && s.train_overrides;
}

function stationPos(code) { return DATA.stations.findIndex(s => s.code === code) }
function positionForState(train, actual, result) {
  if(result.state==="OUT_OF_SERVICE") return null;
  if(result.state==="STOPPED"||result.state==="ARRIVED"||result.state==="PRE_DEPARTURE") {
    const idx = actual.findIndex(s=>s.code===result.station_code);
    return {station:idx, progress:0};
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
  const ov = DATA.status.train_overrides[train.train_id] || {};
  const actual = calculateActualTimetable(train, ov);
  const result = evaluateTrainState(actual, currentMins ?? 720);
  return { ...train, override: ov, actual, result, position: positionForState(train, actual, result) };
}
function effectiveTrains() {
  const cur = state.currentMinutes ?? 720;
  const today = DATA.timetable
    .filter(t => serviceRuns(t, state.serviceDate))
    .map(t => buildTrainEntry(t, cur));

  let crossover = [];
  if (cur < 300 && DATA.prevTimetable.length) {
    const prevDate = getPrevDate(state.serviceDate);
    const extendedMins = cur + 1440;
    crossover = DATA.prevTimetable
      .filter(t => serviceRuns(t, prevDate))
      .filter(t => t.stations.some(s => (s.arr && timeStringToMinutes(s.arr) >= 1440) || (s.dep && timeStringToMinutes(s.dep) >= 1440)))
      .map(t => buildTrainEntry(t, extendedMins));
  }

  const allTrains = [...crossover, ...today];

  return allTrains.sort((a,b)=>{
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
    box.className = "notice-section status-loading";
    icon.textContent = "…";
    title.textContent = "公式運行情報を取得しています…";
    updated.textContent = "取得中…";
    link.classList.add("hidden");
    return;
  }

  const n = DATA.status.official_info || {};
  const statusCode = n.status_code || "unknown";

  box.className =
    "notice-section " +
    (
      statusCode === "delay" || statusCode === "suspend"
        ? "status-delay"
        : statusCode === "unknown"
          ? "status-unknown"
          : "status-normal"
    );

  icon.textContent =
    statusCode === "delay" || statusCode === "suspend"
      ? "!"
      : statusCode === "unknown"
        ? "?"
        : "✓";

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

  if (statusCode === "unknown") {
    const fallbackText = n.text || "公式運行情報を取得できませんでした。サイトをご確認ください。";
    if (n.link_url) {
      title.innerHTML = `<a href="${n.link_url}" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">${fallbackText}</a>`;
    } else {
      title.textContent = fallbackText;
    }
  } else {
    const text = n.text || "公式運行情報を取得できませんでした";
    if (n.link_url) {
      title.innerHTML = `<a href="${n.link_url}" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">${text}</a>`;
    } else {
      title.textContent = text;
    }
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
      : "—"
    }`;

  if (n.link_url) {
    link.href = n.link_url;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }
}

function shieldSVG(fillColor, direction) {
  const rotation = direction === "down" ? "rotate(180)" : "";
  const transform = rotation ? `transform="${rotation}" transform-origin="15 17"` : "";
  return `<svg viewBox="0 0 30 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 1 L28 7 L28 18 Q28 28 15 33 Q2 28 2 18 L2 7 Z"
          fill="${fillColor}" stroke="rgba(0,0,0,.15)" stroke-width="1" ${transform}/>
  </svg>`;
}

function renderStations() { }

function renderPosition() {
  const host = $("#position-body"); host.innerHTML = "";
  const trains = effectiveTrains();

  const stationsReversed = [...DATA.stations].reverse();

  const stationTrains = {};
  stationsReversed.forEach(s => { stationTrains[s.code] = { up: [], down: [] } });

  const betweenTrains = [];

  trains.filter(t => t.position).forEach(t => {
    if (t.result.state === "STOPPED" || t.result.state === "ARRIVED" || t.result.state === "PRE_DEPARTURE") {
      const code = t.result.station_code;
      if (stationTrains[code]) {
        stationTrains[code][t.direction].push(t);
      }
    } else if (t.result.state === "RUNNING") {
      betweenTrains.push(t);
    }
  });

  stationsReversed.forEach((s, i) => {
    const isTerminal = i === 0 || i === stationsReversed.length - 1;
    const isExchange = s.can_exchange || isTerminal;
    const row = document.createElement("div");
    row.className = "pos-station-row" + (isExchange ? " exchange" : "");

    const label = document.createElement("div");
    label.className = "pos-station-label";
    label.innerHTML = `
      <span class="pos-station-name">${formatStationName(s.name)}</span>
    `;

    const railArea = document.createElement("div");
    railArea.className = "pos-rail-area";

    const dot = document.createElement("div");
    dot.className = "pos-rail-dot";
    dot.style.top = "50%";
    railArea.appendChild(dot);

    const downTrains = stationTrains[s.code].down;
    if (downTrains.length > 0) {
      const downContainer = document.createElement("div");
      downContainer.className = "pos-trains-down";
      downTrains.forEach(t => {
        downContainer.appendChild(createTrainCard(t));
      });
      railArea.appendChild(downContainer);
    }

    const upTrains = stationTrains[s.code].up;
    if (upTrains.length > 0) {
      const upContainer = document.createElement("div");
      upContainer.className = "pos-trains-up";
      upTrains.forEach(t => {
        upContainer.appendChild(createTrainCard(t));
      });
      railArea.appendChild(upContainer);
    }

    row.appendChild(label);
    row.appendChild(railArea);
    host.appendChild(row);
  });

  const railLine = document.createElement("div");
  railLine.className = "pos-rail-column";
  const dots = host.querySelectorAll(".pos-rail-dot");
  if (dots.length >= 2) {
    const firstDot = dots[0].getBoundingClientRect();
    const lastDot = dots[dots.length - 1].getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const topY = firstDot.top + firstDot.height / 2 - hostRect.top;
    const bottomY = lastDot.top + lastDot.height / 2 - hostRect.top;
    const railLeft = firstDot.left + firstDot.width / 2 - hostRect.left;

    railLine.style.left = railLeft + "px";
    railLine.style.top = topY + "px";
    railLine.style.height = (bottomY - topY) + "px";
    host.style.position = "relative";
    host.appendChild(railLine);
  }

  betweenTrains.forEach(t => {
    const fromIdx = stationsReversed.findIndex(s => s.code === t.result.from_station);
    const toIdx = stationsReversed.findIndex(s => s.code === t.result.to_station);
    if (fromIdx === -1 || toIdx === -1) return;
    const rows = host.querySelectorAll(".pos-station-row");
    if (!rows[fromIdx] || !rows[toIdx]) return;

    const fromRect = rows[fromIdx].getBoundingClientRect();
    const toRect = rows[toIdx].getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const fromY = fromRect.top - hostRect.top + fromRect.height / 2;
    const toY = toRect.top - hostRect.top + toRect.height / 2;
    const y = fromY + (toY - fromY) * t.result.progress;

    const railArea = rows[0]?.querySelector(".pos-rail-area");
    if (!railArea) return;
    const railAreaRect = railArea.getBoundingClientRect();
    const railCenterX = railAreaRect.left - hostRect.left + railAreaRect.width / 2;

    const marker = document.createElement("div");
    marker.className = "pos-between-train";
    marker.style.top = y + "px";

    if (t.direction === "down") {
      marker.style.right = (host.offsetWidth - railCenterX + 18) + "px";
      marker.style.flexDirection = "row-reverse";
    } else {
      marker.style.left = (railCenterX + 18) + "px";
    }

    marker.appendChild(createTrainCard(t));
    marker.onclick = () => openTrainModal(t);
    host.appendChild(marker);
  });

  const running = trains.filter(t => t.result.state === "RUNNING").length, stopped = trains.filter(t => t.result.state === "STOPPED").length, arrived = trains.filter(t => t.result.state === "ARRIVED").length;
  $("#summary-grid").innerHTML = `<div class="summary-card"><span>運転中</span><strong>${running}本</strong></div><div class="summary-card"><span>駅停車中</span><strong>${stopped}本</strong></div><div class="summary-card"><span>到着保持</span><strong>${arrived}本</strong></div>`;
  $("#position-current-time").textContent = formatServiceTime(state.currentMinutes);
}

function createTrainCard(t) {
  const card = document.createElement("div");
  card.className = "pos-train-card";

  const isStopped = t.result.state === "STOPPED" || t.result.state === "ARRIVED" || t.result.state === "PRE_DEPARTURE";
  const type = getTrainType(t);
  const shieldColor = getTrainTypeColor(type);

  const shield = document.createElement("div");
  shield.className = "pos-train-shield";
  shield.innerHTML = shieldSVG(shieldColor, t.direction);

  const info = document.createElement("div");
  info.className = "pos-train-info";

  let infoHTML = `<span class="pos-train-no">${t.train_no}</span>`;

  if (isStopped) {
    const badgeText = t.result.state === "PRE_DEPARTURE" ? "始発" : (t.result.state === "ARRIVED" ? "終着" : "停車中");
    infoHTML += `<span class="pos-stopped-badge">${badgeText}</span>`;
  }

  infoHTML += `<span class="pos-train-dest">${t.destination} 行</span>`;
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
  const trains = effectiveTrains().filter(t => state.diagramDir === "all" || t.direction === state.diagramDir);

  const maxDist = DATA.stations.at(-1).distance_km;
  const width = 4500, left = 82, topPad = 38, bottomPad = 55;

  const container = $("#diagram-scroll");
  const availableHeight = window.innerHeight - container.getBoundingClientRect().top - 90;
  const containerHeight = Math.max(availableHeight, 400);
  container.style.height = containerHeight + "px";

  const chartHeight = containerHeight - topPad - bottomPad;
  const height = chartHeight + topPad + bottomPad;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

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
    svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: height, stroke: "var(--svg-grid-line)", "stroke-width": m % 360 === 300 ? 1.2 : .5 }));
    const txt = svgEl("text", { x: x + 3, y: 20, fill: "var(--svg-grid-text)", "font-size": "11" });
    txt.textContent = formatServiceTime(m); svg.appendChild(txt);
  }

  const stationsReversed = [...DATA.stations].reverse();
  stationsReversed.forEach((s, i) => {
    const isTerminal = i === 0 || i === stationsReversed.length - 1;
    const isExchange = s.can_exchange || isTerminal;
    const y = yOf(s.code);
    svg.appendChild(svgEl("line", { x1: left, y1: y, x2: width, y2: y, stroke: isExchange ? "var(--svg-station-line)" : "var(--svg-station-line-alt)", "stroke-width": isExchange ? 1.2 : .7 }));
    const label = svgEl("text", { x: 8, y: y + 4, fill: isExchange ? "var(--svg-station-text)" : "var(--svg-station-text-alt)", "font-size": "11", "font-weight": isExchange ? 600 : 400 });
    label.textContent = formatStationName(s.name); svg.appendChild(label);
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
    const schedColor = getTrainTypeColor(type);
    const path = svgEl("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: schedColor, "stroke-width": 1.5, "opacity": .6, "stroke-dasharray": "4,4", "data-train-id": t.train_id });
    path.style.cursor = "pointer"; path.addEventListener("click", () => openTrainModal(t)); svg.appendChild(path);

    const actPts = [];
    t.actual.filter(s => !s.is_cancelled).forEach(s => {
      if (s.arr_actual != null) actPts.push([timeX(s.arr_actual), yOf(s.code)]);
      if (s.dep_actual != null && s.dep_actual !== s.arr_actual) actPts.push([timeX(s.dep_actual), yOf(s.code)]);
    });
    if (actPts.length > 1) {
      const ap = svgEl("polyline", { points: actPts.map(p => `${p[0]},${p[1]}`).join(" "), fill: "none", stroke: schedColor, "stroke-width": 3, "opacity": .9, "data-train-id": t.train_id, "stroke-linecap": "round", "stroke-linejoin": "round" });
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
        fill: "var(--svg-train-text)",
        "font-size": "9",
        "font-weight": "600",
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

  const trainNoRow = document.createElement("tr");
  trainNoRow.className = "tt-header-row tt-trainno";
  trainNoRow.innerHTML = `<th>列車番号</th>` + trains.map(t => `<th>${t.train_no}</th>`).join("");
  th.appendChild(trainNoRow);

  const destRow = document.createElement("tr");
  destRow.className = "tt-header-row tt-dest";
  destRow.innerHTML = `<th>行先</th>` + trains.map(t => `<th>${t.destination}</th>`).join("");
  th.appendChild(destRow);

  orderedStations.forEach(s => {
    const tr = document.createElement("tr");
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
  let statusHTML="";
  if(t.actual.some(s=>s.is_cancelled)){
    statusHTML=`<span style="color:#d32f2f;font-weight:bold;">区間運休</span>`;
  }else{
    const stateText={
      RUNNING:"駅間走行中",
      STOPPED:"駅停車中",
      ARRIVED:"終着駅到着",
      PRE_DEPARTURE:"始発駅停車中",
      OUT_OF_SERVICE:"運転時間外"
    }[t.result.state] || "不明";
    statusHTML=`<span>${stateText}</span>`;
  }
  const formation = DATA.status.operations[t.operation_id]?.formation || [];
  $("#modal-body").innerHTML = `
    <span class="modal-kicker">TRAIN DETAIL / ${t.train_id}</span>
    <h3 class="modal-title">${t.train_no}</h3>
    <div class="modal-badges"><span class="badge ${t.direction === "up" ? "blue" : ""}">${t.direction === "up" ? "上り" : "下り"}</span><span class="badge">${t.destination}行</span><span class="badge ${t.result.state === "STOPPED" ? "orange" : ""}">${statusHTML}</span></div>
    <div class="detail-grid"><div class="detail-cell"><small>運用番号</small><strong>${t.operation_id}</strong></div><div class="detail-cell"><small>遅延</small><strong>${t.override.delay_minutes || 0}分</strong></div></div>
    ${formation.length ? `<div class="formation"><h4>編成</h4><div class="formation-list">${formation.map(x => `<span>${x}</span>`).join("")}</div></div>` : ""}
    ${t.override.memo ? `<div class="memo">${t.override.memo}</div>` : ""}
    <div class="station-detail"><h4>各駅の詳細時刻</h4>${t.stations.map(st => {
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
        DATA.prevTimetable = [...DATA.timetable]; // 前日ダイヤを日またぎ列車用に保存
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
    const [s, t, st] = await Promise.all([
      fetch("data/stations.json").then(r => r.json()),
      fetch("data/timetable.json").then(r => r.json()),
      fetch(CONFIG.GAS_API_URL).then(r => {
        if (!r.ok) throw new Error("GAS API HTTP " + r.status);
        return r.json();
      })
    ]);

    if (!Array.isArray(s) || !Array.isArray(t) || !validateStatus(st))
      throw new Error("schema");

    DATA.stations = s;
    DATA.timetable = t;
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
$$(".view-tab,.tab-btn").forEach(b => b.addEventListener("click", (e) => {
  if (window._isDraggingForClick) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  setView(b.dataset.view);
}));
function setView(v) {
  state.view = v;
  $$(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".view-panel").forEach(p => p.classList.toggle("active", p.id === "view-" + v));

  const activeBtn = document.querySelector(`.floating-tab-bar .tab-btn[data-view="${v}"]`);
  if (activeBtn) {
    const glider = document.getElementById("tab-glider");
    if (glider) {
      glider.style.width = activeBtn.offsetWidth + "px";
      glider.style.transform = "translateX(" + (activeBtn.offsetLeft - 4) + "px)";
    }
  }

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
$$(".seg-btn").forEach(b => b.addEventListener("click", () => { const d = b.dataset.dir; if (b.classList.contains("tt-dir")) { state.timetableDir = d; $$(".tt-dir").forEach(x => x.classList.toggle("active", x === b)); renderTimetable() } else { state.diagramDir = d; $$(".diagram-tools .seg-btn:not(.tt-dir)").forEach(x => x.classList.toggle("active", x === b)); renderDiagram() } }));
$("#modal-close").onclick = () => $("#train-modal").classList.add("hidden"); $("#train-modal").addEventListener("click", e => { if (e.target.id === "train-modal") $("#train-modal").classList.add("hidden") });

var STATIONS_FALLBACK = [];

setInterval(updateClock, 1000);

// 初期状態ではまだGASから取得できていないためrenderNotice()はここでは呼ばない

loadData();

// Init glider correctly on load
window.addEventListener("load", () => setView(state.view || "position"));

// Tab Bar Drag Logic
var tabBar = document.querySelector('.floating-tab-bar');
var glider = document.getElementById('tab-glider');
var tabs = Array.from(document.querySelectorAll('.floating-tab-bar .tab-btn'));

if (tabBar && glider) {
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let dragStartTime = 0;

  const startDrag = (e) => {
    isDragging = true;
    glider.style.transition = 'none'; // Disable transition while dragging
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    currentX = startX;
    dragStartTime = Date.now();
  };

  const moveDrag = (e) => {
    if (!isDragging) return;
    currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const barRect = tabBar.getBoundingClientRect();
    let offsetX = currentX - barRect.left - (glider.clientWidth / 2);

    const maxOffset = barRect.width - glider.clientWidth - 4;
    offsetX = Math.max(4, Math.min(offsetX, maxOffset)); // clamp inside bar

    glider.style.transform = `translateX(${offsetX}px)`;
  };

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    glider.style.transition = ''; // Restore CSS transition

    if (Math.abs(currentX - startX) > 5) {
      window._isDraggingForClick = true;
      setTimeout(() => window._isDraggingForClick = false, 100);
    }

    const barRect = tabBar.getBoundingClientRect();
    const gliderCenter = currentX - barRect.left;

    // Find closest tab
    let closestTab = tabs[0];
    let minDistance = Infinity;

    tabs.forEach(tab => {
      const tabRect = tab.getBoundingClientRect();
      const tabCenter = tabRect.left - barRect.left + tabRect.width / 2;
      const distance = Math.abs(gliderCenter - tabCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestTab = tab;
      }
    });

    setView(closestTab.dataset.view);
  };

  tabBar.addEventListener('mousedown', startDrag);
  tabBar.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchmove', moveDrag, { passive: true });
  window.addEventListener('touchend', endDrag);
}
