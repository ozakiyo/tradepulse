const CACHE = 'dhamma-v33';
const BASE = new URL('.', self.location).href;
const STATIC = [
  'index.html',
  'style.css',
  'app.js',
  'data/collections.json',
  'data/index.json',
  'manifest.webmanifest',
];
const DHAMMAPADA = Array.from({ length: 26 }, (_, i) => `data/ch${i + 1}.json`);
const TIPITAKA = [
  'data/tipitaka/index.json',
  ...Array.from({ length: 8 }, (_, i) => `data/tipitaka/tp${i + 1}.json`),
];
const DIGHA = [
  'data/digha/index.json',
  ...Array.from({ length: 34 }, (_, i) => `data/digha/dn${String(i + 1).padStart(2, '0')}.json`),
];
const MAJJHIMA = [
  'data/majjhima/index.json',
  ...Array.from({ length: 152 }, (_, i) => `data/majjhima/mn${String(i + 1).padStart(3, '0')}.json`),
];
const ANGUTTARA = [
  'data/anguttara/index.json',
  ...Array.from({ length: 11 }, (_, i) => `data/anguttara/a${String(i + 1).padStart(2, '0')}.json`),
];
const SAMYUTTA = [
  'data/samyutta/index.json',
  ...Array.from({ length: 56 }, (_, i) => `data/samyutta/sn${String(i + 1).padStart(2, '0')}.json`),
];
const KHUDDAKA = [
  'data/khuddaka/index.json',
  ...Array.from({ length: 15 }, (_, i) => `data/khuddaka/k${String(i + 1).padStart(2, '0')}.json`),
];
const SUTTANIPATA = [
  'data/suttanipata/index.json',
  ...Array.from({ length: 5 }, (_, i) => `data/suttanipata/snp${String(i + 1).padStart(2, '0')}.json`),
];
const ASSETS = [...STATIC, ...DHAMMAPADA, ...TIPITAKA, ...DIGHA, ...MAJJHIMA, ...ANGUTTARA, ...SAMYUTTA, ...KHUDDAKA, ...SUTTANIPATA].map((file) => new URL(file, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
