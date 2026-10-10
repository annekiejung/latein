/*
 * Klassenarbeits-Planer.
 *   #/planer                   anstehende und vergangene Arbeiten
 *   #/planer/neu               neue Arbeit eintragen
 *   #/planer/bearbeiten/<id>   Angaben ändern
 *   #/planer/plan/<id>         Lernplan mit Tagesportionen, Abhaken, Kalenderdatei
 * Logik: js/planer.js
 */
import { getAll } from '../db.js';
import { h, toast, confirmDialog, formatDate, todayStr, offerFile } from '../ui.js';
import { daysBetween } from '../leitner.js';
import { loadUnits } from '../grammar.js';
import {
  loadExams, getExam, saveExam, deleteExam, buildPlan, doneMap, toggleDone, buildIcs, ARTEN
} from '../planer.js';

export const title = 'Klassenarbeits-Planer';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'neu') return renderForm(main, null);
  if (sub === 'bearbeiten' && arg) return renderForm(main, decodeURIComponent(arg));
  if (sub === 'plan' && arg) return renderPlan(main, decodeURIComponent(arg));
  return renderList(main);
}

const planHref = (id) => '#/planer/plan/' + encodeURIComponent(id);
const countdown = (d) => (d === 0 ? 'heute' : d === 1 ? 'morgen' : d < 0 ? 'vorbei' : `in ${d} Tagen`);
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const dayLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return WEEKDAY.format(new Date(y, m - 1, d)); };

/* =================== Liste =================== */

async function renderList(main) {
  const today = todayStr();
  const exams = await loadExams();
  const upcoming = exams.filter((e) => e.datum >= today);
  const past = exams.filter((e) => e.datum < today).reverse();

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/start', class: 'back' }, '‹ Start'),
    h('h2', {}, 'Anstehende Arbeiten'),
    upcoming.length
      ? h('ul', { class: 'list' }, upcoming.map((e) => h('li', {}, h('a', { href: planHref(e.id), class: 'row-link' },
          h('span', {}, e.titel || ARTEN[e.art], h('br'), h('span', { class: 'muted small' }, formatDate(e.datum))),
          h('span', { class: 'badge warn' }, countdown(daysBetween(today, e.datum)))))))
      : h('p', { class: 'muted' }, 'Keine Klassenarbeit eingetragen.'),
    h('a', { class: 'btn block', href: '#/planer/neu' }, 'Klassenarbeit eintragen')));

  if (past.length) {
    main.append(h('div', { class: 'card' },
      h('h3', {}, 'Vergangene Arbeiten'),
      h('ul', { class: 'list' }, past.map((e) => h('li', {}, h('a', { href: planHref(e.id), class: 'row-link' },
        h('span', {}, e.titel || ARTEN[e.art], h('br'), h('span', { class: 'muted small' }, formatDate(e.datum))),
        e.note ? h('span', { class: 'badge' }, 'Note ' + e.note) : h('span', { class: 'muted small' }, 'Note eintragen')))))));
  }
}

/* =================== Formular =================== */

