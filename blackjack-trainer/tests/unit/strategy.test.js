import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartViewCode, recommend, expectedReturn, chartCell, cellCode, chartDifferences, UP_ORDER } from '../../src/engine/strategy.js';
import { normalizeRules } from '../../src/engine/rules.js';
import { makeCard } from '../../src/engine/cards.js';

// Published 4-8 deck basic strategy (dealer peeks), in chart notation.
// Columns: dealer 2 3 4 5 6 7 8 9 10 A.
const row = (s) => s.trim().split(/\s+/);
const BASE_HARD = {
  5: row('H H H H H H H H H H'),
  6: row('H H H H H H H H H H'),
  7: row('H H H H H H H H H H'),
  8: row('H H H H H H H H H H'),
  9: row('H Dh Dh Dh Dh H H H H H'),
  10: row('Dh Dh Dh Dh Dh Dh Dh Dh H H'),
  11: row('Dh Dh Dh Dh Dh Dh Dh Dh Dh H'),
  12: row('H H S S S H H H H H'),
  13: row('S S S S S H H H H H'),
  14: row('S S S S S H H H H H'),
  15: row('S S S S S H H H H H'),
  16: row('S S S S S H H H H H'),
  17: row('S S S S S S S S S S'),
  18: row('S S S S S S S S S S'),
  19: row('S S S S S S S S S S'),
  20: row('S S S S S S S S S S'),
};
const BASE_SOFT = {
  13: row('H H H Dh Dh H H H H H'),
  14: row('H H H Dh Dh H H H H H'),
  15: row('H H Dh Dh Dh H H H H H'),
  16: row('H H Dh Dh Dh H H H H H'),
  17: row('H Dh Dh Dh Dh H H H H H'),
  18: row('S Ds Ds Ds Ds S S H H H'),
  19: row('S S S S S S S S S S'),
  20: row('S S S S S S S S S S'),
};
const PAIRS_DAS = {
  1: row('P P P P P P P P P P'),
  2: row('P P P P P P H H H H'),
  3: row('P P P P P P H H H H'),
  4: row('H H H P P H H H H H'),
  5: row('Dh Dh Dh Dh Dh Dh Dh Dh H H'),
  6: row('P P P P P H H H H H'),
  7: row('P P P P P P H H H H'),
  8: row('P P P P P P P P P P'),
  9: row('P P P P P S P P S S'),
  10: row('S S S S S S S S S S'),
};
const PAIRS_NDAS = {
  ...PAIRS_DAS,
  2: row('H H P P P P H H H H'),
  3: row('H H P P P P H H H H'),
  4: row('H H H H H H H H H H'),
  6: row('H P P P P H H H H H'),
};
const COL = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, A: 9 };

function publishedChart({ h17, das, surrender }) {
  const hard = structuredClone(BASE_HARD);
  const soft = structuredClone(BASE_SOFT);
  const pairs = structuredClone(das ? PAIRS_DAS : PAIRS_NDAS);
  if (h17) {
    hard[11][COL.A] = 'Dh';
    soft[18][COL[2]] = 'Ds';
    soft[19][COL[6]] = 'Ds';
  }
  if (surrender) {
    hard[15][COL[10]] = 'Rh';
    hard[16][COL[9]] = 'Rh';
    hard[16][COL[10]] = 'Rh';
    hard[16][COL.A] = 'Rh';
    if (h17) {
      hard[15][COL.A] = 'Rh';
      hard[17][COL.A] = 'Rs';
      pairs[8][COL.A] = 'Rp';
    }
  }
  return { hard, soft, pairs };
}

for (const decks of [4, 6, 8]) {
  for (const h17 of [false, true]) {
    for (const das of [true, false]) {
      for (const surrender of [false, true]) {
        const name = `${decks} decks ${h17 ? 'H17' : 'S17'} ${das ? 'DAS' : 'NDAS'} ${surrender ? 'late surrender' : 'no surrender'}`;
        test(`engine-derived chart matches the published chart: ${name}`, () => {
          const rules = normalizeRules({ decks, dealerHitsSoft17: h17, doubleAfterSplit: das, surrender: surrender ? 'late' : 'none' });
          const expected = publishedChart({ h17, das, surrender });
          const mismatches = [];
          for (const table of ['hard', 'soft', 'pairs']) {
            for (const [r, cells] of Object.entries(expected[table])) {
              cells.forEach((code, col) => {
                const got = chartViewCode(rules, table, r, col);
                if (got !== code) mismatches.push(`${table} ${r} vs ${UP_ORDER[col]}: expected ${code}, got ${got}`);
              });
            }
          }
          assert.deepEqual(mismatches, []);
        });
      }
    }
  }
}

test('single-deck chart has the well-known single-deck plays', () => {
  const rules = normalizeRules({ decks: 1, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'late' });
  const code = (table, r, up) => chartViewCode(rules, table, r, COL[up]);
  assert.equal(code('hard', 8, 5), 'Dh');
  assert.equal(code('hard', 8, 6), 'Dh');
  assert.equal(code('hard', 8, 4), 'H');
  assert.equal(code('hard', 9, 2), 'Dh');
  assert.equal(code('hard', 11, 'A'), 'Dh');
  assert.equal(code('soft', 17, 2), 'Dh');
  assert.equal(code('soft', 18, 'A'), 'S');
  assert.equal(code('soft', 19, 6), 'Ds');
  assert.equal(code('pairs', 3, 8), 'P');
  assert.equal(code('pairs', 4, 4), 'P');
  assert.equal(code('pairs', 6, 7), 'P');
  assert.equal(code('pairs', 7, 10), 'Rs');
  const noSurrender = normalizeRules({ ...rules, surrender: 'none' });
  assert.equal(chartViewCode(noSurrender, 'pairs', 7, COL[10]), 'S');
});

