// Derives total-dependent basic strategy from the probability engine.
//
// For every dealer up card and every two-card starting hand, the engine
// computes the expected value of each action. Hands are then grouped by chart
// cell (hard total, soft total, or pair) and each action's value is averaged,
// weighted by how often that two-card hand is dealt when the dealer does not
// have blackjack. A cell stores the actions ranked best to worst; the
// recommendation is the best action the rules and hand allow. This is the
// standard method behind published basic-strategy charts.
//
// Used offline by scripts/build-charts.mjs and by the unit tests.

import { Engine } from './ev.js';
import { fullShoeCounts } from './shoe.js';

export const UP_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
export const HARD_ROWS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const SOFT_ROWS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const PAIR_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SPLIT_VARIANTS = [];
for (const doubleOn of ['any', '9-11', '10-11']) {
  for (const maxSplitHands of [2, 3, 4]) {
    for (const resplitAces of [false, true]) SPLIT_VARIANTS.push({ doubleOn, maxSplitHands, resplitAces });
  }
}

function sum(arr) {
  let s = 0;
  for (let i = 1; i <= 10; i += 1) s += arr[i];
  return s;
}

function ranking(evs, actions) {
  return actions.filter((a) => evs[a] !== undefined).sort((a, b) => evs[b] - evs[a]).join('');
}

function doubleAllowed(doubleOn, total, soft) {
  if (doubleOn === 'any') return true;
  if (soft) return false;
  if (doubleOn === '10-11') return total === 10 || total === 11;
  return total >= 9 && total <= 11;
}

/**
 * Build one chart. Returns { chart, hands } where chart = { hard, soft, pairs }
 * (rows keyed by total / pair value, each an array of 10 ranking strings in
 * UP_ORDER) and `hands` holds per-hand data for house-edge calculations.
 */
export function buildChart({ decks, dealerHitsSoft17, doubleAfterSplit }, { onProgress } = {}) {
  const rules = {
    dealerHitsSoft17,
    doubleAfterSplit,
    doubleOn: 'any',
    maxSplitHands: 4,
    resplitAces: false,
    dealerPeeks: true,
  };
  const acc = { hard: {}, soft: {} };
  const pairs = {};
  const pairNoSplit = {};
  const hands = [];
  const full = fullShoeCounts(decks);
  const fullTotal = sum(full);

  UP_ORDER.forEach((up, col) => {
    const base = full.slice();
    base[up] -= 1;
    const n = sum(base);
    const engine = new Engine(base, up, rules);
    const bjRank = up === 1 ? 10 : up === 10 ? 1 : 0;
    for (let a = 1; a <= 10; a += 1) {
      for (let b = a; b <= 10; b += 1) {
        if (a === b ? base[a] < 2 : base[a] < 1 || base[b] < 1) continue;
        const pHand = a === b ? (base[a] * (base[a] - 1)) / (n * (n - 1)) : (2 * base[a] * base[b]) / (n * (n - 1));
        const holeBj = bjRank ? base[bjRank] - (a === bjRank) - (b === bjRank) : 0;
        const pDealerBJ = holeBj / (n - 2);
        const natural = a === 1 && b === 10;
        const record = { up, a, b, pUp: full[up] / fullTotal, pHand, pDealerBJ, natural };
        hands.push(record);
        if (natural) continue;

        const raw = engine.analyze([a, b], { double: true, surrender: true, split: a === b });
        const evs = { H: raw.hit, S: raw.stand, D: raw.double, R: raw.surrender };
        record.evs = evs;
        if (a === b) {
          evs.P = raw.split;
          // splitU is unconditioned; dividing by P(no dealer blackjack) matches analyze().
          record.splitVariants = {};
          for (const variant of SPLIT_VARIANTS) {
            const key = `${variant.doubleOn}|${variant.maxSplitHands}|${variant.resplitAces ? 1 : 0}`;
            record.splitVariants[key] = engine.splitU(a, variant) / (1 - pDealerBJ);
          }
          pairs[a] = pairs[a] || new Array(10);
          pairs[a][col] = ranking(evs, ['P', 'H', 'S', 'D', 'R']);
          pairNoSplit[a] = pairNoSplit[a] || new Array(10);
          pairNoSplit[a][col] = ranking(evs, ['H', 'S', 'D', 'R']);
          continue;
        }
        const soft = a === 1;
        const total = soft ? a + b + 10 : a + b;
        const table = soft ? acc.soft : acc.hard;
        table[total] = table[total] || UP_ORDER.map(() => ({ w: 0, H: 0, S: 0, D: 0, R: 0 }));
        const cell = table[total][col];
        const weight = pHand * (1 - pDealerBJ);
        cell.w += weight;
        for (const act of ['H', 'S', 'D', 'R']) cell[act] += weight * evs[act];
      }
    }
    if (onProgress) onProgress(col + 1, UP_ORDER.length);
  });

  const hard = {};
  const soft = {};
  for (const [name, target] of [['hard', hard], ['soft', soft]]) {
    for (const [total, cells] of Object.entries(acc[name])) {
      target[total] = cells.map((c) => ranking({ H: c.H / c.w, S: c.S / c.w, D: c.D / c.w, R: c.R / c.w }, ['H', 'S', 'D', 'R']));
    }
  }
  // Totals that two non-pair cards cannot make come from the unsplit pair or are trivial.
  hard[4] = pairNoSplit[2];
  hard[20] = pairNoSplit[10];
  hard[21] = UP_ORDER.map(() => 'S');
  soft[12] = pairNoSplit[1];
  soft[21] = UP_ORDER.map(() => 'S');
  return { chart: { hard, soft, pairs }, hands };
}

/**
 * Long-run expected return (per unit staked, positive = player advantage) of
 * the chart's first decision followed by optimal play, for each rule variant
 * that does not change the chart itself. Also returns the probability of a
 * paid blackjack so other payouts can be derived linearly.
 */
export function expectedReturns({ chart, hands }) {
  const out = {};
  let naturalPaid = 0;
  for (const h of hands) {
    if (h.natural) naturalPaid += h.pUp * h.pHand * (1 - h.pDealerBJ);
  }
  for (const surrender of ['none', 'late']) {
    for (const variant of SPLIT_VARIANTS) {
      const key = `${variant.doubleOn}|${variant.maxSplitHands}|${variant.resplitAces ? 1 : 0}`;
      let ev = 0;
      for (const h of hands) {
        const p = h.pUp * h.pHand;
        if (h.natural) {
          ev += p * (1 - h.pDealerBJ) * 1.5;
          continue;
        }
        const col = UP_ORDER.indexOf(h.up);
        const isPair = h.a === h.b;
        const soft = h.a === 1 && !isPair;
        const total = soft ? h.a + h.b + 10 : h.a + h.b;
        const rank = isPair ? chart.pairs[h.a][col] : (soft ? chart.soft : chart.hard)[total][col];
        const evs = { ...h.evs };
        if (isPair) evs.P = h.splitVariants[key];
        let chosen = null;
        for (const act of rank) {
          if (act === 'R' && surrender !== 'late') continue;
          if (act === 'D' && !doubleAllowed(variant.doubleOn, isPair && h.a === 1 ? 12 : total, soft || (isPair && h.a === 1))) continue;
          chosen = act;
          break;
        }
        ev += p * (-h.pDealerBJ + (1 - h.pDealerBJ) * evs[chosen]);
      }
      out[`${surrender}|${key}`] = ev;
    }
  }
  return { returns: out, naturalPaid };
}
