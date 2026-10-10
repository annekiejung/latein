/*
 * Klassenarbeits-Planer: Termin + Stoff → Lernplan mit Tagesportionen.
 *
 * Store "exams": { id, titel, art: 'klassenarbeit'|'test', datum: 'YYYY-MM-DD',
 *   start: 'YYYY-MM-DD' (ab hier wird verteilt), lektionen: [Lektionsnamen], grammatik: [Einheit-ids],
 *   probetexte: Anzahl, uhrzeit: 'HH:MM' (Kalender-Erinnerung), notiz, note (nach der Arbeit),
 *   erledigt: { 'YYYY-MM-DD|aufgabe': true }, erstellt }
 *
 * Der Plan wird NICHT gespeichert, sondern immer aus diesen Angaben berechnet (buildPlan).
 * Vokabeln laufen über den Intensivmodus: Die Lektionen bekommen den Termin als Testtermin
 * (settings "testTermine", js/leitner.js).
 */
import { getAll, get, put, remove, newId, setSetting } from './db.js';
import { todayStr } from './ui.js';
import { daysBetween, getTestTermine, isDue } from './leitner.js';
import { loadUnits } from './grammar.js';
import { loadItems, isDueToday } from './journal.js';

export const ARTEN = { klassenarbeit: 'Klassenarbeit', test: 'Vokabeltest' };

/** Datum + n Tage (Ortszeit, ohne Zeitzonen-Fallen). */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

export async function loadExams() {
  return (await getAll('exams')).sort((a, b) => a.datum.localeCompare(b.datum));
}

export const getExam = (id) => get('exams', id);

/** Speichern + Testtermine der Lektionen setzen (früherer Termin gewinnt). */
export async function saveExam(rec) {
  const isNew = !rec.id;
  const exam = {
    erledigt: {}, probetexte: 0, lektionen: [], grammatik: [], uhrzeit: '17:00',
    ...rec,
    id: rec.id || newId('ka'),
    start: rec.start || todayStr(),
    erstellt: rec.erstellt || new Date().toISOString()
  };
  if (isNew && exam.start > exam.datum) exam.start = exam.datum;
  await put('exams', exam);
  const termine = await getTestTermine();
  const today = todayStr();
  for (const l of exam.lektionen) {
    const t = termine[l];
    if (!t || t < today || t > exam.datum) termine[l] = exam.datum;
  }
  await setSetting('testTermine', termine);
  return exam;
}

/** Löschen; Testtermine, die von dieser Arbeit stammen, mit entfernen. */
export async function deleteExam(exam) {
  await remove('exams', exam.id);
  const termine = await getTestTermine();
  for (const l of exam.lektionen) if (termine[l] === exam.datum) delete termine[l];
  await setSetting('testTermine', termine);
}

/**
 * Lernplan berechnen: [{ datum, tag (0 = Starttag), rest (Tage bis zur Arbeit), aufgaben: [...] }].
 * Aufgabe: { id, art: vokabeln|grammatik|probe|fehler|vortag, text, href, einheit? }
 */
export async function buildPlan(exam) {
  const units = new Map((await loadUnits()).map((u) => [u.id, u]));
  const n = Math.max(0, daysBetween(exam.start, exam.datum));   // Lerntage vor der Arbeit
  const days = [];
  for (let i = 0; i <= n; i++) {
    const datum = addDays(exam.start, i);
    days.push({ datum, tag: i, rest: n - i, aufgaben: [] });
  }
  const prep = days.slice(0, n);                                // ohne den Tag der Arbeit
  if (!prep.length) return days;
  const add = (i, a) => prep[Math.min(prep.length - 1, Math.max(0, i))].aufgaben.push(a);

  // Grammatik: erste Runde in den ersten ~60 % der Tage, zweite Runde danach (nicht am Vortag)
  const g = exam.grammatik.filter((id) => units.has(id));
  const phase1 = Math.max(1, Math.floor(n * 0.6));
  g.forEach((id, k) => add(Math.floor((k * phase1) / g.length), {
    id: 'g1-' + id, art: 'grammatik', einheit: id, text: `Grammatik: ${units.get(id).thema}`,
    href: '#/grammatik/einheit/' + encodeURIComponent(id)
  }));
  const p2start = phase1;
  const p2end = n - 2;                                            // letzter Tag für Runde 2
  if (p2end >= p2start) {
    const span = p2end - p2start + 1;
    g.forEach((id, k) => add(p2start + Math.floor((k * span) / g.length), {
      id: 'g2-' + id, art: 'grammatik', einheit: id, text: `Wiederholen: ${units.get(id).thema} (nur Übersetzungen genügt)`,
      href: '#/grammatik/einheit/' + encodeURIComponent(id)
    }));
  }

  // Probe-Klassenarbeiten: 2, 4, 6 … Tage vor der Arbeit (so spät wie sinnvoll)
  for (let k = 0; k < exam.probetexte; k++) {
    add(n - 2 - 2 * k, {
      id: 'probe-' + k, art: 'probe', text: 'Probe-Klassenarbeit: Text übersetzen (Zeitlimit) und bewerten lassen',
      href: '#/pruefung'
    });
  }

  // Jeden Tag: Vokabeln (Intensivmodus) und Fehlerjournal
  prep.forEach((d, i) => {
    if (exam.lektionen.length) {
      d.aufgaben.unshift({ id: 'vok', art: 'vokabeln', text: `Vokabeln: ${exam.lektionen.join(', ')} – alle fälligen Karten`, href: '#/vokabeln/lernen' });
    }
    d.aufgaben.push({ id: 'fehler', art: 'fehler', text: 'Fehlerjournal: fällige Fehler wiederholen', href: '#/fehler' });
    if (i === n - 1) d.aufgaben.push({ id: 'vortag', art: 'vortag', text: 'Vortag: kein neuer Stoff – Hilfen und Fehler überfliegen, früh schlafen.' });
  });
  return days;
}

