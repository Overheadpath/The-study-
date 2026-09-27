import { CHARTS, EXPECTED_RETURNS } from './charts-data.js';
import { chartKey, doubleAllowedForTotal, payoutMultiplier } from './rules.js';
import { evaluateHand } from './hand.js';
import { rankValue, valueLabel } from './cards.js';

export const UP_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
export const ACTIONS = ['H', 'S', 'D', 'P', 'R'];
export const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };
export const ACTION_VERBS = { H: 'hit', S: 'stand', D: 'double down', P: 'split', R: 'surrender' };

const parsed = new Map();

/** The chart for a ruleset: { hard, soft, pairs } rows of 10 ranking strings. */
export function getChart(rules) {
  const key = chartKey(rules);
  let chart = parsed.get(key);
  if (!chart) {
    const raw = CHARTS[key];
    if (!raw) throw new Error(`No strategy chart for ${key}`);
    chart = {};
    for (const table of ['hard', 'soft', 'pairs']) {
      chart[table] = {};
      for (const [row, cells] of Object.entries(raw[table])) chart[table][row] = cells.split(' ');
    }
    parsed.set(key, chart);
  }
  return chart;
}

export function upColumn(upRank) {
  return UP_ORDER.indexOf(rankValue(upRank));
}

/**
 * The chart cell that governs a hand. Two-card pairs always use the pair row
 * (its non-split order is specific to that pair); everything else uses the
 * hard or soft row for the total.
 */
export function chartCell(rules, cards, upRank) {
  const info = evaluateHand(cards);
  const chart = getChart(rules);
  const col = upColumn(upRank);
  if (info.pair) {
    return { table: 'pairs', row: info.pairValue, col, ranking: chart.pairs[info.pairValue][col], info };
  }
  const table = info.soft ? 'soft' : 'hard';
  const row = Math.min(Math.max(info.total, table === 'soft' ? 12 : 4), 21);
  return { table, row, col, ranking: chart[table][row][col], info };
}

export function cellLabel(cell, upRank) {
  const up = typeof upRank === 'number' ? valueLabel(upRank) : upRank;
  const vs = `vs dealer ${up}`;
  if (cell.table === 'pairs') return `Pair of ${cell.row === 1 ? 'A' : cell.row}s ${vs}`;
  return `${cell.table === 'soft' ? 'Soft' : 'Hard'} ${cell.row} ${vs}`;
}

/** Short chart row name: 'Hard 16', 'Soft 18 (A,7)', '8,8'. */
export function rowLabel(table, row) {
  if (table === 'pairs') return row === 1 ? 'A,A' : `${row},${row}`;
  if (table === 'soft') return row === 21 ? 'Soft 21' : `Soft ${row} (A,${row - 11 === 1 ? 'A' : row - 11})`;
  return `Hard ${row}`;
}

/**
 * Basic-strategy recommendation for a hand.
 * `available` lists the actions allowed right now (see availableActions in round.js).
 */
export function recommend(rules, cards, upRank, available) {
  const cell = chartCell(rules, cards, upRank);
  const allowed = new Set(available);
  const action = [...cell.ranking].find((a) => allowed.has(a)) || 'S';
  const preferred = cell.ranking[0];
  return {
    action,
    cell,
    code: cellCode(cell.ranking, (a) => allowed.has(a)),
    preferred,
    usedFallback: action !== preferred,
  };
}

/**
 * Chart notation for a cell: H, S, P, Dh (double, otherwise hit), Ds (double,
 * otherwise stand), Rh / Rs / Rp (surrender, otherwise hit / stand / split).
 */
export function cellCode(ranking, isAllowed = () => true) {
  const order = [...ranking].filter(isAllowed);
  const first = order[0];
  if (first === 'D' || first === 'R') {
    const fallback = order.find((a) => a !== 'D' && a !== 'R');
    return fallback ? first + fallback.toLowerCase() : first;
  }
  return first || 'S';
}

/** Chart notation for a chart view cell under a ruleset (2-card hand availability). */
export function chartViewCode(rules, table, row, col) {
  const ranking = getChart(rules)[table][row][col];
  let info;
  if (table === 'pairs') info = { soft: row === 1, total: row === 1 ? 12 : row * 2 };
  else info = { soft: table === 'soft', total: Number(row) };
  return cellCode(ranking, (a) => {
    if (a === 'R') return rules.surrender === 'late';
    if (a === 'D') return doubleAllowedForTotal(rules, info);
    return true;
  });
}

/** Long-run expected return per unit staked with basic strategy (negative = house edge). */
export function expectedReturn(rules) {
  const entry = EXPECTED_RETURNS[chartKey(rules)];
  const key = `${rules.surrender}|${rules.doubleOn}|${rules.maxSplitHands}|${rules.resplitAces ? 1 : 0}`;
  return entry.returns[key] + entry.naturalPaid * (payoutMultiplier(rules) - 1.5);
}

/** Every chart cell whose recommended code differs between two rulesets. */
export function chartDifferences(rulesA, rulesB) {
  const diffs = [];
  for (const table of ['hard', 'soft', 'pairs']) {
    const rows = Object.keys(getChart(rulesA)[table]);
    for (const row of rows) {
      for (let col = 0; col < 10; col += 1) {
        const a = chartViewCode(rulesA, table, row, col);
        const b = chartViewCode(rulesB, table, row, col);
        if (a !== b) diffs.push({ table, row: Number(row), col, up: UP_ORDER[col], a, b });
      }
    }
  }
  return diffs;
}
