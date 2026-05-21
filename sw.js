// =============================================
// Service Worker
// キャッシュの名前（バージョンを変えると古いキャッシュが消える）
// ファイルを更新したときは todo-cache-v1をv2, v3 と数字を上げて書き換える
// =============================================
const CACHE_NAME = 'todo-cache-v7.1'

// キャッシュするファイルの一覧
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './data.js',
  './exporter.js',
  './player.js',
  './style.css',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png'
]

// ── インストール時（最初の1回だけ実行） ──
// アプリに必要なファイルをキャッシュに保存する
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE)
    })
  )
  // 新しいService Workerをすぐに有効にする
  self.skipWaiting()
})

// ── アクティベート時（新バージョンに切り替わるとき） ──
// 古いキャッシュを削除する
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          // 今のキャッシュ名と違うものは古いので削除する
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        })
      )
    })
  )
  // すぐに全ページに新しいService Workerを適用する
  self.clients.claim()
})

// ── フェッチ時（ページがファイルを要求するたびに実行） ──
self.addEventListener('fetch', event => {
  // 外部ドメイン（Google Fonts など）はService Worker を経由させない
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        return response
      })
      .catch(() => {
        return caches.match(event.request)
      })
  )
})
