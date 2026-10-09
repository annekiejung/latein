/*
 * Prüfungsmodus: Übersetzung (~100 Wörter) unter Klassenarbeitsbedingungen.
 *   #/pruefung                 Textauswahl, laufender Versuch, frühere Versuche
 *   #/pruefung/text/<id>       Text-Steckbrief, Zeitlimit + Art wählen, starten
 *   #/pruefung/laeuft          Prüfung: Text, Hilfsvokabeln, Uhr, Eingabe
 *   #/pruefung/versuch/<id>    Nach dem Abgeben: Prüf-Prompt, Bewertung einfügen/anzeigen, Musterübersetzung
 * Logik/Format: js/exam.js
 */
import { getSetting, setSetting } from '../db.js';
import { h, toast, confirmDialog, formatDate, copyText } from '../ui.js';
import { extractJson } from '../vocab.js';
import { logSeconds } from '../leitner.js';
import {
  loadTexts, getText, startAttempt, runningAttempt, saveDraft, finishAttempt, discardAttempt,
  getAttempt, attempts, clock, LIMITS,
  buildExamPrompt, checkReview, saveReview, score, KATEGORIEN
} from '../exam.js';

export const title = 'Prüfungsmodus';

export async function render(main, params) {
  const [sub, arg] = params;
  if (sub === 'text' && arg) return renderText(main, decodeURIComponent(arg));
  if (sub === 'laeuft') return renderExam(main);
  if (sub === 'versuch' && arg) return renderAttempt(main, decodeURIComponent(arg));
  return renderList(main);
}

const textHref = (id) => '#/pruefung/text/' + encodeURIComponent(id);
const attemptHref = (id) => '#/pruefung/versuch/' + encodeURIComponent(id);
const source = (q = {}) => `${q.autor || '?'}, ${q.werk || '?'} ${q.stelle || ''}`.trim();
const minutes = (sec) => Math.max(1, Math.round(sec / 60)) + ' min';

/** Badges für Quellenstatus und Bearbeitung. */
function sourceBadges(t) {
  const q = t.quelle || {};
  return [
    h('span', { class: 'badge ' + (q.status === 'geprüft' ? 'ok' : 'warn') }, q.status === 'geprüft' ? 'Quelle geprüft' : 'Quelle bitte prüfen'),
    ' ',
    h('span', { class: 'badge ' + (t.bearbeitung === 'original' ? 'ok' : '') },
      t.bearbeitung === 'gekürzt' ? 'gekürzt' : t.bearbeitung === 'angepasst' ? 'angepasst' : 'Originaltext')
  ];
}

/* =================== Liste =================== */

async function renderList(main) {
  const running = await runningAttempt();
  if (running) {
    main.append(h('div', { class: 'card note' },
      h('h3', {}, 'Prüfung läuft'),
      h('p', {}, `„${running.titel}“ – begonnen ${new Date(running.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Die Zeit läuft weiter.`),
      h('a', { class: 'btn block', href: '#/pruefung/laeuft' }, 'Weiterschreiben')));
  }

  const texts = await loadTexts();
  const done = await attempts();
  const lastByText = new Map();
  for (const a of done) if (!lastByText.has(a.textId)) lastByText.set(a.textId, a);

  main.append(h('div', { class: 'card' },
    h('h2', {}, 'Text wählen'),
    h('p', { class: 'muted small' }, 'Originaltexte mit etwa 100 Wörtern, Hilfsvokabeln wie in der Klassenarbeit. Den lateinischen Text siehst du erst, wenn die Uhr läuft.'),
    h('ul', { class: 'list' }, texts.map((t) => {
      const last = lastByText.get(t.id);
      return h('li', {}, h('a', { href: textHref(t.id), class: 'row-link' },
        h('span', {}, h('b', {}, t.quelle.autor), ' · ', t.titel,
          h('br'), h('span', { class: 'muted small' }, `${t.woerter} Wörter · ${t.niveau || 'mittel'}`)),
        h('span', { class: 'muted small' }, last ? 'zuletzt ' + formatDate(last.start) : '')));
    }))));

  if (done.length) {
    main.append(h('div', { class: 'card' },
      h('h2', {}, 'Deine Versuche'),
      h('ul', { class: 'list' }, done.slice(0, 20).map((a) => h('li', {}, h('a', { href: attemptHref(a.id), class: 'row-link' },
        h('span', {}, a.titel, h('br'), h('span', { class: 'muted small' }, `${formatDate(a.start)} · ${minutes(a.sekunden)}`)),
        h('span', { class: 'badge ' + (a.bewertung ? 'ok' : 'warn') }, a.bewertung ? 'Note ' + a.bewertung.note : 'nicht bewertet')))))));
  }
}

