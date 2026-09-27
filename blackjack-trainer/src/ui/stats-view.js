// Statistics: decision accuracy (skill) kept apart from hand results (luck).

import { h, svg, replace, pct, chipsText, toast } from './dom.js';
import { actionChip } from './components.js';
import { decisionStats, resultStats } from '../engine/stats.js';
import { ACTION_NAMES, rowLabel, expectedReturn } from '../engine/strategy.js';
import { valueLabel } from '../engine/cards.js';
import { PRACTICE_STAKE } from '../engine/round.js';
import { exportState, importState, defaultState } from '../engine/storage.js';
import { presetForCell } from '../engine/drill.js';
import { secureRandomInt, fullShoeCounts } from '../engine/shoe.js';
import { dealerOutlook } from '../engine/ev.js';

/**
 * Responsive SVG line chart, redrawn at the container's pixel width so text
 * keeps its size on every screen. points: [{x, y}].
 */
export function lineChart(points, options = {}) {
  const box = h('div', { class: 'chart-box' });
  let width = 0;
  const draw = (w) => {
    width = w;
    box.replaceChildren(chartSvg(points, { ...options, width: w }));
  };
  draw(640);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver((entries) => {
      if (!box.isConnected) {
        ro.disconnect();
        return;
      }
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0 && Math.abs(w - width) > 2) draw(w);
    });
    ro.observe(box);
  }
  return box;
}

function chartSvg(points, { yMin, yMax, format = (v) => v, refs = [], label = '', xLabel = '', width = 640, height = 200 } = {}) {
  const W = Math.max(260, width);
  const H = height;
  const pad = { l: 52, r: 14, t: 12, b: 26 };
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const lo = yMin !== undefined ? yMin : Math.min(0, ...points.map((p) => p.y), ...refs.flatMap((r) => r.points.map((p) => p.y)));
  const hi = yMax !== undefined ? yMax : Math.max(0, ...points.map((p) => p.y), ...refs.flatMap((r) => r.points.map((p) => p.y)));
  const span = hi - lo || 1;
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - lo) / span) * (H - pad.t - pad.b);
  const ticks = [lo, lo + span / 2, hi];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const base = sy(Math.max(lo, Math.min(hi, 0)));
  const area = points.length ? `${path}L${sx(points[points.length - 1].x).toFixed(1)},${base}L${sx(points[0].x).toFixed(1)},${base}Z` : '';
  const last = points[points.length - 1];
  return svg(
    'svg',
    { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    ticks.map((t) => [
      svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t) }),
      svg('text', { x: pad.l - 8, y: sy(t) + 4, 'text-anchor': 'end' }, format(t)),
    ]),
    svg('text', { x: pad.l, y: H - 6 }, String(x0)),
    svg('text', { x: W - pad.r, y: H - 6, 'text-anchor': 'end' }, `${x1}${xLabel ? ` ${xLabel}` : ''}`),
    refs.map((r) => svg('path', { class: 'ref', d: r.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(''), fill: 'none' })),
    area ? svg('path', { class: 'area', d: area }) : null,
    path ? svg('path', { class: 'line', d: path }) : null,
    last ? svg('circle', { class: 'dot', cx: sx(last.x), cy: sy(last.y), r: 4 }) : null,
  );
}

