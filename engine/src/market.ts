// Market resolution: demand per city × industry, competitive attractiveness, share
// dynamics and units sold for the player's offices and every rival office.
import { CITY, FOUNDER, INDUSTRIES, PERSONALITY, hasInventory } from './content';
import { cycleMult, fxOf } from './macro';
import { DIFF } from './difficulty';
import { invSum, tempMod } from './mods';
import { execBonus, gmOf, marketWage, type Prep } from './people';
import type { AttractBreakdown, GameState, IndustryId, Office, OfficeResult, Rival, RivalOffice } from './types';
import { clamp, randRange } from './util';

export const mkKey = (city: string, ind: IndustryId) => `${city}:${ind}`;

export function market(g: GameState, city: string, ind: IndustryId) {
  const k = mkKey(city, ind);
  if (!g.mk[k]) g.mk[k] = { f: INDUSTRIES[ind].fringe * (0.8 + 0.6 * CITY[city].reg) * randRange(g, 0.85, 1.15), s: 1 };
  return g.mk[k];
}

/** Total demand in the market this quarter, in units, before the effect of the price level. */
export function marketUnits(g: GameState, city: string, ind: IndustryId): number {
  const def = INDUSTRIES[ind];
  const c = CITY[city];
  let mod = 1;
  for (const t of g.mods) {
    if (t.kind !== 'market' || t.until < g.turn) continue;
    if ((t.region && t.region !== c.region) || (t.ind && t.ind !== ind)) continue;
    mod *= 1 + t.pct / 100;
  }
  return def.marketBase * (c.pop / 5) * c.income * c.ind[ind] * g.cityIdx[city] * g.macro.indIdx[ind] * cycleMult(g, ind, c.region) * market(g, city, ind).s * mod;
}

/** Dollars per unit at price index 1.0 in this city (inflation, currency and local price level). */
export function localPrice(g: GameState, city: string, ind: IndustryId): number {
  return 1000 * g.macro.cpi * fxOf(g, city) * CITY[city].wage ** INDUSTRIES[ind].local;
}

/** The quality bar rises over time as the whole industry improves. */
export const refQuality = (g: GameState) => 50 + 0.12 * g.turn;

export function officeQuality(g: GameState, o: Office): number {
  const c = g.company;
  const def = INDUSTRIES[o.ind];
  const pol = c.policy[CITY[o.city].region];
  const gm = gmOf(c, o);
  const process = 50 + (pol.supply === 'lean' ? -6 : pol.supply === 'resilient' ? 5 : 0) + (gm ? (gm.skill - 50) * 0.3 : -5);
  const people = 0.55 * o.staff.ops.skill + 0.25 * o.morale + 0.2 * process;
  let q = def.techW * (c.tech[o.ind] ?? 0) + (1 - def.techW) * people + invSum(g, 'quality', o);
  if (o.ind === 'logistics') {
    const same = c.offices.filter((x) => x.ind === 'logistics' && CITY[x.city].region === CITY[o.city].region).length;
    const regions = new Set(c.offices.filter((x) => x.ind === 'logistics').map((x) => CITY[x.city].region)).size;
    q += Math.min(14, 3 * (same - 1) + 2.5 * (regions - 1));
  }
  if ((o.last?.util ?? 0) > 0.97) q -= 4; // overloaded teams let service slip
  return clamp(q * tempMod(g, 'quality', o), 5, 120);
}

export const priceIndex = (g: GameState, o: Office) => g.company.policy[CITY[o.city].region].price[o.ind] ?? 1;

/** Sales effort relative to what full coverage of the market would take. */
export function salesEffort(g: GameState, o: Office, D: number, mktShare: number): { effort: number; need: number; marketing: number } {
  const c = g.company;
  const def = INDUSTRIES[o.ind];
  const pol = c.policy[CITY[o.city].region];
  const s = o.staff.sales;
  const reps = Math.max(0, s.n - 0.5 * s.fresh) * (0.5 + s.skill / 100);
  const marketing = pol.marketing * mktShare;
  const mktReps = (marketing / (2 * marketWage(g, o, 'sales'))) * def.mktEff * (1 + execBonus(c, 'CMO') * 0.5);
  const need = Math.max(1, D / def.salesCover);
  const effort = ((reps + mktReps) / need) * (1 + invSum(g, 'salesEff', o) / 100) * FOUNDER[c.founder].salesEff;
  return { effort, need, marketing };
}

