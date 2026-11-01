self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // GAS (script.google.com) への通信は Service Worker で処理せず、ブラウザ標準の通信に任せる
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  // ローカル・静的アセットが古いキャッシュから返らないよう no-cache で取得
  event.respondWith(fetch(event.request, { cache: 'no-cache' }));
});