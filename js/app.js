/*
 * Einstiegspunkt der App.
 * - Router: Die Adresse nach dem # bestimmt die Ansicht (#/start, #/vokabeln …).
 * - Jede Ansicht ist ein Modul in js/views/ mit
 *     export const title = '…';
 *     export async function render(main, params) { … }
 * - Registriert den Service Worker (Offline-Fähigkeit) und zeigt einen
 *   Hinweis, wenn eine neue Version bereitliegt.
 */
import { openDB, getSetting } from './db.js';
import { applyTheme } from './ui.js';

import * as start from './views/start.js';
import * as vokabeln from './views/vokabeln.js';
import * as wortschatz from './views/wortschatz.js';
import * as grammatik from './views/grammatik.js';
import * as pruefung from './views/pruefung.js';
import * as einstellungen from './views/einstellungen.js';

const ROUTES = { start, vokabeln, wortschatz, grammatik, pruefung, einstellungen };

const main = document.getElementById('view');
const titleEl = document.getElementById('page-title');

/** Zeigt die Ansicht, die zur aktuellen Adresse passt. */
async function route() {
  window.quizActive = false;            // Seitenwechsel beendet eine laufende Abfrage
  // "#/vokabeln/abfrage" → name "vokabeln", params ["abfrage"]
  // (alles nach "?" wird ignoriert – dient nur zum Neu-Zeichnen derselben Seite)
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const view = ROUTES[name] || start;
  const key = ROUTES[name] ? name : 'start';

  document.querySelectorAll('.tabbar a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === key));
  titleEl.textContent = view.title;
  document.title = view.title + ' – Latein-Trainer';

  main.replaceChildren();
  try {
    await view.render(main, params);
  } catch (err) {
    console.error(err);
    main.replaceChildren();
    const p = document.createElement('p');
    p.className = 'card warn';
    p.textContent = 'Hier ist ein Fehler aufgetreten: ' + err.message;
    main.append(p);
  }
  window.scrollTo(0, 0);
}

/**
 * Service Worker anmelden + automatische Updates.
 * - Die Versionsnummer steht in der Adresse (sw.js?v=…): So MUSS das Gerät bei
 *   jeder neuen Version das Skript neu laden (sonst blieb ein iPhone an 0.1.0 hängen).
 * - updateViaCache 'none': Skripte nie aus dem Browser-Zwischenspeicher.
 * - Neue Version übernimmt sofort (skipWaiting in sw.js); die Seite lädt dann neu –
 *   außer mitten in einer Abfrage: dann erst ein Hinweis-Streifen.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker
    .register('./sw.js?v=' + self.APP_VERSION, { updateViaCache: 'none' })
    .then((reg) => {
      // Ältere Versionen ohne skipWaiting: wartende Version anstoßen
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      reg.update().catch(() => {});      // nur mit Internet möglich
    })
    .catch((err) => console.warn('Service Worker:', err));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;   // allererster Start: nichts tun
    if (window.quizActive) {
      banner.hidden = false;
      document.getElementById('btn-update').onclick = () => location.reload();
      return;
    }
    reloading = true;
    location.reload();
  });
}

async function init() {
  await openDB();
  applyTheme(await getSetting('theme'));

  // Browser bitten, die Daten dauerhaft zu behalten (nicht automatisch löschen).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  document.getElementById('btn-settings').addEventListener('click', () => {
    location.hash = '#/einstellungen';
  });
  window.addEventListener('hashchange', route);
  await route();
  registerServiceWorker();
}

init();
