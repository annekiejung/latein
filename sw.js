/*
 * Service Worker: sorgt dafür, dass die App nach dem ersten Laden komplett
 * offline läuft.
 *
 * Strategie: "Cache first" für die App-Dateien (App-Shell).
 * - Beim Installieren werden alle Dateien aus APP_FILES in einen Cache gelegt,
 *   dessen Name die Versionsnummer enthält.
 * - Beim Aktivieren werden alte Caches gelöscht.
 * - Neue Versionen übernehmen SOFORT (skipWaiting) – sonst kann ein Gerät
 *   dauerhaft an einer alten Version hängen bleiben. Die Seite lädt dann neu
 *   (außer mitten in einer Abfrage, siehe app.js).
 * - reset.html steht absichtlich NICHT in APP_FILES (Reparatur-Seite, immer frisch).
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
  './js/vocab.js',
  './js/vocab-edit.js',
  './js/leitner.js',
  './js/check.js',
  './js/quiz.js',
  './js/gws.js',
  './js/grammar.js',
  './js/morph.js',
  './data/grammatik.json',
  './data/grundwortschatz.json',
  './js/views/start.js',
  './js/views/vokabeln.js',
  './js/views/wortschatz.js',
  './js/views/grammatik.js',
  './js/views/grammatik-formen.js',
  './js/views/pruefung.js',
  './js/views/einstellungen.js',
  './docs/workflow.css',
  './docs/workflow_vokabeln.html',
  './docs/workflow_grammatik.html',
  './workflow_grammatik.pdf',
  './workflow_vokabeln.pdf',
  './icons/icon.svg',
  './icons/icon-180-v2.png',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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
