/*
 * Mini-Klassenarbeit (Meilenstein 7b, Grammatik-Teil seit 0.13.0): 20 Minuten, vier Teile auf einer Seite.
 *   Teil 1: 8 Vokabeln (Bedeutung eintippen) – bevorzugt Wackelkandidaten          8 Punkte
 *   Teil 2: 6 Formen bilden (gemischt, aus js/views/grammatik-formen.js)             6 Punkte
 *   Teil 3: 4 Grammatik-Aufgaben (Auswahl, Lückentext, Bestimmen) je 1,5              6 Punkte
 *   Teil 4: Übersetzung eines geprüften Originalsatzes (Selbstbewertung je Teilsatz) 10 Punkte
 * Grammatik und Übersetzung kommen bevorzugt aus den AKTUELLEN Themen (aktuelleEinheiten), erste Stufe
 *   mit Treffern: nächste Klassenarbeit im Planer → aus dem Buch importiert → in den letzten 14 Tagen
 *   geübt bzw. mit Fehlern. Nichts gefunden → alle Einheiten gemischt. Übersetzungssatz ≠ Grammatik-Aufgabe.
 * Tippfehler zählen halb (keine Rückfragen mitten in der Arbeit).
 * Ergebnis: history { typ: 'mini', punkte, max, prozent, note, teile: { vok, formen, gram, ueb }, sekunden, zeit }
 * Fehler: journal wie in den einzelnen Bereichen (vokabel/grundwortschatz, formen, grammatik), quelle 'mini'.
 *   #/mini   Einstellungen → Arbeit → Selbstbewertung → Auswertung
 */
import { getAll, put, newId } from '../db.js';
import { h, todayStr } from '../ui.js';
import { headline } from '../vocab.js';
import { checkMeaning, checkForms } from '../check.js';
import { stateOf, logSeconds } from '../leitner.js';
import { loadCards, unlockedPackets } from '../gws.js';
import { loadUnits } from '../grammar.js';
import { loadExams, addDays } from '../planer.js';
import { mixedBildenItems } from './grammatik-formen.js';
import { clock } from '../exam.js';

export const title = 'Mini-Klassenarbeit';

const DAUER = 20 * 60;
const ANZ_VOK = 8;
const PUNKTE_GRAM = 1.5;      // je Grammatik-Aufgabe
const ANZ_GRAM = 4;
const PUNKTE_UEB = 10;
const fill = (el, ...parts) => el.replaceChildren(...parts.filter(Boolean));
/** Klassenarbeitstexte stehen ohne Längenzeichen. */
const ohneLaengen = (s) => s.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');
const comma = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const RATE = ['✗', '~', '✓'];

/** Noten-Einschätzung aus Prozent (übliche Schwellen; nur Orientierung). */
export function noteAusProzent(p) {
  return p >= 92 ? 1 : p >= 81 ? 2 : p >= 67 ? 3 : p >= 50 ? 4 : p >= 30 ? 5 : 6;
}

/**
 * Aktuelle Grammatik-Themen – die ERSTE Stufe, die etwas liefert:
 * 1. Grammatik der nächsten anstehenden Klassenarbeit (Planer)
 * 2. aus dem Buch importierte Einheiten
 * 3. in den letzten 14 Tagen geübte Einheiten oder Einheiten mit Fehlern
 * @returns {{ ids: string[], quelle: string }}  quelle = Text für die Anzeige ('' = nichts gefunden)
 */
export async function aktuelleEinheiten(units) {
  const today = todayStr();
  const known = new Set(units.map((u) => u.id));
  const clean = (ids) => [...new Set(ids)].filter((id) => known.has(id));
  const next = (await loadExams()).find((x) => x.datum >= today && clean(x.grammatik).length);
  if (next) return { ids: clean(next.grammatik), quelle: `aus deiner nächsten Klassenarbeit (${next.titel || 'Klassenarbeit'})` };
  const imported = clean(units.filter((u) => !u.eingebaut).map((u) => u.id));
  if (imported.length) return { ids: imported, quelle: 'aus deinem Buch importiert' };
  const since = addDays(today, -14);
  const recent = [
    ...(await getAll('history')).filter((r) => r.typ === 'grammatik').map((r) => ({ id: r.einheit, zeit: r.zeit })),
    ...(await getAll('journal')).filter((j) => j.typ === 'grammatik' && j.einheit).map((j) => ({ id: j.einheit, zeit: j.zeit }))
  ].filter((r) => r.zeit && todayStr(new Date(r.zeit)) >= since).sort((a, b) => b.zeit.localeCompare(a.zeit));
  const ids = clean(recent.map((r) => r.id));
  return { ids, quelle: ids.length ? 'in den letzten 14 Tagen geübt' : '' };
}

