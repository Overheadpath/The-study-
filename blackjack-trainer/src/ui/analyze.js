// Analyze a hand: enter cards (tap or type) or read them from a screenshot,
// then see the player-hand analysis, the dealer up-card analysis, the
// basic-strategy play and the probabilities behind it.

import { h, replace, pct } from './dom.js';
import { cardEl, actionChip, chartCodeHelp, dealerDistribution, afterHitDistribution, evBars } from './components.js';
import { RANKS, SUITS, rankValue, normalizeRank, normalizeSuit, SUIT_SYMBOLS } from '../engine/cards.js';
import { evaluateHand, describeTotal } from '../engine/hand.js';
import { analyzeDecision, explainDecision, explainUpCard, actionsForHand, analyzeInsurance, explainInsurance } from '../engine/explain.js';
import { rulesSummary } from '../engine/rules.js';
import { ACTION_NAMES } from '../engine/strategy.js';
import { secureRandomInt } from '../engine/shoe.js';

const TOKEN = /(10|[2-9]|[aAtTjJqQkK])\s*([sShHdDcC♠♥♦♣](?![a-z]))?/g;

/** Parse text like "A 7 vs 9", "K♥ 6♠ v 10", "player: 10 6 dealer: A". */
export function parseHandText(text) {
  const src = String(text || '').trim();
  if (!src) return null;
  let playerPart;
  let dealerPart;
  const dealerFirst = src.match(/dealer\s*:?\s*(.+?)\s*(?:player|you)\s*:?\s*(.+)$/i);
  if (dealerFirst) {
    dealerPart = dealerFirst[1];
    playerPart = dealerFirst[2];
  } else {
    const parts = src.replace(/player\s*:?|you\s*:?/gi, '').split(/\s+(?:vs\.?|v\.?|against)\s+|\s*\/\s*|\s*dealer\s*:?\s*/i);
    if (parts.length < 2) return null;
    [playerPart, dealerPart] = parts;
  }
  const read = (part) => [...part.matchAll(TOKEN)].map((m) => ({ rank: normalizeRank(m[1]), suit: m[2] ? normalizeSuit(m[2]) : null }));
  const player = read(playerPart);
  const dealer = read(dealerPart);
  if (player.length < 2 || dealer.length < 1) return null;
  return { player, up: dealer[0] };
}