/* =================== Steckbrief + Start =================== */

async function renderText(main, id) {
  const t = await getText(id);
  if (!t) { main.append(h('p', { class: 'card' }, 'Diesen Text gibt es nicht (mehr).')); return; }
  const prefs = { limit: 45, modus: 'tippen', ...((await getSetting('pruefungPrefs')) || {}) };

  /** Auswahlknöpfe (eine Option aktiv). */
  const choice = (options, current, onPick) => {
    const btns = options.map(([value, label]) => h('button', {
      class: 'btn btn-small ' + (value === current ? '' : 'secondary'),
      onclick: () => { btns.forEach((b) => b.classList.add('secondary')); btn(value).classList.remove('secondary'); onPick(value); }
    }, label));
    const btn = (v) => btns[options.findIndex(([x]) => x === v)];
    return h('div', { class: 'btn-row' }, btns);
  };

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/pruefung', class: 'back' }, '‹ Alle Texte'),
    h('h2', {}, t.titel),
    h('p', { class: 'small' }, source(t.quelle), ' · ', `${t.woerter} Wörter · ${t.niveau || 'mittel'}`),
    h('p', { class: 'small' }, sourceBadges(t)),
    t.einleitung ? h('p', {}, t.einleitung) : null,
    t.schwerpunkte && t.schwerpunkte.length ? h('details', { class: 'help' },
      h('summary', {}, 'Grammatik-Schwerpunkte (verrät Konstruktionen)'),
      h('p', {}, t.schwerpunkte.join(' · '))) : null),
  h('div', { class: 'card' },
    h('h3', {}, 'Zeitlimit'),
    choice(LIMITS.map((m) => [m, m ? m + ' min' : 'ohne']), prefs.limit, (v) => { prefs.limit = v; }),
    h('h3', { style: 'margin-top:14px' }, 'Wie schreibst du?'),
    choice([['tippen', 'In der App tippen'], ['papier', 'Auf Papier']], prefs.modus, (v) => { prefs.modus = v; }),
    h('p', { class: 'muted small', style: 'margin-top:10px' },
      'Die Zeit läuft weiter, auch wenn du die App schließt – wie in einer echten Klassenarbeit. Dein Text wird laufend gespeichert.'),
    h('button', {
      class: 'btn block', style: 'margin-top:6px',
      onclick: async () => {
        const running = await runningAttempt();
        if (running) {
          const ok = await confirmDialog('Es läuft schon eine Prüfung',
            `„${running.titel}“ ist noch nicht abgegeben. Verwerfen und neu starten?`, 'Verwerfen', true);
          if (!ok) return;
          await discardAttempt(running);
        }
        await setSetting('pruefungPrefs', prefs);
        await startAttempt(t, prefs.limit, prefs.modus);
        location.hash = '#/pruefung/laeuft';
      }
    }, 'Prüfung starten')));
}

/* =================== Prüfung läuft =================== */

