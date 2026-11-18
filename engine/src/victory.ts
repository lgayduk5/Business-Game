// Victory and defeat. Six ways to win, each a race against the rivals as well as a bar to clear.
import * as B from './books';
import { INDUSTRIES } from './content';
import { enterpriseValue, founderStake, rivalEV } from './finance';
import { DIFF, SPRINT_BARS, SPRINT_OFF } from './difficulty';
import { namedShares } from './market';
import { news } from './mods';
import { checkScenario } from './scenarios';
import type { Difficulty, GameState, IndustryId, VictoryId } from './types';
import { clamp, money, pct } from './util';

export interface VictoryStatus { id: VictoryId; name: string; desc: string; progress: number; detail: string; met: boolean; streak: number; need: number; enabled: boolean }

/** Quarters a condition must hold before it wins the game. */
export const VICTORY_NEED: Record<VictoryId, number> = { marketCap: 2, dominance: 4, ipo: 8, innovation: 4, reputation: 8, lastStanding: 1 };
/** A Sprint halves the qualifying periods: a two-year streak in a ten-year game would leave no time to build. */
export const SPRINT_NEED: Record<VictoryId, number> = { marketCap: 2, dominance: 2, ipo: 4, innovation: 2, reputation: 4, lastStanding: 1 };
export const victoryNeed = (sprint: boolean) => (sprint ? SPRINT_NEED : VICTORY_NEED);
/** In the order victoryStatus and victoryBars list them. */
const VICTORY_IDS: VictoryId[] = ['marketCap', 'dominance', 'ipo', 'innovation', 'reputation', 'lastStanding'];
/** "for two quarters running", "for a year", "for two years". */
const span = (n: number) => (n <= 1 ? 'for a quarter' : n === 2 ? 'for two quarters running' : n === 4 ? 'for a year' : n === 8 ? 'for two years' : `for ${n} quarters`);
/** Good company's reputation and ESG bars. */
const goodBars = (sprint: boolean) => (sprint ? { rep: SPRINT_BARS.rep, esg: SPRINT_BARS.esg } : { rep: 85, esg: 80 });
const moneyScale = (sprint: boolean) => (sprint ? SPRINT_BARS.money : 1);
const techBar = (d: Difficulty, sprint: boolean) => DIFF[d].techBar - (sprint ? SPRINT_BARS.tech : 0);

/** An industry's Titan scale: what its leaders are worth relative to software's (energy and biotech leaders are small). */
const titanScale = (ind: IndustryId) => INDUSTRIES[ind].titanScale ?? INDUSTRIES[ind].capTarget;
/** The valuation bar for Titan, in today's money. */
export function capTarget(g: GameState): number {
  return DIFF[g.difficulty].titan * titanScale(g.company.primary) * g.macro.cpi * moneyScale(!!g.rules?.sprint);
}
/** The valuation bar for Blue chip, in today's money (its own bar, so Titan can be tuned without moving it). */
export function blueChipTarget(g: GameState): number {
  return DIFF[g.difficulty].blueChip * INDUSTRIES[g.company.primary].capTarget * g.macro.cpi * moneyScale(!!g.rules?.sprint);
}
/** The bars for each way to win, for an industry and difficulty, in today's money (shown before the game starts). */
export function victoryBars(ind: IndustryId, d: Difficulty, sprint = false): [name: string, bar: string][] {
  const D = DIFF[d];
  const I = INDUSTRIES[ind];
  const titan = D.titan * titanScale(ind) * moneyScale(sprint);
  const need = victoryNeed(sprint);
  const gb = goodBars(sprint);
  return [
    ['Titan', `a business worth ${money(titan)} (enterprise value), and more than any rival`],
    ['Category king', `${pct(D.kingShare)} of named companies' sales ${span(need.dominance)}, profitably, on at least double your starting revenue`],
    ['Blue chip', `listed (needs ${money(D.ipoMinRev * Math.min(1, I.capTarget) * (sprint ? SPRINT_BARS.ipoRev : 1))} revenue), profitable and worth ${money(D.blueChip * I.capTarget * moneyScale(sprint))} ${span(need.ipo)}`],
    ['Pioneer', `a moonshot, then technology ${techBar(d, sprint)}+ and the lead ${span(need.innovation)}`],
    ['Good company', `reputation ${gb.rep} and ESG ${gb.esg} on ${money(D.goodRev * moneyScale(sprint))} of revenue, ${span(need.reputation)}`],
    ['Last one standing', 'every established rival gone, and your revenue at least doubled'],
  ].filter((_, i) => !sprint || !(SPRINT_OFF as readonly string[]).includes(VICTORY_IDS[i])) as [string, string][];
}
const ipoPrice = (g: GameState) => g.company.cap.holders.find((h) => h.round === 'IPO')?.price ?? 0;

