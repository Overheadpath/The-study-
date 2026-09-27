// Practice simulator: deal, decide, compare with basic strategy, see the math,
// watch the dealer play, and track accuracy. Virtual chips only.

import { h, replace, pct, chipsText, stepLabel } from './dom.js';
import { cardEl, actionChip, explanationEl, chartCodeHelp } from './components.js';
import { PracticeRound, PRACTICE_STAKE } from '../engine/round.js';
import { evaluateHand, describeTotal } from '../engine/hand.js';
import { analyzeDecision, explainDecision, analyzeInsurance, explainInsurance } from '../engine/explain.js';
import { ACTION_NAMES } from '../engine/strategy.js';
import { recordRound, decisionStats, pickWeakSpot, cellKey } from '../engine/stats.js';
import { randomPreset, presetForCell } from '../engine/drill.js';
import { secureRandomInt } from '../engine/shoe.js';
import { doubleAllowedForTotal } from '../engine/rules.js';
import { rankValue } from '../engine/cards.js';

const EV_KEYS = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };
const ACTION_ORDER = ['H', 'S', 'D', 'P', 'R'];
const DEAL_MODES = [
  ['random', 'Random'],
  ['hard', 'Hard totals'],
  ['soft', 'Soft totals'],
  ['pairs', 'Pairs'],
  ['mistakes', 'My mistakes'],
];
const RESULT_TEXT = { win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', surrender: 'Surrendered', blackjack: 'Blackjack' };

function unavailableReason(round, action) {
  const hand = round.activeHand;
  if (!hand) return '';
  const { rules } = round;
  const info = evaluateHand(hand.cards, { fromSplit: hand.fromSplit });
  if (hand.splitAces && action !== 'P') return 'Split aces receive one card only';
  switch (action) {
    case 'H':
      return 'Your hand is already 21';
    case 'D':
      if (hand.cards.length > 2) return 'You can only double on your first two cards';
      if (hand.fromSplit && !rules.doubleAfterSplit) return 'No doubling after a split under these rules';
      if (!doubleAllowedForTotal(rules, info)) return `These rules only allow doubling on hard ${rules.doubleOn.replace('-', ' to ')}`;
      return 'Doubling is not allowed here';
    case 'P':
      if (!info.pair || hand.cards.length !== 2) return 'Splitting needs two cards of the same value';
      if (round.hands.length >= rules.maxSplitHands) return `Maximum of ${rules.maxSplitHands} hands reached`;
      return 'Aces cannot be re-split under these rules';
    case 'R':
      if (rules.surrender !== 'late') return 'Surrender is not offered under these rules';
      if (hand.fromSplit || round.hands.length > 1) return 'No surrender after splitting';
      return 'Surrender is only allowed on your first two cards';
    default:
      return '';
  }
}

export function createPracticeView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'practice-title' });
  const s = {
    round: null,
    pending: null,
    records: [],
    hinted: new Set(),
    viewIndex: null,
    revealed: false,
    session: { n: 0, correct: 0, streak: 0 },
    recorded: false,
    seen: new Set(),
    nextPreset: null,
    message: null,
  };

  const settings = () => ctx.store.state.settings;
  const rules = () => ctx.store.state.rules;

  function deal() {
    let preset = s.nextPreset;
    s.nextPreset = null;
    s.message = null;
    if (!preset) {
      const mode = settings().dealMode;
      if (mode === 'hard' || mode === 'soft' || mode === 'pairs') {
        preset = randomPreset(mode, secureRandomInt);
      } else if (mode === 'mistakes') {
        const stats = decisionStats(ctx.store.state.history);
        // Some mistakes only arise after extra cards (e.g. a three-card 20) and cannot be dealt directly.
        for (let tries = 0; tries < 8 && !preset; tries += 1) {
          const spot = pickWeakSpot(stats, secureRandomInt);
          if (!spot) break;
          preset = presetForCell(spot, secureRandomInt);
        }
        if (!preset) {
          s.message = stats.mistakes.length
            ? 'Your recorded mistakes happened after extra cards and cannot be dealt as a starting hand, so this hand was dealt at random.'
            : 'No mistakes recorded yet, so this hand was dealt at random. Mistakes you make will be drilled here.';
        }
      }
    }
    s.round = new PracticeRound(rules(), { preset }).deal();
    s.records = [];
    s.hinted = new Set();
    s.viewIndex = null;
    s.revealed = false;
    s.recorded = false;
    s.seen = new Set();
    afterChange();
  }

  function computePending() {
    const r = s.round;
    if (!r) return null;
    const index = r.decisions.length;
    if (r.phase === 'insurance') {
      const ins = analyzeInsurance({ rules: r.rules, cards: r.hands[0].cards, upCard: r.upCard });
      return { index, kind: 'insurance', ex: explainInsurance(ins), evs: null, label: ins.playerBlackjack ? 'Even money?' : 'Insurance?' };
    }
    if (r.phase !== 'player') return null;
    const hand = r.activeHand;
    const others = r.hands.filter((_, i) => i !== r.active).flatMap((x) => x.cards);
    const available = r.availableActions();
    const analysis = analyzeDecision({ rules: r.rules, cards: hand.cards, upCard: r.upCard, otherCards: others, available, fromSplit: hand.fromSplit });
    const ex = explainDecision(analysis);
    const evs = {};
    for (const [a, k] of Object.entries(EV_KEYS)) if (analysis.ev[k] !== undefined) evs[a] = analysis.ev[k];
    const up = rankValue(r.upCard.rank) === 10 ? '10' : r.upCard.rank;
    return { index, kind: 'play', analysis, ex, evs, available, label: `${describeTotal(analysis.info, { showPair: analysis.info.pair })} vs ${up}` };
  }

  function afterChange() {
    const r = s.round;
    if (r && r.phase === 'done' && !s.recorded) finishRound();
    s.pending = computePending();
    render();
  }

  function act(action) {
    const r = s.round;
    const p = s.pending;
    if (!r || !p) return;
    if (p.kind === 'insurance' && action !== 'I' && action !== 'N') return;
    if (p.kind === 'play' && !p.available.includes(action)) return;
    const hinted = s.revealed || settings().showAdviceFirst;
    if (p.kind === 'insurance') r.decideInsurance(action === 'I');
    else r.act(action);
    const d = r.decisions[p.index];
    s.records[p.index] = { ...p, chosen: d.chosen, correct: d.correct, recommended: d.recommended, hinted };
    if (hinted) {
      s.hinted.add(p.index);
    } else {
      s.session.n += 1;
      if (d.correct) {
        s.session.correct += 1;
        s.session.streak += 1;
      } else {
        s.session.streak = 0;
      }
    }
    s.viewIndex = p.index;
    s.revealed = false;
    afterChange();
  }

  function finishRound() {
    const r = s.round;
    const evs = new Map();
    s.records.forEach((rec, i) => {
      if (rec && rec.evs) evs.set(i, rec.evs);
    });
    ctx.store.update(
      (st) => {
        recordRound(st.history, r, { hinted: s.hinted, evs, mode: st.settings.dealMode });
        st.chips += r.result.net;
        if (st.chips < PRACTICE_STAKE) {
          st.chips = 1000;
          s.message = 'Practice chips were refilled to 1,000. They are only a scoreboard and have no value.';
        }
      },
      { silent: true },
    );
    s.recorded = true;
  }

  function reveal() {
    s.revealed = true;
    render();
  }

  // Re-rendering replaces the buttons, so keep keyboard focus in the action bar.
  function focusPrimary() {
    const target = el.querySelector('.act-btn.deal') || el.querySelector('.act-btn:not(:disabled)');
    if (target) target.focus({ preventScroll: true });
  }

  function withFocus(fn) {
    return (...args) => {
      const hadFocus = el.contains(document.activeElement) && document.activeElement !== el;
      fn(...args);
      if (hadFocus) focusPrimary();
    };
  }

  // ---------- rendering ----------

  function cardNode(card, key, opts = {}) {
    const id = `${key}:${card.rank}${card.suit}:${opts.hidden ? 'h' : 'f'}`;
    const fresh = !s.seen.has(id);
    s.seen.add(id);
    return cardEl(card, { ...opts, fresh });
  }

  function toolbar() {
    const st = settings();
    return h(
      'div',
      { class: 'toolbar' },
      h(
        'div',
        { class: 'group' },
        h('span', { class: 'eyebrow', id: 'deal-mode-label' }, 'Deal'),
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-labelledby': 'deal-mode-label' },
          DEAL_MODES.map(([id, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(st.dealMode === id), onClick: () => ctx.store.update((x) => { x.settings.dealMode = id; }) }, label),
          ),
        ),
      ),
      h(
        'div',
        { class: 'group' },
        h('span', { class: 'eyebrow', id: 'advice-label' }, 'Show advice'),
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-labelledby': 'advice-label' },
          h('button', { type: 'button', 'aria-pressed': String(!st.showAdviceFirst), onClick: () => ctx.store.update((x) => { x.settings.showAdviceFirst = false; }) }, 'After I decide'),
          h('button', { type: 'button', 'aria-pressed': String(st.showAdviceFirst), onClick: () => ctx.store.update((x) => { x.settings.showAdviceFirst = true; }) }, 'Before I decide'),
        ),
      ),
      h('span', { class: 'chips', title: 'Virtual practice chips. They cannot be bought or cashed out.' }, h('span', { class: 'chip-disc', 'aria-hidden': 'true' }), h('span', null, 'Practice chips '), h('b', { class: 'mono' }, ctx.store.state.chips.toLocaleString('en-US'))),
    );
  }

  function introCallout() {
    if (settings().introDismissed) return null;
    return h(
      'div',
      { class: 'callout', style: { marginBottom: '14px', display: 'grid', gap: '6px' } },
      h('strong', null, 'How this works'),
      h(
        'p',
        null,
        'Deal a hand and choose an action. The app then shows the basic-strategy play for your rules, the probabilities behind it, and the result once the dealer finishes. Every round starts from a freshly shuffled shoe, so earlier hands have no influence on the next one, and nothing here can predict how a hand will turn out.',
      ),
      h('div', null, h('button', { type: 'button', class: 'btn small', onClick: () => ctx.store.update((x) => { x.settings.introDismissed = true; }) }, 'Got it')),
    );
  }

  function dealerSeat() {
    const r = s.round;
    const head = [stepLabel(2, 'Dealer up card')];
    const cards = [];
    if (r) {
      r.dealer.cards.forEach((c, i) => cards.push(cardNode(c, `d${i}`, { hidden: i === 1 && !r.dealer.revealed })));
      if (r.dealer.revealed) {
        const info = evaluateHand(r.dealer.cards);
        head.push(h('span', { class: 'total-badge' }, describeTotal(info)));
      } else {
        head.push(h('span', { class: 'felt-note' }, `Showing ${r.upCard.rank}`));
      }
      if (r.peek === 'no-blackjack' && r.phase !== 'insurance') head.push(h('span', { class: 'felt-note' }, 'Checked for blackjack: none'));
    } else {
      cards.push(cardEl(null, { hidden: true }), cardEl(null, { hidden: true }));
    }
    return h('div', { class: 'seat' }, h('div', { class: 'seat-head' }, head), h('div', { class: 'hand-cards' }, cards));
  }

  function playerSeat() {
    const r = s.round;
    const boxes = [];
    if (r) {
      r.hands.forEach((hand, i) => {
        const info = evaluateHand(hand.cards, { fromSplit: hand.fromSplit });
        const active = r.phase === 'player' && r.active === i;
        const meta = [h('span', { class: `total-badge${hand.result ? ` ${hand.result === 'blackjack' ? 'win' : hand.result}` : ''}` }, describeTotal(info))];
        if (r.hands.length > 1) meta.unshift(h('span', { class: 'felt-note' }, `Hand ${i + 1}`));
        if (hand.doubled) meta.push(h('span', { class: 'felt-note' }, 'Doubled'));
        if (hand.result) meta.push(h('span', { class: 'felt-note' }, `${RESULT_TEXT[hand.result]} ${chipsText(hand.net)}`));
        else if (active) meta.push(h('span', { class: 'felt-note' }, 'Your move'));
        boxes.push(
          h(
            'div',
            { class: `hand-box${active ? ' active' : ''}` },
            h('div', { class: 'hand-cards' }, hand.cards.map((c, j) => cardNode(c, `p${i}-${j}`))),
            h('div', { class: 'hand-meta' }, meta),
          ),
        );
      });
    } else {
      boxes.push(h('div', { class: 'hand-box' }, h('div', { class: 'hand-cards' }, cardEl(null, { hidden: true }), cardEl(null, { hidden: true }))));
    }
    return h(
      'div',
      { class: 'seat' },
      h('div', { class: 'seat-head' }, stepLabel(1, 'Your cards'), stepLabel(3, 'Hand total')),
      h('div', { class: 'hands' }, boxes),
    );
  }

  function actionBar() {
    const r = s.round;
    const rows = [];
    if (!r || r.phase === 'done') {
      rows.push(h('button', { type: 'button', class: 'act-btn deal', onClick: withFocus(deal) }, r ? 'Deal next hand' : 'Deal a hand', h('span', { class: 'kbd' }, 'Enter')));
    } else if (r.phase === 'insurance') {
      rows.push(
        h('button', { type: 'button', class: 'act-btn plain', onClick: withFocus(() => act('I')) }, s.pending && s.pending.label === 'Even money?' ? 'Take even money' : 'Take insurance', h('span', { class: 'kbd' }, 'I')),
        h('button', { type: 'button', class: 'act-btn plain', onClick: withFocus(() => act('N')) }, s.pending && s.pending.label === 'Even money?' ? 'No even money' : 'No insurance', h('span', { class: 'kbd' }, 'N')),
      );
    } else {
      const available = r.availableActions();
      for (const a of ACTION_ORDER) {
        const ok = available.includes(a);
        rows.push(
          h(
            'button',
            {
              type: 'button',
              class: `act-btn act-${a}`,
              disabled: !ok,
              title: ok ? `${ACTION_NAMES[a]} (${a} key)` : unavailableReason(r, a),
              'aria-label': ok ? ACTION_NAMES[a] : `${ACTION_NAMES[a]}: ${unavailableReason(r, a)}`,
              onClick: withFocus(() => act(a)),
            },
            ACTION_NAMES[a],
            h('span', { class: 'kbd' }, a),
          ),
        );
      }
    }
    const note =
      r && r.phase === 'insurance'
        ? 'The dealer shows an ace and offers insurance before checking for blackjack.'
        : r && r.phase === 'player'
          ? 'Greyed-out actions are not allowed right now; hover or focus one to see why.'
          : '';
    return h(
      'div',
      { class: 'actions' },
      stepLabel(4, 'Available actions'),
      h('div', { class: 'action-row' }, rows),
      note ? h('p', { class: 'felt-note' }, note) : null,
      h(
        'div',
        { class: 'shoe-line' },
        h('span', null, r ? `Fresh ${r.rules.decks}-deck shoe (${r.shoeSize} cards), shuffled for this round only` : `Each round uses a freshly shuffled ${rules().decks}-deck shoe`),
        h('span', null, `Fixed stake: ${PRACTICE_STAKE} practice chips per hand`),
      ),
    );
  }

  function recommendationPanel() {
    const p = s.pending;
    const showNow = p && (s.revealed || settings().showAdviceFirst);
    const parts = [];
    if (p && showNow) {
      const code = p.kind === 'play' ? p.ex.code : 'N';
      parts.push(
        h(
          'div',
          { class: 'big-rec' },
          actionChip(code === 'N' ? 'S' : code, code === 'N' ? 'No' : code),
          h('div', null, h('strong', null, p.ex.headline.replace('Basic strategy: ', '')), h('div', { class: 'cell-line' }, p.ex.cell ? `${p.ex.cell}` : p.label, p.kind === 'play' ? chartCodeHelp(p.ex.code) : null)),
        ),
      );
      if (!settings().showAdviceFirst) parts.push(h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '8px' } }, 'Hint shown, so this decision will not count toward your accuracy.'));
    } else if (p) {
      parts.push(
        h('p', { class: 'placeholder' }, `Your move: ${p.label}. Choose an action first; the basic-strategy play appears after you decide.`),
        h('div', { style: { marginTop: '8px' } }, h('button', { type: 'button', class: 'btn small', onClick: reveal }, 'Show hint', h('span', { class: 'kbd' }, '?'))),
      );
    }
    const last = s.viewIndex !== null ? s.records[s.viewIndex] : null;
    if (last && !(p && showNow)) parts.push(feedbackBox(last));
    if (!p && !last) parts.push(h('p', { class: 'placeholder' }, s.round ? 'No decision was needed this round.' : 'Deal a hand to start.'));
    const log = s.records.filter(Boolean);
    if (log.length > 1 || (log.length === 1 && p && showNow)) {
      parts.push(
        h(
          'div',
          { class: 'decision-log', style: { marginTop: '10px' }, 'aria-label': 'Decisions this round' },
          s.records.map((rec, i) =>
            rec
              ? h(
                  'button',
                  { type: 'button', 'aria-pressed': String(s.viewIndex === i && !(p && showNow)), onClick: () => { s.viewIndex = i; s.revealed = false; render(); } },
                  h('span', { 'aria-hidden': 'true' }, rec.correct ? '✓' : '✗'),
                  `${rec.label}: ${rec.kind === 'insurance' ? (rec.chosen === 'I' ? 'Took insurance' : 'Declined') : ACTION_NAMES[rec.chosen]}`,
                  rec.hinted ? ' (hint)' : '',
                )
              : null,
          ),
        ),
      );
    }
    return h('div', { class: 'panel', 'aria-live': 'polite' }, h('div', { class: 'panel-head' }, stepLabel(5, 'Basic-strategy play')), parts);
  }

  function feedbackBox(rec) {
    const chosenText = rec.kind === 'insurance' ? (rec.chosen === 'I' ? 'took insurance' : 'declined insurance') : ACTION_NAMES[rec.chosen].toLowerCase();
    const recText = rec.kind === 'insurance' ? 'decline insurance' : ACTION_NAMES[rec.recommended].toLowerCase();
    return h(
      'div',
      { class: `feedback ${rec.correct ? 'good' : 'bad'}` },
      h('span', { class: 'mark', 'aria-hidden': 'true' }, rec.correct ? '✓' : '✗'),
      h(
        'div',
        null,
        h('strong', null, rec.correct ? `Correct: ${recText}` : `Basic strategy: ${recText}`),
        h('span', { class: 'muted' }, rec.correct ? `${rec.label}. You ${chosenText}.` : `${rec.label}. You ${chosenText}.`),
        rec.hinted ? h('span', { class: 'muted' }, ' Hint was shown, so this one is not scored.') : null,
      ),
    );
  }

  function mathPanel() {
    const p = s.pending;
    const showPending = p && (s.revealed || settings().showAdviceFirst);
    const rec = showPending ? p : s.viewIndex !== null ? s.records[s.viewIndex] : null;
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, stepLabel(6, 'Why: the math'), rec ? h('span', { class: 'muted', style: { fontSize: '12.5px' } }, rec.label) : null),
      rec ? explanationEl(rec.ex, { chosen: showPending ? undefined : rec.chosen }) : h('p', { class: 'placeholder' }, 'The expected value of each option and the probabilities behind the recommendation appear here after each decision.'),
    );
  }

  function resultPanel() {
    const r = s.round;
    let body;
    if (!r) body = h('p', { class: 'placeholder' }, 'Results appear after the dealer plays.');
    else if (r.phase !== 'done') body = h('p', { class: 'placeholder' }, 'The dealer plays after your decisions.');
    else {
      const dealerInfo = evaluateHand(r.dealer.cards);
      const scored = s.records.filter((x) => x && !x.hinted);
      const correct = scored.filter((x) => x.correct).length;
      const lines = [];
      const dealerCards = r.dealer.cards.map((c) => c.rank).join(', ');
      if (r.result.dealerBlackjack) lines.push(`Dealer has blackjack (${dealerCards}).`);
      else if (r.result.playerBlackjack) lines.push(`Your blackjack pays ${r.rules.blackjackPayout}, so the dealer did not need to play (${dealerCards}).`);
      else if (r.hands.every((x) => x.result === 'bust' || x.result === 'surrender')) lines.push(`No live hands were left, so the dealer did not draw (${dealerCards}).`);
      else lines.push(`Dealer finishes with ${describeTotal(dealerInfo)} (${dealerCards}).`);
      body = h(
        'div',
        { class: 'stack' },
        h('p', null, lines.join(' ')),
        h(
          'ul',
          { class: 'fact-list' },
          r.hands.map((hand, i) => h('li', null, `${r.hands.length > 1 ? `Hand ${i + 1}: ` : ''}${RESULT_TEXT[hand.result]} (${describeTotal(evaluateHand(hand.cards, { fromSplit: hand.fromSplit }))}${hand.doubled ? ', doubled' : ''}) `, h('b', { class: 'mono' }, chipsText(hand.net)))),
          r.insurance && r.insurance.taken ? h('li', null, 'Insurance ', h('b', { class: 'mono' }, chipsText(r.insurance.net))) : null,
        ),
        h('p', null, 'Round total: ', h('b', { class: 'mono' }, `${chipsText(r.result.net)} practice chips`)),
        scored.length
          ? h('p', { class: 'muted', style: { fontSize: '13px' } }, `Decisions this round: ${correct} of ${scored.length} matched basic strategy. A correct decision can still lose a hand, and a mistake can still win one; judge your play by the decisions.`)
          : null,
        h('div', null, h('button', { type: 'button', class: 'btn primary', onClick: withFocus(deal) }, 'Deal next hand')),
      );
    }
    return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, stepLabel(7, 'Result after the dealer plays')), body);
  }

  function statsPanel() {
    const stats = decisionStats(ctx.store.state.history);
    const r = s.round;
    const roundScored = s.records.filter((x) => x && !x.hinted);
    const last = s.viewIndex !== null ? s.records[s.viewIndex] : null;
    let spot = null;
    if (last && last.kind === 'play') {
      const d = r.decisions[s.viewIndex];
      const cell = stats.cells.get(cellKey(d.cell.table, d.cell.row, rankValue(d.upRank)));
      spot = cell ? `${cell.n - cell.errors} of ${cell.n}` : 'first time';
    }
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, stepLabel(8, 'Accuracy'), h('a', { href: '#stats', class: 'btn ghost small' }, 'All statistics')),
      h(
        'div',
        { class: 'mini-stats' },
        h('div', null, h('b', null, roundScored.length ? `${roundScored.filter((x) => x.correct).length}/${roundScored.length}` : '–'), h('span', null, 'This round')),
        h('div', null, h('b', null, s.session.n ? pct(s.session.correct / s.session.n, 0) : '–'), h('span', null, `Session (${s.session.n} decisions)`)),
        h('div', null, h('b', null, stats.total ? pct(stats.accuracy, 0) : '–'), h('span', null, `All time (${stats.total})`)),
        h('div', null, h('b', null, String(s.session.streak)), h('span', null, 'Correct in a row')),
        spot ? h('div', null, h('b', null, spot), h('span', null, `Right on ${last.label}`)) : null,
      ),
    );
  }

  function render() {
    const tableRules = s.round ? s.round.rules : rules();
    const felt = h(
      'div',
      { class: 'felt' },
      dealerSeat(),
      h(
        'div',
        { class: 'felt-print', 'aria-hidden': 'true' },
        h('span', null, `Blackjack pays ${tableRules.blackjackPayout.replace(':', ' to ')}`),
        h('span', null, tableRules.dealerHitsSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on soft 17'),
        h('span', null, 'Practice chips only'),
      ),
      playerSeat(),
      actionBar(),
    );
    replace(
      el,
      h(
        'div',
        { class: 'view-head' },
        h('div', null, h('h2', { id: 'practice-title' }, 'Practice'), h('p', null, 'Play hands with virtual chips. Every decision is checked against basic strategy for your ruleset, with the math shown for each one.')),
      ),
      introCallout(),
      toolbar(),
      s.message ? h('p', { class: 'callout warn', style: { marginBottom: '12px' } }, s.message) : null,
      settings().showAdviceFirst ? h('p', { class: 'callout', style: { marginBottom: '12px' } }, 'Study mode: advice is shown before you act, so these decisions are not counted toward accuracy.') : null,
      h('div', { class: 'practice-grid' }, h('div', null, felt), h('div', { class: 'stack' }, recommendationPanel(), mathPanel(), resultPanel(), statsPanel())),
    );
  }

  function onKey(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = s.round;
    const key = e.key.toLowerCase();
    if ((!r || r.phase === 'done') && (e.key === 'Enter' || e.key === ' ')) {
      if (e.target && e.target.tagName === 'BUTTON' && e.key !== 'Enter') return;
      e.preventDefault();
      deal();
      return;
    }
    if (!r) return;
    if (r.phase === 'insurance' && (key === 'i' || key === 'n')) {
      e.preventDefault();
      act(key === 'i' ? 'I' : 'N');
    } else if (r.phase === 'player' && ['h', 's', 'd', 'p', 'r'].includes(key)) {
      e.preventDefault();
      act(key.toUpperCase());
    } else if (e.key === '?' && s.pending && !s.revealed) {
      e.preventDefault();
      reveal();
    }
  }

  return {
    el,
    title: 'Practice',
    show(params = {}) {
      if (params.preset) {
        s.nextPreset = params.preset;
        deal();
        return;
      }
      if (!s.round) {
        render();
        return;
      }
      // Rules may have changed while away: finish the current round under its own rules.
      render();
    },
    refresh() {
      render();
    },
    onKey,
    rulesChanged() {
      if (s.round && s.round.phase !== 'done') return;
      s.round = null;
      s.pending = null;
      s.records = [];
      s.viewIndex = null;
      render();
    },
  };
}
