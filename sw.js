// Fonctionnement hors connexion : on essaie le réseau, sinon on sert la copie en mémoire.
// Incrémenter CACHE à chaque publication.
const CACHE = 'cis-v5';
const FILES = ['./', 'index.html', 'style.css', 'engine.js', 'import.js', 'app.js', 'data/demo.json', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('index.html')))
  );
});
