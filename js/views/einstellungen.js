/*
 * Einstellungen: Aussehen, Lernen, Backup, Speicher.
 */
import { getSetting, setSetting, replaceAll, STORES, DEFAULT_SETTINGS } from '../db.js';
import { h, toast, applyTheme, confirmDialog, dialog, formatDate } from '../ui.js';
import { exportBackup, importBackupFromFile } from '../backup.js';

export const title = 'Einstellungen';

const AUTHORS = {
  mix: 'Mischung (noch kein Autor festgelegt)',
  caesar: 'Caesar', cicero: 'Cicero', nepos: 'Nepos', livius: 'Livius',
  plinius: 'Plinius', seneca: 'Seneca',
  catull: 'Catull', ovid: 'Ovid', phaedrus: 'Phaedrus', martial: 'Martial'
};

export async function render(main) {
  const s = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) s[key] = await getSetting(key);

  /* ----- Aussehen ----- */
  const darkToggle = h('input', {
    type: 'checkbox', role: 'switch', 'aria-label': 'Dunkelmodus',
    checked: s.theme === 'dark',
    onchange: async (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      applyTheme(theme);
      await setSetting('theme', theme);
    }
  });
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Aussehen'),
    h('label', { class: 'switch-row' },
      h('span', {}, 'Dunkelmodus'),
      h('span', { class: 'switch' }, darkToggle, h('span'))
    )
  ));

  /* ----- Lernen ----- */
  const goalInput = h('input', { type: 'number', min: 5, max: 200, step: 5, value: s.dailyGoal, inputmode: 'numeric' });
  const intervalInputs = s.leitnerIntervals.map((d) =>
    h('input', { type: 'number', min: 0, max: 365, value: d, inputmode: 'numeric', style: 'text-align:center' }));
  const authorSelect = h('select', {},
    Object.entries(AUTHORS).map(([v, label]) =>
      h('option', { value: v, selected: v === s.authorFocus }, label)));

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Lernen'),
    h('label', { class: 'field' },
      h('span', {}, 'Tagesziel (Karten pro Tag)'), goalInput),
    h('div', { class: 'field' },
      h('span', {}, 'Wiederholung nach … Tagen (Fach 1 bis 5)'),
      h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px' }, intervalInputs),
      h('small', { class: 'muted' }, 'Richtig → ein Fach höher, falsch → zurück in Fach 1. Vorschlag: 1, 2, 4, 8, 16.')
    ),
    h('label', { class: 'field' },
      h('span', {}, 'Lektüre-Schwerpunkt'), authorSelect,
      h('small', { class: 'muted' }, 'Bestimmt später, aus welchen Autoren Übungs- und Prüfungstexte kommen.')),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        const goal = parseInt(goalInput.value, 10);
        const intervals = intervalInputs.map((i) => parseInt(i.value, 10));
        if (!(goal >= 5 && goal <= 200)) return toast('Tagesziel bitte zwischen 5 und 200.');
        if (intervals.some((d) => !(d >= 0 && d <= 365))) return toast('Tage bitte zwischen 0 und 365.');
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i] < intervals[i - 1]) return toast('Die Tage sollten von Fach zu Fach steigen.');
        }
        await setSetting('dailyGoal', goal);
        await setSetting('leitnerIntervals', intervals);
        await setSetting('authorFocus', authorSelect.value);
        toast('Gespeichert.');
      }
    }, 'Speichern')
  ));

  /* ----- Backup ----- */
  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';           // gleiche Datei nochmal wählbar
      if (!file) return;
      if (await importBackupFromFile(file)) location.reload();
    }
  });
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Backup'),
    h('p', {}, 'Deine Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig als Datei, z. B. in iCloud Drive.'),
    h('p', { class: 'muted' }, 'Letztes Backup: ', s.lastBackupAt ? formatDate(s.lastBackupAt) : 'noch keins'),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        try {
          if (await exportBackup()) location.hash = '#/einstellungen?' + Date.now();
        } catch (err) {
          dialog({ title: 'Backup fehlgeschlagen', body: err.message });
        }
      }
    }, 'Backup erstellen'),
    h('button', { class: 'btn secondary block', onclick: () => fileInput.click() }, 'Backup einspielen'),
    fileInput
  ));

  /* ----- Speicher ----- */
  const storageInfo = h('p', { class: 'muted' }, 'Wird geprüft …');
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Speicher'),
    storageInfo,
    h('button', {
      class: 'btn danger block',
      onclick: async () => {
        const ok = await confirmDialog(
          'Alle Daten löschen?',
          'Vokabeln, Lernstände, Fehlerjournal und Einstellungen werden von diesem Gerät gelöscht. Das lässt sich nur mit einem Backup rückgängig machen.',
          'Endgültig löschen', true);
        if (!ok) return;
        const empty = Object.fromEntries(STORES.map((n) => [n, []]));
        await replaceAll(empty);
        applyTheme('light');
        toast('Alle Daten gelöscht.');
        location.hash = '#/start';
      }
    }, 'Alle Daten löschen')
  ));
  showStorageInfo(storageInfo);

  /* ----- Profil (nur Anzeige) ----- */
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Profil'),
    h('p', {}, `Lehrbuch: ${s.textbook} (abgeschlossen) · Klasse ${s.grade} · Latein als ${s.languageOrder}. Fremdsprache`),
    h('p', { class: 'muted' }, 'Grundlage: Bildungsplan Baden-Württemberg 2016, Latein, Gymnasium.')
  ));

  main.append(h('p', { class: 'muted', style: 'text-align:center;font-size:.8rem' },
    `Version ${self.APP_VERSION}`));
}

/** Zeigt, ob der Speicher "dauerhaft" ist und wie viel belegt ist. */
async function showStorageInfo(el) {
  const parts = [];
  try {
    if (navigator.storage && navigator.storage.persisted) {
      parts.push(await navigator.storage.persisted()
        ? 'Speicher ist als dauerhaft markiert.'
        : 'Speicher ist nicht dauerhaft geschützt – regelmäßige Backups sind besonders wichtig.');
    }
    if (navigator.storage && navigator.storage.estimate) {
      const { usage } = await navigator.storage.estimate();
      parts.push(`Belegt: ca. ${(usage / 1024 / 1024).toFixed(1)} MB.`);
    }
  } catch (e) { /* nicht verfügbar */ }
  el.textContent = parts.join(' ') || 'Keine Speicherinfo verfügbar.';
}
