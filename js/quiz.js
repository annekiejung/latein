/*
 * Eine Abfrage-Runde (Vokabeln): eine Karte nach der anderen.
 *
 * startQuiz(main, { cards, mode, style, leitner, onDone })
 *   mode:    'bedeutung' (Latein → Deutsch) | 'formen'
 *   style:   'karte' (aufdecken + selbst bewerten) | 'eingabe' (tippen, App prüft)
 *   leitner: true  = Antworten verändern die Fächer (fällige Karten)
 *            false = freies Üben, Fächer bleiben unverändert
 *
 * Falsch beantwortete Karten kommen am Ende der Runde noch einmal dran
 * (höchstens 3-mal). Für Fach und Statistik zählt nur die ERSTE Antwort.
 */
import { put, newId, getSetting } from './db.js';
import { h, todayStr } from './ui.js';
import { headline, formQuestion } from './vocab.js';
import { checkMeaning, checkForms, normDe } from './check.js';
import { MODES, stateOf, review, daysToTest, getTestTermine, logAnswer, logSeconds, streakInfo } from './leitner.js';

const MAX_REPEATS = 3;
const MAX_SECONDS_PER_CARD = 90;   // längere Pausen zählen nicht als Lernzeit

/** Wie replaceChildren, lässt aber leere Teile (null/false) weg. */
const fill = (el, ...parts) => el.replaceChildren(...parts.filter(Boolean));

