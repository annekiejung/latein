/*
 * Grammatik: Übungseinheiten (fertig eingebaut oder importiert), Prüfung des
 * Importformats, Prompt für die Claude-App.
 *
 * Format "latein-grammatik" Version 1 (siehe CLAUDE.md):
 * {
 *   "format": "latein-grammatik", "version": 1,
 *   "thema": "Ablativus absolutus", "bereich": "Satzlehre",
 *   "regel": { "kurz": "…", "punkte": ["…"], "beispiel": { "latein": "…", "deutsch": "…" } },
 *   "aufgaben": [
 *     { "typ": "bestimmen", "frage": "…", "antwort": "…", "erklaerung": "…" },
 *     { "typ": "luecke", "text": "… ___ …", "loesung": ["…"], "hinweis": "…", "erklaerung": "…" },
 *     { "typ": "auswahl", "frage": "…", "optionen": ["…"], "richtig": 0, "erklaerung": "…" },
 *     { "typ": "uebersetzung", "teile": [{ "latein": "…", "deutsch": "…" }],
 *       "quelle": { "autor": "…", "werk": "…", "stelle": "…", "status": "geprüft|bitte prüfen", "link": "…" },
 *       "bearbeitung": "original|gekürzt|angepasst|konstruiert",
 *       "konstruktion": "…", "vokabelhilfen": [{ "latein": "…", "deutsch": "…" }] }
 *   ]
 * }
 * Eingebaute Einheiten: data/grammatik.json ({ einheiten: [ {id, …Format…} ] })
 * Importierte Einheiten: Store "grammar" ({ id, …Format…, importiert: ISO })
 */
import { getAll, put, newId } from './db.js';

export const FORMAT_NAME = 'latein-grammatik';
export const TYPEN = { bestimmen: 'Bestimmen', luecke: 'Lückentext', auswahl: 'Auswahl', uebersetzung: 'Übersetzung' };
export const BEARBEITUNG = {
  original: { text: 'Originalsatz', cls: 'ok' },
  'gekürzt': { text: 'gekürzt', cls: '' },
  angepasst: { text: 'leicht angepasst', cls: '' },
  konstruiert: { text: 'eigens konstruiert', cls: 'warn' }
};

let builtIn = null;

/** Eingebaute Einheiten (offline aus dem Cache). */
async function loadBuiltIn() {
  if (!builtIn) {
    try {
      const res = await fetch('data/grammatik.json');
      builtIn = res.ok ? (await res.json()).einheiten.map((u) => ({ ...u, eingebaut: true })) : [];
    } catch (e) { builtIn = []; }
  }
  return builtIn;
}

/** Alle Einheiten: eingebaute zuerst, dann importierte (neueste zuerst). */
export async function loadUnits() {
  const own = (await getAll('grammar')).sort((a, b) => (b.importiert || '').localeCompare(a.importiert || ''));
  return [...(await loadBuiltIn()), ...own];
}

export async function getUnit(id) {
  return (await loadUnits()).find((u) => u.id === id) || null;
}

/* ---------- Prüfen ---------- */

const str = (x) => (typeof x === 'string' ? x.trim() : '');

/**
 * Prüft eine Einheit. errors = nicht importierbar; warnings = Hinweise.
 * Aufgaben mit Fehlern werden weggelassen (und gemeldet), der Rest bleibt.
 */
export function checkUnit(obj) {
  const errors = [];
  const warnings = [];
  if (!obj || typeof obj !== 'object') return { errors: ['Kein gültiger Inhalt.'], warnings };
  if (obj.format && obj.format !== FORMAT_NAME) errors.push(`Falsches Format „${obj.format}“ (erwartet: „${FORMAT_NAME}“).`);
  if (!str(obj.thema)) errors.push('Das Thema fehlt.');
  const regel = obj.regel || {};
  if (!str(regel.kurz)) warnings.push('Keine Kurzregel angegeben.');
  if (!Array.isArray(obj.aufgaben) || !obj.aufgaben.length) errors.push('Es sind keine Aufgaben enthalten.');
  if (errors.length) return { errors, warnings };

  const aufgaben = [];
  obj.aufgaben.forEach((a, i) => {
    const n = `Aufgabe ${i + 1}`;
    if (!a || !TYPEN[a.typ]) { warnings.push(`${n}: unbekannter Typ „${a && a.typ}“ – weggelassen.`); return; }
    if (a.typ === 'bestimmen' && !(str(a.frage) && str(a.antwort))) { warnings.push(`${n}: Frage oder Antwort fehlt – weggelassen.`); return; }
    if (a.typ === 'luecke') {
      const gaps = (str(a.text).match(/_{3,}/g) || []).length;
      if (!gaps || !Array.isArray(a.loesung) || a.loesung.length !== gaps) {
        warnings.push(`${n}: Lücken (___) und Lösungen passen nicht zusammen – weggelassen.`); return;
      }
    }
    if (a.typ === 'auswahl') {
      if (!Array.isArray(a.optionen) || a.optionen.length < 2 || !(a.richtig >= 0 && a.richtig < a.optionen.length)) {
        warnings.push(`${n}: Auswahl unvollständig – weggelassen.`); return;
      }
    }
    if (a.typ === 'uebersetzung') {
      if (!Array.isArray(a.teile) || !a.teile.length || a.teile.some((t) => !str(t.latein) || !str(t.deutsch))) {
        warnings.push(`${n}: Teilsätze unvollständig – weggelassen.`); return;
      }
      const q = a.quelle || {};
      if (a.bearbeitung !== 'konstruiert' && !(str(q.autor) && str(q.stelle))) {
        warnings.push(`${n}: Quellenangabe unvollständig – als „bitte prüfen“ markiert.`);
      }
      if (q.status !== 'geprüft') a.quelle = { ...q, status: 'bitte prüfen' };
      if (!BEARBEITUNG[a.bearbeitung]) a.bearbeitung = 'original';
    }
    aufgaben.push(a);
  });
  if (!aufgaben.length) errors.push('Keine einzige Aufgabe ist vollständig.');
  const statusCount = aufgaben.filter((a) => a.typ === 'uebersetzung' && a.quelle.status !== 'geprüft').length;
  if (statusCount) warnings.push(`${statusCount} Übersetzungssätze haben den Quellenstatus „bitte prüfen“.`);
  return { errors, warnings, unit: { ...obj, aufgaben } };
}

