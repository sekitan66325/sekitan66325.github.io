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

function renderNotice(){
  const n = DATA.status?.official_info || {};

  const box = $("#notice");
  const title = $("#notice-title");
  const updated = $("#notice-updated");
  const link = $("#notice-link");

  const statusCode = n.status_code || "unknown";

  box.className =
    "notice-section " +
    (
      statusCode === "delay"
        ? "status-delay"
        : statusCode === "unknown"
          ? "status-unknown"
          : "status-normal"
    );

  $("#notice-icon").textContent =
    statusCode === "delay"
      ? "!"
      : statusCode === "unknown"
        ? "?"
        : "✓";

  /*
   * GASから取得した公式文言をそのまま表示する
   */
  if (statusCode === "unknown") {
    title.textContent =
      "公式運行情報を取得できませんでした（サイトをご確認ください）";
  } else {
    title.textContent = n.text || "公式運行情報を取得できませんでした";
  }

  /*
   * GASが最後に公式HPを取得した時刻
   */
  updated.textContent =
    `取得: ${
      n.fetched_at
        ? new Date(n.fetched_at).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
            hour12: false
          })
        : "—"
    }`;

  /*
   * 詳細ページへのリンク
   */
  if (n.link_url) {
    link.href = n.link_url;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }
}

function renderStations(){
  const host=$("#station-list");host.innerHTML="";
  const max=DATA.stations.at(-1).distance_km;
  DATA.stations.forEach((s,i)=>{
    const el=document.createElement("div");el.className="station-marker"+(s.can_exchange?" exchange":"");
    const y=2+(s.distance_km/max)*96;
    el.style.top=y+"%";
    el.innerHTML=`<span class="station-dot"></span><span class="station-name">${s.name}</span><span class="station-km">${s.distance_km.toFixed(1)} km</span>`;
    host.appendChild(el);
  });
}

function renderPosition(){
  const host=$("#position-trains");host.innerHTML="";
  const trains=effectiveTrains();
  const groups={};
  trains.filter(t=>t.position).forEach(t=>{
    const key=t.position.station+":"+Math.round(t.position.progress*10)/10;
    (groups[key]??=[]).push(t);
  });
  const lanes=new Map();
  for(const group of Object.values(groups))group.forEach((t,i)=>lanes.set(t.train_id,i));
  const max=DATA.stations.at(-1).distance_km;
  trains.filter(t=>t.position).forEach(t=>{
    const base=DATA.stations[t.position.station], next=DATA.stations[Math.min(DATA.stations.length-1,t.position.station+1)];
    const dist=base.distance_km+(next.distance_km-base.distance_km)*t.position.progress;
    const y=2+(dist/max)*96;
    const lane=lanes.get(t.train_id)||0;
    const xOffset=(t.direction==="up"?-1:1)*(45+lane*54);
    const el=document.createElement("div");el.className=`train-marker ${t.direction} ${t.result.state.toLowerCase()}`;
    el.style.left=`calc(50% + ${xOffset}px)`;el.style.top=y+"%";
    const status=t.result.state==="RUNNING"?"走行中":t.result.state==="STOPPED"?"停車中":"到着";
    el.innerHTML=`<span class="train-point"></span><span class="train-chip">${t.train_no} ${status}</span>`;
    el.title=`${t.train_no} ${status}`;el.onclick=()=>openTrainModal(t);host.appendChild(el);
  });
  const running=trains.filter(t=>t.result.state==="RUNNING").length,stopped=trains.filter(t=>t.result.state==="STOPPED").length,arrived=trains.filter(t=>t.result.state==="ARRIVED").length;
  $("#summary-grid").innerHTML=`<div class="summary-card"><span>運転中</span><strong>${running}本</strong></div><div class="summary-card"><span>駅停車中</span><strong>${stopped}本</strong></div><div class="summary-card"><span>到着保持</span><strong>${arrived}本</strong></div>`;
  $("#position-current-time").textContent=formatServiceTime(state.currentMinutes);
}

