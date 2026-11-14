const CACHE_NAME = 'moka-pwa-v20261114';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css?v=20261114',
  './script.js',
  './manifest.json',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
  './assets/hako-dia/favicon.svg',
  './assets/moka14.png',
  './assets/c12mk.png',
  './assets/de10j1.png',
  './assets/moka50.png',
  './assets/j52.png',
  './train-state/',
  './train-state/index.html',
  './train-state/style.css',
  './train-state/script.js',
  './train-state/data/stations.json',
  './train-state/data/timetable.json',
  './train-state/data/today_status.json'
];

// インストール時にコアアセットをプリキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 個別にキャッシュして1件の失敗で全体が中断しないようにする
      for (const url of PRECACHE_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[SW] Precache skip:', url, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// アクティベーション時に旧キャッシュをパージ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 通信制御
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GETリクエスト以外はそのまま
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. 管理画面 (/admin/) および別アプリのサブパス (/box-diagram/) は Service Worker の対象外
  if (url.pathname.includes('/admin') || url.pathname.startsWith('/box-diagram')) {
    return;
  }

  // 2. 外部API (Google Apps Script, Cloudflare Workers, Google Analytics等) はキャッシュせず直接通信
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('docs.google.com')
  ) {
    return;
  }

  // 1. JSONデータ & HTMLページ: Network-First with Cache-Fallback
  //    (通信可能なら最新データを取得しキャッシュ更新。圏外・通信障害時はキャッシュを即返却)
  const isDataOrPage = req.destination === 'document' ||
                       url.pathname.endsWith('.json') ||
                       url.pathname.endsWith('.html') ||
                       url.pathname.endsWith('/');

  if (isDataOrPage) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          // フォールバック
          if (req.destination === 'document') {
            return caches.match('./train-state/index.html') || caches.match('./index.html');
          }
          return new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json;charset=utf-8' }
          });
        })
    );
    return;
  }

  // 2. 静的アセット (CSS, JS, 画像, フォント等): Stale-While-Revalidate
  //    (キャッシュがあれば瞬時に返却し、バックグラウンドで最新を取得)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});
