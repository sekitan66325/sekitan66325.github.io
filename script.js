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
   2. スライド＆リキッドグラスバー（ドラッグ追従・ニュイニュイ移動）制御
   ========================================================================== */
const slider = document.getElementById('app-slider');
const tabBar = document.getElementById('tab-bar');
const glider = document.getElementById('tab-glider');
const btn0 = document.getElementById('btn-tab-0');
const btn1 = document.getElementById('btn-tab-1');

let isDragging = false;
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
 * ボタンタップで該当画面へスムーズスライド
 */
function scrollToView(index) {
  if (!slider) return;
  const width = slider.clientWidth;
  slider.scrollTo({
    left: width * index,
    behavior: 'smooth'
  });
  updateGliderPosition(index);
  
  // 掲示板（index 1）を開いた時にGASからデータを自動読み込み（後ほど接続）
  if (index === 1 && typeof fetchBoardData === 'function') {
    fetchBoardData();
  }
}

// 画面直接スワイプ時の下部タブ位置連動
if (slider) {
  slider.addEventListener('scroll', () => {
    if (isDragging) return; // ドラッグ中は連動を一時停止
    const scrollLeft = slider.scrollLeft;
    const width = slider.clientWidth;
    const index = scrollLeft > width * 0.5 ? 1 : 0;
    updateGliderPosition(index);
  });
}

/* --------------------------------------------------------------------------
   ドラッグ・タッチ操作（つまみを掴んで左右にぬるぬる動かす）
   -------------------------------------------------------------------------- */
if (tabBar) {
  const startDrag = (e) => {
    isDragging = true;
    glider.classList.add('dragging');
    startX = e.touches ? e.touches[0].clientX : e.clientX;
  };

  const moveDrag = (e) => {
    if (!isDragging) return;
    currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const barRect = tabBar.getBoundingClientRect();
    let offsetX = currentX - barRect.left - (glider.clientWidth / 2);

    // 移動範囲の制御
    const maxOffset = barRect.width - glider.clientWidth - 8;
    offsetX = Math.max(0, Math.min(offsetX, maxOffset));

    glider.style.transform = `translateX(${offsetX}px)`;
  };

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    glider.classList.remove('dragging');

    const barRect = tabBar.getBoundingClientRect();
    const midPoint = barRect.width / 2;
    const gliderCenter = (currentX || startX) - barRect.left;

    // 放した位置が半分より右なら掲示板へ、左なら運用資料へ
    if (gliderCenter > midPoint) {
      scrollToView(1);
    } else {
      scrollToView(0);
    }
  };

  // マウスイベント
  tabBar.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  // タッチイベント（スマホ用）
  tabBar.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', moveDrag, { passive: true });
  window.addEventListener('touchend', endDrag);
}

// 初期化（読み込み時・リサイズ時の位置合わせ）
window.addEventListener('load', () => {
  updateGliderPosition(0);
});
window.addEventListener('resize', () => {
  if (!slider) return;
  const index = slider.scrollLeft > slider.clientWidth * 0.5 ? 1 : 0;
  updateGliderPosition(index);
});