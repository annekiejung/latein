/*
 * Formenlehre-Ansichten (Teil des Grammatik-Bereichs):
 *   #/grammatik/tabellen                  Übersicht aller Tabellen
 *   #/grammatik/tabelle/verb/<id>         Konjugationstabelle (Tempus wählen, Ind./Konj. nebeneinander)
 *   #/grammatik/tabelle/<nomen|adj|pron>/<id>  Deklinationstabelle
 *   #/grammatik/formen                    Formen-Training: Verben, Nomen, Adjektive, Pronomen, Steigerung (bestimmen/bilden)
 * Daten: js/morph.js
 */
import { put, newId, getSetting, setSetting } from '../db.js';
import { h, todayStr } from '../ui.js';
import { logSeconds } from '../leitner.js';
import { checkForms } from '../check.js';
import {
  VERBEN, NOMEN, ADJEKTIVE, PRONOMEN, TEMPORA, PERSONEN, STEIGERUNG,
  allForms, describe, sameAnalysis, declForms, describeDecl
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

/**
 * Einstieg Formen-Training (Meilenstein 7a): Bereich + Richtung wählen.
 *   Verben bestimmen   → drillSession (Multiple Choice / selbst bestimmen, wie bisher)
 *   Deklination bestimmen → declSession (Kasus/Numerus/Genus antippen)
 *   alles bilden       → buildSession (Form eintippen, Längen egal)
 * Auswahl wird in settings "formenPrefs" gemerkt.
 */
export async function renderDrill(main) {
  const saved = (await getSetting('formenPrefs')) || {};
  const prefs = {
    bereich: 'verben', richtung: 'bestimmen', modus: 'mc', konj: true, anzahl: '20',
    ...saved,
    auswahl: {
      verben: new Set(saved.auswahl?.verben || VERBEN.map((v) => v.id)),
      nomen: new Set(saved.auswahl?.nomen || NOMEN.map((t) => t.id)),
      adj: new Set(saved.auswahl?.adj || ADJEKTIVE.map((t) => t.id)),
      pron: new Set(saved.auswahl?.pron || PRONOMEN.map((t) => t.id)),
      steig: new Set(saved.auswahl?.steig || ['komp', 'sup', 'adv'])
    }
  };
  const QUELLEN = {
    verben: VERBEN.map((v) => [v.id, v.name]),
    nomen: NOMEN.map((t) => [t.id, t.titel]),
    adj: ADJEKTIVE.map((t) => [t.id, t.titel]),
    pron: PRONOMEN.map((t) => [t.id, t.titel]),
    steig: [['komp', 'Komparativ'], ['sup', 'Superlativ'], ['adv', 'Adverb']]
  };
  const options = h('div');
  const startBtn = h('button', { class: 'btn block' }, 'Training starten');

  const seg = (key, opts, onChange) => h('div', { class: 'seg seg-wrap', role: 'radiogroup' },
    opts.map(([value, label]) => h('label', {},
      h('input', { type: 'radio', name: 'fd-' + key, value, checked: prefs[key] === value,
        onchange: () => { prefs[key] = value; if (onChange) onChange(); } }),
      h('span', {}, label))));

  function drawOptions() {
    const b = prefs.bereich;
    if (b === 'steig') prefs.richtung = 'bilden';
    const set = prefs.auswahl[b];
    const chips = h('div', { class: 'chips' }, QUELLEN[b].map(([id, label]) => h('label', { class: 'chip' },
      h('input', { type: 'checkbox', checked: set.has(id),
        onchange: (e) => { e.target.checked ? set.add(id) : set.delete(id); startBtn.disabled = !set.size; } }),
      h('span', { class: b === 'steig' ? '' : 'latin' }, label))));
    startBtn.disabled = !set.size;
    fill(options,
      b === 'steig'
        ? h('p', { class: 'muted small' }, 'Steigerung: Du bildest Komparativ, Superlativ oder Adverb.')
        : h('div', { class: 'field' }, h('span', {}, 'Richtung'),
            seg('richtung', [['bestimmen', 'Form bestimmen'], ['bilden', 'Form bilden']], drawOptions)),
      h('div', { class: 'field' }, h('span', {}, b === 'verben' ? 'Welche Verben?' : b === 'steig' ? 'Was?' : 'Welche Wörter?'), chips),
      b === 'verben' && prefs.richtung === 'bestimmen'
        ? h('div', { class: 'field' }, h('span', {}, 'Wie?'), seg('modus', [['mc', 'Multiple Choice'], ['selbst', 'Selbst bestimmen']])) : null,
      b === 'verben' ? h('label', { class: 'check-row' },
        h('input', { type: 'checkbox', checked: prefs.konj, onchange: (e) => { prefs.konj = e.target.checked; } }),
        h('span', {}, 'Konjunktivformen mit abfragen')) : null);
  }

  startBtn.onclick = async () => {
    await setSetting('formenPrefs', {
      ...prefs, auswahl: Object.fromEntries(Object.entries(prefs.auswahl).map(([k, s]) => [k, [...s]]))
    });
    const n = parseInt(prefs.anzahl, 10);
    const b = prefs.bereich;
    const set = prefs.auswahl[b];
    if (b === 'verben') {
      const verbs = VERBEN.filter((v) => set.has(v.id));
      let pool = verbs.flatMap((v) => allForms(v).map((a) => ({ ...a, v })))
        .filter((a) => !a.form.includes('('));               // „futūrum esse (fore)“ nicht abfragen
      if (!prefs.konj) pool = pool.filter((a) => a.modus !== 'Konjunktiv');
      if (prefs.richtung === 'bilden') {
        const items = unique(shuffle(pool), (a) => describe(a, !!a.v.passiv) + a.verb).slice(0, n).map((a) => ({
          frage: `${describe(a, !!a.v.passiv)} von ${a.v.grundformen}`, loesungen: [a.form],
          thema: 'Konjugation', phaenomen: a.verb
        }));
        return buildSession(main, items);
      }
      if (prefs.modus === 'selbst') pool = pool.filter((a) => a.modus === 'Indikativ' || a.modus === 'Konjunktiv');
      return drillSession(main, unique(shuffle(pool), (a) => a.form).slice(0, n), prefs.modus, verbs);
    }
    if (b === 'steig') {
      const LABEL = { komp: 'Komparativ (m, Nom. Sg.) von', sup: 'Superlativ (m, Nom. Sg.) von', adv: 'Adverb zu' };
      const items = STEIGERUNG.flatMap((s) => [...set].map((k) => ({
        frage: `${LABEL[k]} ${s.pos}`, loesungen: s[k].split(' / '), thema: 'Steigerung', phaenomen: s.pos.split(',')[0],
        erklaerung: s.regel || null
      })));
      return buildSession(main, shuffle(items).slice(0, n));
    }
    const tables = GRUPPEN[b].filter((t) => set.has(t.id));
    const thema = { nomen: 'Deklination', adj: 'Adjektive', pron: 'Pronomen' }[b];
    const forms = tables.flatMap((t) => declForms(t).map((a) => ({ ...a, tabelle: t.id })));
    if (prefs.richtung === 'bilden') {
      const items = shuffle(forms).slice(0, n).map((a) => ({
        frage: `${describeDecl(a)} von ${wortTitel(a)}`,
        loesungen: a.alts, thema, phaenomen: a.wort
      }));
      return buildSession(main, items);
    }
    const items = unique(shuffle(forms), (a) => a.tabelle + '|' + a.form).slice(0, n)
      .map((a) => ({ ...a, analysen: forms.filter((x) => x.tabelle === a.tabelle && x.alts.includes(a.form)), thema }));
    return declSession(main, items);
  };

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik', class: 'back' }, '‹ Grammatik'),
    h('h2', {}, 'Formen-Training'),
    h('div', { class: 'field' }, h('span', {}, 'Bereich'),
      seg('bereich', [['verben', 'Verben'], ['nomen', 'Nomen'], ['adj', 'Adjektive'], ['pron', 'Pronomen'], ['steig', 'Steigerung']], drawOptions)),
    options,
    h('div', { class: 'field' }, h('span', {}, 'Wie viele?'), seg('anzahl', [['10', '10'], ['20', '20'], ['40', '40']])),
    startBtn,
    h('p', { style: 'margin-top:10px' }, h('a', { href: '#/grammatik/tabellen' }, 'Zu den Tabellen'))));
  drawOptions();
}

