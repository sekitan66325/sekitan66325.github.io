const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const DATA = {stations:[], timetable:[], status:null};
const state = {view:"position", serviceDate:"2026-08-15", currentMinutes:null, liveClock:true, diagramDir:"all", timetableDir:"up"};

function timeStringToMinutes(t){
  if(t==null) return null;
  let [h,m] = t.split(":").map(Number);
  if(h < 5) h += 24;
  return h*60+m;
}
function normalizeToServiceContext(d){
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  let h=Number(p.hour); if(h===24)h=0;
  const base=new Date(Number(p.year),Number(p.month)-1,Number(p.day));
  if(h<5){base.setDate(base.getDate()-1);return {service_date:base.toISOString().slice(0,10),service_minutes:(h+24)*60+Number(p.minute)}}
  return {service_date:`${p.year}-${p.month}-${p.day}`,service_minutes:h*60+Number(p.minute)};
}
function formatServiceTime(m){
  if(m==null)return "—"; let h=Math.floor(m/60), mm=String(m%60).padStart(2,"0"); return `${String(h).padStart(2,"0")}:${mm}`;
}
function serviceDateLabel(s){
  const d=new Date(`${s}T12:00:00+09:00`);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
}
function serviceRuns(train,date){
  const r=train.operation_rule||{};
  if((r.dates_off||[]).includes(date))return false;
  if((r.dates_run||[]).includes(date))return true;
  if(r.service_type==="extra")return false;
  const day=new Date(`${date}T12:00:00+09:00`).getDay();
  const key=["sun","mon","tue","wed","thu","fri","sat"][day];
  return !(r.days_off||[]).includes(key);
}
function validateStatus(s){
  return !!s && typeof s.service_date==="string" && s.official_info && s.operations && s.train_overrides;
}
function calculateActualTimetable(train, override={}){
  const baseDelay=override.delay_minutes||0, stationDelays=override.station_delays||{};
  let start=train.stations[0].code,end=train.stations[train.stations.length-1].code;
  if(override.actual_start&&override.actual_end){
    const si=train.stations.findIndex(x=>x.code===override.actual_start),ei=train.stations.findIndex(x=>x.code===override.actual_end);
    if(si!==-1&&ei!==-1&&si<=ei){start=override.actual_start;end=override.actual_end}else console.warn(`[Data Anomaly] Invalid or reversed actual_start/end for ${train.train_id}. Falling back to full route.`);
  }
  let active=false;
  return train.stations.map(st=>{
    if(st.code===start)active=true;
    const delay=stationDelays[st.code]!==undefined?stationDelays[st.code]:baseDelay;
    const item={code:st.code,arr_scheduled:st.arr,dep_scheduled:st.dep,
      arr_actual:st.arr==null?null:timeStringToMinutes(st.arr)+delay,
      dep_actual:st.dep==null?null:timeStringToMinutes(st.dep)+delay,
      delay_minutes:delay,is_cancelled:!active};
    if(st.code===end)active=false;
    return item;
  });
}
const ARRIVED_HOLD_MINUTES=5;
function evaluateTrainState(actualStations,currentMinutes){
  const a=actualStations.filter(s=>!s.is_cancelled); if(a.length<2)return {state:"OUT_OF_SERVICE"};
  const first=a[0],last=a[a.length-1];
  if(currentMinutes < first.dep_actual)return {state:"OUT_OF_SERVICE"};
  if(currentMinutes>=last.arr_actual){
    if(currentMinutes<last.arr_actual+ARRIVED_HOLD_MINUTES)return {state:"ARRIVED",station_code:last.code};
    return {state:"OUT_OF_SERVICE"};
  }
  for(const st of a){
    if(st.arr_actual!==null&&st.dep_actual!==null){
      if(st.arr_actual===st.dep_actual&&currentMinutes===st.arr_actual)return {state:"STOPPED",station_code:st.code,is_instant_stop:true};
      if(st.arr_actual<=currentMinutes&&currentMinutes<st.dep_actual)return {state:"STOPPED",station_code:st.code,is_instant_stop:false};
    }
  }
  for(let i=0;i<a.length-1;i++){
    const f=a[i],t=a[i+1];
    if(f.dep_actual<=currentMinutes&&currentMinutes<t.arr_actual){
      const total=Math.max(1,t.arr_actual-f.dep_actual),progress=Math.min(1,Math.max(0,(currentMinutes-f.dep_actual)/total));
      return {state:"RUNNING",from_station:f.code,to_station:t.code,progress};
    }
  }
  return {state:"OUT_OF_SERVICE"};
}
function stationPos(code){return DATA.stations.findIndex(s=>s.code===code)}
function positionForState(train, actual, result){
  const idx=stationPos(result.station_code);
  if(result.state==="STOPPED"||result.state==="ARRIVED") return {station:idx,progress:0};
  if(result.state==="RUNNING"){
    const from=stationPos(result.from_station),to=stationPos(result.to_station);
    return {station:from,progress:result.progress*(to-from)};
  }
  return null;
}
function effectiveTrains(){
  return DATA.timetable.filter(t=>serviceRuns(t,state.serviceDate)).map(train=>{
    const ov=DATA.status.train_overrides[train.train_id]||{};
    const actual=calculateActualTimetable(train,ov);
    const result=evaluateTrainState(actual,state.currentMinutes??720);
    return {...train,override:ov,actual,result,position:positionForState(train,actual,result)};
  });

}

