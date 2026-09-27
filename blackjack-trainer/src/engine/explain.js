// Turns the probability engine's numbers into plain-language explanations of
// why basic strategy recommends a play. Everything here describes long-run
// averages; nothing predicts the outcome of a specific hand.

import { Engine, dealerOutlook, nextCardProbabilities, OUT_BUST } from './ev.js';
import { countsWithout } from './shoe.js';
import { evaluateHand } from './hand.js';
import { rankValue } from './cards.js';
import { recommend, ACTION_NAMES, cellLabel } from './strategy.js';
import { doubleAllowedForTotal, payoutMultiplier } from './rules.js';

export const LONG_RUN_NOTE =
  'Expected values are long-run averages over many identical situations. They cannot predict how this particular hand will turn out.';

const EV_KEYS = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };

export function pct(p, digits = 1) {
  return `${(p * 100).toFixed(digits)}%`;
}

export function signedEv(v, digits = 3) {
  const text = Math.abs(v).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${v > 0 ? '+' : '−'}${text}`;
}

/** 'loses about 54 units per 100 staked' style phrasing. */
export function per100(v) {
  const n = Math.abs(v * 100);
  const amount = n >= 10 ? n.toFixed(0) : n.toFixed(1);
  if (Number(amount) === 0) return 'breaks even';
  return v > 0 ? `wins about ${amount} per 100 units staked` : `loses about ${amount} per 100 units staked`;
}

function upName(up) {
  if (up === 1) return 'ace';
  return String(up);
}

/** 'an ace', 'an 8', 'a 10', 'a 6'. */
function aCard(up) {
  return up === 1 || up === 8 ? `an ${upName(up)}` : `a ${upName(up)}`;
}

function hasAce(cards) {
  return cards.some((c) => rankValue(c.rank) === 1);
}

/** Actions allowed on a hand when there is no live round (manual analysis). */
export function actionsForHand(rules, cards, { fromSplit = false, handsInPlay = 1 } = {}) {
  const info = evaluateHand(cards, { fromSplit });
  if (info.bust || info.blackjack) return [];
  const acts = [];
  if (info.total < 21) acts.push('H');
  acts.push('S');
  const two = cards.length === 2;
  if (two && doubleAllowedForTotal(rules, info) && (!fromSplit || rules.doubleAfterSplit)) acts.push('D');
  if (two && info.pair && handsInPlay < rules.maxSplitHands && (info.pairValue !== 1 || !fromSplit || rules.resplitAces)) acts.push('P');
  if (two && rules.surrender === 'late' && !fromSplit && handsInPlay === 1) acts.push('R');
  return acts;
}

/**
 * Numbers behind one decision: exact expected values of every allowed action,
 * the dealer's outcome distribution, and what one more card would do.
 */
export function analyzeDecision({ rules, cards, upCard, otherCards = [], available, fromSplit = false }) {
  const info = evaluateHand(cards, { fromSplit });
  const up = rankValue(upCard.rank);
  const acts = available || actionsForHand(rules, cards, { fromSplit });
  const base = countsWithout(rules.decks, [upCard, ...otherCards]);
  const ranks = cards.map((c) => rankValue(c.rank));
  const handCounts = base.slice();
  for (const r of ranks) {
    if (handCounts[r] <= 0) throw new Error(`A ${rules.decks}-deck shoe does not contain all of these cards`);
    handCounts[r] -= 1;
  }
  const engine = new Engine(base, up, rules);
  const ev = info.bust
    ? {}
    : engine.analyze(ranks, { double: acts.includes('D'), surrender: acts.includes('R'), split: acts.includes('P') });
  const outlook = dealerOutlook(handCounts, up, rules);
  const next = nextCardProbabilities(handCounts, up, true);
  const ace = hasAce(cards);
  let bustOnHit = 0;
  const afterHit = {};
  for (let r = 1; r <= 10; r += 1) {
    const hard = info.hard + r;
    if (hard > 21) {
      bustOnHit += next[r];
      continue;
    }
    const soft = (ace || r === 1) && hard + 10 <= 21;
    const total = soft ? hard + 10 : hard;
    afterHit[total] = (afterHit[total] || 0) + next[r];
  }
  const d = outlook.afterCheck;
  let win = d[OUT_BUST];
  let push = 0;
  for (let f = 17; f <= 21; f += 1) {
    if (info.total > f) win += d[f - 17];
    else if (info.total === f) push += d[f - 17];
  }
  const rec = acts.length ? recommend(rules, cards, upCard.rank, acts) : null;
  const cardsLeft = handCounts.slice(1).reduce((a, b) => a + b, 0);
  return {
    rules,
    cards,
    upCard,
    up,
    info,
    fromSplit,
    available: acts,
    ev,
    rec,
    outlook,
    next,
    bustOnHit,
    afterHit,
    stand: { win, push, lose: Math.max(0, 1 - win - push) },
    cardsLeft,
    visibleCount: 1 + otherCards.length + cards.length,
  };
}

function evFor(a, action) {
  return a.ev[EV_KEYS[action]];
}

function unavailableReason(a, action) {
  const { rules, cards, fromSplit, info } = a;
  if (action === 'D') {
    if (cards.length > 2) return 'you can only double down on your first two cards';
    if (fromSplit && !rules.doubleAfterSplit) return 'these rules do not allow doubling after a split';
    if (!doubleAllowedForTotal(rules, info)) {
      return rules.doubleOn === 'any' ? 'doubling is not allowed here' : `these rules only allow doubling on hard ${rules.doubleOn.replace('-', ' to ')}`;
    }
    return 'doubling is not allowed here';
  }
  if (action === 'R') {
    if (rules.surrender !== 'late') return 'these rules do not offer surrender';
    if (fromSplit) return 'surrender is not allowed after splitting';
    if (cards.length > 2) return 'surrender is only possible on your first two cards';
    return 'surrender is not allowed here';
  }
  if (action === 'P') return `you already have the maximum of ${rules.maxSplitHands} hands`;
  return `${ACTION_NAMES[action].toLowerCase()} is not available`;
}

function pairPrinciple(a) {
  const { rec, up, outlook, bustOnHit, next } = a;
  const v = rec.cell.row;
  const act = rec.action;
  const bust = pct(outlook.afterCheck[OUT_BUST]);
  const d = upName(up);
  const tens = pct(next[10]);
  if (v === 1 && act === 'P') {
    return {
      title: 'Split aces: two starts worth 11',
      body: `Kept together, two aces are only a soft 12. Split, each ace starts a new hand worth 11, and ${tens} of the cards left are 10-valued, so many split aces become 21 (paid like any other win, not as a blackjack). Each split ace usually gets just one card, and that is still far better than playing a soft 12.`,
    };
  }
  if (v === 8 && act === 'P') {
    return {
      title: 'Split 8s: get away from 16',
      body: `Two eights make 16, the worst total in blackjack. Hitting it busts ${pct(bustOnHit)} of the time, and standing wins only when the dealer busts (${bust} with ${aCard(up)} showing). Two hands that each start with an 8 lose less on average, even against a strong dealer card.`,
    };
  }
  if (v === 10 && act === 'S') {
    return {
      title: 'Keep your 20',
      body: `Twenty already wins most of the time: standing wins ${pct(a.stand.win)}, pushes ${pct(a.stand.push)} and loses ${pct(a.stand.lose)} against the dealer's ${d}. Splitting would trade one excellent hand for two hands that each start from 10, and together those average less.`,
    };
  }
  if (v === 5 && act !== 'P') {
    return {
      title: 'Play 5,5 as a hard 10',
      body: `Two fives are worth more together. A hard 10 is a strong total because ${tens} of the cards left are 10-valued and turn it into 20. Split fives would start two hands from 5, which usually become stiff totals of 12 to 16.`,
    };
  }
  if (v === 9 && act === 'S' && up === 7) {
    return {
      title: 'Stand on 18 against a 7',
      body: `With a 7 showing, the dealer's most likely finish is 17 (${pct(outlook.afterCheck[0])}), which your 18 already beats. Splitting would break up a winning total.`,
    };
  }
  if (v === 9 && act === 'S') {
    return {
      title: 'Stand on 18 against a strong card',
      body: `The dealer's ${d} often finishes on 19 or more, which beats 18, but two hands starting from 9 fare even worse against such a strong card. Standing loses the least.`,
    };
  }
  if (v === 9 && act === 'P') {
    return {
      title: 'Split 9s: improve on 18',
      body: `18 is a decent total, but against the dealer's ${d} two hands that each start with a 9 do better on average. A 9 plus a 10-value card (${tens} of the cards left) makes 19.`,
    };
  }
  if (v === 4 && act === 'P') {
    return {
      title: 'Split 4s against a 5 or 6',
      body: `With doubling after a split allowed, each 4 often draws a 6 or 7 to make 10 or 11, which you can then double against a dealer card that busts ${bust} of the time. Kept together, 4,4 is only a hard 8.`,
    };
  }
  if (act === 'P') {
    return {
      title: 'Split a small pair against a weak dealer card',
      body: `As one hand, ${v},${v} is a poor total of ${v * 2}. The dealer's ${d} busts ${bust} of the time, and two hands that each start from ${v} win more (or lose less) on average than one ${v * 2}.`,
    };
  }
  if ([2, 3, 4, 6, 7].includes(v) && (act === 'H' || act === 'S')) {
    if (up >= 7 || up === 1) {
      return {
        title: "Don't split against a strong dealer card",
        body: `Two hands starting from ${v} against the dealer's ${d} would each face a dealer who finishes on 17 to 21 ${pct(1 - outlook.afterCheck[OUT_BUST])} of the time. Playing the pair as a hard ${v * 2} loses less.`,
      };
    }
    const das = a.rules.doubleAfterSplit;
    return {
      title: `Play ${v},${v} as a hard ${v * 2} here`,
      body:
        v === 4
          ? `Kept together, 4,4 is a hard 8 that cannot bust on the next card. Split, each hand starts from a 4, which usually needs two more cards${das ? '' : ' and cannot be doubled after the split'}, and against the dealer's ${d} that loses more on average.`
          : das
            ? `Split ${v}s make money mainly when the dealer busts. With ${aCard(up)} showing the dealer busts only ${bust} of the time, so splitting does not gain enough to beat playing the pair as a hard ${v * 2}.`
            : `Split ${v}s make money mainly when the dealer busts or when you can double after splitting. These rules do not allow doubling after a split, and with ${aCard(up)} showing the dealer busts only ${bust} of the time, so splitting does not gain enough to beat playing the pair as a hard ${v * 2}.`,
    };
  }
  return null;
}

