// New mechanics from the review (wave 3): company policies, earnings guidance, an employee option pool,
// locking input prices, and franchising. Each is an action the player takes and, where needed, a step
// the quarter runs.
import * as B from './books';
import { CITY } from './content';
import { POLICY, POLICIES } from './policyData';
import { localPrice, marketUnits } from './market';
import { news } from './mods';
import type { ActionResult, GameState, IndustryId } from './types';
import { clamp, money, pct } from './util';

const ok = (msg: string): ActionResult => ({ ok: true, msg });
const no = (msg: string): ActionResult => ({ ok: false, msg });
const annualRevenue = (g: GameState) => B.ttm(g.company, (q) => q.pnl.revenue) / g.macro.cpi;

// ── company policies: slots open as the company grows; one change a year

/** Policy slots: two to start, a third at $10M of annual revenue, a fourth at $50M, a fifth once listed. */
export function policySlots(g: GameState): number {
  const rev = annualRevenue(g);
  return 2 + (rev >= 10e6 ? 1 : 0) + (rev >= 50e6 ? 1 : 0) + (g.company.cap.isPublic ? 1 : 0);
}
/** Quarters until a policy can be changed again (0 = now). Filling an empty slot is always allowed. */
export const policyWait = (g: GameState) => Math.max(0, (g.company.policyChanged ?? -99) + 4 - g.turn);

export function adoptPolicy(g: GameState, id: string, replace?: string): ActionResult {
  const c = g.company;
  const list = (c.policies ??= []);
  if (!POLICY[id]) return no('No such policy.');
  if (list.includes(id)) return no('That policy is already in force.');
  if (replace) {
    if (!list.includes(replace)) return no('That policy is not in force.');
    if (policyWait(g) > 0) return no(`Policies can change once a year. Wait ${policyWait(g)} more quarter${policyWait(g) === 1 ? '' : 's'}.`);
    list.splice(list.indexOf(replace), 1, id);
    c.policyChanged = g.turn;
    return ok(`${POLICY[replace].name} is replaced by ${POLICY[id].name}.`);
  }
  if (list.length >= policySlots(g)) return no('Every policy slot is full. Replace one instead.');
  list.push(id);
  return ok(`${POLICY[id].name} is now company policy.`);
}
export function dropPolicy(g: GameState, id: string): ActionResult {
  const c = g.company;
  if (!c.policies?.includes(id)) return no('That policy is not in force.');
  if (policyWait(g) > 0) return no(`Policies can change once a year. Wait ${policyWait(g)} more quarter${policyWait(g) === 1 ? '' : 's'}.`);
  c.policies = c.policies.filter((x) => x !== id);
  c.policyChanged = g.turn;
  return ok(`${POLICY[id].name} is no longer policy.`);
}
export { POLICIES };

// ── earnings guidance: a listed company says what revenue to expect a year out, and is judged on it

export const GUIDANCE = {
  cautious: { name: 'Cautious', growth: -0.05, beat: 0.04, miss: -0.08 },
  base: { name: 'In line', growth: 0, beat: 0.07, miss: -0.12 },
  stretch: { name: 'Stretch', growth: 0.06, beat: 0.12, miss: -0.18 },
} as const;
const trailingGrowth = (g: GameState) => {
  const qs = g.company.quarters;
  const now = qs.slice(-4).reduce((s, q) => s + q.pnl.revenue, 0);
  const before = qs.slice(-8, -4).reduce((s, q) => s + q.pnl.revenue, 0);
  return before > 0 ? clamp(now / before - 1, -0.3, 1) : 0;
};
/** What a level of guidance would promise: next year's revenue. */
export function guidanceTarget(g: GameState, level: keyof typeof GUIDANCE): number {
  const rev = B.ttm(g.company, (q) => q.pnl.revenue);
  return rev * (1 + Math.max(-0.1, trailingGrowth(g) + GUIDANCE[level].growth));
}
export function setGuidance(g: GameState, level: keyof typeof GUIDANCE): ActionResult {
  const c = g.company;
  if (!c.cap.isPublic) return no('Only a listed company gives guidance.');
  if (c.guidance && c.guidance.due > g.turn) return no(`You have guided for the year to ${money(c.guidance.target)}. The market will judge it at the end of the year.`);
  const target = guidanceTarget(g, level);
  c.guidance = { level, from: B.ttm(c, (q) => q.pnl.revenue), target, due: g.turn + 4 };
  return ok(`Guidance published: about ${money(target)} of revenue over the next four quarters.`);
}
/** At the end of a guided year: beating it lifts the share price, missing it hurts — more so the bolder the promise. */
export function stepGuidance(g: GameState) {
  const c = g.company;
  const gd = c.guidance;
  if (!gd || !c.cap.isPublic || g.turn < gd.due) return;
  const actual = B.ttm(c, (q) => q.pnl.revenue);
  const L = GUIDANCE[gd.level];
  const beat = actual >= gd.target;
  c.cap.premium = clamp(c.cap.premium * (1 + (beat ? L.beat : L.miss)), 0.5, 1.8);
  news(g, beat ? `${c.name} beat its revenue guidance: ${money(actual)} against ${money(gd.target)} promised. The shares rose.` : `${c.name} missed its revenue guidance: ${money(actual)} against ${money(gd.target)} promised. The shares fell.`, beat ? 'good' : 'bad');
  c.guidance = undefined;
}

