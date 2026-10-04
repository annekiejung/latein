/*
 * Grundwortschatz – strikt getrennt von den aktuellen Vokabeln
 * (eigener Store "coreProgress", eigene Statistik).
 * Meilenstein 3.
 */
import { h, comingSoon } from '../ui.js';

export const title = 'Grundwortschatz';

export async function render(main) {
  main.append(
    h('div', { class: 'card' },
      h('h2', {}, 'Langfristig: Ziel 2500 Wörter'),
      h('p', {}, 'Der Bildungsplan sieht bis Ende Klasse 10 etwa 1200 Wörter vor. Darauf baut der Grundwortschatz in Etappen auf.')
    ),
    comingSoon(3, 'Erste Etappe (ca. 500 häufigste Wörter) in 100er-Paketen. Jede Bedeutung mit Quellenangabe – und „Eintrag melden“, wenn etwas nicht stimmt.')
  );
}
