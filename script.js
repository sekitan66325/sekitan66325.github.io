/* ==========================================================================
   1. PDFファイルサイズの自動動的取得 (HEADリクエスト)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const sizeBadges = document.querySelectorAll('[data-file-size]');

  sizeBadges.forEach(async (badge) => {
    const fileUrl = badge.getAttribute('data-file-size');
    if (!fileUrl) return;

    try {
      const response = await fetch(fileUrl, { method: 'HEAD' });

      if (!response.ok) {
        console.warn(`[ファイル未検出 404] ${fileUrl}`);
        return;
      }

      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        const formattedSize = formatBytes(bytes);
        badge.textContent = `[PDF/${formattedSize}]`;
      } else {
        console.warn(`[Content-Length ヘッダーなし] ${fileUrl}`);
      }
    } catch (error) {
      console.error(`[取得エラー (CORSまたはローカルファイル制限)] ${fileUrl}`, error);
    }
  });
});

/**
 * バイト数を KB や MB 単位に整形する関数
 */
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0KB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}


/* ==========================================================================
   2. スライド＆リキッドグラスバー（割り込み追従完全制御版）
   ========================================================================== */
const slider = document.getElementById('app-slider');
const tabBar = document.getElementById('tab-bar');
const glider = document.getElementById('tab-glider');
const btn0 = document.getElementById('btn-tab-0');
const btn1 = document.getElementById('btn-tab-1');

let isDragging = false;
let isAnimating = false;
let startX = 0;
let currentX = 0;

/**
 * ハイライトつまみの位置と幅を対象ボタンに合わせる関数
 */
