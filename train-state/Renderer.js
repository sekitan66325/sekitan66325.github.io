/**
 * 真岡線 UI描画 & イベント制御
 * (Renderer.js)
 */

class MokaRenderer {
  constructor(stations) {
    this.stations = stations;
    this.stationsMap = Object.fromEntries(stations.map(s => [s.code, s]));
  }

  /**
   * 1. 公式運行情報バナーの描画更新
   */
  renderOfficialNotice(officialInfo) {
    const banner = document.getElementById('officialNoticeBanner');
    if (!banner) return;

    banner.className = 'banner';
    
    if (officialInfo.status_code === 'normal') {
      banner.innerHTML = `<span>🟢 公式: ${officialInfo.text}</span>`;
      banner.removeAttribute('href');
      banner.style.cursor = 'default';
    } else if (officialInfo.status_code === 'delay') {
      banner.classList.add('delay');
      banner.innerHTML = `<span>⚠️ ${officialInfo.text} ↗</span>`;
      if (officialInfo.link_url) {
        banner.href = officialInfo.link_url;
        banner.target = '_blank';
        banner.rel = 'noopener';
        banner.style.cursor = 'pointer';
      }
    } else {
      banner.innerHTML = `<span>⚠️ ${officialInfo.text} ↗</span>`;
      banner.href = "https://www.moka-railway.co.jp/";
      banner.target = '_blank';
      banner.style.cursor = 'pointer';
    }
  }

  /**
   * 2. 列車走行位置ビューの描画 (動的レーンオフセット付)
   */
  renderLivePositionView(trainStates) {
    const container = document.getElementById('liveTrackView');
    if (!container) return;

    // 既存の列車マーカーのみ削除
    const existingMarkers = container.querySelectorAll('.train-marker');
    existingMarkers.forEach(m => m.remove());

    // 進行方向・駅・駅間ごとに列車をグループ化してレーン重複防止
    const activeTrains = trainStates.filter(t => t.is_operating && t.state_info.state !== 'OUT_OF_SERVICE');
    const groupLanes = {};

    activeTrains.forEach(train => {
      const state = train.state_info;
      let groupKey = "";

      if (state.state === 'STOPPED' || state.state === 'ARRIVED') {
        groupKey = `STATION_${state.station_code}`;
      } else if (state.state === 'RUNNING') {
        groupKey = `SEGMENT_${state.from_station}_${state.to_station}`;
      }

      if (!groupLanes[groupKey]) groupLanes[groupKey] = { up: 0, down: 0 };
      
      const laneIndex = groupLanes[groupKey][train.direction]++;
      
      // Y位置 (ピクセル/パーセント) の算出
      const yPosition = this.calculateYPosition(state);
      
      // Xオフセット (上りは左側、下りは右側にずらす)
      const xOffset = train.direction === 'up' 
        ? -1 * (32 + laneIndex * 28) 
        : 1 * (32 + laneIndex * 28);

      // マーカーDOM要素の作成
      const marker = document.createElement('div');
      marker.className = `train-marker ${train.direction}`;
      if (train.actual_stations.some(s => s.delay_minutes > 0)) {
        marker.classList.add('delayed');
      }

      marker.style.top = `${yPosition}px`;
      marker.style.left = `calc(50% + ${xOffset}px)`;
      marker.innerText = `${train.train_no} ${train.destination}行`;
      marker.dataset.trainId = train.train_id;

      marker.addEventListener('click', () => showTrainModal(train));
      container.appendChild(marker);
    });
  }

  /**
   * 駅・駅間 Y座標位置計算ヘルパー
   */
  calculateYPosition(stateInfo) {
    const ROW_HEIGHT = 60; // 1駅あたりの縦幅(px)

    if (stateInfo.state === 'STOPPED' || stateInfo.state === 'ARRIVED') {
      const st = this.stationsMap[stateInfo.station_code];
      return (st.order - 1) * ROW_HEIGHT + 30;
    }

    if (stateInfo.state === 'RUNNING') {
      const fromSt = this.stationsMap[stateInfo.from_station];
      const toSt = this.stationsMap[stateInfo.to_station];
      
      const startY = (fromSt.order - 1) * ROW_HEIGHT + 30;
      const endY = (toSt.order - 1) * ROW_HEIGHT + 30;

      return startY + (endY - startY) * stateInfo.progress;
    }

    return 0;
  }

  /**
   * 3. SVGダイヤグラムの描画
   */
  renderDiagramSVG(timetable, todayStatus) {
    const svg = document.getElementById('diagramSvg');
    if (!svg) return;

    const width = 2880; // 1分 = 2px (05:00〜29:00 = 1440分 = 2880px)
    const height = (this.stations.length - 1) * 40 + 40;
    
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    let html = '';

    // 駅罫線
    this.stations.forEach((st, idx) => {
      const y = idx * 40 + 20;
      html += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#38383a" stroke-width="0.5" />`;
      html += `<text x="5" y="${y - 4}" fill="#86868b" font-size="10">${st.name}</text>`;
    });

    // 列車スジ (SVG Polyline)
    timetable.forEach(train => {
      const override = todayStatus.train_overrides?.[train.train_id];
      const actualStations = calculateActualTimetable(train, override);
      
      let points = [];
      actualStations.forEach(st => {
        if (st.is_cancelled) return;
        
        const stationObj = this.stationsMap[st.code];
        const y = (stationObj.order - 1) * 40 + 20;

        if (st.arr_actual !== null) {
          const xArr = (st.arr_actual - 300) * 2;
          points.push(`${xArr},${y}`);
        }
        if (st.dep_actual !== null) {
          const xDep = (st.dep_actual - 300) * 2;
          points.push(`${xDep},${y}`);
        }
      });

      if (points.length > 1) {
        const strokeColor = train.direction === 'up' ? '#30d158' : '#2997ff';
        html += `<polyline points="${points.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="1.5" data-train-id="${train.train_id}" style="cursor:pointer;" />`;
      }
    });

    svg.innerHTML = html;

    // イベントデリゲーション (クリックで詳細表示)
    svg.onclick = (e) => {
      const trainId = e.target.dataset.trainId;
      if (trainId) {
        const train = timetable.find(t => t.train_id === trainId);
        if (train) showTrainModal({ ...train, actual_stations: calculateActualTimetable(train, todayStatus.train_overrides?.[trainId]) });
      }
    };
  }
}
