// Ruleset model. Every option here changes either the basic-strategy chart,
// the long-run expected return, or both. The rules are for the practice
// simulator only; nothing here involves real money.

export const DECK_OPTIONS = [1, 2, 4, 6, 8];
export const PAYOUT_OPTIONS = ['3:2', '6:5', '1:1'];
export const DOUBLE_OPTIONS = ['any', '9-11', '10-11'];
export const SURRENDER_OPTIONS = ['none', 'late'];
export const SPLIT_HAND_OPTIONS = [2, 3, 4];

export const DEFAULT_RULES = Object.freeze({
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPayout: '3:2',
  doubleAfterSplit: true,
  surrender: 'late',
  doubleOn: 'any',
  maxSplitHands: 4,
  resplitAces: false,
  offerInsurance: true,
});

// Fixed assumptions, shown in the UI so learners know what the math covers.
export const FIXED_RULES = [
  'Dealer checks for blackjack when showing an Ace or a 10-value card (US hole-card rules).',
  'Split aces receive one card each and cannot be hit.',
  'Any two 10-value cards (for example J and Q) count as a pair.',
  'A fresh shoe is shuffled before every round, like most RNG games.',
];

export const PRESETS = [
  {
    id: 'shoe-s17',
    name: '6-deck shoe, dealer stands on soft 17',
    rules: { decks: 6, dealerHitsSoft17: false, blackjackPayout: '3:2', doubleAfterSplit: true, surrender: 'late', doubleOn: 'any', maxSplitHands: 4, resplitAces: false },
  },
  {
    id: 'shoe-h17',
    name: '8-deck shoe, dealer hits soft 17',
    rules: { decks: 8, dealerHitsSoft17: true, blackjackPayout: '3:2', doubleAfterSplit: true, surrender: 'none', doubleOn: 'any', maxSplitHands: 4, resplitAces: false },
  },
  {
    id: 'double-deck',
    name: 'Double deck, hits soft 17, no surrender',
    rules: { decks: 2, dealerHitsSoft17: true, blackjackPayout: '3:2', doubleAfterSplit: true, surrender: 'none', doubleOn: 'any', maxSplitHands: 4, resplitAces: false },
  },
  {
    id: 'single-deck-65',
    name: 'Single deck, 6:5 blackjack, no double after split',
    rules: { decks: 1, dealerHitsSoft17: true, blackjackPayout: '6:5', doubleAfterSplit: false, surrender: 'none', doubleOn: 'any', maxSplitHands: 2, resplitAces: false },
  },
  {
    id: 'restricted-double',
    name: '6-deck shoe, double on 10 or 11 only',
    rules: { decks: 6, dealerHitsSoft17: false, blackjackPayout: '3:2', doubleAfterSplit: false, surrender: 'none', doubleOn: '10-11', maxSplitHands: 3, resplitAces: false },
  },
];

function pick(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

/** Fill defaults and coerce invalid values, so stored settings can never break the app. */
export function normalizeRules(input = {}) {
  const src = input || {};
  return {
    decks: pick(Number(src.decks), DECK_OPTIONS, DEFAULT_RULES.decks),
    dealerHitsSoft17: typeof src.dealerHitsSoft17 === 'boolean' ? src.dealerHitsSoft17 : DEFAULT_RULES.dealerHitsSoft17,
    blackjackPayout: pick(src.blackjackPayout, PAYOUT_OPTIONS, DEFAULT_RULES.blackjackPayout),
    doubleAfterSplit: typeof src.doubleAfterSplit === 'boolean' ? src.doubleAfterSplit : DEFAULT_RULES.doubleAfterSplit,
    surrender: pick(src.surrender, SURRENDER_OPTIONS, DEFAULT_RULES.surrender),
    doubleOn: pick(src.doubleOn, DOUBLE_OPTIONS, DEFAULT_RULES.doubleOn),
    maxSplitHands: pick(Number(src.maxSplitHands), SPLIT_HAND_OPTIONS, DEFAULT_RULES.maxSplitHands),
    resplitAces: typeof src.resplitAces === 'boolean' ? src.resplitAces : DEFAULT_RULES.resplitAces,
    offerInsurance: typeof src.offerInsurance === 'boolean' ? src.offerInsurance : DEFAULT_RULES.offerInsurance,
  };
}

export function payoutMultiplier(rules) {
  if (rules.blackjackPayout === '6:5') return 1.2;
  if (rules.blackjackPayout === '1:1') return 1;
  return 1.5;
}

/** Key of the precomputed chart for these rules (decks, soft-17 rule, double after split). */
export function chartKey(rules) {
  return `${rules.decks}D-${rules.dealerHitsSoft17 ? 'H17' : 'S17'}-${rules.doubleAfterSplit ? 'DAS' : 'NDAS'}`;
}

/** Whether the ruleset allows doubling on a hand with this hard/soft total (ignores card count). */
export function doubleAllowedForTotal(rules, info) {
  if (rules.doubleOn === 'any') return true;
  if (info.soft) return false;
  if (rules.doubleOn === '10-11') return info.total === 10 || info.total === 11;
  return info.total >= 9 && info.total <= 11;
}

export function rulesSummary(rules) {
  return [
    `${rules.decks} deck${rules.decks === 1 ? '' : 's'}`,
    rules.dealerHitsSoft17 ? 'H17' : 'S17',
    `BJ pays ${rules.blackjackPayout}`,
    rules.doubleAfterSplit ? 'DAS' : 'No DAS',
    rules.surrender === 'late' ? 'Late surrender' : 'No surrender',
    rules.doubleOn === 'any' ? 'Double any 2' : `Double ${rules.doubleOn}`,
    `Split to ${rules.maxSplitHands}`,
  ].join(' · ');
}

export function describeRule(key, rules) {
  switch (key) {
    case 'decks':
      return `${rules.decks} deck${rules.decks === 1 ? '' : 's'} (${rules.decks * 52} cards) shuffled before every round.`;
    case 'dealerHitsSoft17':
      return rules.dealerHitsSoft17
        ? 'Dealer hits soft 17 (H17): the dealer draws again on hands like A,6.'
        : 'Dealer stands on soft 17 (S17): the dealer stops on every 17, soft or hard.';
    case 'blackjackPayout':
      return `A two-card 21 pays ${rules.blackjackPayout}.`;
    case 'doubleAfterSplit':
      return rules.doubleAfterSplit ? 'Doubling is allowed after splitting a pair (DAS).' : 'No doubling after a split.';
    case 'surrender':
      return rules.surrender === 'late'
        ? 'Late surrender: give up half the stake on your first two cards, after the dealer checks for blackjack.'
        : 'Surrender is not offered.';
    case 'doubleOn':
      if (rules.doubleOn === 'any') return 'Double down on any first two cards.';
      return `Double down only on hard ${rules.doubleOn.replace('-', ' to ')}.`;
    case 'maxSplitHands':
      return `Pairs can be split and re-split up to ${rules.maxSplitHands} hands${rules.resplitAces ? ', aces included' : '; aces split once'}.`;
    default:
      return '';
  }
}

export function sameRules(a, b) {
  const x = normalizeRules(a);
  const y = normalizeRules(b);
  return Object.keys(x).every((k) => x[k] === y[k]);
}
