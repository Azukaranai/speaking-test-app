const APP_CACHE = 'app-v29';
const AUDIO_CACHE = 'audio-v6';

const APP_ASSETS = [
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/data/dialogues.json',
  '/fonts/NotoSansSC-Regular.ttf',
  '/fonts/NotoSansSC-SemiBold.ttf',
  '/fonts/NotoSerifSC-SemiBold.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (![APP_CACHE, AUDIO_CACHE].includes(key)) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'PRECACHE_AUDIO') return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  event.waitUntil(cacheAudio(urls));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst('/index.html', APP_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/audio/')) {
      event.respondWith(cacheFirst(request, AUDIO_CACHE));
      return;
    }

    if (APP_ASSETS.includes(url.pathname)) {
      event.respondWith(cacheFirst(request, APP_CACHE));
      return;
    }
  }

  event.respondWith(networkFirst(request));
});

async function cacheAudio(urls) {
  const cache = await caches.open(AUDIO_CACHE);
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (error) {
      // Ignore failures; partial cache is acceptable.
    }
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && !response.redirected) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && !response.redirected) {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}