export async function render(main) {
  const vocab = await getAll('vocab');
  const lessons = [...new Set(vocab.map((c) => c.lektion))].sort((a, b) => a.localeCompare(b, 'de'));
  const units = await loadUnits();
  const { ids: aktuell, quelle: aktuellQuelle } = await aktuelleEinheiten(units);
  const name = (id) => (units.find((u) => u.id === id) || {}).thema || id;
  const quelle = h('select', {},
    vocab.length ? h('option', { value: '*' }, 'alle Unterrichtsvokabeln') : null,
    lessons.map((l) => h('option', { value: 'L:' + l }, 'Lektion ' + l)),
    h('option', { value: 'gws' }, 'Grundwortschatz (freigeschaltet)'));
  const thema = h('select', {},
    h('option', { value: 'aktuell' }, 'aktuelle Themen (automatisch)'),
    h('option', { value: '' }, 'alle Themen gemischt'),
    units.map((u) => h('option', { value: u.id }, u.thema)));

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/pruefung', class: 'back' }, '‹ Prüfungsmodus'),
    h('h2', {}, 'Mini-Klassenarbeit'),
    h('p', {}, '20 Minuten, vier Teile: 8 Vokabeln, 6 Formen bilden, 4 Grammatik-Aufgaben, ein Originalsatz zum Übersetzen. Insgesamt 30 Punkte.'),
    h('label', { class: 'field' }, h('span', {}, 'Vokabeln aus'), quelle),
    h('label', { class: 'field' }, h('span', {}, 'Grammatik und Übersetzung'), thema),
    h('p', { class: 'small' }, aktuell.length
      ? ['Aktuelle Themen ', aktuellQuelle, ': ', h('b', {}, aktuell.slice(0, 5).map(name).join(', ')), aktuell.length > 5 ? ' …' : '']
      : 'Keine aktuellen Themen gefunden (keine Klassenarbeit im Planer, nichts importiert, in den letzten 14 Tagen keine Grammatik geübt) – dann wird gemischt.'),
    h('p', { class: 'muted small' }, 'Bei den Vokabeln kommen bevorzugt Wörter dran, die noch wackeln (niedriges Fach). Die Uhr läuft ab dem Start; ein Neuladen der App bricht die Arbeit ab.'),
    h('button', {
      class: 'btn block',
      onclick: () => {
        const sel = thema.value;
        const pool = sel === 'aktuell'
          ? (aktuell.length ? units.filter((u) => aktuell.includes(u.id)) : units)
          : sel ? units.filter((u) => u.id === sel) : units;
        start(main, quelle.value, pool, units);
      }
    }, 'Starten')));
}

/** Vokabeln: Wackelkandidaten zuerst (abgefragt und Fach ≤ 2), dann der Rest zufällig. */
async function pickVocab(sel) {
  let cards;
  if (sel === 'gws') {
    const up = await unlockedPackets();
    cards = (await loadCards()).filter((c) => c.paket <= up && !c.imUnterricht);
  } else {
    const all = await getAll('vocab');
    cards = sel === '*' ? all : all.filter((c) => 'L:' + c.lektion === sel);
  }
  const weak = shuffle(cards.filter((c) => { const s = stateOf(c, 'bedeutung'); return s.zuletzt && s.fach <= 2; }));
  const started = shuffle(cards.filter((c) => !weak.includes(c) && stateOf(c, 'bedeutung').zuletzt));
  const rest = shuffle(cards.filter((c) => !weak.includes(c) && !started.includes(c)));
  return [...weak, ...started, ...rest].slice(0, ANZ_VOK);
}

/** Grammatik-Aufgaben: reihum aus den Einheiten (Abwechslung), Lückentexte höchstens 3 Lücken. */
function pickGrammar(pool) {
  const per = shuffle(pool).map((u) => shuffle(u.aufgaben
    .filter((a) => a.typ === 'auswahl' || a.typ === 'bestimmen' || (a.typ === 'luecke' && a.loesung.length <= 3))
    .map((a) => ({ ...a, einheit: u.id, thema: u.thema }))));
  const out = [];
  for (let round = 0; out.length < ANZ_GRAM && per.some((l) => l.length); round++) {
    for (const list of per) if (list.length && out.length < ANZ_GRAM) out.push(list.shift());
  }
  return out;
}

