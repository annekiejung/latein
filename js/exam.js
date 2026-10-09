/*
 * Prüfungsmodus: Übersetzungstexte (~100 Wörter) und Prüfungsversuche.
 *
 * Format "latein-pruefungstext" Version 1 (siehe CLAUDE.md):
 * {
 *   "format": "latein-pruefungstext", "version": 1,
 *   "titel": "…", "einleitung": "deutscher Satz zur Einordnung",
 *   "text": "lateinischer Text OHNE Längenzeichen (Auslassungen als …)",
 *   "quelle": { "autor", "werk", "stelle": "1,2,1–4", "status": "geprüft|bitte prüfen", "link" },
 *   "bearbeitung": "original|gekürzt|angepasst",
 *   "niveau": "leicht|mittel|fordernd",
 *   "schwerpunkte": ["Abl. abs.", …],
 *   "vokabelhilfen": [{ "latein", "deutsch" }],
 *   "musteruebersetzung": "…"
 * }
 * Eingebaute Texte: data/pruefung.json ({ texte: [ {id, woerter, …Format…} ] })
 *
 * Versuche: Store "history", typ "pruefung":
 *   { id, typ, textId, titel, quelle, woerter, limitMin (0 = ohne Zeitlimit),
 *     modus: 'tippen'|'papier', start, abgegeben (ISO|null), sekunden,
 *     uebersetzung, bewertung (null, folgt in 5c) }
 * settings "pruefungLaeuft" = id des laufenden Versuchs (oder null).
 */
import { get, getAll, put, remove, newId, getSetting, setSetting } from './db.js';
import { todayStr } from './ui.js';

export const FORMAT_NAME = 'latein-pruefungstext';
export const NIVEAU = { leicht: 'leicht', mittel: 'mittel', fordernd: 'fordernd' };
export const LIMITS = [30, 45, 60, 0];          // Minuten; 0 = ohne Zeitlimit

let builtIn = null;

/** Eingebaute Texte (offline aus dem Cache). */
async function loadBuiltIn() {
  if (!builtIn) {
    try {
      const res = await fetch('data/pruefung.json');
      builtIn = res.ok ? (await res.json()).texte.map((t) => ({ ...t, eingebaut: true })) : [];
    } catch (e) { builtIn = []; }
  }
  return builtIn;
}

export async function loadTexts() {
  return loadBuiltIn();
}

export async function getText(id) {
  return (await loadTexts()).find((t) => t.id === id) || null;
}

/** Wörter zählen wie tools/build_pruefung.pl (alles mit Buchstaben). */
export function countWords(text) {
  return String(text || '').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
}

/* ---------- Versuche ---------- */

/** Neuen Versuch anlegen und als „laufend“ merken. */
export async function startAttempt(text, limitMin, modus) {
  const rec = {
    id: newId('p'), typ: 'pruefung', textId: text.id, titel: text.titel,
    quelle: text.quelle, woerter: text.woerter || countWords(text.text),
    limitMin, modus, start: new Date().toISOString(), abgegeben: null,
    sekunden: 0, uebersetzung: '', bewertung: null
  };
  await put('history', rec);
  await setSetting('pruefungLaeuft', rec.id);
  return rec;
}

/** Laufender Versuch (oder null, falls keiner/gelöscht). */
export async function runningAttempt() {
  const id = await getSetting('pruefungLaeuft');
  if (!id) return null;
  const rec = await get('history', id);
  if (!rec || rec.abgegeben) { await setSetting('pruefungLaeuft', null); return null; }
  return rec;
}

/** Zwischenstand speichern (während des Schreibens). */
export async function saveDraft(rec) {
  await put('history', rec);
}

/** Abgeben: Zeit festhalten, „laufend“ beenden. */
export async function finishAttempt(rec) {
  rec.abgegeben = new Date().toISOString();
  rec.sekunden = Math.round((Date.parse(rec.abgegeben) - Date.parse(rec.start)) / 1000);
  await put('history', rec);
  await setSetting('pruefungLaeuft', null);
  return rec;
}

/** Versuch verwerfen (z. B. versehentlich gestartet). */
export async function discardAttempt(rec) {
  await remove('history', rec.id);
  await setSetting('pruefungLaeuft', null);
}

export async function getAttempt(id) {
  const rec = await get('history', id);
  return rec && rec.typ === 'pruefung' ? rec : null;
}

/** Alle abgegebenen Versuche, neueste zuerst. */
export async function attempts() {
  return (await getAll('history'))
    .filter((r) => r.typ === 'pruefung' && r.abgegeben)
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** Sekunden → „12:05“ bzw. „1:02:05“. */
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const p = (n) => String(n).padStart(2, '0');
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return (hh ? hh + ':' + p(mm) : mm) + ':' + p(s % 60);
}

/* ---------- Bewertung (Prüf-Prompt + Ergebnis) ---------- */

