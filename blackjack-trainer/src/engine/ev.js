// Composition-dependent blackjack probability engine.
//
// Math ranks: 1 = ace, 2..9, 10 = any ten-value card. A shoe composition is an
// array `counts[1..10]` of remaining cards.
//
// Hole-card conditioning: when the dealer shows an Ace or a 10 and has already
// checked for blackjack, every player decision is made knowing the hole card
// does not complete a blackjack. Because the player never sees the hole card,
// cards are exchangeable, so we may treat the hole card as drawn *after* the
// player's cards. We therefore compute "unconditioned" values
//     U = E[payoff * 1{hole card does not make blackjack}]
// with ordinary draw probabilities, and divide by P(no blackjack) once at the
// decision point. Comparing U values at one decision point is equivalent to
// comparing conditional expectations, so the optimal choices are unchanged.

// Dealer outcome vector: [17, 18, 19, 20, 21, bust, blackjack].
export const OUT_BUST = 5;
export const OUT_BJ = 6;
export const OUTCOME_LABELS = ['17', '18', '19', '20', '21', 'Bust', 'Blackjack'];

// Multiset codes: 5 bits per rank, enough for 31 copies of each rank in a hand.
const MUL = [0];
for (let r = 1; r <= 10; r += 1) MUL.push(2 ** (5 * (r - 1)));

// --- Dealer drawing graph ---------------------------------------------------
// The dealer keeps drawing only while the hand is below 17 (or soft 17 under
// H17), so every non-final dealer state has drawn at most 15 points of cards
// beyond the up card. We enumerate those multisets once and wire up an
// index-based transition table, which keeps the dealer recursion allocation-free.
const MAX_DRAWN = 15;
const NODE_CHILD = [];
(function buildDealerGraph() {
  const index = new Map([[0, 0]]);
  const sums = [0];
  const queue = [0];
  const codes = [0];
  while (queue.length) {
    const node = queue.shift();
    const code = codes[node];
    const sum = sums[node];
    const row = new Int32Array(11).fill(-1);
    for (let r = 1; r <= 10; r += 1) {
      if (sum + r > MAX_DRAWN) continue;
      const childCode = code + MUL[r];
      let child = index.get(childCode);
      if (child === undefined) {
        child = codes.length;
        index.set(childCode, child);
        codes.push(childCode);
        sums.push(sum + r);
        queue.push(child);
      }
      row[r] = child;
    }
    NODE_CHILD[node] = row;
  }
})();
const NODE_COUNT = NODE_CHILD.length;
const memoStamp = new Int32Array(NODE_COUNT);
const memoVal = new Float64Array(NODE_COUNT * 7);
let stamp = 0;

/**
 * Probability of each dealer outcome given the up card and the cards still in
 * the shoe (the up card must already be removed from `counts`).
 * With `excludeBlackjack`, hole cards that would complete a dealer blackjack are
 * skipped without renormalising: the vector then sums to P(no dealer blackjack).
 */
export function dealerDistribution(counts, up, hitSoft17, excludeBlackjack = false) {
  const wc = counts.slice(0, 11);
  let wt = 0;
  for (let r = 1; r <= 10; r += 1) wt += wc[r];
  const bjRank = up === 1 ? 10 : up === 10 ? 1 : 0;
  stamp += 1;
  if (stamp > 2e9) {
    memoStamp.fill(0);
    stamp = 1;
  }

  function rec(node, hard, soft, n) {
    const base = node * 7;
    if (memoStamp[node] === stamp) return base;
    for (let i = 0; i < 7; i += 1) memoVal[base + i] = 0;
    const tot = wt;
    for (let r = 1; r <= 10; r += 1) {
      const k = wc[r];
      if (k === 0) continue;
      if (n === 1 && r === bjRank && excludeBlackjack) continue;
      const p = k / tot;
      const nh = hard + r;
      if (nh > 21) {
        memoVal[base + OUT_BUST] += p;
        continue;
      }
      const ns = soft || r === 1;
      const best = ns && nh + 10 <= 21 ? nh + 10 : nh;
      if (best >= 17 && !(hitSoft17 && ns && nh === 7)) {
        if (n === 1 && best === 21) memoVal[base + OUT_BJ] += p;
        else memoVal[base + best - 17] += p;
        continue;
      }
      wc[r] = k - 1;
      wt = tot - 1;
      const off = rec(NODE_CHILD[node][r], nh, ns, n + 1);
      wc[r] = k;
      wt = tot;
      for (let i = 0; i < 7; i += 1) memoVal[base + i] += p * memoVal[off + i];
    }
    memoStamp[node] = stamp;
    return base;
  }

  const off = rec(0, up, up === 1, 1);
  return Float64Array.from(memoVal.subarray(off, off + 7));
}

/** Expected value of standing on `total` against a dealer outcome vector. */
export function standValue(d, total) {
  let v = d[OUT_BUST] - d[OUT_BJ];
  for (let f = 17; f <= 21; f += 1) {
    const p = d[f - 17];
    if (total > f) v += p;
    else if (total < f) v -= p;
  }
  return v;
}

