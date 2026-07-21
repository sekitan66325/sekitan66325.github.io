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
let isAnimating = false; // アニメーション中のスクロール割り込みブロック用フラグ
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

  const leftOffset = rect.left - barRect.left - 4; // padding補正
  glider.style.width = `${rect.width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;

  // アクティブ表示の切替
  if (btn0) btn0.classList.toggle('active', index === 0);
  if (btn1) btn1.classList.toggle('active', index === 1);
}

/**
 * ボタンタップ等で該当画面へスムーズスライド
 */
function scrollToView(index) {
  if (!slider) return;
  
  isAnimating = true; // スライド完了まで連動スクロールをブロック
  
  const width = slider.clientWidth;
  slider.scrollTo({
    left: width * index,
    behavior: 'smooth'
  });
  updateGliderPosition(index);

  // 掲示板（index 1）を開いた時にGASからデータを自動読み込み
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
    // ドラッグ中または離した直後のアニメーション移動中はスクロール割り込みを完全に無視
    if (isDragging || isAnimating) return;
    
    const scrollLeft = slider.scrollLeft;
    const width = slider.clientWidth;
    const index = scrollLeft > width * 0.5 ? 1 : 0;
    updateGliderPosition(index);
  });
}

/* --------------------------------------------------------------------------
   ドラッグ・フリック操作（ダイレクト吸着・巻き戻り防止）
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

    // バーからはみ出さない制御
    const maxOffset = barRect.width - glider.clientWidth - 8;
    offsetX = Math.max(0, Math.min(offsetX, maxOffset));

    glider.style.transform = `translateX(${offsetX}px)`;
  };

  const endDrag = (e) => {
    if (!isDragging) return;
    
    isDragging = false;
    isAnimating = true; // 離した瞬間のスライド中も割り込みをブロック
    glider.classList.remove('dragging');

    const dragDuration = Date.now() - dragStartTime;
    const deltaX = currentX - startX;

    const barRect = tabBar.getBoundingClientRect();
    const midPoint = barRect.width / 2;
    const gliderCenter = currentX - barRect.left;

    let targetIndex = 0;

    // 1. フリック判定（短時間のスワイプ操作）
    if (dragDuration < 250 && Math.abs(deltaX) > 20) {
      targetIndex = deltaX > 0 ? 1 : 0;
    } 
    // 2. 最寄り吸着判定（ドラッグを離した位置）
    else {
      targetIndex = gliderCenter > midPoint ? 1 : 0;
    }

    // 離したその場所から目的地のボタンへスムーズ直行
    updateGliderPosition(targetIndex);

    // 画面本体のスライド
    if (slider) {
      const width = slider.clientWidth;
      slider.scrollTo({
        left: width * targetIndex,
        behavior: 'smooth'
      });
    }

    // アニメーション完了後に割り込みブロック解除
    setTimeout(() => {
      isAnimating = false;
    }, 350);
  };

  // イベント登録
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
});
window.addEventListener('resize', () => {
  if (!slider || isDragging || isAnimating) return;
  const index = slider.scrollLeft > slider.clientWidth * 0.5 ? 1 : 0;
  updateGliderPosition(index);
});

/* ==========================================================================
   3. 掲示板API通信処理 (GAS連携)
   ========================================================================== */
// ★デプロイして発行されたウェブアプリURLをここに貼り付けます
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyA_836JV_xFiWXXaVqbifUDkjIxxvY6Bv-CdunB8Jsj3kcMzmBbJIRuKtMJiYEPIrz/exec';

/**
 * 投稿データの取得・画面更新
 */
async function fetchBoardData() {
  try {
    const response = await fetch(GAS_URL);
    const posts = await response.json();
    
    // TODO: ここでDOM操作をして投稿一覧（posts）を画面に描画します
    console.log('取得した投稿:', posts);
  } catch (error) {
    console.error('データ取得エラー:', error);
  }
}

/**
 * 新規投稿の送信
 */
async function submitPost(name, message, password) {
  if (password && password.length < 8) {
    alert('パスワードは8文字以上で入力してください');
    return;
  }

  const payload = {
    action: 'create',
    name: name,
    message: message,
    password: password
  };

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    fetchBoardData(); // 送信後に一覧を更新
  } catch (error) {
    console.error('投稿エラー:', error);
  }
}

/**
 * 投稿の削除
 */
async function deletePost(id, password) {
  const payload = {
    action: 'delete',
    id: id,
    password: password
  };

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (result.status === 'success') {
      alert('削除しました');
      fetchBoardData();
    } else {
      alert(result.message);
    }
  } catch (error) {
    console.error('削除エラー:', error);
  }
}