function updateGliderPosition(index) {
  const targetBtn = index === 0 ? btn0 : btn1;
  if (!targetBtn || !glider || !tabBar) return;

  const rect = targetBtn.getBoundingClientRect();
  const barRect = tabBar.getBoundingClientRect();

  const leftOffset = rect.left - barRect.left - 4;
  glider.style.width = `${rect.width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;

  if (btn0) btn0.classList.toggle('active', index === 0);
  if (btn1) btn1.classList.toggle('active', index === 1);
}

/**
 * ボタンタップ等で該当画面へスムーズスライド
 */
function scrollToView(index) {
  if (!slider) return;
  
  isAnimating = true;
  
  const width = slider.clientWidth;
  slider.scrollTo({
    left: width * index,
    behavior: 'smooth'
  });
  updateGliderPosition(index);

  if (index === 1 && typeof fetchBoardData === 'function') {
    fetchBoardData();
  }

  setTimeout(() => {
    isAnimating = false;
  }, 350);
}

// 画面直接スワイプ時の下部タブ位置連動
if (slider) {
  slider.addEventListener('scroll', () => {
    if (isDragging || isAnimating) return;
    
    const scrollLeft = slider.scrollLeft;
    const width = slider.clientWidth;
    const index = scrollLeft > width * 0.5 ? 1 : 0;
    updateGliderPosition(index);
  });
}

/* --------------------------------------------------------------------------
   ドラッグ・フリック操作
   -------------------------------------------------------------------------- */
if (tabBar) {
  let dragStartTime = 0;

  const startDrag = (e) => {
    isDragging = true;
    isAnimating = false;
    glider.classList.add('dragging');
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    currentX = startX;
    dragStartTime = Date.now();
  };

  const moveDrag = (e) => {
    if (!isDragging) return;
    currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const barRect = tabBar.getBoundingClientRect();
    let offsetX = currentX - barRect.left - (glider.clientWidth / 2);

    const maxOffset = barRect.width - glider.clientWidth - 8;
    offsetX = Math.max(0, Math.min(offsetX, maxOffset));

    glider.style.transform = `translateX(${offsetX}px)`;
  };

  const endDrag = (e) => {
    if (!isDragging) return;
    
    isDragging = false;
    isAnimating = true;
    glider.classList.remove('dragging');

    const dragDuration = Date.now() - dragStartTime;
    const deltaX = currentX - startX;

    const barRect = tabBar.getBoundingClientRect();
    const midPoint = barRect.width / 2;
    const gliderCenter = currentX - barRect.left;

    let targetIndex = 0;

    if (dragDuration < 250 && Math.abs(deltaX) > 20) {
      targetIndex = deltaX > 0 ? 1 : 0;
    } else {
      targetIndex = gliderCenter > midPoint ? 1 : 0;
    }

    updateGliderPosition(targetIndex);

    if (slider) {
      const width = slider.clientWidth;
      slider.scrollTo({
        left: width * targetIndex,
        behavior: 'smooth'
      });
    }

    setTimeout(() => {
      isAnimating = false;
    }, 350);
  };

  tabBar.addEventListener('mousedown', startDrag);
  tabBar.addEventListener('touchstart', startDrag, { passive: true });

  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  window.addEventListener('touchmove', moveDrag, { passive: true });
  window.addEventListener('touchend', endDrag);
  window.addEventListener('touchcancel', endDrag);
}

// 初期化
window.addEventListener('load', () => {
  updateGliderPosition(0);
  fetchBoardData();
});
window.addEventListener('resize', () => {
  if (!slider || isDragging || isAnimating) return;
  const index = slider.scrollLeft > slider.clientWidth * 0.5 ? 1 : 0;
  updateGliderPosition(index);
});


/* ==========================================================================
   3. 掲示板API通信 ＆ UI描画処理 (GAS連携・完全版)
   ========================================================================== */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyA_836JV_xFiWXXaVqbifUDkjIxxvY6Bv-CdunB8Jsj3kcMzmBbJIRuKtMJiYEPIrz/exec';

/**
 * タイムスタンプの整形（秒単位保持）
 */
function formatTimestamp(timestampStr) {
  if (!timestampStr) return '';
  if (timestampStr.includes('/')) return timestampStr;
  
  const d = new Date(timestampStr);
  if (isNaN(d.getTime())) return timestampStr;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

/**
 * XSS対策用エスケープ関数
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/**
 * 投稿データを取得して画面に表示する
 */
async function fetchBoardData() {
  const boardList = document.getElementById('board-list');
  if (!boardList) return;

  try {
    const response = await fetch(GAS_URL);
    const posts = await response.json();
    
    renderBoardPosts(posts);
  } catch (error) {
    console.error('データ取得エラー:', error);
    boardList.innerHTML = `<li style="padding: 20px; text-align: center; color: #ff5252; list-style: none;">データの取得に失敗しました。</li>`;
  }
}

/**
 * 取得した投稿データをカードとして独立生成・挿入する
 */
function renderBoardPosts(posts) {
  const boardList = document.getElementById('board-list');
  if (!boardList) return;

  if (!posts || posts.length === 0) {
    boardList.innerHTML = `<li style="padding: 20px; text-align: center; color: var(--text-secondary); list-style: none;">目撃情報はまだありません。</li>`;
    return;
  }

  boardList.style.listStyle = 'none';
  boardList.style.padding = '0';
  boardList.style.margin = '0';

  boardList.innerHTML = posts.map(post => `
    <li class="board-post-card" style="
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      list-style: none;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
        <span style="font-weight: bold; font-size: 0.95rem; color: var(--text-primary);">${escapeHTML(post.name)}</span>
        <span style="font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">${formatTimestamp(post.timestamp)}</span>
      </div>

      <div style="font-size: 0.9rem; color: var(--text-primary); white-space: pre-wrap; word-break: break-all; line-height: 1.5; margin-bottom: 12px;">${escapeHTML(post.message)}</div>

      <div style="text-align: right; display: flex; justify-content: flex-end; gap: 12px;">
        <button onclick="handlePostEdit('${post.id}', '${escapeHTML(post.message)}')" style="background: transparent; border: none; color: #4fc3f7; font-size: 0.75rem; cursor: pointer; padding: 2px 6px;">編集</button>
        <button onclick="handlePostDelete('${post.id}')" style="background: transparent; border: none; color: #ff5252; font-size: 0.75rem; cursor: pointer; padding: 2px 6px;">削除</button>
      </div>
    </li>
  `).join('');
}

/**
 * フォーム送信ハンドラー
 */
async function handlePostSubmit(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const nameInput = document.getElementById('board-name');
  const messageInput = document.getElementById('board-message') || document.getElementById('board-meaage');
  const passwordInput = document.getElementById('board-password');

  const name = nameInput ? nameInput.value.trim() : '';
  const message = messageInput ? messageInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!message) {
    alert('目撃情報・本文を入力してください。');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
  }

  const payload = {
    action: 'create',
    name: name,
    message: message,
    password: password
  };

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 'success') {
      alert('投稿が完了しました！');
      if (messageInput) messageInput.value = '';
      if (passwordInput) passwordInput.value = '';
      fetchBoardData();
    } else {
      alert('送信エラー: ' + (result.message || '投稿に失敗しました'));
    }
  } catch (error) {
    console.error('投稿エラー:', error);
    alert('通信エラーが発生しました。');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '投稿する';
    }
  }
}

/**
 * 編集ボタン押下時：モーダル表示
 */
function handlePostEdit(id, currentMessage) {
  const modal = document.getElementById('edit-modal');
  const idInput = document.getElementById('edit-post-id');
  const messageInput = document.getElementById('edit-message');
  const passwordInput = document.getElementById('edit-password');

  if (!modal) return;

  idInput.value = id;
  // エスケープ文字の復元
  messageInput.value = currentMessage
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  passwordInput.value = '';

  modal.style.display = 'flex';
}

/**
 * モーダルを閉じる
 */
function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * 編集データの送信処理
 */
async function submitPostEdit() {
  const id = document.getElementById('edit-post-id').value;
  const message = document.getElementById('edit-message').value.trim();
  const password = document.getElementById('edit-password').value.trim();

  if (!password) {
    alert('暗証番号を入力してください。');
    return;
  }

  if (!message) {
    alert('本文を入力してください。');
    return;
  }

  const payload = {
    action: 'edit',
    id: id,
    message: message,
    password: password
  };

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 'success') {
      alert('投稿を更新しました！');
      closeEditModal();
      fetchBoardData();
    } else {
      alert('編集失敗: ' + (result.message || '暗証番号が間違っています。'));
    }
  } catch (error) {
    console.error('編集エラー:', error);
    alert('通信エラーが発生しました。');
  }
}

/**
 * 投稿の削除処理
 */
async function handlePostDelete(id) {
  const password = prompt('投稿時に設定した4桁の暗証番号を入力してください:');
  if (!password) return;

  const payload = {
    action: 'delete',
    id: id,
    password: password
  };

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 'success') {
      alert('投稿を削除しました。');
      fetchBoardData();
    } else {
      alert('削除失敗: ' + (result.message || '暗証番号が間違っています。'));
    }
  } catch (error) {
    console.error('削除エラー:', error);
    alert('通信エラーが発生しました。');
  }
}
