/*
 * Kleine Helfer für die Oberfläche: Elemente bauen, Meldungen, Dialoge.
 */

/**
 * Baut ein HTML-Element.
 *   h('p', { class: 'muted' }, 'Text', h('b', {}, 'fett'))
 * Attribute, die mit "on" beginnen, werden als Ereignis registriert.
 * Texte werden immer als Text eingefügt (nie als HTML) – sicher gegen
 * eingeschleusten Code aus importierten Dateien.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Kurze Meldung unten am Bildschirm. */
let toastTimer;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Zeigt einen Dialog und wartet auf die Antwort.
 * @param {Object} opts
 *   title, body (String oder Element),
 *   buttons: [{ label, value, class }]
 * @returns {Promise<any>} value des gedrückten Knopfs (oder null bei Abbruch)
 */
export function dialog({ title, body, buttons = [{ label: 'OK', value: true }] }) {
  const dlg = document.getElementById('dialog');
  dlg.replaceChildren(
    h('h2', {}, title),
    typeof body === 'string' ? h('p', {}, body) : body,
    h('div', { class: 'actions' },
      buttons.map((b) => h('button', {
        class: 'btn ' + (b.class || ''),
        onclick: () => { dlg.returnValue = ''; dlg._value = b.value; dlg.close(); }
      }, b.label))
    )
  );
  dlg._value = null;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg._value), { once: true });
    dlg.showModal();
  });
}

/** Ja/Nein-Abfrage. */
export function confirmDialog(title, body, yesLabel = 'Ja', danger = false) {
  return dialog({
    title, body,
    buttons: [
      { label: 'Abbrechen', value: false, class: 'secondary' },
      { label: yesLabel, value: true, class: danger ? 'danger' : '' }
    ]
  });
}

/** Datum hübsch auf Deutsch. */
export function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ganze Tage zwischen einem ISO-Datum und heute. */
export function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Hell/Dunkel anwenden. Die Einstellung liegt in IndexedDB; zusätzlich eine
 * Kopie in localStorage, damit index.html sie schon vor dem ersten Zeichnen
 * setzen kann (sonst blitzt kurz der helle Modus auf).
 */
export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  const color = theme === 'dark' ? '#2a3317' : '#3f4d1f';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
  try { localStorage.setItem('theme', theme); } catch (e) { /* egal */ }
}

/** Platzhalter-Karte für Bereiche, die noch gebaut werden. */
export function comingSoon(milestone, text) {
  return h('div', { class: 'card note' },
    h('h3', {}, 'Kommt in Meilenstein ' + milestone),
    h('p', {}, text)
  );
}
