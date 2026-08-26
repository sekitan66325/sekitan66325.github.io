const GAS_URL = typeof CONFIG !== 'undefined' ? CONFIG.GAS_API_URL : '';

let adminToken = sessionStorage.getItem('admin_token') || '';
let allAdminPosts = [];
let allAdminLogs = [];

window.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    showDashboard();
  }
});

/**
 * 1. ログイン処理
 */
async function handleLogin(e) {
  e.preventDefault();
  const id = document.getElementById('login-id').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const btn = document.getElementById('login-submit-btn');

  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_login', admin_id: id, password: pass })
    });
    const data = await res.json();

    if (data.status === 'success') {
      adminToken = data.token;
      sessionStorage.setItem('admin_token', adminToken);

      if (data.must_change_password) {
        document.getElementById('password-modal').style.display = 'flex';
      } else {
        showDashboard();
      }
    } else {
      alert('ログイン失敗: ' + (data.message || 'IDまたはパスワードが違います'));
    }
  } catch (err) {
    console.error(err);
    alert('通信エラーが発生しました。');
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

/**
 * 2. 初回パスワード変更処理
 */
async function handleChangePassword(e) {
  e.preventDefault();
  const newPass = document.getElementById('new-password').value.trim();
  const btn = e.target.querySelector('button[type="submit"]') || e.submitter;

  if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_change_password', token: adminToken, new_password: newPass })
    });
    const data = await res.json();

    if (data.status === 'success') {
      alert('パスワードを変更しました！');
      document.getElementById('password-modal').style.display = 'none';
      showDashboard();
    } else {
      alert('変更失敗: ' + data.message);
    }
  } catch (err) {
    alert('通信エラーが発生しました。');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
  }
}

/**
 * 3. ログアウト処理
 */
async function handleLogout() {
  if (!confirm('ログアウトしますか？')) return;
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_logout', token: adminToken })
    });
  } catch (e) {}

  adminToken = '';
  sessionStorage.removeItem('admin_token');
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

/**
 * ダッシュボード表示切り替え
 */
function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';
  fetchAdminPosts();
}

/**
 * タブ切り替え
 */
function switchAdminTab(tab) {
  const views = ['posts', 'logs', 'trains', 'operations'];
  views.forEach(v => {
    const el = document.getElementById('panel-' + v);
    if(el) {
      el.style.display = '';
      el.classList.toggle('show', tab === v);
    }
    const btn = document.getElementById('tab-btn-' + v);
    if(btn) btn.classList.toggle('active', tab === v);
  });
  if (tab === 'operations') {
    renderOperationsView();
  } else if (tab === 'trains') {
    renderTrainList();
    if (timetableData.length === 0) loadTimetableFromRepo(true);
  } else if (tab === 'logs') {
    fetchAdminLogs();
  }
}

/**
 * 4. 全投稿取得
 */
async function fetchAdminPosts() {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_get_posts', token: adminToken })
    });
    const data = await res.json();

    if (data.status === 'unauthorized') {
      alert('セッションが切れました。再度ログインしてください。');
      handleLogout();
      return;
    }

    allAdminPosts = data;
    renderAdminPosts();
  } catch (err) {
    console.error(err);
  }
}

/**
 * 投稿一覧描画
 */
