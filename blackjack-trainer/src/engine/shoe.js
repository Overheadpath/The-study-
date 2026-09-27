import { RANKS, SUITS, rankValue } from './cards.js';

// Unbiased random integer in [0, n) from the platform CSPRNG, with a
// Math.random fallback for environments without Web Crypto.
export function secureRandomInt(n) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('n must be a positive integer');
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    cryptoObj.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Deterministic PRNG (mulberry32) for tests and reproducible demos. Returns randomInt(n). */
export function seededRandomInt(seed) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const x = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(x * n);
  };
}

/** Fisher-Yates shuffle in place. */
export function shuffle(array, randomInt = secureRandomInt) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

export function buildDecks(decks) {
  const cards = [];
  for (let d = 0; d < decks; d += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit });
    }
  }
  return cards;
}

/**
 * A freshly shuffled shoe. `exclude` removes specific cards first (used when a
 * practice drill fixes the starting cards), matching by rank and, if given, suit.
 */
export function createShoe(decks, { randomInt = secureRandomInt, exclude = [] } = {}) {
  const cards = buildDecks(decks);
  for (const ex of exclude) {
    const idx = cards.findIndex((c) => c.rank === ex.rank && (!ex.suit || c.suit === ex.suit));
    if (idx === -1) throw new Error(`Card ${ex.rank}${ex.suit || ''} is not available in the shoe`);
    cards.splice(idx, 1);
  }
  shuffle(cards, randomInt);
  let next = 0;
  return {
    size: cards.length,
    get remaining() {
      return cards.length - next;
    },
    draw() {
      if (next >= cards.length) throw new Error('Shoe is empty');
      const card = cards[next];
      next += 1;
      return card;
    },
    /** Draw the first remaining card with this rank (used to build drill hands). */
    drawRank(rank) {
      for (let i = next; i < cards.length; i += 1) {
        if (cards[i].rank === rank) {
          const card = cards[i];
          cards.splice(i, 1);
          cards.splice(next, 0, card);
          next += 1;
          return card;
        }
      }
      throw new Error(`No ${rank} left in the shoe`);
    },
  };
}

/**
 * A shoe that deals the given cards in order (then fails). Used by tests and
 * to replay a known hand; `cards` are card objects or rank strings.
 */
export function createStackedShoe(cards) {
  const queue = cards.map((c) => (typeof c === 'string' ? { rank: c, suit: 'S' } : c));
  let next = 0;
  return {
    size: queue.length,
    get remaining() {
      return queue.length - next;
    },
    draw() {
      if (next >= queue.length) throw new Error('Stacked shoe is empty');
      const card = queue[next];
      next += 1;
      return card;
    },
    drawRank(rank) {
      const card = this.draw();
      if (card.rank !== rank) throw new Error(`Stacked shoe expected ${rank} but next card is ${card.rank}`);
      return card;
    },
  };
}

/** Math-rank counts (index 1..10) for a full shoe. */
export function fullShoeCounts(decks) {
  const counts = new Array(11).fill(0);
  for (let r = 1; r <= 9; r += 1) counts[r] = 4 * decks;
  counts[10] = 16 * decks;
  return counts;
}

/** Shoe counts with the given display cards removed. Throws if a card is impossible. */
export function countsWithout(decks, cards) {
  const counts = fullShoeCounts(decks);
  for (const card of cards) {
    const v = rankValue(card.rank);
    if (counts[v] <= 0) {
      throw new Error(`There are not enough ${v === 10 ? '10-value cards' : `${card.rank}s`} in a ${decks}-deck shoe for these hands`);
    }
    counts[v] -= 1;
  }
  return counts;
}
