import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision, explainDecision, analyzeInsurance, explainInsurance, explainUpCard, actionsForHand } from '../../src/engine/explain.js';
import { recordRound, decisionStats, resultStats, emptyHistory, pickWeakSpot, normalizeHistory } from '../../src/engine/stats.js';
import { presetForCell, randomPreset, valuesForCell } from '../../src/engine/drill.js';
import { simulateRounds } from '../../src/engine/simulate.js';
import { PracticeRound } from '../../src/engine/round.js';
import { normalizeRules } from '../../src/engine/rules.js';
import { makeCard } from '../../src/engine/cards.js';
import { createStackedShoe, seededRandomInt } from '../../src/engine/shoe.js';
import { loadState, saveState, exportState, importState } from '../../src/engine/storage.js';

const rules = normalizeRules({ decks: 6, surrender: 'late' });
const hand = (...ranks) => ranks.map((r) => makeCard(r));

function explain(cards, up, extra = {}) {
  const a = analyzeDecision({ rules: extra.rules || rules, cards: hand(...cards), upCard: makeCard(up), ...extra });
  return { a, ex: explainDecision(a) };
}

test('explanations match the decision category', () => {
  assert.match(explain(['10', '3'], '6').ex.principle.title, /stiff total against a weak/);
  assert.match(explain(['10', '6'], '10').ex.headline, /Surrender/);
  assert.match(explain(['10', '5'], '9').ex.principle.title, /stiff total against a strong/);
  assert.match(explain(['6', '5'], '6').ex.principle.title, /Double/);
  assert.match(explain(['A', '7'], '9').ex.principle.title, /soft 18/);
  assert.match(explain(['A', '6'], '4').ex.principle.title, /soft hand/);
  assert.match(explain(['8', '8'], '10').ex.principle.title, /Split 8s/);
  assert.match(explain(['K', 'Q'], '6').ex.principle.title, /Keep your 20/);
  assert.match(explain(['A', 'A'], '9').ex.principle.title, /Split aces/);
  assert.match(explain(['5', '5'], '9').ex.principle.title, /5,5/);
  assert.match(explain(['9', '9'], '7').ex.principle.title, /18 against a 7/);
  assert.match(explain(['10', '2'], '3').ex.principle.title, /12 against a 2 or 3/);
});

test('explanations report expected values for every allowed action and the long-run caveat', () => {
  const { a, ex } = explain(['10', '6'], '10');
  assert.deepEqual(ex.evRows.map((r) => r.action).sort(), ['D', 'H', 'R', 'S']);
  assert.equal(ex.evRows[0].best, true);
  assert.match(ex.caution, /cannot predict/);
  assert.ok(a.bustOnHit > 0.6 && a.bustOnHit < 0.63);
  assert.ok(ex.facts.some((f) => f.includes('busts')));
});

test('fallback note when the chart play is not available', () => {
  const { ex } = explain(['5', '4', '2'], '6', { available: ['H', 'S'] });
  assert.equal(ex.headline, 'Basic strategy: Hit');
  assert.ok(ex.notes.some((n) => n.kind === 'fallback' && /first two cards/.test(n.text)));
});

test('composition note when exact cards favour a different play than the chart', () => {
  const { ex } = explain(['4', '4', '4', '4'], '10', { rules: normalizeRules({ decks: 1, surrender: 'none' }), available: ['H', 'S'] });
  assert.equal(ex.headline, 'Basic strategy: Hit');
  assert.ok(ex.notes.some((n) => n.kind === 'composition'));
});

test('manual analysis availability', () => {
  assert.deepEqual(actionsForHand(rules, hand('8', '8')), ['H', 'S', 'D', 'P', 'R']);
  assert.deepEqual(actionsForHand(rules, hand('8', '8'), { fromSplit: true }), ['H', 'S', 'D', 'P']);
  assert.deepEqual(actionsForHand(rules, hand('8', '4', '3')), ['H', 'S']);
  assert.deepEqual(actionsForHand(rules, hand('A', 'K')), []);
});

test('insurance math', () => {
  const ins = analyzeInsurance({ rules: normalizeRules({ decks: 1 }), cards: hand('9', '7'), upCard: makeCard('A') });
  assert.equal(ins.unseen, 49);
  assert.equal(ins.tens, 16);
  assert.ok(ins.sideBetEv < 0);
  const ex = explainInsurance(ins);
  assert.equal(ex.headline, 'Basic strategy: No insurance');
  const bj = analyzeInsurance({ rules, cards: hand('A', 'K'), upCard: makeCard('A') });
  assert.ok(bj.declineEv > bj.insureEv);
});