function renderAdminPosts() {
  const list = document.getElementById('admin-post-list');
  const query = document.getElementById('admin-search').value.trim().toLowerCase();

  const filtered = allAdminPosts.filter(p => {
    if (!query) return true;
    const name = String(p.name || '').toLowerCase();
    const msg = String(p.message || '').toLowerCase();
    const id = String(p.id || '').toLowerCase();
    return name.includes(query) || msg.includes(query) || id.includes(query);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<li style="text-align: center; color: var(--text-secondary); padding: 20px;">該当する投稿はありません。</li>';
    return;
  }

  // onclickにはIDのみを渡し、改行によるJS構文エラーを回避
  list.innerHTML = filtered.map(p => `
    <li class="board-post-card" style="position: relative;">
      <div class="post-header">
        <div>
          <span class="post-author">${escapeHTML(p.name)}</span>
          <span class="admin-badge ${p.is_hidden ? 'badge-hidden' : 'badge-visible'}" style="margin-left: 8px;">
            ${p.is_hidden ? '非表示中' : '公開中'}
          </span>
        </div>
        <span class="post-time">${p.timestamp}</span>
      </div>
      <div class="post-body">${escapeHTML(p.message).replace(/\n/g, '<br>')}</div>
      <div class="admin-actions">
        <button class="btn-admin" onclick="openAdminEditModal('${p.id}')">直接編集</button>
        ${p.is_hidden 
          ? `<button class="btn-admin btn-success" onclick="toggleHidePost('${p.id}', false)">復元する</button>`
          : `<button class="btn-admin btn-danger" onclick="toggleHidePost('${p.id}', true)">非表示にする</button>`
        }
      </div>
    </li>
  `).join('');
}

/**
 * 5. 非表示/復元切り替え
 */
async function toggleHidePost(id, toHide) {
  const action = toHide ? 'admin_delete' : 'admin_restore';
  // Find the clicked button — fallback to body event target not possible here, so select by id
  const btns = document.querySelectorAll(`button[onclick*="'${id}'"]`);
  btns.forEach(b => { b.disabled = true; b.classList.add('btn-loading'); });
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: adminToken, id: id })
    });
    const data = await res.json();
    if (data.status === 'success') {
      fetchAdminPosts();
    } else {
      alert('操作失敗: ' + data.message);
    }
  } catch (err) {
    alert('通信エラーが発生しました。');
  } finally {
    btns.forEach(b => { b.disabled = false; b.classList.remove('btn-loading'); });
  }
}

/**
 * 6. 管理者直接編集モーダル表示
 */
function openAdminEditModal(id) {
  const target = allAdminPosts.find(p => String(p.id) === String(id));
  if (!target) {
    alert('対象の投稿が見つかりませんでした。');
    return;
  }

  document.getElementById('admin-edit-id').value = id;
  document.getElementById('admin-edit-message').value = target.message || '';
  document.getElementById('admin-edit-modal').style.display = 'flex';
}

function closeAdminEditModal() {
  document.getElementById('admin-edit-modal').style.display = 'none';
}

async function submitAdminEdit() {
  const id = document.getElementById('admin-edit-id').value;
  const msg = document.getElementById('admin-edit-message').value.trim();
  const btn = document.querySelector('#admin-edit-modal button[onclick="submitAdminEdit()"]');

  if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_edit', token: adminToken, id: id, message: msg })
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeAdminEditModal();
      fetchAdminPosts();
    } else {
      alert('更新失敗: ' + data.message);
    }
  } catch (err) {
    alert('通信エラーが発生しました。');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
  }
}

/**
 * 7. 操作ログ取得
 */
