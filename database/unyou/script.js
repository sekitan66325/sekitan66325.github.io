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
