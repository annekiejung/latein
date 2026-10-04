/*
 * Aktuelle Vokabeln (Testvorbereitung).
 *   #/vokabeln                 Übersicht: Heute fällig, Fächer, Lektionen
 *   #/vokabeln/lernen          Abfrage einstellen und starten (Runde: js/quiz.js)
 *   #/vokabeln/import          Prompt kopieren → Ergebnis einfügen → Vorschau → speichern
 *   #/vokabeln/lektion/<name>  Karten einer Lektion, Testtermin (Intensivmodus)
 */
import { getAll, remove, put, getSetting, setSetting } from '../db.js';
import { h, toast, copyText, dialog, confirmDialog, todayStr, formatDate } from '../ui.js';
import {
  headline, extractJson, checkImport, saveCard, buildPrompt, WORTARTEN, formQuestion
} from '../vocab.js';
import { editCardDialog } from '../vocab-edit.js';
import { stateOf, isDue, boxCounts, streakInfo, getTestTermine, daysBetween } from '../leitner.js';
import { startQuiz } from '../quiz.js';

export const title = 'Aktuelle Vokabeln';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'import') return renderImport(main);
  if (sub === 'lernen') return renderLearn(main);
  if (sub === 'lektion' && arg) return renderLesson(main, decodeURIComponent(arg));
  return renderOverview(main);
}

const lessonHref = (name) => '#/vokabeln/lektion/' + encodeURIComponent(name);

/** Gruppiert Karten nach Lektion (Reihenfolge: zuletzt angelegt zuerst). */
function groupByLesson(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.lektion)) map.set(c.lektion, []);
    map.get(c.lektion).push(c);
  }
  return [...map.entries()].sort((a, b) => {
    const la = a[1].reduce((m, c) => (c.erstellt > m ? c.erstellt : m), '');
    const lb = b[1].reduce((m, c) => (c.erstellt > m ? c.erstellt : m), '');
    return lb.localeCompare(la);
  });
}

/** Karten, die sich im Modus abfragen lassen (Formen nur, wenn Formen hinterlegt sind). */
const usable = (cards, mode) => (mode === 'formen' ? cards.filter((c) => formQuestion(c)) : cards);

/** Text "Test in 3 Tagen" / "Test heute" / null. */
function testLabel(date) {
  if (!date) return null;
  const d = daysBetween(todayStr(), date);
  if (d < 0) return null;
  return d === 0 ? 'Test heute' : d === 1 ? 'Test morgen' : `Test in ${d} Tagen`;
}

/** Balken je Fach. */
function boxBars(counts) {
  const max = Math.max(1, ...counts);
  return h('div', { class: 'boxes' }, counts.map((n, i) => h('div', { class: 'box-row' },
    h('span', { class: 'box-label' }, `Fach ${i + 1}`),
    h('span', { class: 'box-bar' }, h('span', { style: `width:${Math.round((n / max) * 100)}%` })),
    h('span', { class: 'box-num' }, n)
  )));
}

/* =================== Übersicht =================== */

