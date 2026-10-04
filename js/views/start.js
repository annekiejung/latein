/*
 * Startseite: Überblick, Backup-Erinnerung, Installationshinweis fürs iPhone.
 * Zahlen werden nur angezeigt, wenn sie echt sind – keine Fantasie-Statistik.
 */
import { count, getSetting } from '../db.js';
import { h, daysSince, formatDate } from '../ui.js';

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

  // Überblick – solange es noch nichts gibt, das auch ehrlich sagen.
  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Heute'),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, '–'), h('span', {}, 'fällig')),
      h('div', { class: 'stat' }, h('b', {}, vocabCount), h('span', {}, 'Vokabeln')),
      h('div', { class: 'stat' }, h('b', {}, '–'), h('span', {}, 'Tage Serie'))
    ),
    h('p', { class: 'muted', style: 'margin-top:12px' },
      vocabCount === 0
        ? 'Noch keine Vokabeln gespeichert. Import und Abfrage kommen in Meilenstein 2.'
        : 'Die Abfrage mit Leitner-System kommt in Meilenstein 2.')
  ));

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