export function playerAttract(g: GameState, o: Office, D: number, mktShare: number): AttractBreakdown & { marketing: number } {
  const c = g.company;
  const def = INDUSTRIES[o.ind];
  const region = CITY[o.city].region;
  const pol = c.policy[region];
  const quality = officeQuality(g, o);
  const q = (quality / refQuality(g)) ** def.wq;
  const B = 0.4 * c.brand + 0.6 * c.regionBrand[region];
  const b = (0.6 + (0.8 * B) / 100) ** def.wb;
  const { effort, need, marketing } = salesEffort(g, o, D, mktShare);
  const m = def.organic + Math.min(1.8, effort ** 0.8);
  const price = priceIndex(g, o);
  const p = price ** -def.elast;
  const age = g.turn - o.opened;
  const partner = pol.partner && pol.partner.until >= g.turn ? 1 + pol.partner.boost : 1;
  const pres = Math.min(1, 0.35 + 0.11 * age) * partner * (o.integration > 0 ? 0.92 : 1);
  const mods = tempMod(g, 'demand', o) * (1 + invSum(g, 'demand', o) / 100) * (0.9 + (0.2 * c.reputation) / 100);
  return { quality, q, b, m, p, pres, mods, A: m * q * b * p * pres * mods, total: 0, effort, need, marketing };
}

/** Rivals get better at operating over time, as the player does through skill and training; better-run on harder levels. */
export function rivalOpsQuality(g: GameState, r: Rival): number {
  return PERSONALITY[r.personality].quality + DIFF[g.difficulty].rivalOps + Math.min(20, 0.2 * g.turn) + Math.min(6, r.offices.length * 0.5);
}
export function rivalQuality(g: GameState, r: Rival, ind: IndustryId): number {
  const def = INDUSTRIES[ind];
  return def.techW * (r.tech[ind] ?? def.startTech) + (1 - def.techW) * rivalOpsQuality(g, r);
}
export function rivalAttract(g: GameState, r: Rival, ro: RivalOffice): number {
  const def = INDUSTRIES[ro.ind];
  const q = (rivalQuality(g, r, ro.ind) / refQuality(g)) ** def.wq;
  const b = (0.6 + (0.8 * r.brand) / 100) ** def.wb;
  const m = def.organic + Math.min(1.8, ro.sales ** 0.8);
  const pres = Math.min(1, 0.35 + 0.11 * (g.turn - ro.opened));
  return m * q * b * ro.price ** -def.elast * pres;
}

interface Mkt {
  city: string;
  ind: IndustryId;
  player?: Office;
  rivals: [Rival, RivalOffice][];
}
export function listMarkets(g: GameState): Mkt[] {
  const map = new Map<string, Mkt>();
  const get = (city: string, ind: IndustryId) => {
    const k = mkKey(city, ind);
    let m = map.get(k);
    if (!m) map.set(k, (m = { city, ind, rivals: [] }));
    return m;
  };
  for (const o of g.company.offices) get(o.city, o.ind).player = o;
  for (const r of g.rivals) if (r.alive) for (const ro of r.offices) get(ro.city, ro.ind).rivals.push([r, ro]);
  return [...map.values()];
}

/** Share of a regional marketing budget that lands on each office (proportional to market size). */
export function marketingSplit(g: GameState): Map<string, number> {
  const out = new Map<string, number>();
  const byRegion = new Map<string, [Office, number][]>();
  for (const o of g.company.offices) {
    const r = CITY[o.city].region;
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push([o, marketUnits(g, o.city, o.ind) * localPrice(g, o.city, o.ind)]);
  }
  for (const list of byRegion.values()) {
    const tot = list.reduce((s, [, v]) => s + v, 0) || 1;
    for (const [o, v] of list) out.set(o.id, v / tot);
  }
  return out;
}

const emptyWages = () => ({ ops: 0, sales: 0, rnd: 0, admin: 0 });