async function renderOverview(main) {
  const cards = await getAll('vocab');
  const lessons = groupByLesson(cards);
  const unsure = cards.filter((c) => c.unsicher).length;
  const termine = await getTestTermine();
  const today = todayStr();
  const dueB = cards.filter((c) => isDue(c, 'bedeutung', termine, today)).length;
  const formCards = usable(cards, 'formen');
  const dueF = formCards.filter((c) => isDue(c, 'formen', termine, today)).length;
  const s = await streakInfo(today);

  if (cards.length) {
    main.append(h('div', { class: 'card' },
      h('h2', {}, 'Heute'),
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', {}, dueB), h('span', {}, 'Bedeutung fällig')),
        h('div', { class: 'stat' }, h('b', {}, dueF), h('span', {}, 'Formen fällig')),
        h('div', { class: 'stat' }, h('b', {}, s.streak), h('span', {}, s.streak === 1 ? 'Tag Serie' : 'Tage Serie'))
      ),
      h('div', { class: 'goal' },
        h('span', {}, `Tagesziel: ${Math.min(s.todayDone, s.goal)} / ${s.goal}`),
        h('div', { class: 'progress' }, h('span', { style: `width:${Math.min(100, Math.round((s.todayDone / s.goal) * 100))}%` }))
      ),
      h('a', { class: 'btn block', href: '#/vokabeln/lernen', style: 'margin-top:14px' }, 'Lernen')
    ));

    main.append(h('div', { class: 'card' },
      h('h2', {}, 'Fächer'),
      h('h3', { class: 'muted' }, 'Bedeutung'),
      boxBars(boxCounts(cards, 'bedeutung')),
      formCards.length ? h('h3', { class: 'muted', style: 'margin-top:12px' }, 'Formen') : null,
      formCards.length ? boxBars(boxCounts(formCards, 'formen')) : null,
      h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Fach 5 heißt: mehrmals hintereinander richtig. Neue Karten starten in Fach 1.')
    ));
  }

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Lektionen'),
    lessons.length ? h('ul', { class: 'list' }, lessons.map(([name, list]) => {
      const u = list.filter((c) => c.unsicher).length;
      const t = testLabel(termine[name]);
      return h('li', {},
        h('a', { href: lessonHref(name), class: 'row-link' },
          h('span', {}, name, t ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, t) : null),
          h('span', { class: 'muted' }, `${list.length}`,
            u ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, `${u} prüfen`) : null)
        ));
    })) : h('p', { class: 'muted' }, 'Noch keine Vokabeln gespeichert.'),
    unsure ? h('p', { class: 'muted small' }, `${unsure} Karten sind als „bitte prüfen“ markiert – vergleiche sie mit dem Foto.`) : null,
    h('a', { class: lessons.length ? 'btn secondary block' : 'btn block', href: '#/vokabeln/import', style: 'margin-top:10px' }, 'Vokabeln importieren')
  ));

  if (!lessons.length) {
    main.append(h('div', { class: 'card note' },
      h('h3', {}, 'So kommen deine Vokabeln in die App'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Vokabelliste fotografieren.'),
        h('li', {}, 'Unter „Vokabeln importieren“ den Prompt kopieren.'),
        h('li', {}, 'In der Claude-App: Foto + Prompt senden.'),
        h('li', {}, 'Claudes Antwort kopieren und hier einfügen.')
      )
    ));
  }
}

/* =================== Lernen (Einstellungen der Runde) =================== */