function softPrinciple(a) {
  const { rec, up, outlook, info } = a;
  const t = info.total;
  const act = rec.action;
  const bust = outlook.afterCheck[OUT_BUST];
  const d = upName(up);
  if (act === 'D') {
    return {
      title: 'Double a soft hand against a weak dealer card',
      body: `One card can never bust a soft ${t}: a large card just turns the ace back into a 1. The dealer's ${d} busts ${pct(bust)} of the time, so adding a second stake while you cannot bust earns more over many hands.`,
    };
  }
  if (act === 'H' && t <= 17) {
    return {
      title: 'Hit soft hands below 18',
      body: `A soft ${t} counts the ace as 11, so the next card cannot bust you. ${t < 17 ? `Standing on ${t} loses to every dealer finish of 17 or more, so it only wins when the dealer busts (${pct(bust)}).` : 'Standing on 17 can at best push a dealer 17, and it only wins when the dealer busts.'} Taking a card improves the hand without any bust risk.`,
    };
  }
  if (act === 'H' && t === 18) {
    const nineteenPlus = outlook.afterCheck[2] + outlook.afterCheck[3] + outlook.afterCheck[4];
    return {
      title: 'Hit soft 18 against 9, 10 or ace',
      body: `Soft 18 feels safe, but against the dealer's ${d} it is behind: the dealer finishes on 19 or better ${pct(nineteenPlus)} of the time. One card cannot bust a soft 18, so trying to improve is worth more than standing.`,
    };
  }
  if (act === 'S' && t === 18) {
    return {
      title: 'Stand on soft 18',
      body: `18 is a winning total against the dealer's ${d}: standing wins ${pct(a.stand.win)} and loses ${pct(a.stand.lose)}. Hitting would risk turning a good total into a worse one.`,
    };
  }
  if (act === 'S') {
    return {
      title: 'Stand on a strong total',
      body: `Soft ${t} is a strong hand: standing wins ${pct(a.stand.win)}, pushes ${pct(a.stand.push)} and loses ${pct(a.stand.lose)}. Another card is more likely to make it worse than better.`,
    };
  }
  return null;
}