/** Übersetzung: geprüfte Originalsätze bevorzugt; bei kurzen Sätzen zwei. Notfalls aus allen Einheiten. */
function pickTranslation(pool, allUnits, gram = []) {
  // Sätze, die schon als Grammatik-Aufgabe vorkommen, nicht noch einmal übersetzen lassen
  const norm = (x) => ohneLaengen(String(x || '')).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const used = gram.map((a) => norm(a.typ === 'luecke' ? a.text : a.frage)).join(' | ');
  const fresh = (a) => !used.includes(norm(a.teile.map((t) => t.latein).join(' ')).split(' ').slice(0, 4).join(' '));
  const from = (units) => units.flatMap((u) => u.aufgaben.filter((a) => a.typ === 'uebersetzung').map((a) => ({ ...a, einheit: u.id, thema: u.thema })));
  let cands = from(pool).filter(fresh);
  if (!cands.length) cands = from(allUnits).filter(fresh);
  const checked = cands.filter((a) => a.quelle && a.quelle.status === 'geprüft');
  const list = shuffle(checked.length ? checked : cands);
  const words = (a) => a.teile.map((t) => t.latein).join(' ').split(/\s+/).length;
  const first = list[0];
  if (!first) return [];
  const second = words(first) < 18 ? list.find((a) => a !== first && words(a) < 22) : null;
  return second ? [first, second] : [first];
}

