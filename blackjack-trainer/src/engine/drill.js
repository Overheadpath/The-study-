// Builds starting hands for focused practice: a chosen chart cell, a random
// hand of one type (hard / soft / pairs), or the learner's weak spots.

import { UP_ORDER } from './strategy.js';

const TEN_RANKS = ['10', 'J', 'Q', 'K'];

function rankFor(value, randomInt) {
  if (value === 1) return 'A';
  if (value === 10) return TEN_RANKS[randomInt(4)];
  return String(value);
}

function pick(list, randomInt) {
  return list[randomInt(list.length)];
}

/** Two-card values that land in a chart cell, or null if none exist (e.g. hard 20). */
export function valuesForCell(table, row) {
  if (table === 'pairs') return [[row, row]];
  if (table === 'soft') return row >= 13 && row <= 20 ? [[1, row - 11]] : null;
  const combos = [];
  for (let a = 2; a <= 10; a += 1) {
    for (let b = a + 1; b <= 10; b += 1) if (a + b === row) combos.push([a, b]);
  }
  return combos.length ? combos : null;
}

/** Preset { player: [rank, rank], up: rank } for a chart cell, or null. */
export function presetForCell({ table, row, up }, randomInt) {
  const combos = valuesForCell(table, row);
  if (!combos) return null;
  const [a, b] = pick(combos, randomInt);
  const player = randomInt(2) ? [rankFor(a, randomInt), rankFor(b, randomInt)] : [rankFor(b, randomInt), rankFor(a, randomInt)];
  return { player, up: rankFor(up, randomInt) };
}

/** A random starting hand of one type, with a uniformly chosen dealer up card. */
export function randomPreset(kind, randomInt) {
  const up = UP_ORDER[randomInt(10)];
  if (kind === 'pairs') return presetForCell({ table: 'pairs', row: 1 + randomInt(10), up }, randomInt);
  if (kind === 'soft') return presetForCell({ table: 'soft', row: 13 + randomInt(8), up }, randomInt);
  return presetForCell({ table: 'hard', row: 8 + randomInt(10), up }, randomInt);
}
