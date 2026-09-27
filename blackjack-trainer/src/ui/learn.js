// Learn: the ideas behind basic strategy, the dealer's up card in numbers,
// why past results cannot predict the next hand (with a simulation), and how
// rule changes move the long-run expected return.

import { h, replace, pct, chipsText } from './dom.js';
import { lineChart } from './stats-view.js';
import { dealerOutlook, Engine } from '../engine/ev.js';
import { fullShoeCounts } from '../engine/shoe.js';
import { expectedReturn } from '../engine/strategy.js';
import { rulesSummary, normalizeRules } from '../engine/rules.js';
import { simulateRounds } from '../engine/simulate.js';
import { signedEv } from '../engine/explain.js';

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];

function dealerTable(rules) {
  const rows = UPS.map((up) => {
    const counts = fullShoeCounts(rules.decks);
    counts[up] -= 1;
    return { up, o: dealerOutlook(counts, up, rules) };
  });
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'data' },
      h('caption', { class: 'sr-only' }, 'Dealer final hand probabilities by up card'),
      h('thead', null, h('tr', null, ['Up card', '17', '18', '19', '20', '21', 'Bust', 'Blackjack before check'].map((t) => h('th', { scope: 'col' }, t)))),
      h(
        'tbody',
        null,
        rows.map(({ up, o }) =>
          h(
            'tr',
            null,
            h('td', null, up === 1 ? 'A' : String(up)),
            [0, 1, 2, 3, 4].map((i) => h('td', null, pct(o.afterCheck[i]))),
            h('td', { class: 'hl' }, pct(o.afterCheck[5])),
            h('td', null, o.blackjackChance ? pct(o.blackjackChance) : '–'),
          ),
        ),
      ),
    ),
  );
}

function ruleEffects(rules) {
  const base = -expectedReturn(rules);
  const variants = [];
  const add = (label, change) => {
    const r = normalizeRules({ ...rules, ...change });
    const same = Object.keys(change).every((k) => rules[k] === r[k]);
    if (same) return;
    variants.push({ label, edge: -expectedReturn(r) });
  };
  add('Dealer hits soft 17', { dealerHitsSoft17: true });
  add('Dealer stands on soft 17', { dealerHitsSoft17: false });
  add('Blackjack pays 6:5', { blackjackPayout: '6:5' });
  add('Blackjack pays 3:2', { blackjackPayout: '3:2' });
  add('Blackjack pays 1:1', { blackjackPayout: '1:1' });
  add('No double after split', { doubleAfterSplit: false });
  add('Double after split allowed', { doubleAfterSplit: true });
  add('Late surrender offered', { surrender: 'late' });
  add('No surrender', { surrender: 'none' });
  add('Double on 10 or 11 only', { doubleOn: '10-11' });
  add('Double on any two cards', { doubleOn: 'any' });
  add('Single deck', { decks: 1 });
  add('Double deck', { decks: 2 });
  add('6 decks', { decks: 6 });
  add('8 decks', { decks: 8 });
  add('Re-split aces allowed', { resplitAces: true });
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'data' },
      h('caption', { class: 'sr-only' }, 'House edge under rule changes'),
      h('thead', null, h('tr', null, ['If only this changed', 'House edge', 'Change'].map((t) => h('th', { scope: 'col' }, t)))),
      h(
        'tbody',
        null,
        h('tr', null, h('td', null, h('strong', null, 'Your current rules')), h('td', null, pct(base, 2)), h('td', null, '–')),
        variants.map((v) => {
          const d = v.edge - base;
          return h('tr', null, h('td', null, v.label), h('td', null, pct(v.edge, 2)), h('td', { class: d > 0 ? 'hl' : '' }, `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(2)}%`));
        }),
      ),
    ),
  );
}

function evExample(rules) {
  const counts = fullShoeCounts(rules.decks);
  counts[10] -= 1;
  const ev = new Engine(counts, 10, rules).analyze([10, 6], { double: false, surrender: true });
  return ev;
}