function renderNotice() {
  const box = $("#notice");
  const title = $("#notice-title");
  const updated = $("#notice-updated");
  const link = $("#notice-link");
  const icon = $("#notice-icon");

  // ========================================
  // GASからまだ運行情報を取得していない
  // ========================================
  if (!DATA.status) {
    box.className = "notice-section status-loading";

    icon.textContent = "…";
    title.textContent = "公式運行情報を取得しています";
    updated.textContent = "取得中…";

    link.classList.add("hidden");

    return;
  }

  const n = DATA.status.official_info || {};
  const statusCode = n.status_code || "unknown";

  // ========================================
  // 状態ごとの表示
  // ========================================
  box.className =
    "notice-section " +
    (
      statusCode === "delay"
        ? "status-delay"
        : statusCode === "unknown"
          ? "status-unknown"
          : "status-normal"
    );

  // アイコン
  icon.textContent =
    statusCode === "delay"
      ? "!"
      : statusCode === "unknown"
        ? "?"
        : "✓";

  // ========================================
  // 公式運行情報の本文
  // ========================================
  if (statusCode === "unknown") {

    title.textContent =
      n.text ||
      "公式運行情報を取得できませんでした（サイトをご確認ください）";

  } else {

    // GASから取得した公式文言をそのまま表示
    title.textContent =
      n.text ||
      "公式運行情報を取得できませんでした";

  }

  // ========================================
  // GASが公式HPを取得した時刻
  // ========================================
  updated.textContent =
    `取得: ${
      n.fetched_at
        ? new Date(n.fetched_at).toLocaleString(
            "ja-JP",
            {
              timeZone: "Asia/Tokyo",
              hour12: false
            }
          )
        : "—"
    }`;

  // ========================================
  // 詳細ページへのリンク
  // ========================================
  if (n.link_url) {
    link.href = n.link_url;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }
}

// =====================================================
// Shield SVG icon for train markers
// =====================================================
function shieldSVG(fillColor, direction){
  const rotation = direction === "down" ? "rotate(180)" : "";
  const transform = rotation ? `transform="${rotation}" transform-origin="15 17"` : "";
  return `<svg viewBox="0 0 30 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 1 L28 7 L28 18 Q28 28 15 33 Q2 28 2 18 L2 7 Z"
          fill="${fillColor}" stroke="rgba(0,0,0,.15)" stroke-width="1" ${transform}/>
  </svg>`;
}

