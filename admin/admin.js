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
  if (timetableData.length === 0) {
    loadTimetableFromRepo(true);
  }
}

/**
 * タブ切り替え
 */
async function switchAdminTab(tab) {
  const views = ['posts', 'logs', 'trains', 'operations', 'simulation'];
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
    if (timetableData.length === 0) {
      await loadTimetableFromRepo(true);
    } else {
      renderOperationsView();
    }
  } else if (tab === 'trains') {
    if (timetableData.length === 0) {
      await loadTimetableFromRepo(true);
    } else {
      renderTrainList();
    }
  } else if (tab === 'logs') {
    fetchAdminLogs();
  } else if (tab === 'simulation') {
    if (timetableData.length === 0) {
      await loadTimetableFromRepo(true);
    }
    const input = document.getElementById('sim-date-input');
    if (input && !input.value) {
      input.value = new Date().toISOString().split('T')[0];
    }
    runSimulation();
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
let originalTimetableData = [];
let stationsData = [];
let currentTrainId = null;
let manualOperations = new Set();
let dirtyTrainIds = new Set();
const DRAFT_STORAGE_KEY = 'moka_admin_timetable_draft';

// --- Sync Status & Toast ---
function updateSyncStatus() {
  const badge = document.getElementById('admin-sync-badge');
  const memo = document.getElementById('admin-sync-memo');
  if (!badge) return;

  if (dirtyTrainIds.size > 0) {
    badge.className = 'status-badge sync-dirty';
    badge.textContent = `未プッシュの変更あり (${dirtyTrainIds.size}件)`;
    if (memo) memo.textContent = 'メモリ・下書きに保存済。「GitHubへ反映」で確定してください';
  } else {
    badge.className = 'status-badge sync-ok';
    badge.textContent = '同期済み';
    if (memo) memo.textContent = '変更なし (GitHub最新)';
  }
}

function showToast(msg) {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function saveDraftToStorage() {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(timetableData));
  } catch (e) {
    console.warn('Failed to save draft to localStorage', e);
  }
}

function calculateDirtySet() {
  dirtyTrainIds.clear();
  if (originalTimetableData.length === 0) return;

  const origMap = new Map();
  originalTimetableData.forEach(t => origMap.set(t.train_id, JSON.stringify(t)));

  timetableData.forEach(t => {
    const origStr = origMap.get(t.train_id);
    if (!origStr || origStr !== JSON.stringify(t)) {
      dirtyTrainIds.add(t.train_id);
    }
  });
}

// --- Timetable Loading & Repository Sync ---
async function loadTimetableFromRepo(silent = false) {
  try {
    const t = Date.now();
    const [stRes, ttRes] = await Promise.all([
      fetch(`../train-state/data/stations.json?t=${t}`),
      fetch(`../train-state/data/timetable.json?t=${t}`)
    ]);
    if (!stRes.ok || !ttRes.ok) throw new Error('リポジトリからのデータ取得に失敗しました');

    stationsData = await stRes.json();
    const fetchedTt = await ttRes.json();
    originalTimetableData = JSON.parse(JSON.stringify(fetchedTt));

    // Check localStorage draft
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const useDraft = confirm('ブラウザに未保存の下書きデータが見つかりました。\n未保存の下書きを復元して編集を継続しますか？\n（[キャンセル]を押すとGitHub最新データで上書きします）');
          if (useDraft) {
            timetableData = parsed;
            calculateDirtySet();
            updateSyncStatus();
            if (!silent) showToast('下書きデータを復元しました');
            renderTrainList();
            renderOperationsView();
            return;
          } else {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        }
      } catch (e) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }

    timetableData = JSON.parse(JSON.stringify(originalTimetableData));
    dirtyTrainIds.clear();
    updateSyncStatus();
    if (!silent) showToast('リポジトリから最新データを読み込みました');
    renderTrainList();
    renderOperationsView();
  } catch (err) {
    console.error(err);
    if (!silent) alert('読込エラー: ' + err.message);
  }
}

function confirmReloadRepo() {
  if (dirtyTrainIds.size > 0) {
    if (!confirm(`未プッシュの変更が ${dirtyTrainIds.size} 件あります。\n最新データを取得するとこれらの変更は破棄されます。よろしいですか？`)) {
      return;
    }
  }
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  loadTimetableFromRepo(false);
}

function handleTimetableUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed)) throw new Error('timetable.jsonの形式が正しくありません (配列が必要)');
      timetableData = parsed;
      calculateDirtySet();
      saveDraftToStorage();
      updateSyncStatus();
      showToast('ファイルからデータを読み込みました');
      renderTrainList();
      renderOperationsView();
    } catch (err) {
      alert('JSONのパースに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function downloadTimetableFile() {
  if (timetableData.length === 0) {
    alert('データがありません');
    return;
  }
  const blob = new Blob([JSON.stringify(timetableData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timetable.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('timetable.json をダウンロードしました');
}

// --- Train List Rendering ---
function renderTrainList() {
  const list = document.getElementById('train-list');
  if (!list) return;
  const query = (document.getElementById('train-search') ? document.getElementById('train-search').value : '').trim().toLowerCase();

  if (timetableData.length === 0) {
    list.innerHTML = '<li style="color: var(--text-secondary); text-align: center; padding: 20px;">データがありません</li>';
    return;
  }

  const filtered = timetableData.filter(t => {
    if (!query) return true;
    return (t.train_id && t.train_id.toLowerCase().includes(query)) ||
           (t.train_no && t.train_no.toLowerCase().includes(query)) ||
           (t.operation_id && t.operation_id.toLowerCase().includes(query)) ||
           (t.destination && t.destination.toLowerCase().includes(query));
  });

  list.innerHTML = filtered.map(t => {
    const isSelected = t.train_id === currentTrainId;
    const isDirty = dirtyTrainIds.has(t.train_id);
    const svcType = (t.operation_rule && t.operation_rule.service_type) || 'regular';
    const typeLabel = svcType === 'sl' ? 'SL' : (svcType === 'extra' ? '臨時' : (svcType === 'deadhead' ? '回送' : '普通'));
    const dirLabel = t.direction === 'up' ? '上り' : '下り';
    const hasVariants = t.schedule_variants && t.schedule_variants.length > 0;

    return `
      <li class="train-list-item ${isSelected ? 'selected' : ''}" onclick="editTrain('${t.train_id}')">
        <div>
          <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            <span>${escapeHTML(t.train_no)}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">(${escapeHTML(t.train_id)})</span>
            <span class="sim-badge ${svcType}">${typeLabel}</span>
            ${hasVariants ? '<span class="sim-badge variant">特定ダイヤ有</span>' : ''}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
            ${dirLabel} | 行先: ${escapeHTML(t.destination)} | 運用: ${escapeHTML(t.operation_id || '未設定')}
          </div>
        </div>
        ${isDirty ? '<span class="dirty-dot" title="未反映の変更あり"></span>' : ''}
      </li>
    `;
  }).join('');
}

function getStationName(code) {
  const s = stationsData.find(x => x.code === code);
  return s ? s.name : code;
}

// --- Train Editor ---
function editTrain(trainId) {
  const t = timetableData.find(x => x.train_id === trainId);
  if (!t) return;
  currentTrainId = trainId;

  // Highlight selected in sidebar
  document.querySelectorAll('.train-list-item').forEach(el => el.classList.remove('selected'));
  renderTrainList();

  const container = document.getElementById('train-editor-container');
  if (!container) return;

  const rule = t.operation_rule || { service_type: 'regular', days_off: [] };
  const daysOff = rule.days_off || [];
  // Days map: 1=月, 2=火, 3=水, 4=木, 5=金, 6=土, 0=日
  const weekdays = [
    { key: 1, label: '月' },
    { key: 2, label: '火' },
    { key: 3, label: '水' },
    { key: 4, label: '木' },
    { key: 5, label: '金' },
    { key: 6, label: '土' },
    { key: 0, label: '日' }
  ];

  const datesRunStr = (rule.dates_run || []).join(',');
  const datesOffStr = (rule.dates_off || []).join(',');
  const isHolidayRun = (rule.dates_run || []).includes('holiday');

  const partialCancellations = t.partial_cancellations || [];
  const scheduleVariants = t.schedule_variants || [];

  let html = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="editor-header">
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-primary);">列車編集: ${escapeHTML(t.train_no)} (${escapeHTML(t.train_id)})</h3>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">変更後は右上の「変更を適用 (メモリ上)」を押してください</span>
        </div>
        <button type="button" class="btn-admin btn-success" onclick="saveTrainData()">変更を適用 (メモリ上)</button>
      </div>

      <div class="train-editor-grid">
        <div class="form-group">
          <label class="form-label">列車番号 (train_no)</label>
          <input type="text" id="edit-train-no" class="form-input" value="${escapeHTML(t.train_no || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">運用番号 (operation_id)</label>
          ${t.operation_dict ? '<div style="font-size:0.75rem; color:#ff9f0a; margin-bottom:4px;">※曜日別運用が設定されています。変更は「運用ベース管理」タブで行うか、直接入力して単一運用へ上書きしてください。</div>' : ''}
          <input type="text" id="edit-op-id" class="form-input" value="${escapeHTML(t.operation_id || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">方向 (direction)</label>
          <select id="edit-dir" class="form-input">
            <option value="down" ${t.direction === 'down' ? 'selected' : ''}>下り (下館 → 茂木)</option>
            <option value="up" ${t.direction === 'up' ? 'selected' : ''}>上り (茂木 → 下館)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">行先 (destination)</label>
          <input type="text" id="edit-dest" class="form-input" value="${escapeHTML(t.destination || '')}">
        </div>
      </div>

      <h4 style="margin-top: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">運行ルール (operation_rule)</h4>
      <div class="train-editor-grid">
        <div class="form-group">
          <label class="form-label">種別 (service_type)</label>
          <select id="edit-svc-type" class="form-input">
            <option value="regular" ${rule.service_type === 'regular' ? 'selected' : ''}>普通 (regular)</option>
            <option value="sl" ${rule.service_type === 'sl' ? 'selected' : ''}>SL (sl)</option>
            <option value="extra" ${rule.service_type === 'extra' ? 'selected' : ''}>臨時 (extra)</option>
            <option value="deadhead" ${rule.service_type === 'deadhead' ? 'selected' : ''}>回送 (deadhead)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">運転曜日 (選択された曜日に運転)</label>
          <div class="day-pills-group" id="edit-days-pills">
            ${weekdays.map(w => {
              const runs = !daysOff.includes(w.key);
              return `<button type="button" class="day-toggle-pill ${runs ? 'active' : ''}" data-day="${w.key}" onclick="toggleDayPill(this)">${w.label}</button>`;
            }).join('')}
            <button type="button" class="day-toggle-pill holiday ${isHolidayRun ? 'active' : ''}" id="edit-pill-holiday" onclick="this.classList.toggle('active')">祝日</button>
          </div>
          <div class="preset-pills">
            <button type="button" class="preset-pill" onclick="setDayPreset('all')">全日</button>
            <button type="button" class="preset-pill" onclick="setDayPreset('weekday')">平日のみ</button>
            <button type="button" class="preset-pill" onclick="setDayPreset('weekend')">土休日のみ</button>
            <button type="button" class="preset-pill" onclick="setDayPreset('none')">全休</button>
          </div>
        </div>
      </div>

      <!-- 運転日・運休日 -->
      <div class="train-editor-grid">
        <div class="form-group">
          <label class="form-label">特定運転日 (dates_run) ※期間・連動指定可</label>
          <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
            <input type="text" id="date-run-input" class="form-input" data-is-datepicker="true" data-range="true" placeholder="日付・期間 (例: 2026-08-15, 2026-08-10~2026-08-15)" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'date-run-input')">追加</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="rule-run-input" class="form-input" placeholder="連動条件 (例: train:103, op:A1)" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'rule-run-input')">追加</button>
          </div>
          <input type="hidden" id="edit-dates-run" value="${datesRunStr}">
          <div id="dates-run-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
        </div>

        <div class="form-group">
          <label class="form-label">特定運休日 (dates_off) ※期間・連動指定可</label>
          <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
            <input type="text" id="date-off-input" class="form-input" data-is-datepicker="true" data-range="true" placeholder="日付・期間 (例: 2026-08-15, 2026-08-10~2026-08-15)" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'date-off-input')">追加</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="rule-off-input" class="form-input" placeholder="連動条件 (例: train:103, op:A1)" style="flex:1;">
            <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'rule-off-input')">追加</button>
          </div>
          <input type="hidden" id="edit-dates-off" value="${datesOffStr}">
          <div id="dates-off-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
        </div>
      </div>

      <!-- 特定日・変更ダイヤ (schedule_variants) -->
      <div style="margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div>
            <h4 style="margin: 0; font-size: 1rem; color: var(--text-primary);">特定日・変更ダイヤ (schedule_variants)</h4>
            <span style="font-size: 0.78rem; color: var(--text-secondary);">特定日のみ時刻変更・延長運転・区間短縮・行先変更を行う場合の設定</span>
          </div>
          <button type="button" class="btn-admin" onclick="addNewVariant()">+ 変更ダイヤを追加</button>
        </div>
        <div id="variants-container" style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px;">
          ${scheduleVariants.map((v, vIdx) => renderVariantCard(v, vIdx)).join('')}
        </div>
      </div>

      <!-- 日付指定の区間運休 (partial_cancellations) -->
      <div style="margin-top: 12px;">
        <h4 style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin: 0 0 10px;">日付指定の区間運休 (partial_cancellations)</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
          <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr>
                <th style="padding: 6px; color: var(--text-secondary);">日付・期間</th>
                <th style="padding: 6px; color: var(--text-secondary);">実質始発駅</th>
                <th style="padding: 6px; color: var(--text-secondary);">実質終着駅</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody id="edit-pc-body">
              ${partialCancellations.map(pc => `
                <tr>
                  <td style="padding: 4px;">
                    <input type="text" class="form-input pc-date" data-is-datepicker="true" data-range="true" value="${escapeHTML(pc.date || '')}" placeholder="YYYY-MM-DD または YYYY-MM-DD~YYYY-MM-DD" style="width:100%;">
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
                  <td style="padding: 4px; text-align: right;">
                    <button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="this.closest('tr').remove()">削除</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <button type="button" class="btn-admin" style="margin-top: 10px; font-size: 0.8rem;" onclick="addPCRow()">+ 区間運休を追加</button>
        </div>
      </div>

      <!-- 基本各駅時刻データ -->
      <div style="margin-top: 12px;">
        <h4 style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin: 0 0 10px;">基本時刻表データ (stations)</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
          <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr>
                <th style="padding: 6px; color: var(--text-secondary);">駅コード</th>
                <th style="padding: 6px; color: var(--text-secondary);">駅名</th>
                <th style="padding: 6px; color: var(--text-secondary);">着時刻 (HH:MM)</th>
                <th style="padding: 6px; color: var(--text-secondary);">発時刻 (HH:MM)</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody id="edit-stations-body">
              ${(t.stations || []).map(st => `
                <tr>
                  <td style="padding: 4px;"><input type="text" class="form-input st-code" value="${escapeHTML(st.code)}" style="width: 60px;"></td>
                  <td style="padding: 4px;">${escapeHTML(getStationName(st.code))}</td>
                  <td style="padding: 4px;"><input type="text" class="form-input st-arr" value="${st.arr ? escapeHTML(st.arr) : ''}" placeholder="null"></td>
                  <td style="padding: 4px;"><input type="text" class="form-input st-dep" value="${st.dep ? escapeHTML(st.dep) : ''}" placeholder="null"></td>
                  <td style="padding: 4px; text-align: right;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="this.closest('tr').remove()">削除</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <button type="button" class="btn-admin" style="margin-top: 10px; font-size: 0.8rem;" onclick="addStationRow()">+ 駅を追加</button>
        </div>
      </div>

      <div style="margin-top: 16px; text-align: right;">
        <button type="button" class="btn-admin btn-success" onclick="saveTrainData()">この列車の変更を適用 (メモリ上)</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = 'block';

  renderDateChips('dates_run');
  renderDateChips('dates_off');
}

// --- Weekday Pills Logic ---
function toggleDayPill(btn) {
  btn.classList.toggle('active');
}

function setDayPreset(preset) {
  const pills = document.querySelectorAll('#edit-days-pills .day-toggle-pill:not(.holiday)');
  const holidayPill = document.getElementById('edit-pill-holiday');

  if (preset === 'all') {
    pills.forEach(p => p.classList.add('active'));
    if (holidayPill) holidayPill.classList.add('active');
  } else if (preset === 'weekday') {
    pills.forEach(p => {
      const d = Number(p.dataset.day);
      if (d >= 1 && d <= 5) p.classList.add('active');
      else p.classList.remove('active');
    });
    if (holidayPill) holidayPill.classList.remove('active');
  } else if (preset === 'weekend') {
    pills.forEach(p => {
      const d = Number(p.dataset.day);
      if (d === 0 || d === 6) p.classList.add('active');
      else p.classList.remove('active');
    });
    if (holidayPill) holidayPill.classList.add('active');
  } else if (preset === 'none') {
    pills.forEach(p => p.classList.remove('active'));
    if (holidayPill) holidayPill.classList.remove('active');
  }
}

// --- Date Chips Functions (supports range YYYY-MM-DD~YYYY-MM-DD) ---
function addDateChip(type, inputId) {
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  if (!input || !hidden) return;
  const val = input.value.trim();
  if (!val) return;

  let current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (!current.includes(val)) {
    current.push(val);
    hidden.value = current.join(',');
    renderDateChips(type);
  }
  input.value = '';
}

function removeDateChip(type, val) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  if (!hidden) return;
  let current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  current = current.filter(d => d !== val);
  hidden.value = current.join(',');
  renderDateChips(type);
}

function renderDateChips(type) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  const container = document.getElementById(type === 'dates_run' ? 'dates-run-chips' : 'dates-off-chips');
  if (!hidden || !container) return;
  const current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];

  container.innerHTML = current.map(d => {
    let display = d;
    if (d.includes('~')) {
      const [s, e] = d.split('~');
      display = `${s} 〜 ${e}`;
    } else if (d.includes('..')) {
      const [s, e] = d.split('..');
      display = `${s} 〜 ${e}`;
    }
    return `
      <div style="background: rgba(255,255,255,0.1); border: 1px solid var(--border-subtle); padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
        <span>${escapeHTML(display)}</span>
        <span style="cursor:pointer; color: #ff6b6b; font-weight:bold; font-size: 0.9rem;" onclick="removeDateChip('${type}', '${escapeHTML(d)}')">×</span>
      </div>
    `;
  }).join('');
}

