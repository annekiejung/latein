/*
 * Fehlerjournal: Auswertung und gezielte Wiederholung.
 *
 * Store "journal" enthält EINEN Eintrag pro Fehler (geschrieben von quiz.js, grammatik.js,
 * grammatik-formen.js, exam.js). Hier werden sie zu "Fehler-Punkten" zusammengefasst:
 * gleicher Schlüssel (itemKey) = dieselbe Sache, z. B. dieselbe Vokabelkarte im selben Modus.
 *
 * Erledigt (Entscheidung der Nutzerin 2026-10-10): an ZWEI verschiedenen Tagen richtig,
 * und zwar NACH dem letzten Fehler. Ein neuer Fehler macht den Punkt wieder offen.
 * Richtige Wiederholungen: settings "fehlerStatus" = { key: { richtig: [ISO-Zeit, …] } }.
 */
import { getAll, put, remove, newId, getSetting, setSetting } from './db.js';
import { todayStr } from './ui.js';

export const TYPEN = {
  vokabel: 'Vokabeln', grundwortschatz: 'Grundwortschatz', formen: 'Formen',
  grammatik: 'Grammatik', pruefung: 'Prüfung'
};

/** Welche Einträge gehören zusammen? */
export function itemKey(j) {
  switch (j.typ) {
    case 'vokabel':
    case 'grundwortschatz': return `${j.typ}|${j.modus || 'bedeutung'}|${j.karteId}`;
    case 'grammatik': return `grammatik|${j.einheit || j.thema || ''}|${j.frage}`;
    case 'pruefung': return `pruefung|${j.versuch || ''}|${j.frage}`;
    default: return `${j.typ}|${j.frage}`;
  }
}

/** Alle Fehler-Punkte, neueste zuerst. */
export async function loadItems() {
  const status = (await getSetting('fehlerStatus')) || {};
  const map = new Map();
  for (const j of await getAll('journal')) {
    const key = itemKey(j);
    if (!map.has(key)) map.set(key, { key, typ: j.typ, eintraege: [] });
    map.get(key).eintraege.push(j);
  }
  const today = todayStr();
  const items = [...map.values()].map((it) => {
    it.eintraege.sort((a, b) => a.zeit.localeCompare(b.zeit));
    const last = it.eintraege[it.eintraege.length - 1];
    const ok = ((status[it.key] && status[it.key].richtig) || []).filter((t) => t > last.zeit);
    const tage = new Set(ok.map((t) => todayStr(new Date(t))));
    return {
      ...it, letzter: last.zeit, anzahl: it.eintraege.length,
      frage: last.frage, erwartet: last.erwartet, gegeben: last.gegeben, erklaerung: last.erklaerung,
      phaenomen: last.phaenomen, kategorie: last.kategorie, thema: last.thema, modus: last.modus || 'bedeutung',
      karteId: last.karteId, einheit: last.einheit,
      richtigTage: tage.size, erledigt: tage.size >= 2, heuteRichtig: tage.has(today)
    };
  });
  return items.sort((a, b) => b.letzter.localeCompare(a.letzter));
}

/** Heute zu wiederholen: offen und heute noch nicht richtig gehabt. */
export const isDueToday = (it) => !it.erledigt && !it.heuteRichtig;

/** Richtig wiederholt (merkt sich die letzten Zeitpunkte). */
export async function markCorrect(key) {
  const status = (await getSetting('fehlerStatus')) || {};
  const old = (status[key] && status[key].richtig) || [];
  status[key] = { richtig: [...old.slice(-4), new Date().toISOString()] };
  await setSetting('fehlerStatus', status);
}

/** Bei der Wiederholung wieder falsch: neuer Journal-Eintrag (zählt als Fehler, Punkt wieder offen). */
export async function markWrong(item, gegeben) {
  const last = item.eintraege[item.eintraege.length - 1];
  await put('journal', {
    ...last, id: newId('j'), gegeben: gegeben || '(Wiederholung: noch nicht gewusst)',
    quelle: 'wiederholung', datum: todayStr(), zeit: new Date().toISOString()
  });
}

