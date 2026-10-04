/*
 * Auswertung getippter Antworten – tolerant, aber ehrlich:
 *   - Groß-/Kleinschreibung, Längenzeichen, Artikel (der/die/das …),
 *     "jdn./etw./sich" und Klammerzusätze sind egal.
 *   - Tippfehler werden NICHT stillschweigend akzeptiert: Ergebnis "typo",
 *     die Nutzerin entscheidet selbst, ob es zählt.
 *   - Mehrere Bedeutungen (mit Komma getrennt) werden einzeln geprüft;
 *     eine falsche Bedeutung macht die Antwort falsch.
 */
import { stripMacrons } from './vocab.js';

/** Abstand zweier Wörter (Anzahl Einfüge-/Lösch-/Ersetz-Schritte). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Wie viele Tippfehler gelten noch als "Tippfehler" (statt falsch)? */
function typoLimit(len) {
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  return 2;
}

const FILLER = /^(der|die|das|ein|eine|einen|jdn|jdm|jds|jmd|jmdn|jmdm|etw|sich|zu|pl|sg)$/;

/** Deutsche Bedeutung vereinfachen: "(jdn.) überreden" → "überreden". */
export function normDe(s) {
  return String(s).toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // Klammerzusätze weg
    .replace(/ß/g, 'ss')
    .replace(/[.:!?"„“'’]/g, ' ')
    .split(/\s+/).filter((w) => w && !FILLER.test(w))
    .join(' ').trim();
}

/** Alle akzeptierten Bedeutungen einer Karte (auch Teile wie "Sitte/Brauch"). */
export function acceptedMeanings(card) {
  const set = new Set();
  for (const m of card.bedeutungen || []) {
    const whole = normDe(m);
    if (whole) set.add(whole);
    for (const part of m.split(/[,;/]/)) {
      const p = normDe(part);
      if (p) set.add(p);
    }
  }
  return [...set];
}

/**
 * Prüft eine deutsche Antwort.
 * @returns {{ result: 'richtig'|'typo'|'falsch'|'leer', parts: Array<{given, status, match}> }}
 */
export function checkMeaning(card, input) {
  const givenParts = String(input).split(/[,;/]/).map((p) => p.trim()).filter(Boolean);
  if (!givenParts.length) return { result: 'leer', parts: [] };
  const accepted = acceptedMeanings(card);

  const parts = givenParts.map((given) => {
    const g = normDe(given);
    if (!g) return { given, status: 'ok', match: null };       // nur Füllwort
    if (accepted.includes(g)) return { given, status: 'ok', match: g };
    let best = null, bestDist = Infinity;
    for (const a of accepted) {
      const d = levenshtein(g, a);
      if (d < bestDist) { bestDist = d; best = a; }
    }
    if (best && bestDist <= typoLimit(best.length)) return { given, status: 'typo', match: best };
    return { given, status: 'falsch', match: null };
  });

  const result = parts.some((p) => p.status === 'falsch') ? 'falsch'
    : parts.some((p) => p.status === 'typo') ? 'typo' : 'richtig';
  return { result, parts };
}

/* ---------- Formen ---------- */

const KASUS = { nom: 'nom', gen: 'gen', dat: 'dat', akk: 'akk', acc: 'akk', abl: 'abl', vok: 'vok' };

/** Lateinische Formen vereinfachen: "mōris, m." → ["moris", "m"] */
export function normForms(s) {
  return stripMacrons(String(s)).toLowerCase()
    .replace(/[.,;:+()/]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => {
      const k = w.slice(0, 3);
      // "Akkusativ", "Akk" → "akk"
      return (w.length >= 3 && KASUS[k] && /^(nom|gen|dat|akk|acc|abl|vok)/.test(w)) ? KASUS[k] : w;
    });
}

/**
 * Prüft eine Formen-Antwort gegen die erwartete Antwort.
 * Die Grundform (z. B. "mittere") darf man mittippen oder weglassen.
 */
export function checkForms(card, expected, input) {
  if (!String(input).trim()) return { result: 'leer' };
  const lemma = normForms(card.latein)[0];
  const strip = (arr) => (arr[0] === lemma ? arr.slice(1) : arr);
  const exp = strip(normForms(expected));
  const got = strip(normForms(input));
  if (exp.join(' ') === got.join(' ')) return { result: 'richtig' };
  // Grammatik-Kürzel (Genus/Kasus) müssen exakt stimmen – sonst falsch, nicht Tippfehler
  const short = (w) => w.length <= 3;
  if (exp.length === got.length && exp.every((w, i) => !short(w) || w === got[i])) {
    // Bei Formen ist schon ein Buchstabe oft grammatisch wichtig (moris/mores) →
    // höchstens 1 Abweichung gilt als möglicher Tippfehler, Entscheidung bei der Nutzerin.
    const dist = levenshtein(exp.join(' '), got.join(' '));
    if (dist <= 1) return { result: 'typo' };
  }
  return { result: 'falsch' };
}
