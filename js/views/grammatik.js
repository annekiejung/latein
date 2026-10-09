/*
 * Grammatik-Training.
 *   #/grammatik                Liste aller Einheiten (eingebaut + importiert)
 *   #/grammatik/einheit/<id>   Regel ansehen, Übung starten
 *   #/grammatik/import         Prompt kopieren → Ergebnis einfügen → prüfen → speichern
 * Logik/Format: js/grammar.js
 */
import { put, remove, newId } from '../db.js';
import { h, toast, copyText, confirmDialog, todayStr, formatDate } from '../ui.js';
import { extractJson } from '../vocab.js';
import { checkForms } from '../check.js';
import { logSeconds } from '../leitner.js';
import { renderTables, renderTable, renderDrill } from './grammatik-formen.js';
import {
  loadUnits, getUnit, checkUnit, saveUnit, lastResults, saveResult, buildGrammarPrompt, TYPEN, BEARBEITUNG
} from '../grammar.js';

export const title = 'Grammatik';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'import') return renderImport(main);
  if (sub === 'tabellen') return renderTables(main);
  if (sub === 'tabelle') return renderTable(main, arg, params[2]);
  if (sub === 'formen') return renderDrill(main);
  if (sub === 'einheit' && arg) return renderUnit(main, decodeURIComponent(arg));
  return renderList(main);
}

const unitHref = (id) => '#/grammatik/einheit/' + encodeURIComponent(id);
const fill = (el, ...parts) => el.replaceChildren(...parts.filter(Boolean));

/* =================== Liste =================== */

async function renderList(main) {
  const units = await loadUnits();
  const results = await lastResults();

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Formenlehre'),
    h('a', { class: 'btn block', href: '#/grammatik/formen' }, 'Formen bestimmen (unregelmäßige Verben)'),
    h('a', { class: 'btn secondary block', href: '#/grammatik/tabellen' }, 'Konjugations- und Deklinationstabellen')
  ));
  const groups = {};
  for (const u of units) (groups[u.eingebaut ? (u.bereich || 'Grammatik') : 'Aus deinem Buch (importiert)'] ||= []).push(u);

  for (const [name, list] of Object.entries(groups)) {
    main.append(h('div', { class: 'card' },
      h('h2', {}, name),
      h('ul', { class: 'list' }, list.map((u) => {
        const r = results.get(u.id);
        return h('li', {}, h('a', { href: unitHref(u.id), class: 'row-link' },
          h('span', {}, u.thema),
          h('span', { class: 'muted small' }, r
            ? h('span', { class: 'badge ' + (r.richtig / r.gesamt >= 0.8 ? 'ok' : 'warn') }, `${Math.round((r.richtig / r.gesamt) * 100)} %`)
            : `${u.aufgaben.length} Aufgaben`)));
      }))
    ));
  }
  if (!units.length) main.append(h('div', { class: 'card note' }, h('p', {}, 'Noch keine Einheiten vorhanden.')));

  main.append(h('div', { class: 'card' },
    h('h3', {}, 'Eigenes Thema aus dem Buch'),
    h('p', { class: 'muted' }, 'Grammatikseite fotografieren, in der Claude-App eine Übungseinheit erstellen lassen und hier importieren.'),
    h('a', { class: 'btn secondary block', href: '#/grammatik/import' }, 'Einheit importieren')
  ));
}

/* =================== Einheit =================== */

