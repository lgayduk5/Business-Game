// Victory and defeat. Six ways to win, each a race against the rivals as well as a bar to clear.
import * as B from './books';
import { INDUSTRIES } from './content';
import { founderStake } from './finance';
import { DIFF } from './difficulty';
import { namedShares } from './market';
import { news } from './mods';
import { checkScenario } from './scenarios';
import type { Difficulty, GameState, IndustryId, VictoryId } from './types';
import { clamp, money, pct } from './util';

export interface VictoryStatus { id: VictoryId; name: string; desc: string; progress: number; detail: string; met: boolean; streak: number; need: number; enabled: boolean }

/** Quarters a condition must hold before it wins the game. */
export const VICTORY_NEED: Record<VictoryId, number> = { marketCap: 2, dominance: 4, ipo: 8, innovation: 4, reputation: 8, lastStanding: 1 };

/** The valuation bar for Titan, in today's money. */
export function capTarget(g: GameState): number {
  return DIFF[g.difficulty].titan * INDUSTRIES[g.company.primary].capTarget * g.macro.cpi;
}
/** The bars for each way to win, for an industry and difficulty, in today's money (shown before the game starts). */
export function victoryBars(ind: IndustryId, d: Difficulty): [name: string, bar: string][] {
  const D = DIFF[d];
  const I = INDUSTRIES[ind];
  const titan = D.titan * I.capTarget;
  return [
    ['Titan', `worth ${money(titan)}, and more than any rival`],
    ['Category king', `${pct(D.kingShare)} of named companies' sales for a year, profitably, on at least double your starting revenue`],
    ['Blue chip', `listed (needs ${money(D.ipoMinRev * Math.min(1, I.capTarget))} revenue), profitable and worth ${money(titan * 0.25)} for two years`],
    ['Pioneer', `a moonshot, then technology ${D.techBar}+ and the lead for a year`],
    ['Good company', `reputation 85 and ESG 80 on ${money(D.goodRev)} of revenue, for two years`],
    ['Last one standing', 'every rival gone, and your revenue at least doubled'],
  ];
}
const ipoPrice = (g: GameState) => g.company.cap.holders.find((h) => h.round === 'IPO')?.price ?? 0;

export function victoryStatus(g: GameState): VictoryStatus[] {
  const c = g.company;
  const d = g.difficulty;
  const en = g.settings.victories;
  const ind = c.primary;
  const alive = g.rivals.filter((r) => r.alive);
  const cap = capTarget(g);
  const topRival = Math.max(0, ...alive.map((r) => r.valuation));
  const named = namedShares(g, ind);
  const share = named.you;
  const topShare = Math.max(0, ...named.rivals.values());
  const D = DIFF[d];
  const tech = c.tech[ind] ?? 0;
  const topTech = Math.max(0, ...alive.filter((r) => r.industries.includes(ind)).map((r) => r.tech[ind] ?? 0));
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const lastNI = c.quarters[c.quarters.length - 1]?.ni ?? 0;
  const beaten = alive.filter((r) => r.valuation < c.valuation).length;
  const s = (id: VictoryId) => g.streaks[id] ?? 0;
  const mk = (id: VictoryId, name: string, desc: string, progress: number, detail: string, met: boolean, need: number): VictoryStatus => ({ id, name, desc, progress: clamp(met ? Math.max(progress, 0.9 + (0.1 * Math.min(s(id), need)) / need) : progress, 0, 1), detail, met, streak: s(id), need, enabled: en[id] });
  const ipoOk = c.cap.isPublic && lastNI > 0 && c.cap.price >= ipoPrice(g) && c.valuation >= cap * 0.25 && beaten * 2 >= alive.length;
  const goodRev = D.goodRev * g.macro.cpi;
  const grew = grewUp(g);
  const profitable = B.ttm(c, (q) => q.ni) > 0;
  const need = VICTORY_NEED;
  return [
    mk('marketCap', 'Titan', `Be the most valuable company in the industry, worth at least ${money(cap)}, for two quarters running.`,
      0.95 * Math.min(c.valuation / cap, c.valuation / Math.max(1, topRival)), `You: ${money(c.valuation)}. Most valuable rival: ${money(topRival)}. Bar: ${money(cap)}.`, c.valuation >= cap && c.valuation > topRival, need.marketCap),
    mk('dominance', 'Category king', `Make at least ${pct(D.kingShare)} of all the ${INDUSTRIES[ind].short} sales by named companies worldwide — more than any rival — for a year, profitably, with revenue at least double what you started with.`,
      0.95 * Math.min(share / D.kingShare, share / Math.max(1e-6, topShare)) * (grew && profitable ? 1 : 0.9),
      `You: ${pct(share, 1)} of named companies' sales. Largest rival: ${pct(topShare, 1)}. Local independents are not counted.${grew ? '' : ' Your revenue also needs to double from where it started.'}${profitable ? '' : ' A leader that loses money is not king: you need a profit over the last year.'}`,
      share >= D.kingShare && share > topShare && grew && profitable, need.dominance),
    mk('ipo', 'Blue chip', `List the company, then for two years in a row: profit every quarter, shares above the IPO price, worth at least ${money(cap * 0.25)} and more than half your rivals.`,
      c.cap.isPublic ? 0.4 + 0.5 * Math.min(1, c.valuation / (cap * 0.25)) * (beaten * 2 >= alive.length ? 1 : 0.6) : c.cap.ipoStage > 0 ? 0.3 : Math.min(0.25, (rev / (40e6 * g.macro.cpi)) * 0.25),
      c.cap.isPublic ? `Listed. ${ipoOk ? `Qualifying quarters: ${s('ipo')} of ${need.ipo}.` : lastNI <= 0 ? 'Not profitable last quarter.' : c.cap.price < ipoPrice(g) ? 'Shares are below the IPO price.' : 'Not yet big enough.'}` : 'Not listed yet.', ipoOk, need.ipo),
    mk('innovation', 'Pioneer', `Complete a moonshot, then lead the industry in technology at ${D.techBar} or better for a year.`,
      0.6 * Math.min(1, tech / Math.max(D.techBar, topTech)) + 0.3 * Math.min(1, c.moonshots), `Your technology ${tech.toFixed(0)}, best rival ${topTech.toFixed(0)}, ${c.moonshots} moonshot${c.moonshots === 1 ? '' : 's'} completed.`,
      tech >= D.techBar && tech >= topTech && c.moonshots >= 1, need.innovation),
    mk('reputation', 'Good company', `Reputation 85 and ESG 80, profitably, on at least ${money(goodRev)} of revenue, for two years.`,
      Math.min(c.reputation / 85, c.esg / 80, rev / goodRev) * 0.9, `Reputation ${c.reputation.toFixed(0)}, ESG ${c.esg.toFixed(0)}, revenue ${money(rev)}.`, c.reputation >= 85 && c.esg >= 80 && rev >= goodRev && lastNI > 0, need.reputation),
    mk('lastStanding', 'Last one standing', 'Every rival bankrupt or bought, while your own business at least doubled its revenue (in real terms) since the start.',
      (g.rivals.length ? (g.rivals.length - alive.length) / g.rivals.length : 0) * (grew ? 1 : 0.9), `${g.rivals.length - alive.length} of ${g.rivals.length} rivals gone. Revenue ${grew ? 'has' : 'has not yet'} doubled since the start.`,
      g.rivals.length > 0 && !alive.length && grew, need.lastStanding),
  ];
}

