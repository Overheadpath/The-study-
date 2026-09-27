// One practice round: deal, insurance, dealer blackjack check, player
// decisions (hit / stand / double / split / surrender), dealer play and
// settlement in virtual practice chips. Pure logic with no DOM access.

import { evaluateHand } from './hand.js';
import { createShoe, secureRandomInt } from './shoe.js';
import { rankValue } from './cards.js';
import { recommend } from './strategy.js';
import { doubleAllowedForTotal, payoutMultiplier } from './rules.js';

/** Fixed practice stake per hand, in virtual chips. There is no wager choice. */
export const PRACTICE_STAKE = 10;

export function dealerShouldHit(cards, rules) {
  const info = evaluateHand(cards);
  if (info.total < 17) return true;
  return info.total === 17 && info.soft && !!rules.dealerHitsSoft17;
}

export class PracticeRound {
  /**
   * @param rules normalized rules
   * @param options.randomInt injectable RNG (tests); defaults to crypto
   * @param options.preset { player: [rank, rank], up: rank } fixes the starting cards (drills)
   * @param options.shoe a prepared shoe (e.g. createStackedShoe) instead of a fresh shuffle
   */
  constructor(rules, { randomInt = secureRandomInt, preset = null, stake = PRACTICE_STAKE, shoe = null } = {}) {
    this.rules = rules;
    this.stake = stake;
    this.shoe = shoe || createShoe(rules.decks, { randomInt });
    this.shoeSize = this.shoe.size;
    this.preset = preset;
    this.hands = [];
    this.dealer = { cards: [], revealed: false };
    this.active = 0;
    this.phase = 'new';
    this.insurance = null;
    this.peek = null; // 'blackjack' | 'no-blackjack' | null (dealer did not need to check)
    this.decisions = [];
    this.events = [];
    this.result = null;
  }

  get upCard() {
    return this.dealer.cards[0];
  }

  get activeHand() {
    return this.phase === 'player' ? this.hands[this.active] : null;
  }

  deal() {
    if (this.phase !== 'new') throw new Error('Round already dealt');
    const draw = (rank) => (rank ? this.shoe.drawRank(rank) : this.shoe.draw());
    const p = this.preset || {};
    const p1 = draw(p.player && p.player[0]);
    const up = draw(p.up);
    const p2 = draw(p.player && p.player[1]);
    const hole = this.shoe.draw();
    this.hands = [this.newHand([p1, p2])];
    this.dealer.cards = [up, hole];
    this.events.push({ type: 'deal' });
    if (rankValue(up.rank) === 1 && this.rules.offerInsurance) {
      this.phase = 'insurance';
    } else {
      this.afterInsurance();
    }
    return this;
  }

  newHand(cards, fromSplit = false) {
    const splitAces = fromSplit && rankValue(cards[0].rank) === 1;
    return { cards, stake: this.stake, doubled: false, fromSplit, splitAces, status: 'playing', result: null, net: 0 };
  }

  /** Insurance (and "even money") is offered when the dealer shows an ace. Basic strategy always declines. */
  decideInsurance(take) {
    if (this.phase !== 'insurance') throw new Error('Insurance is not being offered');
    this.insurance = { taken: !!take, stake: take ? this.stake / 2 : 0, net: 0 };
    this.decisions.push({
      kind: 'insurance',
      handIndex: 0,
      cards: this.hands[0].cards.slice(),
      upRank: this.upCard.rank,
      available: ['I', 'N'],
      recommended: 'N',
      chosen: take ? 'I' : 'N',
      correct: !take,
      evenMoney: evaluateHand(this.hands[0].cards).blackjack,
    });
    this.afterInsurance();
    return this;
  }

  afterInsurance() {
    const upValue = rankValue(this.upCard.rank);
    const dealerInfo = evaluateHand(this.dealer.cards);
    const playerInfo = evaluateHand(this.hands[0].cards);
    if (upValue === 1 || upValue === 10) {
      this.peek = dealerInfo.blackjack ? 'blackjack' : 'no-blackjack';
      this.events.push({ type: 'peek', blackjack: dealerInfo.blackjack });
    }
    if (this.insurance && this.insurance.taken) {
      this.insurance.net = dealerInfo.blackjack ? this.insurance.stake * 2 : -this.insurance.stake;
    }
    if (dealerInfo.blackjack || playerInfo.blackjack) {
      this.dealer.revealed = true;
      this.finish();
      return;
    }
    this.phase = 'player';
    this.active = 0;
    this.skipFinishedHands();
  }

  /** Actions the rules allow for the active hand. */
  availableActions() {
    const hand = this.activeHand;
    if (!hand) return [];
    const { rules } = this;
    const info = evaluateHand(hand.cards, { fromSplit: hand.fromSplit });
    const twoCards = hand.cards.length === 2;
    const canSplit = twoCards && info.pair && this.hands.length < rules.maxSplitHands && (!hand.splitAces || rules.resplitAces);
    if (hand.splitAces) return canSplit ? ['S', 'P'] : ['S'];
    const acts = [];
    if (info.total < 21) acts.push('H');
    acts.push('S');
    if (twoCards && doubleAllowedForTotal(rules, info) && (!hand.fromSplit || rules.doubleAfterSplit)) acts.push('D');
    if (canSplit) acts.push('P');
    if (twoCards && rules.surrender === 'late' && !hand.fromSplit && this.hands.length === 1) acts.push('R');
    return acts;
  }

