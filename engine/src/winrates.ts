// Measured win rates by industry and difficulty, written by the balance harness (`npm run sim`) into
// data/winrates.json, so the difficulty cards can tell a player what to expect in the industry they picked
// rather than a single figure for the whole game.
import winrates from '../../data/winrates.json';
import { DIFF } from './difficulty';
import { INDUSTRIES } from './content';
import type { Difficulty, IndustryId } from './types';

/** One cell of the harness grid: honest strategies only (the probes are there to find exploits, not to play well). */
export interface MeasuredRate { games: number; win: number; bankrupt: number }
interface WinRates { fingerprint: string; seeds: number; cells: Partial<Record<IndustryId, Partial<Record<Difficulty, MeasuredRate>>>> }
const DATA = winrates as unknown as { full?: WinRates; sprint?: WinRates };

export function measuredRate(ind: IndustryId, d: Difficulty, sprint = false): MeasuredRate | undefined {
  return (sprint ? DATA.sprint : DATA.full)?.cells[ind]?.[d];
}

/** "about 6 in 10", "fewer than 1 in 10", "almost every game". */
export function inTen(x: number): string {
  if (x >= 0.95) return 'almost every game';
  if (x < 0.05) return 'fewer than 1 game in 20';
  if (x < 0.1) return 'fewer than 1 game in 10';
  return `about ${Math.round(x * 10)} games in 10`;
}

/** The difficulty card's "Expect" line for an industry: what good plans actually achieved in testing. */
export function expectLine(ind: IndustryId, d: Difficulty, sprint = false): string {
  const m = measuredRate(ind, d, sprint);
  if (!m || m.games < 8) return DIFF[d].expect;
  const broke = m.bankrupt >= 0.1 ? ` ${m.bankrupt >= 0.25 ? 'Many' : 'Some'} went broke (${Math.round(m.bankrupt * 100)}%).` : '';
  return `In ${INDUSTRIES[ind].name}${sprint ? ' Sprints' : ''}, good plans won ${inTen(m.win)} in testing (${Math.round(m.win * 100)}%).${broke}`;
}
