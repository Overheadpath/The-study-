import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRank, parseCard, rankValue, makeCard, cardLabel } from '../../src/engine/cards.js';
import { evaluateHand, describeTotal, totalBadge } from '../../src/engine/hand.js';
import { normalizeRules, chartKey, doubleAllowedForTotal, payoutMultiplier, DEFAULT_RULES } from '../../src/engine/rules.js';
import { createShoe, fullShoeCounts, countsWithout, seededRandomInt, secureRandomInt, shuffle } from '../../src/engine/shoe.js';

const hand = (...ranks) => ranks.map((r) => makeCard(r));

test('rank parsing accepts common spellings', () => {
  assert.equal(normalizeRank('ace'), 'A');
  assert.equal(normalizeRank('t'), '10');
  assert.equal(normalizeRank(11), 'A');
  assert.equal(normalizeRank('k'), 'K');
  assert.equal(normalizeRank('x'), null);
  assert.deepEqual(parseCard('10s'), { rank: '10', suit: 'S' });
  assert.deepEqual(parseCard('K♥'), { rank: 'K', suit: 'H' });
  assert.deepEqual(parseCard('Td'), { rank: '10', suit: 'D' });
  assert.deepEqual(parseCard('queen of clubs'), { rank: 'Q', suit: 'C' });
  assert.equal(parseCard('zz'), null);
  assert.equal(rankValue('J'), 10);
  assert.equal(rankValue('A'), 1);
  assert.equal(cardLabel({ rank: 'K', suit: 'H' }), 'K♥');
});

test('hand evaluation: hard, soft, blackjack, bust, pairs', () => {
  const s18 = evaluateHand(hand('A', '7'));
  assert.equal(s18.total, 18);
  assert.equal(s18.soft, true);
  assert.equal(describeTotal(s18), 'Soft 18');
  assert.equal(totalBadge(s18), '8/18');
  const h17 = evaluateHand(hand('A', '6', 'K'));
  assert.equal(h17.total, 17);
  assert.equal(h17.soft, false);
  assert.equal(evaluateHand(hand('A', 'K')).blackjack, true);
  assert.equal(evaluateHand(hand('A', 'K'), { fromSplit: true }).blackjack, false);
  assert.equal(evaluateHand(hand('7', '7', 'A', '10')).bust, true);
  assert.equal(evaluateHand(hand('K', 'Q')).pair, true);
  assert.equal(evaluateHand(hand('K', 'Q')).pairValue, 10);
  assert.equal(evaluateHand(hand('A', 'A')).total, 12);
  assert.equal(evaluateHand(hand('A', 'A', 'A', 'A', '7')).total, 21);
});

test('rules normalisation repairs bad input', () => {
  const r = normalizeRules({ decks: 3, blackjackPayout: '2:1', surrender: 'early', maxSplitHands: 9, dealerHitsSoft17: 'yes' });
  assert.equal(r.decks, DEFAULT_RULES.decks);
  assert.equal(r.blackjackPayout, '3:2');
  assert.equal(r.surrender, DEFAULT_RULES.surrender);
  assert.equal(r.maxSplitHands, DEFAULT_RULES.maxSplitHands);
  assert.equal(r.dealerHitsSoft17, DEFAULT_RULES.dealerHitsSoft17);
  assert.equal(chartKey(normalizeRules({ decks: 2, dealerHitsSoft17: true, doubleAfterSplit: false })), '2D-H17-NDAS');
  assert.equal(payoutMultiplier({ blackjackPayout: '6:5' }), 1.2);
  assert.equal(doubleAllowedForTotal({ doubleOn: '10-11' }, { soft: false, total: 9 }), false);
  assert.equal(doubleAllowedForTotal({ doubleOn: '9-11' }, { soft: false, total: 9 }), true);
  assert.equal(doubleAllowedForTotal({ doubleOn: '9-11' }, { soft: true, total: 19 }), false);
  assert.equal(normalizeRules(null).decks, DEFAULT_RULES.decks);
});

test('shoes contain the right cards and shuffle without bias checks failing', () => {
  const shoe = createShoe(6, { randomInt: seededRandomInt(1) });
  assert.equal(shoe.size, 312);
  const seen = {};
  for (let i = 0; i < 312; i += 1) {
    const c = shoe.draw();
    seen[c.rank] = (seen[c.rank] || 0) + 1;
  }
  assert.equal(seen.A, 24);
  assert.equal(seen.K, 24);
  assert.throws(() => shoe.draw());
  assert.deepEqual(fullShoeCounts(1), [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
  assert.equal(countsWithout(1, hand('K', 'Q', 'A'))[10], 14);
  assert.throws(() => countsWithout(1, hand('A', 'A', 'A', 'A', 'A')));
});

test('secure random integers are in range and roughly uniform', () => {
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i += 1) counts[secureRandomInt(6)] += 1;
  for (const c of counts) assert.ok(c > 850 && c < 1150);
  const arr = shuffle([1, 2, 3, 4, 5], seededRandomInt(3));
  assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5]);
});

test('drawRank pulls a specific rank to the front', () => {
  const shoe = createShoe(1, { randomInt: seededRandomInt(2) });
  assert.equal(shoe.drawRank('A').rank, 'A');
  assert.equal(shoe.remaining, 51);
});