function hardPrinciple(a) {
  const { rec, up, outlook, info, bustOnHit, next } = a;
  const t = info.total;
  const act = rec.action;
  const bust = outlook.afterCheck[OUT_BUST];
  const made = 1 - bust;
  const d = upName(up);
  const weak = up >= 2 && up <= 6;
  if (act === 'D' && t >= 8 && t <= 11) {
    return {
      title: 'Double when one card is likely to make a strong total',
      body: `${pct(next[10])} of the cards left are 10-valued, so a hard ${t} often becomes ${t + 10}.${weak ? ` The dealer's ${d} is also a weak card that busts ${pct(bust)} of the time.` : ''} When a hand is more likely to win than lose, putting twice the stake on it earns more in the long run. You receive exactly one more card.`,
    };
  }
  if (act === 'H' && t <= 11) {
    const doubleNote = t >= 9 && evFor(a, 'D') !== undefined ? ` Doubling is not worth it against ${aCard(up)}, which finishes on 17 to 21 ${pct(made)} of the time.` : '';
    return {
      title: "Take a card: you can't bust",
      body: `No single card can bust a hard ${t}; even a 10-value card only makes ${t + 10}. Standing on ${t} would win only when the dealer busts (${pct(bust)}).${doubleNote}`,
    };
  }
  if (act === 'H' && t === 12 && (up === 2 || up === 3)) {
    return {
      title: 'Hit 12 against a 2 or 3',
      body: `Only 10-value cards bust a 12 (${pct(bustOnHit)} of the cards left). A dealer 2 or 3 busts less often (${pct(bust)}) than a 4, 5 or 6, so here the chance to improve outweighs the risk.`,
    };
  }
  if (act === 'S' && t >= 12 && t <= 16 && weak) {
    return {
      title: 'Stand on a stiff total against a weak dealer card',
      body: `The dealer must keep drawing until reaching 17, and with ${aCard(up)} showing busts ${pct(bust)} of the time. Hitting your ${t} would bust immediately with ${pct(bustOnHit)} of the cards left, and a busted hand loses even if the dealer busts afterwards. Standing lets the dealer take that risk.`,
    };
  }
  if (act === 'H' && t >= 12 && t <= 16) {
    return {
      title: 'Hit a stiff total against a strong dealer card',
      body: `With ${aCard(up)} showing, the dealer finishes on 17 to 21 ${pct(made)} of the time and busts only ${pct(bust)}. Standing on ${t} wins only when the dealer busts, so hitting, despite a ${pct(bustOnHit)} chance of busting on the next card, loses less over many hands.`,
    };
  }
  if (act === 'S' && t >= 17) {
    return {
      title: t >= 19 ? 'Stand on a strong total' : 'Stand on 17 or more',
      body: `Hitting ${t} busts with ${pct(bustOnHit)} of the cards left. Standing wins ${pct(a.stand.win)}, pushes ${pct(a.stand.push)} and loses ${pct(a.stand.lose)} against the dealer's ${d}.`,
    };
  }
  return null;
}

