import { loadState, saveState } from '../engine/storage.js';

const listeners = new Set();

export const store = {
  state: loadState(),
  /** Mutate state, persist it, and notify listeners (unless silent). */
  update(mutator, { silent = false } = {}) {
    mutator(this.state);
    saveState(this.state);
    if (!silent) for (const fn of listeners) fn(this.state);
  },
  replace(next) {
    this.state = next;
    saveState(this.state);
    for (const fn of listeners) fn(this.state);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