export const REVIEW_FORMAT = 'latein-pruefung-bewertung';

/** Fehlerkategorien (Schlüssel im Datenblock → Anzeige). */
export const KATEGORIEN = {
  vokabel: 'Vokabel', form: 'Form', konstruktion: 'Konstruktion',
  syntax: 'Satzbau', sinn: 'Sinn', stil: 'Stil'
};

/**
 * Notenschlüssel: höchster Fehlerquotient (Fehlerpunkte pro 100 Wörter) für die
 * Noten 1 bis 5; darüber 6. Einstellung "notenschluessel" – Lehrkräfte machen das
 * unterschiedlich, deshalb nur eine Einschätzung.
 */
export const DEFAULT_SCHLUESSEL = [2, 4, 7, 10, 13];

export function gradeFor(fq, schluessel = DEFAULT_SCHLUESSEL) {
  const i = schluessel.findIndex((max) => fq <= max);
  return i === -1 ? 6 : i + 1;
}

/** Fehlerpunkte, Fehlerquotient und Note aus der Fehlerliste – rechnet die App selbst. */
export function score(fehler, woerter, schluessel) {
  const punkte = fehler.reduce((s, f) => s + f.gewicht, 0);
  const fq = Math.round((punkte * 100 / Math.max(1, woerter)) * 10) / 10;
  return { punkte, fq, note: gradeFor(fq, schluessel) };
}

/** Prüf-Prompt für die Claude-App (Text, Übersetzung, Raster, Antwortformat). */
export function buildExamPrompt(attempt, text, schluessel = DEFAULT_SCHLUESSEL) {
  const q = text.quelle || {};
  const hilfen = (text.vokabelhilfen || []).map((v) => `- ${v.latein}: ${v.deutsch}`).join('\n') || '(keine)';
  const uebersetzung = attempt.modus === 'papier'
    ? 'Meine Übersetzung habe ich mit der Hand geschrieben – sie ist auf dem FOTO im Anhang. Lies sie sorgfältig. Wörter, die du nicht sicher lesen kannst, nennst du in "unleserlich" und wertest sie NICHT als Fehler.'
    : `MEINE ÜBERSETZUNG\n"""\n${attempt.uebersetzung.trim() || '(leer)'}\n"""`;
  const noten = schluessel.map((max, i) => `Note ${i + 1}: bis ${String(max).replace('.', ',')}`).join(' · ') + ` · Note 6: darüber`;
  const zeit = attempt.limitMin
    ? `Zeit: ${Math.round(attempt.sekunden / 60)} von ${attempt.limitMin} Minuten.`
    : `Zeit: ${Math.round(attempt.sekunden / 60)} Minuten (ohne Zeitlimit).`;

  return `Du bist eine strenge, faire Lateinlehrkraft an einem Gymnasium in Baden-Württemberg (Klasse 10, Lektürephase). Korrigiere meine Übersetzung wie eine Klassenarbeit. Sei ehrlich und genau – kein Schönreden, keine übertriebene Freundlichkeit.

LATEINISCHER TEXT (${q.autor}, ${q.werk} ${q.stelle}; ${text.woerter} Wörter)
"""
${text.text}
"""

HILFEN, DIE ICH HATTE
${hilfen}

MUSTERÜBERSETZUNG (nur zur Orientierung – andere richtige Übersetzungen sind KEINE Fehler)
"""
${text.musteruebersetzung}
"""

${uebersetzung}
${zeit}

SO KORRIGIERST DU
1. Gehe den Text Satz für Satz durch und vergleiche mit dem Latein (nicht nur mit der Musterübersetzung).
2. Jeder Fehler bekommt GENAU EINE Kategorie:
   vokabel = falsche/unpassende Wortbedeutung · form = Kasus, Numerus, Tempus, Modus, Genus verbi, Person falsch · konstruktion = AcI, Abl. abs., PC, nd-Formen, cum-Satz usw. nicht erkannt oder falsch aufgelöst · syntax = Bezüge falsch (welches Wort gehört wohin), Satzglieder vertauscht · sinn = Aussage verfälscht, Satzteil ausgelassen oder nicht übersetzt · stil = deutsches Ausdrucksproblem bei richtigem Verständnis
3. Gewicht: 1 = ganzer Fehler, 0,5 = halber Fehler (kleinere Ungenauigkeit), 2 = nur bei schweren Sinnfehlern, die einen ganzen Satz verfälschen. Stilfehler höchstens 0,5. Fehlende Textteile: je fehlender Sinneinheit 1 Fehler. Folgefehler nur einmal zählen. Großzügig bei freien, aber sinngemäß richtigen Lösungen.
4. Notenschlüssel (Fehlerpunkte pro 100 Wörter): ${noten}. Die Note ist eine Einschätzung.
5. Danach: kurzes Gesamturteil (2–3 Sätze, sachlich), höchstens 2 echte Stärken (oder keine), 2–4 konkrete Verbesserungstipps (was genau soll ich üben?).

AUSGABE
Schreib zuerst deine Korrektur für mich gut lesbar (Fehler Satz für Satz, dann Note und Tipps). Gib GANZ AM ENDE genau einen JSON-Codeblock aus, den ich in meine Lern-App kopiere:

\`\`\`json
{
  "format": "${REVIEW_FORMAT}",
  "version": 1,
  "versuch": "${attempt.id}",
  "fehler": [
    { "kategorie": "form", "gewicht": 1, "latein": "persuasit", "deine": "überredet", "richtig": "überredete", "erklaerung": "Perfekt, nicht Präsens", "phaenomen": "Tempus" }
  ],
  "note_geschaetzt": 3,
  "gesamturteil": "…",
  "staerken": ["…"],
  "tipps": ["…"],
  "unleserlich": []
}
\`\`\`
"latein" = die betroffene lateinische Stelle (kurz), "deine" = was ich geschrieben habe, "richtig" = korrekte Übersetzung, "phaenomen" = Grammatikbegriff (z. B. "Abl. abs.", "Konjunktiv im cum-Satz", "Vokabel").`;
}

