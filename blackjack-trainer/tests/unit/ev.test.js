import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerDistribution, Engine, standValue, splitHandCounts, nextCardProbabilities, dealerOutlook } from '../../src/engine/ev.js';
import { fullShoeCounts } from '../../src/engine/shoe.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

// Dealer outcome probabilities, infinite deck, dealer stands on soft 17:
// [17, 18, 19, 20, 21, bust, blackjack].
const INFINITE_S17 = {
  2: [0.139809, 0.134907, 0.129655, 0.124026, 0.117993, 0.353608, 0],
  6: [0.165438, 0.106267, 0.106267, 0.101715, 0.097163, 0.42315, 0],
  7: [0.368566, 0.137797, 0.078625, 0.078625, 0.074074, 0.262312, 0],
  10: [0.111424, 0.111424, 0.111424, 0.342194, 0.034501, 0.212109, 0.076923],
  1: [0.130789, 0.130789, 0.130789, 0.130789, 0.053866, 0.115286, 0.307692],
};

function hugeShoe(up) {
  const c = fullShoeCounts(1e6);
  c[up] -= 1;
  return c;
}

test('dealer distribution matches the standard infinite-deck S17 table', () => {
  for (const [up, expected] of Object.entries(INFINITE_S17)) {
    const d = dealerDistribution(hugeShoe(Number(up)), Number(up), false, false);
    expected.forEach((p, i) => near(d[i], p, 2e-5, `up ${up} outcome ${i}`));
  }
});

test('dealer distribution sums to 1, or to P(no blackjack) when blackjack paths are excluded', () => {
  for (const decks of [1, 6]) {
    for (let up = 1; up <= 10; up += 1) {
      const c = fullShoeCounts(decks);
      c[up] -= 1;
      for (const h17 of [false, true]) {
        const all = dealerDistribution(c, up, h17, false);
        near(all.reduce((a, b) => a + b, 0), 1, 1e-12);
        const excl = dealerDistribution(c, up, h17, true);
        const total = c.slice(1).reduce((a, b) => a + b, 0);
        const noBj = up === 1 ? 1 - c[10] / total : up === 10 ? 1 - c[1] / total : 1;
        near(excl.reduce((a, b) => a + b, 0), noBj, 1e-12);
        assert.equal(excl[6], 0);
      }
    }
  }
});

test('hitting soft 17 raises the dealer bust rate with a 6 showing', () => {
  const s17 = dealerDistribution(hugeShoe(6), 6, false);
  const h17 = dealerDistribution(hugeShoe(6), 6, true);
  assert.ok(h17[5] > s17[5] + 0.01);
  assert.ok(h17[0] < s17[0]);
});

test('standValue compares totals correctly', () => {
  const d = new Float64Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.4, 0.1]);
  near(standValue(d, 16), 0.4 - 0.5 - 0.1, 1e-12);
  near(standValue(d, 19), 0.4 + 0.2 - 0.2 - 0.1, 1e-12);
  near(standValue(d, 21), 0.4 + 0.4 - 0.1, 1e-12);
});

test('split hand counts: no resplit gives two hands; resplitting adds expected hands', () => {
  assert.deepEqual(splitHandCounts(0.1, 2, true).map((x) => Number(x.toFixed(10))), [1.8, 0.2]);
  assert.deepEqual(splitHandCounts(0.1, 4, false).map((x) => Number(x.toFixed(10))), [1.8, 0.2]);
  const [a, b] = splitHandCounts(0.1, 4, true);
  assert.ok(a + b > 2 && a + b < 4);
  near(splitHandCounts(0, 4, true)[0], 2, 1e-12);
});

test('next-card probabilities account for a hole card known not to complete blackjack', () => {
  const c = fullShoeCounts(1);
  c[1] -= 1; // dealer ace up
  const total = 51;
  const p = nextCardProbabilities(c, 1, true);
  near(p.reduce((a, b) => a + b, 0), 1, 1e-12);
  near(p[10], 16 / (total - 1), 1e-12);
  const plain = nextCardProbabilities(c, 1, false);
  near(plain[10], 16 / total, 1e-12);
});

const RULES = { dealerHitsSoft17: false, doubleAfterSplit: true, doubleOn: 'any', maxSplitHands: 4, resplitAces: false };

function analyze(decks, up, ranks, rules = RULES) {
  const c = fullShoeCounts(decks);
  c[up] -= 1;
  return new Engine(c, up, rules).analyze(ranks, { double: true, surrender: true, split: ranks[0] === ranks[1] });
}

test('well-known expected values (6 decks, S17, DAS)', () => {
  const sixteen = analyze(6, 10, [10, 6]);
  near(sixteen.stand, -0.541, 0.003, '16 v 10 stand');
  near(sixteen.hit, -0.535, 0.003, '16 v 10 hit');
  assert.ok(sixteen.hit > sixteen.stand && sixteen.surrender > sixteen.hit);
  const eleven = analyze(6, 6, [5, 6]);
  assert.ok(eleven.double > eleven.hit && eleven.double > 0.6);
  const aces = analyze(6, 10, [1, 1]);
  assert.ok(aces.split > 0.1 && aces.split > aces.hit);
  const nines = analyze(6, 7, [9, 9]);
  assert.ok(nines.stand > nines.split);
  const eights = analyze(6, 10, [8, 8]);
  assert.ok(eights.split > eights.surrender);
  const twenty = analyze(6, 6, [10, 10]);
  assert.ok(twenty.stand > twenty.split);
});

test('expected values are conditioned on the dealer not having blackjack', () => {
  const r = analyze(6, 1, [10, 10]);
  // Standing on 20 against an ace that is known not to be blackjack wins far more than it loses.
  assert.ok(r.stand > 0.1);
  const s = analyze(6, 10, [10, 10]);
  assert.ok(s.stand > 0.5);
});

test('dealerOutlook normalises after the blackjack check', () => {
  const c = fullShoeCounts(6);
  c[10] -= 1;
  c[6] -= 1;
  c[10] -= 1;
  const o = dealerOutlook(c, 10, { dealerHitsSoft17: false });
  near(o.afterCheck.reduce((a, b) => a + b, 0), 1, 1e-12);
  assert.equal(o.afterCheck[6], 0);
  assert.ok(o.blackjackChance > 0.07 && o.blackjackChance < 0.08);
  assert.equal(o.conditioned, true);
});

test('analyze throws when the cards are not in the shoe', () => {
  const c = fullShoeCounts(1);
  c[1] -= 1;
  const engine = new Engine(c, 1, RULES);
  assert.throws(() => engine.analyze([1, 1, 1, 1], {}));
});
