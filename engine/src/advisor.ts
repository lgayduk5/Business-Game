// Advisor (filled in at M5).
import type { AdvisorNote, GameState } from './types';
export function advise(_g: GameState): AdvisorNote[] {
  return [];
}
export function trackAttribution(_g: GameState) {}

/** Why a fast-forward should stop here ('' = nothing needs the player). */
export function needsAttention(g: GameState): string {
  if (g.status !== 'playing' && !g.continued) return 'The game has ended.';
  if (g.queue.length) return 'A decision is waiting for you.';
  const c = g.company;
  if (c.books.cash < 0) return 'Cash is negative.';
  const last = c.quarters[c.quarters.length - 1];
  if (last && last.cf.cfo < 0 && c.books.cash < -last.cf.cfo * 2) return 'Less than two quarters of cash left.';
  if (g.advisor.some((n) => n.tone === 'bad')) return 'Your advisors have raised a red flag.';
  return '';
}
