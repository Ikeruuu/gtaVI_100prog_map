// Service worker: permite instalar la app y usarla sin conexión.
// Estrategia: red primero (para ver siempre la última versión) con copia en caché de reserva;
// las teselas del mapa van caché primero porque no cambian.
const SHELL = 'leonida-shell-v5';
const TILES = 'leonida-tiles-v1';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/geo.js', 'js/grid.js', 'js/layers.js', 'js/mapimage.js', 'js/footprints.js', 'js/sync.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'data/map.json', 'data/categories.json', 'data/markers.json', 'data/checklist.json', 'data/buildings.json',
  'icons/icon.svg', 'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/tiles/')) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || Response.error())),
  );
});