/** Mischt eine Liste (Fisher-Yates). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function renderLearn(main) {
  const cards = await getAll('vocab');
  if (!cards.length) {
    main.append(h('div', { class: 'card' }, h('p', {}, 'Noch keine Vokabeln gespeichert.'),
      h('a', { class: 'btn', href: '#/vokabeln/import' }, 'Vokabeln importieren')));
    return;
  }
  const termine = await getTestTermine();
  const today = todayStr();
  const lessons = groupByLesson(cards);
  const saved = await getSetting('quizPrefs');
  const prefs = { ...saved };
  // Gespeicherte Lektionsauswahl nur übernehmen, wenn die Lektionen noch existieren
  const names = lessons.map(([n]) => n);
  let selected = new Set((prefs.lessons || names).filter((n) => names.includes(n)));
  if (!selected.size) selected = new Set(names);

  /** Segment-Auswahl (wie Tabs) für eine Einstellung. */
  const seg = (key, options) => h('div', { class: 'seg', role: 'radiogroup' },
    options.map(([value, label]) => h('label', {},
      h('input', {
        type: 'radio', name: key, value, checked: prefs[key] === value,
        onchange: () => { prefs[key] = value; update(); }
      }),
      h('span', {}, label))));

  const lessonList = h('ul', { class: 'list' });
  const info = h('p', { class: 'muted' });
  const startBtn = h('button', { class: 'btn block', onclick: start });

  /** Welche Karten würden abgefragt? */
  function pick() {
    const pool = usable(cards.filter((c) => selected.has(c.lektion)), prefs.mode);
    if (prefs.scope === 'alle') return shuffle(pool);
    const due = pool.filter((c) => isDue(c, prefs.mode, termine, today));
    // niedrige Fächer zuerst, innerhalb eines Fachs gemischt
    return shuffle(due).sort((a, b) => stateOf(a, prefs.mode).fach - stateOf(b, prefs.mode).fach);
  }

  function update() {
    lessonList.replaceChildren(...lessons.map(([name, list]) => {
      const pool = usable(list, prefs.mode);
      const due = pool.filter((c) => isDue(c, prefs.mode, termine, today)).length;
      const t = testLabel(termine[name]);
      return h('li', {}, h('label', { class: 'check-row' },
        h('input', {
          type: 'checkbox', checked: selected.has(name),
          onchange: (e) => { e.target.checked ? selected.add(name) : selected.delete(name); update(); }
        }),
        h('span', { style: 'flex:1' }, name, t ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, t) : null),
        h('span', { class: 'muted small' }, prefs.scope === 'alle' ? `${pool.length}` : `${due} fällig`)
      ));
    }));
    const n = pick().length;
    startBtn.textContent = n ? `${n} Karten abfragen` : 'Nichts abzufragen';
    startBtn.disabled = n === 0;
    if (prefs.mode === 'formen' && !usable(cards.filter((c) => selected.has(c.lektion)), 'formen').length) {
      info.textContent = 'In der Auswahl gibt es keine Karten mit Formen-Angaben (Genitiv/Genus, Stammformen …).';
    } else if (!n && prefs.scope === 'faellig') {
      const pool = usable(cards.filter((c) => selected.has(c.lektion)), prefs.mode);
      const next = pool.map((c) => stateOf(c, prefs.mode).faellig).sort()[0];
      info.textContent = next ? `Heute ist nichts mehr fällig. Nächste Wiederholung: ${formatDate(next)}. Du kannst trotzdem „Alle Karten“ frei üben.` : '';
    } else {
      info.textContent = prefs.scope === 'alle'
        ? 'Freies Üben: Die Fächer bleiben unverändert – gut zum Wiederholen vor dem Test.'
        : 'Richtig → ein Fach höher, falsch → zurück in Fach 1.';
    }
  }

  async function start() {
    const list = pick();
    if (!list.length) return;
    await setSetting('quizPrefs', { ...prefs, lessons: [...selected] });
    startQuiz(main, {
      cards: list, mode: prefs.mode, style: prefs.style, leitner: prefs.scope === 'faellig',
      onDone: () => { location.hash = '#/vokabeln'; }
    });
  }

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/vokabeln', class: 'back' }, '‹ Übersicht'),
    h('h2', {}, 'Lernen'),
    h('div', { class: 'field' }, h('span', {}, 'Was?'),
      seg('mode', [['bedeutung', 'Bedeutung'], ['formen', 'Formen']])),
    h('div', { class: 'field' }, h('span', {}, 'Wie?'),
      seg('style', [['eingabe', 'Eingabe'], ['karte', 'Karteikarte']])),
    h('div', { class: 'field' }, h('span', {}, 'Welche Karten?'),
      seg('scope', [['faellig', 'Nur fällige'], ['alle', 'Alle (frei üben)']])),
    h('div', { class: 'field' }, h('span', {}, 'Lektionen'), lessonList),
    info,
    startBtn
  ));
  update();
}

/* =================== Import =================== */