/** Lexikonform des Wortes einer Form (bei Tabellen mit zwei Wörtern nur das passende). */
const wortTitel = (a) => a.titel.split(' · ').find((s) => s.startsWith(a.wort)) || a.titel;

/** Jede Sache nur einmal pro Runde. */
function unique(arr, key) {
  const seen = new Set();
  return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Gemeinsamer Abschluss für Deklinations- und Bilden-Runden. */
async function finishRound(main, started, right, wrong, again, wrongLine) {
  window.quizActive = false;
  const done = right + wrong.length;
  await logSeconds(Math.min((Date.now() - started) / 1000, done * 60));
  if (done) await put('history', { id: newId('h'), typ: 'formen', richtig: right, gesamt: done, zeit: new Date().toISOString() });
  fill(main,
    h('div', { class: 'card' },
      h('h2', {}, 'Training beendet'),
      done ? h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', {}, right), h('span', {}, 'richtig')),
        h('div', { class: 'stat' }, h('b', {}, wrong.length), h('span', {}, 'falsch')),
        h('div', { class: 'stat' }, h('b', {}, Math.round((right / done) * 100) + ' %'), h('span', {}, 'Quote'))) : h('p', {}, 'Nichts bearbeitet.')),
    wrong.length ? h('div', { class: 'card' }, h('h3', {}, 'Diese nochmal ansehen'),
      h('ul', { class: 'list' }, wrong.map(wrongLine))) : null,
    wrong.length ? h('button', { class: 'btn secondary block', onclick: () => again(shuffle(wrong)) }, 'Die falschen nochmal') : '',
    h('a', { class: 'btn block', href: '#/grammatik/formen' }, 'Fertig'));
  window.scrollTo(0, 0);
}

