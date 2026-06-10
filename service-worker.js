// ============================================
// Service Worker（PWAのキャッシュ管理）
// アプリの骨組みファイルを端末に保存して、
// 2回目以降の起動を速くする仕組みです。
// ============================================

// キャッシュの名前。アプリを大きく更新したら 'reply-ai-v2' のように
// 数字を上げると、古いキャッシュが自動で削除されます。
const CACHE_VERSION = 'reply-ai-v1';

// 最初にキャッシュしておくファイル一覧（アプリシェル）
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// ============================================
// インストール時：アプリシェルをキャッシュに保存
// ============================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  // 新しいService Workerをすぐ有効にする
  self.skipWaiting();
});

// ============================================
// 有効化時：古いバージョンのキャッシュを削除
// ============================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // すぐにページの管理を始める
  );
});

// ============================================
// 通信時：キャッシュ優先 + 裏でネットワーク更新
// （stale-while-revalidate風の動き）
// ============================================
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // GET以外（POSTなど）はキャッシュしない
  if (request.method !== 'GET') return;

  // 別オリジン（Cloudflare WorkersのAPIなど）は触らず素通しする
  // ※respondWithを呼ばなければブラウザが普通に通信します
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // 1. まずキャッシュを探す
      const cached = await cache.match(request);

      // 2. 裏でネットワークからも取得して、成功したらキャッシュを更新
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);  // オフラインなら諦める

      // 3. キャッシュがあれば即返す（なければネットワークを待つ）
      return cached || networkFetch;
    })
  );
});