test('double-deck chart has the well-known double-deck plays', () => {
  const rules = normalizeRules({ decks: 2, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' });
  const code = (table, r, up) => chartViewCode(rules, table, r, COL[up]);
  assert.equal(code('hard', 11, 'A'), 'Dh');
  assert.equal(code('hard', 9, 2), 'Dh');
  assert.equal(code('hard', 8, 5), 'H');
  assert.equal(code('soft', 18, 2), 'S');
  assert.equal(code('pairs', 6, 7), 'P');
  assert.equal(code('pairs', 7, 8), 'P');
});

test('restricted doubling falls back to the next-best play in the chart view', () => {
  const rules = normalizeRules({ decks: 6, doubleOn: '10-11' });
  assert.equal(chartViewCode(rules, 'hard', 9, COL[4]), 'H');
  assert.equal(chartViewCode(rules, 'hard', 10, COL[4]), 'Dh');
  assert.equal(chartViewCode(rules, 'soft', 18, COL[4]), 'S');
  assert.equal(chartViewCode(rules, 'soft', 17, COL[4]), 'H');
});

const cards = (...ranks) => ranks.map((r) => makeCard(r));

test('recommend uses the best action that is actually available', () => {
  const rules = normalizeRules({ decks: 6, surrender: 'late' });
  assert.equal(recommend(rules, cards('10', '6'), '10', ['H', 'S', 'D', 'R']).action, 'R');
  assert.equal(recommend(rules, cards('10', '6'), '10', ['H', 'S']).action, 'H');
  assert.equal(recommend(rules, cards('5', '4', '2'), '6', ['H', 'S']).action, 'H');
  assert.equal(recommend(rules, cards('5', '4', '2'), '6', ['H', 'S', 'D']).action, 'D');
  assert.equal(recommend(rules, cards('A', '4', '3'), '4', ['H', 'S']).action, 'S');
  assert.equal(recommend(rules, cards('A', '6'), '4', ['H', 'S']).action, 'H');
  const r = recommend(rules, cards('5', '4', '2'), '6', ['H', 'S']);
  assert.equal(r.usedFallback, true);
  assert.equal(r.preferred, 'D');
});

test('pairs use the pair row, and fall back when splitting is not possible', () => {
  const rules = normalizeRules({ decks: 6, surrender: 'none' });
  assert.equal(chartCell(rules, cards('8', '8'), '10').table, 'pairs');
  assert.equal(recommend(rules, cards('8', '8'), '10', ['H', 'S', 'D', 'P']).action, 'P');
  assert.equal(recommend(rules, cards('8', '8'), '10', ['H', 'S', 'D']).action, 'H');
  assert.equal(recommend(rules, cards('8', '8'), '6', ['H', 'S', 'D']).action, 'S');
  assert.equal(recommend(rules, cards('K', 'Q'), '6', ['H', 'S', 'D', 'P']).action, 'S');
  assert.equal(recommend(rules, cards('A', 'A'), '6', ['H', 'S', 'D']).action, 'D');
  assert.equal(recommend(rules, cards('A', 'A'), '6', ['H', 'S']).action, 'H');
});

test('cellCode notation', () => {
  assert.equal(cellCode('DHSR'), 'Dh');
  assert.equal(cellCode('DSHR'), 'Ds');
  assert.equal(cellCode('RHSD'), 'Rh');
  assert.equal(cellCode('RPHSD'), 'Rp');
  assert.equal(cellCode('RHSD', (a) => a !== 'R'), 'H');
});

test('expected return responds to rules in the known directions and sizes', () => {
  const base = normalizeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' });
  const edge = (r) => -expectedReturn(normalizeRules({ ...base, ...r }));
  assert.ok(Math.abs(edge({}) - 0.004) < 0.0008, `6D S17 DAS edge ${edge({})}`);
  assert.ok(edge({ dealerHitsSoft17: true }) - edge({}) > 0.0015 && edge({ dealerHitsSoft17: true }) - edge({}) < 0.0025);
  assert.ok(edge({ doubleAfterSplit: false }) > edge({}));
  assert.ok(edge({ surrender: 'late' }) < edge({}));
  const sixFive = edge({ blackjackPayout: '6:5' }) - edge({});
  assert.ok(sixFive > 0.0125 && sixFive < 0.0145, `6:5 costs ${sixFive}`);
  assert.ok(edge({ decks: 8 }) > edge({}));
  assert.ok(edge({ decks: 1 }) < edge({ decks: 2 }));
  assert.ok(edge({ doubleOn: '10-11' }) > edge({ doubleOn: '9-11' }));
  assert.ok(edge({ doubleOn: '9-11' }) > edge({}));
  assert.ok(edge({ maxSplitHands: 2 }) > edge({ maxSplitHands: 4 }));
  assert.ok(edge({ resplitAces: true }) < edge({}));
});

test('chartDifferences lists cells that change between rulesets', () => {
  const s17 = normalizeRules({ decks: 6, dealerHitsSoft17: false, surrender: 'none' });
  const h17 = normalizeRules({ ...s17, dealerHitsSoft17: true });
  const diffs = chartDifferences(s17, h17).map((d) => `${d.table}${d.row}v${d.up}:${d.a}>${d.b}`);
  assert.ok(diffs.includes('hard11v1:H>Dh'));
  assert.ok(diffs.includes('soft18v2:S>Ds'));
  assert.ok(diffs.includes('soft19v6:S>Ds'));
});