// --- Schedule Variants UI ---
function renderVariantCard(v, idx) {
  const dates = v.dates || [];
  const stations = v.stations || [];

  return `
    <div class="variant-card" data-v-idx="${idx}">
      <div class="variant-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="text" class="form-input v-label" value="${escapeHTML(v.label || '特別ダイヤ')}" placeholder="ダイヤ名称 (例: SLもおか重連運転)" style="font-weight:700; width: 220px;">
          <input type="text" class="form-input v-dest" value="${escapeHTML(v.destination || '')}" placeholder="行先変更 (未指定なら通常行先)" style="width: 180px;">
        </div>
        <button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="removeVariantCard(${idx})">この変更ダイヤを削除</button>
      </div>

      <div style="margin: 8px 0;">
        <label class="form-label" style="font-size:0.8rem;">適用日付・期間 (カンマ区切り、または日付指定)</label>
        <input type="text" class="form-input v-dates" data-is-datepicker="true" data-range="true" value="${escapeHTML(dates.join(','))}" placeholder="例: 2026-08-15, 2026-11-03~2026-11-05">
      </div>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
        <button type="button" class="btn-admin" style="font-size: 0.78rem;" onclick="copyBaseStationsToVariant(${idx})">基本時刻表からコピー</button>
        <span style="font-size: 0.78rem; color: var(--text-secondary);">時刻一括シフト:</span>
        <input type="number" class="form-input v-shift-mins" placeholder="±分" style="width: 70px; padding: 4px 8px; font-size: 0.8rem;">
        <button type="button" class="btn-admin" style="font-size: 0.78rem;" onclick="shiftVariantTimes(${idx})">シフト適用</button>
      </div>

      <div style="max-height: 220px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 4px; padding: 6px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
          <thead>
            <tr>
              <th style="padding: 4px; color: var(--text-secondary);">駅</th>
              <th style="padding: 4px; color: var(--text-secondary);">着 (HH:MM)</th>
              <th style="padding: 4px; color: var(--text-secondary);">発 (HH:MM)</th>
              <th style="padding: 4px;"></th>
            </tr>
          </thead>
          <tbody class="v-stations-tbody">
            ${stations.map(st => `
              <tr>
                <td style="padding: 2px 4px;">
                  <select class="form-input v-st-code" style="padding: 2px 4px; font-size: 0.78rem;">
                    ${stationsData.map(s => `<option value="${s.code}" ${s.code === st.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
                  </select>
                </td>
                <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-arr" value="${st.arr || ''}" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
                <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-dep" value="${st.dep || ''}" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
                <td style="padding: 2px 4px; text-align:right;"><button type="button" class="btn-admin btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">×</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <button type="button" class="btn-admin" style="margin-top: 6px; font-size: 0.75rem; padding: 3px 8px;" onclick="addVariantStationRow(this)">+ 駅を追加</button>
      </div>
    </div>
  `;
}

function addNewVariant() {
  const container = document.getElementById('variants-container');
  if (!container) return;
  const t = timetableData.find(x => x.train_id === currentTrainId);
  const newV = {
    label: '特別ダイヤ',
    dates: [],
    destination: t ? t.destination : '',
    stations: t ? JSON.parse(JSON.stringify(t.stations)) : []
  };
  const currentCount = container.querySelectorAll('.variant-card').length;
  const div = document.createElement('div');
  div.innerHTML = renderVariantCard(newV, currentCount);
  container.appendChild(div.firstElementChild);
}

function removeVariantCard(idx) {
  const card = document.querySelector(`.variant-card[data-v-idx="${idx}"]`);
  if (card) card.remove();
}

function copyBaseStationsToVariant(idx) {
  const t = timetableData.find(x => x.train_id === currentTrainId);
  if (!t || !t.stations) return;
  const card = document.querySelector(`.variant-card[data-v-idx="${idx}"]`);
  if (!card) return;
  const tbody = card.querySelector('.v-stations-tbody');
  tbody.innerHTML = t.stations.map(st => `
    <tr>
      <td style="padding: 2px 4px;">
        <select class="form-input v-st-code" style="padding: 2px 4px; font-size: 0.78rem;">
          ${stationsData.map(s => `<option value="${s.code}" ${s.code === st.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
        </select>
      </td>
      <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-arr" value="${st.arr || ''}" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
      <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-dep" value="${st.dep || ''}" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
      <td style="padding: 2px 4px; text-align:right;"><button type="button" class="btn-admin btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">×</button></td>
    </tr>
  `).join('');
  showToast('基本時刻表をコピーしました');
}

function shiftVariantTimes(idx) {
  const card = document.querySelector(`.variant-card[data-v-idx="${idx}"]`);
  if (!card) return;
  const shiftInput = card.querySelector('.v-shift-mins');
  const shift = parseInt(shiftInput.value, 10);
  if (isNaN(shift) || shift === 0) {
    alert('シフトする分数 (例: 10 または -5) を入力してください');
    return;
  }

  const shiftTimeStr = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    let totalMins = h * 60 + m + shift;
    if (totalMins < 0) totalMins += 1440;
    totalMins = totalMins % 1440;
    const nh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const nm = String(totalMins % 60).padStart(2, '0');
    return `${nh}:${nm}`;
  };

  const arrInputs = card.querySelectorAll('.v-st-arr');
  const depInputs = card.querySelectorAll('.v-st-dep');
  arrInputs.forEach(i => { if (i.value) i.value = shiftTimeStr(i.value.trim()); });
  depInputs.forEach(i => { if (i.value) i.value = shiftTimeStr(i.value.trim()); });
  shiftInput.value = '';
  showToast(`全駅時刻を ${shift > 0 ? '+' : ''}${shift} 分シフトしました`);
}

function addVariantStationRow(btn) {
  const tbody = btn.previousElementSibling.querySelector('tbody') || btn.closest('.variant-card').querySelector('.v-stations-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding: 2px 4px;">
      <select class="form-input v-st-code" style="padding: 2px 4px; font-size: 0.78rem;">
        ${stationsData.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
      </select>
    </td>
    <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-arr" value="" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
    <td style="padding: 2px 4px;"><input type="text" class="form-input v-st-dep" value="" placeholder="null" style="padding: 2px 6px; font-size: 0.78rem;"></td>
    <td style="padding: 2px 4px; text-align:right;"><button type="button" class="btn-admin btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="this.closest('tr').remove()">×</button></td>
  `;
  tbody.appendChild(tr);
}

// --- Partial Cancellations & Stations Helpers ---
function addPCRow() {
  const tbody = document.getElementById('edit-pc-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding: 4px;">
      <input type="text" class="form-input pc-date" data-is-datepicker="true" data-range="true" value="" placeholder="YYYY-MM-DD または YYYY-MM-DD~YYYY-MM-DD" style="width:100%;">
    </td>
    <td style="padding: 4px;">
      <select class="form-input pc-start">
        ${stationsData.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
      </select>
    </td>
    <td style="padding: 4px;">
      <select class="form-input pc-end">
        ${stationsData.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
      </select>
    </td>
    <td style="padding: 4px; text-align: right;">
      <button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="this.closest('tr').remove()">削除</button>
    </td>
  `;
  tbody.appendChild(tr);
}

function addStationRow() {
  const tbody = document.getElementById('edit-stations-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding: 4px;"><input type="text" class="form-input st-code" value="" style="width: 60px;"></td>
    <td style="padding: 4px;">新規</td>
    <td style="padding: 4px;"><input type="text" class="form-input st-arr" value="" placeholder="null"></td>
    <td style="padding: 4px;"><input type="text" class="form-input st-dep" value="" placeholder="null"></td>
    <td style="padding: 4px; text-align: right;"><button type="button" class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="this.closest('tr').remove()">削除</button></td>
  `;
  tbody.appendChild(tr);
}

// --- Save Train Data to Memory ---
function saveTrainData() {
  if (!currentTrainId) return;
  const t = timetableData.find(x => x.train_id === currentTrainId);
  if (!t) return;

  t.train_no = document.getElementById('edit-train-no').value.trim();
  const newOpId = document.getElementById('edit-op-id').value.trim();
  if (t.operation_id !== newOpId) {
    t.operation_id = newOpId;
    if (t.operation_dict) {
      delete t.operation_dict;
    }
  }
  t.direction = document.getElementById('edit-dir').value;
  t.destination = document.getElementById('edit-dest').value.trim();

  // Operation Rule
  if (!t.operation_rule) t.operation_rule = { service_type: 'regular', days_off: [] };
  t.operation_rule.service_type = document.getElementById('edit-svc-type').value;

  // Active pills = runs. Inactive = days_off!
  const pills = document.querySelectorAll('#edit-days-pills .day-toggle-pill:not(.holiday)');
  const daysOff = [];
  pills.forEach(p => {
    if (!p.classList.contains('active')) {
      daysOff.push(Number(p.dataset.day));
    }
  });
  t.operation_rule.days_off = daysOff;

  const parseArray = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
  let datesRun = parseArray(document.getElementById('edit-dates-run').value);
  const datesOff = parseArray(document.getElementById('edit-dates-off').value);

  const holidayPill = document.getElementById('edit-pill-holiday');
  if (holidayPill && holidayPill.classList.contains('active')) {
    if (!datesRun.includes('holiday')) datesRun.push('holiday');
  } else {
    datesRun = datesRun.filter(d => d !== 'holiday');
  }

  t.operation_rule.dates_run = datesRun.length > 0 ? datesRun : undefined;
  t.operation_rule.dates_off = datesOff.length > 0 ? datesOff : undefined;

  // Schedule Variants
  const variantCards = document.querySelectorAll('.variant-card');
  const variants = [];
  variantCards.forEach(card => {
    const label = (card.querySelector('.v-label').value || '').trim();
    const destination = (card.querySelector('.v-dest').value || '').trim();
    const dates = (card.querySelector('.v-dates').value || '').split(',').map(s => s.trim()).filter(Boolean);
    const stations = [];
    card.querySelectorAll('.v-stations-tbody tr').forEach(tr => {
      const code = tr.querySelector('.v-st-code').value.trim();
      let arr = tr.querySelector('.v-st-arr').value.trim() || null;
      let dep = tr.querySelector('.v-st-dep').value.trim() || null;
      if (code) stations.push({ code, arr, dep });
    });

    if (dates.length > 0 && stations.length > 0) {
      variants.push({
        label: label || '特別ダイヤ',
        dates,
        destination: destination || undefined,
        stations
      });
    }
  });
  t.schedule_variants = variants.length > 0 ? variants : undefined;

  // Partial Cancellations
  const pcRows = document.querySelectorAll('#edit-pc-body tr');
  const pc = [];
  pcRows.forEach(tr => {
    const date = tr.querySelector('.pc-date').value.trim();
    const start = tr.querySelector('.pc-start').value;
    const end = tr.querySelector('.pc-end').value;
    if (date && start && end) {
      pc.push({ date, actual_start: start, actual_end: end });
    }
  });
  t.partial_cancellations = pc.length > 0 ? pc : undefined;

  // Base Station Timetable
  const stRows = document.querySelectorAll('#edit-stations-body tr');
  t.stations = [];
  stRows.forEach(tr => {
    const code = tr.querySelector('.st-code').value.trim();
    let arr = tr.querySelector('.st-arr').value.trim() || null;
    let dep = tr.querySelector('.st-dep').value.trim() || null;
    if (code) {
      t.stations.push({ code, arr, dep });
    }
  });

  dirtyTrainIds.add(t.train_id);
  saveDraftToStorage();
  updateSyncStatus();
  renderTrainList();
  showToast(`列車 ${t.train_no} の変更をメモリに適用しました`);
}

// --- Operations Base View ---
const DAYS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'holiday'];
const DAYS_LABELS = { sun:'日', mon:'月', tue:'火', wed:'水', thu:'木', fri:'金', sat:'土', holiday:'祝' };

function renderOperationsView() {
  const opList = document.getElementById('op-list');
  if (!opList) return;

  const ops = new Set();
  manualOperations.forEach(o => ops.add(o));
  timetableData.forEach(t => {
    if (t.operation_dict) {
      Object.values(t.operation_dict).forEach(opstr => {
        opstr.split(',').map(s=>s.trim()).filter(Boolean).forEach(o => ops.add(o));
      });
    } else if (t.operation_id) {
      t.operation_id.toString().split(',').map(s=>s.trim()).filter(Boolean).forEach(o => ops.add(o));
    }
  });

  if (ops.size === 0) {
    opList.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 32px 16px; background: var(--bg-card); border-radius: 8px;">
        運用データがありません。右上の「＋ 運用を追加」から運用を作成してください。
      </div>
    `;
    return;
  }

  let html = '';
  Array.from(ops).sort().forEach(op => {
    html += `
      <div class="op-card" style="background: var(--bg-card); padding: 16px; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">運用 ${escapeHTML(op)}</h3>
          <button type="button" class="btn-admin btn-danger" style="padding: 3px 8px; font-size: 0.75rem; min-width: auto;" onclick="handleDeleteOperation('${escapeHTML(op)}')">運用を削除</button>
        </div>

        <div style="margin-top:12px;">
          <strong style="display:block; margin-bottom:8px; font-size:0.85rem; color: var(--text-secondary);">▼ 曜日ごとの充当列車 (列車番号をカンマ区切り)</strong>
    `;

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
          <span style="color:var(--text-secondary); width:32px; font-weight:600;">${DAYS_LABELS[dayKey]}</span>
          <input type="text" class="form-input op-edit-input" style="flex:1; padding:4px 8px; font-size:0.85rem;"
            data-op="${escapeHTML(op)}" data-day="${dayKey}" value="${escapeHTML(trainsAssigned.join(', '))}" placeholder="例: 103, 105">
        </div>
      `;
    });

    html += `</div></div>`;
  });

  html += `
    <div style="grid-column: 1 / -1; margin-top: 16px;">
      <button type="button" class="btn-admin btn-success" onclick="saveOperationsToMemory()">変更を適用 (メモリ)</button>
      <button type="button" class="btn-admin" onclick="renderOperationsView()" style="margin-left:8px;">リセット</button>
      <p style="font-size:0.8rem; margin-top:8px; color:var(--text-secondary);">※変更を適用後、上部の「GitHubへ反映」を押して保存してください。</p>
    </div>
  `;
  opList.innerHTML = html;
}

function handleAddNewOperation() {
  const input = document.getElementById('new-op-input');
  if (!input) return;
  const newOp = input.value.trim();
  if (!newOp) {
    alert('追加する運用名を入力してください (例: 14-7)');
    return;
  }
  manualOperations.add(newOp);
  input.value = '';
  renderOperationsView();
  showToast(`運用 ${newOp} を追加しました`);
}

function handleDeleteOperation(op) {
  if (!confirm(`運用「${op}」を削除しますか？\n（充当されている列車からこの運用設定が解除されます）`)) return;
  manualOperations.delete(op);

  timetableData.forEach(t => {
    let changed = false;
    if (t.operation_dict) {
      DAYS_KEYS.forEach(d => {
        if (t.operation_dict[d]) {
          const opsArray = t.operation_dict[d].split(',').map(s => s.trim()).filter(s => s && s !== op);
          t.operation_dict[d] = opsArray.join(', ');
          changed = true;
        }
      });
    }
    if (t.operation_id) {
      const opsArray = t.operation_id.toString().split(',').map(s => s.trim()).filter(s => s && s !== op);
      t.operation_id = opsArray.join(', ');
      changed = true;
    }
    if (changed) dirtyTrainIds.add(t.train_id);
  });

  saveDraftToStorage();
  updateSyncStatus();
  renderOperationsView();
  renderTrainList();
  showToast(`運用 ${op} を削除しました`);
}

function saveOperationsToMemory() {
  const inputs = document.querySelectorAll('.op-edit-input');

  timetableData.forEach(t => {
    if (!t.operation_dict) {
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
    const trainNos = input.value.split(',').map(s => s.trim()).filter(Boolean);

    trainNos.forEach(tNo => {
      const targetTrain = timetableData.find(t => t.train_no === tNo);
      if (targetTrain) {
        let current = targetTrain.operation_dict[dayKey];
        if (current) {
          targetTrain.operation_dict[dayKey] = current + ", " + op;
        } else {
          targetTrain.operation_dict[dayKey] = op;
        }
        dirtyTrainIds.add(targetTrain.train_id);
      }
    });
  });

  // Simplify operation_dict if identical across days
  timetableData.forEach(t => {
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

  saveDraftToStorage();
  updateSyncStatus();
  renderTrainList();
  renderOperationsView();
  showToast('曜日の充当列車設定をメモリに適用しました');
}

// --- Simulation Tab Engine ---
function isJapaneseHoliday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;

  const fixed = {
    '1-1': '元日',
    '2-11': '建国記念の日',
    '2-23': '天皇誕生日',
    '4-29': '昭和の日',
    '5-3': '憲法記念日',
    '5-4': 'みどりの日',
    '5-5': 'こどもの日',
    '8-11': '山の日',
    '11-3': '文化の日',
    '11-23': '勤労感謝の日'
  };
  const key = `${m}-${d}`;
  if (fixed[key]) return true;

  const vernalDay = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  if (m === 3 && d === vernalDay) return true;
  const autumnDay = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  if (m === 9 && d === autumnDay) return true;

  const getNthMonday = (year, month, n) => {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const dt = new Date(year, month - 1, day);
      if (dt.getMonth() !== month - 1) break;
      if (dt.getDay() === 1) {
        count++;
        if (count === n) return day;
      }
    }
    return -1;
  };

  if (m === 1 && d === getNthMonday(y, 1, 2)) return true;
  if (m === 7 && d === getNthMonday(y, 7, 3)) return true;
  if (m === 9 && d === getNthMonday(y, 9, 3)) return true;
  if (m === 10 && d === getNthMonday(y, 10, 2)) return true;

  // 国民の休日 (Silver Week)
  if (m === 9) {
    const respectMon = getNthMonday(y, 9, 3);
    if (autumnDay === respectMon + 2 && d === respectMon + 1) return true;
  }

  // 振替休日
  const dt = new Date(y, m - 1, d);
  if (dt.getDay() === 1) {
    const prev = new Date(y, m - 1, d - 1);
    const pStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    if (isJapaneseHoliday(pStr)) return true;
  }
  if (m === 5 && d === 6 && (dt.getDay() === 2 || dt.getDay() === 3)) {
    return true;
  }

  return false;
}

function evaluateDateRule(rule, serviceDate, isHoliday) {
  if (!rule || !serviceDate) return false;
  const r = rule.trim();

  // Range YYYY-MM-DD~YYYY-MM-DD or ..
  if (r.includes('~') || r.includes('..')) {
    const parts = r.includes('~') ? r.split('~') : r.split('..');
    const start = parts[0].trim();
    const end = parts[1].trim();
    return serviceDate >= start && serviceDate <= end;
  }

  // Exact date
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) {
    return serviceDate === r;
  }

  if (r.toLowerCase() === 'holiday') return isHoliday;

  const dayOfWeek = new Date(`${serviceDate}T12:00:00+09:00`).getDay();
  const dowMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
  if (dowMap[r.toLowerCase()] !== undefined) {
    return dayOfWeek === dowMap[r.toLowerCase()];
  }

  return false;
}

function isTrainOperatingOnDate(train, serviceDate, isHoliday) {
  if (!train) return false;
  const rule = train.operation_rule || {};

  // 1. Explicit dates_off check
  if (rule.dates_off && rule.dates_off.length > 0) {
    for (const roff of rule.dates_off) {
      if (evaluateDateRule(roff, serviceDate, isHoliday)) return false;
    }
  }

  // 2. Explicit dates_run check
  if (rule.dates_run && rule.dates_run.length > 0) {
    for (const rrun of rule.dates_run) {
      if (evaluateDateRule(rrun, serviceDate, isHoliday)) return true;
    }
  }

  // 3. Weekday days_off check
  const dayOfWeek = new Date(`${serviceDate}T12:00:00+09:00`).getDay();
  const daysOff = rule.days_off || [];
  if (daysOff.includes(dayOfWeek)) {
    return false;
  }

  return true;
}

function runSimulation() {
  const input = document.getElementById('sim-date-input');
  if (!input) return;
  const dateStr = input.value.trim() || new Date().toISOString().split('T')[0];
  input.value = dateStr;

  const isHoliday = isJapaneseHoliday(dateStr);
  const dayOfWeek = new Date(`${dateStr}T12:00:00+09:00`).getDay();
  const dowLabels = ['日', '月', '火', '水', '木', '金', '土'];
  const dayLabel = `${dowLabels[dayOfWeek]}曜${isHoliday ? '・祝日' : ''}`;

  const operating = [];
  const suspended = [];

  timetableData.forEach(t => {
    if (isTrainOperatingOnDate(t, dateStr, isHoliday)) {
      operating.push(t);
    } else {
      suspended.push(t);
    }
  });

  const summary = document.getElementById('sim-summary');
  if (summary) {
    summary.innerHTML = `
      <div><strong>日付:</strong> ${dateStr} (${dayLabel})</div>
      <div><strong>全列車数:</strong> ${timetableData.length}本</div>
      <div><strong style="color:#30d158;">運転:</strong> ${operating.length}本</div>
      <div><strong style="color:#ff6b6b;">運休:</strong> ${suspended.length}本</div>
    `;
  }

  const tbody = document.getElementById('sim-tbody');
  if (!tbody) return;

  if (operating.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-secondary);">この日の運転列車はありません</td></tr>`;
    return;
  }

  const dowKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek];
  tbody.innerHTML = operating.map(t => {
    let effectiveStations = t.stations || [];
    let effectiveDest = t.destination || '';
    let variantBadge = '<span class="sim-badge regular">通常</span>';

    if (t.schedule_variants) {
      const matchV = t.schedule_variants.find(v => {
        return v.dates && v.dates.some(r => evaluateDateRule(r, dateStr, isHoliday));
      });
      if (matchV) {
        if (matchV.stations) effectiveStations = matchV.stations;
        if (matchV.destination) effectiveDest = matchV.destination;
        variantBadge = `<span class="sim-badge variant">${escapeHTML(matchV.label || '特別ダイヤ')}</span>`;
      }
    }

    const firstSt = effectiveStations[0] || {};
    const lastSt = effectiveStations[effectiveStations.length - 1] || {};
    const firstTime = firstSt.dep || firstSt.arr || '--:--';
    const lastTime = lastSt.arr || lastSt.dep || '--:--';
    const svcType = (t.operation_rule && t.operation_rule.service_type) || 'regular';

    let opId = t.operation_id || '--';
    if (t.operation_dict && t.operation_dict[dowKey]) {
      opId = t.operation_dict[dowKey];
    }

    return `
      <tr>
        <td style="font-weight:700;">${escapeHTML(t.train_no)}</td>
        <td><span class="sim-badge ${svcType}">${svcType.toUpperCase()}</span></td>
        <td>${t.direction === 'up' ? '上り' : '下り'}</td>
        <td>${escapeHTML(getStationName(firstSt.code))} → ${escapeHTML(effectiveDest)}</td>
        <td>${firstTime}</td>
        <td>${lastTime}</td>
        <td>${variantBadge}</td>
        <td style="font-weight:600;">${escapeHTML(opId)}</td>
      </tr>
    `;
  }).join('');
}

function setSimDateOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const input = document.getElementById('sim-date-input');
  if (input) input.value = str;
  runSimulation();
}