/** Fehler-Punkt ganz entfernen (z. B. wenn die Bewertung selbst falsch war). */
export async function removeItem(item) {
  for (const e of item.eintraege) await remove('journal', e.id);
  const status = (await getSetting('fehlerStatus')) || {};
  delete status[item.key];
  await setSetting('fehlerStatus', status);
}

/* ---------- Auswertung ---------- */

/**
 * Grammatik-Phänomene vereinheitlichen (Claude schreibt mal „Abl. abs.“, mal
 * „Ablativus absolutus“) und passende eingebaute Einheit finden.
 * Reihenfolge wichtig: Speziellere Muster zuerst.
 */
const PHAENOMENE = [
  [/abl(\.|ativus)?\s*abs/i, 'Ablativus absolutus', 'abl-abs'],
  [/\bnci\b|nominativus cum/i, 'NcI', 'nci'],
  [/\baci\b|accusativus cum/i, 'AcI', 'aci'],
  [/gerund|nd-form/i, 'nd-Formen (Gerundium/Gerundiv)', 'nd-formen'],
  [/\bpc\b|participium|partizip/i, 'Partizipien (PC)', 'pc'],
  [/deponen/i, 'Deponentien', 'deponentien'],
  [/relativ/i, 'Relativsätze', 'relativsaetze'],
  [/irrealis|potentialis|optativ|hortativ|iussiv|prohibitiv|konj\w*\.? im (hs|hauptsatz)/i, 'Konjunktiv im Hauptsatz', 'konj-hs'],
  [/cum|konj|zeitenfolge|consecutio|finalsatz|konsekutiv|ut-satz|ne-satz|indirekte frage/i, 'Konjunktiv im Gliedsatz', 'konj-gs'],
  [/kasus|genitiv|dativ|ablativ|akkusativ/i, 'Kasusfunktionen', 'kasusfunktionen'],
  [/tempus|perfekt|imperfekt|plusquam|futur|präsens/i, 'Tempus', null],
  [/vokabel|wortbedeutung/i, 'Vokabeln', null]
];

export function normPhaenomen(text) {
  const t = String(text || '').trim();
  if (!t) return { name: 'ohne Angabe', einheit: null };
  for (const [re, name, einheit] of PHAENOMENE) if (re.test(t)) return { name, einheit };
  return { name: t, einheit: null };
}

/**
 * Häufigste Fehler im Zeitraum (tage = null → alle).
 * Zählt Einträge (= wie oft der Fehler passiert ist), nicht Punkte.
 */
export async function analyse(tage = 30) {
  const since = tage ? todayStr(new Date(Date.now() - tage * 86400000)) : '';
  const entries = (await getAll('journal')).filter((j) => (j.datum || '') >= since);
  const count = (map, key, n = 1, extra) => {
    const o = map.get(key) || { name: key, n: 0, ...extra };
    o.n += n;
    map.set(key, o);
  };
  const phaen = new Map();
  const kategorien = new Map();
  const woerter = new Map();
  const bereiche = new Map();
  for (const j of entries) {
    count(bereiche, j.typ);
    if (j.typ === 'grammatik' || j.typ === 'pruefung') {
      const p = normPhaenomen(j.phaenomen || j.thema);
      // Vokabelfehler aus Prüfungen gehören nicht zur Grammatik
      if (!(j.typ === 'pruefung' && (j.kategorie === 'vokabel' || p.name === 'Vokabeln'))) count(phaen, p.name, 1, { einheit: p.einheit });
    }
    if (j.typ === 'formen') count(phaen, `Formen von ${j.phaenomen || '?'}`, 1, { einheit: null, formen: true });
    if (j.typ === 'pruefung') count(kategorien, j.kategorie || 'sonstiges', j.gewicht || 1);
    if (j.typ === 'vokabel' || j.typ === 'grundwortschatz') count(woerter, j.frage, 1, { erwartet: j.erwartet });
  }
  const top = (map, n) => [...map.values()].sort((a, b) => b.n - a.n).slice(0, n);
  return {
    gesamt: entries.length,
    phaenomene: top(phaen, 8),
    kategorien: top(kategorien, 6),
    woerter: top(woerter, 10).filter((w) => w.n > 1),
    bereiche: Object.fromEntries([...bereiche].map(([k, v]) => [k, v.n]))
  };
}
