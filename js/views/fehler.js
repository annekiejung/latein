/*
 * Fehlerjournal.
 *   #/fehler            Überblick: offen/erledigt, häufigste Fehler, Wiederholung starten
 *   #/fehler/liste      alle offenen Fehler (mit „entfernen“, falls die Bewertung falsch war)
 *   #/fehler/training   Fehler-Karteikarten (Grammatik, Formen, Prüfung)
 * Vokabeln werden mit der normalen Abfrage (js/quiz.js) wiederholt, ohne die Fächer zu ändern.
 * Logik: js/journal.js
 */
import { getAll, getSetting, setSetting } from '../db.js';
import { h, toast } from '../ui.js';
import { startQuiz } from '../quiz.js';
import { loadCards } from '../gws.js';
import { logSeconds } from '../leitner.js';
import {
  loadItems, isDueToday, markCorrect, markWrong, removeItem, analyse, TYPEN
} from '../journal.js';

export const title = 'Fehlerjournal';

export async function render(main, params) {
  const [sub] = params;
  if (sub === 'liste') return renderList(main);
  if (sub === 'training') return renderTraining(main);
  return renderOverview(main);
}

const VOKABEL_TYPEN = ['vokabel', 'grundwortschatz'];
const KAT = { vokabel: 'Vokabel', form: 'Form', konstruktion: 'Konstruktion', syntax: 'Satzbau', sinn: 'Sinn', stil: 'Stil' };
const comma = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Balken für die Häufigkeits-Listen. */
function bars(list, max, render, unit = '×') {
  return h('ul', { class: 'list bars' }, list.map((x) => h('li', {},
    h('div', { class: 'bar-label' }, render(x), h('span', { class: 'muted small' }, comma(x.n) + unit)),
    h('div', { class: 'progress' }, h('span', { style: `width:${Math.max(4, Math.round((x.n / max) * 100))}%` })))));
}

/* =================== Überblick =================== */

async function renderOverview(main) {
  const items = await loadItems();
  const offen = items.filter((i) => !i.erledigt);
  const due = items.filter(isDueToday);
  const dueVok = due.filter((i) => VOKABEL_TYPEN.includes(i.typ));
  const dueRest = due.filter((i) => !VOKABEL_TYPEN.includes(i.typ));

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/start', class: 'back' }, '‹ Start'),
    h('h2', {}, 'Deine Fehler'),
    items.length ? h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, offen.length), h('span', {}, 'offen')),
      h('div', { class: 'stat' }, h('b', {}, due.length), h('span', {}, 'heute wiederholen')),
      h('div', { class: 'stat' }, h('b', {}, items.length - offen.length), h('span', {}, 'erledigt')))
      : h('p', { class: 'muted' }, 'Noch keine Fehler gesammelt. Sie entstehen automatisch beim Üben: falsche Vokabeln, Grammatik-Aufgaben, Formen und bewertete Prüfungen.'),
    items.length ? h('p', { class: 'muted small', style: 'margin-top:10px' },
      'Erledigt ist ein Fehler erst, wenn du ihn nach dem letzten Fehler an zwei verschiedenen Tagen richtig hattest. Ein neuer Fehler macht ihn wieder offen.') : null,
    dueVok.length ? h('button', { class: 'btn block', onclick: () => startVocab(main, dueVok) },
      `Vokabeln wiederholen (${dueVok.length})`) : null,
    dueRest.length ? h('a', { class: 'btn block', href: '#/fehler/training' },
      `Grammatik, Formen, Prüfung wiederholen (${dueRest.length})`) : null,
    items.length && !due.length ? h('p', {}, offen.length
      ? 'Für heute ist alles wiederholt – die übrigen offenen Fehler sind ab morgen wieder dran.'
      : 'Alle Fehler sind erledigt.') : null,
    offen.length ? h('a', { class: 'btn secondary block', href: '#/fehler/liste' }, 'Alle offenen Fehler ansehen') : null));

  if (!items.length) return;

  // Auswertung mit Zeitraum-Umschalter
  const box = h('div');
  const prefs = { tage: (await getSetting('fehlerZeitraum')) ?? 30 };
  const switcher = h('div', { class: 'btn-row' }, [[30, 'letzte 30 Tage'], [0, 'alles']].map(([v, label]) => h('button', {
    class: 'btn btn-small ' + (prefs.tage === v ? '' : 'secondary'),
    onclick: async (e) => {
      prefs.tage = v;
      switcher.querySelectorAll('button').forEach((b) => b.classList.add('secondary'));
      e.currentTarget.classList.remove('secondary');
      await setSetting('fehlerZeitraum', v);
      showAnalysis();
    }
  }, label)));
  main.append(h('div', { class: 'card' }, h('h2', {}, 'Wo hakt es?'), switcher, box));

  async function showAnalysis() {
    const a = await analyse(prefs.tage || null);
    if (!a.gesamt) { box.replaceChildren(h('p', { class: 'muted' }, 'In diesem Zeitraum keine Fehler.')); return; }
    const parts = [h('p', { class: 'muted small' }, `${a.gesamt} Fehler: ` +
      Object.entries(a.bereiche).map(([t, n]) => `${TYPEN[t] || t} ${n}`).join(' · '))];
    if (a.phaenomene.length) {
      parts.push(h('h3', {}, 'Grammatik und Formen'),
        bars(a.phaenomene, a.phaenomene[0].n, (x) => h('span', {}, x.name,
          x.einheit ? h('a', { href: '#/grammatik/einheit/' + x.einheit, class: 'small', style: 'margin-left:8px' }, 'Einheit üben') : null,
          x.formen ? h('a', { href: '#/grammatik/formen', class: 'small', style: 'margin-left:8px' }, 'Formen üben') : null)));
    }
    if (a.kategorien.length) {
      parts.push(h('h3', {}, 'In Prüfungen (Fehlerpunkte)'),
        bars(a.kategorien, a.kategorien[0].n, (x) => h('span', {}, KAT[x.name] || x.name), ' Pkt.'));
    }
    if (a.woerter.length) {
      parts.push(h('h3', {}, 'Wörter, die mehrfach falsch waren'),
        h('ul', { class: 'list' }, a.woerter.map((w) => h('li', {},
          h('span', { class: 'latin' }, w.name), ' – ', h('span', { class: 'muted' }, w.erwartet), ' ',
          h('span', { class: 'badge warn' }, w.n + '×')))));
    }
    box.replaceChildren(...parts);
  }
  showAnalysis();
}