function setSimNextWeekend() {
  const d = new Date();
  while (d.getDay() !== 6 && d.getDay() !== 0) {
    d.setDate(d.getDate() + 1);
  }
  const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const input = document.getElementById('sim-date-input');
  if (input) input.value = str;
  runSimulation();
}

// --- Diff Modal ---
function openDiffModal() {
  const modal = document.getElementById('diff-modal');
  const tbody = document.getElementById('diff-tbody');
  const summaryText = document.getElementById('diff-summary-text');
  if (!modal || !tbody) return;

  calculateDirtySet();
  const diffs = [];

  const origMap = new Map();
  originalTimetableData.forEach(t => origMap.set(t.train_id, t));

  timetableData.forEach(t => {
    const orig = origMap.get(t.train_id);
    if (!orig) {
      diffs.push({ train: t.train_no || t.train_id, tag: 'add', field: '新規列車', before: '--', after: '新規作成' });
      return;
    }

    if (t.train_no !== orig.train_no) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '列車番号', before: orig.train_no, after: t.train_no });
    }
    if (t.destination !== orig.destination) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '行先', before: orig.destination, after: t.destination });
    }
    if (t.operation_id !== orig.operation_id) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '運用', before: orig.operation_id, after: t.operation_id });
    }

    const origRule = orig.operation_rule || {};
    const curRule = t.operation_rule || {};
    if (JSON.stringify(origRule.days_off || []) !== JSON.stringify(curRule.days_off || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '運休曜日 (days_off)',
        before: JSON.stringify(origRule.days_off || []),
        after: JSON.stringify(curRule.days_off || [])
      });
    }
    if (JSON.stringify(origRule.dates_run || []) !== JSON.stringify(curRule.dates_run || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '特定運転日 (dates_run)',
        before: JSON.stringify(origRule.dates_run || []),
        after: JSON.stringify(curRule.dates_run || [])
      });
    }
    if (JSON.stringify(origRule.dates_off || []) !== JSON.stringify(curRule.dates_off || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '特定運休日 (dates_off)',
        before: JSON.stringify(origRule.dates_off || []),
        after: JSON.stringify(curRule.dates_off || [])
      });
    }
    if (JSON.stringify(orig.schedule_variants || []) !== JSON.stringify(t.schedule_variants || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '特定ダイヤ (variants)',
        before: `${(orig.schedule_variants || []).length}件`,
        after: `${(t.schedule_variants || []).length}件`
      });
    }
    if (JSON.stringify(orig.stations || []) !== JSON.stringify(t.stations || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '基本駅時刻 (stations)',
        before: '元の時刻表',
        after: '時刻変更あり'
      });
    }
  });

  if (diffs.length === 0) {
    if (summaryText) summaryText.textContent = '変更はありません (GitHub最新データと同一です)。';
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-secondary);">変更はありません</td></tr>`;
  } else {
    if (summaryText) summaryText.textContent = `合計 ${diffs.length} 箇所の変更が検出されました。`;
    tbody.innerHTML = diffs.map(d => `
      <tr>
        <td style="font-weight:700;">${escapeHTML(d.train)}</td>
        <td><span class="diff-tag ${d.tag}">${d.tag === 'mod' ? '変更' : (d.tag === 'add' ? '追加' : '削除')}</span></td>
        <td>${escapeHTML(d.field)}</td>
        <td style="color:var(--text-secondary); font-family:monospace;">${escapeHTML(d.before)}</td>
        <td style="color:#30d158; font-family:monospace; font-weight:600;">${escapeHTML(d.after)}</td>
      </tr>
    `).join('');
  }

  modal.style.display = 'flex';
}