function barList(items) {
  return h(
    'div',
    { class: 'bar-list' },
    items.map((i) =>
      h(
        'div',
        { class: 'bar-item' },
        h('span', null, i.label),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${(i.value || 0) * 100}%` } })),
        h('span', { class: 'num' }, i.n ? `${pct(i.value, 0)} of ${i.n}` : 'no data'),
      ),
    ),
  );
}

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'value' }, value), sub ? h('span', { class: 'sub' }, sub) : null);
}

function expectedDealerBust(rules) {
  // Average dealer bust chance over up cards, given no dealer blackjack.
  let total = 0;
  let weight = 0;
  for (let up = 1; up <= 10; up += 1) {
    const counts = fullShoeCounts(rules.decks);
    counts[up] -= 1;
    const o = dealerOutlook(counts, up, rules);
    const w = (up === 10 ? 16 : 4) * (1 - o.blackjackChance);
    total += w * o.afterCheck[5];
    weight += w;
  }
  return total / weight;
}

export function createStatsView(ctx) {
  const el = h('section', { class: 'view', 'aria-labelledby': 'stats-title' });
  let confirmReset = false;

  function practice(m) {
    const preset = presetForCell({ table: m.table, row: m.row, up: m.up }, secureRandomInt);
    if (preset) ctx.navigate('practice', { preset });
    else toast('That spot only comes up after extra cards; practice it in random mode.');
  }

  function mistakeLabel(m) {
    if (m.table === 'insurance') return 'Insurance offers';
    return `${rowLabel(m.table, m.row)} vs ${valueLabel(m.up)}`;
  }

  function render() {
    const { history, rules } = ctx.store.state;
    const ds = decisionStats(history);
    const rs = resultStats(history);
    const hasData = ds.total > 0 || rs.rounds > 0;

    const accuracySection = h(
      'div',
      { class: 'stack' },
      h('h3', null, 'Decision accuracy'),
      h('p', { class: 'muted' }, 'How often your choice matched basic strategy. Hinted decisions are left out.'),
      h(
        'div',
        { class: 'tiles' },
        tile('Decisions scored', String(ds.total), ds.hintedCount ? `${ds.hintedCount} more with hints` : null),
        tile('Accuracy', pct(ds.accuracy, 1), `${ds.correct} correct`),
        tile('Last 25 decisions', pct(ds.recentAccuracy, 0), null),
        tile('Cost of mistakes', ds.evLostPer100 === null ? '–' : ds.evLostPer100.toFixed(1), 'expected units lost per 100 decisions'),
      ),
      ds.trend.length > 1
        ? h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', null, 'Accuracy over time'), h('span', { class: 'muted', style: { fontSize: '12.5px' } }, 'rolling average of 25 decisions')), lineChart(ds.trend.map((t) => ({ x: t.index, y: t.accuracy })), { yMin: 0, yMax: 1, format: (v) => pct(v, 0), label: 'Rolling decision accuracy', xLabel: 'decisions', refs: [] }))
        : null,
      h(
        'div',
        { class: 'grid-2' },
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'By hand type')),
          barList([
            { label: 'Hard totals', value: ds.byCategory.hard.accuracy, n: ds.byCategory.hard.n },
            { label: 'Soft totals', value: ds.byCategory.soft.accuracy, n: ds.byCategory.soft.n },
            { label: 'Pairs', value: ds.byCategory.pairs.accuracy, n: ds.byCategory.pairs.n },
            { label: 'Insurance', value: ds.byCategory.insurance.accuracy, n: ds.byCategory.insurance.n },
          ]),
        ),
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'By correct play')),
          barList(
            ['H', 'S', 'D', 'P', 'R'].map((a) => ({ label: `When it was ${ACTION_NAMES[a].toLowerCase()}`, value: ds.byAction[a].accuracy, n: ds.byAction[a].n })),
          ),
        ),
      ),
    );

    const mistakes = ds.mistakes.slice(0, 10);
    const mistakesSection = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Hands you most often get wrong'), h('a', { class: 'btn ghost small', href: '#chart' }, 'See them on the chart')),
      mistakes.length
        ? h(
            'div',
            { class: 'mistake-list' },
            mistakes.map((m) =>
              h(
                'div',
                { class: 'mistake' },
                h(
                  'div',
                  null,
                  h('div', { class: 'what' }, mistakeLabel(m)),
                  h(
                    'div',
                    { class: 'detail' },
                    h('span', null, `Wrong ${m.errors} of ${m.n}.`),
                    h('span', null, 'You usually chose'),
                    m.table === 'insurance' ? h('span', { class: 'pill' }, 'Insurance') : actionChip(m.commonWrong),
                    h('span', null, 'but basic strategy says'),
                    m.table === 'insurance' ? h('span', { class: 'pill good' }, 'No insurance') : actionChip(m.code || m.recommended),
                    m.examples.length ? h('span', { class: 'muted' }, `e.g. ${m.examples.join(' · ')}`) : null,
                  ),
                ),
                m.table !== 'insurance' ? h('button', { type: 'button', class: 'btn small', onClick: () => practice(m) }, 'Practice this') : null,
              ),
            ),
          )
        : h('p', { class: 'placeholder' }, ds.total ? 'No mistakes so far. Try the "My mistakes" deal mode later to review any that appear.' : 'Play some practice hands and your most frequent mistakes will be listed here.'),
    );

    const expected = expectedReturn(rules) * PRACTICE_STAKE;
    const netPoints = rs.netSeries.map((y, i) => ({ x: i + 1, y }));
    const bustExpected = expectedDealerBust(rules);
    const resultsSection = h(
      'div',
      { class: 'stack' },
      h('h3', null, 'Hand results'),
      h('p', { class: 'muted' }, 'Results mix skill with luck. Over a few hundred hands, luck usually dominates, so use the accuracy numbers above to judge your play.'),
      h(
        'div',
        { class: 'tiles' },
        tile('Rounds played', String(rs.rounds), null),
        tile('Net practice chips', chipsText(rs.net), `stake is ${PRACTICE_STAKE} per hand`),
        tile('Won / lost / pushed', rs.rounds ? `${pct(rs.wins / rs.rounds, 0)} / ${pct(rs.losses / rs.rounds, 0)} / ${pct(rs.pushes / rs.rounds, 0)}` : '–', null),
        tile('Dealer busted', pct(rs.dealerBustRate, 1), `when the dealer drew; about ${pct(bustExpected, 1)} expected`),
      ),
      netPoints.length > 1
        ? h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-head' }, h('h3', null, 'Practice chips over time'), h('span', { class: 'muted', style: { fontSize: '12.5px' } }, 'dashed line: long-run average for these rules')),
            lineChart(netPoints, { format: (v) => chipsText(Math.round(v)), label: 'Cumulative practice chips', xLabel: 'rounds', refs: [{ points: [{ x: 1, y: expected }, { x: netPoints.length, y: expected * netPoints.length }] }] }),
          )
        : null,
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', null, 'Does the last result predict the next?')),
        h(
          'div',
          { class: 'mini-stats' },
          h('div', null, h('b', null, pct(rs.afterWin.rate, 1)), h('span', null, `won the next round after a win (${rs.afterWin.n} times)`)),
          h('div', null, h('b', null, pct(rs.afterLoss.rate, 1)), h('span', null, `won the next round after a loss (${rs.afterLoss.n} times)`)),
          h('div', null, h('b', null, `${rs.longestWin} / ${rs.longestLoss}`), h('span', null, 'longest win / losing streak')),
        ),
        h(
          'p',
          { class: 'muted', style: { marginTop: '10px' } },
          'Every round here starts from a freshly shuffled shoe, so a win or a loss says nothing about the next round. Differences between the two rates above are random noise that shrinks as you play more hands. Streaks happen naturally in independent rounds and do not mean a change is "due". ',
          h('a', { href: '#learn' }, 'Try the simulation on the Learn page.'),
        ),
      ),
    );

    const recent = history.rounds.slice(-15).reverse();
    const PLAY_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender', I: 'Insurance', N: 'No insurance' };
    const RESULT = { win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', surrender: 'Surrender', blackjack: 'Blackjack' };
    const historySection = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Recent hands'), h('span', { class: 'muted', style: { fontSize: '12.5px' } }, 'newest first')),
      recent.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data history' },
              h('thead', null, h('tr', null, ['Your cards', 'Dealer', 'Your plays', 'Result', 'Chips'].map((t) => h('th', { scope: 'col' }, t)))),
              h(
                'tbody',
                null,
                recent.map((r) =>
                  h(
                    'tr',
                    null,
                    h('td', null, r.player ? r.player.join(' | ') : '–'),
                    h('td', null, r.dealer || valueLabel(r.up)),
                    h('td', null, r.plays && r.plays.length ? r.plays.map((p) => `${p.ok ? '✓' : '✗'} ${PLAY_NAMES[p.a] || p.a}${p.hint ? ' (hint)' : ''}`).join(', ') : 'no decision'),
                    h('td', null, r.hands.map((x) => RESULT[x.result] || x.result).join(', ')),
                    h('td', null, chipsText(r.net)),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'placeholder' }, 'Hands you play in Practice are listed here.'),
    );

    const dataSection = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Your data')),
      h('p', { class: 'muted', style: { marginBottom: '10px' } }, 'History is stored only in this browser. Back it up to move it to another device.'),
      h(
        'div',
        { class: 'row-wrap' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(exportState(ctx.store.state));
                toast('Backup copied to the clipboard.');
              } catch {
                toast('Copying was blocked by the browser. Use "Download backup" instead.');
              }
            },
          },
          'Copy backup',
        ),
        // Hosted previews block downloads; the single-file preview build sets this flag.
        globalThis.__BJ_NO_DOWNLOAD__
          ? null
          : h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onClick: () => {
              const blob = new Blob([exportState(ctx.store.state)], { type: 'application/json' });
              const link = h('a', { href: URL.createObjectURL(blob), download: 'blackjack-strategy-lab-backup.json' });
              document.body.append(link);
              link.click();
              link.remove();
            },
          },
          'Download backup',
        ),
        h('label', { class: 'btn small', for: 'import-file' }, 'Restore from file'),
        h('input', {
          type: 'file',
          id: 'import-file',
          accept: 'application/json,.json',
          class: 'sr-only',
          onChange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              ctx.store.replace(importState(await file.text()));
              toast('History restored.');
            } catch (err) {
              toast(err.message);
            }
          },
        }),
        confirmReset
          ? [
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn small',
                  style: { color: 'var(--bad)' },
                  onClick: () => {
                    const fresh = defaultState();
                    ctx.store.replace({ ...fresh, rules: ctx.store.state.rules, settings: ctx.store.state.settings });
                    confirmReset = false;
                    toast('Statistics cleared.');
                  },
                },
                'Yes, clear everything',
              ),
              h('button', { type: 'button', class: 'btn small ghost', onClick: () => { confirmReset = false; render(); } }, 'Cancel'),
            ]
          : h('button', { type: 'button', class: 'btn small', onClick: () => { confirmReset = true; render(); } }, 'Clear statistics'),
      ),
    );

    replace(
      el,
      h(
        'div',
        { class: 'view-head' },
        h('div', null, h('h2', { id: 'stats-title' }, 'Your statistics'), h('p', null, 'Track how closely your decisions follow basic strategy and which hands trip you up. Hand results are shown separately because they depend on luck.')),
        h('button', { type: 'button', class: 'btn primary', onClick: () => ctx.navigate('practice') }, 'Practice'),
      ),
      hasData ? null : h('p', { class: 'callout', style: { marginBottom: '14px' } }, 'No practice history yet. Everything below fills in as you play hands in Practice.'),
      h('div', { class: 'stack', style: { gap: '22px' } }, accuracySection, mistakesSection, resultsSection, historySection, dataSection),
    );
  }

  return {
    el,
    title: 'My stats',
    show() {
      render();
    },
    refresh() {
      render();
    },
  };
}