const WIN_TEXT: Record<VictoryId, (n: string) => string> = {
  marketCap: (n) => `${n} is the most valuable company in its industry. The business press has run out of adjectives.`,
  dominance: (n) => `${n} is the default choice across the world. Competitors are now measured by how much of your market they do not have.`,
  ipo: (n) => `${n} has been a profitable public company for two years and the market trusts it. Pension funds own your shares.`,
  innovation: (n) => `${n} leads its industry in technology and did the thing everyone said could not be done.`,
  reputation: (n) => `${n} is the company people point to when they say business can be done well. It is also making money.`,
  lastStanding: (n) => `Every rival that stood against ${n} has failed or been bought. The field is yours.`,
};

export interface FinalGrade { grade: string; label: string; score: number; won: boolean; rank: number; companies: number; multiple: number; market: number; goal: number; rows: [string, string, number][] }
const GRADES: [number, string, string][] = [
  [75, 'A', 'an outstanding run'], [60, 'B', 'a strong finish'], [45, 'C', 'a solid company'], [30, 'D', 'survived, just'], [15, 'E', 'a long struggle'], [-1, 'F', 'little to show for it'],
];
/** Outliving or out-sharing everyone only counts for a business that went somewhere: revenue at least doubled in real terms. */
export const grewUp = (g: GameState) => B.ttm(g.company, (q) => q.pnl.revenue) / g.macro.cpi >= 2 * (g.counters.startRevenue ?? 0);

/** A winning grade also needs the founder's stake to have grown at least this much in real terms: standing still is not winning. */
export const GRADE_MIN_GROWTH = 3;
/** Founder wealth at the start, in the game's opening money (for older saves, estimated from the opening valuation). */
const startWealth = (g: GameState) => g.counters.startFounderValue ?? (g.counters.startValuation ?? 1) * 0.8;

/**
 * How a game that runs to the end is judged, out of 100: where the company ranks by value among the
 * companies still standing (40), how the founder's stake grew in real terms against how the typical rival
 * grew over the same years (35: half on absolute growth, half against the industry), and how close it came to any of the
 * victories (25). A or B counts as a win if the founder's stake at least tripled in real terms.
 */