async function renderUnit(main, id) {
  const u = await getUnit(id);
  if (!u) { main.append(h('p', { class: 'card' }, 'Diese Einheit gibt es nicht (mehr).')); return; }
  const r = (await lastResults()).get(u.id);
  const counts = {};
  for (const a of u.aufgaben) counts[a.typ] = (counts[a.typ] || 0) + 1;
  const regel = u.regel || {};

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik', class: 'back' }, '‹ Alle Einheiten'),
    h('h2', {}, u.thema),
    h('p', { class: 'muted small' },
      Object.entries(counts).map(([t, n]) => `${n} × ${TYPEN[t]}`).join(' · '),
      r ? ` · zuletzt ${Math.round((r.richtig / r.gesamt) * 100)} % (${formatDate(r.zeit)})` : ''),
    regel.kurz ? h('p', {}, regel.kurz) : null,
    regel.punkte && regel.punkte.length ? h('ul', { class: 'rule-list' }, regel.punkte.map((p) => h('li', {}, p))) : null,
    regel.beispiel ? h('div', { class: 'quiz-solution' },
      h('div', { class: 'latin' }, regel.beispiel.latein),
      h('div', { class: 'muted' }, regel.beispiel.deutsch)) : null,
    h('button', { class: 'btn block', onclick: () => startSession(main, u, u.aufgaben) }, 'Alle Aufgaben üben'),
    counts.uebersetzung ? h('button', {
      class: 'btn secondary block',
      onclick: () => startSession(main, u, u.aufgaben.filter((a) => a.typ === 'uebersetzung'))
    }, 'Nur Übersetzungen') : null,
    u.eingebaut ? null : h('button', {
      class: 'btn danger block',
      onclick: async () => {
        if (!(await confirmDialog('Einheit löschen?', `„${u.thema}“ wird von diesem Gerät gelöscht.`, 'Löschen', true))) return;
        await remove('grammar', u.id);
        toast('Einheit gelöscht.');
        location.hash = '#/grammatik';
      }
    }, 'Einheit löschen')
  ));
}

/* =================== Übungsrunde =================== */

/**
 * Spielt die Aufgaben nacheinander ab. Punkte: richtig 1, teilweise ½, falsch 0.
 * Fehler landen im Fehlerjournal (Store "journal", typ "grammatik").
 */
