import { rankValue } from './cards.js';

/**
 * Evaluate a blackjack hand.
 * `fromSplit` matters because an ace and a ten after a split count as 21, not blackjack.
 */
export function evaluateHand(cards, { fromSplit = false } = {}) {
  let hard = 0;
  let aces = 0;
  for (const card of cards) {
    const v = rankValue(card.rank);
    hard += v;
    if (v === 1) aces += 1;
  }
  const soft = aces > 0 && hard + 10 <= 21;
  const total = soft ? hard + 10 : hard;
  const cardCount = cards.length;
  const pair = cardCount === 2 && rankValue(cards[0].rank) === rankValue(cards[1].rank);
  return {
    hard,
    total,
    soft,
    cardCount,
    blackjack: cardCount === 2 && total === 21 && !fromSplit,
    bust: hard > 21,
    pair,
    pairValue: pair ? rankValue(cards[0].rank) : null,
  };
}

/** 'Soft 18', 'Hard 16', 'Blackjack', 'Bust (24)', 'Pair of 8s'. */
export function describeTotal(info, { showPair = false } = {}) {
  if (info.cardCount === 0) return 'No cards';
  if (info.blackjack) return 'Blackjack';
  if (info.bust) return `Bust (${info.hard})`;
  if (showPair && info.pair) return `Pair of ${pairName(info.pairValue)}`;
  return `${info.soft ? 'Soft' : 'Hard'} ${info.total}`;
}

export function pairName(value) {
  if (value === 1) return 'aces';
  if (value === 10) return 'tens';
  if (value === 6) return 'sixes';
  return `${value}s`;
}

/** Short total string for card badges: '18', 'A,7 = soft 18' style is left to the UI. */
export function totalBadge(info) {
  if (info.cardCount === 0) return '';
  if (info.blackjack) return 'BJ';
  if (info.bust) return String(info.hard);
  if (info.soft && info.total !== 21) return `${info.total - 10}/${info.total}`;
  return String(info.total);
}