function svgEl(name,attrs={}){const e=document.createElementNS("http://www.w3.org/2000/svg",name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}

function renderDiagram(){
  const svg=$("#diagram-svg");svg.innerHTML="";
  const trains=effectiveTrains().filter(t=>state.diagramDir==="all"||t.direction===state.diagramDir);
  const width=2900,left=82,top=38,rowH=31,height=DATA.stations.length*rowH+top+55;
  svg.setAttribute("viewBox",`0 0 ${width} ${height}`);svg.setAttribute("width",width);svg.setAttribute("height",height);
  const maxM=1740,minM=300,timeX=m=>left+(m-minM)*2;
  // background grid
  for(let m=300;m<=1740;m+=60){
    const x=timeX(m);svg.appendChild(svgEl("line",{x1:x,y1:0,x2:x,y2:height,stroke:"#2c2c2e","stroke-width":m%360===300?1.2:.7}));
    const txt=svgEl("text",{x:x+3,y:20,fill:"#777", "font-size":"11"});txt.textContent=formatServiceTime(m);svg.appendChild(txt);
  }
  DATA.stations.forEach((s,i)=>{
    const y=top+i*rowH;
    svg.appendChild(svgEl("line",{x1:left,y1:y,x2:width,y2:y,stroke:s.can_exchange?"#4b4b4f":"#2b2b2d","stroke-width":s.can_exchange?1.2:.7}));
    const label=svgEl("text",{x:8,y:y+4,fill:s.can_exchange?"#f5f5f7":"#999","font-size":"11","font-weight":s.can_exchange?600:400});label.textContent=s.name;svg.appendChild(label);
    const km=svgEl("text",{x:left-8,y:y+4,fill:"#666","font-size":"8","text-anchor":"end"});km.textContent=s.distance_km.toFixed(1);svg.appendChild(km);
  });
  const yOf=code=>top+stationPos(code)*rowH;
  trains.forEach(t=>{
    const pts=[];
    t.stations.forEach(st=>{if(st.dep)pts.push([timeX(timeStringToMinutes(st.dep)),yOf(st.code)]);else if(st.arr)pts.push([timeX(timeStringToMinutes(st.arr)),yOf(st.code)])});
    if(pts.length<2)return;
    const path=svgEl("polyline",{points:pts.map(p=>p.join(",")).join(" "),fill:"none",stroke:t.direction==="up"?"#2997ff":"#bf5af2","stroke-width":2,"opacity":.34,"data-train-id":t.train_id});
    path.style.cursor="pointer";path.addEventListener("click",()=>openTrainModal(t));svg.appendChild(path);
    const act=t.actual.filter(s=>!s.is_cancelled).map(s=>[s.dep_actual??s.arr_actual,yOf(s.code)]).filter(p=>p[0]!=null);
    if(act.length>1){
      const ap=svgEl("polyline",{points:act.map(p=>`${timeX(p[0])},${p[1]}`).join(" "),fill:"none",stroke:t.direction==="up"?"#2997ff":"#bf5af2","stroke-width":4,"opacity":.95,"data-train-id":t.train_id,"stroke-linecap":"round"});
      ap.style.cursor="pointer";ap.addEventListener("click",()=>openTrainModal(t));svg.appendChild(ap);
    }
    const first=pts[0],lab=svgEl("text",{x:first[0]+5,y:first[1]-4,fill:"#ddd","font-size":"9","data-train-id":t.train_id});lab.textContent=t.train_no;svg.appendChild(lab);
  });
  $("#diagram-scroll").scrollLeft=0;
}

function renderTimetable(){
  const trains=effectiveTrains().filter(t=>t.direction===state.timetableDir);
  const th=$("#timetable-table thead"),tb=$("#timetable-table tbody");th.innerHTML="";tb.innerHTML="";
  th.innerHTML=`<tr><th>列車</th>${DATA.stations.map(s=>`<th>${s.name}</th>`).join("")}</tr>`;
  trains.forEach(t=>{
    const trEl=document.createElement("tr");
    trEl.innerHTML=`<td class="train-no ${t.direction==="up"?"up-color":"down-color"}">${t.train_no}<br><small>${t.destination}</small></td>`;
    DATA.stations.forEach(s=>{
      const st=t.stations.find(x=>x.code===s.code);const actual=t.actual.find(x=>x.code===s.code);
      const td=document.createElement("td");
      if(!st){td.textContent="—";td.style.color="#555"}
      else if(actual?.is_cancelled){td.innerHTML=`<span class="cancel">運休</span>`}
      else {const a=st.arr,d=st.dep;td.innerHTML=a&&d&&a!==d?`${a}<br>${d}`:(d||a||"—")}
      trEl.appendChild(td);
    });
    trEl.addEventListener("click",()=>openTrainModal(t));tb.appendChild(trEl);
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
  state.currentMinutes=ctx.service_date===state.serviceDate?ctx.service_minutes:state.currentMinutes;
  $("#clock").textContent=new Date().toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour12:false});
  $("#service-date-label").textContent=serviceDateLabel(state.serviceDate);
  $("#date-title").textContent=serviceDateLabel(state.serviceDate);
  renderPosition();
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

    DATA.stations=STATIONS_FALLBACK;
    DATA.timetable=[];
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

  renderNotice();
  renderStations();
  renderAll();
}

function renderAll(){renderPosition();renderDiagram();renderTimetable()}
$$(".view-tab,.tab-btn").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
function setView(v){state.view=v;$$(".view-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===v));$$(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));$$(".view-panel").forEach(p=>p.classList.toggle("active",p.id==="view-"+v));if(v==="diagram")renderDiagram();if(v==="timetable")renderTimetable()}
$("#date-input").addEventListener("change",e=>{state.serviceDate=e.target.value;state.liveClock=false;const date=new Date(`${state.serviceDate}T12:00:00+09:00`);state.currentMinutes=date.getHours()*60+date.getMinutes();renderNotice();renderAll()});
$("#now-btn").addEventListener("click",()=>{state.liveClock=true;const c=normalizeToServiceContext(new Date());state.serviceDate=c.service_date;state.currentMinutes=c.service_minutes;$("#date-input").value=state.serviceDate;renderAll()});
$$(".seg-btn").forEach(b=>b.addEventListener("click",()=>{const d=b.dataset.dir;if(b.classList.contains("tt-dir")){state.timetableDir=d;$$(".tt-dir").forEach(x=>x.classList.toggle("active",x===b));renderTimetable()}else{state.diagramDir=d;$$(".diagram-tools .seg-btn:not(.tt-dir)").forEach(x=>x.classList.toggle("active",x===b));renderDiagram()}}));
$("#modal-close").onclick=()=>$("#train-modal").classList.add("hidden");$("#train-modal").addEventListener("click",e=>{if(e.target.id==="train-modal")$("#train-modal").classList.add("hidden")});
const STATIONS_FALLBACK = [];
setInterval(updateClock,1000);
loadData();
