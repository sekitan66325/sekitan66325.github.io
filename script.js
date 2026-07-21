/**
 * 指定したファイルのサイズを取得して指定のHTML要素に表示する関数
 * @param {string} fileUrl - 対象ファイルのパス（例: 'unyou/202607.pdf'）
 * @param {string} elementId - サイズを表示させたいHTML要素のID
 */
async function updateFileSize(fileUrl, elementId) {
  try {
    // HEADリクエストを送り、ヘッダー情報だけを取得（高速・軽量）
    const response = await fetch(fileUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      throw new Error(`ファイルが見つかりません: ${response.status}`);
    }

    // Content-Length ヘッダーからバイト数を取得
    const contentLength = response.headers.get('Content-Length');
    
    if (contentLength) {
      const bytes = parseInt(contentLength, 10);
      const formattedSize = formatBytes(bytes);
      
      // 指定したHTML要素にファイルサイズを反映
      const targetElement = document.getElementById(elementId);
      if (targetElement) {
        targetElement.textContent = formattedSize;
      }
    } else {
      console.warn('Content-Length ヘッダーが取得できませんでした。');
    }
  } catch (error) {
    console.error('ファイルサイズの取得に失敗しました:', error);
  }
}

/**
 * バイト数を KB や MB 単位に整形するヘルパー関数
 */
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ページ読み込み完了時に実行する例
document.addEventListener('DOMContentLoaded', () => {
  // 例: unyou/202607.pdf のサイズを取得し、id="pdf-size" の要素に表示
  updateFileSize('unyou/202607.pdf', 'pdf-size');
});