async function start(main, vocabSel, pool, allUnits) {
  const vok = await pickVocab(vocabSel);
  const formen = mixedBildenItems();
  const gram = pickGrammar(pool);
  const ueb = pickTranslation(pool, allUnits, gram);
  const startedAt = Date.now();
  window.quizActive = true;

  const timer = h('span', { class: 'timer' });
  const tick = () => {
    if (!timer.isConnected) { clearInterval(iv); window.quizActive = false; return; }
    const rest = DAUER - (Date.now() - startedAt) / 1000;
    timer.textContent = rest >= 0 ? clock(rest) : '+' + clock(-rest);
    timer.classList.toggle('timer-warn', rest < 180 && rest >= 0);
    timer.classList.toggle('timer-over', rest < 0);
  };
  const iv = setInterval(tick, 1000);

  const inp = (cls) => h('input', { type: 'text', class: cls || '', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false' });
  const vokInputs = vok.map(() => inp());
  const formInputs = formen.map(() => inp('latin'));
  const uebInputs = ueb.map(() => h('textarea', { rows: 4, placeholder: 'Deine Übersetzung …', autocapitalize: 'sentences' }));

  // Grammatik: je Aufgabe ein Eingabe-Objekt mit value()
  const gramUi = gram.map((a, i) => {
    if (a.typ === 'auswahl') {
      const radios = a.optionen.map((o, k) => h('label', { class: 'check-row' },
        h('input', { type: 'radio', name: `mg-${i}`, value: k }), h('span', {}, o)));
      return { el: h('div', {}, h('div', {}, a.frage), radios), value: () => {
        const r = radios.map((l) => l.querySelector('input')).find((x) => x.checked);
        return r ? Number(r.value) : null;
      } };
    }
    if (a.typ === 'luecke') {
      const parts = a.text.split(/_{3,}/);
      const gaps = a.loesung.map(() => h('input', { type: 'text', class: 'gap latin', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false' }));
      const p = h('p', { class: 'latin gap-text' });
      parts.forEach((t, k) => { p.append(t); if (gaps[k]) p.append(gaps[k]); });
      return { el: h('div', {}, a.hinweis ? h('div', { class: 'muted small' }, a.hinweis) : null, p), value: () => gaps.map((g) => g.value.trim()) };
    }
    const input = inp();
    return { el: h('div', {}, h('div', {}, a.frage), input), value: () => input.value.trim() };
  });

  const teil1 = h('div', { class: 'card' },
    h('h3', {}, `Teil 1: Vokabeln (${ANZ_VOK} Punkte)`),
    vok.length ? h('ol', { class: 'mini-list' }, vok.map((c, i) => h('li', {},
      h('div', { class: 'latin' }, headline(c)), vokInputs[i])))
      : h('p', { class: 'muted' }, 'Keine Vokabeln in dieser Auswahl.'));
  const teil2 = h('div', { class: 'card' },
    h('h3', {}, 'Teil 2: Formen bilden (6 Punkte)'),
    h('ol', { class: 'mini-list' }, formen.map((f, i) => h('li', {}, h('div', {}, f.frage), formInputs[i]))));
  const teil3 = h('div', { class: 'card' },
    h('h3', {}, `Teil 3: Grammatik (${comma(gram.length * PUNKTE_GRAM)} Punkte)`),
    gram.length ? h('ol', { class: 'mini-list' }, gram.map((a, i) => h('li', {},
      h('div', { class: 'muted small' }, a.thema), gramUi[i].el)))
      : h('p', { class: 'muted' }, 'Keine passenden Grammatik-Aufgaben gefunden.'));
  const teil4 = h('div', { class: 'card' },
    h('h3', {}, `Teil 4: Übersetzung (${PUNKTE_UEB} Punkte)`),
    ueb.length ? ueb.map((a, i) => h('div', { class: 'mini-ueb' },
      h('p', { class: 'latin exam-text' }, ohneLaengen(a.teile.map((t) => t.latein).join(' '))),
      h('p', { class: 'muted small' }, `${a.quelle.autor}, ${a.quelle.werk} ${a.quelle.stelle}`),
      a.vokabelhilfen && a.vokabelhilfen.length ? h('ul', { class: 'vocab-help' },
        a.vokabelhilfen.map((v) => h('li', {}, h('span', { class: 'latin' }, v.latein), ' – ', v.deutsch))) : null,
      uebInputs[i]))
      : h('p', { class: 'muted' }, 'Kein Übersetzungssatz gefunden.'));

  main.replaceChildren(
    h('div', { class: 'quiz-top exam-top' },
      h('span', {}, 'Restzeit ', timer),
      h('button', { class: 'btn btn-small', onclick: abgeben }, 'Abgeben')),
    teil1, teil2, teil3, teil4,
    h('button', { class: 'btn block', onclick: abgeben }, 'Abgeben'));
  tick();
  window.scrollTo(0, 0);

  async function abgeben() {
    clearInterval(iv);
    const sekunden = Math.round((Date.now() - startedAt) / 1000);
    const datum = todayStr();
    const zeit = new Date().toISOString();
    const j = (rec) => put('journal', { id: newId('j'), quelle: 'mini', datum, zeit, ...rec });

    // Teil 1 + 2 automatisch: richtig 1, Tippfehler ½, falsch 0
    const wert = (r) => (r === 'richtig' ? 1 : r === 'typo' ? 0.5 : 0);
    const formCheck = (loesungen, given) => {
      if (!given) return 'leer';
      const rs = loesungen.map((l) => checkForms({ latein: '' }, l, given).result);
      return rs.includes('richtig') ? 'richtig' : rs.includes('typo') ? 'typo' : 'falsch';
    };
    const vokRes = vok.map((c, i) => {
      const given = vokInputs[i].value.trim();
      const r = given ? checkMeaning(c, given).result : 'leer';
      return { c, given, r, p: wert(r) };
    });
    const formRes = formen.map((f, i) => {
      const given = formInputs[i].value.trim();
      const r = formCheck(f.loesungen, given);
      return { f, given, r, p: wert(r) };
    });
    // Teil 3: Auswahl und Lückentext automatisch, Bestimmen später selbst bewerten
    const gramRes = gram.map((a, i) => {
      const v = gramUi[i].value();
      if (a.typ === 'auswahl') {
        return { a, given: v === null ? '' : a.optionen[v], loesung: a.optionen[a.richtig], p: v === a.richtig ? PUNKTE_GRAM : 0 };
      }
      if (a.typ === 'luecke') {
        const rs = a.loesung.map((l, k) => formCheck([l], v[k]));
        const anteil = rs.reduce((s, r) => s + wert(r), 0) / rs.length;
        return { a, given: v.map((x) => x || '…').join(' · '), loesung: a.loesung.join(' · '), p: anteil * PUNKTE_GRAM, typo: rs.includes('typo') };
      }
      return { a, given: v, loesung: a.antwort, p: null };       // bestimmen: Selbstbewertung
    });

    for (const x of vokRes) if (x.p < 1) {
      await j({ typ: x.c.nr ? 'grundwortschatz' : 'vokabel', modus: 'bedeutung', karteId: x.c.id, lektion: x.c.lektion,
        frage: headline(x.c), erwartet: x.c.bedeutungen.join(', '), gegeben: x.given || '(leer)' });
    }
    for (const x of formRes) if (x.p < 1) {
      await j({ typ: 'formen', modus: 'bilden', thema: x.f.thema, phaenomen: x.f.phaenomen,
        frage: 'Bilde: ' + x.f.frage, erwartet: x.f.loesungen.join(' / '), gegeben: x.given || '(leer)', bewertung: x.p });
    }
    for (const x of gramRes) if (x.p !== null && x.p < PUNKTE_GRAM) {
      await j({ typ: 'grammatik', thema: x.a.thema, einheit: x.a.einheit, phaenomen: x.a.thema,
        frage: x.a.typ === 'luecke' ? x.a.text : x.a.frage, erwartet: x.loesung, erklaerung: x.a.erklaerung,
        gegeben: x.given || '(leer)', bewertung: x.p / PUNKTE_GRAM });
    }
    selfRate({ vokRes, formRes, gramRes, sekunden, j });
  }

  /** Selbst bewerten: Bestimmen-Aufgaben und die Übersetzung Teilsatz für Teilsatz. */
  function selfRate(ctx) {
    const bestimmen = ctx.gramRes.filter((x) => x.p === null);
    const teile = ueb.flatMap((a, ai) => a.teile.map((t) => ({ ...t, a, ai })));
    const ratings = { b: new Array(bestimmen.length).fill(null), t: new Array(teile.length).fill(null) };
    const done = h('button', { class: 'btn block', disabled: bestimmen.length + teile.length > 0 }, 'Ergebnis anzeigen');
    const rater = (arr, i) => {
      const box = h('div', { class: 'part-rate' }, RATE.map((sym, k) => h('button', {
        class: 'rate', 'aria-label': ['falsch', 'teilweise', 'richtig'][k],
        onclick: (e) => {
          arr[i] = [0, 0.5, 1][k];
          box.querySelectorAll('.rate').forEach((b) => b.classList.remove('sel'));
          e.currentTarget.classList.add('sel');
          done.disabled = [...ratings.b, ...ratings.t].some((x) => x === null);
        }
      }, sym)));
      return box;
    };
    done.onclick = async () => {
      bestimmen.forEach((x, i) => { x.p = ratings.b[i] * PUNKTE_GRAM; });
      for (const x of bestimmen) if (x.p < PUNKTE_GRAM) {
        await ctx.j({ typ: 'grammatik', thema: x.a.thema, einheit: x.a.einheit, phaenomen: x.a.thema,
          frage: x.a.frage, erwartet: x.a.antwort, erklaerung: x.a.erklaerung, gegeben: x.given || '(leer)', bewertung: x.p / PUNKTE_GRAM });
      }
      for (let i = 0; i < teile.length; i++) if (ratings.t[i] < 1) {
        const t = teile[i];
        await ctx.j({ typ: 'grammatik', thema: t.a.thema, einheit: t.a.einheit, phaenomen: t.a.konstruktion || t.a.thema,
          frage: t.latein, erwartet: t.deutsch, gegeben: uebInputs[t.ai].value, bewertung: ratings.t[i] });
      }
      const uebP = teile.length ? (ratings.t.reduce((s, x) => s + x, 0) / teile.length) * PUNKTE_UEB : 0;
      result({ ...ctx, uebP });
    };
    main.replaceChildren(
      h('div', { class: 'card' },
        h('h2', {}, 'Selbst bewerten'),
        h('p', { class: 'muted small' }, 'Ehrlich vergleichen: ✓ richtig · ~ teilweise · ✗ falsch. Andere Formulierungen sind okay, wenn Sinn und Grammatik stimmen.'),
        bestimmen.length ? h('h3', {}, 'Grammatik: Bestimmen') : null,
        ...bestimmen.map((x, i) => h('div', { class: 'part' },
          h('div', {}, x.a.frage),
          h('div', { class: 'small' }, 'Du: ', x.given || '(leer)'),
          h('div', { class: 'small' }, 'Lösung: ', h('b', {}, x.a.antwort)),
          x.a.erklaerung ? h('div', { class: 'muted small' }, x.a.erklaerung) : null,
          rater(ratings.b, i))),
        teile.length ? h('h3', { style: 'margin-top:14px' }, 'Übersetzung') : null,
        ...ueb.map((a, i) => h('p', { class: 'small' }, h('b', {}, 'Deine Übersetzung: '), uebInputs[i].value.trim() || '(leer)')),
        ...teile.map((t, i) => h('div', { class: 'part' },
          h('div', { class: 'latin' }, t.latein), h('div', {}, t.deutsch), rater(ratings.t, i))),
        ueb.some((a) => a.konstruktion) ? h('p', { class: 'small' }, h('b', {}, 'Konstruktion: '), ueb.map((a) => a.konstruktion).filter(Boolean).join(' · ')) : null,
        done));
    if (!bestimmen.length && !teile.length) done.click();
    window.scrollTo(0, 0);
  }

  async function result({ vokRes, formRes, gramRes, uebP, sekunden }) {
    window.quizActive = false;
    const vokP = vokRes.reduce((s, x) => s + x.p, 0);
    const formP = formRes.reduce((s, x) => s + x.p, 0);
    const gramP = gramRes.reduce((s, x) => s + x.p, 0);
    const maxVok = vok.length;
    const maxGram = gram.length * PUNKTE_GRAM;
    const max = maxVok + 6 + maxGram + (ueb.length ? PUNKTE_UEB : 0);
    const punkte = vokP + formP + gramP + uebP;
    const prozent = Math.round((punkte / max) * 100);
    const note = noteAusProzent(prozent);
    const r1 = (n) => Math.round(n * 10) / 10;
    await put('history', {
      id: newId('h'), typ: 'mini', punkte: r1(punkte), max, prozent, note,
      teile: { vok: vokP, formen: formP, gram: r1(gramP), ueb: r1(uebP) }, sekunden, zeit: new Date().toISOString()
    });
    await logSeconds(Math.min(sekunden, DAUER * 2));
    const zeile = (label, x, sol, full = 1) => h('li', { class: x.p >= full ? 'part-ok' : x.p ? 'part-typo' : 'part-falsch' },
      label, ': ', x.given || '(leer)', x.p < full ? h('span', { class: 'muted' }, ' → ', sol) : null,
      x.r === 'typo' || x.typo ? h('span', { class: 'muted small' }, ' (Tippfehler halb gewertet)') : null);
    fill(main,
      h('div', { class: 'card' },
        h('h2', {}, 'Ergebnis'),
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', {}, `${comma(punkte)} / ${comma(max)}`), h('span', {}, 'Punkte')),
          h('div', { class: 'stat' }, h('b', {}, prozent + ' %'), h('span', {}, 'erreicht')),
          h('div', { class: 'stat' }, h('b', {}, note), h('span', {}, 'Note (Einschätzung)'))),
        h('p', { class: 'muted small', style: 'margin-top:8px' },
          `Vokabeln ${comma(vokP)}/${maxVok} · Formen ${comma(formP)}/6 · Grammatik ${comma(gramP)}/${comma(maxGram)} · Übersetzung ${comma(uebP)}/${ueb.length ? PUNKTE_UEB : 0} · Zeit ${clock(sekunden)}${sekunden > DAUER ? ' (überzogen)' : ''}`),
        h('p', { class: 'muted small' }, 'Die Note ist nur eine grobe Einschätzung (92 / 81 / 67 / 50 / 30 % für Note 1–5). Alle Fehler stehen im Fehlerjournal.')),
      vok.length ? h('div', { class: 'card' }, h('h3', {}, 'Vokabeln'),
        h('ul', { class: 'parts' }, vokRes.map((x) => zeile(headline(x.c), x, x.c.bedeutungen.join(', '))))) : null,
      h('div', { class: 'card' }, h('h3', {}, 'Formen'),
        h('ul', { class: 'parts' }, formRes.map((x) => zeile(x.f.frage, x, x.f.loesungen.join(' / '))))),
      gram.length ? h('div', { class: 'card' }, h('h3', {}, 'Grammatik'),
        h('ul', { class: 'parts' }, gramRes.map((x) => zeile(`${x.a.thema}: ${x.a.typ === 'luecke' ? x.a.text : x.a.frage}`, x, x.loesung, PUNKTE_GRAM))),
        gramRes.filter((x) => x.p < PUNKTE_GRAM && x.a.einheit).length
          ? h('p', { class: 'small' }, 'Üben: ', [...new Set(gramRes.filter((x) => x.p < PUNKTE_GRAM).map((x) => x.a.einheit))]
              .flatMap((id, k) => [k ? ' · ' : '', h('a', { href: '#/grammatik/einheit/' + encodeURIComponent(id) }, gram.find((a) => a.einheit === id).thema)]))
          : null) : null,
      h('a', { class: 'btn secondary block', href: '#/fehler' }, 'Zum Fehlerjournal'),
      h('a', { class: 'btn block', href: '#/mini?' + Date.now() }, 'Noch eine Mini-Klassenarbeit'));
    window.scrollTo(0, 0);
  }
}
