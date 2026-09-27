// The basic-strategy chart for the selected rules, with cell explanations,
// the learner's mistakes overlaid, and rule comparisons.

import { h, replace } from './dom.js';
import { actionChip, explanationEl, chartCodeHelp } from './components.js';
import { chartViewCode, chartDifferences, UP_ORDER, rowLabel } from '../engine/strategy.js';
import { rulesSummary, normalizeRules } from '../engine/rules.js';
import { decisionStats, cellKey } from '../engine/stats.js';
import { analyzeDecision, explainDecision, actionsForHand } from '../engine/explain.js';
import { valueToRank, valueLabel } from '../engine/cards.js';

// Displayed rows. Grouped rows share one decision in every ruleset.
const HARD_ROWS = [
  { key: 7, label: '5–7', covers: [4, 5, 6, 7] },
  { key: 8, label: '8' },
  { key: 9, label: '9' },
  { key: 10, label: '10' },
  { key: 11, label: '11' },
  { key: 12, label: '12' },
  { key: 13, label: '13' },
  { key: 14, label: '14' },
  { key: 15, label: '15' },
  { key: 16, label: '16' },
  { key: 17, label: '17' },
  { key: 18, label: '18–21', covers: [18, 19, 20, 21] },
];
const SOFT_ROWS = [13, 14, 15, 16, 17, 18, 19, 20].map((t) => ({ key: t, label: `A,${t - 11}` }));
const PAIR_ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((v) => ({ key: v, label: v === 1 ? 'A,A' : v === 10 ? '10,10' : `${v},${v}` }));

const COMPARISONS = [
  ['none', 'Nothing'],
  ['dealerHitsSoft17', 'Other soft-17 rule'],
  ['doubleAfterSplit', 'Other double-after-split rule'],
  ['surrender', 'Other surrender rule'],
  ['decks1', 'Single deck'],
  ['decks2', 'Double deck'],
  ['decks8', '8 decks'],
];

function compareRules(rules, which) {
  const r = { ...rules };
  if (which === 'dealerHitsSoft17') r.dealerHitsSoft17 = !r.dealerHitsSoft17;
  else if (which === 'doubleAfterSplit') r.doubleAfterSplit = !r.doubleAfterSplit;
  else if (which === 'surrender') r.surrender = r.surrender === 'late' ? 'none' : 'late';
  else if (which.startsWith('decks')) r.decks = Number(which.slice(5));
  else return null;
  return normalizeRules(r);
}

function representative(table, row) {
  if (table === 'pairs') return [valueToRank(row), valueToRank(row)];
  if (table === 'soft') return ['A', valueToRank(row - 11)];
  const combos = { 7: ['4', '3'], 8: ['5', '3'], 9: ['5', '4'], 10: ['6', '4'], 11: ['6', '5'], 12: ['10', '2'], 13: ['10', '3'], 14: ['10', '4'], 15: ['10', '5'], 16: ['10', '6'], 17: ['10', '7'], 18: ['10', '8'] };
  return combos[row];
}

