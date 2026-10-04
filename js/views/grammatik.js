/*
 * Grammatik-Training mit importierten Übungseinheiten.
 * Meilenstein 4.
 */
import { h, comingSoon } from '../ui.js';

export const title = 'Grammatik';

export async function render(main) {
  main.append(
    comingSoon(4, 'Übungseinheiten aus deinem Buch (über die Claude-App erzeugt): Regel, Formen, Lückentexte, Multiple Choice und Übersetzungssätze aus Originalautoren – jeweils mit Quellenstatus „geprüft“ oder „bitte prüfen“.')
  );
}