/**
 * Was ist erledigt? Manuell abgehakt ODER von der App erkannt:
 * Grammatik-Einheit an dem Tag geübt, Probe-Klassenarbeit an dem Tag abgegeben,
 * heute: keine fälligen Vokabeln der Lektionen / keine fälligen Fehler mehr.
 */
export async function doneMap(exam, days) {
  const history = await getAll('history');
  const dayOf = (iso) => (iso ? todayStr(new Date(iso)) : '');
  const grammarDone = new Set(history.filter((r) => r.typ === 'grammatik').map((r) => `${dayOf(r.zeit)}|${r.einheit}`));
  const probesByDay = {};
  for (const r of history) if (r.typ === 'pruefung' && r.abgegeben) probesByDay[dayOf(r.abgegeben)] = (probesByDay[dayOf(r.abgegeben)] || 0) + 1;

  const today = todayStr();
  let vokToday = null;
  let fehlerToday = null;
  const done = {};
  for (const d of days) {
    let probeIndex = 0;
    for (const a of d.aufgaben) {
      const key = `${d.datum}|${a.id}`;
      let auto = false;
      if (a.art === 'grammatik') auto = grammarDone.has(`${d.datum}|${a.einheit}`);
      if (a.art === 'probe') auto = (probesByDay[d.datum] || 0) > probeIndex++;
      if (d.datum === today && a.art === 'vokabeln') {
        if (vokToday === null) {
          const termine = await getTestTermine();
          vokToday = !(await getAll('vocab')).some((c) => exam.lektionen.includes(c.lektion) && isDue(c, 'bedeutung', termine));
        }
        auto = vokToday;
      }
      if (d.datum === today && a.art === 'fehler') {
        if (fehlerToday === null) fehlerToday = !(await loadItems()).some(isDueToday);
        auto = fehlerToday;
      }
      done[key] = !!(exam.erledigt && exam.erledigt[key]) || auto;
    }
  }
  return done;
}

export async function toggleDone(exam, key, value) {
  exam.erledigt = { ...(exam.erledigt || {}), [key]: value };
  if (!value) delete exam.erledigt[key];
  await put('exams', exam);
}

/* ---------- Kalenderdatei (.ics) ---------- */

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Zeilen über 75 Zeichen umbrechen (iCalendar-Regel). */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

/** Ein Termin pro Lerntag (mit Erinnerung) + die Arbeit selbst als Ganztagstermin. */
export function buildIcs(exam, days) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const [hh, mm] = (exam.uhrzeit || '17:00').split(':');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Latein-Trainer//Planer//DE', 'CALSCALE:GREGORIAN'];
  const today = todayStr();
  const now = new Date();
  const timePassed = now.getHours() * 60 + now.getMinutes() >= Number(hh) * 60 + Number(mm);
  for (const d of days) {
    if (d.datum < today) continue;
    if (d.datum === today && d.rest > 0 && timePassed) continue;     // heutige Erinnerung wäre schon vorbei
    const ymd = d.datum.replace(/-/g, '');
    if (d.rest === 0) {
      lines.push('BEGIN:VEVENT', `UID:${exam.id}-arbeit@latein-trainer`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${addDays(d.datum, 1).replace(/-/g, '')}`,
        `SUMMARY:${icsText(`Latein: ${exam.titel || ARTEN[exam.art]}`)}`, 'END:VEVENT');
      continue;
    }
    if (!d.aufgaben.length) continue;
    const desc = d.aufgaben.map((a) => '• ' + a.text).join('\n') + '\n\nIm Latein-Trainer: Start → Klassenarbeits-Planer';
    lines.push('BEGIN:VEVENT', `UID:${exam.id}-${ymd}@latein-trainer`, `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${hh}${mm}00`, 'DURATION:PT45M',
      `SUMMARY:${icsText(`Latein lernen (noch ${d.rest} ${d.rest === 1 ? 'Tag' : 'Tage'})`)}`,
      `DESCRIPTION:${icsText(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Latein lernen', 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
