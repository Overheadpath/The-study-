// Browser persistence. Storage can be missing or throw (private windows,
// blocked site data), so every access is guarded and the app works without it.

import { normalizeRules, DEFAULT_RULES } from './rules.js';
import { normalizeHistory, emptyHistory } from './stats.js';

const KEY = 'blackjack-strategy-lab:v1';

export const DEFAULT_SETTINGS = Object.freeze({
  showAdviceFirst: false,
  dealMode: 'random',
  autoAnalyze: true,
  introDismissed: false,
});

export function defaultState() {
  return { rules: { ...DEFAULT_RULES }, settings: { ...DEFAULT_SETTINGS }, history: emptyHistory(), chips: 1000 };
}

export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const settings = { ...base.settings };
  if (raw.settings && typeof raw.settings === 'object') {
    if (typeof raw.settings.showAdviceFirst === 'boolean') settings.showAdviceFirst = raw.settings.showAdviceFirst;
    if (['random', 'hard', 'soft', 'pairs', 'mistakes'].includes(raw.settings.dealMode)) settings.dealMode = raw.settings.dealMode;
    if (typeof raw.settings.autoAnalyze === 'boolean') settings.autoAnalyze = raw.settings.autoAnalyze;
    if (typeof raw.settings.introDismissed === 'boolean') settings.introDismissed = raw.settings.introDismissed;
  }
  return {
    rules: normalizeRules(raw.rules),
    settings,
    history: normalizeHistory(raw.history),
    chips: Number.isFinite(raw.chips) ? raw.chips : base.chips,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const text = storage && storage.getItem(KEY);
    return normalizeState(text ? JSON.parse(text) : null);
  } catch {
    return defaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state) {
  return JSON.stringify({ app: 'blackjack-strategy-lab', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importState(text) {
  const raw = JSON.parse(text);
  if (!raw || raw.app !== 'blackjack-strategy-lab') throw new Error('This file is not a Blackjack Strategy Lab export.');
  return normalizeState(raw);
}
