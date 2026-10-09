/*
 * Grundwortschatz – strikt getrennt von den aktuellen Vokabeln
 * (eigener Lernstand im Store "coreProgress", eigene Statistik).
 *   #/wortschatz              Übersicht: Etappen, Pakete, Heute fällig
 *   #/wortschatz/paket/<n>    Wörter eines 100er-Pakets
 *   #/wortschatz/lernen       Abfrage einstellen und starten
 *   #/wortschatz/meldungen    eigene Meldungen/Korrekturen ansehen und kopieren
 * Daten + Logik: js/gws.js
 */
import { getAll, remove, setSetting } from '../db.js';
import { h, toast, dialog, formDialog, confirmDialog, copyText, todayStr, formatDate } from '../ui.js';
import { headline, formQuestion, WORTARTEN } from '../vocab.js';
import { stateOf, isDue, boxCounts } from '../leitner.js';
import { startQuiz } from '../quiz.js';
import {
  loadData, loadCards, saveProgress, unlockedPackets, isLearned, isStarted,
  saveReport, reportsAsText, wiktionaryUrl, georgesUrl, PRUEFUNG
} from '../gws.js';

export const title = 'Grundwortschatz';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'paket' && arg) return renderPacket(main, parseInt(arg, 10));
  if (sub === 'lernen') return renderLearn(main);
  if (sub === 'meldungen') return renderReports(main);
  return renderOverview(main);
}

const ETAPPEN = {
  1: 'Etappe 1 · Wörter 1–500 (Dickinson-Kernwortschatz)',
  2: 'Etappe 2 · Wörter 501–996 (Dickinson-Kernwortschatz)',
  3: 'Etappe 3 · ab Wort 997 (von Claude zusammengestellt)'
};

/** Karten, die im Grundwortschatz gelernt werden (nicht die aus dem Unterricht). */
const ownCards = (cards) => cards.filter((c) => !c.imUnterricht);

/* =================== Übersicht =================== */