function closeDiffModal() {
  const modal = document.getElementById('diff-modal');
  if (modal) modal.style.display = 'none';
}

// --- GitHub Export (Push) ---
async function exportTimetable() {
  if (timetableData.length === 0) {
    alert('データがありません');
    return;
  }

  if (!adminToken) {
    alert('管理者としてログインしていません。');
    return;
  }

  if (dirtyTrainIds.size === 0) {
    if (!confirm('変更はありませんが、GitHubへ最新データを強制プッシュしますか？')) {
      return;
    }
  } else {
    if (!confirm(`未反映の変更が ${dirtyTrainIds.size} 件あります。\nGitHubへ直接プッシュ（反映）しますか？`)) {
      return;
    }
  }

  const badge = document.getElementById('admin-sync-badge');
  const memo = document.getElementById('admin-sync-memo');
  if (badge) {
    badge.className = 'status-badge sync-pushing';
    badge.textContent = 'GitHubへ反映中...';
  }
  if (memo) memo.textContent = 'GAS経由でリポジトリにコミットしています';

  const btns = document.querySelectorAll('button[onclick="exportTimetable()"], #btn-push-github');
  btns.forEach(b => { b.disabled = true; b.classList.add('btn-loading'); });

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
      originalTimetableData = JSON.parse(JSON.stringify(timetableData));
      dirtyTrainIds.clear();
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      updateSyncStatus();
      renderTrainList();
      alert('GitHubへの直接反映（プッシュ）が成功しました！\nGitHub Pagesのデプロイには約1〜2分かかります。');
    } else {
      throw new Error(result.message || '保存に失敗しました');
    }
  } catch (err) {
    console.error(err);
    alert('GitHubプッシュエラー: ' + err.message + '\n安全のため、ローカルファイルへのダウンロードを実行します。');
    downloadTimetableFile();
    updateSyncStatus();
  } finally {
    btns.forEach(b => { b.disabled = false; b.classList.remove('btn-loading'); });
  }
}
