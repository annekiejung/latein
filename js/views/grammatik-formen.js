/*
 * Formenlehre-Ansichten (Teil des Grammatik-Bereichs):
 *   #/grammatik/tabellen                  Übersicht aller Tabellen
 *   #/grammatik/tabelle/verb/<id>         Konjugationstabelle (Tempus wählen, Ind./Konj. nebeneinander)
 *   #/grammatik/tabelle/<nomen|adj|pron>/<id>  Deklinationstabelle
 *   #/grammatik/formen                    Formen-Training unregelmäßige Verben
 * Daten: js/morph.js
 */
import { put, newId } from '../db.js';
import { h, todayStr } from '../ui.js';
import { logSeconds } from '../leitner.js';
import {
  VERBEN, UNREGELMAESSIG, NOMEN, ADJEKTIVE, PRONOMEN, TEMPORA, PERSONEN,
  allForms, describe, sameAnalysis
} from '../morph.js';

const fill = (el, ...parts) => el.replaceChildren(...parts.filter(Boolean));
const GRUPPEN = { nomen: NOMEN, adj: ADJEKTIVE, pron: PRONOMEN };

/* =================== Tabellen-Übersicht =================== */

export function renderTables(main) {
  const link = (href, title, sub) => h('li', {}, h('a', { href, class: 'row-link' },
    h('span', { class: 'latin' }, title), h('span', { class: 'muted small' }, sub)));
  main.append(
    h('div', { class: 'card' },
      h('a', { href: '#/grammatik', class: 'back' }, '‹ Grammatik'),
      h('h2', {}, 'Konjugation'),
      h('ul', { class: 'list' }, VERBEN.map((v) => link('#/grammatik/tabelle/verb/' + v.id, v.name, v.art)))),
    h('div', { class: 'card' }, h('h2', {}, 'Deklination'),
      h('ul', { class: 'list' }, NOMEN.map((t) => link('#/grammatik/tabelle/nomen/' + t.id, t.titel, t.art)))),
    h('div', { class: 'card' }, h('h2', {}, 'Adjektive'),
      h('ul', { class: 'list' }, ADJEKTIVE.map((t) => link('#/grammatik/tabelle/adj/' + t.id, t.titel, t.art)))),
    h('div', { class: 'card' }, h('h2', {}, 'Pronomen'),
      h('ul', { class: 'list' }, PRONOMEN.map((t) => link('#/grammatik/tabelle/pron/' + t.id, t.titel, t.art))))
  );
}

/* =================== Einzelne Tabelle =================== */

export function renderTable(main, typ, id) {
  if (typ === 'verb') return renderVerb(main, VERBEN.find((v) => v.id === id));
  const t = (GRUPPEN[typ] || []).find((x) => x.id === id);
  if (!t) { main.append(h('p', { class: 'card' }, 'Diese Tabelle gibt es nicht.')); return; }
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik/tabellen', class: 'back' }, '‹ Alle Tabellen'),
    h('h2', { class: 'latin' }, t.titel),
    h('p', { class: 'muted' }, t.art),
    ...splitTable(t),
    t.hinweis ? h('p', { class: 'small', style: 'margin-top:10px' }, t.hinweis) : null));
}

/**
 * Breite Tabellen (mehr als 3 Formspalten) fürs Handy aufteilen:
 * „m Sg. / f Sg. / … Pl.“ → Singular- und Plural-Tabelle, „turris Sg. / mare Sg.“ → je Wort.
 */
function splitTable(t) {
  // Spaltenkopf: bei Singular/Plural-Gruppen das Genus, bei Wort-Gruppen Singular/Plural
  const header = (s, k) => (k === 'Singular' || k === 'Plural')
    ? s.replace(/\s*(Sg\.|Pl\.)$/, '')
    : (s.includes('Pl.') ? 'Plural' : 'Singular');
  if (t.spalten.length <= 3 || !t.spalten.some((s) => /Sg\.|Pl\./.test(s))) return [table(['', ...t.spalten], t.zeilen)];
  const key = (s) => (/^(m|f|n|m\/f)\s/.test(s) ? (s.includes('Pl.') ? 'Plural' : 'Singular') : s.split(' ')[0]);
  const groups = new Map();
  t.spalten.forEach((s, i) => {
    const k = key(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  return [...groups].map(([k, idx]) => h('div', {},
    h('h3', { class: 'table-title' }, k),
    table(['', ...idx.map((i) => header(t.spalten[i], k))],
      t.zeilen.map((r) => [r[0], ...idx.map((i) => r[i + 1])]))));
}

/** Einfache Tabelle; breite Tabellen lassen sich seitlich wischen. */
function table(head, rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'forms' },
    h('thead', {}, h('tr', {}, head.map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i ? h('td', { class: 'latin' }, c) : h('th', {}, c))))))));
}