/* =================== Vokabeln wiederholen =================== */

/** Vokabel-Fehler: echte Karten suchen und mit der normalen Abfrage üben (freies Üben). */
async function startVocab(main, items) {
  const vocab = new Map((await getAll('vocab')).map((c) => [c.id, c]));
  let core = new Map();
  if (items.some((i) => i.typ === 'grundwortschatz')) core = new Map((await loadCards()).map((c) => [c.id, c]));
  const byMode = { bedeutung: [], formen: [] };
  let missing = 0;
  for (const it of items) {
    const card = (it.typ === 'vokabel' ? vocab : core).get(it.karteId);
    if (card) (byMode[it.modus] || byMode.bedeutung).push(card);
    else missing++;
  }
  if (missing) toast(`${missing} Karte(n) gibt es nicht mehr – sie werden übersprungen.`, 3500);
  const style = ((await getSetting('quizPrefs')) || {}).style || 'eingabe';
  const run = (mode, next) => startQuiz(main, {
    cards: byMode[mode], mode, style, leitner: false, onDone: next
  });
  const back = () => { location.hash = '#/fehler?' + Date.now(); };
  if (byMode.bedeutung.length && byMode.formen.length) run('bedeutung', () => run('formen', back));
  else if (byMode.bedeutung.length) run('bedeutung', back);
  else if (byMode.formen.length) run('formen', back);
  else back();
}

/* =================== Fehler-Karteikarten =================== */