function surrenderPrinciple(a) {
  const alternatives = a.available.filter((x) => x !== 'R' && evFor(a, x) !== undefined);
  const best = alternatives.sort((x, y) => evFor(a, y) - evFor(a, x))[0];
  const bestEv = evFor(a, best);
  return {
    title: 'Surrender: give up half to avoid a bigger average loss',
    body: `Played out, your best option (${ACTION_NAMES[best].toLowerCase()}) loses about ${(Math.abs(bestEv) * 100).toFixed(1)} units per 100 staked against the dealer's ${upName(a.up)}. Surrendering always costs exactly half the stake (50.0 per 100), which is less. Late surrender is only possible on your first two cards, after the dealer has checked for blackjack.`,
  };
}

function principleFor(a) {
  const { rec, info } = a;
  if (rec.action === 'R') return surrenderPrinciple(a);
  if (rec.cell.table === 'pairs') {
    const p = pairPrinciple(a);
    if (p) return p;
  }
  if (info.soft) {
    const p = softPrinciple(a);
    if (p) return p;
  }
  const p = hardPrinciple(a);
  if (p) return p;
  return {
    title: `${ACTION_NAMES[rec.action]} is the higher-value play`,
    body: `Across many hands like this one, ${ACTION_NAMES[rec.action].toLowerCase()} gives up the least compared with the other allowed options.`,
  };
}

