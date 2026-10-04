/*
 * Aktuelle Vokabeln (Testvorbereitung).
 * Meilenstein 2: Import (mit Prüfung + Vorschau), Abfrage Latein→Deutsch,
 * Formen-Abfrage, Leitner-System, Intensivmodus.
 */
import { count } from '../db.js';
import { h, comingSoon } from '../ui.js';

export const title = 'Aktuelle Vokabeln';

export async function render(main) {
  const n = await count('vocab');
  main.append(
    h('div', { class: 'card' },
      h('h2', {}, 'Deine Vokabeln'),
      h('p', {}, n === 0 ? 'Noch keine Vokabeln gespeichert.' : `${n} Vokabeln gespeichert.`)
    ),
    comingSoon(2, 'Vokabeln aus dem Foto (über die Claude-App) importieren, abfragen von Latein nach Deutsch, Formen abfragen (Genitiv/Genus, Stammformen) und Lernen mit 5 Fächern.')
  );
}
