/*
 * Datenspeicher (IndexedDB) – alles bleibt NUR auf dem Gerät.
 *
 * Stores (Tabellen) – siehe auch CLAUDE.md, Abschnitt "Datenformate":
 *   settings     Einstellungen, Schlüssel-Wert-Paare  { key, value }
 *   vocab        aktuelle Vokabeln (Testvorbereitung)  keyPath "id"
 *   coreProgress Lernstand Grundwortschatz             keyPath "id" (= Wort-ID)
 *   grammar      importierte Grammatik-Einheiten       keyPath "id"
 *   journal      Fehlerjournal-Einträge                keyPath "id"
 *   exams        Klassenarbeits-Termine                keyPath "id"
 *   history      Lern-Sitzungen/Prüfungsergebnisse     keyPath "id"
 *   reports      gemeldete Fehler in Wortschatz-Daten  keyPath "id"
 *
 * Neue Stores: DB_VERSION erhöhen und in upgrade() einen neuen
 * "if (oldVersion < N)"-Block ergänzen. Bestehende Blöcke NIE ändern.
 */

const DB_NAME = 'latein-trainer';
const DB_VERSION = 1;

export const STORES = [
  'settings', 'vocab', 'coreProgress', 'grammar',
  'journal', 'exams', 'history', 'reports'
];

let dbPromise = null;

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('settings', { keyPath: 'key' });
    const vocab = db.createObjectStore('vocab', { keyPath: 'id' });
    vocab.createIndex('lesson', 'lesson');
    db.createObjectStore('coreProgress', { keyPath: 'id' });
    db.createObjectStore('grammar', { keyPath: 'id' });
    db.createObjectStore('journal', { keyPath: 'id' });
    db.createObjectStore('exams', { keyPath: 'id' });
    db.createObjectStore('history', { keyPath: 'id' });
    db.createObjectStore('reports', { keyPath: 'id' });
  }
}

/** Öffnet die Datenbank (nur einmal, danach wird dieselbe Verbindung genutzt). */
export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Hilfsfunktion: IDBRequest in ein Promise verwandeln. */
function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function put(name, value) {
  return done((await store(name, 'readwrite')).put(value));
}

export async function remove(name, key) {
  return done((await store(name, 'readwrite')).delete(key));
}

export async function count(name) {
  return done((await store(name)).count());
}

/**
 * Ersetzt den Inhalt mehrerer Stores in EINER Transaktion.
 * Wenn etwas schiefgeht, bleibt alles wie vorher (wichtig für Backup-Import).
 * @param {Object<string, Array>} data  z. B. { vocab: [...], settings: [...] }
 */
export async function replaceAll(data) {
  const db = await openDB();
  const names = Object.keys(data);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const name of names) {
      const s = tx.objectStore(name);
      s.clear();
      for (const rec of data[name]) s.put(rec);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Abgebrochen'));
  });
}

/* ---------- Einstellungen ---------- */

/** Standardwerte – gelten, solange nichts anderes gespeichert ist. */
export const DEFAULT_SETTINGS = {
  theme: 'light',                       // 'light' | 'dark'
  dailyGoal: 20,                        // Karten pro Tag
  leitnerIntervals: [1, 2, 4, 8, 16],   // Tage für Fach 1–5
  authorFocus: 'mix',                   // Lektüre-Schwerpunkt
  textbook: 'Pontes',
  grade: 10,
  languageOrder: 2,                     // Latein als 2. Fremdsprache
  lastBackupAt: null                    // ISO-Datum des letzten Exports
};

export async function getSetting(key) {
  const rec = await get('settings', key);
  return rec ? rec.value : DEFAULT_SETTINGS[key];
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

/** Erzeugt eine eindeutige ID für neue Datensätze. */
export function newId(prefix = 'id') {
  const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  return `${prefix}_${rnd}`;
}
