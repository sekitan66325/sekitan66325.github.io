self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // GAS (script.google.com) への通信は Service Worker で処理せず、ブラウザ標準の通信に任せる
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  // 通常のネットワークリクエストをそのまま通過させる
  event.respondWith(fetch(event.request));
});