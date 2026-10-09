/*
 * Grundwortschatz: Daten laden, Lernstand, Pakete, Abgleich mit den aktuellen
 * Vokabeln (keine Dopplungen) und Meldungen/Korrekturen.
 *
 * Daten:   data/grundwortschatz.json (gebaut mit tools/build_gws.pl, CC BY-SA)
 *          Eintrag: { id, nr, etappe, paket, latein, wortart, genitiv, genus,
 *                     stammformen, formen, kasus, bedeutungen, hinweis,
 *                     quelle: 'dcc'|'claude', rang, pruefung }
 * Lernstand: Store "coreProgress"  { id, lernstand, lernstandFormen }
 * Meldungen: Store "reports"       { id, eintragId, nr, latein, art, text,
 *                                    korrektur: { bedeutungen } | null, datum, zeit }
 * Einstellungen: gwsPakete = Anzahl freigeschalteter 100er-Pakete (Start: 1)
 *
 * Keine Dopplungen: Steht ein Wort auch in den aktuellen Vokabeln (gleiches Wort
 * laut sameWord), wird es NUR dort gelernt. Im Grundwortschatz erscheint es als
 * „im Unterricht“ und zählt mit dem Lernstand der Unterrichtskarte.
 */
import { getAll, put, getSetting, newId } from './db.js';
import { todayStr } from './ui.js';
import { dupKey, sameWord } from './vocab.js';

let cache = null;

/** Lädt die Wortliste einmal (offline aus dem Service-Worker-Cache). */
export async function loadData() {
  if (!cache) {
    const res = await fetch('data/grundwortschatz.json');
    if (!res.ok) throw new Error('Grundwortschatz konnte nicht geladen werden.');
    cache = await res.json();
  }
  return cache;
}

/**
 * Alle Einträge, verbunden mit Lernstand, Korrekturen und Unterrichts-Abgleich.
 * Jede Karte bekommt zusätzlich:
 *   lektion: 'Grundwortschatz' (für die Abfrage-Anzeige)
 *   imUnterricht: { lektion, karte } | null
 *   korrigiert: true, wenn eine eigene Korrektur gilt
 */
export async function loadCards() {
  const data = await loadData();
  const progress = new Map((await getAll('coreProgress')).map((p) => [p.id, p]));
  const reports = await getAll('reports');
  const corrections = new Map();
  for (const r of reports.sort((a, b) => a.zeit.localeCompare(b.zeit))) {
    if (r.korrektur) corrections.set(r.eintragId, r.korrektur);
  }
  // Unterrichtsvokabeln nach Grob-Schlüssel, genauer Vergleich mit sameWord
  const vocab = await getAll('vocab');
  const byKey = new Map();
  for (const v of vocab) {
    const k = dupKey(v);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(v);
  }

  return data.eintraege.map((e) => {
    const p = progress.get(e.id) || {};
    const k = corrections.get(e.id);
    const hit = (byKey.get(dupKey(e)) || []).find((v) => sameWord(v, e));
    return {
      ...e,
      ...(k ? { bedeutungen: k.bedeutungen } : {}),
      korrigiert: !!k,
      lektion: 'Grundwortschatz',
      lernstand: p.lernstand,
      lernstandFormen: p.lernstandFormen,
      imUnterricht: hit ? { lektion: hit.lektion, karte: hit } : null
    };
  });
}

/** Speichert NUR den Lernstand einer Grundwortschatz-Karte (Daten bleiben in der JSON-Datei). */
export async function saveProgress(card) {
  const rec = { id: card.id };
  if (card.lernstand) rec.lernstand = card.lernstand;
  if (card.lernstandFormen) rec.lernstandFormen = card.lernstandFormen;
  await put('coreProgress', rec);
}

export async function unlockedPackets() {
  return (await getSetting('gwsPakete')) || 1;
}

/** Ist das Wort „gelernt“? (Fach 3 oder höher – mehrmals hintereinander gewusst) */
export function isLearned(card) {
  const s = card.imUnterricht ? card.imUnterricht.karte.lernstand : card.lernstand;
  return !!s && s.fach >= 3;
}

/** Wurde die Karte schon mindestens einmal abgefragt? */
export function isStarted(card) {
  const s = card.imUnterricht ? card.imUnterricht.karte.lernstand : card.lernstand;
  return !!(s && s.zuletzt);
}

/** Eine Meldung (optional mit eigener Korrektur der Bedeutungen) speichern. */
export async function saveReport(card, art, text, korrekturBedeutungen) {
  await put('reports', {
    id: newId('r'),
    eintragId: card.id,
    nr: card.nr,
    latein: card.latein,
    art,
    text,
    korrektur: korrekturBedeutungen ? { bedeutungen: korrekturBedeutungen } : null,
    vorher: card.bedeutungen,
    datum: todayStr(),
    zeit: new Date().toISOString()
  });
}

/** Alle Meldungen als Text – zum Kopieren und Weitergeben (z. B. an Claude). */
export async function reportsAsText() {
  const reports = (await getAll('reports')).sort((a, b) => a.nr - b.nr);
  if (!reports.length) return '';
  return 'Meldungen zum Grundwortschatz (Latein-Trainer):\n\n' + reports.map((r) =>
    `Nr. ${r.nr} ${r.latein} – ${r.art}` +
    (r.text ? `\n  Anmerkung: ${r.text}` : '') +
    (r.korrektur ? `\n  Korrektur: ${r.korrektur.bedeutungen.join('; ')} (vorher: ${(r.vorher || []).join('; ')})` : '')
  ).join('\n');
}

/** Link zum deutschen Wiktionary (Stichwort ohne Längen, Verben im Infinitiv). */
export function wiktionaryUrl(card) {
  const t = card.latein.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^-/, '');
  return 'https://de.wiktionary.org/wiki/' + encodeURIComponent(t);
}

/** Link zum Georges (zeno.org); Verben stehen dort unter der 1. Person. */
export function georgesUrl(card) {
  const lemma = card.wortart === 'verb' && card.stammformen && card.stammformen[0] ? card.stammformen[0] : card.latein;
  const t = lemma.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^-/, '').toLowerCase().replace(/[^a-z]/g, '');
  return 'http://www.zeno.org/Georges-1913/A/' + t;
}

export const PRUEFUNG = {
  wiktionary: { text: 'mit Wiktionary abgeglichen', cls: 'ok' },
  georges: { text: 'mit Georges abgeglichen', cls: 'ok' },
  geprueft: { text: 'von Hand geprüft', cls: 'ok' },
  vorlage: { text: 'Abweichung – bitte prüfen', cls: 'warn' },
  ungeprueft: { text: 'ungeprüft', cls: 'warn' }
};
