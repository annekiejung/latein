/*
 * Service Worker: sorgt dafür, dass die App nach dem ersten Laden komplett
 * offline läuft.
 *
 * Strategie: "Cache first" für die App-Dateien (App-Shell).
 * - Beim Installieren werden alle Dateien aus APP_FILES in einen Cache gelegt,
 *   dessen Name die Versionsnummer enthält.
 * - Beim Aktivieren werden alte Caches gelöscht.
 * - Eine neue Version wartet, bis die Seite "SKIP_WAITING" schickt
 *   (Nutzerin tippt auf "Jetzt aktualisieren").
 */
importScripts('./js/version.js');

const CACHE_NAME = 'latein-' + self.APP_VERSION;

// Alle Dateien, die offline verfügbar sein müssen.
// Neue Dateien hier eintragen!
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/version.js',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/backup.js',
  './js/views/start.js',
  './js/views/vokabeln.js',
  './js/views/wortschatz.js',
  './js/views/grammatik.js',
  './js/views/pruefung.js',
  './js/views/einstellungen.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('latein-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Die Seite bittet darum, die wartende neue Version sofort zu aktivieren.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Nur eigene Dateien bedienen; alles andere (gibt es nicht) normal laden.
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() =>
        // Offline und nicht im Cache: bei Seitenaufrufen die Startseite liefern.
        req.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      );
    })
  );
});
