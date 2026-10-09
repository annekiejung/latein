/*
 * Aktuelle Vokabeln: Importformat, Prüfung, Anzeige, Prompt für die Claude-App.
 *
 * Importformat "latein-vokabeln" Version 1 (siehe CLAUDE.md):
 * {
 *   "format": "latein-vokabeln", "version": 1, "lektion": "Caesar 1",
 *   "vokabeln": [ { "latein": "mōs", "wortart": "nomen", "genitiv": "mōris",
 *                   "genus": "m", "bedeutungen": ["Sitte", "Brauch"] }, … ]
 * }
 *
 * Gespeicherter Datensatz im Store "vocab" = Importfelder + Verwaltungsfelder:
 *   id, lektion, erstellt (ISO), geaendert (ISO), pos (Sortierung in der Lektion),
 *   lernstand: { fach: 1–5, faellig: 'YYYY-MM-DD', richtig, falsch, zuletzt }
 */
import { getAll, put, newId } from './db.js';
import { todayStr } from './ui.js';

export const FORMAT_NAME = 'latein-vokabeln';
export const FORMAT_VERSION = 1;

/** Erlaubte Wortarten und ihre Anzeige. */
export const WORTARTEN = {
  nomen: 'Nomen',
  verb: 'Verb',
  adjektiv: 'Adjektiv',
  pronomen: 'Pronomen',
  adverb: 'Adverb',
  praeposition: 'Präposition',
  konjunktion: 'Konjunktion',
  subjunktion: 'Subjunktion',
  numerale: 'Zahlwort',
  sonstiges: 'Sonstiges'
};

const GENERA = ['m', 'f', 'n', 'm/f'];

/** Felder, die das Importformat kennt (alles andere wird ignoriert). */
const KNOWN_FIELDS = ['latein', 'wortart', 'genitiv', 'genus', 'stammformen',
  'formen', 'kasus', 'bedeutungen', 'hinweis', 'unsicher', 'lektion'];

/* ---------- Text-Helfer ---------- */

/** Entfernt Längenzeichen (ā → a usw.) – zum Vergleichen. */
export function stripMacrons(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

/** Grob-Schlüssel: Grundform ohne Längen, klein, ohne Bindestrich + Wortart. */
export function dupKey(v) {
  return stripMacrons(v.latein).toLowerCase().replace(/^-/, '').replace(/\s+/g, ' ').trim() + '|' + v.wortart;
}

/** Zweite Form (Genitiv, 1. Person, 2. Adjektivform) ohne Längen – unterscheidet z. B. ōs, ōris / os, ossis. */
export function secondForm(v) {
  let s = '';
  if (v.wortart === 'nomen') s = v.genitiv || '';
  else if (v.wortart === 'verb') s = (v.stammformen || [])[0] || '';
  else if (v.formen) s = v.formen.split(',')[1] || '';
  return stripMacrons(s).toLowerCase().trim();
}

/**
 * Dasselbe Wort? Gleiche Grundform + Wortart; wenn bei beiden eine zweite Form
 * angegeben ist, muss auch die übereinstimmen (pārēre ≠ parere, ōs ≠ os).
 */
export function sameWord(a, b) {
  if (dupKey(a) !== dupKey(b)) return false;
  const sa = secondForm(a), sb = secondForm(b);
  return !sa || !sb || sa === sb;
}

/** Die Lernzeile, wie sie im Buch steht, z. B. "mōs, mōris m." */
export function headline(v) {
  switch (v.wortart) {
    case 'nomen':
      return [v.latein, v.genitiv].filter(Boolean).join(', ') + (v.genus ? ` ${v.genus}.` : '');
    case 'verb':
      return [v.latein, ...(v.stammformen || [])].join(', ');
    case 'adjektiv':
      if (v.formen) return v.formen;
      return [v.latein, v.genitiv ? 'Gen. ' + v.genitiv : null].filter(Boolean).join(', ');
    case 'praeposition':
      return v.kasus ? `${v.latein} (+ ${v.kasus})` : v.latein;
    default:
      return v.formen || v.latein;
  }
}

/** Welche Formen lassen sich bei dieser Karte abfragen? (null = keine) */
export function formQuestion(v) {
  switch (v.wortart) {
    case 'nomen':
      return v.genitiv && v.genus ? { frage: 'Genitiv und Genus', antwort: `${v.genitiv} ${v.genus}.` } : null;
    case 'verb':
      return v.stammformen && v.stammformen.length ? { frage: 'Stammformen', antwort: v.stammformen.join(', ') } : null;
    case 'adjektiv':
      return v.formen ? { frage: 'Formen (m., f., n.)', antwort: v.formen }
        : v.genitiv ? { frage: 'Genitiv', antwort: v.genitiv } : null;
    case 'praeposition':
      return v.kasus ? { frage: 'Mit welchem Kasus?', antwort: v.kasus } : null;
    default:
      return null;
  }
}

/* ---------- Einlesen & Prüfen ---------- */

/**
 * Holt das JSON aus eingefügtem Text – auch wenn Claude ```json … ``` drumherum
 * schreibt oder ein Satz davor/danach steht.
 */
export function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Im Text wurde kein JSON-Block gefunden (er beginnt mit „{“).');
  t = t.slice(start, end + 1);
  // Erst unverändert lesen – deutsche Anführungszeichen INNERHALB von Texten sind erlaubt.
  try { return JSON.parse(t); } catch (e) { /* weiter unten reparieren */ }
  // Typografische Anführungszeichen (falls beim Kopieren entstanden) reparieren
  t = t.replace(/[“”„]/g, '"');
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error('Das JSON ist fehlerhaft (' + e.message + '). Lass es dir von Claude noch einmal ausgeben.');
  }
}

