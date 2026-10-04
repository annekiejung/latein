/*
 * Aktuelle Vokabeln (Testvorbereitung).
 *   #/vokabeln                 Übersicht: Lektionen
 *   #/vokabeln/import          Prompt kopieren → Ergebnis einfügen → Vorschau → speichern
 *   #/vokabeln/lektion/<name>  Karten einer Lektion ansehen, bearbeiten, löschen
 * Abfrage + Leitner folgen in Schritt 2b.
 */
import { getAll, remove, put } from '../db.js';
import { h, toast, copyText, dialog, confirmDialog } from '../ui.js';
import {
  headline, extractJson, checkImport, saveCard, buildPrompt, WORTARTEN
} from '../vocab.js';
import { editCardDialog } from '../vocab-edit.js';

export const title = 'Aktuelle Vokabeln';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'import') return renderImport(main);
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

/* =================== Übersicht =================== */

async function renderOverview(main) {
  const cards = await getAll('vocab');
  const lessons = groupByLesson(cards);
  const unsure = cards.filter((c) => c.unsicher).length;

  main.append(h('div', { class: 'card' },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, cards.length), h('span', {}, 'Karten')),
      h('div', { class: 'stat' }, h('b', {}, lessons.length), h('span', {}, 'Lektionen')),
      h('div', { class: 'stat' }, h('b', {}, unsure), h('span', {}, 'zu prüfen'))
    ),
    h('a', { class: 'btn block', href: '#/vokabeln/import', style: 'margin-top:14px' }, 'Vokabeln importieren')
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
  } else {
    main.append(h('div', { class: 'card' },
      h('h2', {}, 'Lektionen'),
      h('ul', { class: 'list' }, lessons.map(([name, list]) => {
        const u = list.filter((c) => c.unsicher).length;
        return h('li', {},
          h('a', { href: lessonHref(name), class: 'row-link' },
            h('span', {}, name),
            h('span', { class: 'muted' }, `${list.length} Karten`,
              u ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, `${u} prüfen`) : null)
          ));
      }))
    ));
  }

  main.append(h('div', { class: 'card note' },
    h('h3', {}, 'Abfrage'),
    h('p', {}, 'Abfrage Latein → Deutsch, Formen-Abfrage und Lernen mit 5 Fächern kommen im nächsten Schritt (2b).')
  ));
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
    h('p', { class: 'muted' }, 'Dann in der Claude-App: Foto der Vokabelliste anhängen, Prompt einfügen, senden. Die Antwort mit dem Kopieren-Knopf am Codeblock kopieren.')
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
    toast('Umbenannt.');
    location.hash = lessonHref(neu);
  }

  async function deleteLesson() {
    const ok = await confirmDialog('Lektion löschen?',
      `Alle ${cards.length} Karten von „${name}“ und ihre Lernstände werden gelöscht. Das geht nur mit einem Backup rückgängig.`,
      'Lektion löschen', true);
    if (!ok) return;
    for (const c of cards) await remove('vocab', c.id);
    toast('Lektion gelöscht.');
    location.hash = '#/vokabeln';
  }
}

