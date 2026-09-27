// Practice history and the statistics derived from it. Decision accuracy
// (skill) is kept separate from hand results (luck): a correct play can lose
// and a wrong play can win in the short run.

import { UP_ORDER } from './strategy.js';
import { rankValue } from './cards.js';
import { chartKey } from './rules.js';

export const MAX_DECISIONS = 5000;
export const MAX_ROUNDS = 3000;

export function emptyHistory() {
  return { version: 1, decisions: [], rounds: [] };
}

export function normalizeHistory(input) {
  if (!input || typeof input !== 'object') return emptyHistory();
  return {
    version: 1,
    decisions: Array.isArray(input.decisions) ? input.decisions.filter((d) => d && typeof d === 'object') : [],
    rounds: Array.isArray(input.rounds) ? input.rounds.filter((r) => r && typeof r === 'object') : [],
  };
}

function cardsText(cards) {
  return cards.map((c) => c.rank).join(',');
}

/**
 * Append a finished round to the history. `analyses` maps a decision index to
 * the expected values computed for it, so the cost of each mistake can be kept.
 */
export function recordRound(history, round, { hinted = new Set(), evs = new Map(), mode = 'random', now = Date.now() } = {}) {
  const key = chartKey(round.rules);
  round.decisions.forEach((d, i) => {
    const entry = {
      t: now,
      kind: d.kind,
      up: rankValue(d.upRank),
      cards: cardsText(d.cards),
      recommended: d.recommended,
      chosen: d.chosen,
      correct: d.correct,
      hinted: hinted.has(i),
      rules: key,
      mode,
    };
    if (d.kind === 'play') {
      entry.table = d.cell.table;
      entry.row = d.cell.row;
      entry.code = d.code;
      entry.split = !!d.fromSplit;
      const ev = evs.get(i);
      if (ev && ev[d.recommended] !== undefined && ev[d.chosen] !== undefined) {
        entry.evLoss = Math.max(0, ev[d.recommended] - ev[d.chosen]);
      }
    } else {
      entry.table = 'insurance';
      entry.row = 0;
    }
    history.decisions.push(entry);
  });
  const r = round.result;
  history.rounds.push({
    t: now,
    net: r.net,
    outcome: r.outcome,
    hands: round.hands.map((h) => ({ result: h.result, net: h.net, doubled: h.doubled })),
    dealerBust: r.dealerBust,
    dealerBlackjack: r.dealerBlackjack,
    dealerDrew: round.hands.some((h) => h.status === 'stand') && !r.dealerBlackjack,
    playerBlackjack: r.playerBlackjack,
    decisions: round.decisions.length,
    correct: round.decisions.filter((d) => d.correct).length,
    player: round.hands.map((hand) => cardsText(hand.cards)),
    dealer: cardsText(round.dealer.cards),
    plays: round.decisions.map((d, i) => ({ a: d.chosen, ok: d.correct, hint: hinted.has(i) })),
    up: rankValue(round.upCard.rank),
    rules: key,
    mode,
  });
  if (history.decisions.length > MAX_DECISIONS) history.decisions.splice(0, history.decisions.length - MAX_DECISIONS);
  if (history.rounds.length > MAX_ROUNDS) history.rounds.splice(0, history.rounds.length - MAX_ROUNDS);
  return history;
}

function tally() {
  return { n: 0, correct: 0 };
}

function rate(t) {
  return t.n ? t.correct / t.n : null;
}

export function cellKey(table, row, up) {
  return `${table}:${row}:${up}`;
}