function cleanStr(x) {
  return typeof x === 'string' ? x.trim() : (x == null ? '' : String(x).trim());
}

/**
 * Prüft EINE Vokabel. Gibt die bereinigte Karte und Probleme zurück.
 * errors  = Karte kann so nicht gespeichert werden
 * warnings = Karte geht, aber etwas fehlt/ist auffällig
 */
export function checkEntry(raw, defaultLektion) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { card: null, errors: ['Eintrag ist kein Objekt.'], warnings };
  }

  const card = {
    latein: cleanStr(raw.latein),
    wortart: cleanStr(raw.wortart).toLowerCase()
      .replace('präposition', 'praeposition').replace('substantiv', 'nomen'),
    lektion: cleanStr(raw.lektion) || defaultLektion
  };

  if (!card.latein) errors.push('„latein“ fehlt.');
  if (!WORTARTEN[card.wortart]) {
    if (card.wortart) warnings.push(`Unbekannte Wortart „${raw.wortart}“ → „Sonstiges“.`);
    else warnings.push('Wortart fehlt → „Sonstiges“.');
    card.wortart = 'sonstiges';
  }

  // Bedeutungen: Liste; ein einzelner Text wird an ; getrennt
  let b = raw.bedeutungen;
  if (typeof b === 'string') {
    b = b.split(';');
    warnings.push('Bedeutungen waren keine Liste – an „;“ getrennt.');
  }
  card.bedeutungen = Array.isArray(b) ? b.map(cleanStr).filter(Boolean) : [];
  if (!card.bedeutungen.length) errors.push('Keine deutsche Bedeutung.');

  // Wortart-spezifische Angaben
  if (card.wortart === 'nomen') {
    card.genitiv = cleanStr(raw.genitiv);
    card.genus = cleanStr(raw.genus).toLowerCase().replace(/\./g, '');
    if (!card.genitiv) warnings.push('Genitiv fehlt.');
    if (!card.genus) warnings.push('Genus fehlt.');
    else if (!GENERA.includes(card.genus)) warnings.push(`Genus „${raw.genus}“ ist ungewöhnlich.`);
    if (card.genitiv.startsWith('-')) warnings.push('Genitiv ist nur als Endung angegeben.');
  }
  if (card.wortart === 'verb') {
    const s = raw.stammformen;
    card.stammformen = Array.isArray(s) ? s.map(cleanStr).filter(Boolean)
      : typeof s === 'string' ? s.split(',').map(cleanStr).filter(Boolean) : [];
    if (!card.stammformen.length) warnings.push('Stammformen fehlen.');
    if (card.stammformen.length > 4) warnings.push('Ungewöhnlich viele Stammformen.');
  }
  if (card.wortart === 'adjektiv') {
    card.formen = cleanStr(raw.formen);
    card.genitiv = cleanStr(raw.genitiv);
    if (!card.formen && !card.genitiv) warnings.push('Formen/Genitiv fehlen.');
  }
  if (card.wortart === 'praeposition') {
    card.kasus = cleanStr(raw.kasus);
    if (!card.kasus) warnings.push('Kasus fehlt.');
  }
  if (!['nomen', 'adjektiv'].includes(card.wortart) && raw.formen) card.formen = cleanStr(raw.formen);

  card.hinweis = cleanStr(raw.hinweis);
  card.unsicher = raw.unsicher === true;
  if (card.unsicher) warnings.push('Von Claude als unsicher markiert' + (card.hinweis ? `: ${card.hinweis}` : '.'));

  const unknown = Object.keys(raw).filter((k) => !KNOWN_FIELDS.includes(k));
  if (unknown.length) warnings.push('Ignorierte Felder: ' + unknown.join(', '));

  // Leere optionale Felder entfernen
  for (const k of Object.keys(card)) {
    if (card[k] === '' || (Array.isArray(card[k]) && !card[k].length && k !== 'bedeutungen')) delete card[k];
  }
  if (!card.unsicher) delete card.unsicher;
  return { card, errors, warnings };
}

