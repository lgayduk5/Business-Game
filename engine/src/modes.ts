// Ways to play (review wave 3): the daily challenge and its shareable score code, rewinding, and scenario stars.
import { CITIES, FOUNDERS, IND_LIST, SCENARIOS } from './content';
import { gameGrade } from './victory';
import { scenarioDef } from './scenarios';
import type { Difficulty, FounderId, GameState, IndustryId, NewGameOpts } from './types';
import { hashSeed, turnLabel } from './util';
import { founderStake } from './finance';
import { endTurn } from './turn';
import { needsAttention } from './advisor';

// ── the daily challenge: the same world for everyone on a given date, played as a ten-year Ironman

export interface DailySetup { date: string; industry: IndustryId; city: string; founder: FounderId; difficulty: Difficulty; seed: string }
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date as YYYY-MM-DD in the player's own time zone. */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The industry, city and founder for a date's challenge, drawn from the date alone. */
export function dailySetup(date: string): DailySetup {
  if (!DATE.test(date)) throw new Error('A daily challenge needs a date like 2026-11-18.');
  let h = hashSeed('daily:' + date);
  const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0), h / 4294967296);
  const ind = IND_LIST[Math.floor(next() * IND_LIST.length)].id;
  const cities = CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id));
  const city = cities[Math.floor(next() * cities.length)].id;
  const founder = FOUNDERS[Math.floor(next() * FOUNDERS.length)].id;
  return { date, industry: ind, city, founder, difficulty: 'normal', seed: 'daily-' + date };
}

export function dailyOpts(date: string, name: string): NewGameOpts {
  const d = dailySetup(date);
  return { name, industry: d.industry, city: d.city, founder: d.founder, difficulty: d.difficulty, seed: d.seed, mode: 'standard', sprint: true, ironman: true, daily: date };
}

// ── score codes: a short line a player can paste to a friend; the check letters catch typing mistakes

const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const check = (body: string) => {
  let h = hashSeed('gc-score:' + body);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ALPHA[h % ALPHA.length];
    h = Math.floor(h / ALPHA.length) ^ Math.imul(h, 2654435761);
    h >>>= 0;
  }
  return out;
};

export interface ScoreCode { date: string; grade: string; score: number; founderValue: string; ok: boolean }

/** Founder value in a few characters: 850K, 12.4M, 1.2B. */
const short = (x: number) => {
  const a = Math.max(0, x);
  const [d, u] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = a / d;
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + u;
};

/** e.g. GC-261118-B72-12.4M-K3QX: the date, the grade and score out of 100, what the founder's stake is worth, and four check letters. Daily games only. */
export function scoreCode(g: GameState): string {
  if (!g.rules.daily || g.status === 'playing') return '';
  // as the game stood when it ended: nothing done afterwards changes the code
  const fg = gameGrade(g);
  const broke = g.outcome?.how === 'bankrupt';
  const grade = broke ? 'F' : fg.grade;
  const score = broke ? 0 : Math.round(fg.score);
  const body = `${g.rules.daily.slice(2).replace(/-/g, '')}-${grade}${score}-${short(broke ? 0 : fg.founderValue)}`;
  return `GC-${body}-${check(body)}`;
}

/** Reads a code back. `ok` is false if it was mistyped. */
export function readScoreCode(code: string): ScoreCode | null {
  const m = /^GC-(\d{2})(\d{2})(\d{2})-([A-F])(\d{1,3})-(\d+(?:\.\d)?[KMB])-([2-9A-Z]{4})$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const body = `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}-${m[6]}`;
  return { date: `20${m[1]}-${m[2]}-${m[3]}`, grade: m[4], score: Number(m[5]), founderValue: '$' + m[6], ok: check(body) === m[7] };
}

// ── rewind: go back to the start of one of the last four quarters

/** How many quarters back the player may go. */
export const REWIND_QUARTERS = 4;

export const canRewind = (g: GameState) => !g.rules.ironman && !g.rules.daily;

/** Restore a snapshot taken at the start of an earlier quarter, keeping count of rewinds across the restore. */
export function rewindTo(current: GameState, snapshot: GameState): GameState {
  if (!canRewind(current)) throw new Error('This game cannot be rewound.');
  if (snapshot.id !== current.id || snapshot.turn > current.turn || current.turn - snapshot.turn > REWIND_QUARTERS) throw new Error('That moment is too far back.');
  const g: GameState = JSON.parse(JSON.stringify(snapshot));
  g.counters.rewinds = (current.counters.rewinds ?? 0) + 1;
  const c = current.company;
  g.replay = { from: snapshot.turn, title: current.outcome?.title ?? `Where you were at ${turnLabel(current.turn)}`, valuation: c.valuation, founderValue: c.valuation * founderStake(c) };
  return g;
}

/**
 * Resolve up to `turns` quarters, stopping early when something needs the player (as fast-forward does). `starts` holds
 * the start of each quarter passed on the way, the last REWIND_QUARTERS of them, so that a fast-forward into the end
 * still leaves the last year to rewind to (the start of the final quarter is `state` itself when it is still playing).
 */
export function runQuarters(g: GameState, turns: number): { state: GameState; n: number; reason: string; starts: GameState[] } {
  let n = 0;
  let reason = '';
  const starts: GameState[] = [];
  while (n < turns) {
    if (n && canRewind(g)) {
      starts.push(JSON.parse(JSON.stringify(g)) as GameState);
      if (starts.length > REWIND_QUARTERS) starts.shift();
    }
    endTurn(g);
    n++;
    reason = needsAttention(g);
    if (reason) break;
  }
  return { state: g, n, reason, starts };
}

// ── scenario stars: one for finishing, one for the bonus, one for finishing on Brutal

/** Stars earned in a finished scenario or campaign chapter (0 if it was not completed). */
export function scenarioStars(g: GameState): number {
  const s = scenarioDef(g);
  if (!s || g.mode !== 'scenario' || g.outcome?.kind !== 'won' || g.outcome.how !== 'scenario') return 0;
  return 1 + (bonusMet(g) ? 1 : 0) + (g.rules.brutal ? 1 : 0);
}

/** The second star: for "survive" goals, finish worth at least what you started with; otherwise finish with a quarter of the time to spare. */
export function bonusMet(g: GameState): boolean {
  const s = scenarioDef(g);
  if (!s) return false;
  if (s.goal.kind === 'survive') return g.company.valuation >= (g.counters.scenarioStartValuation ?? Infinity);
  return (g.counters.scenarioLeft ?? 0) >= Math.ceil(s.turns / 4);
}
export const bonusText = (kind: string, turns: number) =>
  kind === 'survive' ? 'Finish worth at least as much as when you started.' : `Finish with ${Math.ceil(turns / 4)} quarters or more to spare.`;

/** Campaign chapters in order, and the challenges. */
export const CHAPTERS = SCENARIOS.filter((s) => s.chapter).sort((a, b) => a.chapter! - b.chapter!);
export const CHALLENGES = SCENARIOS.filter((s) => !s.chapter);