export function finalGrade(g: GameState): FinalGrade {
  const c = g.company;
  const alive = g.rivals.filter((r) => r.alive);
  const rank = 1 + alive.filter((r) => r.valuation > c.valuation).length;
  const rankPts = [40, 30, 20, 12, 6][rank - 1] ?? 3;
  const multiple = (c.valuation * founderStake(c)) / g.macro.cpi / Math.max(1, startWealth(g));
  // judged against the industry: how the rivals' companies grew over the same years (a rival that died counts as wiped out)
  const rivalMults = g.rivals.map((r) => {
    const start = g.counters[`rivalStart${r.id}`] ?? 0;
    return start > 0 ? (r.alive ? r.valuation / g.macro.cpi / start : 0.05) : NaN;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  const market = rivalMults.length ? rivalMults[Math.floor(rivalMults.length / 2)] : 1;
  const vsMarket = multiple / Math.max(0.01, market);
  // half absolute (100× in real terms is full marks) and half relative to the industry (four times the typical rival is full marks)
  const wealthPts = 35 * (0.5 * clamp(Math.log10(Math.max(1e-6, multiple)) / 2, 0, 1) + 0.5 * clamp(0.5 + 0.2 * Math.log2(Math.max(1e-6, vsMarket)), 0, 1));
  const goal = Math.max(0, ...victoryStatus(g).filter((v) => v.enabled).map((v) => v.progress));
  const goalPts = 25 * goal;
  const score = rankPts + wealthPts + goalPts;
  const [, grade, label] = GRADES.find(([min]) => score >= min)!;
  const x = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + '×';
  return {
    grade, label, score, won: (grade === 'A' || grade === 'B') && multiple >= GRADE_MIN_GROWTH && grewUp(g), rank, companies: alive.length + 1, multiple, goal, market,
    rows: [[`Rank by value: ${rank} of ${alive.length + 1}`, `${rankPts} of 40`, rankPts], [`Your stake grew ${x(multiple)} in real terms; the typical rival ${x(market)}`, `${wealthPts.toFixed(0)} of 35`, wealthPts],
      [`Closest goal reached ${pct(goal)}`, `${goalPts.toFixed(0)} of 25`, goalPts]],
  };
}

export function checkEnd(g: GameState) {
  if (g.status !== 'playing') return;
  const c = g.company;
  if (c.negCashTurns >= 2 && !g.settings.sandbox.noBankruptcy) {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'bankrupt', title: 'Insolvent', turn: g.turn,
      text: `${c.name} ran out of cash and could not meet its obligations. ${c.quarters.length && B.ttm(c, (q) => q.ni) > 0 ? 'It was profitable on paper to the end — the money was tied up where it could not pay the bills.' : 'The administrators have taken the keys.'}` };
    news(g, `${c.name} has filed for bankruptcy.`, 'bad');
    return;
  }
  // checked after the quarter is counted, so 'survive N quarters' means N completed quarters
  if (g.mode === 'scenario' && checkScenario(g, g.turn + 1)) return;
  for (const v of victoryStatus(g)) {
    g.streaks[v.id] = v.met ? (g.streaks[v.id] ?? 0) + 1 : 0;
    if (v.enabled && v.met && g.streaks[v.id] >= v.need && !g.continued && g.mode !== 'scenario') {
      g.status = 'won';
      g.outcome = { kind: 'won', how: v.id, title: v.name, turn: g.turn, text: WIN_TEXT[v.id](c.name) };
      news(g, `Victory: ${v.name}.`, 'good');
      return;
    }
  }
  if (g.turn + 1 >= g.maxTurns && !g.continued && g.mode !== 'scenario') {
    // the game ran its course: judge the result rather than call it a draw
    const fg = finalGrade(g);
    const years = g.maxTurns / 4;
    const where = fg.rank === 1 ? `worth more than any rival` : `the ${['', '', 'second', 'third', 'fourth', 'fifth'][fg.rank] ?? `number ${fg.rank}`} most valuable of ${fg.companies} companies`;
    g.status = fg.won ? 'won' : 'lost';
    g.outcome = {
      kind: fg.won ? 'won' : 'lost', how: fg.won ? 'time' : 'outlasted', title: `Grade ${fg.grade}: ${fg.label}`, turn: g.turn, grade: fg.grade,
      text: `After ${years} years, ${c.name} is ${where}. Your stake grew ${fg.multiple >= 10 ? fg.multiple.toFixed(0) : fg.multiple.toFixed(1)}× in real terms, and you own ${pct(founderStake(c), 0)} of the company.`,
    };
    news(g, `${years} years on: grade ${fg.grade}.`, fg.won ? 'good' : 'info');
  }
}

/** After a win the player may carry on: victories stop counting, bankruptcy still applies. */
export function keepPlaying(g: GameState) {
  if (g.status !== 'won') return;
  g.continued = true;
  g.status = 'playing';
}