async function renderForm(main, id) {
  const old = id ? await getExam(id) : null;
  if (id && !old) { main.append(h('p', { class: 'card' }, 'Diese Arbeit gibt es nicht (mehr).')); return; }
  const today = todayStr();
  const lessons = [...new Set((await getAll('vocab')).map((c) => c.lektion))].sort((a, b) => a.localeCompare(b, 'de'));
  const units = await loadUnits();
  const e = old || { art: 'klassenarbeit', lektionen: [], grammatik: [], probetexte: 2, uhrzeit: '17:00' };

  const titel = h('input', { type: 'text', value: e.titel || '', placeholder: 'z. B. 2. Klassenarbeit Latein' });
  const art = h('select', {}, Object.entries(ARTEN).map(([v, l]) => h('option', { value: v, selected: v === e.art }, l)));
  const datum = h('input', { type: 'date', value: e.datum || '', min: old ? null : today });
  const probe = h('select', {}, [0, 1, 2, 3].map((n) => h('option', { value: n, selected: n === e.probetexte }, String(n))));
  const uhr = h('input', { type: 'time', value: e.uhrzeit || '17:00' });
  const notiz = h('textarea', { rows: 2, placeholder: 'Stoff laut Lehrkraft (optional)' }, e.notiz || '');
  const note = old && old.datum < today ? h('input', { type: 'text', value: e.note || '', placeholder: 'z. B. 2-', inputmode: 'text' }) : null;
  const check = (value, label, on) => h('label', { class: 'check-row' },
    h('input', { type: 'checkbox', value, checked: on }), h('span', {}, label));
  const lessonBoxes = lessons.map((l) => check(l, l, e.lektionen.includes(l)));
  const unitBoxes = units.map((u) => check(u.id, u.thema, e.grammatik.includes(u.id)));

  main.append(h('div', { class: 'card' },
    h('a', { href: old ? planHref(old.id) : '#/planer', class: 'back' }, '‹ Zurück'),
    h('h2', {}, old ? 'Arbeit bearbeiten' : 'Klassenarbeit eintragen'),
    h('label', { class: 'field' }, h('span', {}, 'Datum'), datum),
    h('label', { class: 'field' }, h('span', {}, 'Art'), art),
    h('label', { class: 'field' }, h('span', {}, 'Bezeichnung (optional)'), titel),
    h('label', { class: 'field' }, h('span', {}, 'Stoff / Notiz'), notiz),
    note ? h('label', { class: 'field' }, h('span', {}, 'Deine Note (für die Statistik)'), note) : null),
  h('div', { class: 'card' },
    h('h3', {}, 'Vokabeln'),
    lessons.length ? h('div', {}, lessonBoxes) : h('p', { class: 'muted' }, 'Noch keine Lektionen gespeichert.'),
    h('p', { class: 'muted small' }, 'Diese Lektionen kommen bis zum Termin im Intensivmodus dran.')),
  h('div', { class: 'card' },
    h('h3', {}, 'Grammatik'),
    h('div', {}, unitBoxes)),
  h('div', { class: 'card' },
    h('label', { class: 'field' }, h('span', {}, 'Probe-Klassenarbeiten (Übersetzung mit Zeitlimit)'), probe),
    h('label', { class: 'field' }, h('span', {}, 'Uhrzeit für die Kalender-Erinnerung'), uhr),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        if (!datum.value) return toast('Bitte ein Datum wählen.');
        const picked = (boxes) => boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
        const rec = {
          ...(old || {}), titel: titel.value.trim(), art: art.value, datum: datum.value,
          lektionen: picked(lessonBoxes), grammatik: picked(unitBoxes), probetexte: Number(probe.value),
          uhrzeit: uhr.value || '17:00', notiz: notiz.value.trim()
        };
        if (note) rec.note = note.value.trim();
        if (!rec.lektionen.length && !rec.grammatik.length && !rec.probetexte) {
          return toast('Bitte wähle mindestens Vokabeln, Grammatik oder eine Probe-Klassenarbeit.');
        }
        const saved = await saveExam(rec);
        toast(old ? 'Gespeichert.' : 'Lernplan erstellt.');
        location.hash = planHref(saved.id);
      }
    }, old ? 'Speichern' : 'Lernplan erstellen')));
}

/* =================== Lernplan =================== */