function startSession(main, unit, aufgaben) {
  window.quizActive = true;
  const started = Date.now();
  const results = [];        // { a, punkte, text }
  let pos = 0;

  async function journal(a, frage, erwartet, gegeben, bewertung) {
    await put('journal', {
      id: newId('j'), typ: 'grammatik', thema: unit.thema, einheit: unit.id,
      phaenomen: a.konstruktion || unit.thema, frage, erwartet, gegeben, bewertung,
      datum: todayStr(), zeit: new Date().toISOString()
    });
  }

  function next(punkte, text) {
    results.push({ a: aufgaben[pos], punkte, text });
    pos++;
    show();
  }

  /** Drei Knöpfe zur ehrlichen Selbstbewertung. */
  const selfButtons = (onRate) => h('div', { class: 'btn-row' },
    h('button', { class: 'btn danger', onclick: () => onRate(0) }, 'Falsch'),
    h('button', { class: 'btn secondary', onclick: () => onRate(0.5) }, 'Teilweise'),
    h('button', { class: 'btn', onclick: () => onRate(1) }, 'Richtig'));

  function show() {
    if (pos >= aufgaben.length) return finish();
    const a = aufgaben[pos];
    const body = h('div', { class: 'card' });
    main.replaceChildren(
      h('div', { class: 'quiz-top' },
        h('span', { class: 'muted' }, `${pos + 1} / ${aufgaben.length} · ${TYPEN[a.typ]}`),
        h('button', { class: 'btn secondary btn-small', onclick: finish }, 'Beenden')),
      h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((pos / aufgaben.length) * 100)}%` })),
      body);
    ({ bestimmen, luecke, auswahl, uebersetzung })[a.typ](a, body);
    window.scrollTo(0, 0);
  }

  /* ----- Bestimmen: erst selbst überlegen/tippen, dann ehrlich bewerten ----- */
  function bestimmen(a, body) {
    const input = h('input', { type: 'text', placeholder: 'Deine Antwort (optional)', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const area = h('div');
    fill(body,
      h('p', { class: 'big' }, a.frage),
      input,
      area);
    area.append(h('button', {
      class: 'btn block', style: 'margin-top:10px',
      onclick: () => fill(area,
        h('div', { class: 'quiz-solution' }, h('div', { class: 'big' }, a.antwort), a.erklaerung ? h('div', { class: 'muted' }, a.erklaerung) : null),
        h('p', { class: 'muted' }, 'Ehrlich sein: War deine Antwort vollständig richtig?'),
        selfButtons(async (p) => {
          if (p < 1) await journal(a, a.frage, a.antwort, input.value, p);
          next(p, a.frage);
        }))
    }, 'Lösung zeigen'));
  }

  /* ----- Lückentext: automatisch prüfen, Längen egal, Tippfehler selbst entscheiden ----- */
  function luecke(a, body) {
    const parts = a.text.split(/_{3,}/);
    const inputs = a.loesung.map(() => h('input', {
      type: 'text', class: 'gap latin', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false'
    }));
    const sentence = h('p', { class: 'latin gap-text' });
    parts.forEach((t, i) => { sentence.append(t); if (inputs[i]) sentence.append(inputs[i]); });
    const area = h('div');
    fill(body, a.hinweis ? h('p', { class: 'muted small' }, a.hinweis) : null, sentence, area);
    area.append(h('button', {
      class: 'btn block',
      onclick: () => {
        const res = a.loesung.map((sol, i) => checkForms({ latein: '' }, sol, inputs[i].value).result);
        inputs.forEach((inp, i) => { inp.disabled = true; inp.classList.add(res[i] === 'richtig' ? 'gap-ok' : res[i] === 'typo' ? 'gap-typo' : 'gap-bad'); });
        const allOk = res.every((x) => x === 'richtig');
        const onlyTypos = !allOk && res.every((x) => x === 'richtig' || x === 'typo');
        const solution = h('div', { class: 'quiz-solution' },
          h('div', { class: 'latin' }, 'Lösung: ', a.loesung.join(' · ')),
          a.erklaerung ? h('div', { class: 'muted' }, a.erklaerung) : null);
        const given = inputs.map((x) => x.value).join(' · ');
        if (onlyTypos) {
          fill(area, h('div', { class: 'verdict warn' }, 'Fast – Tippfehler?'), solution,
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn danger', onclick: async () => { await journal(a, a.text, a.loesung.join(' · '), given, 0); next(0, a.text); } }, 'Als falsch werten'),
              h('button', { class: 'btn', onclick: () => next(1, a.text) }, 'Als richtig werten')));
          return;
        }
        fill(area, h('div', { class: 'verdict ' + (allOk ? 'ok' : 'bad') }, allOk ? 'Richtig' : 'Falsch'), solution,
          h('button', { class: 'btn block', onclick: async () => {
            if (!allOk) await journal(a, a.text, a.loesung.join(' · '), given, 0);
            next(allOk ? 1 : 0, a.text);
          } }, 'Weiter'));
      }
    }, 'Prüfen'));
  }

  /* ----- Auswahl ----- */
  function auswahl(a, body) {
    const area = h('div');
    const buttons = a.optionen.map((o, i) => h('button', {
      class: 'btn secondary block option',
      onclick: () => {
        buttons.forEach((b, j) => {
          b.disabled = true;
          if (j === a.richtig) b.classList.add('option-ok');
          else if (j === i) b.classList.add('option-bad');
        });
        const ok = i === a.richtig;
        fill(area,
          h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad') }, ok ? 'Richtig' : 'Falsch'),
          a.erklaerung ? h('p', { class: 'muted' }, a.erklaerung) : null,
          h('button', { class: 'btn block', onclick: async () => {
            if (!ok) await journal(a, a.frage, a.optionen[a.richtig], a.optionen[i], 0);
            next(ok ? 1 : 0, a.frage);
          } }, 'Weiter'));
      }
    }, o));
    fill(body, h('p', { class: 'big' }, a.frage), ...buttons, area);
  }

  /* ----- Übersetzung: selbst übersetzen, dann Teilsatz für Teilsatz bewerten ----- */
  function uebersetzung(a, body) {
    const q = a.quelle || {};
    const bearb = BEARBEITUNG[a.bearbeitung] || BEARBEITUNG.original;
    const latin = a.teile.map((t) => t.latein).join(' ');
    const help = a.vokabelhilfen && a.vokabelhilfen.length
      ? h('details', { class: 'help' }, h('summary', {}, 'Vokabelhilfen'),
          h('ul', {}, a.vokabelhilfen.map((v) => h('li', {}, h('span', { class: 'latin' }, v.latein), ' – ', v.deutsch))))
      : null;
    const tip = a.konstruktion ? h('details', { class: 'help' }, h('summary', {}, 'Tipp: Konstruktion'), h('p', {}, a.konstruktion)) : null;
    const text = h('textarea', { rows: 4, placeholder: 'Deine Übersetzung …', autocapitalize: 'sentences' });
    const area = h('div');

    const source = a.bearbeitung === 'konstruiert'
      ? h('p', { class: 'small' }, h('span', { class: 'badge warn' }, 'eigens konstruiert'), ' – kein Originalsatz')
      : h('p', { class: 'small' },
          `${q.autor || '?'}, ${q.werk || '?'} ${q.stelle || ''} `,
          h('span', { class: 'badge ' + (q.status === 'geprüft' ? 'ok' : 'warn') }, q.status === 'geprüft' ? 'Quelle geprüft' : 'Quelle bitte prüfen'),
          ' ', h('span', { class: 'badge ' + bearb.cls }, bearb.text),
          q.link ? h('span', {}, ' · ', h('a', { href: q.link, target: '_blank', rel: 'noopener' }, 'Originaltext')) : null);

    fill(body, h('p', { class: 'latin big' }, latin), source, help, tip, text, area);
    area.append(h('button', {
      class: 'btn block', style: 'margin-top:10px',
      onclick: () => {
        text.readOnly = true;
        const ratings = new Array(a.teile.length).fill(null);
        const done = h('button', { class: 'btn block', disabled: true }, 'Weiter');
        const rows = a.teile.map((t, i) => {
          const row = h('div', { class: 'part' },
            h('div', { class: 'latin' }, t.latein),
            h('div', {}, t.deutsch),
            h('div', { class: 'part-rate' }, ['✗', '~', '✓'].map((sym, k) => h('button', {
              class: 'rate', 'aria-label': ['falsch', 'teilweise', 'richtig'][k],
              onclick: (e) => {
                ratings[i] = [0, 0.5, 1][k];
                row.querySelectorAll('.rate').forEach((b) => b.classList.remove('sel'));
                e.currentTarget.classList.add('sel');
                done.disabled = ratings.some((x) => x === null);
              }
            }, sym))));
          return row;
        });
        done.onclick = async () => {
          for (let i = 0; i < a.teile.length; i++) {
            if (ratings[i] < 1) await journal(a, a.teile[i].latein, a.teile[i].deutsch, text.value, ratings[i]);
          }
          const p = ratings.reduce((s, x) => s + x, 0) / ratings.length;
          next(p, latin);
        };
        fill(area,
          h('h3', { style: 'margin-top:12px' }, 'Musterübersetzung'),
          h('p', { class: 'muted small' }, 'Vergleiche Teil für Teil mit deiner Übersetzung: ✓ richtig · ~ teilweise · ✗ falsch. Andere Formulierungen sind okay, wenn Sinn und Grammatik stimmen.'),
          ...rows,
          a.konstruktion ? h('p', { class: 'small' }, h('b', {}, 'Konstruktion: '), a.konstruktion) : null,
          done);
      }
    }, 'Musterübersetzung zeigen'));
  }

  async function finish() {
    window.quizActive = false;
    const sec = (Date.now() - started) / 1000;
    await logSeconds(Math.min(sec, aufgaben.length * 240));
    const total = results.length;
    const points = results.reduce((s, r) => s + r.punkte, 0);
    if (total) await saveResult(unit, points, total, sec);
    const weak = results.filter((r) => r.punkte < 1);
    main.replaceChildren(
      h('div', { class: 'card' },
        h('h2', {}, 'Einheit beendet'),
        total ? h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', {}, total), h('span', {}, 'Aufgaben')),
          h('div', { class: 'stat' }, h('b', {}, String(points).replace('.', ',')), h('span', {}, 'Punkte')),
          h('div', { class: 'stat' }, h('b', {}, Math.round((points / total) * 100) + ' %'), h('span', {}, 'Quote'))
        ) : h('p', {}, 'Keine Aufgabe bearbeitet.'),
        weak.length ? h('p', { class: 'muted', style: 'margin-top:12px' },
          `${weak.length} Aufgaben waren nicht ganz richtig – sie stehen im Fehlerjournal.`) : null),
      weak.length ? h('div', { class: 'card' }, h('h3', {}, 'Nicht ganz richtig'),
        h('ul', { class: 'list' }, weak.map((r) => h('li', {}, h('span', { class: 'badge' }, TYPEN[r.a.typ]), ' ', h('span', { class: 'latin' }, r.text))))) : null,
      weak.length ? h('button', { class: 'btn secondary block', onclick: () => startSession(main, unit, weak.map((r) => r.a)) }, 'Diese nochmal üben') : '',
      h('a', { class: 'btn block', href: unitHref(unit.id) }, 'Fertig'));
    window.scrollTo(0, 0);
  }

  show();
}

/* =================== Import =================== */

async function renderImport(main) {
  const fallback = h('div');
  main.append(h('div', { class: 'card' },
    h('a', { href: '#/grammatik', class: 'back' }, '‹ Alle Einheiten'),
    h('h2', {}, '1. Prompt holen'),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        const t = buildGrammarPrompt();
        if (await copyText(t)) { toast('Prompt kopiert. Jetzt in der Claude-App mit dem Foto einfügen.', 4000); fallback.replaceChildren(); }
        else fallback.replaceChildren(h('p', { class: 'muted' }, 'Kopieren hat nicht geklappt – bitte markieren und kopieren:'), h('textarea', { rows: 8, readonly: true }, t));
      }
    }, 'Prompt kopieren'),
    fallback,
    h('p', { class: 'muted' }, 'In der Claude-App: Foto der Grammatikseite anhängen, Prompt einfügen, senden, Antwort kopieren.')
    // TODO Meilenstein 4: Link zu docs/workflow_grammatik.html + workflow_grammatik.pdf ergänzen
  ));

  const input = h('textarea', { rows: 6, placeholder: 'Antwort von Claude hier einfügen …', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const preview = h('div');
  main.append(h('div', { class: 'card' },
    h('h2', {}, '2. Ergebnis einfügen'),
    input,
    h('button', { class: 'btn block', style: 'margin-top:10px', onclick: check }, 'Prüfen')
  ), preview);

  function check() {
    preview.replaceChildren();
    let obj;
    try { obj = extractJson(input.value); }
    catch (err) { preview.append(h('div', { class: 'card warn' }, h('h3', {}, 'Konnte nicht gelesen werden'), h('p', {}, err.message))); return; }
    const res = checkUnit(obj);
    if (res.errors.length) {
      preview.append(h('div', { class: 'card warn' }, h('h3', {}, 'Import nicht möglich'), h('ul', {}, res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    const u = res.unit;
    const counts = {};
    for (const a of u.aufgaben) counts[a.typ] = (counts[a.typ] || 0) + 1;
    preview.append(h('div', { class: 'card' },
      h('h2', {}, '3. Vorschau'),
      h('p', {}, h('b', {}, u.thema)),
      h('p', { class: 'muted' }, Object.entries(counts).map(([t, n]) => `${n} × ${TYPEN[t]}`).join(' · ')),
      res.warnings.map((w) => h('div', { class: 'msg warn', style: 'margin-left:0' }, w)),
      h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Tipp: Prüfe bei den Übersetzungssätzen mit „Quelle bitte prüfen“ die Stelle über den Link, bevor du dich auf die Quellenangabe verlässt.'),
      h('button', {
        class: 'btn block',
        onclick: async () => {
          const rec = await saveUnit(u);
          toast('Einheit gespeichert.');
          location.hash = unitHref(rec.id);
        }
      }, 'Einheit speichern')
    ));
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
