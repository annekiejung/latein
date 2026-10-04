/*
 * Prüfungsmodus: Übersetzung (~100 Wörter) unter Zeitdruck,
 * Prüf-Prompt für die Claude-App erzeugen, Ergebnis eintragen.
 * Meilenstein 5.
 */
import { h, comingSoon } from '../ui.js';

export const title = 'Prüfungsmodus';

export async function render(main) {
  main.append(
    comingSoon(5, 'Originaltexte mit etwa 100 Wörtern, Zeitlimit (z. B. 45 Minuten), Hilfsvokabeln wie in der Klassenarbeit. Die Bewertung machst du danach mit einem fertigen Prompt in der Claude-App – dafür brauchst du Internet.')
  );
}