export function victoryStatus(g: GameState): VictoryStatus[] {
  const c = g.company;
  const d = g.difficulty;
  const en = g.settings.victories;
  const ind = c.primary;
  const alive = g.rivals.filter((r) => r.alive);
  const cap = capTarget(g);
  // Titan compares whole businesses (enterprise value), so a pile of raised cash does not make you the biggest
  const ev = enterpriseValue(c);
  const topEV = Math.max(0, ...alive.map((r) => rivalEV(r)));
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
  const chip = blueChipTarget(g);
  const ipoOk = c.cap.isPublic && lastNI > 0 && c.cap.price >= ipoPrice(g) && c.valuation >= chip && beaten * 2 >= alive.length;
  const goodRev = D.goodRev * g.macro.cpi * moneyScale(!!g.rules?.sprint);
  const bar = techBar(d, !!g.rules?.sprint);
  const grew = grewUp(g);
  const profitable = B.ttm(c, (q) => q.ni) > 0;
  const need = victoryNeed(!!g.rules?.sprint);
  const gb = goodBars(!!g.rules?.sprint);
  // startups keep arriving, so the field never quite empties: only rivals that have lasted three years count
  const established = (r: GameState['rivals'][number]) => r.since === undefined || g.turn - r.since >= 12;
  const counted = g.rivals.filter((r) => established(r) || !r.alive);
  const standing = alive.filter(established);
  return [
    mk('marketCap', 'Titan', `Be the most valuable business in the industry, worth at least ${money(cap)}, ${span(need.marketCap)}. Measured as enterprise value — the shares plus debt, less cash — so cash raised and kept does not count.`,
      0.95 * Math.min(ev / cap, ev / Math.max(1, topEV)), `You: ${money(ev)}. Most valuable rival: ${money(topEV)}. Bar: ${money(cap)}.`, ev >= cap && ev > topEV, need.marketCap),
    mk('dominance', 'Category king', `Make at least ${pct(D.kingShare)} of all the ${INDUSTRIES[ind].short} sales by named companies worldwide — more than any rival — ${span(need.dominance)}, profitably, with revenue at least double what you started with.`,
      0.95 * Math.min(share / D.kingShare, share / Math.max(1e-6, topShare)) * (grew && profitable ? 1 : 0.9),
      `You: ${pct(share, 1)} of named companies' sales. Largest rival: ${pct(topShare, 1)}. Local independents are not counted.${grew ? '' : ' Your revenue also needs to double from where it started.'}${profitable ? '' : ' A leader that loses money is not king: you need a profit over the last year.'}`,
      share >= D.kingShare && share > topShare && grew && profitable, need.dominance),
    mk('ipo', 'Blue chip', `List the company, then ${span(need.ipo)} in a row: profit every quarter, shares above the IPO price, worth at least ${money(chip)} and more than half your rivals.`,
      c.cap.isPublic ? 0.4 + 0.5 * Math.min(1, c.valuation / chip) * (beaten * 2 >= alive.length ? 1 : 0.6) : c.cap.ipoStage > 0 ? 0.3 : Math.min(0.25, (rev / (40e6 * g.macro.cpi)) * 0.25),
      c.cap.isPublic ? `Listed. ${ipoOk ? `Qualifying quarters: ${s('ipo')} of ${need.ipo}.` : lastNI <= 0 ? 'Not profitable last quarter.' : c.cap.price < ipoPrice(g) ? 'Shares are below the IPO price.' : 'Not yet big enough.'}` : 'Not listed yet.', ipoOk, need.ipo),
    mk('innovation', 'Pioneer', `Complete a moonshot, then lead the industry in technology at ${bar} or better ${span(need.innovation)}.`,
      0.6 * Math.min(1, tech / Math.max(bar, topTech)) + 0.3 * Math.min(1, c.moonshots), `Your technology ${tech.toFixed(0)}, best rival ${topTech.toFixed(0)}, ${c.moonshots} moonshot${c.moonshots === 1 ? '' : 's'} completed.`,
      tech >= bar && tech >= topTech && c.moonshots >= 1, need.innovation),
    mk('reputation', 'Good company', `Reputation ${gb.rep} and ESG ${gb.esg}, profitably, on at least ${money(goodRev)} of revenue, ${span(need.reputation)}.`,
      Math.min(c.reputation / gb.rep, c.esg / gb.esg, rev / goodRev) * 0.9, `Reputation ${c.reputation.toFixed(0)}, ESG ${c.esg.toFixed(0)}, revenue ${money(rev)}.`, c.reputation >= gb.rep && c.esg >= gb.esg && rev >= goodRev && lastNI > 0, need.reputation),
    mk('lastStanding', 'Last one standing', 'Every established rival bankrupt or bought (newcomers under three years old do not count), while your own business at least doubled its revenue (in real terms) since the start.',
      (counted.length ? (counted.length - standing.length) / counted.length : 0) * (grew ? 1 : 0.9), `${counted.length - standing.length} of ${counted.length} established rivals gone. Revenue ${grew ? 'has' : 'has not yet'} doubled since the start.`,
      counted.length > 0 && !standing.length && grew, need.lastStanding),
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
/** A, B, C, D and F, as players expect from school (there is no E). */
const GRADES: [number, string, string][] = [
  [75, 'A', 'an outstanding run'], [60, 'B', 'a strong finish'], [45, 'C', 'a solid company'], [25, 'D', 'survived, just'], [-1, 'F', 'little to show for it'],
];
/**
 * A Sprint is graded for ten years, not twenty-five: the same letters for the same standing among the companies
 * you started with, but a decade leaves less room to pull away, so each letter comes about eight points sooner, places in
 * the growth ranking are five points apart rather than falling away steeply, and tripling your stake in real
 * terms is full marks for wealth.
 */
const SPRINT_GRADES: [number, string, string][] = [
  [67, 'A', 'an outstanding run'], [52, 'B', 'a strong finish'], [37, 'C', 'a solid company'], [25, 'D', 'survived, just'], [-1, 'F', 'little to show for it'],
];
const RANK_PTS = [40, 30, 20, 12, 6, 3];
const SPRINT_RANK_PTS = [40, 35, 30, 25, 20, 15, 10, 5];
/** Outliving or out-sharing everyone only counts for a business that went somewhere: revenue at least doubled in real terms. */
export const grewUp = (g: GameState, by = 2) => B.ttm(g.company, (q) => q.pnl.revenue) / g.macro.cpi >= by * (g.counters.startRevenue ?? 0);

/** A winning grade also needs the founder's stake to have grown at least this much in real terms: standing still is not winning. */
export const GRADE_MIN_GROWTH = 3;
/** In a ten-year Sprint, the stake needs to grow by a quarter, and real revenue by half, for a winning grade. */
export const SPRINT_MIN_GROWTH = 1.25;
export const SPRINT_MIN_REVENUE = 1.5;
/**
 * Whether the founder's stake grew enough for a winning grade. Ten years can be too short for an industry that burns
 * cash before it earns (a biotech's drugs take most of a decade): there, doing at least twice as well as the
 * typical rival's owners counts too, as long as the stake kept half its value.
 */
const stakeGrew = (sprint: boolean, multiple: number, vsMarket: number) =>
  sprint ? multiple >= SPRINT_MIN_GROWTH || (multiple >= 0.5 && vsMarket >= 2) : multiple >= GRADE_MIN_GROWTH;
/** Founder wealth at the start, in the game's opening money (for older saves, estimated from the opening valuation). */
const startWealth = (g: GameState) => g.counters.startFounderValue ?? (g.counters.startValuation ?? 1) * 0.8;

/**
 * Whether the end-of-game rank is by growth rather than by size. Ten years is too short to outgrow companies that
 * started far bigger, so a Sprint ranks by growth; so does an industry whose rivals start as established utilities
 * (energy), where a newcomer cannot be expected to outbuild them, only to build faster.
 */
export const rankByGrowth = (g: GameState) => !!g.rules?.sprint || !!INDUSTRIES[g.company.primary].rankByGrowth;

/**
 * How much the whole business grew in real terms: enterprise value, so that financing a plant with a project
 * loan does not count against you and sitting on raised cash does not count for you; and against the starting
 * value plus whatever was paid for acquisitions, so that buying growth is not the same as making it. Saves from before the
 * second review have no starting enterprise value, and fall back on equity.
 */
export function companyGrowth(g: GameState): number {
  const start = g.counters.startEV;
  if (start === undefined) return (g.company.valuation / g.macro.cpi) / Math.max(1, g.counters.startValuation ?? 1);
  return (enterpriseValue(g.company) / g.macro.cpi) / Math.max(1, start + (g.counters.acquiredEV ?? 0));
}
/** The same for a rival, from the day it started (or arrived). */
export function rivalValueGrowth(g: GameState, r: GameState['rivals'][number]): number {
  const start = g.counters[`rivalStartEV${r.id}`];
  if (start === undefined) {
    const eq = g.counters[`rivalStart${r.id}`] ?? 0;
    return eq > 0 ? r.valuation / g.macro.cpi / eq : 0;
  }
  return (rivalEV(r) / g.macro.cpi) / Math.max(1, start + (g.counters[`rivalAcqEV${r.id}`] ?? 0));
}

/**
 * How a game that runs to the end is judged, out of 100: where the company ranks by value among the
 * companies still standing, or by growth (40), how the founder's stake grew in real terms against how the typical
 * rival grew over the same years (35: half on absolute growth, half against the industry), and how close it came to
 * any of the victories (25). A or B counts as a win if the founder's stake at least tripled in real terms and revenue
 * doubled (a Sprint: 1.25× and 1.5×, with the bands in SPRINT_GRADES).
 */
export function finalGrade(g: GameState): FinalGrade {
  const c = g.company;
  const sprint = !!g.rules?.sprint;
  const alive = g.rivals.filter((r) => r.alive);
  const multiple = (c.valuation * founderStake(c)) / g.macro.cpi / Math.max(1, startWealth(g));
  // judged against the industry: how the rivals' companies grew over the same years. A rival that went bankrupt counts
  // as wiped out; one that was bought out counts at the price its owners got (buying rivals does not make the
  // industry look worse than it was).
  const growthOf = (r: GameState['rivals'][number]) => {
    const start = g.counters[`rivalStart${r.id}`] ?? 0;
    const exit = g.counters[`rivalExit${r.id}`];
    return start > 0 ? (r.alive ? r.valuation / g.macro.cpi / start : exit !== undefined ? exit / start : 0.05) : NaN;
  };
  const rivalMults = g.rivals.map(growthOf).filter(Number.isFinite).sort((a, b) => a - b);
  const market = rivalMults.length ? rivalMults[Math.floor(rivalMults.length / 2)] : 1;
  const vsMarket = multiple / Math.max(0.01, market);
  // Rank by value, or by growth where size would be unfair (see rankByGrowth).
  const byGrowth = rankByGrowth(g);
  const myGrowth = companyGrowth(g);
  // by growth, you are measured against the companies you started with; a newcomer judged on growth from its first
  // funding round would outgrow anyone, so it counts only once it is worth more than you
  const ahead = (r: GameState['rivals'][number]) => (r.since === undefined ? rivalValueGrowth(g, r) > myGrowth : r.valuation > c.valuation);
  const rank = byGrowth ? 1 + alive.filter(ahead).length : 1 + alive.filter((r) => r.valuation > c.valuation).length;
  const pts = sprint ? SPRINT_RANK_PTS : RANK_PTS;
  const rankPts = pts[rank - 1] ?? pts[pts.length - 1];
  // half absolute (100× in real terms is full marks; 3× in a Sprint) and half relative to the industry (four times the typical rival is full marks)
  const absMax = sprint ? Math.log10(3) : 2;
  const wealthPts = 35 * (0.5 * clamp(Math.log10(Math.max(1e-6, multiple)) / absMax, 0, 1) + 0.5 * clamp(0.5 + 0.2 * Math.log2(Math.max(1e-6, vsMarket)), 0, 1));
  const goal = Math.max(0, ...victoryStatus(g).filter((v) => v.enabled).map((v) => v.progress));
  const goalPts = 25 * goal;
  const score = rankPts + wealthPts + goalPts;
  const [, grade, label] = (sprint ? SPRINT_GRADES : GRADES).find(([min]) => score >= min)!;
  const x = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + '×';
  return {
    grade, label, score, won: (grade === 'A' || grade === 'B') && stakeGrew(sprint, multiple, vsMarket) && grewUp(g, sprint ? SPRINT_MIN_REVENUE : 2), rank, companies: alive.length + 1, multiple, goal, market,
    rows: [[`${byGrowth ? `Rank by growth (your business ${x(myGrowth)} in real terms)` : 'Rank by value'}: ${rank} of ${alive.length + 1}`, `${rankPts} of 40`, rankPts], [`Your stake grew ${x(multiple)} in real terms; the typical rival ${x(market)}`, `${wealthPts.toFixed(0)} of 35`, wealthPts],
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
    const nth = ['', '', 'second', 'third', 'fourth', 'fifth'][fg.rank] ?? `number ${fg.rank}`;
    const where = rankByGrowth(g)
      ? (fg.rank === 1 ? 'the fastest-growing company in its industry' : `the ${nth} fastest-growing of ${fg.companies} companies`)
      : (fg.rank === 1 ? `worth more than any rival` : `the ${nth} most valuable of ${fg.companies} companies`);
    g.status = fg.won ? 'won' : 'lost';
    g.outcome = {
      kind: fg.won ? 'won' : 'lost', how: fg.won ? 'time' : 'outlasted', title: `Grade ${fg.grade}: ${fg.label}`, turn: g.turn, grade: fg.grade,
      text: `After ${years} year${years === 1 ? '' : 's'}, ${c.name} is ${where}. Your stake grew ${fg.multiple >= 10 ? fg.multiple.toFixed(0) : fg.multiple.toFixed(1)}× in real terms, and you own ${pct(founderStake(c), 0)} of the company.`,
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
