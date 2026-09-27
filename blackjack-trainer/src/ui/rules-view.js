// Ruleset configuration. Each rule explains what it does, how many chart
// cells it changes, and how it moves the long-run expected return.

import { h, replace, pct, toast } from './dom.js';
import {
  PRESETS,
  FIXED_RULES,
  DECK_OPTIONS,
  PAYOUT_OPTIONS,
  DOUBLE_OPTIONS,
  SPLIT_HAND_OPTIONS,
  normalizeRules,
  rulesSummary,
  describeRule,
  sameRules,
} from '../engine/rules.js';
import { expectedReturn, chartDifferences } from '../engine/strategy.js';

const RULES = [
  {
    key: 'decks',
    title: 'Number of decks',
    options: DECK_OPTIONS.map((d) => [d, d === 1 ? '1' : String(d)]),
    why: 'Fewer decks favour the player slightly: removing a card changes the odds of the next one more in a small shoe, and blackjacks come a little more often. A few chart cells differ for 1 and 2 decks.',
  },
  {
    key: 'dealerHitsSoft17',
    title: 'Dealer on soft 17',
    options: [
      [false, 'Stands (S17)'],
      [true, 'Hits (H17)'],
    ],
    why: 'Hitting soft 17 lets the dealer improve hands like A,6, which costs the player about 0.2% and makes doubling more attractive in a few spots.',
  },
  {
    key: 'blackjackPayout',
    title: 'Blackjack pays',
    options: PAYOUT_OPTIONS.map((p) => [p, p]),
    why: 'You get a blackjack about once every 21 hands. Paying 6:5 instead of 3:2 costs about 1.4% of every stake over time, far more than any other rule here. Strategy does not change.',
  },
  {
    key: 'doubleAfterSplit',
    title: 'Double after split',
    options: [
      [true, 'Allowed'],
      [false, 'Not allowed'],
    ],
    why: 'Doubling after a split makes splitting small pairs (2s, 3s, 4s, 6s) worth it against more dealer cards.',
  },
  {
    key: 'surrender',
    title: 'Surrender',
    options: [
      ['late', 'Late surrender'],
      ['none', 'Not offered'],
    ],
    why: 'Late surrender lets you give up half the stake on your first two cards after the dealer checks for blackjack. It only helps in a handful of very bad spots.',
  },
  {
    key: 'doubleOn',
    title: 'Doubling allowed on',
    options: DOUBLE_OPTIONS.map((d) => [d, d === 'any' ? 'Any two cards' : `Hard ${d.replace('-', ' to ')}`]),
    why: 'Restricting doubles removes profitable soft doubles and, for 10-11 only, doubling on 9. The chart then falls back to the next-best play.',
  },
  {
    key: 'maxSplitHands',
    title: 'Split up to',
    options: SPLIT_HAND_OPTIONS.map((n) => [n, `${n} hands`]),
    why: 'Re-splitting helps a little when a split hand draws another card of the same rank.',
  },
  {
    key: 'resplitAces',
    title: 'Re-split aces',
    options: [
      [false, 'No'],
      [true, 'Yes'],
    ],
    why: 'If a split ace draws another ace, re-splitting gives another chance at 21. Split aces still get one card each.',
  },
  {
    key: 'offerInsurance',
    title: 'Insurance decisions in practice',
    options: [
      [true, 'Offer'],
      [false, 'Skip'],
    ],
    why: 'When the dealer shows an ace, practice offers insurance so you can learn to decline it. Turning this off skips the question; it does not change the math.',
  },
];

export function createRulesView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'rules-title' });
  const rules = () => ctx.store.state.rules;

  function setRule(key, value) {
    ctx.store.update((st) => {
      st.rules = normalizeRules({ ...st.rules, [key]: value });
    });
    ctx.rulesChanged();
  }

  function applyPreset(p) {
    ctx.store.update((st) => {
      st.rules = normalizeRules({ ...st.rules, ...p.rules });
    });
    ctx.rulesChanged();
    toast(`Rules set to: ${p.name}`);
  }

  function effect(key, value) {
    const r = rules();
    if (r[key] === value || key === 'offerInsurance') return null;
    const other = normalizeRules({ ...r, [key]: value });
    const dEdge = -expectedReturn(other) + expectedReturn(r);
    const cells = chartDifferences(r, other).length;
    return { dEdge, cells };
  }

  function ruleCard(def) {
    const r = rules();
    const current = r[def.key];
    const effects = def.options
      .map(([v, label]) => ({ v, label, e: effect(def.key, v) }))
      .filter((x) => x.e);
    return h(
      'div',
      { class: 'panel rule-card' },
      h('h3', { style: { fontSize: '16px' }, id: `rule-${def.key}` }, def.title),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-labelledby': `rule-${def.key}` },
        def.options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(current === v), onClick: () => setRule(def.key, v) }, label)),
      ),
      h('p', { class: 'rule-effect' }, describeRule(def.key, r) || null),
      h('p', { class: 'muted', style: { fontSize: '13px' } }, def.why),
      effects.length
        ? h(
            'ul',
            { class: 'fact-list' },
            effects.map((x) =>
              h(
                'li',
                null,
                `${x.label}: house edge ${x.e.dEdge >= 0 ? '+' : '−'}${Math.abs(x.e.dEdge * 100).toFixed(2)}%`,
                x.e.cells ? `, ${x.e.cells} chart cell${x.e.cells === 1 ? '' : 's'} change` : ', chart unchanged',
              ),
            ),
          )
        : null,
    );
  }

  function render() {
    const r = rules();
    const edge = -expectedReturn(r);
    replace(
      el,
      h(
        'div',
        { class: 'view-head' },
        h('div', null, h('h2', { id: 'rules-title' }, 'Rules'), h('p', null, 'Choose the table rules the simulator, the chart and every calculation should use. These settings exist to show how rules change the math; they are not advice about where or how to play.')),
      ),
      h(
        'div',
        { class: 'grid-2', style: { marginBottom: '16px' } },
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'Current rules')),
          h('p', { style: { marginBottom: '10px' } }, rulesSummary(r)),
          h('div', { class: 'edge-figure' }, h('span', { class: 'value' }, pct(edge, 2)), h('span', { class: 'muted' }, edge >= 0 ? 'house edge with perfect basic strategy' : 'player edge with perfect basic strategy (rare single-deck rules)')),
          h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '6px' } }, `That is a long-run average of ${Math.abs(edge * 100).toFixed(2)} units per 100 staked. It describes the game over millions of hands and cannot tell you anything about the next hand or a single session.`),
        ),
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'Presets')),
          h('div', { class: 'presets' }, PRESETS.map((p) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(sameRules({ ...r, ...p.rules }, r)), onClick: () => applyPreset(p) }, p.name))),
          h('p', { class: 'eyebrow', style: { margin: '14px 0 6px' } }, 'Always assumed'),
          h('ul', { class: 'fact-list' }, FIXED_RULES.map((t) => h('li', null, t))),
        ),
      ),
      h('div', { class: 'rules-grid' }, RULES.map(ruleCard)),
    );
  }

  return {
    el,
    title: 'Rules',
    show() {
      render();
    },
    refresh() {
      render();
    },
  };
}
