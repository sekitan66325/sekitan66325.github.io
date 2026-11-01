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
    if (!currentTrainId && timetableData.length > 0) {
      editTrain(timetableData[0].train_id);
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
let currentTrainFilter = 'all';
let currentEditorSubTab = 'basic';
let filteredTrainIds = [];
let hasUnappliedFormEdits = false;
let manualOperations = new Set();
let dirtyTrainIds = new Set();
const DRAFT_STORAGE_KEY = 'moka_admin_timetable_draft';

function markEditorUnapplied(flag = true) {
  hasUnappliedFormEdits = flag;
  const hint = document.getElementById('unapplied-hint');
  if (hint) {
    hint.style.display = flag ? 'inline' : 'none';
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const trainsPanel = document.getElementById('panel-trains');
    if (trainsPanel && trainsPanel.classList.contains('show') && currentTrainId) {
      e.preventDefault();
      saveTrainData();
    }
  }
});

// --- Sync Status & Toast ---
function updateSyncStatus() {
  const badge = document.getElementById('admin-sync-badge');
  const memo = document.getElementById('admin-sync-memo');
  if (!badge) return;

  if (dirtyTrainIds.size > 0) {
    badge.className = 'sync-indicator sync-dirty';
    badge.textContent = `未プッシュの変更あり (${dirtyTrainIds.size}件)`;
    if (memo) memo.textContent = 'メモリ・下書きに保存済。「GitHubへ反映」で確定してください';
  } else {
    badge.className = 'sync-indicator sync-ok';
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
            if (!currentTrainId && timetableData.length > 0) editTrain(timetableData[0].train_id);
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
    if (currentTrainId && timetableData.some(x => x.train_id === currentTrainId)) {
      editTrain(currentTrainId);
    } else if (timetableData.length > 0) {
      editTrain(timetableData[0].train_id);
    }
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
      if (currentTrainId && timetableData.some(x => x.train_id === currentTrainId)) {
        editTrain(currentTrainId);
      } else if (timetableData.length > 0) {
        editTrain(timetableData[0].train_id);
      }
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

// --- Train List Filtering & Rendering ---
function setTrainListFilter(filter) {
  currentTrainFilter = filter;
  document.querySelectorAll('#train-filter-bar .filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTrainList();
}

function stepTrain(delta) {
  if (!filteredTrainIds.length) return;
  const idx = filteredTrainIds.indexOf(currentTrainId);
  const nextIdx = idx === -1 ? 0 : (idx + delta + filteredTrainIds.length) % filteredTrainIds.length;
  const nextId = filteredTrainIds[nextIdx];
  editTrain(nextId);
  const activeItem = document.querySelector(`.train-list-item[data-train-id="${CSS.escape(nextId)}"]`);
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
}

function switchEditorSubTab(subTab) {
  currentEditorSubTab = subTab;
  document.querySelectorAll('.editor-subtab').forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === subTab);
  });
  document.querySelectorAll('.editor-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'editor-sec-' + subTab);
  });
}

