// Fast simulation of many rounds played with basic strategy, used to show
// that results fluctuate and that past outcomes carry no information about the
// next round when every round is dealt from a freshly shuffled shoe.

import { PracticeRound } from './round.js';
import { seededRandomInt } from './shoe.js';

export function simulateRounds(rules, count, { seed = Date.now() >>> 0, randomInt = seededRandomInt(seed) } = {}) {
  let net = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let prev = null;
  const afterWin = { n: 0, wins: 0 };
  const afterLoss = { n: 0, wins: 0 };
  const afterTwoLosses = { n: 0, wins: 0 };
  let lossRun = 0;
  const netSeries = [];
  const step = Math.max(1, Math.floor(count / 400));
  for (let i = 0; i < count; i += 1) {
    const round = new PracticeRound(rules, { randomInt, stake: 1 }).deal();
    if (round.phase === 'insurance') round.decideInsurance(false);
    while (round.phase === 'player') round.act(round.recommendation().action);
    const outcome = round.result.outcome;
    net += round.result.net;
    if (outcome === 'win') wins += 1;
    else if (outcome === 'loss') losses += 1;
    else pushes += 1;
    if (prev === 'win') {
      afterWin.n += 1;
      if (outcome === 'win') afterWin.wins += 1;
    } else if (prev === 'loss') {
      afterLoss.n += 1;
      if (outcome === 'win') afterLoss.wins += 1;
    }
    if (lossRun >= 2) {
      afterTwoLosses.n += 1;
      if (outcome === 'win') afterTwoLosses.wins += 1;
    }
    if (outcome === 'loss') lossRun += 1;
    else if (outcome === 'win') lossRun = 0;
    prev = outcome;
    if (i % step === 0 || i === count - 1) netSeries.push({ round: i + 1, net });
  }
  const r = (b) => ({ ...b, rate: b.n ? b.wins / b.n : null });
  return {
    count,
    net,
    returnPerRound: net / count,
    wins,
    losses,
    pushes,
    winRate: wins / count,
    afterWin: r(afterWin),
    afterLoss: r(afterLoss),
    afterTwoLosses: r(afterTwoLosses),
    netSeries,
  };
}