async function renderImport(main) {
  /* ----- Schritt 1: Prompt ----- */
  const lessonInput = h('input', {
    type: 'text', placeholder: 'z. B. Caesar 1 oder Test 12.11.', autocapitalize: 'sentences'
  });
  const promptFallback = h('div');
  main.append(h('div', { class: 'card' },
    h('h2', {}, '1. Prompt holen'),
    h('label', { class: 'field' }, h('span', {}, 'Name der Lektion'), lessonInput),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        const name = lessonInput.value.trim();
        if (!name) { toast('Bitte zuerst einen Namen für die Lektion eingeben.'); lessonInput.focus(); return; }
        const text = buildPrompt(name);
        if (await copyText(text)) {
          toast('Prompt kopiert. Jetzt in der Claude-App mit dem Foto einfügen.', 4000);
          promptFallback.replaceChildren();
        } else {
          // Zwischenablage verweigert → zum Markieren anzeigen
          promptFallback.replaceChildren(
            h('p', { class: 'muted' }, 'Kopieren hat nicht geklappt. Markiere den Text und kopiere ihn selbst:'),
            h('textarea', { rows: 8, readonly: true }, text));
        }
      }
    }, 'Prompt kopieren'),
    promptFallback,
    h('p', { class: 'muted' }, 'Dann in der Claude-App: Foto der Vokabelliste anhängen, Prompt einfügen, senden. Die Antwort mit dem Kopieren-Knopf am Codeblock kopieren.'),
    h('p', {}, 'Genaue Anleitung mit Fehlerquellen: ',
      h('a', { href: 'docs/workflow_vokabeln.html' }, 'Workflow ansehen'), ' · ',
      h('a', { href: 'workflow_vokabeln.pdf', target: '_blank' }, 'als PDF'))
  ));

  /* ----- Schritt 2: Einfügen ----- */
  const input = h('textarea', {
    rows: 6, placeholder: 'Antwort von Claude hier einfügen …',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false'
  });
  const fileInput = h('input', {
    type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) { input.value = await f.text(); check(); }
    }
  });
  const preview = h('div');

  main.append(h('div', { class: 'card' },
    h('h2', {}, '2. Ergebnis einfügen'),
    input,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => check() }, 'Prüfen'),
      h('button', { class: 'btn secondary', onclick: () => fileInput.click() }, 'Datei wählen')
    ),
    fileInput
  ), preview);

  async function check() {
    preview.replaceChildren();
    let obj;
    try {
      obj = extractJson(input.value);
    } catch (err) {
      preview.append(h('div', { class: 'card warn' }, h('h3', {}, 'Konnte nicht gelesen werden'), h('p', {}, err.message)));
      return;
    }
    const res = await checkImport(obj, lessonInput.value);
    if (res.errors.length) {
      preview.append(h('div', { class: 'card warn' },
        h('h3', {}, 'Import nicht möglich'),
        h('ul', {}, res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    renderPreview(preview, res);
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Vorschau: jede Karte mit Häkchen, Warnungen und Bearbeiten-Knopf. */
function renderPreview(container, res) {
  // Pro Karte merken: übernehmen ja/nein
  for (const it of res.items) {
    it.include = it.errors.length === 0 && !it.dup;
  }

  const lessonName = h('input', { type: 'text', value: res.lektion });
  const summary = h('p');
  const list = h('ul', { class: 'list' });
  const saveBtn = h('button', { class: 'btn block', onclick: save });

  const refresh = () => {
    const n = res.items.length;
    const inc = res.items.filter((i) => i.include).length;
    const err = res.items.filter((i) => i.errors.length).length;
    const dupDb = res.items.filter((i) => i.dup === 'db').length;
    const dupImp = res.items.filter((i) => i.dup === 'import').length;
    const warn = res.items.filter((i) => i.warnings.length && !i.errors.length).length;
    summary.replaceChildren(
      `${n} Vokabeln gelesen. `,
      err ? h('span', { class: 'badge bad' }, `${err} mit Fehler`) : null, ' ',
      dupDb ? h('span', { class: 'badge warn' }, `${dupDb} schon vorhanden`) : null, ' ',
      dupImp ? h('span', { class: 'badge warn' }, `${dupImp} doppelt in der Liste`) : null, ' ',
      warn ? h('span', { class: 'badge warn' }, `${warn} mit Hinweis`) : null
    );
    saveBtn.textContent = `${inc} Karten speichern`;
    saveBtn.disabled = inc === 0;
    list.replaceChildren(...res.items.map(itemRow));
  };

  const itemRow = (it, idx) => {
    const c = it.card || { latein: '(leer)', bedeutungen: [] };
    const box = h('input', {
      type: 'checkbox', checked: it.include, disabled: it.errors.length > 0,
      'aria-label': 'Übernehmen',
      onchange: (e) => { it.include = e.target.checked; refresh(); }
    });
    return h('li', { class: 'preview-item' + (it.include ? '' : ' excluded') },
      h('div', { class: 'preview-head' },
        box,
        h('div', { class: 'preview-main' },
          h('div', { class: 'latin' }, headline(c)),
          h('div', { class: 'muted' }, c.bedeutungen.join(', ') || '–'),
          c.hinweis && !c.unsicher ? h('div', { class: 'muted small' }, c.hinweis) : null
        ),
        h('button', {
          class: 'btn secondary btn-small',
          onclick: async () => {
            const r = await editCardDialog({ ...c, lektion: res.lektion });
            if (r && r.action === 'saved') {
              it.card = r.card;
              it.errors = [];
              it.warnings = r.warnings;
              if (it.dup !== 'db') it.include = true;
              refresh();
            }
          }
        }, 'Ändern')
      ),
      it.errors.map((e) => h('div', { class: 'msg bad' }, e)),
      it.dup === 'db' ? h('div', { class: 'msg warn' },
        `Schon vorhanden in „${it.existing.lektion}“. Mit Häkchen wird sie in diese Lektion verschoben und aktualisiert (Lernstand bleibt).`) : null,
      it.dup === 'import' ? h('div', { class: 'msg warn' }, 'Steht doppelt in dieser Liste – nur einmal übernommen.') : null,
      it.warnings.map((w) => h('div', { class: 'msg warn' }, w))
    );
  };

  async function save() {
    const name = lessonName.value.trim();
    if (!name) { toast('Bitte einen Namen für die Lektion eingeben.'); return; }
    const chosen = res.items.filter((i) => i.include && i.card);
    let added = 0, updated = 0;
    const base = Date.now() * 1000;            // Reihenfolge wie auf dem Foto
    for (const [idx, it] of chosen.entries()) {
      const card = { ...it.card };
      if (card.lektion === res.lektion) card.lektion = name;   // Umbenennung übernehmen
      if (it.dup === 'db') { await saveCard(card, it.existing, base + idx); updated++; }
      else { await saveCard(card, null, base + idx); added++; }
    }
    toast(`${added} neu gespeichert` + (updated ? `, ${updated} aktualisiert` : '') + '.');
    location.hash = lessonHref(name);
  }

  container.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, '3. Vorschau prüfen'),
    h('label', { class: 'field' }, h('span', {}, 'Lektion'), lessonName),
    summary,
    h('p', { class: 'muted' }, 'Vergleiche mit dem Foto! Tippe auf „Ändern“, um eine Karte zu verbessern. Nur Karten mit Häkchen werden gespeichert.'),
    list,
    saveBtn
  ));
  refresh();
}

/* =================== Lektion =================== */

async function renderLesson(main, name) {
  const all = await getAll('vocab');
  const cards = all.filter((c) => c.lektion === name).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  if (!cards.length) {
    main.append(h('div', { class: 'card' },
      h('p', {}, `Die Lektion „${name}“ ist leer oder existiert nicht mehr.`),
      h('a', { class: 'btn', href: '#/vokabeln' }, 'Zur Übersicht')));
    return;
  }
  const rerender = () => { main.replaceChildren(); renderLesson(main, name); };
  const termine = await getTestTermine();
  const testDate = termine[name] || '';

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/vokabeln', class: 'back' }, '‹ Alle Lektionen'),
    h('h2', {}, name),
    h('p', { class: 'muted' }, `${cards.length} Karten · zum Bearbeiten antippen`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn secondary btn-small', onclick: addCard }, 'Karte hinzufügen'),
      h('button', { class: 'btn secondary btn-small', onclick: renameLesson }, 'Umbenennen'),
      h('button', { class: 'btn danger btn-small', onclick: deleteLesson }, 'Lektion löschen')
    )
  ));

  /* ----- Testtermin (Intensivmodus) ----- */
  const dateInput = h('input', { type: 'date', value: testDate, min: todayStr() });
  const tl = testLabel(testDate);
  main.append(h('div', { class: 'card' },
    h('h3', {}, 'Testtermin'),
    h('p', { class: 'muted small' }, 'Mit Termin kommen die Karten dieser Lektion bis zum Test häufiger dran (Intensivmodus). Am Tag vor dem Test und am Testtag kommen alle Karten noch einmal.'),
    tl ? h('p', {}, h('span', { class: 'badge warn' }, tl), ' am ', formatDate(testDate)) : null,
    dateInput,
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn btn-small',
        onclick: async () => {
          if (!dateInput.value) { toast('Bitte ein Datum wählen.'); return; }
          await setSetting('testTermine', { ...termine, [name]: dateInput.value });
          toast('Testtermin gespeichert.');
          rerender();
        }
      }, 'Termin speichern'),
      testDate ? h('button', {
        class: 'btn secondary btn-small',
        onclick: async () => {
          const t = { ...termine };
          delete t[name];
          await setSetting('testTermine', t);
          toast('Testtermin entfernt.');
          rerender();
        }
      }, 'Termin entfernen') : null
    )
  ));

  /* ----- Lernstand der Lektion ----- */
  main.append(h('div', { class: 'card' },
    h('h3', {}, 'Fächer (Bedeutung)'),
    boxBars(boxCounts(cards, 'bedeutung'))
  ));

  main.append(h('div', { class: 'card' },
    h('ul', { class: 'list' }, cards.map((c) => h('li', {},
      h('button', { class: 'vocab-row', onclick: () => edit(c) },
        h('span', { class: 'latin' }, headline(c)),
        h('span', { class: 'muted' }, c.bedeutungen.join(', ')),
        h('span', {},
          h('span', { class: 'badge' }, WORTARTEN[c.wortart]),
          c.unsicher ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, 'bitte prüfen') : null,
          c.hinweis ? h('span', { class: 'muted small', style: 'margin-left:6px' }, c.hinweis) : null)
      )
    ))))
  );

  async function edit(c) {
    const r = await editCardDialog(c, { onDelete: () => remove('vocab', c.id) });
    if (!r) return;
    if (r.action === 'saved') { await saveCard(r.card, c); toast('Gespeichert.'); }
    else toast('Karte gelöscht.');
    rerender();
  }

  async function addCard() {
    const r = await editCardDialog({ latein: '', wortart: 'nomen', bedeutungen: [], lektion: name }, { title: 'Neue Karte' });
    if (r && r.action === 'saved') { await saveCard(r.card); toast('Karte hinzugefügt.'); rerender(); }
  }

  async function renameLesson() {
    const input = h('input', { type: 'text', value: name });
    const ok = await dialog({
      title: 'Lektion umbenennen',
      body: h('label', { class: 'field' }, h('span', {}, 'Neuer Name'), input),
      buttons: [{ label: 'Abbrechen', value: false, class: 'secondary' }, { label: 'Umbenennen', value: true }]
    });
    const neu = input.value.trim();
    if (!ok || !neu || neu === name) return;
    for (const c of cards) await put('vocab', { ...c, lektion: neu });
    if (termine[name]) {                      // Testtermin mitnehmen
      const t = { ...termine, [neu]: termine[name] }; delete t[name];
      await setSetting('testTermine', t);
    }
    toast('Umbenannt.');
    location.hash = lessonHref(neu);
  }

  async function deleteLesson() {
    const ok = await confirmDialog('Lektion löschen?',
      `Alle ${cards.length} Karten von „${name}“ und ihre Lernstände werden gelöscht. Das geht nur mit einem Backup rückgängig.`,
      'Lektion löschen', true);
    if (!ok) return;
    for (const c of cards) await remove('vocab', c.id);
    if (termine[name]) { const t = { ...termine }; delete t[name]; await setSetting('testTermine', t); }
    toast('Lektion gelöscht.');
    location.hash = '#/vokabeln';
  }
}

