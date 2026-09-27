import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PracticeRound, dealerShouldHit } from '../../src/engine/round.js';
import { createStackedShoe, seededRandomInt } from '../../src/engine/shoe.js';
import { normalizeRules } from '../../src/engine/rules.js';
import { makeCard } from '../../src/engine/cards.js';

// Stacked order: player 1, dealer up, player 2, dealer hole, then draws.
function round(order, rules = {}) {
  return new PracticeRound(normalizeRules(rules), { shoe: createStackedShoe(order) }).deal();
}

test('player blackjack pays 3:2 or 6:5', () => {
  const r = round(['A', '9', 'K', '7']);
  assert.equal(r.phase, 'done');
  assert.equal(r.result.net, 15);
  assert.equal(r.hands[0].result, 'blackjack');
  const r65 = round(['A', '9', 'K', '7'], { blackjackPayout: '6:5' });
  assert.equal(r65.result.net, 12);
});

test('dealer checks for blackjack with a 10 up and ends the round', () => {
  const r = round(['9', 'K', '7', 'A']);
  assert.equal(r.phase, 'done');
  assert.equal(r.peek, 'blackjack');
  assert.equal(r.result.net, -10);
  const push = round(['A', 'K', 'Q', 'A']);
  assert.equal(push.result.net, 0);
});

test('insurance is offered with an ace up; declining is the recorded correct play', () => {
  const r = round(['9', 'A', '7', '5', '10'], { offerInsurance: true });
  assert.equal(r.phase, 'insurance');
  r.decideInsurance(false);
  assert.equal(r.decisions[0].correct, true);
  assert.equal(r.phase, 'player');
  assert.equal(r.peek, 'no-blackjack');
});

test('taking insurance pays 2:1 when the dealer has blackjack', () => {
  const r = round(['9', 'A', '7', 'K']);
  r.decideInsurance(true);
  assert.equal(r.decisions[0].correct, false);
  assert.equal(r.phase, 'done');
  assert.equal(r.insurance.net, 10);
  assert.equal(r.result.net, 0);
  const lost = round(['9', 'A', '7', '5', '10']);
  lost.decideInsurance(true);
  assert.equal(lost.insurance.net, -5);
});

test('even money on a blackjack against an ace', () => {
  const r = round(['A', 'A', 'K', '6']);
  r.decideInsurance(true);
  assert.equal(r.decisions[0].evenMoney, true);
  assert.equal(r.result.net, 10);
});

test('stand and dealer draws to 17; S17 stands on soft 17', () => {
  const r = round(['10', '6', '8', 'A']);
  assert.deepEqual(r.availableActions(), ['H', 'S', 'D', 'R']);
  r.act('S');
  assert.equal(r.dealer.cards.length, 2);
  assert.equal(r.result.dealerTotal, 17);
  assert.equal(r.hands[0].result, 'win');
  assert.equal(r.result.net, 10);
});

test('H17 dealer hits soft 17', () => {
  const r = round(['10', '6', '8', 'A', '3'], { dealerHitsSoft17: true });
  r.act('S');
  assert.equal(r.dealer.cards.length, 3);
  assert.equal(r.result.dealerTotal, 20);
  assert.equal(r.hands[0].result, 'lose');
});

test('dealerShouldHit follows the soft-17 rule', () => {
  const soft17 = [makeCard('A'), makeCard('6')];
  assert.equal(dealerShouldHit(soft17, { dealerHitsSoft17: false }), false);
  assert.equal(dealerShouldHit(soft17, { dealerHitsSoft17: true }), true);
  assert.equal(dealerShouldHit([makeCard('10'), makeCard('7')], { dealerHitsSoft17: true }), false);
  assert.equal(dealerShouldHit([makeCard('10'), makeCard('6')], { dealerHitsSoft17: false }), true);
});

test('double doubles the stake and deals exactly one card', () => {
  const r = round(['6', '6', '5', '10', '10', '10']);
  r.act('D');
  assert.equal(r.hands[0].cards.length, 3);
  assert.equal(r.hands[0].stake, 20);
  assert.equal(r.result.dealerTotal, 26);
  assert.equal(r.result.net, 20);
});

test('surrender loses half the stake and the dealer does not draw', () => {
  const r = round(['10', '10', '6', '6']);
  r.act('R');
  assert.equal(r.result.net, -5);
  assert.equal(r.dealer.cards.length, 2);
  assert.equal(r.hands[0].result, 'surrender');
});