export async function saveUnit(unit) {
  const rec = { ...unit, id: newId('gr'), importiert: new Date().toISOString() };
  await put('grammar', rec);
  return rec;
}

/* ---------- Ergebnisse ---------- */

/** Letztes Ergebnis je Einheit aus dem Verlauf. */
export async function lastResults() {
  const map = new Map();
  for (const r of (await getAll('history')).filter((x) => x.typ === 'grammatik')) {
    const prev = map.get(r.einheit);
    if (!prev || r.zeit > prev.zeit) map.set(r.einheit, r);
  }
  return map;
}

export async function saveResult(unit, richtig, gesamt, sekunden) {
  await put('history', {
    id: newId('h'), typ: 'grammatik', einheit: unit.id, thema: unit.thema,
    richtig, gesamt, sekunden: Math.round(sekunden), zeit: new Date().toISOString()
  });
}

/* ---------- Prompt für die Claude-App ---------- */

export function buildGrammarPrompt() {
  return `Ich lerne Latein (Klasse 10, Gymnasium Baden-Württemberg, Lehrbuchphase abgeschlossen, jetzt Lektüre). Auf dem Foto ist eine Grammatik-Erklärung aus meinem Schulbuch. Erstelle daraus eine Übungseinheit für meine Lern-App.

REGELN
1. Gib NUR einen JSON-Codeblock aus – keinen Text davor oder danach.
2. "regel": Erkläre die Regel KURZ IN EIGENEN WORTEN. Schreibe den Text des Buches NICHT ab (Urheberrecht). "punkte" = 3–6 kurze Merksätze, "beispiel" = ein Beispielsatz mit Übersetzung.
3. "aufgaben": insgesamt 12–16 Aufgaben, gemischt:
   - 4 × "bestimmen" (Form/Konstruktion bestimmen; "antwort" knapp wie im Unterricht, z. B. "Abl. Sg. f., PPP von capere")
   - 3 × "luecke" (Lücken als ___ ; "loesung" = Liste, je Lücke ein Wort, mit Längenzeichen)
   - 3 × "auswahl" (3–4 Optionen, "richtig" = Index ab 0, mit "erklaerung")
   - 3–5 × "uebersetzung" (siehe 4.)
4. Übersetzungssätze:
   - VORRANGIG echte Sätze aus der klassischen Literatur (ca. 400 v. Chr. – 400 n. Chr.: Cicero, Caesar, Ovid, Vergil, Sallust, Livius, Plinius, Seneca, Catull, Martial, Phaedrus, Nepos), die das Phänomen enthalten.
   - "quelle": Autor, Werk, genaue Stelle (Buch, Kapitel, Paragraph bzw. Vers). "status": "geprüft" NUR, wenn du den genauen Wortlaut gerade nachgesehen hast (z. B. per Websuche in The Latin Library oder Perseus) und "link" auf diese Stelle zeigt – sonst IMMER "bitte prüfen". Erfinde keine Stellenangaben. Bist du unsicher, nimm einen anderen Satz.
   - "bearbeitung": "original", "gekürzt" oder "angepasst". Nur wenn wirklich kein Originalsatz passt: selbst formulieren und "konstruiert" angeben (Quelle dann leer lassen).
   - "teile": den Satz in Sinnabschnitte (Teilsätze/Wortgruppen) zerlegen, jeweils mit deutscher Musterübersetzung.
   - "konstruktion": welche Konstruktion(en) vorkommen (z. B. "Abl. abs. vorzeitig; AcI").
   - "vokabelhilfen": seltene Wörter mit Bedeutung.
5. Niveau: Klasse 10, eher fordernd.

FORMAT
\`\`\`json
{
  "format": "latein-grammatik",
  "version": 1,
  "thema": "THEMA",
  "bereich": "Satzlehre oder Formenlehre",
  "regel": {
    "kurz": "…",
    "punkte": ["…", "…"],
    "beispiel": { "latein": "…", "deutsch": "…" }
  },
  "aufgaben": [
    { "typ": "bestimmen", "frage": "Bestimme: …", "antwort": "…", "erklaerung": "…" },
    { "typ": "luecke", "text": "… ___ …", "loesung": ["…"], "hinweis": "(Grundform, gesuchte Form)", "erklaerung": "…" },
    { "typ": "auswahl", "frage": "…", "optionen": ["…", "…", "…"], "richtig": 1, "erklaerung": "…" },
    { "typ": "uebersetzung",
      "teile": [ { "latein": "…", "deutsch": "…" }, { "latein": "…", "deutsch": "…" } ],
      "quelle": { "autor": "Caesar", "werk": "De bello Gallico", "stelle": "1,1,1", "status": "bitte prüfen", "link": "" },
      "bearbeitung": "original",
      "konstruktion": "…",
      "vokabelhilfen": [ { "latein": "…", "deutsch": "…" } ] }
  ]
}
\`\`\``;
}