/**
 * Prüft einen kompletten Import.
 * @returns {{ errors: string[], items: Array<{card, errors, warnings, dup: 'db'|'import'|null, existingId}> , lektion }}
 */
export async function checkImport(obj, lektionOverride) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { errors: ['Kein gültiger Inhalt.'], items: [] };
  if (obj.format && obj.format !== FORMAT_NAME) errors.push(`Falsches Format „${obj.format}“ (erwartet: „${FORMAT_NAME}“).`);
  if (typeof obj.version === 'number' && obj.version > FORMAT_VERSION) errors.push('Das Format ist neuer als diese App – bitte App aktualisieren.');
  if (!Array.isArray(obj.vokabeln) || !obj.vokabeln.length) errors.push('Die Liste „vokabeln“ fehlt oder ist leer.');
  const lektion = cleanStr(lektionOverride) || cleanStr(obj.lektion);
  if (!lektion) errors.push('Name der Lektion fehlt.');
  if (errors.length) return { errors, items: [], lektion };

  const existing = await getAll('vocab');
  // Grob-Schlüssel → Liste von Karten; genau prüfen mit sameWord()
  const byKey = new Map();
  for (const v of existing) {
    const k = dupKey(v);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(v);
  }
  const seen = new Set();

  const items = obj.vokabeln.map((raw) => {
    const res = checkEntry(raw, lektion);
    res.dup = null;
    if (res.card && res.card.latein) {
      const key = dupKey(res.card);
      if (seen.has(key)) res.dup = 'import';
      else {
        const hit = (byKey.get(key) || []).find((v) => sameWord(v, res.card));
        if (hit) { res.dup = 'db'; res.existing = hit; }
      }
      seen.add(key);
    }
    return res;
  });
  return { errors, items, lektion };
}

/**
 * Speichert eine Karte. Neue Karten starten in Fach 1 und sind heute fällig.
 * Bei "update" bleiben ID und Lernstand der vorhandenen Karte erhalten.
 */
export async function saveCard(card, existing = null, pos = null) {
  const now = new Date().toISOString();
  // pos = Sortierschlüssel innerhalb der Lektion (Reihenfolge wie auf dem Foto)
  const p = pos ?? (existing ? existing.pos : null) ?? Date.now() * 1000;
  const rec = existing
    ? { ...card, id: existing.id, erstellt: existing.erstellt, lernstand: existing.lernstand, geaendert: now, pos: p }
    : { ...card, id: newId('v'), erstellt: now, geaendert: now, pos: p,
        lernstand: { fach: 1, faellig: todayStr(), richtig: 0, falsch: 0, zuletzt: null } };
  await put('vocab', rec);
  return rec;
}