async function renderExam(main) {
  const rec = await runningAttempt();
  if (!rec) { location.replace('#/pruefung'); return; }
  const t = await getText(rec.textId);
  if (!t) { main.append(h('p', { class: 'card warn' }, 'Der Text dieser Prüfung fehlt.')); return; }
  window.quizActive = true;               // keine automatische Aktualisierung mitten in der Prüfung

  const limit = rec.limitMin * 60;
  const timer = h('span', { class: 'timer' });
  let warned = false;

  // Zwischenspeichern: kurz nach dem Tippen und beim Verlassen der Seite
  let dirty = false;
  let saveTimer;
  const flush = async () => { clearTimeout(saveTimer); if (dirty) { dirty = false; await saveDraft(rec); } };

  const input = rec.modus === 'tippen'
    ? h('textarea', {
        class: 'exam-input', rows: 12, placeholder: 'Deine Übersetzung …', autocapitalize: 'sentences',
        oninput: (e) => { rec.uebersetzung = e.target.value; dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600); }
      })
    : null;
  if (input) input.value = rec.uebersetzung || '';

  function tick() {
    if (!timer.isConnected) {
      clearInterval(iv); flush(); window.quizActive = false;
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      return;
    }
    const elapsed = (Date.now() - Date.parse(rec.start)) / 1000;
    if (!limit) { timer.textContent = clock(elapsed); return; }
    const rest = limit - elapsed;
    timer.textContent = rest >= 0 ? clock(rest) : '+' + clock(-rest);
    timer.classList.toggle('timer-warn', rest < 300 && rest >= 0);
    timer.classList.toggle('timer-over', rest < 0);
    if (rest < 0 && !warned) { warned = true; toast('Die Zeit ist um. Gib jetzt ab – die Überziehung wird vermerkt.', 5000); }
  }
  const iv = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);

  async function handIn() {
    if (input && !input.value.trim()) {
      if (!(await confirmDialog('Leere Übersetzung', 'Du hast noch nichts eingetippt. Trotzdem abgeben?', 'Abgeben'))) return;
    } else if (!(await confirmDialog('Abgeben?', 'Danach kannst du die Übersetzung nicht mehr ändern.', 'Abgeben'))) return;
    if (input) rec.uebersetzung = input.value;
    dirty = false;
    await finishAttempt(rec);
    await logSeconds(Math.min(rec.sekunden, 3 * 3600));
    window.quizActive = false;
    location.hash = attemptHref(rec.id);
  }

  main.append(
    h('div', { class: 'quiz-top exam-top' },
      h('span', {}, rec.limitMin ? 'Restzeit ' : 'Zeit ', timer),
      h('button', { class: 'btn btn-small', onclick: handIn }, 'Abgeben')),
    h('div', { class: 'card' },
      h('h2', {}, t.titel),
      t.einleitung ? h('p', { class: 'muted' }, t.einleitung) : null,
      h('div', { class: 'latin exam-text' }, t.text),
      h('p', { class: 'small muted' }, source(t.quelle))),
    t.vokabelhilfen && t.vokabelhilfen.length ? h('div', { class: 'card' },
      h('h3', {}, 'Hilfen'),
      h('ul', { class: 'vocab-help' }, t.vokabelhilfen.map((v) =>
        h('li', {}, h('span', { class: 'latin' }, v.latein), ' – ', v.deutsch)))) : null,
    input
      ? h('div', { class: 'card' }, h('h3', {}, 'Deine Übersetzung'), input,
          h('p', { class: 'muted small' }, 'Wird automatisch gespeichert.'))
      : h('div', { class: 'card note' }, h('h3', {}, 'Auf Papier'),
          h('p', {}, 'Schreib deine Übersetzung auf Papier. Tippe oben auf „Abgeben“, wenn du fertig bist. Danach fotografierst du das Blatt für die Bewertung in der Claude-App.')),
    h('button', {
      class: 'btn danger block',
      onclick: async () => {
        if (!(await confirmDialog('Prüfung abbrechen?', 'Der Versuch wird gelöscht und zählt nicht.', 'Abbrechen und löschen', true))) return;
        clearInterval(iv);
        dirty = false;
        await discardAttempt(rec);
        window.quizActive = false;
        location.hash = '#/pruefung';
      }
    }, 'Prüfung abbrechen'));
  tick();
}

/* =================== Nach dem Abgeben =================== */

const comma = (n) => String(n).replace('.', ',');