async function fetchAdminLogs() {
  const list = document.getElementById('admin-log-list');
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_get_log', token: adminToken })
    });
    const data = await res.json();

    if (data.length === 0) {
      list.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">ログはありません。</div>';
      return;
    }

    list.innerHTML = data.map(l => `
      <div class="log-card">
        <div class="log-header">
          <span><strong>${escapeHTML(l.action)}</strong> (${escapeHTML(l.actor)})</span>
          <span>${l.timestamp}</span>
        </div>
        <div>対象ID: <span style="font-family: monospace;">${escapeHTML(l.post_id)}</span></div>
        ${l.memo ? `<div style="color: var(--text-secondary); font-size: 0.75rem;">メモ: ${escapeHTML(l.memo)}</div>` : ''}
        <div class="log-change"><strong>変更前:</strong> ${escapeHTML(l.before)}<br><strong>変更後:</strong> ${escapeHTML(l.after)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ==========================================
// 運行データ (timetable.json) 管理
// ==========================================
let timetableData = [];
let stationsData = [];
let currentTrainId = null;

async function loadTimetableFromRepo() {
  try {
    const [stRes, ttRes] = await Promise.all([
      fetch('../train-state/data/stations.json'),
      fetch('../train-state/data/timetable.json')
    ]);
    if (!stRes.ok || !ttRes.ok) throw new Error('Failed to fetch data from repo');
    stationsData = await stRes.json();
    timetableData = await ttRes.json();
    alert('リポジトリからデータを読み込みました。');
    renderTrainList();
  } catch (err) {
    alert('読込エラー: ' + err.message);
  }
}

function handleTimetableUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      timetableData = JSON.parse(e.target.result);
      if (stationsData.length === 0) {
        const stRes = await fetch('../train-state/data/stations.json');
        if (stRes.ok) stationsData = await stRes.json();
      }
      alert('ファイルからデータを読み込みました。');
      renderTrainList();
    } catch (err) {
      alert('JSONのパースに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function renderTrainList() {
  const list = document.getElementById('train-list');
  const query = document.getElementById('train-search').value.trim().toLowerCase();
  document.getElementById('train-editor-container').style.display = 'none';
  currentTrainId = null;

  if (timetableData.length === 0) {
    list.innerHTML = '<li style="color: var(--text-secondary); text-align: center;">データがありません</li>';
    return;
  }

  const filtered = timetableData.filter(t => {
    if (!query) return true;
    return (t.train_id && t.train_id.toLowerCase().includes(query)) ||
           (t.train_no && t.train_no.toLowerCase().includes(query)) ||
           (t.operation_id && t.operation_id.toLowerCase().includes(query));
  });

  list.innerHTML = filtered.map(t => {
    return `<li style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; cursor: pointer;" onclick="editTrain('${t.train_id}')">
      <div style="font-weight: bold; font-size: 1.1rem; color: var(--text-primary);">${t.train_no} (${t.train_id})</div>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
        運用: ${t.operation_id} | ${t.direction === 'up' ? '上り' : '下り'} | 行先: ${t.destination}
      </div>
    </li>`;
  }).join('');
}

function getStationName(code) {
  const s = stationsData.find(x => x.code === code);
  return s ? s.name : code;
}


function editTrain(trainId) {
  const t = timetableData.find(x => x.train_id === trainId);
  if (!t) return;
  currentTrainId = trainId;

  const container = document.getElementById('train-editor-container');
  
  const daysOff = t.operation_rule.days_off || [];
  const daysMap = { 0:"日", 1:"月", 2:"火", 3:"水", 4:"木", 5:"金", 6:"土" };
  
  const datesRunStr = (t.operation_rule.dates_run || []).join(',');
  const datesOffStr = (t.operation_rule.dates_off || []).join(',');

  const partialCancellations = t.partial_cancellations || [];

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; position: sticky; top: 100px; z-index: 10; background: var(--bg-card); padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
      <h3 style="margin:0;">列車編集: ${t.train_no} (${t.train_id})</h3>
      <button class="btn-admin btn-success" onclick="saveTrainData()">変更を適用 (メモリ上)</button>
    </div>
    <div class="train-editor-grid" style="margin-top: 16px;">
      <div class="form-group">
        <label class="form-label">列車番号 (train_no)</label>
        <input type="text" id="edit-train-no" class="form-input" value="${t.train_no || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">運用番号 (operation_id)</label>
        ${t.operation_dict ? '<div style="font-size:0.8rem; color:#ff9500; margin-bottom:4px;">※曜日別運用が設定されています。変更は「運用ベース管理」タブで行うか、下記を直接編集して上書きしてください。</div>' : ''}
        <input type="text" id="edit-op-id" class="form-input" value="${t.operation_id || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">方向 (direction)</label>
        <select id="edit-dir" class="form-input">
          <option value="down" ${t.direction === 'down' ? 'selected' : ''}>下り (down)</option>
          <option value="up" ${t.direction === 'up' ? 'selected' : ''}>上り (up)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">行先 (destination)</label>
        <input type="text" id="edit-dest" class="form-input" value="${t.destination || ''}">
      </div>
    </div>
    
    <h4 style="margin-top: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">運行ルール (operation_rule)</h4>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;">
      <div class="form-group">
        <label class="form-label">種別 (service_type)</label>
        <select id="edit-svc-type" class="form-input">
          <option value="regular" ${t.operation_rule.service_type === 'regular' ? 'selected' : ''}>普通 (regular)</option>
          <option value="extra" ${t.operation_rule.service_type === 'extra' ? 'selected' : ''}>臨時 (extra)</option>
          <option value="sl" ${t.operation_rule.service_type === 'sl' ? 'selected' : ''}>SL (sl)</option>
          <option value="deadhead" ${t.operation_rule.service_type === 'deadhead' ? 'selected' : ''}>回送 (deadhead)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">運転曜日 (days_on)</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
          ${[1,2,3,4,5,6,0].map(d => `
            <label style="display:flex; align-items:center; gap:4px; font-size:0.9rem; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; cursor:pointer;">
              <input type="checkbox" class="edit-days-off-cb" value="${d}" ${daysOff.includes(d) ? 'checked' : ''}>
              ${daysMap[d]}
            </label>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="train-editor-grid" style="margin-top: 16px;">
      <div class="form-group">
        <label class="form-label">運転日 (dates_run)</label>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <div class="date-control" style="flex:1;">
            <input type="text" id="date-run-input" class="form-input" data-is-datepicker="true" placeholder="日付を指定 (例: 2026-08-15)" style="width:100%;">
          </div>
          <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'date-run-input')">追加</button>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="rule-run-input" class="form-input" placeholder="連動条件を指定 (例: train:103, op:A1, mon)" style="flex:1;">
          <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'rule-run-input')">追加</button>
        </div>
        <input type="hidden" id="edit-dates-run" value="${datesRunStr}">
        <div id="dates-run-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
      </div>
      <div class="form-group">
        <label class="form-label">運休日 (dates_off)</label>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <div class="date-control" style="flex:1;">
            <input type="text" id="date-off-input" class="form-input" data-is-datepicker="true" placeholder="日付を指定 (例: 2026-08-15)" style="width:100%;">
          </div>
          <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'date-off-input')">追加</button>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="rule-off-input" class="form-input" placeholder="連動条件を指定 (例: train:103, op:A1, mon)" style="flex:1;">
          <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'rule-off-input')">追加</button>
        </div>
        <input type="hidden" id="edit-dates-off" value="${datesOffStr}">
        <div id="dates-off-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
      </div>
    </div>

    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px; line-height: 1.4;">
      <b>入力ルール（カンマ区切りで複数指定可能）:</b><br>
      ・特定の日付: <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">2026-08-15</code><br>
      ・特定の曜日: <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">sun</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">mon</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">tue</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">wed</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">thu</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">fri</code>, <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">sat</code><br>
      ・他列車の運転日に連動: <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">train:103</code> (列車番号103が運転する日)<br>
      ・他運用の運転日に連動: <code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">op:A1</code> (運用A1が運転する日)
    </div>

    <h4 style="margin-top: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">日付指定の区間運休・区間運転 (partial_cancellations)</h4>
    <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; margin-top: 12px;">
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 4px; color: var(--text-secondary);">日付</th>
            <th style="padding: 4px; color: var(--text-secondary);">始発駅</th>
            <th style="padding: 4px; color: var(--text-secondary);">終着駅</th>
            <th style="padding: 4px;"></th>
          </tr>
        </thead>
        <tbody id="edit-pc-body">
          ${partialCancellations.map(pc => `
            <tr>
              <td style="padding: 4px;">
                <div class="date-control">
                  <input type="text" class="form-input pc-date" data-is-datepicker="true" value="${pc.date}" placeholder="YYYY-MM-DD, mon..." style="width:100%;">
                </div>
              </td>
              <td style="padding: 4px;">
                <select class="form-input pc-start">
                  ${stationsData.map(s => `<option value="${s.code}" ${s.code === pc.actual_start ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>
              </td>
              <td style="padding: 4px;">
                <select class="form-input pc-end">
                  ${stationsData.map(s => `<option value="${s.code}" ${s.code === pc.actual_end ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>
              </td>
              <td style="padding: 4px;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">削除</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button type="button" class="btn-admin" style="margin-top: 12px; padding: 4px 12px; font-size: 0.8rem;" onclick="addPCRow()">+ 区間運休を追加</button>
    </div>

    <h4 style="margin-top: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">各駅時刻データ</h4>
    <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 4px; color: var(--text-secondary);">駅コード</th>
            <th style="padding: 4px; color: var(--text-secondary);">駅名</th>
            <th style="padding: 4px; color: var(--text-secondary);">着 (HH:MM)</th>
            <th style="padding: 4px; color: var(--text-secondary);">発 (HH:MM)</th>
          </tr>
        </thead>
        <tbody id="edit-stations-body">
          ${t.stations.map((st, i) => `
            <tr>
              <td style="padding: 4px;"><input type="text" class="form-input st-code" value="${st.code}" style="width: 60px;"></td>
              <td style="padding: 4px;">${getStationName(st.code)}</td>
              <td style="padding: 4px;"><input type="text" class="form-input st-arr" value="${st.arr || ''}" placeholder="null"></td>
              <td style="padding: 4px;"><input type="text" class="form-input st-dep" value="${st.dep || ''}" placeholder="null"></td>
              <td style="padding: 4px;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">削除</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button type="button" class="btn-admin" style="margin-top: 12px; padding: 4px 12px; font-size: 0.8rem;" onclick="addStationRow()">+ 駅を追加</button>
    </div>

    <div style="margin-top: 24px; text-align: right;">
      <button class="btn-admin btn-success" onclick="saveTrainData()">この列車の変更を適用 (メモリ上)</button>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = 'block';
  
  // Render chips initially
  window.renderDateChips('dates_run');
  window.renderDateChips('dates_off');
}

window.addPCRow = function() {
  const tbody = document.getElementById('edit-pc-body');
  const tr = document.createElement('tr');
  const stOptions = stationsData.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  tr.innerHTML = `
    <td style="padding: 4px;">
      <div class="date-control">
        <input type="text" class="form-input pc-date" data-is-datepicker="true" placeholder="YYYY-MM-DD, mon..." style="width:100%;">
      </div>
    </td>
    <td style="padding: 4px;"><select class="form-input pc-start">${stOptions}</select></td>
    <td style="padding: 4px;"><select class="form-input pc-end">${stOptions}</select></td>
    <td style="padding: 4px;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">削除</button></td>
  `;
  tbody.appendChild(tr);
};

window.addDateChip = function(type, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  const val = input.value;
  if (!val) return;
  
  let current = hidden.value ? hidden.value.split(',') : [];
  if (!current.includes(val)) {
    current.push(val);
    hidden.value = current.join(',');
    window.renderDateChips(type);
  }
  input.value = '';
};

window.removeDateChip = function(type, val) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  let current = hidden.value ? hidden.value.split(',') : [];
  current = current.filter(d => d !== val);
  hidden.value = current.join(',');
  window.renderDateChips(type);
};

window.renderDateChips = function(type) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  const container = document.getElementById(type === 'dates_run' ? 'dates-run-chips' : 'dates-off-chips');
  const current = hidden.value ? hidden.value.split(',') : [];
  
  container.innerHTML = current.map(d => `
    <div style="background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
      ${d} <span style="cursor:pointer; color: #ff6b6b; font-weight:bold;" onclick="window.removeDateChip('${type}', '${d}')">×</span>
    </div>
  `).join('');
};

function addStationRow() {
  const tbody = document.getElementById('edit-stations-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding: 4px;"><input type="text" class="form-input st-code" value="" style="width: 60px;"></td>
    <td style="padding: 4px;">新規</td>
    <td style="padding: 4px;"><input type="text" class="form-input st-arr" value="" placeholder="null"></td>
    <td style="padding: 4px;"><input type="text" class="form-input st-dep" value="" placeholder="null"></td>
    <td style="padding: 4px;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">削除</button></td>
  `;
  tbody.appendChild(tr);
}


function saveTrainData() {
  if (!currentTrainId) return;
  const t = timetableData.find(x => x.train_id === currentTrainId);
  if (!t) return;

  t.train_no = document.getElementById('edit-train-no').value.trim();
  const newOpId = document.getElementById('edit-op-id').value.trim();
  if (t.operation_id !== newOpId) {
    t.operation_id = newOpId;
    if (t.operation_dict) {
      delete t.operation_dict; // Override complex daily rules if user manually changed op id here
    }
  }
  t.direction = document.getElementById('edit-dir').value;
  t.destination = document.getElementById('edit-dest').value.trim();

  const parseArray = (str) => str.split(',').map(s => s.trim()).filter(s => s !== '');
  t.operation_rule.service_type = document.getElementById('edit-svc-type').value;
  
  const daysOffCbs = document.querySelectorAll('.edit-days-off-cb');
  t.operation_rule.days_off = Array.from(daysOffCbs).filter(cb => !cb.checked).map(cb => Number(cb.value));
  
  t.operation_rule.dates_run = parseArray(document.getElementById('edit-dates-run').value);
  t.operation_rule.dates_off = parseArray(document.getElementById('edit-dates-off').value);

  // Parse partial_cancellations
  const pcRows = document.querySelectorAll('#edit-pc-body tr');
  const pc = [];
  pcRows.forEach(tr => {
    const date = tr.querySelector('.pc-date').value;
    const start = tr.querySelector('.pc-start').value;
    const end = tr.querySelector('.pc-end').value;
    if (date && start && end) {
      pc.push({ date, actual_start: start, actual_end: end });
    }
  });
  t.partial_cancellations = pc.length > 0 ? pc : undefined;

  const stRows = document.querySelectorAll('#edit-stations-body tr');
  t.stations = [];
  stRows.forEach(tr => {
    const code = tr.querySelector('.st-code').value.trim();
    let arr = tr.querySelector('.st-arr').value.trim();
    let dep = tr.querySelector('.st-dep').value.trim();
    if (arr === '') arr = null;
    if (dep === '') dep = null;
    if (code) {
      t.stations.push({ code, arr, dep });
    }
  });

  alert('変更をメモリに適用しました。「変更をダウンロード」で保存してください。');
  renderTrainList();
}



async function exportTimetable() {
  if (timetableData.length === 0) {
    alert('データがありません');
    return;
  }
  
  if (!adminToken) {
    alert('管理者としてログインしていません。');
    return;
  }

  const btn = document.querySelector('button[onclick="exportTimetable()"]');
  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_timetable_github',
        token: adminToken,
        data: timetableData
      })
    });
    const result = await res.json();
    if (result.status === 'success') {
      alert('GitHubへの直接反映（プッシュ）が成功しました！\n反映には約1〜2分かかります。数分後にページをリロードして確認してください。');
    } else {
      throw new Error(result.message || '保存に失敗しました');
    }
  } catch (err) {
    alert('GitHubプッシュエラー: ' + err.message + '\\n(安全のため、ファイルのダウンロードを実行します。)');
    // Fallback download
    const blob = new Blob([JSON.stringify(timetableData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timetable.json';
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}



// --- 運用ベース管理機能 ---
const DAYS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'holiday'];
const DAYS_LABELS = { sun:'日', mon:'月', tue:'火', wed:'水', thu:'木', fri:'金', sat:'土', holiday:'祝' };

window.addOpDateChip = function(op, type) {
  const input = document.getElementById(`op-${type}-input-${op}`);
  const hidden = document.getElementById(`op-${type}-hidden-${op}`);
  const val = input.value;
  if (!val) return;
  
  let current = hidden.value ? hidden.value.split(',') : [];
  if (!current.includes(val)) {
    current.push(val);
    hidden.value = current.join(',');
    window.renderOpDateChips(op, type);
  }
  input.value = '';
};

window.removeOpDateChip = function(op, type, val) {
  const hidden = document.getElementById(`op-${type}-hidden-${op}`);
  let current = hidden.value ? hidden.value.split(',') : [];
  current = current.filter(d => d !== val);
  hidden.value = current.join(',');
  window.renderOpDateChips(op, type);
};

window.renderOpDateChips = function(op, type) {
  const hidden = document.getElementById(`op-${type}-hidden-${op}`);
  const container = document.getElementById(`op-${type}-chips-${op}`);
  if(!hidden || !container) return;
  const current = hidden.value ? hidden.value.split(',').filter(s=>s) : [];
  
  container.innerHTML = current.map(d => `
    <div style="background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
      ${d} <span style="cursor:pointer; color: #ff6b6b; font-weight:bold;" onclick="window.removeOpDateChip('${op}', '${type}', '${d}')">×</span>
    </div>
  `).join('');
};

function renderOperationsView() {
  const opList = document.getElementById('op-list');
  if(!opList) return;
  
  const ops = new Set();
  timetableData.forEach(t => {
    if(t.operation_dict) {
      Object.values(t.operation_dict).forEach(opstr => {
        opstr.split(',').map(s=>s.trim()).filter(s=>s).forEach(o => ops.add(o));
      });
    } else if (t.operation_id) {
      t.operation_id.toString().split(',').map(s=>s.trim()).filter(s=>s).forEach(o => ops.add(o));
    }
  });
  
  let html = '';
  Array.from(ops).sort().forEach(op => {
    let repTrain = null;
    for(const t of timetableData) {
       let matched = false;
       if(t.operation_dict) {
         if(Object.values(t.operation_dict).some(v => v.split(',').map(s=>s.trim()).includes(op))) matched = true;
       } else if (t.operation_id) {
         if(t.operation_id.toString().split(',').map(s=>s.trim()).includes(op)) matched = true;
       }
       if(matched) { repTrain = t; break; }
    }
    
    let baseDaysOff = repTrain && repTrain.operation_rule && repTrain.operation_rule.days_off ? repTrain.operation_rule.days_off : [];
    let extraDates = repTrain && repTrain.operation_rule && repTrain.operation_rule.dates_run ? repTrain.operation_rule.dates_run.join(',') : '';
    let excludeDates = repTrain && repTrain.operation_rule && repTrain.operation_rule.dates_off ? repTrain.operation_rule.dates_off.join(',') : '';

    html += `<div class="op-card" style="background: var(--bg-card); padding: 16px; border-radius: 8px;">
      <h3 style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:8px;">運用 ${op}</h3>
      
      <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; margin-top: 12px; font-size: 0.85rem;">
        <strong style="display:block; margin-bottom:8px; color: var(--text-primary);">▼ 運転曜日の設定</strong>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
          ${[1,2,3,4,5,6,0].map(d => `<label style="display:flex; align-items:center; gap:4px; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; cursor:pointer;"><input type="checkbox" class="op-daysoff-cb" data-op="${op}" value="${d}" ${!baseDaysOff.includes(d) ? 'checked' : ''}> ${['日','月','火','水','木','金','土'][d]}</label>`).join('')}
        </div>
        
        <strong style="display:block; margin-bottom:8px; color: var(--text-primary);">▼ 特定運転日・特定運休日の設定</strong>
        <div style="margin-bottom: 8px;">
          <label style="color: var(--text-secondary); display:block; margin-bottom:4px;">特定運転日</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="op-datesrun-input-${op}" class="form-input" data-is-datepicker="true" data-range="true" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addOpDateChip('${op}', 'datesrun')">追加</button>
          </div>
          <input type="hidden" id="op-datesrun-hidden-${op}" class="op-datesrun-hidden" data-op="${op}" value="${extraDates}">
          <div id="op-datesrun-chips-${op}" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
        </div>
        <div>
          <label style="color: var(--text-secondary); display:block; margin-bottom:4px;">特定運休日</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="op-datesoff-input-${op}" class="form-input" data-is-datepicker="true" data-range="true" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addOpDateChip('${op}', 'datesoff')">追加</button>
          </div>
          <input type="hidden" id="op-datesoff-hidden-${op}" class="op-datesoff-hidden" data-op="${op}" value="${excludeDates}">
          <div id="op-datesoff-chips-${op}" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
        </div>
      </div>

      <div style="margin-top:16px;">
        <strong style="display:block; margin-bottom:8px; font-size:0.85rem; color: var(--text-secondary);">▼ 曜日ごとの充当列車</strong>`;
      
    DAYS_KEYS.forEach(dayKey => {
      const trainsAssigned = timetableData.filter(t => {
        let val = '';
        if (t.operation_dict && t.operation_dict[dayKey] !== undefined) {
          val = t.operation_dict[dayKey];
        } else {
          val = t.operation_id || '';
        }
        return val.split(',').map(s=>s.trim()).includes(op);
      }).map(t => t.train_no);
      
      html += `
        <div class="op-day-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="color:var(--text-secondary); width:32px;">${DAYS_LABELS[dayKey]}</span>
          <input type="text" class="form-input op-edit-input" style="flex:1; padding:4px 8px;" 
            data-op="${op}" data-day="${dayKey}" value="${trainsAssigned.join(', ')}" placeholder="列車番号をカンマ区切り">
        </div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += `
    <div style="grid-column: 1 / -1; margin-top: 16px;">
      <button class="btn-admin btn-success" onclick="saveOperationsToMemory()">変更を適用 (メモリ)</button>
      <button class="btn-admin" onclick="renderOperationsView()" style="margin-left:8px;">リセット</button>
      <p style="font-size:0.8rem; margin-top:8px; color:var(--text-secondary);">※変更を適用後、「運行データ管理」タブから「GitHubへ反映」してください。</p>
    </div>
  `;
  opList.innerHTML = html;
  
  Array.from(ops).forEach(op => {
    window.renderOpDateChips(op, 'datesrun');
    window.renderOpDateChips(op, 'datesoff');
  });
}

window.saveOperationsToMemory = function() {
  const inputs = document.querySelectorAll('.op-edit-input');
  
  timetableData.forEach(t => {
    if(!t.operation_dict) {
      t.operation_dict = {};
      DAYS_KEYS.forEach(d => t.operation_dict[d] = t.operation_id || "");
    }
  });

  DAYS_KEYS.forEach(dayKey => {
    timetableData.forEach(t => { t.operation_dict[dayKey] = ""; });
  });

  inputs.forEach(input => {
    const op = input.getAttribute('data-op');
    const dayKey = input.getAttribute('data-day');
    const trainNos = input.value.split(',').map(s=>s.trim()).filter(s=>s);
    
    trainNos.forEach(tNo => {
      const targetTrain = timetableData.find(t => t.train_no === tNo);
      if(targetTrain) {
        let current = targetTrain.operation_dict[dayKey];
        if(current) {
          targetTrain.operation_dict[dayKey] = current + ", " + op;
        } else {
          targetTrain.operation_dict[dayKey] = op;
        }
      }
    });
  });

  const opDatesRunInputs = document.querySelectorAll('.op-datesrun-hidden');
  const opDatesOffInputs = document.querySelectorAll('.op-datesoff-hidden');
  const opDaysOffCbs = document.querySelectorAll('.op-daysoff-cb');
  
  const opSettings = {};
  opDatesRunInputs.forEach(hidden => {
    const op = hidden.getAttribute('data-op');
    if(!opSettings[op]) opSettings[op] = { datesRun: [], datesOff: [], daysOff: [] };
    opSettings[op].datesRun = hidden.value.split(',').map(s=>s.trim()).filter(s=>s);
  });
  opDatesOffInputs.forEach(hidden => {
    const op = hidden.getAttribute('data-op');
    if(!opSettings[op]) opSettings[op] = { datesRun: [], datesOff: [], daysOff: [] };
    opSettings[op].datesOff = hidden.value.split(',').map(s=>s.trim()).filter(s=>s);
  });
  opDaysOffCbs.forEach(cb => {
    if (!cb.checked) {
      const op = cb.getAttribute('data-op');
      if(!opSettings[op]) opSettings[op] = { datesRun: [], datesOff: [], daysOff: [] };
      opSettings[op].daysOff.push(Number(cb.value));
    }
  });

  timetableData.forEach(t => {
    const myOps = new Set();
    if (t.operation_dict) {
      Object.values(t.operation_dict).forEach(opstr => opstr.split(',').map(s=>s.trim()).filter(s=>s).forEach(o => myOps.add(o)));
    } else if (t.operation_id) {
      t.operation_id.toString().split(',').map(s=>s.trim()).filter(s=>s).forEach(o => myOps.add(o));
    }

    if (myOps.size > 0) {
      const primaryOp = Array.from(myOps)[0];
      const setting = opSettings[primaryOp];
      if (setting && t.operation_rule) {
        t.operation_rule.dates_run = setting.datesRun.length > 0 ? setting.datesRun : undefined;
        t.operation_rule.dates_off = setting.datesOff.length > 0 ? setting.datesOff : undefined;
        t.operation_rule.days_off = setting.daysOff.length > 0 ? setting.daysOff : undefined;
      }
    }
    
    // Cleanup operation_dict to prevent overriding operation_id with empty/redundant data
    if (t.operation_dict) {
      let allEmpty = true;
      let allSame = true;
      let firstVal = t.operation_dict[DAYS_KEYS[0]];
      DAYS_KEYS.forEach(d => {
        if (t.operation_dict[d] !== "") allEmpty = false;
        if (t.operation_dict[d] !== firstVal) allSame = false;
      });
      if (allEmpty) {
        delete t.operation_dict;
        t.operation_id = "";
      } else if (allSame) {
        t.operation_id = firstVal;
        delete t.operation_dict;
      }
    }
  });
  
  alert('運用のスケジュールと充当列車の変更をメモリに適用しました。\\n「運行データ管理」から「GitHubへ反映」してください。');
};