  /** Basic-strategy recommendation for the active hand. */
  recommendation() {
    const hand = this.activeHand;
    if (!hand) return null;
    return recommend(this.rules, hand.cards, this.upCard.rank, this.availableActions());
  }

  /** Cards visible to the player other than the active hand (for probability calculations). */
  otherVisibleCards() {
    const cards = [this.upCard];
    this.hands.forEach((h, i) => {
      if (i !== this.active) cards.push(...h.cards);
    });
    return cards;
  }

  act(action, meta = {}) {
    if (this.phase !== 'player') throw new Error('No hand is waiting for a decision');
    const available = this.availableActions();
    if (!available.includes(action)) throw new Error(`${action} is not available for this hand`);
    const hand = this.hands[this.active];
    const rec = this.recommendation();
    this.decisions.push({
      kind: 'play',
      handIndex: this.active,
      cards: hand.cards.slice(),
      upRank: this.upCard.rank,
      fromSplit: hand.fromSplit,
      available,
      recommended: rec.action,
      code: rec.code,
      cell: { table: rec.cell.table, row: rec.cell.row, col: rec.cell.col },
      chosen: action,
      correct: action === rec.action,
      ...meta,
    });

    if (action === 'S') {
      hand.status = 'stand';
      this.nextHand();
    } else if (action === 'H') {
      hand.cards.push(this.shoe.draw());
      this.settleIfDone(hand);
    } else if (action === 'D') {
      hand.stake *= 2;
      hand.doubled = true;
      hand.cards.push(this.shoe.draw());
      hand.status = evaluateHand(hand.cards).bust ? 'bust' : 'stand';
      this.nextHand();
    } else if (action === 'R') {
      hand.status = 'surrendered';
      this.nextHand();
    } else if (action === 'P') {
      const [c1, c2] = hand.cards;
      const first = this.newHand([c1], true);
      const second = this.newHand([c2], true);
      this.hands.splice(this.active, 1, first, second);
      first.cards.push(this.shoe.draw());
      this.events.push({ type: 'split' });
      this.skipFinishedHands();
    }
    return this;
  }

  settleIfDone(hand) {
    const info = evaluateHand(hand.cards);
    if (info.bust) {
      hand.status = 'bust';
      this.nextHand();
    } else if (info.total === 21) {
      hand.status = 'stand';
      this.nextHand();
    }
  }

  nextHand() {
    this.active += 1;
    this.skipFinishedHands();
  }

  // Deal the second card to split hands as they come up, and auto-stand hands
  // that have no real decision (21, or split aces that cannot be re-split).
  skipFinishedHands() {
    while (this.active < this.hands.length) {
      const hand = this.hands[this.active];
      if (hand.status !== 'playing') {
        this.active += 1;
        continue;
      }
      if (hand.cards.length === 1) hand.cards.push(this.shoe.draw());
      const info = evaluateHand(hand.cards, { fromSplit: hand.fromSplit });
      const acts = this.availableActions();
      if (info.total === 21 || (acts.length === 1 && acts[0] === 'S')) {
        hand.status = 'stand';
        this.active += 1;
        continue;
      }
      return;
    }
    this.playDealer();
  }

  playDealer() {
    this.phase = 'dealer';
    this.dealer.revealed = true;
    const live = this.hands.some((h) => h.status === 'stand');
    if (live) {
      while (dealerShouldHit(this.dealer.cards, this.rules)) {
        this.dealer.cards.push(this.shoe.draw());
      }
    }
    this.finish();
  }

  finish() {
    const dealerInfo = evaluateHand(this.dealer.cards);
    const payout = payoutMultiplier(this.rules);
    for (const hand of this.hands) {
      const info = evaluateHand(hand.cards, { fromSplit: hand.fromSplit });
      if (dealerInfo.blackjack) {
        hand.result = info.blackjack ? 'push' : 'lose';
        hand.net = info.blackjack ? 0 : -hand.stake;
      } else if (info.blackjack) {
        hand.result = 'blackjack';
        hand.net = hand.stake * payout;
      } else if (hand.status === 'surrendered') {
        hand.result = 'surrender';
        hand.net = -hand.stake / 2;
      } else if (info.bust) {
        hand.result = 'bust';
        hand.net = -hand.stake;
      } else if (dealerInfo.bust || info.total > dealerInfo.total) {
        hand.result = 'win';
        hand.net = hand.stake;
      } else if (info.total < dealerInfo.total) {
        hand.result = 'lose';
        hand.net = -hand.stake;
      } else {
        hand.result = 'push';
        hand.net = 0;
      }
      if (hand.status === 'playing') hand.status = 'stand';
    }
    const insuranceNet = this.insurance ? this.insurance.net : 0;
    const handsNet = this.hands.reduce((s, h) => s + h.net, 0);
    this.phase = 'done';
    this.result = {
      net: handsNet + insuranceNet,
      insuranceNet,
      dealerTotal: dealerInfo.total,
      dealerBust: dealerInfo.bust,
      dealerBlackjack: dealerInfo.blackjack,
      dealerDrew: this.dealer.cards.length > 2,
      playerBlackjack: this.hands.length === 1 && evaluateHand(this.hands[0].cards).blackjack,
      outcome: handsNet + insuranceNet > 0 ? 'win' : handsNet + insuranceNet < 0 ? 'loss' : 'push',
    };
  }
}