async function renderOverview(main) {
  const data = await loadData();
  const cards = await loadCards();
  const unlocked = await unlockedPackets();
  const totalPackets = Math.max(...cards.map((c) => c.paket));
  const active = cards.filter((c) => c.paket <= unlocked);
  const learnable = ownCards(active);
  const today = todayStr();
  const due = learnable.filter((c) => isDue(c, 'bedeutung', {}, today)).length;
  const learned = active.filter(isLearned).length;
  const inClass = active.filter((c) => c.imUnterricht).length;

  // Empfehlung zum Freischalten: letztes Paket zu 80 % mindestens in Fach 2
  const lastPacket = cards.filter((c) => c.paket === unlocked);
  const lastOwn = ownCards(lastPacket);
  const ready = lastOwn.filter((c) => stateOf(c, 'bedeutung').fach >= 2 || isLearned(c)).length;
  const readyPct = lastOwn.length ? Math.round((ready / lastOwn.length) * 100) : 100;

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Dein Stand'),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, due), h('span', {}, 'heute fällig')),
      h('div', { class: 'stat' }, h('b', {}, learned), h('span', {}, 'sicher (ab Fach 3)')),
      h('div', { class: 'stat' }, h('b', {}, `${unlocked}/${totalPackets}`), h('span', {}, 'Pakete frei'))
    ),
    h('a', { class: 'btn block', href: '#/wortschatz/lernen', style: 'margin-top:14px' }, due ? 'Lernen' : 'Frei üben'),
    inClass ? h('p', { class: 'muted small' },
      `${inClass} Wörter aus den freigeschalteten Paketen lernst du schon im Unterricht – sie werden hier nicht doppelt abgefragt.`) : null
  ));

  // Fächer der freigeschalteten Wörter
  main.append(h('div', { class: 'card' },
    h('h3', {}, 'Fächer (freigeschaltete Wörter)'),
    boxBars(boxCounts(learnable, 'bedeutung'))
  ));

  // Etappen und Pakete
  for (const et of [1, 2, 3]) {
    const etCards = cards.filter((c) => c.etappe === et);
    if (!etCards.length) continue;
    const packets = [...new Set(etCards.map((c) => c.paket))];
    const etLearned = etCards.filter(isLearned).length;
    main.append(h('div', { class: 'card' },
      h('h3', {}, ETAPPEN[et]),
      h('div', { class: 'goal' },
        h('span', {}, `${etLearned} von ${etCards.length} sicher`),
        h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((etLearned / etCards.length) * 100)}%` }))),
      h('div', { class: 'packet-grid' }, packets.map((p) => {
        const pc = cards.filter((c) => c.paket === p);
        const open = p <= unlocked;
        const done = pc.filter(isLearned).length;
        return h('a', {
          class: 'packet' + (open ? '' : ' locked'),
          href: '#/wortschatz/paket/' + p
        },
        h('b', {}, `Paket ${p}`),
        h('span', {}, `Nr. ${pc[0].nr}–${pc[pc.length - 1].nr}`),
        h('span', { class: 'muted' }, open ? `${done}/${pc.length} sicher` : 'gesperrt'));
      }))
    ));
  }

  // Nächstes Paket freischalten
  if (unlocked < totalPackets) {
    main.append(h('div', { class: 'card note' },
      h('h3', {}, `Paket ${unlocked + 1} freischalten`),
      h('p', {}, `Empfehlung: erst, wenn mindestens 80 % von Paket ${unlocked} in Fach 2 oder höher sind. Aktuell: ${readyPct} %.`),
      h('button', {
        class: 'btn ' + (readyPct >= 80 ? '' : 'secondary'),
        onclick: async () => {
          if (readyPct < 80) {
            const ok = await confirmDialog('Trotzdem freischalten?',
              `Paket ${unlocked} ist erst zu ${readyPct} % gefestigt. Mit 100 neuen Wörtern auf einmal wird es schnell viel. Trotzdem weitermachen?`,
              'Freischalten');
            if (!ok) return;
          }
          await setSetting('gwsPakete', unlocked + 1);
          toast(`Paket ${unlocked + 1} ist frei.`);
          location.hash = '#/wortschatz/paket/' + (unlocked + 1);
        }
      }, `Paket ${unlocked + 1} freischalten`)
    ));
  }

  // Quellen, Ehrlichkeit, Meldungen
  const reports = await getAll('reports');
  const unchecked = cards.filter((c) => ['ungeprueft', 'vorlage'].includes(c.pruefung)).length;
  main.append(h('div', { class: 'card' },
    h('h3', {}, 'Woher die Wörter stammen'),
    h('p', { class: 'small' }, 'Wörter 1–996: Auswahl, Reihenfolge (Häufigkeit) und Wortart aus dem „Latin Core Vocabulary“ der Dickinson College Commentaries (Daten: LASLA), Lizenz CC BY-SA.'),
    h('p', { class: 'small' }, 'Ab Wort 997 und alle deutschen Bedeutungen: von Claude (KI) ergänzt und automatisch mit dem deutschen Wiktionary bzw. dem Georges (1913) abgeglichen. ',
      h('b', {}, `${unchecked} Einträge`), ' ließen sich dabei nicht bestätigen und sind als „ungeprüft“ markiert.'),
    h('p', { class: 'small muted' }, `Stand der Wortliste: ${formatDate(data.stand)} · Lizenz der Liste: ${data.lizenz}`),
    h('a', { class: 'btn secondary block', href: '#/wortschatz/meldungen' },
      reports.length ? `Meine Meldungen (${reports.length})` : 'Meine Meldungen')
  ));
}

function boxBars(counts) {
  const max = Math.max(1, ...counts);
  return h('div', { class: 'boxes' }, counts.map((n, i) => h('div', { class: 'box-row' },
    h('span', { class: 'box-label' }, `Fach ${i + 1}`),
    h('span', { class: 'box-bar' }, h('span', { style: `width:${Math.round((n / max) * 100)}%` })),
    h('span', { class: 'box-num' }, n)
  )));
}

/* =================== Paket =================== */

async function renderPacket(main, p) {
  const cards = (await loadCards()).filter((c) => c.paket === p);
  const unlocked = await unlockedPackets();
  if (!cards.length) { main.append(h('p', { class: 'card' }, 'Dieses Paket gibt es nicht.')); return; }
  const open = p <= unlocked;

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/wortschatz', class: 'back' }, '‹ Grundwortschatz'),
    h('h2', {}, `Paket ${p}`),
    h('p', { class: 'muted' }, `Wörter ${cards[0].nr}–${cards[cards.length - 1].nr} · ${ETAPPEN[cards[0].etappe]}`),
    open ? null : h('p', { class: 'badge warn' }, 'Noch gesperrt – du kannst die Wörter ansehen, abgefragt werden sie erst nach dem Freischalten.')
  ));

  main.append(h('div', { class: 'card' },
    h('ul', { class: 'list' }, cards.map((c) => h('li', {},
      h('button', { class: 'vocab-row', onclick: () => showEntry(c, () => { main.replaceChildren(); renderPacket(main, p); }) },
        h('span', {}, h('span', { class: 'muted small' }, `${c.nr}  `), h('span', { class: 'latin' }, headline(c))),
        h('span', { class: 'muted' }, c.bedeutungen.join(', ')),
        h('span', {},
          h('span', { class: 'badge' }, WORTARTEN[c.wortart]),
          c.imUnterricht ? h('span', { class: 'badge ok', style: 'margin-left:6px' }, 'im Unterricht') : null,
          ['ungeprueft', 'vorlage'].includes(c.pruefung) ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, 'ungeprüft') : null,
          c.korrigiert ? h('span', { class: 'badge', style: 'margin-left:6px' }, 'korrigiert') : null,
          isLearned(c) ? h('span', { class: 'badge ok', style: 'margin-left:6px' }, 'sicher') : null)
      )
    )))
  ));
}

/** Detail-Dialog: alle Angaben, Quellen, Prüfstatus, Melden/Korrigieren. */
async function showEntry(c, onChange) {
  const pr = PRUEFUNG[c.pruefung] || PRUEFUNG.ungeprueft;
  const s = c.imUnterricht ? c.imUnterricht.karte.lernstand : c.lernstand;
  const choice = await dialog({
    title: `Nr. ${c.nr}`,
    body: h('div', {},
      h('p', { class: 'latin big' }, headline(c)),
      h('p', {}, c.bedeutungen.join('; ')),
      c.hinweis ? h('p', { class: 'muted' }, c.hinweis) : null,
      h('ul', { class: 'list small' },
        h('li', {}, 'Wortart: ', WORTARTEN[c.wortart]),
        h('li', {}, 'Wortauswahl: ', c.quelle === 'dcc'
          ? `Dickinson Core Vocabulary (Häufigkeitsrang ${c.rang})`
          : 'von Claude zusammengestellt (Etappe 3)'),
        h('li', {}, 'Deutsche Bedeutungen: ', c.korrigiert ? 'deine eigene Korrektur' : 'von Claude ergänzt'),
        h('li', {}, 'Prüfung: ', h('span', { class: 'badge ' + pr.cls }, pr.text)),
        c.imUnterricht ? h('li', {}, 'Lernst du im Unterricht: ', c.imUnterricht.lektion) : null,
        h('li', {}, 'Lernstand: ', s && s.zuletzt ? `Fach ${s.fach}, zuletzt ${formatDate(s.zuletzt)}` : 'noch nicht abgefragt')
      ),
      h('p', { class: 'small' }, 'Nachschlagen: ',
        h('a', { href: wiktionaryUrl(c), target: '_blank', rel: 'noopener' }, 'Wiktionary'), ' · ',
        h('a', { href: georgesUrl(c), target: '_blank', rel: 'noopener' }, 'Georges'),
        h('span', { class: 'muted' }, ' (Internet nötig)'))
    ),
    buttons: [
      { label: 'Melden / korrigieren', value: 'melden', class: 'secondary' },
      { label: 'Schließen', value: null }
    ]
  });
  if (choice === 'melden') {
    if (await reportEntry(c)) onChange && onChange();
  }
}

/** Formular „Eintrag melden“ – wird lokal gespeichert, Korrektur gilt sofort. */
async function reportEntry(c) {
  const art = h('select', {},
    ['Bedeutung falsch', 'Bedeutung fehlt', 'Form falsch (Genitiv/Stammformen/…)', 'Wortart falsch', 'Längenzeichen falsch', 'Sonstiges']
      .map((a) => h('option', { value: a }, a)));
  const text = h('textarea', { rows: 3, placeholder: 'Was stimmt nicht? Woher weißt du es (z. B. Buch, Lehrkraft)?' });
  const useOwn = h('input', { type: 'checkbox' });
  const own = h('textarea', { rows: 3, autocapitalize: 'off', spellcheck: 'false' }, c.bedeutungen.join('\n'));
  const ownWrap = h('label', { class: 'field', hidden: true }, h('span', {}, 'Meine Bedeutungen (eine pro Zeile)'), own);
  useOwn.addEventListener('change', () => { ownWrap.hidden = !useOwn.checked; });

  const result = await formDialog({
    title: `Melden: ${c.latein}`,
    saveLabel: 'Speichern',
    body: h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Was ist das Problem?'), art),
      h('label', { class: 'field' }, h('span', {}, 'Anmerkung'), text),
      h('label', { class: 'check-row' }, useOwn, h('span', {}, 'Bedeutungen selbst korrigieren (gilt sofort beim Lernen)')),
      ownWrap,
      h('p', { class: 'muted small' }, 'Die Meldung bleibt auf deinem Gerät und kommt mit ins Backup. Unter „Meine Meldungen“ kannst du alle kopieren und weitergeben.')
    ),
    onSave: async () => {
      let korr = null;
      if (useOwn.checked) {
        korr = own.value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!korr.length) return 'Bitte mindestens eine Bedeutung eintragen.';
      }
      if (!korr && !text.value.trim()) return 'Bitte kurz beschreiben, was nicht stimmt.';
      await saveReport(c, art.value, text.value.trim(), korr);
      return null;
    }
  });
  if (result === 'saved') { toast('Gemeldet. Danke!'); return true; }
  return false;
}

/* =================== Meldungen =================== */

async function renderReports(main) {
  const reports = (await getAll('reports')).sort((a, b) => a.nr - b.nr);
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/wortschatz', class: 'back' }, '‹ Grundwortschatz'),
    h('h2', {}, 'Meine Meldungen'),
    reports.length
      ? h('p', { class: 'muted' }, 'Korrekturen gelten sofort. Zum Weitergeben (z. B. an Claude, damit die Wortliste verbessert wird): Text kopieren.')
      : h('p', { class: 'muted' }, 'Noch keine Meldungen. Tippe in einem Paket auf ein Wort und dann auf „Melden / korrigieren“.'),
    reports.length ? h('button', {
      class: 'btn block',
      onclick: async () => {
        const t = await reportsAsText();
        if (await copyText(t)) toast('Meldungen kopiert.');
        else dialog({ title: 'Zum Kopieren markieren', body: h('textarea', { rows: 10, readonly: true }, t) });
      }
    }, 'Alle Meldungen kopieren') : null
  ));
  if (!reports.length) return;
  main.append(h('div', { class: 'card' },
    h('ul', { class: 'list' }, reports.map((r) => h('li', {},
      h('div', {}, h('b', { class: 'latin' }, `${r.nr} ${r.latein}`), ' – ', r.art),
      r.text ? h('div', { class: 'muted small' }, r.text) : null,
      r.korrektur ? h('div', { class: 'small' }, 'Korrektur: ', r.korrektur.bedeutungen.join('; ')) : null,
      h('button', {
        class: 'btn secondary btn-small', style: 'margin-top:6px',
        onclick: async () => {
          if (!(await confirmDialog('Meldung löschen?', r.korrektur ? 'Die eigene Korrektur gilt dann nicht mehr.' : 'Die Meldung wird entfernt.', 'Löschen', true))) return;
          await remove('reports', r.id);
          main.replaceChildren(); renderReports(main);
        }
      }, 'Löschen')
    )))
  ));
}

/* =================== Lernen =================== */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function renderLearn(main) {
  const unlocked = await unlockedPackets();
  const cards = ownCards((await loadCards()).filter((c) => c.paket <= unlocked));
  const today = todayStr();
  const prefs = { mode: 'bedeutung', style: 'eingabe', scope: 'faellig', size: '20' };

  const seg = (key, options) => h('div', { class: 'seg', role: 'radiogroup' },
    options.map(([value, label]) => h('label', {},
      h('input', { type: 'radio', name: 'gws-' + key, value, checked: prefs[key] === value, onchange: () => { prefs[key] = value; update(); } }),
      h('span', {}, label))));

  const info = h('p', { class: 'muted' });
  const startBtn = h('button', { class: 'btn block', onclick: start });

  function pick() {
    let pool = prefs.mode === 'formen' ? cards.filter((c) => formQuestion(c)) : cards;
    if (prefs.scope === 'faellig') {
      pool = pool.filter((c) => isDue(c, prefs.mode, {}, today));
      // Wiederholungen zuerst (schon gesehene, niedriges Fach), dann neue Wörter in Listenreihenfolge
      const seen = shuffle(pool.filter((c) => stateOf(c, prefs.mode).zuletzt))
        .sort((a, b) => stateOf(a, prefs.mode).fach - stateOf(b, prefs.mode).fach);
      const fresh = pool.filter((c) => !stateOf(c, prefs.mode).zuletzt).sort((a, b) => a.nr - b.nr);
      pool = [...seen, ...fresh];
    } else pool = shuffle(pool);
    return prefs.size === 'alle' ? pool : pool.slice(0, parseInt(prefs.size, 10));
  }

  function update() {
    const n = pick().length;
    startBtn.textContent = n ? `${n} Karten abfragen` : 'Nichts abzufragen';
    startBtn.disabled = n === 0;
    info.textContent = prefs.scope === 'alle'
      ? 'Freies Üben: Fächer bleiben unverändert.'
      : 'Fällige Wiederholungen kommen zuerst, dann neue Wörter in der Reihenfolge der Liste.';
  }

  async function start() {
    const list = pick();
    if (!list.length) return;
    startQuiz(main, {
      cards: list, mode: prefs.mode, style: prefs.style, leitner: prefs.scope === 'faellig',
      save: saveProgress, typ: 'grundwortschatz',
      onDone: () => { location.hash = '#/wortschatz'; }
    });
  }

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/wortschatz', class: 'back' }, '‹ Grundwortschatz'),
    h('h2', {}, 'Grundwortschatz lernen'),
    h('p', { class: 'muted small' }, `Pakete 1–${unlocked} · ${cards.length} Wörter (ohne die, die du im Unterricht lernst)`),
    h('div', { class: 'field' }, h('span', {}, 'Was?'), seg('mode', [['bedeutung', 'Bedeutung'], ['formen', 'Formen']])),
    h('div', { class: 'field' }, h('span', {}, 'Wie?'), seg('style', [['eingabe', 'Eingabe'], ['karte', 'Karteikarte']])),
    h('div', { class: 'field' }, h('span', {}, 'Welche Karten?'), seg('scope', [['faellig', 'Nur fällige'], ['alle', 'Alle (frei üben)']])),
    h('div', { class: 'field' }, h('span', {}, 'Wie viele pro Runde?'), seg('size', [['10', '10'], ['20', '20'], ['50', '50'], ['alle', 'alle']])),
    info,
    startBtn
  ));
  update();
}