/**
 * Explanation for the UI: headline, principle, ranked expected values and
 * notes about fallbacks, close calls and composition effects.
 */
export function explainDecision(a) {
  if (a.info.blackjack) {
    return {
      headline: 'Blackjack',
      principle: {
        title: 'No decision needed',
        body: `An ace and a 10-value card as your first two cards pay ${a.rules.blackjackPayout} unless the dealer also has blackjack.`,
      },
      evRows: [],
      notes: [],
      facts: [],
      caution: LONG_RUN_NOTE,
    };
  }
  if (a.info.bust) {
    return { headline: 'Bust', principle: { title: 'Over 21', body: 'The hand is over 21 and loses.' }, evRows: [], notes: [], facts: [], caution: LONG_RUN_NOTE };
  }
  const { rec } = a;
  const evRows = a.available
    .filter((x) => evFor(a, x) !== undefined)
    .map((x) => ({ action: x, name: ACTION_NAMES[x], ev: evFor(a, x), recommended: x === rec.action }))
    .sort((x, y) => y.ev - x.ev);
  if (evRows.length) evRows[0].best = true;

  const notes = [];
  if (rec.usedFallback) {
    notes.push({
      kind: 'fallback',
      text: `The chart's first choice here is ${ACTION_NAMES[rec.preferred].toLowerCase()}, but ${unavailableReason(a, rec.preferred)}, so the basic-strategy play is ${ACTION_NAMES[rec.action].toLowerCase()}.`,
    });
  }
  const recEv = evFor(a, rec.action);
  const top = evRows[0];
  if (top && top.action !== rec.action && recEv !== undefined) {
    const diff = top.ev - recEv;
    notes.push({
      kind: 'composition',
      text:
        diff < 0.0005
          ? `For these exact cards, ${top.name.toLowerCase()} and ${ACTION_NAMES[rec.action].toLowerCase()} are practically tied.`
          : `Basic strategy uses only your total and the dealer's card. For these exact cards, a card-by-card calculation slightly prefers ${top.name.toLowerCase()} (by ${(diff * 100).toFixed(2)} units per 100 staked), because of which specific cards have left the shoe. That refinement is beyond basic strategy, and the chart play costs very little.`,
    });
  } else if (evRows.length > 1 && evRows[0].ev - evRows[1].ev < 0.01) {
    notes.push({
      kind: 'close',
      text: `This is a close decision: ${evRows[0].name.toLowerCase()} beats ${evRows[1].name.toLowerCase()} by only ${((evRows[0].ev - evRows[1].ev) * 100).toFixed(2)} units per 100 staked.`,
    });
  }
  if (evRows.length && evRows.every((r) => r.ev < 0)) {
    notes.push({ kind: 'all-negative', text: `Every option loses on average in this spot; ${ACTION_NAMES[rec.action].toLowerCase()} loses the least.` });
  }

  const d = upName(a.up);
  const facts = [
    `Dealer's ${d}: finishes on 17 to 21 ${pct(1 - a.outlook.afterCheck[OUT_BUST])} and busts ${pct(a.outlook.afterCheck[OUT_BUST])}${a.outlook.conditioned ? ', given no dealer blackjack' : ''}.`,
  ];
  if (a.info.total < 21 && a.bustOnHit > 0) facts.push(`If you hit: ${pct(a.bustOnHit)} chance the next card busts you.`);
  if (a.info.total < 21 && a.bustOnHit === 0) facts.push('If you hit: the next card cannot bust you.');
  facts.push(`If you stand on ${a.info.total}: win ${pct(a.stand.win)}, push ${pct(a.stand.push)}, lose ${pct(a.stand.lose)}.`);
  facts.push(`Cards left: ${a.cardsLeft} (a ${a.rules.decks}-deck shoe minus the ${a.visibleCount} cards you can see).`);

  return {
    headline: `Basic strategy: ${ACTION_NAMES[rec.action]}`,
    cell: cellLabel(rec.cell, a.up === 1 ? 'A' : a.up),
    code: rec.code,
    principle: principleFor(a),
    evRows,
    notes,
    facts,
    caution: LONG_RUN_NOTE,
  };
}