export function resolveMarkets(g: GameState, preps: Map<string, Prep>) {
  const split = marketingSplit(g);
  for (const mk of listMarkets(g)) {
    const def = INDUSTRIES[mk.ind];
    const F = market(g, mk.city, mk.ind).f;
    const o = mk.player;
    // The average price level moves the size of the whole market a little.
    let named = 0, pw = 0;
    if (o) { named += o.share; pw += o.share * priceIndex(g, o); }
    for (const [, ro] of mk.rivals) { named += ro.share; pw += ro.share * ro.price; }
    const avgP = pw + Math.max(0, 1 - named);
    const D = marketUnits(g, mk.city, mk.ind) * avgP ** -def.mktElast;

    const pa = o ? playerAttract(g, o, D, split.get(o.id) ?? 1) : undefined;
    const ra = mk.rivals.map(([r, ro]) => rivalAttract(g, r, ro));
    const total = F + (pa?.A ?? 0) + ra.reduce((a, b) => a + b, 0);

    mk.rivals.forEach(([, ro], i) => {
      const capShare = ro.cap / D;
      const t = Math.min(ra[i] / total, capShare * 1.08);
      ro.share = clamp(Math.min(ro.share + def.stick * (t - ro.share), capShare * 1.15), 0, 0.95);
    });

    if (o && pa) {
      const prep = preps.get(o.id)!;
      pa.total = total;
      const inv = hasInventory(o.ind);
      const avail = prep.capacity + (inv ? o.inventory : 0);
      const capShare = avail / D;
      const target = pa.A / total;
      const t = Math.min(target, capShare * 1.08);
      o.share = clamp(Math.min(o.share + def.stick * (t - o.share), capShare * 1.15), 0, 0.95);
      const demand = o.share * D;
      let produced: number, sold: number;
      if (inv) {
        const expected = o.lastDemand > 0 ? 0.5 * o.lastDemand + 0.5 * demand : demand;
        produced = clamp(expected * 1.03 + (expected * def.dio) / 90 - o.inventory, 0, prep.capacity);
        sold = Math.min(demand, o.inventory + produced);
      } else {
        produced = sold = Math.min(demand, prep.capacity);
      }
      const price = localPrice(g, o.city, o.ind) * priceIndex(g, o);
      const potential = target * D;
      // Capacity binds when customers were turned away, or the office is full and would win more if it could serve them.
      const full = sold < demand * 0.995 || (demand > avail * 0.93 && target > o.share * 1.02);
      const bind: OfficeResult['bind'] = !full ? 'demand' : prep.facility < prep.laborCap ? 'facility' : 'staff';
      o.lastDemand = demand;
      o.last = {
        market: D, demand, target, capShare, sold, produced, capacity: prep.capacity, laborCap: prep.laborCap,
        util: prep.capacity > 0 ? Math.min(1.2, (inv ? produced : sold) / prep.capacity) : 0,
        price, revenue: sold * price, materials: 0, wages: emptyWages(), rent: 0, facility: 0, marketing: pa.marketing, hiring: 0, training: 0,
        contribution: 0, lost: Math.max(0, Math.min(potential, D) - sold) * price * (bind === 'demand' ? 0 : 1), bind, attract: pa,
        attrRate: 0, quits: 0, hires: 0, moraleTarget: o.morale, moraleParts: {}, prodMult: prep.prodMult, prodParts: prep.prodParts, unitCost: 0,
      };
    }
  }
}

/** The player's share of the world market in an industry (weighted by market size, all cities). */
export function globalShare(g: GameState, ind: IndustryId): number {
  let tot = 0, mine = 0;
  for (const c of Object.values(CITY)) {
    const v = marketUnits(g, c.id, ind) * localPrice(g, c.id, ind);
    tot += v;
  }
  for (const o of g.company.offices) if (o.ind === ind) mine += o.share * marketUnits(g, o.city, o.ind) * localPrice(g, o.city, o.ind);
  return tot > 0 ? mine / tot : 0;
}

/** A rival's share of the world market in an industry. */
export function rivalGlobalShare(g: GameState, r: Rival, ind: IndustryId): number {
  let tot = 0, theirs = 0;
  for (const c of Object.values(CITY)) tot += marketUnits(g, c.id, ind) * localPrice(g, c.id, ind);
  for (const ro of r.offices) if (ro.ind === ind) theirs += ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind);
  return tot > 0 ? theirs / tot : 0;
}

/**
 * Shares of the named companies' sales in an industry: you and every rival, at market value, worldwide.
 * Local incumbents are left out on purpose — they hold most of every market, and nobody counts them
 * when they ask who leads a category.
 */
export function namedShares(g: GameState, ind: IndustryId): { you: number; rivals: Map<number, number>; total: number } {
  const val = (city: string, share: number) => share * marketUnits(g, city, ind) * localPrice(g, city, ind);
  let you = 0;
  for (const o of g.company.offices) if (o.ind === ind) you += val(o.city, o.share);
  const rivals = new Map<number, number>();
  let total = you;
  for (const r of g.rivals) {
    if (!r.alive) continue;
    let v = 0;
    for (const ro of r.offices) if (ro.ind === ind) v += val(ro.city, ro.share);
    rivals.set(r.id, v);
    total += v;
  }
  if (total <= 0) return { you: 0, rivals: new Map(), total: 0 };
  for (const [k, v] of rivals) rivals.set(k, v / total);
  return { you: you / total, rivals, total };
}
