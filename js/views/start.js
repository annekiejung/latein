/*
 * Startseite: Überblick, Backup-Erinnerung, Installationshinweis fürs iPhone.
 * Zahlen werden nur angezeigt, wenn sie echt sind – keine Fantasie-Statistik.
 */
import { count, getSetting, getAll } from '../db.js';
import { h, daysSince, formatDate, todayStr } from '../ui.js';
import { formQuestion } from '../vocab.js';
import { isDue, streakInfo, getTestTermine, daysBetween } from '../leitner.js';
import { loadCards, unlockedPackets } from '../gws.js';

export const title = 'Latein-Trainer';

/** Läuft die App als installierte Home-Bildschirm-App? */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function render(main) {
  const vocabCount = await count('vocab');
  const coreCount = await count('coreProgress');
  const grammarCount = await count('grammar');
  const lastBackup = await getSetting('lastBackupAt');

  // Hinweis: App noch nicht installiert
  if (isIOS() && !isStandalone()) {
    main.append(h('div', { class: 'card note' },
      h('h3', {}, 'App auf dem iPhone installieren'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Diese Seite in Safari öffnen.'),
        h('li', {}, 'Unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).'),
        h('li', {}, '„Zum Home-Bildschirm“ wählen und „Hinzufügen“ tippen.'),
        h('li', {}, 'Ab jetzt die App über das neue Symbol starten – dann läuft sie auch offline.')
      ),
      h('p', { class: 'muted' }, 'Wichtig: Deine Daten gehören zur installierten App. Was du vorher im Safari-Tab eingibst, ist dort nicht automatisch zu sehen.')
    ));
  }

  // Überblick – nur echte Zahlen; solange es nichts gibt, das ehrlich sagen.
  const cards = await getAll('vocab');
  const termine = await getTestTermine();
  const due = cards.filter((c) => isDue(c, 'bedeutung', termine)).length +
    cards.filter((c) => formQuestion(c) && isDue(c, 'formen', termine)).length;
  const s = await streakInfo();
  // Grundwortschatz: fällige Wörter der freigeschalteten Pakete (ohne Unterrichtswörter)
  let coreDue = 0;
  try {
    const up = await unlockedPackets();
    coreDue = (await loadCards()).filter((c) => c.paket <= up && !c.imUnterricht && isDue(c, 'bedeutung', {})).length;
  } catch (e) { /* Wortliste nicht geladen – dann eben ohne */ }
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Heute'),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, vocabCount ? due : '–'), h('span', {}, 'Vokabeln fällig')),
      h('div', { class: 'stat' }, h('b', {}, coreDue), h('span', {}, 'Grundwortschatz fällig')),
      h('div', { class: 'stat' }, h('b', {}, s.streak), h('span', {}, s.streak === 1 ? 'Tag Serie' : 'Tage Serie'))
    ),
    vocabCount === 0
      ? h('div', {},
          h('p', { class: 'muted', style: 'margin-top:12px' }, 'Noch keine Unterrichtsvokabeln gespeichert.'),
          h('a', { class: 'btn block', href: '#/wortschatz/lernen' }, 'Grundwortschatz lernen'))
      : h('div', {},
          h('div', { class: 'goal' },
            h('span', {}, `Tagesziel: ${Math.min(s.todayDone, s.goal)} / ${s.goal}`,
              s.todayReached ? ' – erreicht' : ''),
            h('div', { class: 'progress' }, h('span', { style: `width:${Math.min(100, Math.round((s.todayDone / s.goal) * 100))}%` }))),
          h('a', { class: 'btn block', href: '#/vokabeln/lernen', style: 'margin-top:14px' },
            due ? 'Jetzt lernen' : 'Frei üben'))
  ));

  // Anstehende Tests (Intensivmodus)
  const upcoming = Object.entries(termine)
    .map(([name, date]) => ({ name, date, d: daysBetween(todayStr(), date) }))
    .filter((t) => t.d >= 0).sort((a, b) => a.d - b.d);
  if (upcoming.length) {
    main.append(h('div', { class: 'card' },
      h('h3', {}, 'Anstehende Tests'),
      h('ul', { class: 'list' }, upcoming.map((t) => h('li', {},
        h('a', { href: '#/vokabeln/lektion/' + encodeURIComponent(t.name), class: 'row-link' },
          h('span', {}, t.name),
          h('span', { class: 'badge warn' }, t.d === 0 ? 'heute' : t.d === 1 ? 'morgen' : `in ${t.d} Tagen`)))))
    ));
  }

  // Backup-Erinnerung: wenn Daten vorhanden und letztes Backup > 7 Tage her
  const hasData = vocabCount + coreCount + grammarCount > 0;
  const age = daysSince(lastBackup);
  if (hasData && age > 7) {
    main.append(h('div', { class: 'card warn' },
      h('h3', {}, 'Zeit für ein Backup'),
      h('p', {}, lastBackup
        ? `Dein letztes Backup ist ${age} Tage alt (${formatDate(lastBackup)}).`
        : 'Du hast noch nie ein Backup gemacht.'),
      h('p', {}, 'Wenn das Handy kaputtgeht oder der Speicher gelöscht wird, sind sonst alle Lernstände weg.'),
      h('a', { class: 'btn', href: '#/einstellungen' }, 'Zum Backup')
    ));
  }

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Bereiche'),
    h('ul', { class: 'list' },
      h('li', {}, h('a', { href: '#/vokabeln' }, 'Aktuelle Vokabeln'), ' – für den nächsten Test'),
      h('li', {}, h('a', { href: '#/wortschatz' }, 'Grundwortschatz'), ' – langfristig, in Etappen'),
      h('li', {}, h('a', { href: '#/grammatik' }, 'Grammatik'), ' – Einheiten aus deinem Buch üben'),
      h('li', {}, h('a', { href: '#/pruefung' }, 'Prüfungsmodus'), ' – Übersetzung unter Zeitdruck')
    )
  ));

  main.append(h('p', { class: 'muted', style: 'text-align:center;font-size:.8rem' },
    `Version ${self.APP_VERSION} · läuft offline · Daten nur auf diesem Gerät`));
}
