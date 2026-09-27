// Shared view pieces: playing cards, action chips, expected-value bars,
// probability distributions and the explanation panel.

import { h, pct } from './dom.js';
import { SUIT_SYMBOLS, isRed, cardName } from '../engine/cards.js';
import { ACTION_NAMES } from '../engine/strategy.js';
import { signedEv, per100 } from '../engine/explain.js';
import { OUTCOME_LABELS } from '../engine/ev.js';

const FACE = new Set(['J', 'Q', 'K']);

export function cardEl(card, { hidden = false, small = false, fresh = false } = {}) {
  const size = small ? ' small' : '';
  const dealt = fresh ? ' dealt' : '';
  if (hidden) return h('div', { class: `card back${size}${dealt}`, role: 'img', 'aria-label': 'Face-down card' });
  const suit = card.suit ? SUIT_SYMBOLS[card.suit] : '';
  const color = card.suit ? (isRed(card.suit) ? ' red' : '') : '';
  const face = FACE.has(card.rank) ? ' face' : '';
  const center = FACE.has(card.rank) ? h('span', null, card.rank) : suit || card.rank;
  return h(
    'div',
    { class: `card${color}${face}${size}${dealt}`, role: 'img', 'aria-label': cardName(card) },
    h('span', { class: 'corner tl', 'aria-hidden': 'true' }, h('span', { class: 'rank' }, card.rank), h('span', { class: 'suit' }, suit)),
    h('span', { class: 'center', 'aria-hidden': 'true' }, center),
    h('span', { class: 'corner br', 'aria-hidden': 'true' }, h('span', { class: 'rank' }, card.rank), h('span', { class: 'suit' }, suit)),
  );
}

export function actionChip(action, label) {
  return h('span', { class: `act-chip act-${action[0]}`, title: ACTION_NAMES[action[0]] || '' }, label || action);
}

/** Diverging bars for expected values of each action. */
export function evBars(rows, { chosen } = {}) {
  const scale = Math.max(0.5, ...rows.map((r) => Math.abs(r.ev)));
  return h(
    'div',
    { class: 'ev-table', role: 'list', 'aria-label': 'Expected value of each action per unit staked' },
    rows.map((r) => {
      const half = (Math.min(Math.abs(r.ev), scale) / scale) * 50;
      const bar = h('span', {
        class: `bar ${r.ev < 0 ? 'neg' : 'pos'}`,
        style: r.ev < 0 ? { right: '50%', width: `${half}%` } : { left: '50%', width: `${half}%` },
      });
      const tags = [];
      if (r.recommended) tags.push(h('span', { class: 'pill good' }, 'Basic strategy'));
      if (r.best && !r.recommended) tags.push(h('span', { class: 'pill' }, 'Highest for these exact cards'));
      if (chosen && chosen === r.action) tags.push(h('span', { class: 'pill' }, 'Your choice'));
      return h(
        'div',
        { class: `ev-row${r.recommended ? ' recommended' : ''}`, role: 'listitem', title: per100(r.ev) },
        h('span', { class: 'name' }, actionChip(r.action), r.name),
        h('span', { class: 'ev-track' }, h('span', { class: 'zero', style: { left: '50%' } }), bar),
        h('span', { class: 'val' }, signedEv(r.ev)),
        tags.length ? h('span', { class: 'tags' }, tags) : null,
      );
    }),
  );
}

/** Horizontal distribution bars (dealer outcomes, totals after one card). */
export function distribution(items) {
  const max = Math.max(0.0001, ...items.map((i) => i.p));
  return h(
    'div',
    { class: 'dist' },
    items.map((i) =>
      h(
        'div',
        { class: `dist-row${i.bust ? ' bust' : ''}` },
        h('span', null, i.label),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${(i.p / max) * 100}%` } })),
        h('span', { class: 'pct' }, pct(i.p)),
      ),
    ),
  );
}

export function dealerDistribution(outlook) {
  return distribution(
    [0, 1, 2, 3, 4, 5].map((i) => ({ label: OUTCOME_LABELS[i], p: outlook.afterCheck[i], bust: i === 5 })),
  );
}

export function afterHitDistribution(analysis) {
  const items = Object.entries(analysis.afterHit)
    .map(([t, p]) => ({ label: `→ ${t}`, p, total: Number(t) }))
    .sort((a, b) => a.total - b.total);
  if (analysis.bustOnHit > 0) items.push({ label: 'Bust', p: analysis.bustOnHit, bust: true });
  return distribution(items);
}

/** The "why" panel: principle, expected values, notes, facts and the long-run caveat. */
export function explanationEl(ex, { chosen, showHeadline = false } = {}) {
  return h(
    'div',
    { class: 'explain' },
    showHeadline ? h('div', { class: 'big-rec' }, ex.code ? actionChip(ex.code) : null, h('strong', null, ex.headline.replace('Basic strategy: ', ''))) : null,
    ex.cell ? h('div', { class: 'cell-line' }, h('span', null, `Chart cell: ${ex.cell}`), ex.code ? actionChip(ex.code) : null, chartCodeHelp(ex.code)) : null,
    h('div', { class: 'principle' }, h('h4', null, ex.principle.title), h('p', null, ex.principle.body)),
    ex.evRows.length
      ? h(
          'div',
          null,
          h('p', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Expected value per 1 unit staked'),
          evBars(ex.evRows, { chosen }),
        )
      : null,
    ex.notes.map((n) => h('p', { class: `callout${n.kind === 'composition' || n.kind === 'fallback' ? ' warn' : ''}` }, n.text)),
    ex.facts.length ? h('ul', { class: 'fact-list' }, ex.facts.map((f) => h('li', null, f))) : null,
    h('p', { class: 'caution' }, ex.caution),
  );
}

export function chartCodeHelp(code) {
  const text = {
    H: 'Hit',
    S: 'Stand',
    P: 'Split',
    Dh: 'Double if allowed, otherwise hit',
    Ds: 'Double if allowed, otherwise stand',
    Rh: 'Surrender if allowed, otherwise hit',
    Rs: 'Surrender if allowed, otherwise stand',
    Rp: 'Surrender if allowed, otherwise split',
  }[code];
  return text ? h('span', { class: 'muted' }, text) : null;
}

export const ACTION_KEYS = { H: 'h', S: 's', D: 'd', P: 'p', R: 'r' };