test('bust loses immediately and the dealer does not draw', () => {
  const r = round(['10', '6', '6', '6', 'K']);
  r.act('H');
  assert.equal(r.hands[0].result, 'bust');
  assert.equal(r.dealer.cards.length, 2);
  assert.equal(r.result.net, -10);
});

test('splitting creates two hands dealt one after the other, with DAS', () => {
  // player 8,8 vs 6; hand 1 gets 3 (11) and doubles on 10; hand 2 gets 10 (18) stands; dealer 6,10,10 busts.
  const r = round(['8', '6', '8', '10', '3', '10', '10', '10']);
  r.act('P');
  assert.equal(r.hands.length, 2);
  assert.equal(r.active, 0);
  assert.equal(r.hands[1].cards.length, 1);
  assert.ok(r.availableActions().includes('D'));
  assert.ok(!r.availableActions().includes('R'));
  r.act('D');
  assert.equal(r.active, 1);
  assert.equal(r.hands[1].cards.length, 2);
  r.act('S');
  assert.equal(r.phase, 'done');
  assert.equal(r.result.dealerBust, true);
  assert.equal(r.result.net, 30);
});

test('no double after split when DAS is off, and split 21 is not blackjack', () => {
  const r = round(['A', '6', 'A', '10', 'K', '9', '10'], { doubleAfterSplit: false });
  r.act('P');
  // Split aces take one card each and stand automatically.
  assert.equal(r.phase, 'done');
  assert.equal(r.hands[0].result, 'win');
  assert.equal(r.hands[0].net, 10);
  const r2 = round(['8', '6', '8', '10', '3', '10', '10', '10'], { doubleAfterSplit: false });
  r2.act('P');
  assert.ok(!r2.availableActions().includes('D'));
});

test('split limit and ace resplitting', () => {
  const r = round(['8', '6', '8', '10', '8', '8', '8'], { maxSplitHands: 2 });
  r.act('P');
  assert.ok(!r.availableActions().includes('P'));
  const aces = round(['A', '6', 'A', '10', 'A', '5', '9', '10'], { resplitAces: true, maxSplitHands: 4 });
  aces.act('P');
  assert.deepEqual(aces.availableActions(), ['S', 'P']);
  const noRsa = round(['A', '6', 'A', '10', 'A', '5', '9', '10'], { resplitAces: false });
  noRsa.act('P');
  assert.equal(noRsa.hands[0].status, 'stand');
});

test('restricted doubling', () => {
  const r = round(['5', '6', '4', '10'], { doubleOn: '10-11' });
  assert.ok(!r.availableActions().includes('D'));
  const r2 = round(['6', '6', '4', '10'], { doubleOn: '10-11' });
  assert.ok(r2.availableActions().includes('D'));
});

test('decisions are recorded with the basic-strategy recommendation', () => {
  const r = round(['10', '10', '2', '7', 'K'], { surrender: 'none' });
  r.act('H');
  const d = r.decisions[0];
  assert.equal(d.recommended, 'H');
  assert.equal(d.correct, true);
  assert.equal(d.cell.table, 'hard');
  assert.equal(d.cell.row, 12);
  const s = round(['10', '6', '2', '10', 'K'], { surrender: 'none' });
  s.act('H');
  assert.equal(s.decisions[0].recommended, 'S');
  assert.equal(s.decisions[0].correct, false);
});

test('random rounds always finish and settle consistently', () => {
  const rules = normalizeRules({ decks: 2, surrender: 'late', resplitAces: true });
  const rnd = seededRandomInt(99);
  for (let i = 0; i < 2000; i += 1) {
    const r = new PracticeRound(rules, { randomInt: rnd }).deal();
    if (r.phase === 'insurance') r.decideInsurance(i % 2 === 0);
    let guard = 0;
    while (r.phase === 'player') {
      const acts = r.availableActions();
      r.act(acts[rnd(acts.length)]);
      guard += 1;
      assert.ok(guard < 40);
    }
    assert.equal(r.phase, 'done');
    const sum = r.hands.reduce((s, h) => s + h.net, 0) + r.result.insuranceNet;
    assert.equal(sum, r.result.net);
    assert.ok(r.hands.length <= rules.maxSplitHands);
  }
});

test('drill presets deal the requested starting cards', () => {
  const r = new PracticeRound(normalizeRules({}), { randomInt: seededRandomInt(5), preset: { player: ['A', '7'], up: '9' } }).deal();
  assert.deepEqual(r.hands[0].cards.map((c) => c.rank), ['A', '7']);
  assert.equal(r.upCard.rank, '9');
});