export async function startQuiz(main, { cards, mode, style, leitner, onDone }) {
  const intervals = await getSetting('leitnerIntervals');
  const testTermine = await getTestTermine();
  const today = todayStr();

  // Warteschlange: { card, rep: 0 = erste Abfrage, >0 = Wiederholung }
  const queue = cards.map((card) => ({ card, rep: 0 }));
  const firstTotal = queue.length;
  const results = [];          // nur erste Antworten: { card, correct, given, vorher, nachher }
  let pos = 0;
  let seconds = 0;
  let shownAt = Date.now();

  const addTime = () => {
    seconds += Math.min(MAX_SECONDS_PER_CARD, (Date.now() - shownAt) / 1000);
  };

  function showCard() {
    if (pos >= queue.length) return finish();
    const item = queue[pos];
    const c = item.card;
    const fq = mode === 'formen' ? formQuestion(c) : null;
    const state = stateOf(c, mode);
    shownAt = Date.now();

    const done = results.length;
    const header = h('div', { class: 'quiz-top' },
      h('span', { class: 'muted' }, item.rep ? 'Wiederholung' : `${Math.min(done + 1, firstTotal)} / ${firstTotal}`),
      h('button', { class: 'btn secondary btn-small', onclick: () => { addTime(); finish(); } }, 'Beenden')
    );
    const bar = h('div', { class: 'progress' },
      h('span', { style: `width:${Math.round((done / firstTotal) * 100)}%` }));

    const meta = h('div', { class: 'quiz-meta' },
      h('span', { class: 'badge' }, c.lektion),
      leitner ? h('span', { class: 'badge' }, `Fach ${state.fach}`) : h('span', { class: 'badge' }, 'freies Üben'),
      c.unsicher ? h('span', { class: 'badge warn' }, 'Karte noch ungeprüft') : null
    );

    const question = h('div', { class: 'quiz-card' },
      h('div', { class: 'quiz-latin latin' }, mode === 'formen' ? c.latein : headline(c)),
      h('div', { class: 'muted' }, mode === 'formen' ? fq.frage.replace(/\??$/, '?') : 'Was bedeutet das?')
    );

    const answerArea = h('div', { class: 'quiz-answer' });
    main.replaceChildren(header, bar, h('div', { class: 'card' }, meta, question, answerArea));

    if (style === 'eingabe') {
      const input = h('input', {
        type: 'text', class: mode === 'formen' ? 'latin' : '',
        placeholder: mode === 'formen' ? 'z. B. ' + exampleFor(c) : 'Deutsche Bedeutung(en), mit Komma getrennt',
        autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false',
        enterkeyhint: 'done'
      });
      const submit = () => {
        const val = input.value;
        if (!val.trim()) { input.focus(); return; }
        evaluateTyped(item, fq, val, answerArea);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      answerArea.append(
        input,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: submit }, 'Prüfen'),
          h('button', { class: 'btn secondary', onclick: () => grade(item, false, '(weiß ich nicht)', answerArea, fq) }, 'Weiß ich nicht')
        )
      );
      input.focus();
    } else {
      answerArea.append(h('button', {
        class: 'btn block',
        onclick: () => {
          answerArea.replaceChildren(
            solution(c, fq),
            h('p', { class: 'muted' }, 'Ehrlich sein: Wusstest du es vollständig?'),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn danger', onclick: () => grade(item, false, '(Karteikarte)', answerArea, fq, true) }, 'Nicht gewusst'),
              h('button', { class: 'btn', onclick: () => grade(item, true, '(Karteikarte)', answerArea, fq, true) }, 'Gewusst')
            )
          );
        }
      }, 'Aufdecken'));
    }
  }

  /** Beispiel für das Eingabefeld bei Formen (ohne die Lösung zu verraten). */
  function exampleFor(c) {
    return { nomen: 'moris m', verb: 'mitto, misi, missum', adjektiv: 'acer, acris, acre', praeposition: 'Akk.' }[c.wortart] || '';
  }

  /** Bedeutungen der Karte, die in der Antwort NICHT vorkamen. */
  function missingMeanings(c, parts) {
    const hit = new Set(parts.map((p) => p.match).filter(Boolean));
    return c.bedeutungen.filter((m) => {
      const forms = [normDe(m), ...m.split(/[,;/]/).map(normDe)].filter(Boolean);
      return !forms.some((f) => hit.has(f));
    });
  }

  /** Die richtige Lösung als Block. */
  function solution(c, fq) {
    if (mode === 'formen') {
      return h('div', { class: 'quiz-solution' },
        h('div', { class: 'latin big' }, fq.antwort),
        c.hinweis ? h('div', { class: 'muted' }, c.hinweis) : null);
    }
    return h('div', { class: 'quiz-solution' },
      h('div', { class: 'big' }, c.bedeutungen.join(', ')),
      c.hinweis ? h('div', { class: 'muted' }, c.hinweis) : null);
  }

  /** Getippte Antwort auswerten und Ergebnis zeigen. */
  function evaluateTyped(item, fq, val, area) {
    const c = item.card;
    const res = mode === 'formen' ? checkForms(c, fq.antwort, val) : checkMeaning(c, val);
    const given = h('p', {}, 'Deine Antwort: ', h('b', { class: mode === 'formen' ? 'latin' : '' }, val));

    // Bei Bedeutungen: jede genannte Bedeutung einzeln markieren
    const partList = mode === 'bedeutung' && res.parts && res.parts.length > 1
      ? h('ul', { class: 'parts' }, res.parts.map((p) => h('li', { class: 'part-' + p.status },
          p.given, ' – ', p.status === 'ok' ? 'richtig' : p.status === 'typo' ? `Tippfehler? (gemeint: „${p.match}“)` : 'falsch')))
      : null;

    if (res.result === 'typo') {
      const hintText = mode === 'bedeutung' && res.parts
        ? res.parts.filter((p) => p.status === 'typo').map((p) => `„${p.given}“ ≈ „${p.match}“`).join(', ')
        : 'Ein Buchstabe weicht ab.';
      const why = mode === 'formen'
        ? ' Bei Latein kann ein Buchstabe die Form ändern – entscheide ehrlich.'
        : ' Hast du wirklich dieses Wort gemeint? Entscheide ehrlich.';
      fill(area,
        h('div', { class: 'verdict warn' }, 'Fast – Tippfehler?'),
        given, partList,
        h('p', { class: 'muted' }, hintText + why),
        solution(c, fq),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', onclick: () => grade(item, false, val, area, fq, true) }, 'Als falsch werten'),
          h('button', { class: 'btn', onclick: () => grade(item, true, val, area, fq, true) }, 'Als richtig werten')
        )
      );
      return;
    }
    const correct = res.result === 'richtig';
    // Richtig mit nur einem Teil der Bedeutungen → die übrigen als Feedback nennen
    const rest = correct && mode === 'bedeutung' ? missingMeanings(c, res.parts) : [];
    fill(area,
      h('div', { class: 'verdict ' + (correct ? 'ok' : 'bad') }, correct ? 'Richtig' : 'Falsch'),
      given, partList,
      correct && mode === 'bedeutung'
        ? (rest.length
            ? h('div', { class: 'quiz-solution' },
                h('div', { class: 'muted small' }, 'Weitere Bedeutungen:'),
                h('div', { class: 'big' }, rest.join(', ')),
                c.hinweis ? h('div', { class: 'muted' }, c.hinweis) : null)
            : (c.hinweis ? h('p', { class: 'muted' }, c.hinweis) : null))
        : solution(c, fq)
    );
    grade(item, correct, val, area, fq, false);
  }

  /**
   * Antwort verbuchen. showNext=true → direkt weiter; sonst "Weiter"-Knopf anhängen.
   */
  async function grade(item, correct, given, area, fq, immediate = false) {
    addTime();
    const c = item.card;
    if (item.rep === 0) {
      const key = MODES[mode];
      const before = stateOf(c, mode);
      let after = before;
      if (leitner) {
        after = review(before, correct, intervals, daysToTest(c, testTermine, today), today);
        c[key] = after;
        await put('vocab', c);
      }
      await logAnswer(correct, today);
      results.push({ card: c, correct, given, vorher: before.fach, nachher: after.fach });
      if (!correct) {
        await put('journal', {
          id: newId('j'), typ: 'vokabel', modus: mode, karteId: c.id, lektion: c.lektion,
          frage: mode === 'formen' ? `${c.latein}: ${fq.frage}` : headline(c),
          erwartet: mode === 'formen' ? fq.antwort : c.bedeutungen.join(', '),
          gegeben: given, datum: today, zeit: new Date().toISOString()
        });
      }
    }
    if (!correct && item.rep < MAX_REPEATS) queue.push({ card: c, rep: item.rep + 1 });
    pos++;

    if (immediate) { showCard(); return; }
    // "Weiter" nach dem Ergebnis der Eingabe
    const next = h('button', { class: 'btn block', onclick: showCard }, 'Weiter');
    // Bei Eingabe ohne Tippfehler-Frage wurde grade() direkt aufgerufen → Weiter-Knopf anhängen
    if (style === 'eingabe' && given !== '(weiß ich nicht)') { area.append(next); next.focus(); return; }
    // "Weiß ich nicht": Lösung zeigen, dann weiter
    area.replaceChildren(h('div', { class: 'verdict bad' }, 'Nicht gewusst'), solution(c, fq), next);
    next.focus();
  }

  async function finish() {
    await logSeconds(seconds, today);
    const right = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => !r.correct);
    const up = results.filter((r) => r.nachher > r.vorher).length;
    const karten = (n) => (n === 1 ? '1 Karte' : `${n} Karten`);
    const s = await streakInfo(today);

    const summary = h('div', { class: 'card' },
      h('h2', {}, 'Runde beendet'),
      results.length === 0 ? h('p', {}, 'Keine Karte beantwortet.') : h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', {}, right), h('span', {}, 'richtig')),
        h('div', { class: 'stat' }, h('b', {}, wrong.length), h('span', {}, 'falsch')),
        h('div', { class: 'stat' }, h('b', {}, Math.round((right / results.length) * 100) + ' %'), h('span', {}, 'Quote'))
      ),
      leitner && results.length ? h('p', { class: 'muted', style: 'margin-top:12px' },
        `${karten(up)} ein Fach höher, ${karten(wrong.length)} (wieder) in Fach 1.`) : null,
      !leitner && results.length ? h('p', { class: 'muted', style: 'margin-top:12px' },
        'Freies Üben – die Fächer wurden nicht verändert.') : null,
      h('p', {}, s.todayReached
        ? `Tagesziel erreicht (${s.todayDone}/${s.goal}). Serie: ${s.streak} ${s.streak === 1 ? 'Tag' : 'Tage'}.`
        : `Tagesziel: ${s.todayDone} von ${s.goal} Karten.`)
    );

    const wrongList = wrong.length ? h('div', { class: 'card' },
      h('h3', {}, 'Diese solltest du dir noch einmal ansehen'),
      h('ul', { class: 'list' }, wrong.map((r) => h('li', {},
        h('div', { class: 'latin' }, mode === 'formen' ? r.card.latein : headline(r.card)),
        h('div', {}, mode === 'formen' ? formQuestion(r.card).antwort : r.card.bedeutungen.join(', ')),
        r.given && !r.given.startsWith('(') ? h('div', { class: 'muted small' }, 'Deine Antwort: ' + r.given) : null
      )))
    ) : null;

    main.replaceChildren(summary, wrongList || '',
      wrong.length ? h('button', {
        class: 'btn secondary block',
        onclick: () => startQuiz(main, { cards: wrong.map((r) => r.card), mode, style, leitner: false, onDone })
      }, 'Die falschen nochmal üben (freies Üben)') : '',
      h('button', { class: 'btn block', onclick: onDone }, 'Fertig'));
    window.scrollTo(0, 0);
  }

  showCard();
}