async function renderAttempt(main, id) {
  const a = await getAttempt(id);
  if (!a) { main.append(h('p', { class: 'card' }, 'Diesen Versuch gibt es nicht (mehr).')); return; }
  const t = await getText(a.textId);
  const schluessel = await getSetting('notenschluessel');
  const over = a.limitMin ? a.sekunden - a.limitMin * 60 : 0;

  main.append(h('div', { class: 'card' },
    h('a', { href: '#/pruefung', class: 'back' }, '‹ Prüfungsmodus'),
    h('h2', {}, a.titel),
    h('p', { class: 'small' }, source(a.quelle), ' · ', formatDate(a.start)),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, a.woerter), h('span', {}, 'Wörter')),
      h('div', { class: 'stat' }, h('b', {}, minutes(a.sekunden)), h('span', {}, 'gebraucht')),
      h('div', { class: 'stat' }, h('b', {}, a.limitMin ? a.limitMin + ' min' : '–'), h('span', {}, 'Zeitlimit'))),
    over > 30 ? h('p', { class: 'msg bad', style: 'margin-left:0' }, `Zeitlimit um ${minutes(over)} überzogen.`) : null),
  a.modus === 'tippen'
    ? h('div', { class: 'card' }, h('h3', {}, 'Deine Übersetzung'),
        a.uebersetzung.trim() ? h('p', { class: 'pre' }, a.uebersetzung) : h('p', { class: 'muted' }, '(leer)'))
    : h('div', { class: 'card' }, h('h3', {}, 'Deine Übersetzung'), h('p', { class: 'muted' }, 'Auf Papier geschrieben.')));

  const importArea = h('div');
  if (a.bewertung) {
    main.append(renderReview(a));
    main.append(h('button', {
      class: 'btn secondary block',
      onclick: (e) => { e.currentTarget.remove(); importArea.append(reviewImport(a, t, schluessel)); importArea.scrollIntoView({ behavior: 'smooth' }); }
    }, 'Bewertung neu einfügen'));
  } else if (t) {
    importArea.append(reviewImport(a, t, schluessel));
  }
  main.append(importArea);

  if (t) {
    main.append(h('div', { class: 'card' },
      h('details', { class: 'help' },
        h('summary', {}, 'Musterübersetzung anzeigen'),
        a.bewertung ? null : h('p', { class: 'muted small' }, 'Tipp: Erst bewerten lassen, dann vergleichen – sonst „korrigierst“ du im Kopf schon mit.'),
        h('p', { class: 'latin exam-text' }, t.text),
        h('p', {}, t.musteruebersetzung))));
  }
}

/** Gespeicherte Bewertung anzeigen. */
function renderReview(a) {
  const b = a.bewertung;
  const counts = {};
  for (const f of b.fehler) counts[f.kategorie] = (counts[f.kategorie] || 0) + f.gewicht;
  return h('div', { class: 'card' },
    h('h2', {}, 'Bewertung'),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, comma(b.punkte)), h('span', {}, 'Fehlerpunkte')),
      h('div', { class: 'stat' }, h('b', {}, comma(b.fq)), h('span', {}, 'pro 100 Wörter')),
      h('div', { class: 'stat' }, h('b', {}, b.note), h('span', {}, 'Note (Einschätzung)'))),
    h('p', { class: 'muted small', style: 'margin-top:8px' },
      'Die App rechnet die Note selbst aus den Fehlern nach deinem Notenschlüssel (Einstellungen). Deine Lehrkraft kann anders werten.',
      b.noteClaude && b.noteClaude !== b.note ? ` Claude hatte ${b.noteClaude} geschätzt.` : ''),
    Object.keys(counts).length ? h('p', {}, Object.entries(counts).map(([k, n]) =>
      h('span', { class: 'badge', style: 'margin:0 6px 6px 0' }, `${KATEGORIEN[k]} ${comma(n)}`))) : null,
    b.gesamturteil ? h('p', {}, b.gesamturteil) : null,
    b.staerken.length ? h('div', {}, h('h3', {}, 'Stärken'), h('ul', {}, b.staerken.map((s) => h('li', {}, s)))) : null,
    b.tipps.length ? h('div', {}, h('h3', {}, 'Das solltest du üben'), h('ul', {}, b.tipps.map((s) => h('li', {}, s)))) : null,
    b.fehler.length ? h('div', {}, h('h3', {}, `Fehler (${b.fehler.length})`),
      b.fehler.map((f) => h('div', { class: 'part' },
        h('div', {}, h('span', { class: 'badge ' + (f.gewicht >= 1 ? 'bad' : 'warn') },
          `${KATEGORIEN[f.kategorie]} · ${comma(f.gewicht)}`), ' ', f.phaenomen ? h('span', { class: 'muted small' }, f.phaenomen) : null),
        f.latein ? h('div', { class: 'latin' }, f.latein) : null,
        f.deine ? h('div', { class: 'small' }, 'Du: ', h('span', { class: 'part-falsch' }, f.deine)) : null,
        f.richtig ? h('div', { class: 'small' }, 'Richtig: ', h('span', { class: 'part-ok' }, f.richtig)) : null,
        f.erklaerung ? h('div', { class: 'muted small' }, f.erklaerung) : null)))
      : h('p', {}, 'Keine Fehler gefunden.'),
    b.unleserlich.length ? h('p', { class: 'msg warn', style: 'margin-left:0' }, 'Nicht sicher lesbar (nicht gewertet): ', b.unleserlich.join(' · ')) : null,
    h('p', { class: 'muted small' }, 'Alle Fehler stehen auch im Fehlerjournal.'));
}