// ── employee option pool: pay part of salaries in options

export const OPTION_LEVELS = [0, 0.1, 0.2];
export function setOptionPay(g: GameState, share: number): ActionResult {
  if (!OPTION_LEVELS.includes(share)) return no('Choose none, 10% or 20%.');
  g.company.optionPay = share;
  return ok(share ? `${pct(share)} of salaries will be paid in stock options: less cash out, more shares in issue, people who stay longer.` : 'Salaries are paid in cash again.');
}
/** Issue the options granted this quarter as new shares held by the employee pool. */
export function grantOptions(g: GameState, value: number) {
  const cap = g.company.cap;
  if (value <= 0 || g.company.valuation <= 0) return;
  const n = value / (g.company.valuation / cap.shares);
  cap.shares += n;
  const pool = cap.holders.find((h) => h.round === 'Options');
  if (pool) pool.shares += n;
  else cap.holders.push({ name: 'Employee option pool', shares: n, round: 'Options', price: g.company.valuation / (cap.shares - n) });
}

// ── locking input prices with forward contracts

/** Lock today's commodity, energy and cloud prices for four or eight quarters, for a fee each quarter. */
export function lockInputs(g: GameState, quarters: number): ActionResult {
  const c = g.company;
  if (quarters !== 4 && quarters !== 8) return no('Contracts run for four or eight quarters.');
  if (c.hedge && c.hedge.until > g.turn) return no(`Your inputs are locked until ${quarters} quarters from when you signed.`);
  const materials = c.quarters[c.quarters.length - 1]?.pnl.cogs ?? 0;
  const fee = materials * (quarters === 8 ? 0.012 : 0.008);
  const m = g.macro;
  c.hedge = { commodity: m.commodity, energy: m.energy, cloud: m.cloud, until: g.turn + quarters, fee };
  return ok(`Input prices locked for ${quarters} quarters at about ${money(fee)} a quarter. You are protected if prices rise — and miss out if they fall.`);
}
/** The fee for the lock, booked as a finance cost. */
export function stepHedge(g: GameState) {
  const h = g.company.hedge;
  if (!h) return;
  if (h.until <= g.turn) {
    g.company.hedge = undefined;
    news(g, 'Your input-price contracts have expired. You pay market prices again.', 'info');
    return;
  }
  B.interest(g.company, h.fee);
}

// ── franchising (retail): a partner opens and runs the store; you earn a royalty on its sales

export const ROYALTY = 0.06;
export const FRANCHISE_FEE = 120_000;
export function canFranchise(g: GameState, city: string, ind: IndustryId = 'retail'): string {
  const c = g.company;
  if (ind !== 'retail' || !c.divisions.includes('retail')) return 'Franchising is for retail.';
  if ((g.discovered[city] ?? 0) < 1) return 'Explore the city first.';
  if (c.offices.some((o) => o.city === city && o.ind === ind)) return 'You run your own stores there.';
  if (c.franchises?.some((f) => f.city === city && f.ind === ind)) return 'You already have a franchisee there.';
  if (c.brand < 25) return 'Franchisees buy a brand. Yours needs to reach 25 first.';
  return '';
}
export function openFranchise(g: GameState, city: string): ActionResult {
  const why = canFranchise(g, city);
  if (why) return no(why);
  const c = g.company;
  (c.franchises ??= []).push({ city, ind: 'retail', share: 0, opened: g.turn, sales: 0 });
  B.expense(c, 'sm', FRANCHISE_FEE * 0.25 * g.macro.cpi, 'cash'); // legal work and the operations manual
  B.windfall(c, FRANCHISE_FEE * g.macro.cpi); // the franchisee's up-front fee
  return ok(`A franchisee will open in ${CITY[city].name}. You collect a ${money(FRANCHISE_FEE * g.macro.cpi)} fee now and ${pct(ROYALTY)} of its sales from here on.`);
}
/** Franchised stores win customers on your brand, more slowly than your own stores would, and pay a royalty. */
export function stepFranchises(g: GameState) {
  const c = g.company;
  for (const f of c.franchises ?? []) {
    const D = marketUnits(g, f.city, f.ind);
    // about 60% of what one of your own stores would win, more with a strong brand in the region
    const own = c.offices.filter((o) => o.ind === f.ind).map((o) => o.share).sort((a, b) => a - b);
    const typical = own.length ? own[Math.floor(own.length / 2)] : 0.001;
    const target = 0.6 * typical * (0.6 + c.brand / 100) * (0.8 + c.regionBrand[CITY[f.city].region] / 200);
    f.share = clamp(f.share + 0.25 * (target - f.share), 0, 0.05);
    f.sales = f.share * D * localPrice(g, f.city, f.ind);
    const royalty = f.sales * ROYALTY;
    if (royalty > 0) {
      B.bill(c, royalty, 0);
      B.collect(c, royalty);
    }
  }
}
export const franchiseRoyalties = (g: GameState) => (g.company.franchises ?? []).reduce((s, f) => s + f.sales * ROYALTY, 0);