function bestTotal(hard, soft) {
  return soft && hard + 10 <= 21 ? hard + 10 : hard;
}

function canDoubleTotal(doubleOn, total, soft) {
  if (!doubleOn || doubleOn === 'any') return true;
  if (soft) return false;
  if (doubleOn === '10-11') return total === 10 || total === 11;
  return total >= 9 && total <= 11;
}

/**
 * Expected number of finished split hands whose second card was not the pair
 * rank (nA) and that received the pair rank but could not be re-split (nB),
 * assuming the player re-splits whenever the rules allow. `p` is the chance
 * that a split hand draws another card of the pair rank.
 */
export function splitHandCounts(p, maxHands, canResplit) {
  const memo = new Map();
  function f(k, h) {
    if (k === 0) return [0, 0];
    const key = k * 16 + h;
    const hit = memo.get(key);
    if (hit) return hit;
    const next = f(k - 1, h);
    let a = (1 - p) * (1 + next[0]);
    let b = (1 - p) * next[1];
    if (canResplit && h < maxHands) {
      const more = f(k + 1, h + 1);
      a += p * more[0];
      b += p * more[1];
    } else {
      a += p * next[0];
      b += p * (1 + next[1]);
    }
    const out = [a, b];
    memo.set(key, out);
    return out;
  }
  return f(2, 2);
}

/**
 * One engine per (shoe composition, dealer up card, rules). The composition
 * must already exclude the up card and every other card known to be out of
 * the shoe, but NOT the cards of the hand being analysed.
 */
export class Engine {
  constructor(base, up, rules) {
    this.base = Array.from(base.slice(0, 11));
    this.up = up;
    this.rules = rules;
    this.h17 = !!rules.dealerHitsSoft17;
    this.bjRank = up === 1 ? 10 : up === 10 ? 1 : 0;
    this.excludeBJ = rules.dealerPeeks !== false && this.bjRank !== 0;
    this.wc = Array.from(this.base);
    this.wt = this.wc.reduce((a, b) => a + b, 0);
    this.dealerCache = new Map();
    this.standCache = new Map();
    this.hitCache = new Map();
    this.splitEngines = new Map();
  }

  /** P(hole card does not complete a dealer blackjack) at the current composition. */
  weight() {
    return this.excludeBJ ? 1 - this.wc[this.bjRank] / this.wt : 1;
  }

  dealerAt(code) {
    let d = this.dealerCache.get(code);
    if (!d) {
      d = dealerDistribution(this.wc, this.up, this.h17, this.excludeBJ);
      this.dealerCache.set(code, d);
    }
    return d;
  }

  standU(code, total) {
    let v = this.standCache.get(code);
    if (v === undefined) {
      v = standValue(this.dealerAt(code), total);
      this.standCache.set(code, v);
    }
    return v;
  }

  // Value of hitting once and then playing on optimally (hit or stand).
  hitU(code, hard, soft) {
    let v = this.hitCache.get(code);
    if (v !== undefined) return v;
    v = 0;
    const tot = this.wt;
    for (let r = 1; r <= 10; r += 1) {
      const k = this.wc[r];
      if (k === 0) continue;
      const p = k / tot;
      this.wc[r] = k - 1;
      this.wt = tot - 1;
      const nh = hard + r;
      let sub;
      if (nh > 21) {
        sub = -this.weight();
      } else {
        const ns = soft || r === 1;
        const t = bestTotal(nh, ns);
        const c2 = code + MUL[r];
        const s = this.standU(c2, t);
        sub = t === 21 ? s : Math.max(s, this.hitU(c2, nh, ns));
      }
      this.wc[r] = k;
      this.wt = tot;
      v += p * sub;
    }
    this.hitCache.set(code, v);
    return v;
  }

  doubleU(code, hard, soft) {
    let v = 0;
    const tot = this.wt;
    for (let r = 1; r <= 10; r += 1) {
      const k = this.wc[r];
      if (k === 0) continue;
      const p = k / tot;
      this.wc[r] = k - 1;
      this.wt = tot - 1;
      const nh = hard + r;
      const sub = nh > 21 ? -this.weight() : this.standU(code + MUL[r], bestTotal(nh, soft || r === 1));
      this.wc[r] = k;
      this.wt = tot;
      v += p * sub;
    }
    return 2 * v;
  }

  /**
   * Split value for a pair of `x` (both cards already removed from wc).
   * Approximation used by most combinatorial analysers: each split hand is
   * valued with both pair cards out of the shoe, and re-splits are counted
   * through the expected number of hands they create.
   * `options` may override doubleAfterSplit / doubleOn / maxSplitHands / resplitAces.
   */
  splitU(x, options = {}) {
    let sub = this.splitEngines.get(x);
    if (!sub) {
      const base = this.base.slice();
      base[x] -= 1; // the second card of the pair belongs to the other hand
      sub = new Engine(base, this.up, this.rules);
      this.splitEngines.set(x, sub);
    }
    const rules = { ...this.rules, ...options };
    const das = rules.doubleAfterSplit !== false;
    const { pSame, same, other } = sub.splitHandDetail(x, das ? rules.doubleOn || 'any' : null);
    const canResplit = x !== 1 || !!rules.resplitAces;
    const [nA, nB] = splitHandCounts(pSame, rules.maxSplitHands || 4, canResplit);
    return nA * other + nB * same;
  }