async function renderPlan(main, id) {
  const exam = await getExam(id);
  if (!exam) { main.append(h('p', { class: 'card' }, 'Diese Arbeit gibt es nicht (mehr).')); return; }
  const today = todayStr();
  const rest = daysBetween(today, exam.datum);
  const units = new Map((await loadUnits()).map((u) => [u.id, u.thema]));
  const days = await buildPlan(exam);
  const done = await doneMap(exam, days);
  const all = days.flatMap((d) => d.aufgaben.map((a) => `${d.datum}|${a.id}`));
  const doneCount = all.filter((k) => done[k]).length;

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/planer', class: 'back' }, '‹ Alle Arbeiten'),
    h('h2', {}, exam.titel || ARTEN[exam.art]),
    h('p', {}, formatDate(exam.datum), ' ', h('span', { class: 'badge warn' }, countdown(rest)),
      exam.note ? h('span', { class: 'badge', style: 'margin-left:6px' }, 'Note ' + exam.note) : null),
    exam.notiz ? h('p', { class: 'small' }, exam.notiz) : null,
    h('p', { class: 'muted small' }, [
      exam.lektionen.length ? `Vokabeln: ${exam.lektionen.join(', ')}` : null,
      exam.grammatik.length ? `Grammatik: ${exam.grammatik.map((g) => units.get(g) || g).join(', ')}` : null,
      exam.probetexte ? `${exam.probetexte} Probe-Klassenarbeit(en)` : null
    ].filter(Boolean).join(' · ')),
    all.length ? h('div', {},
      h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((doneCount / all.length) * 100)}%` })),
      h('p', { class: 'muted small' }, `${doneCount} von ${all.length} Aufgaben erledigt`)) : null,
    h('div', { class: 'btn-row' },
      rest >= 0 ? h('button', { class: 'btn btn-small', onclick: () => calendar(exam, days) }, 'In den Kalender') : null,
      h('a', { class: 'btn secondary btn-small', href: '#/planer/bearbeiten/' + encodeURIComponent(exam.id) }, rest < 0 ? 'Note eintragen' : 'Bearbeiten'),
      rest > 0 && exam.start < today ? h('button', {
        class: 'btn secondary btn-small',
        onclick: async () => {
          if (!(await confirmDialog('Plan neu verteilen?', 'Der restliche Stoff wird ab heute neu auf die Tage bis zur Arbeit verteilt. Abgehakte Aufgaben vergangener Tage bleiben im Verlauf.', 'Neu verteilen'))) return;
          await saveExam({ ...exam, start: today });
          location.hash = planHref(exam.id) + '?' + Date.now();
        }
      }, 'Ab heute neu verteilen') : null,
      h('button', {
        class: 'btn danger btn-small',
        onclick: async () => {
          if (!(await confirmDialog('Arbeit löschen?', 'Der Lernplan wird gelöscht. Testtermine, die daraus stammen, werden entfernt. Deine Lernstände bleiben.', 'Löschen', true))) return;
          await deleteExam(exam);
          toast('Gelöscht.');
          location.hash = '#/planer';
        }
      }, 'Löschen'))));

  // Tage: vergangene eingeklappt, heute hervorgehoben
  const pastDays = days.filter((d) => d.datum < today && d.aufgaben.length);
  if (pastDays.length && rest >= 0) {
    main.append(h('details', { class: 'card help' },
      h('summary', {}, `Vergangene Tage (${pastDays.length})`),
      pastDays.map((d) => dayBlock(d))));
  }
  for (const d of days.filter((x) => x.datum >= today || rest < 0)) {
    if (d.rest === 0) {
      main.append(h('div', { class: 'card note' }, h('h3', {}, `${dayLabel(d.datum)} – ${ARTEN[exam.art]}`),
        h('p', {}, rest === 0 ? 'Heute ist es so weit. Ruhig bleiben, Text erst ganz lesen, dann Satz für Satz.' : 'Der Tag der Arbeit.')));
      continue;
    }
    if (d.aufgaben.length) main.append(h('div', { class: 'card' + (d.datum === today ? ' today' : '') }, dayBlock(d)));
  }
  if (!days.some((d) => d.aufgaben.length)) {
    main.append(h('div', { class: 'card note' }, h('p', {}, 'Bis zur Arbeit bleibt kein Lerntag mehr.')));
  }

  function dayBlock(d) {
    return h('div', { class: 'day' },
      h('h3', {}, dayLabel(d.datum), d.datum === today ? ' – heute' : '', ' ',
        h('span', { class: 'muted small' }, `noch ${d.rest} ${d.rest === 1 ? 'Tag' : 'Tage'}`)),
      h('ul', { class: 'tasks' }, d.aufgaben.map((a) => {
        const key = `${d.datum}|${a.id}`;
        const box = h('input', {
          type: 'checkbox', checked: done[key], 'aria-label': 'erledigt',
          onchange: async (ev) => { await toggleDone(exam, key, ev.target.checked); li.classList.toggle('done', ev.target.checked); }
        });
        const li = h('li', { class: done[key] ? 'done' : '' }, box,
          a.href ? h('a', { href: a.href }, a.text) : h('span', {}, a.text));
        return li;
      })));
  }
}

/** Kalenderdatei über das Teilen-Menü (iPhone) bzw. als Download. */
async function calendar(exam, days) {
  const file = new File([buildIcs(exam, days)], `latein-lernplan-${exam.datum}.ics`, { type: 'text/calendar' });
  const ok = await offerFile(file, {
    title: 'Lernplan in den Kalender',
    text: `Ein Termin pro Lerntag um ${exam.uhrzeit || '17:00'} Uhr mit Erinnerung, dazu die Arbeit selbst. Tippe auf „Öffnen“ und wähle „Kalender“. Klappt das nicht: Datei in „Dateien“ sichern und dort antippen. Änderst du den Plan später, lösche die alten Termine im Kalender und erzeuge die Datei neu.`
  });
  if (ok) toast('Kalenderdatei erstellt.');
}