function renderVerb(main, v) {
  if (!v) { main.append(h('p', { class: 'card' }, 'Dieses Verb gibt es nicht.')); return; }
  const state = { genus: 'aktiv', tempus: 'praes' };
  const holder = h('div');

  const seg = (key, options) => h('div', { class: 'seg seg-wrap', role: 'radiogroup' },
    options.map(([value, label]) => h('label', {},
      h('input', { type: 'radio', name: 'verb-' + key, value, checked: state[key] === value, onchange: () => { state[key] = value; draw(); } }),
      h('span', {}, label))));

  function draw() {
    const t = v[state.genus];
    const ind = t.ind[state.tempus];
    const konj = t.konj && t.konj[state.tempus];
    const rows = PERSONEN.map((p, i) => [p, ind ? ind[i] : '–', konj ? konj[i] : '–']);
    fill(holder, table(['', 'Indikativ', 'Konjunktiv'], rows),
      !konj ? h('p', { class: 'muted small' }, 'Futur I und Futur II gibt es nur im Indikativ.') : null);
  }

  const inf = v.inf || {};
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik/tabellen', class: 'back' }, '‹ Alle Tabellen'),
    h('h2', { class: 'latin' }, v.name),
    h('p', { class: 'muted' }, v.art, ' · ', h('span', { class: 'latin' }, v.grundformen)),
    v.passiv ? seg('genus', [['aktiv', 'Aktiv'], ['passiv', 'Passiv']]) : null,
    h('div', { style: 'margin-top:8px' }, seg('tempus', Object.entries(TEMPORA))),
    holder,
    h('h3', { style: 'margin-top:14px' }, 'Infinitive und Imperativ'),
    h('ul', { class: 'list small' },
      inf.praes ? h('li', {}, 'Inf. Präs. Akt.: ', h('span', { class: 'latin' }, inf.praes)) : null,
      inf.perf ? h('li', {}, 'Inf. Perf. Akt.: ', h('span', { class: 'latin' }, inf.perf)) : null,
      inf.fut ? h('li', {}, 'Inf. Fut. Akt.: ', h('span', { class: 'latin' }, inf.fut)) : null,
      inf.praesPass ? h('li', {}, 'Inf. Präs. Pass.: ', h('span', { class: 'latin' }, inf.praesPass)) : null,
      inf.perfPass ? h('li', {}, 'Inf. Perf. Pass.: ', h('span', { class: 'latin' }, inf.perfPass)) : null,
      v.imp ? h('li', {}, 'Imperativ: ', h('span', { class: 'latin' }, v.imp.join(' – '))) : null)
  ));
  draw();
}

/* =================== Formen-Training =================== */

// Index über ALLE Verben: Form → alle Analysen (für mehrdeutige Formen)
let INDEX = null;
function index() {
  if (!INDEX) {
    INDEX = new Map();
    for (const v of VERBEN) for (const a of allForms(v)) {
      if (!INDEX.has(a.form)) INDEX.set(a.form, []);
      INDEX.get(a.form).push({ ...a, hatPassiv: !!v.passiv });
    }
  }
  return INDEX;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function renderDrill(main) {
  const prefs = { verben: new Set(UNREGELMAESSIG.map((v) => v.id)), modus: 'mc', konj: true, anzahl: '20' };
  const startBtn = h('button', { class: 'btn block' });

  const seg = (key, options) => h('div', { class: 'seg', role: 'radiogroup' },
    options.map(([value, label]) => h('label', {},
      h('input', { type: 'radio', name: 'fd-' + key, value, checked: prefs[key] === value, onchange: () => { prefs[key] = value; } }),
      h('span', {}, label))));

  const chips = h('div', { class: 'chips' }, UNREGELMAESSIG.map((v) => h('label', { class: 'chip' },
    h('input', {
      type: 'checkbox', checked: true,
      onchange: (e) => { e.target.checked ? prefs.verben.add(v.id) : prefs.verben.delete(v.id); startBtn.disabled = !prefs.verben.size; }
    }),
    h('span', { class: 'latin' }, v.name))));
  const konj = h('input', { type: 'checkbox', checked: true, onchange: (e) => { prefs.konj = e.target.checked; } });

  startBtn.textContent = 'Training starten';
  startBtn.onclick = () => {
    const verbs = UNREGELMAESSIG.filter((v) => prefs.verben.has(v.id));
    let pool = verbs.flatMap((v) => allForms(v).map((a) => ({ ...a, v })))
      .filter((a) => !a.form.includes('('));               // „futūrum esse (fore)“ nicht abfragen
    if (!prefs.konj) pool = pool.filter((a) => a.modus !== 'Konjunktiv');
    if (prefs.modus === 'selbst') pool = pool.filter((a) => a.modus === 'Indikativ' || a.modus === 'Konjunktiv');
    // jede Form nur einmal pro Runde
    const seen = new Set();
    const items = shuffle(pool).filter((a) => !seen.has(a.form) && seen.add(a.form)).slice(0, parseInt(prefs.anzahl, 10));
    drillSession(main, items, prefs.modus, verbs);
  };

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik', class: 'back' }, '‹ Grammatik'),
    h('h2', {}, 'Formen bestimmen'),
    h('p', { class: 'muted small' }, 'Die App zeigt eine Form eines unregelmäßigen Verbs – du bestimmst Person, Numerus, Tempus, Modus (und ggf. Aktiv/Passiv).'),
    h('div', { class: 'field' }, h('span', {}, 'Welche Verben?'), chips),
    h('div', { class: 'field' }, h('span', {}, 'Wie?'),
      seg('modus', [['mc', 'Multiple Choice'], ['selbst', 'Selbst bestimmen']])),
    h('label', { class: 'check-row' }, konj, h('span', {}, 'Konjunktivformen mit abfragen')),
    h('div', { class: 'field' }, h('span', {}, 'Wie viele?'), seg('anzahl', [['10', '10'], ['20', '20'], ['40', '40']])),
    startBtn,
    h('p', { style: 'margin-top:10px' }, h('a', { href: '#/grammatik/tabellen' }, 'Zu den Tabellen'))
  ));
}