function renderTrainList() {
  const list = document.getElementById('train-list');
  const countEl = document.getElementById('train-list-count');
  if (!list) return;
  const prevScroll = list.scrollTop;
  const query = (document.getElementById('train-search') ? document.getElementById('train-search').value : '').trim().toLowerCase();

  if (timetableData.length === 0) {
    filteredTrainIds = [];
    if (countEl) countEl.textContent = '';
    list.innerHTML = '<li class="empty-message">データがありません</li>';
    return;
  }

  const filtered = timetableData.filter(t => {
    const svcType = (t.operation_rule && t.operation_rule.service_type) || 'regular';
    if (currentTrainFilter === 'down' && t.direction !== 'down') return false;
    if (currentTrainFilter === 'up' && t.direction !== 'up') return false;
    if (currentTrainFilter === 'special' && svcType === 'regular') return false;
    if (currentTrainFilter === 'dirty' && !dirtyTrainIds.has(t.train_id)) return false;

    if (!query) return true;
    return (t.train_id && String(t.train_id).toLowerCase().includes(query)) ||
           (t.train_no && String(t.train_no).toLowerCase().includes(query)) ||
           (t.operation_id && String(t.operation_id).toLowerCase().includes(query)) ||
           (t.destination && String(t.destination).toLowerCase().includes(query));
  });

  filteredTrainIds = filtered.map(t => t.train_id);
  if (countEl) countEl.textContent = `(${filtered.length}/${timetableData.length})`;

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-message">条件に一致する列車がありません</li>';
    return;
  }

  list.innerHTML = filtered.map(t => {
    const isSelected = t.train_id === currentTrainId;
    const isDirty = dirtyTrainIds.has(t.train_id);
    const svcType = (t.operation_rule && t.operation_rule.service_type) || 'regular';
    const shortTag = svcType === 'sl' ? 'SL' : (svcType === 'extra' ? '臨' : (svcType === 'deadhead' ? '回' : ''));
    const dirShort = t.direction === 'up' ? '上り' : '下り';
    const hasVariants = t.schedule_variants && t.schedule_variants.length > 0;
    const opDisplay = t.operation_dict ? '曜日別' : (t.operation_id || '—');

    return `
      <li class="train-list-item ${isSelected ? 'selected' : ''}" data-train-id="${escapeHTML(t.train_id)}" onclick="editTrain('${escapeHTML(t.train_id)}')">
        <div class="tli-no">
          <span>${escapeHTML(t.train_no)}</span>
          ${shortTag ? `<span class="tli-tag">${shortTag}</span>` : ''}
        </div>
        <div class="tli-route">${dirShort}・${escapeHTML(t.destination || '—')}</div>
        <div class="tli-meta">
          <span>${escapeHTML(opDisplay)}</span>
          ${hasVariants ? '<span title="特定日変更ダイヤあり">*</span>' : ''}
          ${isDirty ? '<span class="dirty-dot" title="未反映の変更あり"></span>' : ''}
        </div>
      </li>
    `;
  }).join('');

  list.scrollTop = prevScroll;
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
  markEditorUnapplied(false);

  renderTrainList();

  const container = document.getElementById('train-editor-container');
  if (!container) return;

  const rule = t.operation_rule || { service_type: 'regular', days_off: [] };
  const daysOff = rule.days_off || [];
  const weekdays = [
    { key: 1, label: '月' },
    { key: 2, label: '火' },
    { key: 3, label: '水' },
    { key: 4, label: '木' },
    { key: 5, label: '金' },
    { key: 6, label: '土' },
    { key: 0, label: '日' }
  ];

  const datesRunStr = (rule.dates_run || []).filter(d => d !== 'holiday').join(',');
  const datesOffStr = (rule.dates_off || []).join(',');
  const hasHolidayOff = daysOff.includes('holiday') || (rule.dates_off || []).includes('holiday');
  const hasHolidayRun = (rule.dates_run || []).includes('holiday');
  const numDaysOff = daysOff.filter(d => typeof d === 'number').length;
  const isHolidayRun = !hasHolidayOff && (
    hasHolidayRun ||
    rule.service_type === 'sl' ||
    (rule.service_type !== 'extra' && numDaysOff === 0)
  );

  const partialCancellations = t.partial_cancellations || [];
  const scheduleVariants = t.schedule_variants || [];
  const specialCount = scheduleVariants.length + partialCancellations.length;
  const stCount = (t.stations || []).length;

  let html = `
    <div class="editor-sticky-bar">
      <div class="editor-header-top">
        <div class="editor-title-group">
          <h3 class="editor-train-title">列車 ${escapeHTML(t.train_no)} <span class="editor-train-id">(ID: ${escapeHTML(t.train_id)})</span></h3>
          <div class="editor-step-btns">
            <button type="button" class="btn-admin btn-compact" onclick="stepTrain(-1)" title="前の列車">‹ 前</button>
            <button type="button" class="btn-admin btn-compact" onclick="stepTrain(1)" title="次の列車">次 ›</button>
          </div>
        </div>
        <div class="editor-apply-group">
          <span id="unapplied-hint" class="unapplied-hint" style="display: none;">未適用の入力あり</span>
          <button type="button" class="btn-admin btn-accent" onclick="saveTrainData()">変更を適用 (メモリ)</button>
        </div>
      </div>

      <div class="editor-subtabs">
        <button type="button" class="editor-subtab ${currentEditorSubTab === 'basic' ? 'active' : ''}" data-subtab="basic" onclick="switchEditorSubTab('basic')">基本・運行ルール</button>
        <button type="button" class="editor-subtab ${currentEditorSubTab === 'stations' ? 'active' : ''}" data-subtab="stations" onclick="switchEditorSubTab('stations')">各駅時刻 (${stCount}駅)</button>
        <button type="button" class="editor-subtab ${currentEditorSubTab === 'variants' ? 'active' : ''}" data-subtab="variants" onclick="switchEditorSubTab('variants')">特定日変更・区間運休${specialCount ? ` (${specialCount})` : ''}</button>
      </div>
    </div>

    <div class="editor-body" oninput="markEditorUnapplied(true)" onchange="markEditorUnapplied(true)">
      <!-- サブタブ 1: 基本・運行ルール -->
      <section id="editor-sec-basic" class="editor-section ${currentEditorSubTab === 'basic' ? 'active' : ''}">
        <h4 class="editor-block-title">基本情報</h4>
        <div class="train-editor-grid-4">
          <div class="form-group">
            <label class="form-label">列車番号</label>
            <input type="text" id="edit-train-no" class="form-input" value="${escapeHTML(t.train_no || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">方向</label>
            <select id="edit-dir" class="form-input">
              <option value="down" ${t.direction === 'down' ? 'selected' : ''}>下り (下館 → 茂木)</option>
              <option value="up" ${t.direction === 'up' ? 'selected' : ''}>上り (茂木 → 下館)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">行先</label>
            <input type="text" id="edit-dest" class="form-input" value="${escapeHTML(t.destination || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">運用番号</label>
            <input type="text" id="edit-op-id" class="form-input" value="${escapeHTML(t.operation_id || '')}">
          </div>
        </div>
        ${t.operation_dict ? '<div class="field-note">※この列車には曜日別運用が設定されています。直接運用番号を書き換えると単一運用へ上書きされます（曜日別編集は「運用ベース管理」タブで行えます）。</div>' : ''}

        <h4 class="editor-block-title">運行ルール (operation_rule)</h4>
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
            <label class="form-label">運転曜日（選択された曜日に運転）</label>
            <div class="day-pills-group" id="edit-days-pills">
              ${weekdays.map(w => {
                const runs = !daysOff.includes(w.key);
                return `<button type="button" class="day-toggle-pill ${runs ? 'active' : ''}" data-day="${w.key}" onclick="toggleDayPill(this)">${w.label}</button>`;
              }).join('')}
              <button type="button" class="day-toggle-pill holiday ${isHolidayRun ? 'active' : ''}" id="edit-pill-holiday" onclick="this.classList.toggle('active'); markEditorUnapplied(true);">祝日</button>
            </div>
            <div class="preset-pills">
              <button type="button" class="preset-pill" onclick="setDayPreset('all')">全日</button>
              <button type="button" class="preset-pill" onclick="setDayPreset('weekday')">平日のみ</button>
              <button type="button" class="preset-pill" onclick="setDayPreset('weekend')">土休日のみ</button>
              <button type="button" class="preset-pill" onclick="setDayPreset('none')">全休</button>
            </div>
          </div>
        </div>

        <div class="train-editor-grid" style="margin-top: 8px;">
          <div class="form-group">
            <label class="form-label">特定運転日 (dates_run) ※期間・連動指定可</label>
            <div class="chip-input-row">
              <input type="text" id="date-run-input" class="form-input" data-is-datepicker="true" data-range="true" placeholder="日付・期間 (例: 2026-08-15, 2026-08-10~2026-08-15)">
              <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'date-run-input')">追加</button>
            </div>
            <div class="chip-input-row">
              <input type="text" id="rule-run-input" class="form-input" placeholder="連動条件 (例: train:6001, op:A1)">
              <button type="button" class="btn-admin" onclick="addDateChip('dates_run', 'rule-run-input')">追加</button>
            </div>
            <input type="hidden" id="edit-dates-run" value="${escapeHTML(datesRunStr)}">
            <div id="dates-run-chips" class="chip-list"></div>
          </div>

          <div class="form-group">
            <label class="form-label">特定運休日 (dates_off) ※期間・連動指定可</label>
            <div class="chip-input-row">
              <input type="text" id="date-off-input" class="form-input" data-is-datepicker="true" data-range="true" placeholder="日付・期間 (例: 2026-08-15, 2026-08-10~2026-08-15)">
              <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'date-off-input')">追加</button>
            </div>
            <div class="chip-input-row">
              <input type="text" id="rule-off-input" class="form-input" placeholder="連動条件 (例: train:6001, op:A1)">
              <button type="button" class="btn-admin" onclick="addDateChip('dates_off', 'rule-off-input')">追加</button>
            </div>
            <input type="hidden" id="edit-dates-off" value="${escapeHTML(datesOffStr)}">
            <div id="dates-off-chips" class="chip-list"></div>
          </div>
        </div>
      </section>

      <!-- サブタブ 2: 基本時刻表データ -->
      <section id="editor-sec-stations" class="editor-section ${currentEditorSubTab === 'stations' ? 'active' : ''}">
        <div class="editor-table-box">
          <div class="editor-table-toolbar">
            <div class="inline-controls">
              <span class="sim-date-label">全駅時刻シフト:</span>
              <input type="number" id="base-shift-mins" class="form-input" placeholder="±分" style="width: 72px; padding: 3px 6px;">
              <button type="button" class="btn-admin btn-compact" onclick="shiftBaseStationTimes()">シフト適用</button>
            </div>
            <button type="button" class="btn-admin btn-compact" onclick="addStationRow()">+ 駅を追加</button>
          </div>
          <table class="editor-table">
            <thead>
              <tr>
                <th style="width: 80px;">駅コード</th>
                <th style="width: 110px;">駅名</th>
                <th>着時刻 (HH:MM / pass)</th>
                <th>発時刻 (HH:MM / pass)</th>
                <th style="width: 64px;"></th>
              </tr>
            </thead>
            <tbody id="edit-stations-body">
              ${(t.stations || []).map(st => `
                <tr>
                  <td><input type="text" class="form-input st-code" value="${escapeHTML(st.code)}"></td>
                  <td>${escapeHTML(getStationName(st.code))}</td>
                  <td><input type="text" class="form-input st-arr" value="${st.arr ? escapeHTML(st.arr) : ''}" placeholder="—"></td>
                  <td><input type="text" class="form-input st-dep" value="${st.dep ? escapeHTML(st.dep) : ''}" placeholder="—"></td>
                  <td style="text-align: right;"><button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">削除</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- サブタブ 3: 特定日変更・区間運休 -->
      <section id="editor-sec-variants" class="editor-section ${currentEditorSubTab === 'variants' ? 'active' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <h4 class="editor-block-title" style="border: none; margin: 0; padding: 0;">特定日・変更ダイヤ (schedule_variants)</h4>
            <span class="sim-date-label">特定日のみ時刻変更・延長運転・行先変更を行う場合の設定</span>
          </div>
          <button type="button" class="btn-admin" onclick="addNewVariant()">+ 変更ダイヤを追加</button>
        </div>
        <div id="variants-container">
          ${scheduleVariants.map((v, vIdx) => renderVariantCard(v, vIdx)).join('')}
        </div>

        <h4 class="editor-block-title" style="margin-top: 24px;">日付指定の区間運休 (partial_cancellations)</h4>
        <div class="editor-table-box">
          <table class="editor-table">
            <thead>
              <tr>
                <th>日付・期間</th>
                <th>実質始発駅</th>
                <th>実質終着駅</th>
                <th style="width: 64px;"></th>
              </tr>
            </thead>
            <tbody id="edit-pc-body">
              ${partialCancellations.map(pc => `
                <tr>
                  <td>
                    <input type="text" class="form-input pc-date" data-is-datepicker="true" data-range="true" value="${escapeHTML(pc.date || '')}" placeholder="YYYY-MM-DD または YYYY-MM-DD~YYYY-MM-DD">
                  </td>
                  <td>
                    <select class="form-input pc-start">
                      ${stationsData.map(s => `<option value="${s.code}" ${s.code === pc.actual_start ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="form-input pc-end">
                      ${stationsData.map(s => `<option value="${s.code}" ${s.code === pc.actual_end ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                  </td>
                  <td style="text-align: right;">
                    <button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">削除</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="padding: 8px 10px; border-top: 1px solid var(--c-border);">
            <button type="button" class="btn-admin btn-compact" onclick="addPCRow()">+ 区間運休を追加</button>
          </div>
        </div>
      </section>
    </div>
  `;

  container.innerHTML = html;

  renderDateChips('dates_run');
  renderDateChips('dates_off');
}

function shiftBaseStationTimes() {
  const shiftInput = document.getElementById('base-shift-mins');
  if (!shiftInput) return;
  const shift = parseInt(shiftInput.value, 10);
  if (isNaN(shift) || shift === 0) {
    alert('シフトする分数 (例: 10 または -5) を入力してください');
    return;
  }
  const shiftTimeStr = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;
    let totalMins = h * 60 + m + shift;
    if (totalMins < 0) totalMins += 1440;
    const nh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const nm = String(totalMins % 60).padStart(2, '0');
    return `${nh}:${nm}`;
  };
  document.querySelectorAll('#edit-stations-body .st-arr, #edit-stations-body .st-dep').forEach(inp => {
    if (inp.value) inp.value = shiftTimeStr(inp.value.trim());
  });
  shiftInput.value = '';
  markEditorUnapplied(true);
  showToast(`基本時刻を ${shift > 0 ? '+' : ''}${shift} 分シフトしました`);
}

// --- Weekday Pills Logic ---
function toggleDayPill(btn) {
  btn.classList.toggle('active');
  markEditorUnapplied(true);
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
  markEditorUnapplied(true);
}

// --- Date Chips Functions (supports range YYYY-MM-DD~YYYY-MM-DD) ---
function addDateChip(type, inputId) {
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  if (!input || !hidden) return;
  const raw = input.value.trim();
  if (!raw) return;

  let current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(val => {
    if (!current.includes(val)) {
      current.push(val);
    }
  });
  hidden.value = current.join(',');
  renderDateChips(type);
  markEditorUnapplied(true);
  input.value = '';
}

function removeDateChip(type, idxOrVal) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  if (!hidden) return;
  let current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (typeof idxOrVal === 'number') {
    current.splice(idxOrVal, 1);
  } else {
    current = current.filter(d => d !== idxOrVal);
  }
  hidden.value = current.join(',');
  renderDateChips(type);
  markEditorUnapplied(true);
}

function renderDateChips(type) {
  const hidden = document.getElementById(type === 'dates_run' ? 'edit-dates-run' : 'edit-dates-off');
  const container = document.getElementById(type === 'dates_run' ? 'dates-run-chips' : 'dates-off-chips');
  if (!hidden || !container) return;
  const current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];

  container.innerHTML = current.map((d, idx) => {
    let display = d;
    if (d.includes('~')) {
      const [s, e] = d.split('~');
      display = `${s} 〜 ${e}`;
    } else if (d.includes('..')) {
      const [s, e] = d.split('..');
      display = `${s} 〜 ${e}`;
    }
    return `
      <div class="date-chip">
        <span>${escapeHTML(display)}</span>
        <button type="button" class="date-chip-remove" onclick="removeDateChip('${type}', ${idx})" title="削除">×</button>
      </div>
    `;
  }).join('');
}

// --- Schedule Variants UI ---
function resolveVariantCard(target) {
  if (target && target.closest) return target.closest('.variant-card');
  return document.querySelector(`.variant-card[data-v-idx="${target}"]`);
}

function renderVariantCard(v, idx) {
  const dates = v.dates || [];
  const stations = v.stations || [];

  return `
    <div class="variant-card" data-v-idx="${idx}">
      <div class="variant-header">
        <div class="inline-controls">
          <input type="text" class="form-input v-label" value="${escapeHTML(v.label || '特別ダイヤ')}" placeholder="ダイヤ名称 (例: SLもおか重連運転)" style="font-weight: 700; width: 220px;">
          <input type="text" class="form-input v-dest" value="${escapeHTML(v.destination || '')}" placeholder="行先変更 (未指定なら通常行先)" style="width: 180px;">
        </div>
        <button type="button" class="btn-admin btn-danger btn-compact" onclick="removeVariantCard(this)">この変更ダイヤを削除</button>
      </div>

      <div class="form-group" style="margin-bottom: 10px;">
        <label class="form-label">適用日付・期間 (カンマ区切り、またはカレンダー選択)</label>
        <input type="text" class="form-input v-dates" data-is-datepicker="true" data-range="true" value="${escapeHTML(dates.join(','))}" placeholder="例: 2026-08-15, 2026-11-03~2026-11-05">
      </div>

      <div class="inline-controls" style="margin-bottom: 8px;">
        <button type="button" class="btn-admin btn-compact" onclick="copyBaseStationsToVariant(this)">基本時刻表からコピー</button>
        <span class="sim-date-label">時刻一括シフト:</span>
        <input type="number" class="form-input v-shift-mins" placeholder="±分" style="width: 72px; padding: 3px 6px;">
        <button type="button" class="btn-admin btn-compact" onclick="shiftVariantTimes(this)">シフト適用</button>
      </div>

      <div class="variant-scroll">
        <table class="editor-table">
          <thead>
            <tr>
              <th>駅</th>
              <th>着 (HH:MM)</th>
              <th>発 (HH:MM)</th>
              <th style="width: 48px;"></th>
            </tr>
          </thead>
          <tbody class="v-stations-tbody">
            ${stations.map(st => `
              <tr>
                <td>
                  <select class="form-input v-st-code">
                    ${stationsData.map(s => `<option value="${s.code}" ${s.code === st.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
                  </select>
                </td>
                <td><input type="text" class="form-input v-st-arr" value="${st.arr ? escapeHTML(st.arr) : ''}" placeholder="—"></td>
                <td><input type="text" class="form-input v-st-dep" value="${st.dep ? escapeHTML(st.dep) : ''}" placeholder="—"></td>
                <td style="text-align: right;"><button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">×</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top: 8px;">
        <button type="button" class="btn-admin btn-compact" onclick="addVariantStationRow(this)">+ 駅を追加</button>
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
  markEditorUnapplied(true);
}

function removeVariantCard(btnOrIdx) {
  const card = resolveVariantCard(btnOrIdx);
  if (card) {
    card.remove();
    markEditorUnapplied(true);
  }
}

function copyBaseStationsToVariant(btnOrIdx) {
  const t = timetableData.find(x => x.train_id === currentTrainId);
  if (!t || !t.stations) return;
  const card = resolveVariantCard(btnOrIdx);
  if (!card) return;
  const tbody = card.querySelector('.v-stations-tbody');
  tbody.innerHTML = t.stations.map(st => `
    <tr>
      <td>
        <select class="form-input v-st-code">
          ${stationsData.map(s => `<option value="${s.code}" ${s.code === st.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="form-input v-st-arr" value="${st.arr ? escapeHTML(st.arr) : ''}" placeholder="—"></td>
      <td><input type="text" class="form-input v-st-dep" value="${st.dep ? escapeHTML(st.dep) : ''}" placeholder="—"></td>
      <td style="text-align: right;"><button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">×</button></td>
    </tr>
  `).join('');
  markEditorUnapplied(true);
  showToast('基本時刻表をコピーしました');
}

function shiftVariantTimes(btnOrIdx) {
  const card = resolveVariantCard(btnOrIdx);
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
    if (isNaN(h) || isNaN(m)) return timeStr;
    let totalMins = h * 60 + m + shift;
    if (totalMins < 0) totalMins += 1440;
    totalMins = totalMins % 1440;
    const nh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const nm = String(totalMins % 60).padStart(2, '0');
    return `${nh}:${nm}`;
  };

  card.querySelectorAll('.v-st-arr, .v-st-dep').forEach(i => {
    if (i.value) i.value = shiftTimeStr(i.value.trim());
  });
  shiftInput.value = '';
  markEditorUnapplied(true);
  showToast(`全駅時刻を ${shift > 0 ? '+' : ''}${shift} 分シフトしました`);
}

function addVariantStationRow(btn) {
  const card = btn.closest('.variant-card');
  const tbody = card ? card.querySelector('.v-stations-tbody') : null;
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="form-input v-st-code">
        ${stationsData.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
      </select>
    </td>
    <td><input type="text" class="form-input v-st-arr" value="" placeholder="—"></td>
    <td><input type="text" class="form-input v-st-dep" value="" placeholder="—"></td>
    <td style="text-align: right;"><button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">×</button></td>
  `;
  tbody.appendChild(tr);
  markEditorUnapplied(true);
}

// --- Partial Cancellations & Stations Helpers ---
function addPCRow() {
  const tbody = document.getElementById('edit-pc-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <input type="text" class="form-input pc-date" data-is-datepicker="true" data-range="true" value="" placeholder="YYYY-MM-DD または YYYY-MM-DD~YYYY-MM-DD">
    </td>
    <td>
      <select class="form-input pc-start">
        ${stationsData.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="form-input pc-end">
        ${stationsData.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
      </select>
    </td>
    <td style="text-align: right;">
      <button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">削除</button>
    </td>
  `;
  tbody.appendChild(tr);
  markEditorUnapplied(true);
}

function addStationRow() {
  const tbody = document.getElementById('edit-stations-body');
  if (!tbody) return;
  const defaultCode = stationsData.length > 0 ? stationsData[0].code : 'M01';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-input st-code" value="${defaultCode}" oninput="const td = this.closest('tr').children[1]; if (td) td.textContent = getStationName(this.value.trim());"></td>
    <td>${escapeHTML(getStationName(defaultCode))}</td>
    <td><input type="text" class="form-input st-arr" value="" placeholder="—"></td>
    <td><input type="text" class="form-input st-dep" value="" placeholder="—"></td>
    <td style="text-align: right;"><button type="button" class="btn-admin btn-danger btn-compact" onclick="this.closest('tr').remove(); markEditorUnapplied(true);">削除</button></td>
  `;
  tbody.appendChild(tr);
  markEditorUnapplied(true);
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
  if (!t.operation_rule) t.operation_rule = { service_type: 'regular' };
  const svcType = document.getElementById('edit-svc-type').value;
  t.operation_rule.service_type = svcType;

  // Active pills = runs. Inactive = days_off
  const pills = document.querySelectorAll('#edit-days-pills .day-toggle-pill:not(.holiday)');
  const daysOff = [];
  pills.forEach(p => {
    if (!p.classList.contains('active')) {
      daysOff.push(Number(p.dataset.day));
    }
  });

  const parseArray = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
  let datesRun = parseArray(document.getElementById('edit-dates-run').value);
  const datesOff = parseArray(document.getElementById('edit-dates-off').value);

  const holidayPill = document.getElementById('edit-pill-holiday');
  const holidayActive = holidayPill && holidayPill.classList.contains('active');
  if (holidayActive) {
    // SL and 7-day regular trains run on holidays naturally; other partial-week or extra trains need 'holiday' in dates_run
    if ((daysOff.length > 0 && svcType !== 'sl') || svcType === 'extra') {
      if (!datesRun.includes('holiday')) datesRun.push('holiday');
    } else {
      datesRun = datesRun.filter(d => d !== 'holiday');
    }
  } else {
    datesRun = datesRun.filter(d => d !== 'holiday');
    if (daysOff.length < 7 && svcType !== 'extra') {
      daysOff.push('holiday');
    }
  }

  if (daysOff.length > 0) t.operation_rule.days_off = daysOff;
  else delete t.operation_rule.days_off;

  if (datesRun.length > 0) t.operation_rule.dates_run = datesRun;
  else delete t.operation_rule.dates_run;

  if (datesOff.length > 0) t.operation_rule.dates_off = datesOff;
  else delete t.operation_rule.dates_off;

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
      const arr = tr.querySelector('.v-st-arr').value.trim() || null;
      const dep = tr.querySelector('.v-st-dep').value.trim() || null;
      if (code) stations.push({ code, arr, dep });
    });

    if (dates.length > 0 && stations.length > 0) {
      const entry = { label: label || '特別ダイヤ', dates };
      if (destination) entry.destination = destination;
      entry.stations = stations;
      variants.push(entry);
    }
  });
  if (variants.length > 0) t.schedule_variants = variants;
  else delete t.schedule_variants;

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
  if (pc.length > 0) t.partial_cancellations = pc;
  else delete t.partial_cancellations;

  // Base Station Timetable
  const stRows = document.querySelectorAll('#edit-stations-body tr');
  t.stations = [];
  stRows.forEach(tr => {
    const code = tr.querySelector('.st-code').value.trim();
    const arr = tr.querySelector('.st-arr').value.trim() || null;
    const dep = tr.querySelector('.st-dep').value.trim() || null;
    if (code) {
      t.stations.push({ code, arr, dep });
    }
  });

  if (originalTimetableData.length > 0) {
    calculateDirtySet();
  } else {
    dirtyTrainIds.add(t.train_id);
  }
  markEditorUnapplied(false);

  // Update header & subtab counts in place
  const titleEl = document.querySelector('.editor-train-title');
  if (titleEl) {
    titleEl.innerHTML = `列車 ${escapeHTML(t.train_no)} <span class="editor-train-id">(ID: ${escapeHTML(t.train_id)})</span>`;
  }
  const stTab = document.querySelector('.editor-subtab[data-subtab="stations"]');
  if (stTab) stTab.textContent = `各駅時刻 (${t.stations.length}駅)`;
  const varTab = document.querySelector('.editor-subtab[data-subtab="variants"]');
  const specialCount = (t.schedule_variants || []).length + (t.partial_cancellations || []).length;
  if (varTab) varTab.textContent = `特定日変更・区間運休${specialCount ? ` (${specialCount})` : ''}`;

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
        opstr.split(',').map(s => s.trim()).filter(Boolean).forEach(o => ops.add(o));
      });
    } else if (t.operation_id) {
      t.operation_id.toString().split(',').map(s => s.trim()).filter(Boolean).forEach(o => ops.add(o));
    }
  });

  if (ops.size === 0) {
    opList.innerHTML = `
      <div class="editor-empty-state" style="grid-column: 1 / -1; border: 1px solid var(--c-border);">
        運用データがありません。右上の「追加」から運用を作成してください。
      </div>
    `;
    return;
  }

  let html = '';
  Array.from(ops).sort().forEach(op => {
    html += `
      <div class="op-card">
        <div class="op-card-head">
          <h3>運用 ${escapeHTML(op)}</h3>
          <button type="button" class="btn-admin btn-danger btn-compact" onclick="handleDeleteOperation('${escapeHTML(op)}')">削除</button>
        </div>
        <div>
          <span class="sim-date-label" style="display: block; margin-bottom: 6px;">曜日ごとの充当列車（列車番号をカンマ区切り）</span>
    `;

    DAYS_KEYS.forEach(dayKey => {
      const trainsAssigned = timetableData.filter(t => {
        let val = '';
        if (t.operation_dict && t.operation_dict[dayKey] !== undefined) {
          val = t.operation_dict[dayKey];
        } else {
          val = t.operation_id || '';
        }
        return val.split(',').map(s => s.trim()).includes(op);
      }).map(t => t.train_no);

      html += `
        <div class="op-day-row">
          <span class="op-day-label">${DAYS_LABELS[dayKey]}</span>
          <input type="text" class="form-input op-edit-input" style="flex: 1; padding: 4px 8px; font-size: 0.82rem;"
            data-op="${escapeHTML(op)}" data-day="${dayKey}" value="${escapeHTML(trainsAssigned.join(', '))}" placeholder="例: 103, 105">
        </div>
      `;
    });

    html += `</div></div>`;
  });

  html += `
    <div style="grid-column: 1 / -1; margin-top: 8px;">
      <div class="inline-controls">
        <button type="button" class="btn-admin btn-accent" onclick="saveOperationsToMemory()">変更を適用 (メモリ)</button>
        <button type="button" class="btn-admin" onclick="renderOperationsView()">リセット</button>
      </div>
      <p class="sync-memo" style="margin-top: 8px;">変更を適用後、上部の「GitHubへ反映」を押して確定してください。</p>
    </div>
  `;
  opList.innerHTML = html;
}

function handleAddNewOperation() {
  const input = document.getElementById('new-op-input');
  if (!input) return;
  const newOp = input.value.trim();
  if (!newOp) {
    alert('追加する運用名を入力してください (例: A1)');
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
    if (changed && originalTimetableData.length === 0) dirtyTrainIds.add(t.train_id);
  });

  if (originalTimetableData.length > 0) calculateDirtySet();
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
        if (originalTimetableData.length === 0) dirtyTrainIds.add(targetTrain.train_id);
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

  if (originalTimetableData.length > 0) calculateDirtySet();
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

function getTrainOpsOnDate(train, serviceDate, isHoliday) {
  if (!train) return [];
  if (train.operation_dict) {
    const dow = new Date(`${serviceDate}T12:00:00+09:00`).getDay();
    const key = isHoliday && train.operation_dict.holiday
      ? 'holiday'
      : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow];
    const raw = train.operation_dict[key] || '';
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (train.operation_id) {
    return String(train.operation_id).split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function evaluateDateRule(rule, serviceDate, isHoliday, evaluatedTrains = new Set()) {
  if (!rule || !serviceDate) return false;
  const r = String(rule).trim();
  const lower = r.toLowerCase();

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

  if (lower === 'holiday') return Boolean(isHoliday);

  const dayOfWeek = new Date(`${serviceDate}T12:00:00+09:00`).getDay();
  const dowMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  if (dowMap[lower] !== undefined) {
    return dayOfWeek === dowMap[lower];
  }
  const dayJa = ['日', '月', '火', '水', '木', '金', '土'];
  if (dayJa.includes(r)) {
    return dayJa[dayOfWeek] === r;
  }

  // Link to another Train ('train:6001')
  if (lower.startsWith('train:')) {
    const targetId = r.substring(6).trim();
    const evalKey = 'train:' + targetId.toLowerCase();
    if (!targetId || evaluatedTrains.has(evalKey)) return false;
    evaluatedTrains.add(evalKey);
    const targetTrain = timetableData.find(t =>
      (t.train_id && String(t.train_id).toLowerCase() === targetId.toLowerCase()) ||
      (t.train_no && String(t.train_no).toLowerCase() === targetId.toLowerCase())
    );
    return targetTrain ? isTrainOperatingOnDate(targetTrain, serviceDate, isHoliday, evaluatedTrains) : false;
  }

  // Link to an Operation ID ('op:A1')
  if (lower.startsWith('op:')) {
    const targetOp = r.substring(3).trim();
    const evalKey = 'op:' + targetOp.toLowerCase();
    if (!targetOp || evaluatedTrains.has(evalKey)) return false;
    evaluatedTrains.add(evalKey);
    const opTrains = timetableData.filter(t =>
      getTrainOpsOnDate(t, serviceDate, isHoliday).some(o => o.toLowerCase() === targetOp.toLowerCase())
    );
    return opTrains.some(t => isTrainOperatingOnDate(t, serviceDate, isHoliday, evaluatedTrains));
  }

  return false;
}

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

  // 1. Explicit dates_off check (highest priority)
  if (datesOff.some(roff => evaluateDateRule(roff, serviceDate, isHoliday, evaluatedTrains))) {
    return false;
  }

  // 2. Partial cancellations -> operates on remaining segment
  if (train.partial_cancellations && train.partial_cancellations.some(p => p.date && evaluateDateRule(p.date, serviceDate, isHoliday, evaluatedTrains))) {
    return true;
  }

  // 3. Explicit dates_run check
  if (datesRun.some(rrun => evaluateDateRule(rrun, serviceDate, isHoliday, evaluatedTrains))) {
    return true;
  }

  // 4. Extra trains only run on explicit dates_run
  if (rule.service_type === 'extra') {
    return false;
  }

  const dayOfWeek = new Date(`${serviceDate}T12:00:00+09:00`).getDay();

  // 5. SL trains run on holidays unless 'holiday' is in days_off
  if (rule.service_type === 'sl') {
    if (isHoliday) {
      return !daysOff.includes('holiday');
    }
    return !daysOff.includes(dayOfWeek);
  }

  // 6. Regular / deadhead trains
  if (isHoliday && daysOff.includes('holiday')) {
    return false;
  }
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek];
  if (daysOff.includes(dayOfWeek) || daysOff.includes(dayKey)) {
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
      <div><strong>日付:</strong> ${escapeHTML(dateStr)} (${escapeHTML(dayLabel)})</div>
      <div><strong>全列車数:</strong> ${timetableData.length}本</div>
      <div><strong style="color: #1b7a2e;">運転:</strong> ${operating.length}本</div>
      <div><strong style="color: var(--c-red);">運休:</strong> ${suspended.length}本</div>
    `;
  }

  const tbody = document.getElementById('sim-tbody');
  if (!tbody) return;

  if (operating.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--c-muted);">この日の運転列車はありません</td></tr>`;
    return;
  }

  tbody.innerHTML = operating.map(t => {
    let effectiveStations = t.stations || [];
    let effectiveDest = t.destination || '';
    const badges = [];

    if (t.schedule_variants) {
      const matchV = t.schedule_variants.find(v =>
        v.dates && v.dates.some(r => evaluateDateRule(r, dateStr, isHoliday))
      );
      if (matchV) {
        if (matchV.stations) effectiveStations = matchV.stations;
        if (matchV.destination) effectiveDest = matchV.destination;
        badges.push(`<span class="sim-badge variant">${escapeHTML(matchV.label || '特別ダイヤ')}</span>`);
      }
    }

    let firstSt = effectiveStations[0] || {};
    let lastSt = effectiveStations[effectiveStations.length - 1] || {};

    if (t.partial_cancellations) {
      const matchPC = t.partial_cancellations.find(p =>
        p.date && evaluateDateRule(p.date, dateStr, isHoliday)
      );
      if (matchPC) {
        const sIdx = effectiveStations.findIndex(s => s.code === matchPC.actual_start);
        const eIdx = effectiveStations.findIndex(s => s.code === matchPC.actual_end);
        if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
          firstSt = effectiveStations[sIdx];
          lastSt = effectiveStations[eIdx];
          effectiveDest = getStationName(lastSt.code);
        }
        badges.push('<span class="sim-badge variant">区間運休</span>');
      }
    }

    const variantBadge = badges.length > 0 ? badges.join(' ') : '<span class="sim-badge regular">通常</span>';
    const firstTime = firstSt.dep || firstSt.arr || '--:--';
    const lastTime = lastSt.arr || lastSt.dep || '--:--';
    const svcType = (t.operation_rule && t.operation_rule.service_type) || 'regular';
    const svcLabelMap = { regular: '普通', sl: 'SL', extra: '臨時', deadhead: '回送' };

    const ops = getTrainOpsOnDate(t, dateStr, isHoliday);
    const opId = ops.length > 0 ? ops.join(', ') : '--';

    return `
      <tr>
        <td style="font-weight: 700;">${escapeHTML(t.train_no)}</td>
        <td><span class="sim-badge ${escapeHTML(svcType)}">${escapeHTML(svcLabelMap[svcType] || svcType)}</span></td>
        <td>${t.direction === 'up' ? '上り' : '下り'}</td>
        <td>${escapeHTML(getStationName(firstSt.code))} → ${escapeHTML(effectiveDest)}</td>
        <td>${escapeHTML(firstTime)}</td>
        <td>${escapeHTML(lastTime)}</td>
        <td>${variantBadge}</td>
        <td style="font-weight: 600;">${escapeHTML(opId)}</td>
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
  if (hasUnappliedFormEdits && currentTrainId) {
    if (confirm('現在編集中の列車フォームに「未適用の入力」があります。\n先にメモリへ適用してから変更内容を確認しますか？')) {
      saveTrainData();
    }
  }

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
      diffs.push({ train: t.train_no, tag: 'mod', field: '列車番号', before: orig.train_no || '', after: t.train_no || '' });
    }
    if (t.direction !== orig.direction) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '方向', before: orig.direction || '', after: t.direction || '' });
    }
    if (t.destination !== orig.destination) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '行先', before: orig.destination || '', after: t.destination || '' });
    }
    if ((t.operation_id || '') !== (orig.operation_id || '')) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '運用番号', before: orig.operation_id || '--', after: t.operation_id || '--' });
    }
    if (JSON.stringify(orig.operation_dict || null) !== JSON.stringify(t.operation_dict || null)) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '曜日別運用 (operation_dict)', before: orig.operation_dict ? '設定あり' : 'なし', after: t.operation_dict ? '設定あり' : 'なし' });
    }

    const origRule = orig.operation_rule || {};
    const curRule = t.operation_rule || {};
    if ((origRule.service_type || 'regular') !== (curRule.service_type || 'regular')) {
      diffs.push({ train: t.train_no, tag: 'mod', field: '種別 (service_type)', before: origRule.service_type || 'regular', after: curRule.service_type || 'regular' });
    }
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
    if (JSON.stringify(orig.partial_cancellations || []) !== JSON.stringify(t.partial_cancellations || [])) {
      diffs.push({
        train: t.train_no,
        tag: 'mod',
        field: '区間運休 (partial_cancellations)',
        before: `${(orig.partial_cancellations || []).length}件`,
        after: `${(t.partial_cancellations || []).length}件`
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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--c-muted);">変更はありません</td></tr>`;
  } else {
    if (summaryText) summaryText.textContent = `合計 ${diffs.length} 箇所の変更が検出されました。`;
    tbody.innerHTML = diffs.map(d => `
      <tr>
        <td style="font-weight: 700;">${escapeHTML(d.train)}</td>
        <td><span class="diff-tag ${d.tag}">${d.tag === 'mod' ? '変更' : (d.tag === 'add' ? '追加' : '削除')}</span></td>
        <td>${escapeHTML(d.field)}</td>
        <td style="color: var(--c-muted); font-family: monospace;">${escapeHTML(d.before)}</td>
        <td style="color: #1b7a2e; font-family: monospace; font-weight: 600;">${escapeHTML(d.after)}</td>
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
  if (hasUnappliedFormEdits && currentTrainId) {
    if (confirm('現在編集中の列車フォームに「未適用の入力」があります。\n先にメモリへ適用してからGitHubへ反映しますか？')) {
      saveTrainData();
    }
  }

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
    badge.className = 'sync-indicator sync-pushing';
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
      markEditorUnapplied(false);
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
