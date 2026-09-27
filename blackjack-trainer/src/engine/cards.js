// Card model shared by the engine, the simulator, the UI and the screenshot reader.
//
// Display ranks are strings: 'A', '2'..'10', 'J', 'Q', 'K'.
// Math ranks are numbers 1..10 (ace = 1, every ten-value card = 10), which is
// all the probability engine needs because suits never matter in blackjack.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

const RANK_ALIASES = {
  a: 'A', ace: 'A', 1: 'A', 11: 'A',
  2: '2', two: '2', 3: '3', three: '3', 4: '4', four: '4', 5: '5', five: '5',
  6: '6', six: '6', 7: '7', seven: '7', 8: '8', eight: '8', 9: '9', nine: '9',
  10: '10', t: '10', ten: '10',
  j: 'J', jack: 'J', q: 'Q', queen: 'Q', k: 'K', king: 'K',
};

const SUIT_ALIASES = {
  s: 'S', spade: 'S', spades: 'S', '♠': 'S', '♤': 'S',
  h: 'H', heart: 'H', hearts: 'H', '♥': 'H', '♡': 'H',
  d: 'D', diamond: 'D', diamonds: 'D', '♦': 'D', '♢': 'D',
  c: 'C', club: 'C', clubs: 'C', '♣': 'C', '♧': 'C',
};

/** Canonical display rank for loose input ('ace', 't', 'k', 11 ...), or null. */
export function normalizeRank(input) {
  if (input === null || input === undefined) return null;
  const key = String(input).trim().toLowerCase();
  return RANK_ALIASES[key] || null;
}

export function normalizeSuit(input) {
  if (input === null || input === undefined) return null;
  const key = String(input).trim().toLowerCase();
  return SUIT_ALIASES[key] || null;
}

/** Math rank 1..10 for a display rank (ace = 1, 10/J/Q/K = 10). */
export function rankValue(rank) {
  const r = normalizeRank(rank);
  if (!r) throw new Error(`Unknown card rank: ${rank}`);
  if (r === 'A') return 1;
  if (r === 'J' || r === 'Q' || r === 'K' || r === '10') return 10;
  return Number(r);
}

export function isTenValue(rank) {
  return rankValue(rank) === 10;
}

export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

export function makeCard(rank, suit = null) {
  const r = normalizeRank(rank);
  if (!r) throw new Error(`Unknown card rank: ${rank}`);
  const s = suit === null || suit === undefined ? null : normalizeSuit(suit);
  if (suit && !s) throw new Error(`Unknown card suit: ${suit}`);
  return { rank: r, suit: s };
}

/**
 * Parse a single card token such as 'KH', 'K♥', '10s', 'Ts', 'a', 'ace'.
 * Returns null when the token is not a card.
 */
export function parseCard(token) {
  if (!token) return null;
  const text = String(token).trim();
  if (!text) return null;
  const whole = normalizeRank(text);
  if (whole) return { rank: whole, suit: null };
  const match = text.match(/^(10|[2-9]|[aAtTjJqQkK]|ace|king|queen|jack|ten)\s*(of\s+)?([sShHdDcC♠♥♦♣♤♡♢♧]|spades?|hearts?|diamonds?|clubs?)$/i);
  if (!match) return null;
  const rank = normalizeRank(match[1]);
  const suit = normalizeSuit(match[3]);
  return rank && suit ? { rank, suit } : null;
}

/** Short label like 'K♥' or 'K' when the suit is unknown. */
export function cardLabel(card) {
  return card.suit ? `${card.rank}${SUIT_SYMBOLS[card.suit]}` : card.rank;
}

/** Readable name like 'King of hearts' or 'King'. */
export function cardName(card) {
  const names = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
  const base = names[card.rank] || card.rank;
  return card.suit ? `${base} of ${SUIT_NAMES[card.suit]}` : base;
}

/** Label for a math rank, used in charts: 'A', '2'..'9', '10'. */
export function valueLabel(value) {
  return value === 1 ? 'A' : String(value);
}

/** Representative display rank for a math rank (10 -> '10'). */
export function valueToRank(value) {
  if (value === 1) return 'A';
  if (value >= 2 && value <= 10) return String(value);
  throw new Error(`Unknown card value: ${value}`);
}