/* ---------- Prompt für die Claude-App ---------- */

/** Der Prompt, den die Nutzerin zusammen mit dem Foto in die Claude-App gibt. */
export function buildPrompt(lektion) {
  const name = cleanStr(lektion) || 'NAME DER LEKTION';
  return `Ich lerne Latein (Klasse 10, Gymnasium). Auf dem Foto ist eine lateinische Vokabelliste. Wandle sie in JSON für meine Lern-App um.

REGELN
1. Gib NUR einen JSON-Codeblock aus – keinen Text davor oder danach.
2. Übernimm JEDE Vokabel vom Foto genau einmal, in derselben Reihenfolge. Lass nichts weg und erfinde nichts dazu. Bedeutungen, die nicht auf dem Foto stehen, ergänzt du NICHT.
3. Längenzeichen (ā, ē, ī, ō, ū) genau wie auf dem Foto. Stehen dort keine, verwende keine.
4. "latein" = Grundform. Bei Verben IMMER der Infinitiv (auch wenn die Liste mit der 1. Person beginnt); die übrigen Stammformen kommen in "stammformen" (1. Sg. Präsens, Perfekt, PPP/Supin – so viele, wie auf dem Foto stehen). Deponentien z. B.: "hortārī", ["hortor", "hortātus sum"].
5. Abgekürzte Formen (z. B. "-ōris", "-ī, -ī, -ītum") schreibst du vollständig aus.
6. "bedeutungen" = Liste der deutschen Bedeutungen in der Reihenfolge des Fotos. Grammatische Zusätze wie "m. Dat." oder "(+ AcI)" gehören in "hinweis", nicht in die Bedeutung.
7. Wortart: nomen, verb, adjektiv, pronomen, adverb, praeposition, konjunktion, subjunktion, numerale oder sonstiges.
   - nomen: "genitiv" (ausgeschrieben) und "genus" ("m", "f", "n" oder "m/f")
   - verb: "stammformen"
   - adjektiv: "formen" wie im Buch, z. B. "ācer, ācris, ācre" oder "fēlīx, fēlīcis"
   - praeposition: "kasus", z. B. "Akk." oder "Abl."
8. Wenn du etwas auf dem Foto nicht sicher lesen kannst: setze "unsicher": true und schreibe in "hinweis", was unklar ist. Rate nicht stillschweigend.
9. Alles, was keine Vokabel ist (Überschriften, Übungen, Seitenzahlen), lässt du weg.

FORMAT
\`\`\`json
{
  "format": "latein-vokabeln",
  "version": 1,
  "lektion": "${name.replace(/"/g, '\'')}",
  "vokabeln": [
    { "latein": "mōs", "wortart": "nomen", "genitiv": "mōris", "genus": "m", "bedeutungen": ["Sitte", "Brauch", "Pl.: Charakter"] },
    { "latein": "mittere", "wortart": "verb", "stammformen": ["mittō", "mīsī", "missum"], "bedeutungen": ["schicken", "loslassen"] },
    { "latein": "ācer", "wortart": "adjektiv", "formen": "ācer, ācris, ācre", "bedeutungen": ["scharf", "heftig"] },
    { "latein": "propter", "wortart": "praeposition", "kasus": "Akk.", "bedeutungen": ["wegen"] },
    { "latein": "persuādēre", "wortart": "verb", "stammformen": ["persuādeō", "persuāsī", "persuāsum"], "bedeutungen": ["überreden", "überzeugen"], "hinweis": "m. Dat." },
    { "latein": "iniūria", "wortart": "nomen", "genitiv": "iniūriae", "genus": "f", "bedeutungen": ["Unrecht"], "unsicher": true, "hinweis": "zweite Bedeutung auf dem Foto unleserlich" }
  ]
}
\`\`\`
(Die Beispiele zeigen nur das Format – übernimm ausschließlich die Vokabeln vom Foto.)`;
}
