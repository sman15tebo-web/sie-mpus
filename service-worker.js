// Ganti nama cache ini sesuai nama aplikasimu (bebas)
const CACHE_NAME = 'app-siempus-auto'; 
const urlsToCache = [
  './',
  './index.html',
  './logo.png',
  './manifest.json'
];

// Tahap 1: Install & Simpan file ke memori HP pertama kali
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Tahap 2: Hapus cache lama (jika ada) dan aktifkan
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Tahap 3: Fetch - OTOMATIS AMBIL VERSI TERBARU (Network-First)
self.addEventListener('fetch', event => {
  // Biarkan API eksternal (seperti Google Script/Database) tidak ikut ter-cache
  if (event.request.url.includes('script.google.com') || event.request.method !== 'GET') {
      return; 
  }

  event.respondWith(
    fetch(event.request).then(response => {
      // Jika ada internet, simpan memori yang baru
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(() => {
      // Jika HP offline, buka pakai memori (cache)
      return caches.match(event.request);
    })
  );
});
