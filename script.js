// Service Workerの登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });
}

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

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0KB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

/* ==========================================================================
   2. スライド＆ナビゲーション制御
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

if (slider) {
  slider.addEventListener('scroll', () => {
    if (isDragging || isAnimating) return;
    
    const scrollLeft = slider.scrollLeft;
    const width = slider.clientWidth;
    const index = scrollLeft > width * 0.5 ? 1 : 0;
    updateGliderPosition(index);
  });
}

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
   3. 掲示板API通信 ＆ UI描画処理
   ========================================================================== */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyA_836JV_xFiWXXaVqbifUDkjIxxvY6Bv-CdunB8Jsj3kcMzmBbJIRuKtMJiYEPIrz/exec';

let allPosts = [];
let filteredPosts = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

function formatTimestamp(timestampStr) {
  if (!timestampStr) return '';
  const str = String(timestampStr);
  if (str.includes('/') || str.includes('-')) return str;
  
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

async function fetchBoardData() {
  const boardList = document.getElementById('board-list');
  if (!boardList) return;

  try {
    const response = await fetch(GAS_URL);
    allPosts = await response.json();
    filteredPosts = [...allPosts];
    
    renderBoardPosts();
  } catch (error) {
    console.error('データ取得エラー:', error);
    boardList.innerHTML = `<li style="padding: 24px; text-align: center; color: var(--color-error); font-size: 0.85rem;">データの取得に失敗しました。</li>`;
  }
}

function handleSearchInput() {
  const searchInput = document.getElementById('board-search');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (!query) {
    filteredPosts = [...allPosts];
  } else {
    filteredPosts = allPosts.filter(post => {
      const nameStr = post.name !== undefined && post.name !== null ? String(post.name).toLowerCase() : '';
      const messageStr = post.message !== undefined && post.message !== null ? String(post.message).toLowerCase() : '';
      const timeStr = post.timestamp !== undefined && post.timestamp !== null ? String(post.timestamp).toLowerCase() : '';

      return nameStr.includes(query) || messageStr.includes(query) || timeStr.includes(query);
    });
  }

  currentPage = 1;
  renderBoardPosts();
}

function renderBoardPosts() {
  const boardList = document.getElementById('board-list');
  const paginationContainer = document.getElementById('pagination');
  if (!boardList) return;

  if (!filteredPosts || filteredPosts.length === 0) {
    boardList.innerHTML = `<li style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.875rem; list-style: none;">該当する目撃情報は見つかりませんでした。</li>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentPosts = filteredPosts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  boardList.innerHTML = currentPosts.map(post => `
    <li class="board-post-card">
      <div class="post-header">
        <span class="post-author">${escapeHTML(post.name)}</span>
        <span class="post-time">${formatTimestamp(post.timestamp)}</span>
      </div>
      <div class="post-body">${escapeHTML(post.message)}</div>
      <div class="post-actions">
        <button class="post-btn-edit" onclick="handlePostEdit('${post.id}', '${escapeHTML(post.message)}')">編集</button>
        <button class="post-btn-delete" onclick="handlePostDelete('${post.id}')">削除</button>
      </div>
    </li>
  `).join('');

  if (paginationContainer) {
    if (totalPages > 1) {
      paginationContainer.innerHTML = `
        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← 前へ</button>
        <span class="page-info">${currentPage} / ${totalPages}</span>
        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>次へ →</button>
      `;
    } else {
      paginationContainer.innerHTML = '';
    }
  }
}

function changePage(newPage) {
  currentPage = newPage;
  renderBoardPosts();
  const boardSection = document.getElementById('board-list');
  if (boardSection) {
    boardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function handlePostSubmit(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const nameInput = document.getElementById('board-name');
  const messageInput = document.getElementById('board-message') || document.getElementById('board-meaage');
  const passwordInput = document.getElementById('board-password');

  const name = nameInput ? nameInput.value.trim() : '';
  const message = messageInput ? messageInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  const passRegex = /^[a-zA-Z0-9]{4,}$/;
  if (!passRegex.test(password)) {
    alert('暗証番号は半角英数字4桁以上で入力してください。');
    return;
  }

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
      
      const accordion = document.getElementById('form-accordion');
      if (accordion && accordion.classList.contains('open')) {
        toggleFormAccordion();
      }
      
      currentPage = 1;
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

function handlePostEdit(id, currentMessage) {
  const modal = document.getElementById('edit-modal');
  const idInput = document.getElementById('edit-post-id');
  const messageInput = document.getElementById('edit-message');
  const passwordInput = document.getElementById('edit-password');

  if (!modal) return;

  idInput.value = id;
  messageInput.value = currentMessage
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  passwordInput.value = '';

  modal.style.display = 'flex';
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.style.display = 'none';
}

async function submitPostEdit() {
  const id = document.getElementById('edit-post-id').value;
  const message = document.getElementById('edit-message').value.trim();
  const password = document.getElementById('edit-password').value.trim();
  const editSubmitBtn = document.querySelector('#edit-modal button[onclick="submitPostEdit()"]');

  const passRegex = /^[a-zA-Z0-9]{4,}$/;
  if (!passRegex.test(password)) {
    alert('暗証番号は半角英数字4桁以上で入力してください。');
    return;
  }

  if (!message) {
    alert('本文を入力してください。');
    return;
  }

  if (editSubmitBtn) {
    editSubmitBtn.disabled = true;
    editSubmitBtn.textContent = '更新中...';
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
  } finally {
    if (editSubmitBtn) {
      editSubmitBtn.disabled = false;
      editSubmitBtn.textContent = '更新する';
    }
  }
}

function handlePostDelete(id) {
  const modal = document.getElementById('delete-modal');
  const idInput = document.getElementById('delete-post-id');
  const passwordInput = document.getElementById('delete-password');

  if (!modal) return;

  idInput.value = id;
  passwordInput.value = '';

  modal.style.display = 'flex';
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.style.display = 'none';
}

async function submitPostDelete() {
  const id = document.getElementById('delete-post-id').value;
  const password = document.getElementById('delete-password').value.trim();
  const deleteSubmitBtn = document.querySelector('#delete-modal button[onclick="submitPostDelete()"]');

  const passRegex = /^[a-zA-Z0-9]{4,}$/;
  if (!passRegex.test(password)) {
    alert('暗証番号は半角英数字4桁以上で入力してください。');
    return;
  }

  if (deleteSubmitBtn) {
    deleteSubmitBtn.disabled = true;
    deleteSubmitBtn.textContent = '削除中...';
  }

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
      closeDeleteModal();
      fetchBoardData();
    } else {
      alert('削除失敗: ' + (result.message || '暗証番号が間違っています。'));
    }
  } catch (error) {
    console.error('削除エラー:', error);
    alert('通信エラーが発生しました。');
  } finally {
    if (deleteSubmitBtn) {
      deleteSubmitBtn.disabled = false;
      deleteSubmitBtn.textContent = '削除する';
    }
  }
}

function toggleFormAccordion() {
  const accordion = document.getElementById('form-accordion');
  if (!accordion) return;

  accordion.classList.toggle('open');
}