async function renderTraining(main) {
  const items = (await loadItems()).filter((i) => isDueToday(i) && !VOKABEL_TYPEN.includes(i.typ));
  if (!items.length) { location.replace('#/fehler'); return; }
  // Häufige Fehler zuerst, höchstens 20 pro Runde
  const round = items.sort((a, b) => b.anzahl - a.anzahl || a.letzter.localeCompare(b.letzter)).slice(0, 20);
  window.quizActive = true;
  const started = Date.now();
  let pos = 0;
  let right = 0;
  const wrong = [];

  function show() {
    if (pos >= round.length) return finish();
    const it = round[pos];
    const area = h('div');
    const input = h('textarea', { rows: 2, placeholder: 'Deine Antwort (optional)', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const label = it.typ === 'pruefung' ? 'Übersetze' : it.typ === 'formen' && !String(it.frage).startsWith('Bilde') ? 'Bestimme die Form' : null;
    const context = [...new Set([TYPEN[it.typ], it.typ === 'pruefung' ? KAT[it.kategorie] : null, it.phaenomen || it.thema].filter(Boolean))].join(' · ');
    main.replaceChildren(
      h('div', { class: 'quiz-top' },
        h('span', { class: 'muted' }, `${pos + 1} / ${round.length}`),
        h('button', { class: 'btn secondary btn-small', onclick: finish }, 'Beenden')),
      h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((pos / round.length) * 100)}%` })),
      h('div', { class: 'card' },
        h('div', { class: 'quiz-meta' },
          h('span', { class: 'badge' }, context),
          it.anzahl > 1 ? h('span', { class: 'badge warn' }, `${it.anzahl}× falsch`) : null,
          it.richtigTage ? h('span', { class: 'badge ok' }, `${it.richtigTage}/2 Tage richtig`) : null),
        label ? h('p', { class: 'muted' }, label + ':') : null,
        h('p', { class: 'big' + (it.typ !== 'grammatik' ? ' latin' : '') }, it.frage),
        input, area));
    area.append(h('button', {
      class: 'btn block', style: 'margin-top:10px',
      onclick: () => {
        input.readOnly = true;
        area.replaceChildren(
          h('div', { class: 'quiz-solution' },
            h('div', { class: 'big' }, it.erwartet || '–'),
            it.erklaerung ? h('div', { class: 'muted' }, it.erklaerung) : null),
          it.gegeben && !it.gegeben.startsWith('(') ? h('p', { class: 'small' }, 'Damals: ', h('span', { class: 'part-falsch' }, it.gegeben)) : null,
          h('p', { class: 'muted' }, 'Ehrlich: Hättest du es vollständig richtig gehabt?'),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn danger', onclick: async () => { await markWrong(it, input.value.trim()); wrong.push(it); next(); } }, 'Noch nicht'),
            h('button', { class: 'btn', onclick: async () => { await markCorrect(it.key); right++; next(); } }, 'Richtig gewusst')));
      }
    }, 'Lösung zeigen'));
    window.scrollTo(0, 0);
  }
  const next = () => { pos++; show(); };

  async function finish() {
    window.quizActive = false;
    await logSeconds(Math.min((Date.now() - started) / 1000, round.length * 120));
    const done = right + wrong.length;
    main.replaceChildren(
      h('div', { class: 'card' },
        h('h2', {}, 'Wiederholung beendet'),
        done ? h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', {}, right), h('span', {}, 'gewusst')),
          h('div', { class: 'stat' }, h('b', {}, wrong.length), h('span', {}, 'noch nicht')),
          h('div', { class: 'stat' }, h('b', {}, Math.round((right / done) * 100) + ' %'), h('span', {}, 'Quote')))
          : h('p', {}, 'Keine Karte bearbeitet.'),
        right ? h('p', { class: 'muted', style: 'margin-top:10px' },
          'Richtig gewusste Fehler kommen frühestens morgen wieder – nach dem zweiten richtigen Tag sind sie erledigt.') : null),
      h('a', { class: 'btn block', href: '#/fehler' }, 'Fertig'));
    window.scrollTo(0, 0);
  }
  show();
}

/* =================== Liste =================== */

async function renderList(main) {
  const items = (await loadItems()).filter((i) => !i.erledigt);
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/fehler', class: 'back' }, '‹ Fehlerjournal'),
    h('h2', {}, `Offene Fehler (${items.length})`),
    h('p', { class: 'muted small' }, '„Entfernen“ nur, wenn der Fehler gar keiner war (z. B. falsch bewertet). Sonst lieber wiederholen.')));
  const groups = {};
  for (const it of items) (groups[it.typ] ||= []).push(it);
  for (const [typ, list] of Object.entries(groups)) {
    main.append(h('div', { class: 'card' },
      h('h3', {}, `${TYPEN[typ] || typ} (${list.length})`),
      h('ul', { class: 'list' }, list.map((it) => h('li', {},
        h('div', { class: typ === 'grammatik' ? '' : 'latin' }, it.frage),
        h('div', { class: 'small' }, it.erwartet),
        h('div', { class: 'muted small' },
          `${it.anzahl}× falsch · ${it.richtigTage}/2 Tage richtig`, it.phaenomen ? ` · ${it.phaenomen}` : '',
          ' · ', h('a', {
            href: '#', onclick: async (e) => {
              e.preventDefault();
              const a = e.currentTarget;
              if (!a.dataset.armed) { a.dataset.armed = '1'; a.textContent = 'wirklich entfernen?'; return; }
              await removeItem(it);
              a.closest('li').remove();
              toast('Entfernt.');
            }
          }, 'entfernen')))))));
  }
}