/** Accuracy, trends and the learner's most frequent mistakes. Hinted decisions are excluded. */
export function decisionStats(history, { window = 25 } = {}) {
  const scored = history.decisions.filter((d) => !d.hinted);
  const overall = tally();
  const byCategory = { hard: tally(), soft: tally(), pairs: tally(), insurance: tally() };
  const byAction = { H: tally(), S: tally(), D: tally(), P: tally(), R: tally(), N: tally() };
  const cells = new Map();
  let evLost = 0;
  let evCounted = 0;
  const trend = [];
  const recent = [];
  for (const d of scored) {
    overall.n += 1;
    if (d.correct) overall.correct += 1;
    const cat = byCategory[d.table] || byCategory.hard;
    cat.n += 1;
    if (d.correct) cat.correct += 1;
    const act = byAction[d.recommended];
    if (act) {
      act.n += 1;
      if (d.correct) act.correct += 1;
    }
    if (typeof d.evLoss === 'number') {
      evLost += d.evLoss;
      evCounted += 1;
    }
    const key = cellKey(d.table, d.row, d.up);
    let cell = cells.get(key);
    if (!cell) {
      cell = { key, table: d.table, row: d.row, up: d.up, n: 0, errors: 0, recommended: d.recommended, code: d.code, wrong: {}, lastError: 0, examples: [] };
      cells.set(key, cell);
    }
    cell.n += 1;
    cell.recommended = d.recommended;
    cell.code = d.code || cell.code;
    if (!d.correct) {
      cell.errors += 1;
      cell.wrong[d.chosen] = (cell.wrong[d.chosen] || 0) + 1;
      cell.lastError = d.t;
      if (cell.examples.length < 3 && !cell.examples.includes(d.cards)) cell.examples.push(d.cards);
    }
    recent.push(d.correct ? 1 : 0);
    if (recent.length > window) recent.shift();
    if (overall.n >= Math.min(window, 5)) trend.push({ index: overall.n, accuracy: recent.reduce((a, b) => a + b, 0) / recent.length });
  }
  const mistakes = [...cells.values()]
    .filter((c) => c.errors > 0)
    .map((c) => ({
      ...c,
      errorRate: c.errors / c.n,
      commonWrong: Object.entries(c.wrong).sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.errors - a.errors || b.errorRate - a.errorRate || b.lastError - a.lastError);
  const last = scored.slice(-window);
  return {
    total: overall.n,
    correct: overall.correct,
    accuracy: rate(overall),
    recentAccuracy: last.length ? last.filter((d) => d.correct).length / last.length : null,
    hintedCount: history.decisions.length - scored.length,
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, { ...v, accuracy: rate(v) }])),
    byAction: Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, { ...v, accuracy: rate(v) }])),
    cells,
    mistakes,
    trend,
    evLostPer100: evCounted ? (evLost / evCounted) * 100 : null,
    evLostTotal: evLost,
  };
}

/** Hand results, streaks and the "does the last result predict the next?" check. */
export function resultStats(history) {
  const rounds = history.rounds;
  let net = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let blackjacks = 0;
  let dealerBusts = 0;
  let dealerDrew = 0;
  const afterWin = { n: 0, wins: 0 };
  const afterLoss = { n: 0, wins: 0 };
  let streak = 0;
  let streakKind = null;
  let longestWin = 0;
  let longestLoss = 0;
  const netSeries = [];
  rounds.forEach((r, i) => {
    net += r.net;
    netSeries.push(net);
    if (r.outcome === 'win') wins += 1;
    else if (r.outcome === 'loss') losses += 1;
    else pushes += 1;
    if (r.playerBlackjack) blackjacks += 1;
    if (r.dealerDrew) {
      dealerDrew += 1;
      if (r.dealerBust) dealerBusts += 1;
    }
    if (i > 0) {
      const prev = rounds[i - 1].outcome;
      const bucket = prev === 'win' ? afterWin : prev === 'loss' ? afterLoss : null;
      if (bucket) {
        bucket.n += 1;
        if (r.outcome === 'win') bucket.wins += 1;
      }
    }
    if (r.outcome === 'push') return;
    if (r.outcome === streakKind) streak += 1;
    else {
      streakKind = r.outcome;
      streak = 1;
    }
    if (streakKind === 'win') longestWin = Math.max(longestWin, streak);
    else longestLoss = Math.max(longestLoss, streak);
  });
  return {
    rounds: rounds.length,
    net,
    wins,
    losses,
    pushes,
    blackjacks,
    dealerBusts,
    dealerDrew,
    dealerBustRate: dealerDrew ? dealerBusts / dealerDrew : null,
    afterWin: { ...afterWin, rate: afterWin.n ? afterWin.wins / afterWin.n : null },
    afterLoss: { ...afterLoss, rate: afterLoss.n ? afterLoss.wins / afterLoss.n : null },
    longestWin,
    longestLoss,
    netSeries,
  };
}

/**
 * Pick a chart cell to drill, weighted towards the learner's mistakes.
 * Returns { table, row, up } or null when there are no mistakes yet.
 */
export function pickWeakSpot(stats, randomInt) {
  const candidates = stats.mistakes.filter((m) => m.table !== 'insurance');
  if (!candidates.length) return null;
  // Spots missed often, and at a high rate, come up most; spots you have since mastered fade out.
  const weights = candidates.map((m) => m.errors * m.errorRate + 0.05);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = (randomInt(1000000) / 1000000) * total;
  for (let i = 0; i < candidates.length; i += 1) {
    x -= weights[i];
    if (x <= 0) return { table: candidates[i].table, row: candidates[i].row, up: candidates[i].up };
  }
  const m = candidates[candidates.length - 1];
  return { table: m.table, row: m.row, up: m.up };
}

export const UP_LABELS = UP_ORDER.map((v) => (v === 1 ? 'A' : String(v)));
