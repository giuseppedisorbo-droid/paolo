const CACHE_NAME = 'peppe-system-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(ASSETS_TO_CACHE.map(url => {
        return fetch(url).then(response => {
          if (!response.ok) throw new Error(`Fetch failed for ${url}`);
          return cache.put(url, response);
        }).catch(err => console.warn('Cache error for', url, err));
      }));
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
