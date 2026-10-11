/*
 * Statistik: Lernzeit, Quoten je Bereich, Lernstand, Prüfungen, Schwachstellen.
 *   #/statistik
 * Nur echte Zahlen aus dem Gerät (Store history, vocab, coreProgress, exams, journal) –
 * wo es keine Daten gibt, steht „–“ statt einer geschönten Zahl.
 * Zeitraum: settings "statistikZeitraum" (7 / 30 / 0 = alles).
 */
import { getAll, getSetting, setSetting } from '../db.js';
import { h, todayStr, formatDate } from '../ui.js';
import { stateOf } from '../leitner.js';
import { loadCards, unlockedPackets, isLearned, isStarted } from '../gws.js';
import { analyse } from '../journal.js';
import { addDays } from '../planer.js';

export const title = 'Statistik';

const comma = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
const pct = (r, n) => (n ? Math.round((r / n) * 100) + ' %' : '–');
const hm = (sec) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};
const WD = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const dayLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return WD.format(new Date(y, m - 1, d)); };
const dayOf = (iso) => (iso ? todayStr(new Date(iso)) : '');

export async function render(main) {
  const prefs = { tage: (await getSetting('statistikZeitraum')) ?? 30 };
  const box = h('div');
  const switcher = h('div', { class: 'btn-row' }, [[7, '7 Tage'], [30, '30 Tage'], [0, 'alles']].map(([v, label]) => h('button', {
    class: 'btn btn-small ' + (prefs.tage === v ? '' : 'secondary'),
    onclick: async (e) => {
      prefs.tage = v;
      switcher.querySelectorAll('button').forEach((b) => b.classList.add('secondary'));
      e.currentTarget.classList.remove('secondary');
      await setSetting('statistikZeitraum', v);
      await fill();
    }
  }, label)));
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/start', class: 'back' }, '‹ Start'),
    h('h2', {}, 'Statistik'),
    switcher,
    h('p', { class: 'muted small' }, 'Lernzeit = aktive Zeit in Abfragen, Übungen und Prüfungen (lange Pausen zählen nicht).')),
  box);
  await fill();

  async function fill() {
    const today = todayStr();
    const since = prefs.tage ? addDays(today, -(prefs.tage - 1)) : '';
    const inRange = (d) => d >= since && d <= today;
    const history = await getAll('history');
    const tage = history.filter((r) => r.typ === 'tag');
    const tageIn = tage.filter((r) => inRange(r.datum));
    const parts = [];

    /* ----- Kennzahlen ----- */
    const sekunden = tageIn.reduce((s, r) => s + (r.sekunden || 0), 0);
    const lerntage = tageIn.filter((r) => (r.sekunden || 0) > 0 || r.antworten > 0).length;
    const goal = await getSetting('dailyGoal');
    const { current, longest } = streaks(tage, goal, today);
    parts.push(h('div', { class: 'card' },
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', {}, sekunden ? hm(sekunden) : '–'), h('span', {}, 'Lernzeit')),
        h('div', { class: 'stat' }, h('b', {}, lerntage), h('span', {}, lerntage === 1 ? 'Lerntag' : 'Lerntage')),
        h('div', { class: 'stat' }, h('b', {}, `${current} / ${longest}`), h('span', {}, 'Serie / längste'))),
      h('p', { class: 'muted small', style: 'margin-top:8px' }, `Serie = Tage hintereinander mit mindestens ${goal} Karten (Tagesziel).`)));

    /* ----- Lernzeit der letzten 14 Tage (Säulen, eine Reihe) ----- */
    const byDay = new Map(tage.map((r) => [r.datum, r]));
    const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
      .map((d) => ({ d, min: Math.round(((byDay.get(d) || {}).sekunden || 0) / 60) }));
    parts.push(h('div', { class: 'card' }, h('h3', {}, 'Lernzeit der letzten 14 Tage (Minuten)'), columnChart(last14)));

    /* ----- Quoten je Bereich ----- */
    const sum = (key) => tageIn.reduce((acc, r) => {
      const b = r.bereiche && r.bereiche[key];
      if (b) { acc.n += b.antworten; acc.r += b.richtig; }
      return acc;
    }, { n: 0, r: 0 });
    const vok = sum('vokabel');
    const gws = sum('grundwortschatz');
    const alt = tageIn.reduce((acc, r) => {           // Tage vor 0.11.0: nur Gesamtzahl bekannt
      if (!r.bereiche && r.antworten) { acc.n += r.antworten; acc.r += r.richtig; }
      return acc;
    }, { n: 0, r: 0 });
    const gram = history.filter((r) => r.typ === 'grammatik' && inRange(dayOf(r.zeit)))
      .reduce((a, r) => ({ n: a.n + r.gesamt, r: a.r + r.richtig }), { n: 0, r: 0 });
    const formen = history.filter((r) => r.typ === 'formen' && inRange(dayOf(r.zeit)))
      .reduce((a, r) => ({ n: a.n + r.gesamt, r: a.r + r.richtig }), { n: 0, r: 0 });
    const rows = [
      ['Unterrichtsvokabeln', 'Karten', vok],
      ['Grundwortschatz', 'Karten', gws],
      alt.n ? ['Vokabeln (vor 0.11 nicht getrennt)', 'Karten', alt] : null,
      ['Grammatik-Aufgaben', 'Aufgaben', gram],
      ['Formen bestimmen', 'Formen', formen]
    ].filter(Boolean);
    parts.push(h('div', { class: 'card' },
      h('h3', {}, 'Trefferquote (erste Antwort)'),
      h('table', { class: 'stat-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Bereich'), h('th', { class: 'num' }, 'Anzahl'), h('th', { class: 'num' }, 'richtig'))),
        h('tbody', {}, rows.map(([name, unit, x]) => h('tr', {},
          h('td', {}, name),
          h('td', { class: 'num' }, x.n ? `${comma(x.n, 1)} ${unit}` : '–'),
          h('td', { class: 'num' }, pct(x.r, x.n))))))));

    /* ----- Lernstand ----- */
    const vocab = await getAll('vocab');
    const faecher = [0, 0, 0, 0, 0];
    let neu = 0;
    for (const c of vocab) {
      const s = stateOf(c, 'bedeutung');
      if (!s.zuletzt) neu++;
      else faecher[Math.min(5, Math.max(1, s.fach)) - 1]++;
    }
    let gwsPart = h('p', { class: 'muted' }, 'Grundwortschatz: Wortliste nicht geladen.');
    try {
      const up = await unlockedPackets();
      const cards = (await loadCards()).filter((c) => c.paket <= up);
      const learned = cards.filter(isLearned).length;
      const started = cards.filter(isStarted).length;
      gwsPart = h('div', {},
        h('h3', {}, 'Grundwortschatz'),
        h('p', {}, `${learned} von ${cards.length} freigeschalteten Wörtern sicher (Fach 3+), ${started} schon abgefragt.`),
        h('div', { class: 'progress' }, h('span', { style: `width:${cards.length ? Math.round((learned / cards.length) * 100) : 0}%` })));
    } catch (e) { /* ohne Wortliste */ }
    parts.push(h('div', { class: 'card' },
      h('h3', {}, 'Unterrichtsvokabeln nach Fach'),
      vocab.length
        ? h('div', {},
            barList([['neu', neu], ...faecher.map((n, i) => [`Fach ${i + 1}`, n])]),
            h('p', { class: 'muted small' }, 'Fach 1 = gerade falsch oder neu gelernt · Fach 5 = mehrfach sicher gewusst.'))
        : h('p', { class: 'muted' }, 'Noch keine Unterrichtsvokabeln.'),
      gwsPart));

    /* ----- Prüfungen ----- */
    const proben = history.filter((r) => r.typ === 'pruefung' && r.bewertung && inRange(dayOf(r.abgegeben)))
      .sort((a, b) => b.abgegeben.localeCompare(a.abgegeben));
    const exams = (await getAll('exams')).filter((e) => e.note && e.datum <= today && inRange(e.datum))
      .sort((a, b) => b.datum.localeCompare(a.datum));
    const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
    const minis = history.filter((r) => r.typ === 'mini' && inRange(dayOf(r.zeit)));
    parts.push(h('div', { class: 'card' },
      h('h3', {}, 'Probe-Klassenarbeiten (bewertet)'),
      proben.length
        ? h('div', {},
            h('p', {}, `${proben.length} bewertet · Ø Note ${comma(avg(proben, (p) => p.bewertung.note))} · Ø ${comma(avg(proben, (p) => p.bewertung.fq))} Fehler pro 100 Wörter`),
            h('table', { class: 'stat-table' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), h('th', {}, 'Text'), h('th', { class: 'num' }, 'Fehler/100'), h('th', { class: 'num' }, 'Note'))),
              h('tbody', {}, proben.slice(0, 10).map((p) => h('tr', {},
                h('td', {}, dayLabel(dayOf(p.abgegeben))),
                h('td', {}, h('a', { href: '#/pruefung/versuch/' + encodeURIComponent(p.id) }, p.titel)),
                h('td', { class: 'num' }, comma(p.bewertung.fq)),
                h('td', { class: 'num' }, p.bewertung.note))))),
            h('p', { class: 'muted small' }, 'Noten aus der App sind Einschätzungen nach deinem Notenschlüssel.'))
        : h('p', { class: 'muted' }, 'Im Zeitraum keine bewertete Probe-Klassenarbeit.'),
      minis.length ? h('div', {},
        h('h3', {}, 'Mini-Klassenarbeiten'),
        h('p', {}, `${minis.length} geschrieben · Ø ${Math.round(avg(minis, (m) => m.prozent))} % · Ø Note ${comma(avg(minis, (m) => m.note))}`)) : null,
      exams.length ? h('div', {},
        h('h3', {}, 'Echte Klassenarbeiten'),
        h('table', { class: 'stat-table' }, h('tbody', {}, exams.map((e) => h('tr', {},
          h('td', {}, formatDate(e.datum)), h('td', {}, e.titel || 'Klassenarbeit'), h('td', { class: 'num' }, e.note)))))) : null));

    /* ----- Schwachstellen ----- */
    const a = await analyse(prefs.tage || null);
    parts.push(h('div', { class: 'card' },
      h('h3', {}, 'Schwachstellen'),
      a.phaenomene.length
        ? h('ol', { class: 'weak' }, a.phaenomene.slice(0, 5).map((p) => h('li', {},
            p.einheit ? h('a', { href: '#/grammatik/einheit/' + p.einheit }, p.name) : p.name,
            h('span', { class: 'muted small' }, ` – ${p.n}× falsch`))))
        : h('p', { class: 'muted' }, 'Im Zeitraum keine Grammatik- oder Formenfehler erfasst.'),
      a.woerter.length ? h('p', { class: 'small' }, 'Mehrfach falsche Wörter: ', a.woerter.slice(0, 5).map((w) => w.name.split(',')[0]).join(', ')) : null,
      h('a', { class: 'btn secondary block', href: '#/fehler', style: 'margin-top:8px' }, 'Zum Fehlerjournal')));

    box.replaceChildren(...parts);
  }
}