function drillSession(main, items, modus, verbs) {
  window.quizActive = true;
  const started = Date.now();
  let pos = 0, right = 0;
  const wrong = [];

  async function verbuchen(item, ok, gegeben) {
    if (ok) right++;
    else {
      wrong.push(item);
      await put('journal', {
        id: newId('j'), typ: 'formen', thema: 'Unregelmäßige Verben', phaenomen: item.verb,
        frage: item.form, erwartet: correctList(item).join(' / '), gegeben, bewertung: 0,
        datum: todayStr(), zeit: new Date().toISOString()
      });
    }
  }

  /** Alle richtigen Bestimmungen einer Form (auch von anderen Verben, z. B. „es“). */
  const analyses = (item) => index().get(item.form) || [item];
  const correctList = (item) => analyses(item).map((a) => `${describe(a, a.hatPassiv)} von ${a.verb}`);

  function show() {
    if (pos >= items.length) return finish();
    const item = items[pos];
    const body = h('div', { class: 'card' });
    main.replaceChildren(
      h('div', { class: 'quiz-top' },
        h('span', { class: 'muted' }, `${pos + 1} / ${items.length}`),
        h('button', { class: 'btn secondary btn-small', onclick: finish }, 'Beenden')),
      h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((pos / items.length) * 100)}%` })),
      body);
    fill(body, h('div', { class: 'quiz-card' }, h('div', { class: 'quiz-latin latin' }, item.form), h('div', { class: 'muted' }, 'Bestimme die Form.')));
    (modus === 'mc' ? mc : selbst)(item, body);
  }

  const resultBox = (item, ok) => h('div', {},
    h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad') }, ok ? 'Richtig' : 'Falsch'),
    h('div', { class: 'quiz-solution' },
      h('div', { class: 'muted small' }, analyses(item).length > 1 ? 'Mehrdeutig – alle richtigen Bestimmungen:' : 'Lösung:'),
      h('ul', { class: 'parts' }, correctList(item).map((t) => h('li', {}, t)))));

  /* ----- Multiple Choice: 1 richtige + 3 falsche Bestimmungen ----- */
  function mc(item, body) {
    const all = analyses(item);
    const label = (a) => `${describe(a, a.hatPassiv ?? !!item.v.passiv)} von ${a.verb}`;
    const correct = label({ ...item, hatPassiv: !!item.v.passiv });
    // Falsche Antworten möglichst ÄHNLICH zur richtigen (nur ein, zwei Merkmale anders),
    // damit man genau hinschauen muss. Was zur Form tatsächlich passt, ist nie falsch.
    const sim = (a) => (a.person === item.person ? 1 : 0) + (a.numerus === item.numerus ? 1 : 0)
      + (a.tempus === item.tempus ? 1 : 0) + (a.modus === item.modus ? 1 : 0) + (a.genus === item.genus ? 1 : 0);
    const distract = new Set();
    const candidates = shuffle(allForms(item.v))
      .filter((a) => a.modus === 'Indikativ' || a.modus === 'Konjunktiv' || a.modus === item.modus)
      .filter((a) => !all.some((x) => sameAnalysis(x, a) && x.verb === a.verb))
      .sort((a, b) => sim(b) - sim(a));
    for (const a of candidates) {
      if (distract.size >= 3) break;
      const t = label({ ...a, hatPassiv: !!item.v.passiv });
      if (t !== correct && sim(a) >= 3) distract.add(t);
    }
    for (const a of candidates) {                     // notfalls auffüllen
      if (distract.size >= 3) break;
      const t = label({ ...a, hatPassiv: !!item.v.passiv });
      if (t !== correct) distract.add(t);
    }
    const options = shuffle([correct, ...distract]);
    const area = h('div');
    const buttons = options.map((o) => h('button', {
      class: 'btn secondary block option',
      onclick: async () => {
        buttons.forEach((b) => { b.disabled = true; if (b.textContent === correct) b.classList.add('option-ok'); });
        const ok = o === correct;
        if (!ok) buttons.find((b) => b.textContent === o).classList.add('option-bad');
        await verbuchen(item, ok, o);
        fill(area, resultBox(item, ok), h('button', { class: 'btn block', onclick: () => { pos++; show(); } }, 'Weiter'));
      }
    }, o));
    body.append(...buttons, area);
  }

  /* ----- Selbst bestimmen: Merkmale einzeln antippen ----- */
  function selbst(item, body) {
    const choice = {};
    const row = (key, label, options) => h('div', { class: 'field' }, h('span', {}, label),
      h('div', { class: 'seg seg-wrap', role: 'radiogroup' }, options.map(([value, text]) => h('label', {},
        h('input', { type: 'radio', name: 'sb-' + key + pos, value, onchange: () => { choice[key] = value; } }),
        h('span', {}, text)))));
    const showVerb = verbs.length > 1;
    const needsGenus = !!item.v.passiv;
    const area = h('div');
    const parts = [
      showVerb ? row('verb', 'Verb', verbs.map((v) => [v.name, v.name])) : null,
      row('person', 'Person', [['1', '1.'], ['2', '2.'], ['3', '3.']]),
      row('numerus', 'Numerus', [['Sg.', 'Sg.'], ['Pl.', 'Pl.']]),
      row('tempus', 'Tempus', Object.values(TEMPORA).map((t) => [t, t.replace('Plusquamperfekt', 'Plqpf.')])),
      row('modus', 'Modus', [['Indikativ', 'Ind.'], ['Konjunktiv', 'Konj.']]),
      needsGenus ? row('genus', 'Genus verbi', [['Aktiv', 'Aktiv'], ['Passiv', 'Passiv']]) : null,
      area];
    body.append(...parts.filter(Boolean));
    area.append(h('button', {
      class: 'btn block',
      onclick: async (e) => {
        const need = ['person', 'numerus', 'tempus', 'modus', ...(needsGenus ? ['genus'] : []), ...(showVerb ? ['verb'] : [])];
        if (need.some((k) => !choice[k])) { e.currentTarget.textContent = 'Bitte alles auswählen'; return; }
        const guess = { person: +choice.person, numerus: choice.numerus, tempus: choice.tempus, modus: choice.modus, genus: needsGenus ? choice.genus : 'Aktiv' };
        const ok = analyses(item).some((a) => sameAnalysis(a, { ...guess, genus: a.hatPassiv ? guess.genus : a.genus })
          && (!showVerb || a.verb === choice.verb));
        body.querySelectorAll('input').forEach((i) => { i.disabled = true; });
        await verbuchen(item, ok, `${describe({ ...guess }, needsGenus)}${showVerb ? ' von ' + choice.verb : ''}`);
        fill(area, resultBox(item, ok), h('button', { class: 'btn block', onclick: () => { pos++; show(); } }, 'Weiter'));
      }
    }, 'Prüfen'));
  }

  async function finish() {
    window.quizActive = false;
    const done = right + wrong.length;
    await logSeconds(Math.min((Date.now() - started) / 1000, done * 60));
    if (done) await put('history', { id: newId('h'), typ: 'formen', richtig: right, gesamt: done, zeit: new Date().toISOString() });
    main.replaceChildren(
      h('div', { class: 'card' },
        h('h2', {}, 'Training beendet'),
        done ? h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', {}, right), h('span', {}, 'richtig')),
          h('div', { class: 'stat' }, h('b', {}, wrong.length), h('span', {}, 'falsch')),
          h('div', { class: 'stat' }, h('b', {}, Math.round((right / done) * 100) + ' %'), h('span', {}, 'Quote'))) : h('p', {}, 'Keine Form bestimmt.')),
      wrong.length ? h('div', { class: 'card' }, h('h3', {}, 'Diese Formen nochmal ansehen'),
        h('ul', { class: 'list' }, wrong.map((w) => h('li', {}, h('b', { class: 'latin' }, w.form), h('div', { class: 'small muted' }, correctList(w).join(' / ')))))) : null,
      wrong.length ? h('button', { class: 'btn secondary block', onclick: () => drillSession(main, shuffle(wrong), modus, verbs) }, 'Die falschen nochmal') : '',
      h('a', { class: 'btn block', href: '#/grammatik/formen' }, 'Fertig'));
    window.scrollTo(0, 0);
  }

  show();
}