export function createAnalyzeView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'analyze-title' });
  const a = {
    up: { rank: '9', suit: 'C' },
    player: [
      { rank: 'A', suit: 'S' },
      { rank: '7', suit: 'H' },
    ],
    fromSplit: false,
    others: [],
    example: true,
    text: '',
    shot: null,
    busy: false,
    error: null,
    suit: 0,
  };

  const rules = () => ctx.store.state.rules;

  function nextSuit() {
    a.suit = (a.suit + 1) % 4;
    return SUITS[a.suit];
  }

  function setUp(rank) {
    a.up = { rank, suit: nextSuit() };
    a.example = false;
    render();
  }

  function addPlayer(rank) {
    if (a.player.length >= 12) return;
    a.player.push({ rank, suit: nextSuit() });
    a.example = false;
    render();
  }

  function removePlayer(i) {
    a.player.splice(i, 1);
    a.example = false;
    render();
  }

  function applyText() {
    const parsed = parseHandText(a.text);
    if (!parsed) {
      a.error = 'Could not read that. Try a format like "A 7 vs 9" or "10 6 v A".';
      render();
      return;
    }
    a.player = parsed.player.map((c) => ({ rank: c.rank, suit: c.suit || nextSuit() }));
    a.up = { rank: parsed.up.rank, suit: parsed.up.suit || nextSuit() };
    a.others = [];
    a.error = null;
    a.example = false;
    render();
  }

  // ---------- screenshot reading ----------

  async function readShot(file, { sample = null } = {}) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      a.error = 'That file is not an image. Upload a PNG or JPEG screenshot.';
      render();
      return;
    }
    a.busy = true;
    a.error = null;
    render();
    try {
      const vision = await import('../vision/detector.js');
      const result = await vision.readCardsFromImage(file);
      if (a.shot && a.shot.url) URL.revokeObjectURL(a.shot.url);
      const url = URL.createObjectURL(file);
      const items = result.cards.map((c, i) => ({
        id: i,
        rank: c.rank,
        suit: c.suit,
        box: c.box,
        confidence: c.confidence,
        role: c.role === 'dealer' ? 'dealer' : c.role === 'player' && (c.handIndex || 0) > 0 ? 'other' : 'player',
        handIndex: c.handIndex || 0,
      }));
      const notes = [...(result.notes || [])];
      if (items.some((x) => x.role === 'other')) notes.push('Cards from another hand are marked "Other visible card": they are left out of your hand but still removed from the shoe in the probabilities. Change the roles to analyze that hand instead.');
      a.shot = { url, width: result.width, height: result.height, items, notes, timingMs: result.timingMs, sample };
    } catch (err) {
      a.error = `The screenshot could not be read (${err.message}). You can still enter the cards by hand.`;
    } finally {
      a.busy = false;
      render();
    }
  }

  async function trySample() {
    try {
      const { renderSampleTable, SAMPLE_STYLES } = await import('../vision/sample-table.js');
      const ranks = RANKS;
      const pick = () => ({ rank: ranks[secureRandomInt(13)], suit: SUITS[secureRandomInt(4)] });
      const canvas = document.createElement('canvas');
      const style = SAMPLE_STYLES[secureRandomInt(SAMPLE_STYLES.length)];
      const dealer = [pick()];
      const player = [pick(), pick()];
      renderSampleTable(canvas, { dealer, holeCardHidden: true, playerHands: [player], style, seed: secureRandomInt(100000) });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      await readShot(blob, { sample: { dealer, player, style } });
    } catch (err) {
      a.error = `The sample screenshot could not be created (${err.message}).`;
      render();
    }
  }

  function useDetected() {
    const items = a.shot.items;
    const dealer = items.filter((x) => x.role === 'dealer');
    const player = items.filter((x) => x.role === 'player');
    if (dealer.length < 1 || player.length < 2) {
      a.error = 'Mark one card as the dealer up card and at least two cards as yours, then try again.';
      render();
      return;
    }
    const byPosition = (x, y) => x.box.x - y.box.x;
    a.up = { rank: dealer.sort(byPosition)[0].rank, suit: dealer[0].suit || 'S' };
    a.player = player.sort(byPosition).map((x) => ({ rank: x.rank, suit: x.suit || nextSuit() }));
    a.others = items.filter((x) => x.role === 'other').map((x) => ({ rank: x.rank, suit: x.suit || 'S' }));
    a.error = null;
    a.example = false;
    render();
    const results = el.querySelector('#analysis-results');
    if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onPaste(e) {
    if (!el.isConnected) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => x.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      readShot(item.getAsFile());
    }
  }

  // ---------- rendering ----------

  function rankPad(selected, onPick, label) {
    return h(
      'div',
      { class: 'rank-pad', role: 'group', 'aria-label': label },
      RANKS.map((r) => h('button', { type: 'button', 'aria-pressed': selected ? String(selected === r) : null, onClick: () => onPick(r), 'aria-label': `${label}: ${r}` }, r)),
    );
  }

  function entryPanel() {
    const info = a.player.length ? evaluateHand(a.player, { fromSplit: a.fromSplit }) : null;
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Enter the cards'), a.example ? h('span', { class: 'pill' }, 'Example hand') : null),
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'picker' }, h('span', { class: 'field label', style: { fontWeight: 700 } }, "Dealer's up card"), h('div', { class: 'row-wrap' }, a.up ? cardEl(a.up, { small: true }) : null), rankPad(a.up && a.up.rank, setUp, 'Dealer up card')),
        h(
          'div',
          { class: 'picker' },
          h('span', { style: { fontWeight: 700 } }, 'Your cards'),
          h(
            'div',
            { class: 'entry-hand' },
            a.player.length
              ? a.player.map((c, i) => h('span', { class: 'removable' }, cardEl(c, { small: true }), h('button', { type: 'button', 'aria-label': `Remove ${c.rank}`, onClick: () => removePlayer(i) }, '×')))
              : h('span', { class: 'placeholder' }, 'Tap ranks below to add your cards.'),
            info ? h('span', { class: 'pill' }, describeTotal(info, { showPair: info.pair })) : null,
          ),
          rankPad(null, addPlayer, 'Add a card to your hand'),
          h(
            'div',
            { class: 'row-wrap' },
            h('button', { type: 'button', class: 'btn small', onClick: () => { a.player = []; a.example = false; render(); } }, 'Clear my cards'),
            h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', id: 'from-split', checked: a.fromSplit, onChange: (e) => { a.fromSplit = e.target.checked; render(); } }), 'This hand came from a split'),
          ),
          a.others.length
            ? h(
                'div',
                { class: 'row-wrap' },
                h('span', { class: 'muted', style: { fontSize: '13px' } }, `Other visible cards (removed from the shoe): ${a.others.map((c) => c.rank).join(', ')}`),
                h('button', { type: 'button', class: 'btn small ghost', onClick: () => { a.others = []; render(); } }, 'Clear'),
              )
            : null,
          h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Suits never affect blackjack decisions, so they are only for display.'),
        ),
        h(
          'form',
          {
            class: 'field',
            onSubmit: (e) => {
              e.preventDefault();
              applyText();
            },
          },
          h('label', { for: 'hand-text' }, 'Or type a hand'),
          h(
            'div',
            { class: 'row-wrap' },
            h('input', { type: 'text', id: 'hand-text', placeholder: 'A 7 vs 9', value: a.text, autocomplete: 'off', style: { flex: '1 1 160px' }, onInput: (e) => { a.text = e.target.value; } }),
            h('button', { type: 'submit', class: 'btn small' }, 'Analyze'),
          ),
          h('span', { class: 'help' }, 'Your cards, then "vs" and the dealer card. Examples: "10 6 vs 10", "8 8 v A", "A5 vs 4".'),
        ),
      ),
    );
  }

  function shotPanel() {
    const input = h('input', { type: 'file', accept: 'image/*', id: 'shot-file', class: 'sr-only', onChange: (e) => readShot(e.target.files[0]) });
    const drop = h(
      'div',
      {
        class: 'dropzone',
        onDragover: (e) => {
          e.preventDefault();
          e.currentTarget.classList.add('over');
        },
        onDragleave: (e) => e.currentTarget.classList.remove('over'),
        onDrop: (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('over');
          readShot(e.dataTransfer.files[0]);
        },
      },
      h('strong', null, 'Drop a screenshot here'),
      h('span', { class: 'muted', style: { fontSize: '13px' } }, 'or paste one, or'),
      h('div', { class: 'row-wrap', style: { justifyContent: 'center' } }, h('label', { for: 'shot-file', class: 'btn small' }, 'Choose image'), h('button', { type: 'button', class: 'btn small', onClick: trySample }, 'Try a sample screenshot')),
      input,
    );
    const parts = [drop, h('p', { class: 'muted', style: { fontSize: '13px' } }, 'The image is read on this device and is never uploaded. Card reading is automatic but not perfect, so check each card before analyzing.')];
    if (a.busy) parts.push(h('p', { class: 'callout' }, 'Reading cards…'));
    if (a.shot) parts.push(detectedEl());
    return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', null, 'Or read a screenshot')), h('div', { class: 'stack' }, parts));
  }

  function detectedEl() {
    const shot = a.shot;
    const stage = h('div', { class: 'shot-stage' }, h('img', { src: shot.url, alt: 'Uploaded screenshot with detected cards outlined' }));
    shot.items.forEach((item, i) => {
      if (!item.box) return;
      stage.append(
        h(
          'div',
          {
            class: `box ${item.role}`,
            style: {
              left: `${(item.box.x / shot.width) * 100}%`,
              top: `${(item.box.y / shot.height) * 100}%`,
              width: `${(item.box.w / shot.width) * 100}%`,
              height: `${(item.box.h / shot.height) * 100}%`,
            },
          },
          h('span', null, `${i + 1}: ${item.rank}`),
        ),
      );
    });
    const rows = shot.items.map((item, i) =>
      h(
        'div',
        { class: 'detect-item' },
        h('b', { class: 'mono' }, `${i + 1}`),
        h(
          'select',
          { 'aria-label': `Card ${i + 1} rank`, onChange: (e) => { item.rank = e.target.value; render(); } },
          RANKS.map((r) => h('option', { value: r, selected: r === item.rank }, r)),
        ),
        item.suit ? h('span', { 'aria-hidden': 'true' }, SUIT_SYMBOLS[item.suit]) : null,
        h(
          'select',
          { 'aria-label': `Card ${i + 1} belongs to`, onChange: (e) => { item.role = e.target.value; render(); } },
          [['dealer', 'Dealer up card'], ['player', 'My hand'], ['other', 'Other visible card'], ['ignore', 'Ignore']].map(([v, t]) => h('option', { value: v, selected: v === item.role }, t)),
        ),
        h('span', { class: `pill${item.confidence >= 0.8 ? ' good' : ''}` }, item.confidence >= 0.8 ? 'Confident' : 'Please check'),
      ),
    );
    const notes = shot.notes.map((n) => h('p', { class: 'callout warn' }, n));
    let sampleNote = null;
    if (shot.sample) {
      const truth = `${shot.sample.player.map((c) => c.rank).join(', ')} vs ${shot.sample.dealer[0].rank}`;
      sampleNote = h('p', { class: 'muted', style: { fontSize: '13px' } }, `Sample table (${shot.sample.style} style). The cards actually drawn were ${truth}.`);
    }
    return h(
      'div',
      { class: 'stack' },
      stage,
      sampleNote,
      notes,
      shot.items.length
        ? h('div', { class: 'detect-list' }, rows)
        : h('p', { class: 'callout warn' }, 'No cards were recognized. Try a sharper or larger screenshot, or enter the cards by hand.'),
      h('p', { class: 'muted', style: { fontSize: '12.5px' } }, `Read ${shot.items.length} card${shot.items.length === 1 ? '' : 's'} in ${Math.round(shot.timingMs || 0)} ms.`),
      shot.items.length ? h('div', null, h('button', { type: 'button', class: 'btn primary', onClick: useDetected }, 'Use these cards')) : null,
    );
  }

  function resultsEl() {
    if (!a.up || a.player.length < 2) {
      return h('p', { class: 'callout' }, "Add the dealer's up card and at least two of your cards to see the analysis.");
    }
    const r = rules();
    let analysis;
    try {
      const available = actionsForHand(r, a.player, { fromSplit: a.fromSplit });
      analysis = analyzeDecision({ rules: r, cards: a.player, upCard: a.up, otherCards: a.others, available, fromSplit: a.fromSplit });
    } catch (err) {
      return h('p', { class: 'callout bad' }, err.message);
    }
    const info = analysis.info;
    const ex = explainDecision(analysis);
    const up = rankValue(a.up.rank);
    const upEx = explainUpCard(up, analysis.outlook, r);
    const insurance = up === 1 && !a.fromSplit && a.player.length === 2 ? explainInsurance(analyzeInsurance({ rules: r, cards: a.player, upCard: a.up, otherCards: a.others })) : null;

    const handFacts = [];
    if (info.blackjack) handFacts.push('Blackjack: an ace and a 10-value card as your first two cards.');
    else if (info.bust) handFacts.push(`Bust: the hard total is ${info.hard}, over 21.`);
    else {
      handFacts.push(
        info.soft
          ? `Soft ${info.total}: the ace counts as 11 now and can drop to 1, so one more card cannot bust this hand.`
          : `Hard ${info.total}: ${info.total <= 11 ? 'no single card can bust it.' : `any card worth ${22 - info.total} or more busts it (${pct(analysis.bustOnHit)} of the cards left).`}`,
      );
      if (info.pair) handFacts.push(`A pair of ${a.player[0].rank === '10' || rankValue(a.player[0].rank) === 10 ? '10-value cards' : `${a.player[0].rank}s`}, so splitting is ${analysis.available.includes('P') ? 'allowed' : 'not allowed right now'}.`);
      handFacts.push(`If you stand now: win ${pct(analysis.stand.win)}, push ${pct(analysis.stand.push)}, lose ${pct(analysis.stand.lose)}.`);
    }

    const playerPanel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Player hand'), h('span', { class: 'pill' }, describeTotal(info, { showPair: info.pair }))),
      h('div', { class: 'stack' }, h('div', { class: 'hand-cards spread' }, a.player.map((c) => cardEl(c, { small: true }))), h('ul', { class: 'fact-list' }, handFacts.map((f) => h('li', null, f))), !info.bust && !info.blackjack && info.total < 21 ? h('div', null, h('p', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Your total after one more card'), afterHitDistribution(analysis)) : null),
    );

    const dealerPanel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Dealer up card'), h('span', { class: `pill${upEx.strength === 'weak' ? ' good' : ' bad'}` }, upEx.strength === 'weak' ? 'Weak for the dealer' : 'Strong for the dealer')),
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row-wrap' }, cardEl(a.up, { small: true }), h('p', { style: { flex: '1 1 200px' } }, h('strong', null, upEx.title))),
        h('p', { class: 'muted' }, upEx.body),
        h('div', null, h('p', { class: 'eyebrow', style: { marginBottom: '6px' } }, analysis.outlook.conditioned ? "Dealer's final hand, given no blackjack" : "Dealer's final hand"), dealerDistribution(analysis.outlook)),
        analysis.outlook.conditioned ? h('p', { class: 'muted', style: { fontSize: '13px' } }, `Before the dealer checks, the chance of a dealer blackjack is ${pct(analysis.outlook.blackjackChance)}.`) : null,
      ),
    );

    const strategyPanel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Basic-strategy play')),
      info.blackjack || info.bust
        ? h('p', null, ex.principle.body)
        : h(
            'div',
            { class: 'stack' },
            h('div', { class: 'big-rec' }, actionChip(ex.code), h('div', null, h('strong', null, ACTION_NAMES[analysis.rec.action]), h('div', { class: 'cell-line' }, ex.cell, chartCodeHelp(ex.code)))),
            h('div', { class: 'principle' }, h('h4', { style: { fontSize: '16px', marginBottom: '4px' } }, ex.principle.title), h('p', { class: 'muted' }, ex.principle.body)),
            ex.notes.filter((n) => n.kind === 'fallback').map((n) => h('p', { class: 'callout warn' }, n.text)),
            insurance ? h('p', { class: 'callout' }, h('strong', null, 'Insurance: decline. '), insurance.principle.body) : null,
            h(
              'div',
              { class: 'row-wrap' },
              h('button', { type: 'button', class: 'btn small', disabled: a.player.length !== 2 || a.fromSplit, title: a.player.length !== 2 ? 'Practice starts from a two-card hand' : '', onClick: () => ctx.navigate('practice', { preset: { player: a.player.map((c) => c.rank), up: a.up.rank } }) }, 'Practice this hand'),
              h('a', { class: 'btn small ghost', href: '#chart' }, 'See the full chart'),
            ),
          ),
    );

    const probPanel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Probabilities and expected value')),
      info.blackjack || info.bust
        ? h('p', { class: 'muted' }, 'No decision to analyze.')
        : h(
            'div',
            { class: 'stack' },
            h('p', { class: 'eyebrow' }, 'Expected value per 1 unit staked'),
            evBars(ex.evRows),
            ex.notes.filter((n) => n.kind !== 'fallback').map((n) => h('p', { class: `callout${n.kind === 'composition' ? ' warn' : ''}` }, n.text)),
            h('ul', { class: 'fact-list' }, ex.facts.map((f) => h('li', null, f))),
            h('p', { class: 'caution' }, ex.caution),
          ),
    );

    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted', style: { fontSize: '13px' } }, `Using your rules: ${rulesSummary(r)}. When the dealer shows an ace or 10, the numbers assume the dealer has already checked and does not have blackjack.`),
      h('div', { class: 'analysis-grid' }, playerPanel, dealerPanel, strategyPanel, probPanel),
    );
  }

  function render() {
    replace(
      el,
      h(
        'div',
        { class: 'view-head' },
        h('div', null, h('h2', { id: 'analyze-title' }, 'Analyze a hand'), h('p', null, "Enter a hand or upload a screenshot. The analysis separates your hand, the dealer's up card, the basic-strategy play and the probabilities behind it.")),
      ),
      a.error ? h('p', { class: 'callout bad', role: 'alert', style: { marginBottom: '12px' } }, a.error) : null,
      h('div', { class: 'grid-2' }, entryPanel(), shotPanel()),
      h('div', { id: 'analysis-results', style: { marginTop: '16px' } }, h('div', { class: 'view-head', style: { marginBottom: '10px' } }, h('h2', { style: { fontSize: '22px' } }, 'Analysis')), resultsEl()),
    );
  }

  document.addEventListener('paste', onPaste);

  return {
    el,
    title: 'Analyze a hand',
    show() {
      render();
    },
    refresh() {
      render();
    },
  };
}