/** Prompt kopieren → Bewertung einfügen → prüfen → speichern. */
function reviewImport(a, t, schluessel) {
  const fallback = h('div');
  const input = h('textarea', { rows: 6, placeholder: 'Antwort von Claude hier einfügen …', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const preview = h('div');

  function check() {
    preview.replaceChildren();
    let obj;
    try { obj = extractJson(input.value); }
    catch (err) { preview.append(h('div', { class: 'msg bad', style: 'margin-left:0' }, err.message)); return; }
    const res = checkReview(obj, a);
    if (res.errors.length) {
      preview.append(h('div', { class: 'card warn' }, h('h3', {}, 'Einfügen nicht möglich'), h('ul', {}, res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    const s = score(res.review.fehler, a.woerter, schluessel);
    preview.append(
      h('h3', { style: 'margin-top:12px' }, 'Vorschau'),
      h('p', {}, `${res.review.fehler.length} Fehler · ${comma(s.punkte)} Fehlerpunkte · ${comma(s.fq)} pro 100 Wörter → Note ${s.note}`),
      ...res.warnings.map((w) => h('div', { class: 'msg warn', style: 'margin-left:0' }, w)),
      h('button', {
        class: 'btn block', style: 'margin-top:10px',
        onclick: async () => {
          await saveReview(a, res.review, schluessel);
          toast('Bewertung gespeichert – Fehler stehen im Fehlerjournal.', 3500);
          location.hash = attemptHref(a.id) + '?' + Date.now();
        }
      }, 'Bewertung speichern'));
  }

  return h('div', { class: 'card' },
    h('h2', {}, 'Bewertung mit Claude'),
    h('p', { class: 'muted small' }, 'Dafür brauchst du Internet und die Claude-App. Die Prüf-App selbst bleibt offline.'),
    h('h3', {}, '1. Prompt kopieren'),
    h('button', {
      class: 'btn block',
      onclick: async () => {
        const p = buildExamPrompt(a, t, schluessel);
        if (await copyText(p)) { toast('Prompt kopiert. Jetzt in der Claude-App einfügen.', 4000); fallback.replaceChildren(); }
        else fallback.replaceChildren(h('p', { class: 'muted' }, 'Kopieren hat nicht geklappt – bitte markieren und kopieren:'), h('textarea', { rows: 8, readonly: true }, p));
      }
    }, 'Prüf-Prompt kopieren'),
    fallback,
    h('p', { class: 'small' }, a.modus === 'papier'
      ? 'In der Claude-App: neuen Chat öffnen, Foto deines Blatts anhängen (gerade, hell, alles lesbar), Prompt einfügen, senden.'
      : 'In der Claude-App: neuen Chat öffnen, Prompt einfügen, senden.'),
    h('h3', {}, '2. Antwort einfügen'),
    h('p', { class: 'small' }, 'Lies die Korrektur in Ruhe. Kopiere dann die ganze Antwort (oder nur den Block am Ende) und füge sie hier ein.'),
    input,
    h('button', { class: 'btn block', style: 'margin-top:10px', onclick: check }, 'Prüfen'),
    preview);
}