/**
 * Prüft den eingefügten Bewertungs-Block. Fehlerhafte Einzelfehler werden
 * weggelassen (Warnung), Gewichte auf 0,5 / 1 / 2 gerundet.
 */
export function checkReview(obj, attempt) {
  const errors = [];
  const warnings = [];
  if (!obj || typeof obj !== 'object') return { errors: ['Kein gültiger Inhalt.'], warnings };
  if (obj.format && obj.format !== REVIEW_FORMAT) errors.push(`Falsches Format „${obj.format}“ (erwartet: „${REVIEW_FORMAT}“).`);
  if (!Array.isArray(obj.fehler)) errors.push('Die Fehlerliste fehlt.');
  if (errors.length) return { errors, warnings };
  if (obj.versuch && obj.versuch !== attempt.id) {
    warnings.push('Diese Bewertung gehört laut Kennung zu einem ANDEREN Versuch. Nur speichern, wenn du sicher bist, dass es der richtige ist.');
  }

  const str = (x) => (typeof x === 'string' ? x.trim() : '');
  const fehler = [];
  obj.fehler.forEach((f, i) => {
    if (!f || !KATEGORIEN[f.kategorie]) { warnings.push(`Fehler ${i + 1}: unbekannte Kategorie „${f && f.kategorie}“ – weggelassen.`); return; }
    let g = Number(String(f.gewicht).replace(',', '.'));
    if (!(g > 0)) { warnings.push(`Fehler ${i + 1}: kein Gewicht – als ganzer Fehler gezählt.`); g = 1; }
    g = g <= 0.75 ? 0.5 : g <= 1.5 ? 1 : 2;
    if (f.kategorie === 'stil' && g > 0.5) g = 0.5;
    fehler.push({
      kategorie: f.kategorie, gewicht: g, latein: str(f.latein), deine: str(f.deine),
      richtig: str(f.richtig), erklaerung: str(f.erklaerung), phaenomen: str(f.phaenomen)
    });
  });
  const list = (x) => (Array.isArray(x) ? x.map(str).filter(Boolean) : []);
  const unleserlich = list(obj.unleserlich);
  if (unleserlich.length) warnings.push(`Claude konnte ${unleserlich.length} Stelle(n) nicht sicher lesen – sie zählen nicht als Fehler.`);
  return {
    errors, warnings,
    review: {
      fehler, gesamturteil: str(obj.gesamturteil), staerken: list(obj.staerken).slice(0, 2),
      tipps: list(obj.tipps), unleserlich,
      noteClaude: Number(obj.note_geschaetzt) || null
    }
  };
}

/**
 * Bewertung speichern: am Versuch (history) + jeder Fehler ins Fehlerjournal.
 * Eine frühere Bewertung desselben Versuchs wird ersetzt (alte Journal-Einträge weg).
 */
export async function saveReview(attempt, review, schluessel) {
  for (const j of await getAll('journal')) {
    if (j.typ === 'pruefung' && j.versuch === attempt.id) await remove('journal', j.id);
  }
  const s = score(review.fehler, attempt.woerter, schluessel);
  const now = new Date();
  const datum = todayStr(now);
  attempt.bewertung = { ...review, ...s, schluessel, eingetragen: now.toISOString() };
  await put('history', attempt);
  for (const f of review.fehler) {
    await put('journal', {
      id: newId('j'), typ: 'pruefung', versuch: attempt.id, textId: attempt.textId,
      kategorie: f.kategorie, gewicht: f.gewicht, phaenomen: f.phaenomen || KATEGORIEN[f.kategorie],
      frage: f.latein, erwartet: f.richtig, gegeben: f.deine, erklaerung: f.erklaerung,
      datum, zeit: now.toISOString()
    });
  }
  return attempt;
}