export function createChartView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'chart-title' });
  const c = { selected: { table: 'hard', row: 16, col: 8 }, showMistakes: true, compare: 'none' };
  const rules = () => ctx.store.state.rules;

  function table(title, tableName, rows, errors, diffs) {
    const r = rules();
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, title)),
      h(
        'div',
        { class: 'chart-wrap' },
        h(
          'table',
          { class: 'strategy' },
          h('caption', { class: 'sr-only' }, `${title} basic strategy for ${rulesSummary(r)}`),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, tableName === 'pairs' ? 'Pair' : tableName === 'soft' ? 'Soft' : 'Hard'), UP_ORDER.map((u) => h('th', { scope: 'col' }, valueLabel(u))))),
          h(
            'tbody',
            null,
            rows.map((row) =>
              h(
                'tr',
                null,
                h('th', { class: 'rowhead', scope: 'row' }, row.label),
                UP_ORDER.map((up, col) => {
                  const code = chartViewCode(r, tableName, row.key, col);
                  const covers = row.covers || [row.key];
                  const errs = covers.reduce((s, k) => s + (errors.get(cellKey(tableName, k, up)) || 0), 0);
                  const changed = diffs ? diffs.get(`${tableName}:${row.key}:${col}`) : undefined;
                  const selected = c.selected.table === tableName && c.selected.row === row.key && c.selected.col === col;
                  return h(
                    'td',
                    null,
                    h(
                      'button',
                      {
                        type: 'button',
                        class: `act-${code[0]}${selected ? ' selected' : ''}${changed ? ' changed' : ''}`,
                        'aria-label': `${rowLabel(tableName, row.key)} vs ${valueLabel(up)}: ${code}${errs ? `, ${errs} mistakes` : ''}${changed ? `, becomes ${changed} under the comparison rules` : ''}`,
                        onClick: () => {
                          c.selected = { table: tableName, row: row.key, col };
                          render();
                        },
                      },
                      code,
                      c.showMistakes && errs ? h('span', { class: 'err', 'aria-hidden': 'true' }, String(errs)) : null,
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function detail() {
    const r = rules();
    const { table: t, row, col } = c.selected;
    const up = UP_ORDER[col];
    const cards = representative(t, row).map((rank) => ({ rank, suit: null }));
    const code = chartViewCode(r, t, row, col);
    let body;
    try {
      const upCard = { rank: valueToRank(up), suit: null };
      const analysis = analyzeDecision({ rules: r, cards, upCard, available: actionsForHand(r, cards) });
      const ex = explainDecision(analysis);
      body = h(
        'div',
        { class: 'stack' },
        h('div', { class: 'big-rec' }, actionChip(code), h('div', null, h('strong', null, `${rowLabel(t, row)} vs ${valueLabel(up)}`), h('div', { class: 'cell-line' }, chartCodeHelp(code)))),
        h('p', { class: 'muted', style: { fontSize: '13px' } }, `Worked example: ${cards.map((x) => x.rank).join(', ')} against a dealer ${valueLabel(up)}. The chart cell averages over every two-card hand that makes this total, so other combinations have slightly different values.`),
        explanationEl(ex),
      );
    } catch (err) {
      body = h('p', { class: 'callout bad' }, err.message);
    }
    return h('div', { class: 'panel', 'aria-live': 'polite' }, h('div', { class: 'panel-head' }, h('h3', null, 'Why this cell?')), body);
  }

  function render() {
    const r = rules();
    const stats = decisionStats(ctx.store.state.history);
    const errors = new Map();
    for (const cell of stats.cells.values()) if (cell.errors) errors.set(cell.key, cell.errors);
    const other = compareRules(r, c.compare);
    let diffs = null;
    let diffList = [];
    if (other) {
      diffList = chartDifferences(r, other);
      diffs = new Map();
      for (const d of diffList) {
        let key = d.row;
        if (d.table === 'hard' && d.row <= 7) key = 7;
        if (d.table === 'hard' && d.row >= 18) key = 18;
        if (d.table === 'soft' && (d.row === 12 || d.row === 21)) continue;
        if (d.table === 'hard' && (d.row === 4 || d.row === 20)) continue;
        diffs.set(`${d.table}:${key}:${d.col}`, d.b);
      }
    }
    const legend = h(
      'div',
      { class: 'legend' },
      [
        ['H', 'Hit'],
        ['S', 'Stand'],
        ['Dh', 'Double, else hit'],
        ['Ds', 'Double, else stand'],
        ['P', 'Split'],
        ['Rh', 'Surrender, else hit'],
        ['Rs', 'Surrender, else stand'],
        ['Rp', 'Surrender, else split'],
      ].map(([code, text]) => h('span', null, actionChip(code), text)),
    );
    const controls = h(
      'div',
      { class: 'toolbar' },
      h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', id: 'show-mistakes', checked: c.showMistakes, onChange: (e) => { c.showMistakes = e.target.checked; render(); } }), `Show my mistakes (${stats.mistakes.reduce((s, m) => s + m.errors, 0)})`),
      h(
        'label',
        { class: 'row-wrap', for: 'compare-select' },
        h('span', { class: 'eyebrow' }, 'Compare with'),
        h('select', { id: 'compare-select', onChange: (e) => { c.compare = e.target.value; render(); } }, COMPARISONS.map(([v, t]) => h('option', { value: v, selected: c.compare === v }, t))),
      ),
    );
    const diffNote = other
      ? h(
          'p',
          { class: 'callout' },
          diffList.length
            ? `Dashed cells change under "${rulesSummary(other)}". ${diffList.length} cell${diffList.length === 1 ? '' : 's'} differ; select one to see why.`
            : `No cells change under "${rulesSummary(other)}". This rule affects the house edge but not the chart.`,
        )
      : null;
    replace(
      el,
      h(
        'div',
        { class: 'view-head' },
        h('div', null, h('h2', { id: 'chart-title' }, 'Basic-strategy chart'), h('p', null, `Derived from exact probability calculations for your rules: ${rulesSummary(r)}. Select any cell to see the math behind it.`)),
        h('a', { class: 'btn small', href: '#rules' }, 'Change rules'),
      ),
      controls,
      diffNote,
      h('div', { style: { margin: '10px 0 14px' } }, legend),
      h(
        'div',
        { class: 'chart-tables' },
        h('div', { class: 'stack' }, table('Hard totals', 'hard', HARD_ROWS, errors, diffs), table('Soft totals', 'soft', SOFT_ROWS, errors, diffs)),
        h('div', { class: 'stack' }, table('Pairs', 'pairs', PAIR_ROWS, errors, diffs), detail()),
      ),
    );
  }

  return {
    el,
    title: 'Strategy chart',
    show(params = {}) {
      if (params.cell) c.selected = params.cell;
      render();
    },
    refresh() {
      render();
    },
  };
}
