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
    ['Category king', `${pct(D.kingShare)} of named companies' sales, for a year`],
    ['Blue chip', `listed (needs ${money(D.ipoMinRev * Math.min(1, I.capTarget))} revenue), profitable and worth ${money(titan * 0.25)} for two years`],
    ['Pioneer', `a moonshot, then technology ${D.techBar}+ and the lead for a year`],
    ['Good company', `reputation 85 and ESG 80 on ${money(D.goodRev)} of revenue, for two years`],
    ['Last one standing', 'every rival gone'],
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
  const need = VICTORY_NEED;
  return [
    mk('marketCap', 'Titan', `Be the most valuable company in the industry, worth at least ${money(cap)}, for two quarters running.`,
      0.95 * Math.min(c.valuation / cap, c.valuation / Math.max(1, topRival)), `You: ${money(c.valuation)}. Most valuable rival: ${money(topRival)}. Bar: ${money(cap)}.`, c.valuation >= cap && c.valuation > topRival, need.marketCap),
    mk('dominance', 'Category king', `Make at least ${pct(D.kingShare)} of all the ${INDUSTRIES[ind].short} sales by named companies worldwide — more than any rival — for a year.`,
      0.95 * Math.min(share / D.kingShare, share / Math.max(1e-6, topShare)), `You: ${pct(share, 1)} of named companies' sales. Largest rival: ${pct(topShare, 1)}. Local independents are not counted.`, share >= D.kingShare && share > topShare, need.dominance),
    mk('ipo', 'Blue chip', `List the company, then for two years in a row: profit every quarter, shares above the IPO price, worth at least ${money(cap * 0.25)} and more than half your rivals.`,
      c.cap.isPublic ? 0.4 + 0.5 * Math.min(1, c.valuation / (cap * 0.25)) * (beaten * 2 >= alive.length ? 1 : 0.6) : c.cap.ipoStage > 0 ? 0.3 : Math.min(0.25, (rev / (40e6 * g.macro.cpi)) * 0.25),
      c.cap.isPublic ? `Listed. ${ipoOk ? `Qualifying quarters: ${s('ipo')} of ${need.ipo}.` : lastNI <= 0 ? 'Not profitable last quarter.' : c.cap.price < ipoPrice(g) ? 'Shares are below the IPO price.' : 'Not yet big enough.'}` : 'Not listed yet.', ipoOk, need.ipo),
    mk('innovation', 'Pioneer', `Complete a moonshot, then lead the industry in technology at ${D.techBar} or better for a year.`,
      0.6 * Math.min(1, tech / Math.max(D.techBar, topTech)) + 0.3 * Math.min(1, c.moonshots), `Your technology ${tech.toFixed(0)}, best rival ${topTech.toFixed(0)}, ${c.moonshots} moonshot${c.moonshots === 1 ? '' : 's'} completed.`,
      tech >= D.techBar && tech >= topTech && c.moonshots >= 1, need.innovation),
    mk('reputation', 'Good company', `Reputation 85 and ESG 80, profitably, on at least ${money(goodRev)} of revenue, for two years.`,
      Math.min(c.reputation / 85, c.esg / 80, rev / goodRev) * 0.9, `Reputation ${c.reputation.toFixed(0)}, ESG ${c.esg.toFixed(0)}, revenue ${money(rev)}.`, c.reputation >= 85 && c.esg >= 80 && rev >= goodRev && lastNI > 0, need.reputation),
    mk('lastStanding', 'Last one standing', 'Every rival bankrupt or bought.', g.rivals.length ? (g.rivals.length - alive.length) / g.rivals.length : 0, `${g.rivals.length - alive.length} of ${g.rivals.length} rivals gone.`, g.rivals.length > 0 && !alive.length, need.lastStanding),
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
    const best = Math.max(0, ...g.rivals.filter((r) => r.alive).map((r) => r.valuation));
    const won = c.valuation >= best && c.valuation >= capTarget(g) * 0.1; // surviving alone is not winning
    g.status = won ? 'won' : 'lost';
    g.outcome = won
      ? { kind: 'won', how: 'time', title: 'Top of the table', turn: g.turn, text: `After ${g.maxTurns / 4} years, ${c.name} is worth more than any rival. You own ${pct(founderStake(c), 0)} of it.` }
      : { kind: 'lost', how: 'outlasted', title: 'Still standing, not on top', turn: g.turn, text: `${c.name} survived ${g.maxTurns / 4} years, which most companies do not. But a rival finished worth more.` };
  }
}

/** After a win the player may carry on: victories stop counting, bankruptcy still applies. */
export function keepPlaying(g: GameState) {
  if (g.status !== 'won') return;
  g.continued = true;
  g.status = 'playing';
}
