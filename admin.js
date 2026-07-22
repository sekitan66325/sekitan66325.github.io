// ※ ご自身のGASのWebアプリURLを設定してください
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyA_836JV_xFiWXXaVqbifUDkjIxxvY6Bv-CdunB8Jsj3kcMzmBbJIRuKtMJiYEPIrz/exec';

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
  btn.textContent = '認証中...';

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
    btn.textContent = 'ログイン';
  }
}

/**
 * 2. 初回パスワード変更処理
 */
async function handleChangePassword(e) {
  e.preventDefault();
  const newPass = document.getElementById('new-password').value.trim();

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
  const isPosts = tab === 'posts';
  document.getElementById('panel-posts').style.display = isPosts ? 'block' : 'none';
  document.getElementById('panel-logs').style.display = isPosts ? 'none' : 'block';

  document.getElementById('tab-btn-posts').style.background = isPosts ? 'var(--text-link)' : 'rgba(255, 255, 255, 0.08)';
  document.getElementById('tab-btn-posts').style.color = isPosts ? '#fff' : 'var(--text-primary)';
  document.getElementById('tab-btn-logs').style.background = !isPosts ? 'var(--text-link)' : 'rgba(255, 255, 255, 0.08)';
  document.getElementById('tab-btn-logs').style.color = !isPosts ? '#fff' : 'var(--text-primary)';

  if (!isPosts) fetchAdminLogs();
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
      <div class="post-body">${escapeHTML(p.message)}</div>
      <div class="admin-actions">
        <button class="btn-admin" onclick="openAdminEditModal('${p.id}', '${escapeHTML(p.message)}')">直接編集</button>
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
  }
}

/**
 * 6. 管理者直接編集
 */
function openAdminEditModal(id, currentMsg) {
  document.getElementById('admin-edit-id').value = id;
  document.getElementById('admin-edit-message').value = currentMsg
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  document.getElementById('admin-edit-modal').style.display = 'flex';
}

function closeAdminEditModal() {
  document.getElementById('admin-edit-modal').style.display = 'none';
}

async function submitAdminEdit() {
  const id = document.getElementById('admin-edit-id').value;
  const msg = document.getElementById('admin-edit-message').value.trim();

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