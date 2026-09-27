import { h } from './dom.js';
import { store } from './store.js';
import { createPracticeView } from './practice.js';
import { createAnalyzeView } from './analyze.js';
import { createChartView } from './chart-view.js';
import { createStatsView } from './stats-view.js';
import { createLearnView } from './learn.js';
import { createRulesView } from './rules-view.js';
import { rulesSummary } from '../engine/rules.js';

const TABS = [
  ['practice', 'Practice'],
  ['analyze', 'Analyze a hand'],
  ['chart', 'Strategy chart'],
  ['stats', 'My stats'],
  ['learn', 'Learn'],
  ['rules', 'Rules'],
];

export function startApp(root) {
  let current = null;
  let params = null;
  const ctx = { store, navigate, rulesChanged };
  const views = {
    practice: createPracticeView(ctx),
    analyze: createAnalyzeView(ctx),
    chart: createChartView(ctx),
    stats: createStatsView(ctx),
    learn: createLearnView(ctx),
    rules: createRulesView(ctx),
  };

  const chip = h('a', { class: 'rules-chip', href: '#rules', title: 'Change the rules' });
  const tabs = TABS.map(([id, label]) => h('a', { class: 'tab', href: `#${id}` }, label));
  const main = h('main', { id: 'main', tabindex: '-1' });

  root.replaceChildren(
    h(
      'header',
      { class: 'appbar' },
      h(
        'div',
        { class: 'appbar-inner' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'A♠'), h('h1', null, 'Blackjack Strategy Lab'), h('span', { class: 'tagline' }, 'Basic-strategy practice and the math behind it')),
        chip,
        h('nav', { class: 'tabs', 'aria-label': 'Sections' }, tabs),
      ),
    ),
    h('div', { class: 'notice-bar' }, h('p', null, 'A learning tool with virtual practice chips only. Basic strategy lowers the house edge over many hands; nothing here can predict the next hand.')),
    main,
    h(
      'footer',
      { class: 'site-footer' },
      h(
        'div',
        { class: 'inner' },
        h('p', null, 'Blackjack Strategy Lab is for education and practice. It has no real-money features, gives no betting advice, and does not predict outcomes: each simulated round is shuffled independently, just as RNG games are designed to be.'),
        h('p', null, 'If gambling stops being fun for you or someone you know, free confidential help is available, for example from the 1-800-GAMBLER helpline in the US or GamCare in the UK.'),
      ),
    ),
  );

  function updateChrome() {
    chip.textContent = rulesSummary(store.state.rules);
    tabs.forEach((t, i) => {
      if (TABS[i][0] === current) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }

  function navigate(id, p = null) {
    params = p;
    if (location.hash === `#${id}`) route();
    else location.hash = id;
  }

  function rulesChanged() {
    views.practice.rulesChanged();
  }

  function route() {
    const id = location.hash.replace('#', '');
    const next = views[id] ? id : 'practice';
    const changed = next !== current;
    current = next;
    const p = params || {};
    params = null;
    if (changed) main.replaceChildren(views[next].el);
    views[next].show(p);
    updateChrome();
    if (changed) window.scrollTo(0, 0);
  }

  store.subscribe(() => {
    updateChrome();
    if (current) views[current].refresh();
  });

  document.addEventListener('keydown', (e) => {
    if (current === 'practice') views.practice.onKey(e);
  });
  window.addEventListener('hashchange', route);
  route();
}

startApp(document.getElementById('app'));