// =====================================================
// POSITION VIEW — Render (reference image layout)
// =====================================================
// Stations displayed: 茂木 (top) → 下館 (bottom)
// Down trains: LEFT of rail,  Up trains: RIGHT of rail
function renderStations(){}  // No longer used separately

function renderPosition(){
  const host=$("#position-body"); host.innerHTML="";
  const trains=effectiveTrains();

  // Reversed station order: 茂木(top) → 下館(bottom)
  const stationsReversed = [...DATA.stations].reverse();

  // Build map: station code → trains at/near this station
  const stationTrains = {};
  stationsReversed.forEach(s=>{stationTrains[s.code]={up:[],down:[]}});

  // Between-station trains (for interpolation display)
  const betweenTrains = [];

  trains.filter(t=>t.position).forEach(t=>{
    if(t.result.state==="STOPPED"||t.result.state==="ARRIVED"){
      const code = t.result.station_code;
      if(stationTrains[code]){
        stationTrains[code][t.direction].push(t);
      }
    } else if(t.result.state==="RUNNING"){
      betweenTrains.push(t);
    }
  });

  // Render each station row
  stationsReversed.forEach((s,i)=>{
    const isTerminal = i === 0 || i === stationsReversed.length - 1;
    const isExchange = s.can_exchange || isTerminal;
    const row = document.createElement("div");
    row.className = "pos-station-row" + (isExchange?" exchange":"");

    // Station label (left)
    const label = document.createElement("div");
    label.className = "pos-station-label";
    label.innerHTML = `
      <span class="pos-station-name">${s.name}</span>
    `;

    // Rail area (center)
    const railArea = document.createElement("div");
    railArea.className = "pos-rail-area";

    // Rail dot
    const dot = document.createElement("div");
    dot.className = "pos-rail-dot";
    dot.style.top = "50%";
    railArea.appendChild(dot);

    // Down trains (left of rail)
    const downTrains = stationTrains[s.code].down;
    if(downTrains.length > 0){
      const downContainer = document.createElement("div");
      downContainer.className = "pos-trains-down";
      downTrains.forEach(t=>{
        downContainer.appendChild(createTrainCard(t));
      });
      railArea.appendChild(downContainer);
    }

    // Up trains (right of rail)
    const upTrains = stationTrains[s.code].up;
    if(upTrains.length > 0){
      const upContainer = document.createElement("div");
      upContainer.className = "pos-trains-up";
      upTrains.forEach(t=>{
        upContainer.appendChild(createTrainCard(t));
      });
      railArea.appendChild(upContainer);
    }

    row.appendChild(label);
    row.appendChild(railArea);
    host.appendChild(row);
  });

  // Add continuous rail line
  const railLine = document.createElement("div");
  railLine.className = "pos-rail-column";
  // Position it within the rail area column
  const dots = host.querySelectorAll(".pos-rail-dot");
  if(dots.length >= 2){
    const firstDot = dots[0].getBoundingClientRect();
    const lastDot = dots[dots.length-1].getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const topY = firstDot.top + firstDot.height/2 - hostRect.top;
    const bottomY = lastDot.top + lastDot.height/2 - hostRect.top;
    const railLeft = firstDot.left + firstDot.width/2 - hostRect.left;
    
    railLine.style.left = railLeft + "px";
    railLine.style.top = topY + "px";
    railLine.style.height = (bottomY - topY) + "px";
    host.style.position = "relative";
    host.appendChild(railLine);
  }

  // Handle between-station running trains
  betweenTrains.forEach(t=>{
    const fromIdx = stationsReversed.findIndex(s=>s.code===t.result.from_station);
    const toIdx = stationsReversed.findIndex(s=>s.code===t.result.to_station);
    if(fromIdx===-1||toIdx===-1)return;
    const rows = host.querySelectorAll(".pos-station-row");
    if(!rows[fromIdx]||!rows[toIdx])return;

    const fromRect = rows[fromIdx].getBoundingClientRect();
    const toRect = rows[toIdx].getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const fromY = fromRect.top - hostRect.top + fromRect.height/2;
    const toY = toRect.top - hostRect.top + toRect.height/2;
    const y = fromY + (toY - fromY) * t.result.progress;

    const railArea = rows[0]?.querySelector(".pos-rail-area");
    if(!railArea)return;
    const railAreaRect = railArea.getBoundingClientRect();
    const railCenterX = railAreaRect.left - hostRect.left + railAreaRect.width/2;

    const marker = document.createElement("div");
    marker.className = "pos-between-train";
    marker.style.top = y + "px";

    if(t.direction==="down"){
      marker.style.right = (host.offsetWidth - railCenterX + 18) + "px";
      marker.style.flexDirection = "row-reverse";
    } else {
      marker.style.left = (railCenterX + 18) + "px";
    }

    marker.appendChild(createTrainCard(t));
    marker.onclick = ()=>openTrainModal(t);
    host.appendChild(marker);
  });

  // Summary
  const running=trains.filter(t=>t.result.state==="RUNNING").length,stopped=trains.filter(t=>t.result.state==="STOPPED").length,arrived=trains.filter(t=>t.result.state==="ARRIVED").length;
  $("#summary-grid").innerHTML=`<div class="summary-card"><span>運転中</span><strong>${running}本</strong></div><div class="summary-card"><span>駅停車中</span><strong>${stopped}本</strong></div><div class="summary-card"><span>到着保持</span><strong>${arrived}本</strong></div>`;
  $("#position-current-time").textContent=formatServiceTime(state.currentMinutes);
}

