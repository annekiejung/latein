/*
 * Formular zum Bearbeiten einer Vokabelkarte (im Import-Vorschau und in der
 * Lektionsliste). Zeigt nur die Felder, die zur gewählten Wortart passen.
 */
import { h, formDialog } from './ui.js';
import { WORTARTEN, checkEntry } from './vocab.js';

/**
 * Öffnet den Bearbeiten-Dialog.
 * @param {object} card      die Karte (wird nicht verändert)
 * @param {object} opts      { title, allowDelete, onDelete }
 * @returns {Promise<{action:'saved', card, warnings} | {action:'deleted'} | null>}
 */
export async function editCardDialog(card, { title = 'Karte bearbeiten', onDelete } = {}) {
  const field = (label, input, help) =>
    h('label', { class: 'field' }, h('span', {}, label), input, help ? h('small', { class: 'muted' }, help) : null);
  const text = (value, attrs = {}) => h('input', {
    type: 'text', value: value || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...attrs
  });

  const latein = text(card.latein, { class: 'latin' });
  const wortart = h('select', {},
    Object.entries(WORTARTEN).map(([v, l]) => h('option', { value: v, selected: v === card.wortart }, l)));
  const bedeutungen = h('textarea', { rows: 3, autocapitalize: 'off', spellcheck: 'false' },
    (card.bedeutungen || []).join('\n'));
  const genitiv = text(card.genitiv, { class: 'latin' });
  const genus = h('select', {},
    ['', 'm', 'f', 'n', 'm/f'].map((g) => h('option', { value: g, selected: g === (card.genus || '') }, g || '–')));
  const stammformen = text((card.stammformen || []).join(', '), { class: 'latin' });
  const formen = text(card.formen, { class: 'latin' });
  const kasus = text(card.kasus);
  const hinweis = text(card.hinweis);
  const unsicher = h('input', { type: 'checkbox', checked: !!card.unsicher });

  // Felder, die je nach Wortart sichtbar sind
  const rows = {
    genitiv: field('Genitiv', genitiv),
    genus: field('Genus', genus),
    stammformen: field('Weitere Stammformen', stammformen, 'Mit Komma getrennt, z. B.: mittō, mīsī, missum'),
    formen: field('Formen', formen, 'z. B. ācer, ācris, ācre oder hic, haec, hoc'),
    kasus: field('Kasus', kasus, 'z. B. Akk. oder Abl.')
  };
  const visible = {
    nomen: ['genitiv', 'genus'],
    verb: ['stammformen'],
    adjektiv: ['formen', 'genitiv'],
    praeposition: ['kasus'],
    pronomen: ['formen'],
    numerale: ['formen']
  };
  const updateVisible = () => {
    const show = [...(visible[wortart.value] || [])];
    if (card.formen) show.push('formen');   // vorhandene Formen nie verstecken
    for (const [k, el] of Object.entries(rows)) el.hidden = !show.includes(k);
  };
  wortart.addEventListener('change', updateVisible);
  updateVisible();

  const body = h('div', {},
    field('Latein (Grundform, bei Verben Infinitiv)', latein),
    field('Wortart', wortart),
    Object.values(rows),
    field('Deutsche Bedeutungen', bedeutungen, 'Eine pro Zeile, häufigste zuerst.'),
    field('Hinweis (optional)', hinweis, 'z. B. m. Dat., Pl.: …'),
    h('label', { class: 'check-row' }, unsicher, h('span', {}, 'Noch unsicher – bitte prüfen'))
  );

  let out = null;
  const result = await formDialog({
    title,
    body,
    onDelete,
    onSave: () => {
      const wa = wortart.value;
      const raw = {
        latein: latein.value,
        wortart: wa,
        bedeutungen: bedeutungen.value.split('\n'),
        hinweis: hinweis.value,
        unsicher: unsicher.checked
      };
      if (visible[wa]?.includes('genitiv')) raw.genitiv = genitiv.value;
      if (wa === 'nomen') raw.genus = genus.value;
      if (wa === 'verb') raw.stammformen = stammformen.value.split(',');
      if (!rows.formen.hidden) raw.formen = formen.value;
      if (wa === 'praeposition') raw.kasus = kasus.value;
      const res = checkEntry(raw, card.lektion);
      if (res.errors.length) return res.errors.join(' ');
      out = { action: 'saved', card: { ...res.card, lektion: card.lektion }, warnings: res.warnings };
      return null;
    }
  });
  if (result === 'deleted') return { action: 'deleted' };
  return result === 'saved' ? out : null;
}
