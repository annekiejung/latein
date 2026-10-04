/*
 * Leitner-System, Intensivmodus, Tagesprotokoll und Serie (Streak).
 *
 * Lernstand einer Karte (je Abfrage-Art eigener Lernstand):
 *   card.lernstand        → Bedeutung (Latein → Deutsch)
 *   card.lernstandFormen  → Formen (Genitiv/Genus, Stammformen …), entsteht beim ersten Abfragen
 *   { fach: 1–5, faellig: 'YYYY-MM-DD', richtig, falsch, zuletzt: 'YYYY-MM-DD'|null }
 *
 * Regeln:
 *   richtig → ein Fach höher (max. 5), wieder fällig nach intervals[fach-1] Tagen
 *   falsch  → Fach 1, wieder fällig nach intervals[0] Tagen (in der Runde wird sie
 *             zusätzlich noch einmal geübt, das zählt aber nicht fürs Fach)
 *
 * Intensivmodus (Testtermin einer Lektion, gespeichert in settings "testTermine"):
 *   - Intervall höchstens halb so lang wie die Zeit bis zum Test (mind. 1 Tag)
 *   - am Tag vor dem Test und am Testtag sind ALLE Karten der Lektion fällig
 *     (sofern heute noch nicht abgefragt)
 */
import { get, put, getAll, getSetting } from './db.js';
import { todayStr } from './ui.js';

export const MODES = { bedeutung: 'lernstand', formen: 'lernstandFormen' };

/* ---------- Datumsrechnung (immer 'YYYY-MM-DD', Ortszeit) ---------- */

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

/** Ganze Tage von a bis b (b - a). */
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/* ---------- Lernstand ---------- */

export function newState(today = todayStr()) {
  return { fach: 1, faellig: today, richtig: 0, falsch: 0, zuletzt: null };
}

/** Lernstand einer Karte für eine Abfrage-Art (legt ihn bei Bedarf virtuell an). */
export function stateOf(card, mode) {
  return card[MODES[mode]] || newState();
}

/** Tage bis zum Test der Lektion (null = kein Test oder vorbei). */
export function daysToTest(card, testTermine, today = todayStr()) {
  const t = testTermine && testTermine[card.lektion];
  if (!t) return null;
  const d = daysBetween(today, t);
  return d >= 0 ? d : null;
}

/** Ist die Karte heute fällig? */
export function isDue(card, mode, testTermine, today = todayStr()) {
  const s = stateOf(card, mode);
  const dt = daysToTest(card, testTermine, today);
  if (dt !== null && dt <= 1 && s.zuletzt !== today) return true;   // Generalprobe
  return s.faellig <= today;
}

/**
 * Wertet eine Antwort aus und gibt den NEUEN Lernstand zurück.
 * @param {object} s          bisheriger Lernstand
 * @param {boolean} correct
 * @param {number[]} intervals  Tage für Fach 1–5
 * @param {number|null} testIn  Tage bis zum Test (Intensivmodus) oder null
 */
export function review(s, correct, intervals, testIn = null, today = todayStr()) {
  const fach = correct ? Math.min(5, s.fach + 1) : 1;
  let days = intervals[fach - 1] ?? 1;
  if (testIn !== null) days = Math.min(days, Math.max(1, Math.floor(testIn / 2)));
  return {
    fach,
    faellig: addDays(today, Math.max(0, days)),
    richtig: s.richtig + (correct ? 1 : 0),
    falsch: s.falsch + (correct ? 0 : 1),
    zuletzt: today
  };
}

/** Anzahl Karten je Fach (Index 0 = Fach 1). Nur Karten, die für den Modus taugen. */
export function boxCounts(cards, mode) {
  const counts = [0, 0, 0, 0, 0];
  for (const c of cards) counts[stateOf(c, mode).fach - 1]++;
  return counts;
}

/* ---------- Tagesprotokoll & Serie ---------- */
/*
 * Store "history", ein Datensatz pro Tag:
 *   { id: 'tag-YYYY-MM-DD', typ: 'tag', datum, antworten, richtig, sekunden }
 * Gezählt werden nur ERSTE Antworten auf eine Karte (keine Wiederholungen in der Runde).
 */

export async function getDay(date = todayStr()) {
  return (await get('history', 'tag-' + date)) ||
    { id: 'tag-' + date, typ: 'tag', datum: date, antworten: 0, richtig: 0, sekunden: 0 };
}

export async function logAnswer(correct, date = todayStr()) {
  const day = await getDay(date);
  day.antworten++;
  if (correct) day.richtig++;
  await put('history', day);
  return day;
}

export async function logSeconds(sec, date = todayStr()) {
  if (!(sec > 0)) return;
  const day = await getDay(date);
  day.sekunden += Math.round(sec);
  await put('history', day);
}

/**
 * Serie = Anzahl aufeinanderfolgender Tage, an denen das Tagesziel erreicht wurde.
 * Ist heute das Ziel noch nicht erreicht, zählt die Serie bis gestern (sie ist
 * noch nicht gerissen – heute kann man sie noch retten).
 */
export async function streakInfo(today = todayStr()) {
  const goal = await getSetting('dailyGoal');
  const days = new Map((await getAll('history'))
    .filter((r) => r.typ === 'tag').map((r) => [r.datum, r]));
  const reached = (d) => (days.get(d)?.antworten || 0) >= goal;

  const todayDone = days.get(today)?.antworten || 0;
  let streak = 0;
  let d = reached(today) ? today : addDays(today, -1);
  while (reached(d)) { streak++; d = addDays(d, -1); }
  return { streak, todayDone, goal, todayReached: reached(today) };
}

/** Testtermine der Lektionen: { 'Lektionsname': 'YYYY-MM-DD' } */
export async function getTestTermine() {
  return { ...((await getSetting('testTermine')) || {}) };
}