const topBar = (main, pos, total, onEnd) => [
  h('div', { class: 'quiz-top' },
    h('span', { class: 'muted' }, `${pos + 1} / ${total}`),
    h('button', { class: 'btn secondary btn-small', onclick: onEnd }, 'Beenden')),
  h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((pos / total) * 100)}%` }))];

/* ----- Deklination bestimmen: Kasus, Numerus, Genus antippen ----- */
function declSession(main, items) {
  window.quizActive = true;
  const started = Date.now();
  let pos = 0, right = 0;
  const wrong = [];
  const solutions = (it) => unique(it.analysen.map(describeDecl), (x) => x);

  function show() {
    if (pos >= items.length) return finishRound(main, started, right, wrong, (w) => declSession(main, w),
      (w) => h('li', {}, h('b', { class: 'latin' }, w.form), ` (${wortTitel(w)})`, h('div', { class: 'small muted' }, solutions(w).join(' / '))));
    const it = items[pos];
    const choice = {};
    const needNum = it.analysen.some((a) => a.numerus);
    const needGen = it.analysen.some((a) => a.genus);
    const row = (key, label, opts) => h('div', { class: 'field' }, h('span', {}, label),
      h('div', { class: 'seg seg-wrap', role: 'radiogroup' }, opts.map((o) => h('label', {},
        h('input', { type: 'radio', name: `dc-${key}-${pos}`, value: o, onchange: () => { choice[key] = o; } }),
        h('span', {}, o)))));
    const area = h('div');
    const body = h('div', { class: 'card' },
      h('div', { class: 'quiz-card' }, h('div', { class: 'quiz-latin latin' }, it.form),
        h('div', { class: 'muted' }, 'Bestimme die Form von ', h('span', { class: 'latin' }, wortTitel(it)), '.')),
      row('kasus', 'Kasus', ['Nom.', 'Gen.', 'Dat.', 'Akk.', 'Abl.']),
      needNum ? row('numerus', 'Numerus', ['Sg.', 'Pl.']) : null,
      needGen ? row('genus', 'Genus', ['m', 'f', 'n']) : null,
      area);
    main.replaceChildren(...topBar(main, pos, items.length, () => { pos = items.length; show(); }), body);
    area.append(h('button', {
      class: 'btn block',
      onclick: async (e) => {
        const need = ['kasus', ...(needNum ? ['numerus'] : []), ...(needGen ? ['genus'] : [])];
        if (need.some((k) => !choice[k])) { e.currentTarget.textContent = 'Bitte alles auswählen'; return; }
        const ok = it.analysen.some((a) => a.kasus === choice.kasus
          && (!a.numerus || a.numerus === choice.numerus) && (!a.genus || a.genus.includes(choice.genus)));
        body.querySelectorAll('input').forEach((i) => { i.disabled = true; });
        const gegeben = [choice.kasus, choice.numerus, choice.genus].filter(Boolean).join(' ');
        if (ok) right++;
        else {
          wrong.push(it);
          await put('journal', {
            id: newId('j'), typ: 'formen', modus: 'bestimmen', thema: it.thema, phaenomen: it.wort,
            frage: `${it.form} (${wortTitel(it)})`, erwartet: solutions(it).join(' / '), gegeben, bewertung: 0,
            datum: todayStr(), zeit: new Date().toISOString()
          });
        }
        fill(area,
          h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad') }, ok ? 'Richtig' : 'Falsch'),
          h('div', { class: 'quiz-solution' },
            h('div', { class: 'muted small' }, solutions(it).length > 1 ? 'Mehrdeutig – alle richtigen Bestimmungen:' : 'Lösung:'),
            h('ul', { class: 'parts' }, solutions(it).map((s) => h('li', {}, s)))),
          h('button', { class: 'btn block', onclick: () => { pos++; show(); } }, 'Weiter'));
      }
    }, 'Prüfen'));
    window.scrollTo(0, 0);
  }
  show();
}

/* ----- Formen bilden: eintippen, Längen egal, Tippfehler entscheidet die Nutzerin ----- */
function buildSession(main, items) {
  window.quizActive = true;
  const started = Date.now();
  let pos = 0, right = 0;
  const wrong = [];

  async function verbuchen(it, ok, gegeben) {
    if (ok) { right++; return; }
    wrong.push(it);
    await put('journal', {
      id: newId('j'), typ: 'formen', modus: 'bilden', thema: it.thema, phaenomen: it.phaenomen,
      frage: 'Bilde: ' + it.frage, erwartet: it.loesungen.join(' / '), gegeben, erklaerung: it.erklaerung || undefined,
      bewertung: 0, datum: todayStr(), zeit: new Date().toISOString()
    });
  }

  function show() {
    if (pos >= items.length) return finishRound(main, started, right, wrong, (w) => buildSession(main, w),
      (w) => h('li', {}, w.frage, h('div', { class: 'latin' }, w.loesungen.join(' / '))));
    const it = items[pos];
    const input = h('input', { type: 'text', class: 'latin', placeholder: 'Form eintippen', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false' });
    const area = h('div');
    const solution = () => h('div', { class: 'quiz-solution' },
      h('div', { class: 'big latin' }, it.loesungen.join(' / ')),
      it.erklaerung ? h('div', { class: 'muted small' }, it.erklaerung) : null);
    const next = () => h('button', { class: 'btn block', onclick: () => { pos++; show(); } }, 'Weiter');
    const check = async () => {
      if (!input.value.trim()) return;
      input.disabled = true;
      const res = it.loesungen.map((l) => checkForms({ latein: '' }, l, input.value).result);
      if (res.includes('richtig')) { await verbuchen(it, true); fill(area, h('div', { class: 'verdict ok' }, 'Richtig'), solution(), next()); return; }
      if (res.includes('typo')) {
        fill(area, h('div', { class: 'verdict warn' }, 'Fast – Tippfehler?'), solution(),
          h('p', { class: 'muted small' }, 'Bei Formen kann schon ein Buchstabe den Kasus oder die Person ändern. Ehrlich entscheiden:'),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn danger', onclick: async () => { await verbuchen(it, false, input.value); pos++; show(); } }, 'Als falsch werten'),
            h('button', { class: 'btn', onclick: async () => { await verbuchen(it, true); pos++; show(); } }, 'Als richtig werten')));
        return;
      }
      await verbuchen(it, false, input.value);
      fill(area, h('div', { class: 'verdict bad' }, 'Falsch'), h('p', { class: 'small' }, 'Deine Antwort: ', h('span', { class: 'latin' }, input.value)), solution(), next());
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    main.replaceChildren(...topBar(main, pos, items.length, () => { pos = items.length; show(); }),
      h('div', { class: 'card' },
        h('p', { class: 'muted' }, 'Bilde:'),
        h('p', { class: 'big' }, it.frage),
        input, area));
    area.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn secondary', onclick: async () => { input.disabled = true; await verbuchen(it, false, '(weiß ich nicht)'); fill(area, h('div', { class: 'verdict bad' }, 'Nicht gewusst'), solution(), next()); } }, 'Weiß ich nicht'),
      h('button', { class: 'btn', onclick: check }, 'Prüfen')));
    input.focus();
    window.scrollTo(0, 0);
  }
  show();
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
        id: newId('j'), typ: 'formen', modus: 'bestimmen', thema: 'Konjugation', phaenomen: item.verb,
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
