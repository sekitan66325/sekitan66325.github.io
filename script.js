document.addEventListener('DOMContentLoaded', () => {
  const sizeBadges = document.querySelectorAll('[data-file-size]');

  sizeBadges.forEach(async (badge) => {
    const fileUrl = badge.getAttribute('data-file-size');
    if (!fileUrl) return;

    try {
      // HEADリクエストを送信
      const response = await fetch(fileUrl, { method: 'HEAD' });

      if (!response.ok) {
        console.warn(`[ファイル未検出 404] ${fileUrl}`);
        return;
      }

      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        const formattedSize = formatBytes(bytes);
        // [PDF/12.5KB] の形式で書き換え
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

function switchTab(tabName) {
    // 全タブコンテンツを非表示
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // 全ボタンのアクティブ解除
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    if (tabName === 'library') {
    document.getElementById('tab-library').classList.add('active');
    event.currentTarget.classList.add('active');
    } else if (tabName === 'board') {
    document.getElementById('tab-board').classList.add('active');
    event.currentTarget.classList.add('active');
    // 掲示板を開いた時に最新データをGASから取得する処理を発火
    fetchBoardData();
    }
}

/**
 * タブ切り替え・スライド連動制御
 */
const slider = document.getElementById('app-slider');
const btnLibrary = document.getElementById('btn-tab-library');
const btnBoard = document.getElementById('btn-tab-board');

// ボタンを押して画面をスライド移動させる
function scrollToView(index) {
  const width = window.innerWidth;
  slider.scrollTo({
    left: width * index,
    behavior: 'smooth'
  });
}

// 横スクロールを検知して下部タブのアクティブ状態を追従させる
if (slider) {
  slider.addEventListener('scroll', () => {
    const scrollLeft = slider.scrollLeft;
    const width = window.innerWidth;
    
    // スクロール位置が画面半分の50%を超えたら切り替え
    if (scrollLeft > width * 0.5) {
      btnLibrary.classList.remove('active');
      btnBoard.classList.add('active');
    } else {
      btnLibrary.classList.add('active');
      btnBoard.classList.remove('active');
    }
  });
}