  // Value of one split hand holding a single `x`, by second card: returns the
  // chance of drawing another `x`, the hand value in that case (played without
  // re-splitting), and the average value otherwise. `doubleOn` null = no DAS.
  splitHandDetail(x, doubleOn) {
    if (!this.splitDetailCache) this.splitDetailCache = new Map();
    const key = `${x}|${doubleOn}`;
    const cached = this.splitDetailCache.get(key);
    if (cached) return cached;
    this.wc[x] -= 1;
    this.wt -= 1;
    const codeX = MUL[x];
    const tot = this.wt;
    let pSame = 0;
    let same = 0;
    let otherSum = 0;
    for (let r = 1; r <= 10; r += 1) {
      const k = this.wc[r];
      if (k === 0) continue;
      const p = k / tot;
      this.wc[r] = k - 1;
      this.wt = tot - 1;
      const code = codeX + MUL[r];
      const hard = x + r;
      const soft = x === 1 || r === 1;
      const t = bestTotal(hard, soft);
      let v = this.standU(code, t);
      if (x !== 1) {
        if (t < 21) v = Math.max(v, this.hitU(code, hard, soft));
        if (doubleOn && canDoubleTotal(doubleOn, t, soft)) v = Math.max(v, this.doubleU(code, hard, soft));
      }
      this.wc[r] = k;
      this.wt = tot;
      if (r === x) {
        pSame = p;
        same = v;
      } else {
        otherSum += p * v;
      }
    }
    this.wc[x] += 1;
    this.wt += 1;
    const detail = { pSame, same, other: pSame < 1 ? otherSum / (1 - pSame) : 0 };
    this.splitDetailCache.set(key, detail);
    return detail;
  }

  /**
   * Expected values (per unit initially staked, conditioned on the dealer not
   * having blackjack when that has been checked) for a hand of math ranks.
   * `allow` flags say which actions the rules permit right now.
   */
  analyze(ranks, allow = {}) {
    let code = 0;
    let hard = 0;
    let soft = false;
    const removed = [];
    try {
      for (const r of ranks) {
        if (this.wc[r] <= 0) throw new Error('Those cards are not all available in this shoe');
        this.wc[r] -= 1;
        this.wt -= 1;
        removed.push(r);
        code += MUL[r];
        hard += r;
        if (r === 1) soft = true;
      }
      const total = bestTotal(hard, soft);
      if (hard > 21) return { bust: true };
      const w = this.weight();
      const ev = { stand: this.standU(code, total) / w };
      if (total < 21 || allow.hitOn21) ev.hit = this.hitU(code, hard, soft) / w;
      if (allow.double) ev.double = this.doubleU(code, hard, soft) / w;
      if (allow.surrender) ev.surrender = -0.5;
      if (allow.split && ranks.length === 2 && ranks[0] === ranks[1]) ev.split = this.splitU(ranks[0], allow.splitRules) / w;
      return ev;
    } finally {
      for (const r of removed) {
        this.wc[r] += 1;
        this.wt += 1;
      }
    }
  }
}

/**
 * Probability of each next card value, given that the dealer's hole card is
 * known not to complete a blackjack (when the dealer has checked).
 */
export function nextCardProbabilities(counts, up, dealerChecked = true) {
  const total = counts.slice(1, 11).reduce((a, b) => a + b, 0);
  const b = up === 1 ? 10 : up === 10 ? 1 : 0;
  const probs = new Array(11).fill(0);
  if (!dealerChecked || !b) {
    for (let r = 1; r <= 10; r += 1) probs[r] = counts[r] / total;
    return probs;
  }
  // The unseen hole card is one of the other cards, so the next card comes from total - 1.
  const cb = counts[b];
  for (let r = 1; r <= 10; r += 1) {
    probs[r] = r === b ? cb / (total - 1) : (counts[r] * (total - cb - 1)) / ((total - cb) * (total - 1));
  }
  return probs;
}

/** Normalised dealer outcome probabilities for display, plus the pre-check blackjack chance. */
export function dealerOutlook(counts, up, rules) {
  const bjRank = up === 1 ? 10 : up === 10 ? 1 : 0;
  const total = counts.slice(1, 11).reduce((a, b) => a + b, 0);
  const blackjackChance = bjRank ? counts[bjRank] / total : 0;
  const peeks = rules.dealerPeeks !== false;
  const raw = dealerDistribution(counts, up, !!rules.dealerHitsSoft17, peeks && bjRank !== 0);
  const sum = raw.reduce((a, b) => a + b, 0);
  const afterCheck = Array.from(raw, (p) => p / sum);
  const unconditional = Array.from(dealerDistribution(counts, up, !!rules.dealerHitsSoft17, false));
  return { afterCheck, unconditional, blackjackChance, conditioned: peeks && bjRank !== 0 };
}

export { MUL };