function createTrainCard(t){
  const card = document.createElement("div");
  card.className = "pos-train-card";

  const isStopped = t.result.state==="STOPPED" || t.result.state==="ARRIVED";
  const shieldColor = "var(--text-primary)";

  // Shield icon
  const shield = document.createElement("div");
  shield.className = "pos-train-shield";
  shield.innerHTML = shieldSVG(shieldColor, t.direction);

  // Info chip
  const info = document.createElement("div");
  info.className = "pos-train-info";

  let infoHTML = `<span class="pos-train-no">${t.train_no}</span>`;

  if(isStopped){
    infoHTML += `<span class="pos-stopped-badge">停車中</span>`;
  }

  infoHTML += `<span class="pos-train-dest">${t.destination} 行</span>`;
  info.innerHTML = infoHTML;

  if(t.direction==="down"){
    // Down: info on left, shield on right
    card.appendChild(info);
    card.appendChild(shield);
  } else {
    // Up: shield on left, info on right
    card.appendChild(shield);
    card.appendChild(info);
  }

  card.onclick = ()=>openTrainModal(t);
  card.title = `${t.train_no} ${t.destination}行`;
  return card;
}

// =====================================================
// DIAGRAM — 茂木(top) → 下館(bottom), distance-based
// =====================================================
function svgEl(name,attrs={}){const e=document.createElementNS("http://www.w3.org/2000/svg",name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}

function renderDiagram(){
  const svg=$("#diagram-svg");svg.innerHTML="";
  const trains=effectiveTrains().filter(t=>state.diagramDir==="all"||t.direction===state.diagramDir);

  const maxDist = DATA.stations.at(-1).distance_km; // 41.9 km
  const width=4500, left=82, topPad=38, bottomPad=55;
  const chartHeight = 600;
  const height = chartHeight + topPad + bottomPad;

  svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
  svg.setAttribute("width",width);
  svg.setAttribute("height",height);

  const maxM=1740, minM=300;
  const timeX = m => left + (m - minM) * 3; // 1 minute = 3px for wider diagram

  // Y position based on distance: 茂木(top) → 下館(bottom)
  // 茂木 = distance_km 41.9 → top, 下館 = distance_km 0 → bottom
  const yOf = code => {
    const st = DATA.stations.find(s=>s.code===code);
    if(!st) return topPad;
    const ratio = (maxDist - st.distance_km) / maxDist; // 茂木=0 (top), 下館=1 (bottom)
    return topPad + ratio * chartHeight;
  };

  // Time grid
  for(let m=300;m<=1740;m+=60){
    const x=timeX(m);
    svg.appendChild(svgEl("line",{x1:x,y1:0,x2:x,y2:height,stroke:"var(--svg-grid-line)","stroke-width":m%360===300?1.2:.5}));
    const txt=svgEl("text",{x:x+3,y:20,fill:"var(--svg-grid-text)","font-size":"11"});
    txt.textContent=formatServiceTime(m);svg.appendChild(txt);
  }

  // Station lines (distance-based, 茂木=top, 下館=bottom)
  const stationsReversed = [...DATA.stations].reverse(); // 茂木 first
  stationsReversed.forEach((s, i)=>{
    const isTerminal = i === 0 || i === stationsReversed.length - 1;
    const isExchange = s.can_exchange || isTerminal;
    const y = yOf(s.code);
    svg.appendChild(svgEl("line",{x1:left,y1:y,x2:width,y2:y,stroke:isExchange?"var(--svg-station-line)":"var(--svg-station-line-alt)","stroke-width":isExchange?1.2:.7}));
    const label=svgEl("text",{x:8,y:y+4,fill:isExchange?"var(--svg-station-text)":"var(--svg-station-text-alt)","font-size":"11","font-weight":isExchange?600:400});
    label.textContent=s.name;svg.appendChild(label);
  });

  // Draw train lines
  trains.forEach(t=>{
    // Scheduled line (thin, semi-transparent)
    const pts=[];
    t.stations.forEach(st=>{
      const arrM = timeStringToMinutes(st.arr);
      const depM = timeStringToMinutes(st.dep);
      // Add arrival point
      if(arrM != null) pts.push([timeX(arrM), yOf(st.code)]);
      // Add departure point (if different from arrival → shows dwell time as horizontal line)
      if(depM != null && depM !== arrM) pts.push([timeX(depM), yOf(st.code)]);
    });
    if(pts.length<2)return;

    const schedColor = t.direction==="up" ? "var(--svg-train-up)" : "var(--svg-train-down)";
    const path=svgEl("polyline",{points:pts.map(p=>p.join(",")).join(" "),fill:"none",stroke:schedColor,"stroke-width":1.5,"opacity":.3,"data-train-id":t.train_id});
    path.style.cursor="pointer";path.addEventListener("click",()=>openTrainModal(t));svg.appendChild(path);

    // Actual line (thick, opaque)
    const actPts=[];
    t.actual.filter(s=>!s.is_cancelled).forEach(s=>{
      if(s.arr_actual!=null) actPts.push([timeX(s.arr_actual), yOf(s.code)]);
      if(s.dep_actual!=null && s.dep_actual !== s.arr_actual) actPts.push([timeX(s.dep_actual), yOf(s.code)]);
    });
    if(actPts.length>1){
      const ap=svgEl("polyline",{points:actPts.map(p=>`${p[0]},${p[1]}`).join(" "),fill:"none",stroke:schedColor,"stroke-width":3,"opacity":.9,"data-train-id":t.train_id,"stroke-linecap":"round","stroke-linejoin":"round"});
      ap.style.cursor="pointer";ap.addEventListener("click",()=>openTrainModal(t));svg.appendChild(ap);
    }

    // Train number label at origin and Moka station
    const targetPoints = [];
    if(pts.length > 1) {
      // 1. Origin station
      targetPoints.push({x: pts[0][0], y: pts[0][1], nextX: pts[1][0], nextY: pts[1][1]});
      
      // 2. Moka station (if it's not the origin)
      const mokaCode = DATA.stations.find(s=>s.name==="真岡")?.code;
      if (mokaCode && t.stations[0].code !== mokaCode) {
        const mokaY = yOf(mokaCode);
        const mokaPtIdx = pts.findLastIndex(p => Math.abs(p[1] - mokaY) < 1);
        if (mokaPtIdx !== -1 && mokaPtIdx < pts.length - 1) {
          targetPoints.push({
            x: pts[mokaPtIdx][0], y: pts[mokaPtIdx][1], 
            nextX: pts[mokaPtIdx+1][0], nextY: pts[mokaPtIdx+1][1]
          });
        }
      }
    }

    targetPoints.forEach(tp => {
      const dx = tp.nextX - tp.x;
      const dy = tp.nextY - tp.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      const lab=svgEl("text",{
        fill:"var(--svg-train-text)",
        "font-size":"9",
        "font-weight":"600",
        "data-train-id":t.train_id,
        transform: `translate(${tp.x}, ${tp.y}) rotate(${angle})`,
        dx: "8",
        dy: t.direction === "up" ? "12" : "-4"
      });
      lab.textContent=t.train_no;
      svg.appendChild(lab);
    });
  });

  // Now-time indicator line
  if(state.currentMinutes!=null && state.currentMinutes>=minM && state.currentMinutes<=maxM){
    const nx = timeX(state.currentMinutes);
    svg.appendChild(svgEl("line",{x1:nx,y1:topPad,x2:nx,y2:topPad+chartHeight,stroke:"var(--svg-now-line)","stroke-width":1.5,"stroke-dasharray":"6,3",opacity:.7}));
    const nowLabel = svgEl("text",{x:nx+3,y:topPad-4,fill:"var(--svg-now-line)","font-size":"9","font-weight":"700"});
    nowLabel.textContent = "現在";
    svg.appendChild(nowLabel);
  }

  $("#diagram-scroll").scrollLeft=0;
}

// =====================================================
// TIMETABLE — Vertical trains (columns), stations (rows)
// =====================================================
function renderTimetable(){
  const trains=effectiveTrains().filter(t=>t.direction===state.timetableDir);

  // Sort trains by first departure time
  trains.sort((a,b)=>{
    const aFirst = a.stations.find(s=>s.dep)?.dep || "99:99";
    const bFirst = b.stations.find(s=>s.dep)?.dep || "99:99";
    return timeStringToMinutes(aFirst) - timeStringToMinutes(bFirst);
  });

  const th=$("#timetable-table thead"), tb=$("#timetable-table tbody");
  th.innerHTML=""; tb.innerHTML="";

  // Station order: 上り → 茂木(top)→下館(bottom), 下り → 下館(top)→茂木(bottom)
  let orderedStations;
  if(state.timetableDir === "up"){
    orderedStations = [...DATA.stations].reverse(); // 茂木→下館
  } else {
    orderedStations = [...DATA.stations]; // 下館→茂木
  }

  // Header rows
  // Row 1: 列車番号
  const trainNoRow = document.createElement("tr");
  trainNoRow.className = "tt-header-row tt-trainno";
  trainNoRow.innerHTML = `<th>列車番号</th>` + trains.map(t=>`<th>${t.train_no}</th>`).join("");
  th.appendChild(trainNoRow);

  // Row 2: 行先
  const destRow = document.createElement("tr");
  destRow.className = "tt-header-row tt-dest";
  destRow.innerHTML = `<th>行先</th>` + trains.map(t=>`<th>${t.destination}</th>`).join("");
  th.appendChild(destRow);

  // Body: each station is a row, each train is a column
  orderedStations.forEach(s=>{
    const tr = document.createElement("tr");
    // Station name cell
    const stCell = document.createElement("td");
    stCell.innerHTML = `<strong>${s.name}</strong>`;
    tr.appendChild(stCell);

    trains.forEach(t=>{
      const st = t.stations.find(x=>x.code===s.code);
      const actual = t.actual.find(x=>x.code===s.code);
      const td = document.createElement("td");

      if(!st){
        // This train doesn't serve this station at all
        td.innerHTML = `<span class="tt-nonstop">‖</span>`;
      } else if(actual?.is_cancelled){
        td.innerHTML = `<span class="tt-cancel">運休</span>`;
      } else {
        const a = st.arr;
        const d = st.dep;

        if(a===null && d===null){
          td.innerHTML = `<span class="tt-nonstop">‖</span>`;
        } else if(a===null && d!==null){
          // Origin station — only departure
          td.innerHTML = `<span class="tt-dep">${d}発</span>`;
        } else if(a!==null && d===null){
          // Terminal station — only arrival
          td.innerHTML = `<span class="tt-arr">${a}着</span>`;
        } else if(a===d){
          // Pass-through (same arr/dep) → レ
          td.innerHTML = `<span class="tt-pass">レ</span>`;
        } else {
          // Normal stop — show arrival and departure
          td.innerHTML = `<span class="tt-arr">${a}着</span><span class="tt-dep">${d}発</span>`;
        }
      }

      td.style.cursor = "pointer";
      td.addEventListener("click",()=>openTrainModal(t));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

function openTrainModal(t){
  const stateText={RUNNING:"駅間走行中",STOPPED:"駅停車中",ARRIVED:"終着駅到着",OUT_OF_SERVICE:"運転時間外"}[t.result.state];
  const formation=DATA.status.operations[t.operation_id]?.formation||[];
  $("#modal-body").innerHTML=`
    <span class="modal-kicker">TRAIN DETAIL / ${t.train_id}</span>
    <h3 class="modal-title">${t.train_no}</h3>
    <div class="modal-badges"><span class="badge ${t.direction==="up"?"blue":""}">${t.direction==="up"?"上り":"下り"}</span><span class="badge">${t.destination}行</span><span class="badge ${t.result.state==="STOPPED"?"orange":""}">${stateText}</span>${t.override.status==="partially_cancelled"?'<span class="badge red">区間運休</span>':""}</div>
    <div class="detail-grid"><div class="detail-cell"><small>運用番号</small><strong>${t.operation_id}</strong></div><div class="detail-cell"><small>遅延</small><strong>${t.override.delay_minutes||0}分</strong></div></div>
    ${formation.length?`<div class="formation"><h4>編成</h4><div class="formation-list">${formation.map(x=>`<span>${x}</span>`).join("")}</div></div>`:""}
    ${t.override.memo?`<div class="memo">${t.override.memo}</div>`:""}
    <div class="station-detail"><h4>停車駅・実効時刻</h4>${t.actual.map(s=>`<div class="stop-row ${s.is_cancelled?"cancel":""}"><span>${DATA.stations.find(x=>x.code===s.code)?.name||s.code}</span><span>${s.arr_actual!=null?formatServiceTime(s.arr_actual):"—"}</span><span>${s.dep_actual!=null?formatServiceTime(s.dep_actual):"—"}</span></div>`).join("")}</div>`;
  $("#train-modal").classList.remove("hidden");
}

function updateClock(){
  if(!state.liveClock)return;
  const ctx=normalizeToServiceContext(new Date());
  const minutesChanged = state.currentMinutes !== ctx.service_minutes;
  state.currentMinutes=ctx.service_date===state.serviceDate?ctx.service_minutes:state.currentMinutes;
  $("#clock").textContent=new Date().toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour12:false});
  $("#service-date-label").textContent=serviceDateLabel(state.serviceDate);
  $("#date-title").textContent=serviceDateLabel(state.serviceDate);
  if(minutesChanged) renderPosition();
}

async function loadData(){
  try{
    const [s,t,st]=await Promise.all([
      fetch("data/stations.json").then(r=>r.json()),
      fetch("data/timetable.json").then(r=>r.json()),
      fetch(CONFIG.GAS_API_URL).then(r=>{
        if(!r.ok) throw new Error("GAS API HTTP " + r.status);
        return r.json();
      })
    ]);

    if(!Array.isArray(s)||!Array.isArray(t)||!validateStatus(st))
      throw new Error("schema");

    DATA.stations=s;
    DATA.timetable=t;
    DATA.status=st;

  }catch(e){
    console.error(e);
    $("#offline-banner").classList.remove("hidden");

    // Try loading local data at minimum
    try {
      if(!DATA.stations.length){
        const s = await fetch("data/stations.json").then(r=>r.json());
        if(Array.isArray(s)) DATA.stations = s;
      }
      if(!DATA.timetable.length){
        const t = await fetch("data/timetable.json").then(r=>r.json());
        if(Array.isArray(t)) DATA.timetable = t;
      }
    } catch(e2){ console.error(e2); }

    if(!DATA.stations.length) DATA.stations = STATIONS_FALLBACK;

    DATA.status={
      service_date:state.serviceDate,
      official_info:{
        status_code:"unknown",
        text:"公式運行情報を取得できませんでした",
        link_url:"",
        has_detail:false,
        fetched_at:null
      },
      operations:{},
      train_overrides:{}
    };
  }

  // Initialize current time automatically
  const ctx = normalizeToServiceContext(new Date());
  state.serviceDate = ctx.service_date;
  state.currentMinutes = ctx.service_minutes;
  state.liveClock = true;
  $("#date-input").value = state.serviceDate;

  renderNotice();
  renderAll();
}

function renderAll(){renderPosition();renderDiagram();renderTimetable()}
$$(".view-tab,.tab-btn").forEach(b=>b.addEventListener("click",(e)=>{
  if (window._isDraggingForClick) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  setView(b.dataset.view);
}));
function setView(v){
  state.view=v;
  $$(".view-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  $$(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  $$(".view-panel").forEach(p=>p.classList.toggle("active",p.id==="view-"+v));
  
  const activeBtn = document.querySelector(`.floating-tab-bar .tab-btn[data-view="${v}"]`);
  if(activeBtn) {
    const glider = document.getElementById("tab-glider");
    if(glider) {
      glider.style.width = activeBtn.offsetWidth + "px";
      glider.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
    }
  }

  if(v==="position")renderPosition();
  if(v==="diagram")renderDiagram();
  if(v==="timetable")renderTimetable();
}
$("#date-input").addEventListener("change",e=>{state.serviceDate=e.target.value;state.liveClock=false;const date=new Date(`${state.serviceDate}T12:00:00+09:00`);state.currentMinutes=date.getHours()*60+date.getMinutes();renderNotice();renderAll()});
$("#now-btn").addEventListener("click",()=>{state.liveClock=true;const c=normalizeToServiceContext(new Date());state.serviceDate=c.service_date;state.currentMinutes=c.service_minutes;$("#date-input").value=state.serviceDate;renderAll()});
$$(".seg-btn").forEach(b=>b.addEventListener("click",()=>{const d=b.dataset.dir;if(b.classList.contains("tt-dir")){state.timetableDir=d;$$(".tt-dir").forEach(x=>x.classList.toggle("active",x===b));renderTimetable()}else{state.diagramDir=d;$$(".diagram-tools .seg-btn:not(.tt-dir)").forEach(x=>x.classList.toggle("active",x===b));renderDiagram()}}));
$("#modal-close").onclick=()=>$("#train-modal").classList.add("hidden");$("#train-modal").addEventListener("click",e=>{if(e.target.id==="train-modal")$("#train-modal").classList.add("hidden")});

const STATIONS_FALLBACK = [];

setInterval(updateClock, 1000);

// 初期状態：まだGASから取得していない
renderNotice();

loadData();

// Init glider correctly on load
window.addEventListener("load", () => setView(state.view || "position"));

// Tab Bar Drag Logic
const tabBar = document.querySelector('.floating-tab-bar');
const glider = document.getElementById('tab-glider');
const tabs = Array.from(document.querySelectorAll('.floating-tab-bar .tab-btn'));

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