/** Aktuelle und längste Serie (Tage mit erreichtem Tagesziel). */
function streaks(tage, goal, today) {
  const ok = new Set(tage.filter((r) => r.antworten >= goal).map((r) => r.datum));
  let current = 0;
  let d = ok.has(today) ? today : addDays(today, -1);
  while (ok.has(d)) { current++; d = addDays(d, -1); }
  let longest = 0;
  for (const start of ok) {
    if (ok.has(addDays(start, -1))) continue;       // nur am Anfang einer Serie zählen
    let n = 0;
    let x = start;
    while (ok.has(x)) { n++; x = addDays(x, 1); }
    longest = Math.max(longest, n);
  }
  return { current, longest };
}

/**
 * Säulendiagramm, eine Reihe (Minuten pro Tag). Tippen auf eine Säule zeigt den Wert
 * in der Zeile darunter (statt Tooltip – am Handy gibt es kein Hover).
 */
function columnChart(data) {
  const max = Math.max(...data.map((x) => x.min));
  const today = data[data.length - 1].d;
  const readout = h('p', { class: 'small chart-readout' }, max ? 'Tippe auf eine Säule für den Wert.' : 'In den letzten 14 Tagen keine Lernzeit erfasst.');
  const show = (x) => { readout.textContent = `${dayLabel(x.d)}: ${x.min} min`; };
  const cols = data.map((x) => {
    const col = h('button', {
      class: 'col' + (x.d === today ? ' col-today' : ''), type: 'button',
      'aria-label': `${dayLabel(x.d)}: ${x.min} Minuten`,
      onclick: () => { cols.forEach((c) => c.classList.remove('sel')); col.classList.add('sel'); show(x); },
      onmouseenter: () => show(x)
    },
      h('span', { class: 'col-val' }, x.min && (x.min === max || x.d === today) ? x.min : ''),
      h('span', { class: 'col-area' }, h('span', { class: 'col-bar', style: `height:${max ? Math.max(x.min ? 3 : 0, Math.round((x.min / max) * 100)) : 0}%` })),
      h('span', { class: 'col-day' }, dayLabel(x.d).slice(0, 2)));
    return col;
  });
  return h('div', {}, h('div', { class: 'cols', role: 'group', 'aria-label': 'Lernzeit pro Tag' }, cols), readout);
}

/** Waagerechte Balken mit Zahl (eine Reihe). */
function barList(items) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  return h('ul', { class: 'list bars' }, items.map(([label, n]) => h('li', {},
    h('div', { class: 'bar-label' }, h('span', {}, label), h('span', { class: 'muted small' }, n)),
    h('div', { class: 'progress' }, h('span', { style: `width:${n ? Math.max(3, Math.round((n / max) * 100)) : 0}%` })))));
}