/** The insurance side bet, offered when the dealer shows an ace. */
export function analyzeInsurance({ rules, cards, upCard, otherCards = [] }) {
  const counts = countsWithout(rules.decks, [upCard, ...otherCards, ...cards]);
  const unseen = counts.slice(1).reduce((s, x) => s + x, 0);
  const tens = counts[10];
  const p = tens / unseen;
  const playerBlackjack = evaluateHand(cards).blackjack;
  const payout = payoutMultiplier(rules);
  return {
    p,
    tens,
    unseen,
    sideBetEv: 3 * p - 1, // per unit placed on insurance, which pays 2 to 1
    playerBlackjack,
    declineEv: playerBlackjack ? payout * (1 - p) : null,
    insureEv: playerBlackjack ? payout * (1 - p) + 0.5 * (3 * p - 1) : null,
  };
}

export function explainInsurance(ins) {
  const facts = [
    `Unseen cards: ${ins.unseen}, of which ${ins.tens} are 10-valued (${pct(ins.p)}).`,
    'Insurance pays 2 to 1, so it breaks even only if the hole card is 10-valued more than 1 time in 3 (33.3%).',
    `Expected return of the side bet: ${signedEv(ins.sideBetEv)} per unit placed on it (${per100(ins.sideBetEv)}).`,
  ];
  let body = `Insurance is a separate side bet that the dealer's hole card is 10-valued. With the cards you can see, that happens ${pct(ins.p)} of the time, which is less than the 33.3% needed to break even at 2 to 1. So the side bet ${per100(ins.sideBetEv)} on average.`;
  if (ins.playerBlackjack) {
    body += ` With your blackjack, declining is worth ${ins.declineEv.toFixed(3)} units on average and insuring ("even money") is worth ${ins.insureEv.toFixed(3)}. Declining is higher, even though it sometimes ends in a push.`;
  }
  return {
    headline: 'Basic strategy: No insurance',
    principle: { title: 'Insurance is a losing side bet', body },
    evRows: [],
    notes: [],
    facts,
    caution: LONG_RUN_NOTE,
  };
}

/** How the dealer's up card shapes the dealer's outcomes. */
export function explainUpCard(up, outlook, rules) {
  const bust = pct(outlook.afterCheck[OUT_BUST]);
  const h17 = rules.dealerHitsSoft17;
  if (up >= 2 && up <= 6) {
    return {
      strength: 'weak',
      title: `A ${up} is a weak dealer card`,
      body: `The dealer has no choices: below 17 the dealer must hit${h17 ? ', and here also on soft 17' : ''}. The most common hole card is 10-valued (4 of 13 ranks), which leaves the dealer on ${up + 10}, a total that must be hit. That is why the dealer busts ${bust} of the time with ${aCard(up)} showing.`,
    };
  }
  if (up >= 7 && up <= 9) {
    return {
      strength: 'medium',
      title: `${up === 8 ? 'An' : 'A'} ${up} is a strong dealer card`,
      body: `A 10-valued hole card, the most common kind, gives the dealer ${up + 10} straight away, a total the dealer stands on. With ${aCard(up)} showing the dealer busts only ${bust} of the time.`,
    };
  }
  if (up === 10) {
    return {
      strength: 'strong',
      title: 'A 10 is a very strong dealer card',
      body: `The dealer${outlook.conditioned ? ' has checked and does not have blackjack, but' : ''} often finishes on 20: a 10-valued hole card is the most likely kind. The dealer busts only ${bust} of the time.`,
    };
  }
  return {
    strength: 'strong',
    title: 'An ace is the strongest dealer card',
    body: `Before checking, the dealer has blackjack ${pct(outlook.blackjackChance)} of the time. ${outlook.conditioned ? 'Even after the check, ' : ''}the ace lets the dealer count 11 and reach 17 to 21 very often: the dealer busts only ${bust} of the time${h17 ? ', a little more than usual because this dealer must hit soft 17' : ''}.`,
  };
}
