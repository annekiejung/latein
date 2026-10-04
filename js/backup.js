/*
 * Backup: alle Daten als JSON-Datei exportieren bzw. wieder importieren.
 *
 * Dateiformat (siehe CLAUDE.md):
 * {
 *   "app": "latein-trainer",
 *   "format": 1,                 // Version des Backup-Formats
 *   "appVersion": "0.1.0",
 *   "exportedAt": "2026-10-04T18:00:00.000Z",
 *   "stores": { "settings": [...], "vocab": [...], ... }
 * }
 */
import { STORES, getAll, replaceAll, setSetting } from './db.js';
import { h, dialog, toast, formatDate } from './ui.js';

const BACKUP_FORMAT = 1;

/** Sammelt alle Daten aus allen Stores. */
export async function buildBackup() {
  const stores = {};
  for (const name of STORES) stores[name] = await getAll(name);
  return {
    app: 'latein-trainer',
    format: BACKUP_FORMAT,
    appVersion: self.APP_VERSION,
    exportedAt: new Date().toISOString(),
    stores
  };
}

/**
 * Export-Ablauf. Auf dem iPhone geht das über "Teilen" → "In Dateien sichern".
 * Wichtig: Safari erlaubt "Teilen" nur direkt nach einem Fingertipp. Deshalb
 * wird die Datei ZUERST vorbereitet und dann ein Dialog mit eigenem Knopf
 * gezeigt – dessen Tipp ist dann der "frische" Fingertipp.
 */
export async function exportBackup() {
  const data = await buildBackup();
  // Fortschritt/Einstellungen ohne das Backup-Datum selbst zählen
  const total = Object.entries(data.stores)
    .filter(([n]) => n !== 'settings')
    .reduce((sum, [, arr]) => sum + arr.length, 0);
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(
    [JSON.stringify(data, null, 2)],
    `latein-backup-${date}.json`,
    { type: 'application/json' }
  );

  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const choice = await dialog({
    title: 'Backup ist bereit',
    body: h('div', {},
      h('p', {}, `Die Datei enthält ${total} Einträge (Vokabeln, Lernstände usw.) und deine Einstellungen.`),
      canShare
        ? h('p', { class: 'muted' }, 'Tippe auf „Sichern“ und wähle dann „In Dateien sichern“ (z. B. in iCloud Drive).')
        : h('p', { class: 'muted' }, 'Die Datei wird heruntergeladen.')
    ),
    buttons: [
      { label: 'Abbrechen', value: false, class: 'secondary' },
      { label: canShare ? 'Sichern' : 'Herunterladen', value: true }
    ]
  });
  if (!choice) return false;

  try {
    if (canShare) {
      await navigator.share({ files: [file], title: 'Latein-Backup' });
    } else {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: file.name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') { toast('Backup abgebrochen.'); return false; }
    throw err;
  }
  await setSetting('lastBackupAt', new Date().toISOString());
  toast('Backup erstellt.');
  return true;
}

/**
 * Prüft eine eingelesene Backup-Datei.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], data?: object }}
 */
export function validateBackup(text) {
  const errors = [];
  const warnings = [];
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['Die Datei ist kein gültiges JSON. Ist es wirklich ein Backup dieser App?'], warnings };
  }
  if (!obj || obj.app !== 'latein-trainer') errors.push('Die Datei stammt nicht aus dieser App.');
  if (typeof obj.format !== 'number') errors.push('Die Datei hat keine Formatangabe.');
  else if (obj.format > BACKUP_FORMAT) errors.push('Die Datei stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.');
  if (!obj.stores || typeof obj.stores !== 'object') errors.push('Die Datei enthält keine Daten.');
  if (errors.length) return { ok: false, errors, warnings };

  const clean = {};
  for (const name of STORES) {
    const arr = obj.stores[name];
    if (arr === undefined) { clean[name] = []; continue; }
    if (!Array.isArray(arr)) { errors.push(`Bereich „${name}“ ist beschädigt.`); continue; }
    const key = name === 'settings' ? 'key' : 'id';
    const bad = arr.filter((r) => !r || typeof r !== 'object' || r[key] == null);
    if (bad.length) errors.push(`Bereich „${name}“: ${bad.length} Einträge ohne Kennung.`);
    clean[name] = arr;
  }
  for (const name of Object.keys(obj.stores)) {
    if (!STORES.includes(name)) warnings.push(`Unbekannter Bereich „${name}“ wird ignoriert.`);
  }
  return { ok: errors.length === 0, errors, warnings, data: { ...obj, stores: clean } };
}

/** Import-Ablauf: Datei wählen → prüfen → Vorschau → bestätigen → ersetzen. */
export async function importBackupFromFile(file) {
  const text = await file.text();
  const result = validateBackup(text);

  if (!result.ok) {
    await dialog({
      title: 'Import nicht möglich',
      body: h('ul', {}, result.errors.map((e) => h('li', {}, e))),
      buttons: [{ label: 'OK', value: true }]
    });
    return false;
  }

  const s = result.data.stores;
  const labels = {
    vocab: 'Aktuelle Vokabeln', coreProgress: 'Grundwortschatz-Lernstände',
    grammar: 'Grammatik-Einheiten', journal: 'Fehlerjournal', exams: 'Klassenarbeiten',
    history: 'Verlauf', reports: 'Gemeldete Einträge'
  };
  const ok = await dialog({
    title: 'Backup einspielen?',
    body: h('div', {},
      h('p', {}, `Backup vom ${formatDate(result.data.exportedAt)} (App-Version ${result.data.appVersion || '?'}):`),
      h('ul', { class: 'list' },
        Object.entries(labels).map(([k, label]) =>
          h('li', {}, `${label}: ${s[k].length}`))
      ),
      result.warnings.length ? h('p', { class: 'muted' }, result.warnings.join(' ')) : null,
      h('p', {}, h('b', {}, 'Achtung: '), 'Alle Daten, die jetzt in der App sind, werden durch das Backup ersetzt. Mach vorher ein Backup, falls du unsicher bist.')
    ),
    buttons: [
      { label: 'Abbrechen', value: false, class: 'secondary' },
      { label: 'Ersetzen', value: true, class: 'danger' }
    ]
  });
  if (!ok) return false;

  await replaceAll(s);
  toast('Backup eingespielt.');
  return true;
}