export function createLearnView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'learn-title' });
  const sim = { n: 10000, result: null, running: false };
  const rules = () => ctx.store.state.rules;

  function runSimulation() {
    sim.running = true;
    render();
    setTimeout(() => {
      sim.result = simulateRounds(rules(), sim.n, { seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 });
      sim.rulesText = rulesSummary(rules());
      sim.running = false;
      render();
    }, 30);
  }

  function simulationPanel() {
    const r = sim.result;
    const expected = expectedReturn(rules());
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Try it: simulate thousands of rounds')),
      h(
        'div',
        { class: 'row-wrap', style: { marginBottom: '12px' } },
        h('label', { for: 'sim-n', class: 'eyebrow' }, 'Rounds'),
        h('select', { id: 'sim-n', onChange: (e) => { sim.n = Number(e.target.value); } }, [1000, 10000, 20000].map((n) => h('option', { value: n, selected: sim.n === n }, n.toLocaleString('en-US')))),
        h('button', { type: 'button', class: 'btn primary', disabled: sim.running, onClick: runSimulation }, sim.running ? 'Simulating…' : 'Run simulation'),
      ),
      h('p', { class: 'muted', style: { fontSize: '13.5px', marginBottom: '10px' } }, 'Each simulated round is dealt from a freshly shuffled shoe and played with perfect basic strategy.'),
      r
        ? h(
            'div',
            { class: 'stack' },
            h(
              'div',
              { class: 'mini-stats' },
              h('div', null, h('b', null, pct(r.winRate, 1)), h('span', null, 'of all rounds won')),
              h('div', null, h('b', null, pct(r.afterWin.rate, 1)), h('span', null, `won right after a win (${r.afterWin.n.toLocaleString('en-US')} times)`)),
              h('div', null, h('b', null, pct(r.afterLoss.rate, 1)), h('span', null, `won right after a loss (${r.afterLoss.n.toLocaleString('en-US')} times)`)),
              h('div', null, h('b', null, pct(r.afterTwoLosses.rate, 1)), h('span', null, `won after 2+ losses in a row (${r.afterTwoLosses.n.toLocaleString('en-US')} times)`)),
            ),
            lineChart(r.netSeries.map((p) => ({ x: p.round, y: p.net })), {
              format: (v) => chipsText(Math.round(v)),
              label: 'Cumulative result in units',
              xLabel: 'rounds',
              refs: [{ points: [{ x: 1, y: expected }, { x: r.count, y: expected * r.count }] }],
            }),
            h(
              'p',
              { class: 'muted' },
              `Net result: ${chipsText(Math.round(r.net * 10) / 10)} units over ${r.count.toLocaleString('en-US')} rounds (${signedEv(r.returnPerRound, 4)} per round). The dashed line is the long-run average for ${sim.rulesText} (${signedEv(expected, 4)} per round). The solid line wanders around it because of chance, and the win rate barely moves whether the previous round was a win, a loss, or part of a losing streak.`,
            ),
          )
        : h('p', { class: 'placeholder' }, 'Run the simulation to compare the win rate after wins, after losses and after losing streaks.'),
    );
  }

  function render() {
    const r = rules();
    const ev = evExample(r);
    replace(
      el,
      h('div', { class: 'view-head' }, h('div', null, h('h2', { id: 'learn-title' }, 'Learn the math'), h('p', null, `Short lessons with numbers computed for your rules: ${rulesSummary(r)}.`))),
      h(
        'div',
        { class: 'stack', style: { gap: '22px' } },
        h(
          'div',
          { class: 'prose' },
          h('h3', null, 'What basic strategy is, and what it is not'),
          h('p', null, 'Basic strategy is a table of plays that gives the highest expected value for every combination of your hand and the dealer\'s up card, for a given set of rules. It is worked out by calculating the probability of every way the rest of the hand can unfold, then choosing the action with the best long-run average.'),
          h('p', null, h('strong', null, 'It is not a prediction. '), 'Basic strategy says nothing about what the next card will be or whether the next hand will win. It only tells you which choice loses least, or wins most, on average over a very large number of identical situations. Even with perfect play the house keeps a small edge, and individual hands and sessions swing widely because of chance.'),
        ),
        h(
          'div',
          { class: 'prose' },
          h('h3', null, 'Why past hands cannot predict the next one'),
          h('p', null, 'Online and electronic blackjack games use a random number generator (RNG) to shuffle, and most reshuffle a complete shoe before every round. That design makes each round statistically independent: the cards dealt in earlier rounds, and whether you won or lost them, have no connection to the cards in the next round. This simulator works the same way.'),
          h('p', null, 'So there is no pattern in wins and losses to exploit. A run of losses does not make a win "due" (the gambler\'s fallacy), and a run of wins is not a "hot streak" that will continue. Streaks are simply what randomness looks like. Any app or system that claims to predict the next hand from previous results is wrong.'),
        ),
        simulationPanel(),
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'prose' }, h('h3', null, "The dealer's up card, in numbers"), h('p', null, 'The dealer has no choices: hit below 17, stand on 17 or more' + (r.dealerHitsSoft17 ? ' (but hit a soft 17 under these rules)' : '') + '. That fixed rule means the up card alone sets the odds of each final total. Weak up cards (2 to 6) bust often because the most common hole card, a 10-value card, leaves the dealer with 12 to 16, which must be hit.')),
          h('div', { class: 'panel' }, dealerTable(r), h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '8px' } }, 'Rows for 10 and A assume the dealer has already checked and does not have blackjack; the last column shows the blackjack chance before that check.')),
        ),
        h(
          'div',
          { class: 'prose' },
          h('h3', null, 'Reading expected value'),
          h('p', null, 'Expected value (EV) is the average result per unit staked if the same decision were repeated many times. An EV of −0.54 means that across many identical hands you would lose about 54 units per 100 staked; it does not mean you will lose this hand.'),
          h('p', null, `Take hard 16 (10, 6) against a dealer 10. Standing has an EV of ${signedEv(ev.stand)}, hitting ${signedEv(ev.hit)} and surrendering ${signedEv(-0.5)}. Every option loses on average, because 16 against a 10 is a bad spot. The strategy question is only which option loses least. Here surrender is best when it is offered, and ${ev.hit > ev.stand ? 'hitting' : 'standing'} is next best by a tiny margin (${Math.abs((ev.hit - ev.stand) * 100).toFixed(1)} units per 100 staked), which is why 16 against 10 is famous as one of the closest calls in the chart.`),
        ),
        h(
          'div',
          null,
          h('div', { class: 'prose', style: { marginBottom: '10px' } }, h('h3', null, 'Principles behind the chart')),
          h(
            'div',
            { class: 'principles' },
            [
              ['Stand on stiff hands against weak cards', 'With 12 to 16 against a 2 to 6, let the dealer take the bust risk. Your hand busts immediately if you hit a big card, while the dealer must keep drawing.'],
              ['Hit stiff hands against strong cards', 'Against 7 to A the dealer usually reaches 17 to 21, so standing on 12 to 16 mostly loses. Hitting risks a bust but loses less over time.'],
              ['Double when you are the favorite', 'On 9, 10 or 11, or a soft total against a weak dealer card, you are likely to win. Doubling puts more on a hand with a positive expected value.'],
              ['Soft hands cannot bust on one card', 'An ace can switch from 11 to 1, so hitting or doubling soft totals carries no immediate bust risk. That is why soft 17 is always improved.'],
              ['Always split aces and eights', 'Two aces make only a soft 12, but each ace starts a hand worth 11. Two eights make 16, the worst total, while two hands starting with 8 lose less.'],
              ['Never split tens or fives', 'A 20 already wins most of the time. A pair of fives is a hard 10, a strong doubling hand, while two hands starting from 5 are weak.'],
              ['Surrender the worst spots', 'When playing on loses more than half the stake on average (hard 16 against 9, 10 or A, for example), giving up half is the smaller loss.'],
              ['Decline insurance', 'Insurance pays 2 to 1, but the hole card is a 10-value card only about 30 to 33% of the time, always less than the 33.3% needed to break even.'],
            ].map(([t, p]) => h('div', { class: 'panel' }, h('h4', null, t), h('p', null, p))),
          ),
        ),
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'prose' }, h('h3', null, 'How the rules change the math'), h('p', null, 'The house edge is the long-run average loss per 100 units staked when every decision follows basic strategy. It describes the game, not any single hand or session. Changing one rule at a time from your current rules:')),
          h('div', { class: 'panel' }, ruleEffects(r), h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '8px' } }, 'Figures come from this app\'s probability engine (split hands use a standard approximation) and match published values to within a few hundredths of a percent. A negative house edge means the rules would favour the player.')),
        ),
      ),
    );
  }

  return {
    el,
    title: 'Learn',
    show() {
      render();
    },
    refresh() {
      render();
    },
  };
}
