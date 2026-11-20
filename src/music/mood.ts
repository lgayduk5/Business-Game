// Which arrangement and which cue the game state calls for. Pure functions, tested headless.
import type { GameState } from '@engine';
import type { Cue, Mood } from './types';

/**
 * The desk track's mood. Cash comes first, on the same rule as the CFO's "Under two quarters of
 * cash" warning; otherwise the business cycle decides.
 */
export function moodOf(g: GameState): Mood {
  const c = g.company;
  const q = c.quarters[c.quarters.length - 1];
  if (c.books.cash < 0) return 'crisis';
  if (q) {
    const burn = -(q.cf.cfo + q.cf.capex);
    if (burn > 0 && c.books.cash / burn < 2) return 'crisis';
  }
  const p = g.macro.phase;
  if (p === 'recession' || p === 'slowdown') return 'downturn';
  if (p === 'boom') return 'boom';
  return 'calm';
}

/** The cue for the quarter just closed: a loss leaves it unresolved, a profitable record quarter lifts it. */
export function quarterCue(g: GameState): Cue {
  const qs = g.company.quarters;
  const q = qs[qs.length - 1];
  if (!q) return 'quarter';
  if (q.ni < 0) return 'badQuarter';
  const best = Math.max(...qs.slice(0, -1).map((p) => p.pnl.revenue));
  return qs.length > 1 && q.ni > 0 && q.pnl.revenue > best ? 'goodQuarter' : 'quarter';
}