test('up-card explanations classify strength', () => {
  const a = analyzeDecision({ rules, cards: hand('10', '6'), upCard: makeCard('5') });
  assert.equal(explainUpCard(5, a.outlook, rules).strength, 'weak');
  const b = analyzeDecision({ rules, cards: hand('10', '6'), upCard: makeCard('A') });
  assert.equal(explainUpCard(1, b.outlook, rules).strength, 'strong');
});

function playStacked(order, actions, r = rules) {
  const round = new PracticeRound(r, { shoe: createStackedShoe(order) }).deal();
  if (round.phase === 'insurance') round.decideInsurance(actions.shift() === 'I');
  for (const act of actions) round.act(act);
  return round;
}

test('statistics: accuracy, mistakes and independence buckets', () => {
  const history = emptyHistory();
  // Wrong: stand 12 vs 10. Right: hit 12 vs 10. Wrong again on the same cell.
  recordRound(history, playStacked(['10', '10', '2', '7', '5'], ['S']));
  recordRound(history, playStacked(['10', '10', '2', '7', '6'], ['H', 'S']));
  recordRound(history, playStacked(['10', '10', '2', '8'], ['S']));
  const stats = decisionStats(history);
  assert.equal(stats.total, 4);
  assert.equal(stats.correct, 2);
  assert.equal(stats.mistakes[0].key, 'hard:12:10');
  assert.equal(stats.mistakes[0].errors, 2);
  assert.equal(stats.mistakes[0].commonWrong, 'S');
  assert.deepEqual(history.rounds[0].player, ['10,2']);
  assert.equal(history.rounds[0].dealer, '10,7');
  assert.deepEqual(history.rounds[1].plays.map((p) => p.a), ['H', 'S']);
  const res = resultStats(history);
  assert.equal(res.rounds, 3);
  assert.equal(res.afterLoss.n + res.afterWin.n, 2);
  const spot = pickWeakSpot(stats, seededRandomInt(1));
  assert.deepEqual(spot, { table: 'hard', row: 12, up: 10 });
});

test('hinted decisions are excluded from accuracy', () => {
  const history = emptyHistory();
  recordRound(history, playStacked(['10', '10', '2', '7', '5'], ['S']), { hinted: new Set([0]) });
  const stats = decisionStats(history);
  assert.equal(stats.total, 0);
  assert.equal(stats.hintedCount, 1);
});

test('history normalisation tolerates junk', () => {
  assert.deepEqual(normalizeHistory({ decisions: 'x', rounds: [null, { net: 1 }] }).rounds, [{ net: 1 }]);
});

test('drill presets match the requested cell', () => {
  const rnd = seededRandomInt(11);
  assert.deepEqual(valuesForCell('soft', 18), [[1, 7]]);
  assert.equal(valuesForCell('hard', 20), null);
  const p = presetForCell({ table: 'hard', row: 16, up: 10 }, rnd);
  const v = p.player.map((r) => (['J', 'Q', 'K', '10'].includes(r) ? 10 : Number(r)));
  assert.equal(v[0] + v[1], 16);
  assert.notEqual(v[0], v[1]);
  for (const kind of ['hard', 'soft', 'pairs']) {
    for (let i = 0; i < 50; i += 1) {
      const preset = randomPreset(kind, rnd);
      const round = new PracticeRound(rules, { randomInt: rnd, preset }).deal();
      const first = round.hands[0].cards;
      if (kind === 'pairs') assert.equal(first[0].rank === first[1].rank || ['10', 'J', 'Q', 'K'].includes(first[0].rank), true);
      if (kind === 'soft') assert.ok(first.some((c) => c.rank === 'A'));
    }
  }
});

test('simulation shows no memory between rounds', () => {
  const sim = simulateRounds(rules, 3000, { seed: 3 });
  assert.equal(sim.count, 3000);
  assert.equal(sim.wins + sim.losses + sim.pushes, 3000);
  assert.ok(Math.abs(sim.afterWin.rate - sim.afterLoss.rate) < 0.06);
});

test('storage survives missing or broken storage', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadState(broken).rules.decks, 6);
  assert.equal(saveState({}, broken), false);
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const state = loadState(store);
  state.rules.decks = 2;
  saveState(state, store);
  assert.equal(loadState(store).rules.decks, 2);
  const text = exportState(state);
  assert.equal(importState(text).rules.decks, 2);
  assert.throws(() => importState('{"app":"other"}'));
});
