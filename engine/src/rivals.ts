// Rival companies: generation, quarterly AI, financials on the same economics as the player,
// escalation and retaliation, and the player's diplomatic options.
import * as B from './books';
import { CITIES, CITY, EVENT, INDUSTRIES, PERSONALITY, PERSONALITIES, RIVAL_CEOS, RIVAL_COLORS, RIVAL_NAMES, hasInventory, isCapital } from './content';
import { queueEvent, scaleS, scheduleEvent, SPECIALS } from './events';
import { countryTax, debtCapacity, dilute, equityAppetite, founderStake, growthOf, likeForLike, newPlant, noteAcquisition, noteRivalExit, plantStillNew, privateValue, rampCarry, scoreCredit, valueCompany, type LocalProfit } from './finance';
import { fxOf, inputIndex } from './macro';
import { localPrice, market, marketUnits } from './market';
import { addMod, hasFlag, news } from './mods';
import { feud } from './feud';
import { DIFF } from './difficulty';
import { makeOffice } from './newgame';
import { companyHeadcount } from './people';
import type { ActionResult, EventCtx, GameState, IndustryId, Office, Rival, RivalOffice } from './types';
import { chance, clamp, money, pick, rand, randInt, randRange, shuffle, weighted } from './util';

/** How much sales and R&D effort each industry rewards (software = 1). Rivals and bots both use these. */
export const SALES_INTENSITY: Record<IndustryId, number> = { saas: 1, consulting: 0.8, biotech: 0.5, retail: 0.35, mfg: 0.35, logistics: 0.25, energy: 0.1 };
export const RD_INTENSITY: Record<IndustryId, number> = { saas: 1.6, biotech: 1.5, mfg: 0.4, consulting: 0.25, energy: 0.2, logistics: 0.2, retail: 0.1 };
/** Marketing programmes (advertising, events, brand) as a share of revenue for an average competitor, on top of sales staff. */
export const MKT_INTENSITY: Record<IndustryId, number> = { saas: 0.1, biotech: 0.08, retail: 0.05, consulting: 0.04, mfg: 0.03, logistics: 0.02, energy: 0.01 };

const wageOf = (g: GameState, city: string, ind: IndustryId, role: 'ops' | 'sales' | 'admin') => INDUSTRIES[ind].wages[role] * 1000 * CITY[city].wage * g.macro.wageIdx * fxOf(g, city);
const alive = (g: GameState) => g.rivals.filter((r) => r.alive);
export { ctxForRival };
export const rivalById = (g: GameState, id: number | undefined) => g.rivals.find((r) => r.id === id);

/** Scale of a start-up operation in an industry, units a quarter (what the player starts with). */
export const startUnits = (ind: IndustryId) => (INDUSTRIES[ind].start.cap > 0 ? INDUSTRIES[ind].start.cap : INDUSTRIES[ind].start.ops * INDUSTRIES[ind].opsOut);

export function openRivalOffice(g: GameState, r: Rival, city: string, ind: IndustryId, share: number): RivalOffice {
  const pers = PERSONALITY[r.personality];
  const D = marketUnits(g, city, ind);
  market(g, city, ind);
  const ro: RivalOffice = { city, ind, share, price: pers.price, sales: 0.02, cap: Math.max(startUnits(ind), share * D * 1.25), opened: g.turn - (share > 0 ? 10 : 0), war: 0 };
  r.offices.push(ro);
  return ro;
}

/**
 * In a grid industry every unit a plant makes is sold, so capacity is size, and a rival office's plant can never
 * start smaller than a whole new plant. Left alone, that hands every energy rival two to four times the player's
 * capacity at the start. Instead a grid rival starts about the player's size on Easy and Normal (0.7–1.5×), and
 * about twice it on Brutal (1.5–3×). `scale` shrinks a newcomer further.
 */
export function sizeGridRival(g: GameState, r: Rival, ind: IndustryId, scale = 1) {
  const offices = r.offices.filter((ro) => ro.ind === ind);
  const total = offices.reduce((s, ro) => s + ro.cap, 0);
  if (!INDUSTRIES[ind].grid || total <= 0) return;
  // never smaller than you on average, even on Easy: a market you already lead from the first day is no contest
  const f = (startUnits(ind) * Math.max(0.9, DIFF[g.difficulty].rivalSize) * randRange(g, 0.8, 1.5) * scale) / total;
  for (const ro of offices) {
    ro.cap *= f;
    ro.share *= f;
  }
}

export function generateRivals(g: GameState, n: number): Rival[] {
  const d = DIFF[g.difficulty];
  const ind = g.company.primary;
  const pers = shuffle(g, PERSONALITIES.filter((p) => !p.late)).slice(0, n);
  const names = shuffle(g, RIVAL_NAMES);
  const ceos = shuffle(g, RIVAL_CEOS);
  // random keys are drawn once per item so the order does not depend on the sort algorithm (keeps seeds portable across browsers)
  const ranked = <T>(items: T[], key: (t: T) => number) => items.map((t) => [key(t) * rand(g), t] as [number, T]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const hqs = ranked(CITIES.filter((c) => c.id !== g.company.home), (c) => c.ind[ind] * Math.sqrt(c.pop));
  const taken: Record<string, number> = {};
  const rivals: Rival[] = [];
  pers.forEach((p, i) => {
    const def = INDUSTRIES[ind];
    const hq = hqs[i % hqs.length];
    const r: Rival = {
      id: i, name: names[i], ceo: ceos[i], personality: p.id, color: RIVAL_COLORS[i % RIVAL_COLORS.length], hq: hq.id, industries: [ind], offices: [], cash: 0, debt: 0,
      tech: { [ind]: clamp(def.startTech + 8 + (p.id === 'innovator' ? 12 : 0) + randRange(g, -4, 4) + (d.rivalSize - 1) * 6, 10, 90) },
      brand: 0, eff: p.eff * d.rivalEff, alive: true, isPublic: false, relation: randInt(g, -10, 10), hostility: p.aggression * d.aggression > 0.9 ? 2 : 1, pactUntil: -1,
      lastMove: -9, grievances: 0, rev: 0, profit: 0, ebitda: 0, revTTM: [], ebitdaTTM: [], ar: 0, inv: 0, wc: 0, nolBy: {}, spread: 3.5, rating: 'BB', raised: 0, lastRaise: -99,
      valuation: 0, distress: 0, known: false,
    };
    g.rivals.push(r); // so market lookups see it while we build
    const count = clamp(Math.round(2 * d.rivalSize + randRange(g, 0, 1.5) + (p.id === 'expander' ? 1 : 0)), 1, 8);
    const cands = ranked(CITIES.filter((c) => c.id !== hq.id), (c) => (c.region === hq.region ? 2 : 1) * c.ind[ind]);
    const cities = [hq.id, ...cands.slice(0, count - 1).map((c) => c.id)];
    if (i === 0 && !cities.includes(g.company.home)) cities[cities.length > 1 ? cities.length - 1 : 0] = g.company.home; // someone is always in your back yard
    for (const c of cities) {
      const room = 0.55 - (taken[c] ?? 0);
      if (room < 0.005) continue;
      // sized relative to what the player starts with, so rivals are established but within reach
      // (in a grid industry every unit sells, so plants start smaller to give the same head start)
      const units = startUnits(ind) * d.rivalSize * randRange(g, 1.0, 2.5) * (c === hq.id ? 1.8 : 1) * (def.grid ? 0.45 : 1);
      const share = Math.min(room, 0.1, units / marketUnits(g, c, ind));
      taken[c] = (taken[c] ?? 0) + share;
      openRivalOffice(g, r, c, ind, share);
    }
    sizeGridRival(g, r, ind);
    const annual = r.offices.reduce((s, ro) => s + ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind), 0) * 4;
    r.cash = annual * randRange(g, 0.3, 0.6);
    r.debt = annual * p.leverage * 0.5;
    r.brand = clamp(18 + 9 * r.offices.length ** 0.7 + randRange(g, 0, 8), 0, 90);
    seedRivalAccounts(g, r);
    rivals.push(r);
  });
  g.rivals = [];
  return rivals;
}

// ───────────────────────── rival accounts ─────────────────────────
// Rivals run on the player's economics: the same cost lines, working capital, country-by-country tax,
// the same valuation function, and the same lenders and investors. Nothing is free.

export interface RivalQuarter {
  rev: number;
  opex: number; // office costs: materials, payroll (operations, sales and admin), hiring, rent, facilities
  overhead: number; // head office, the same formula as the player's
  execs: number;
  rd: number;
  ebitda: number;
  da: number; // plant wearing out (replaced as it goes: capex equals depreciation)
  interest: number;
  pretax: number;
  ar: number;
  inv: number;
  ap: number;
  deferred: number;
  staff: number;
  local: Map<string, LocalProfit>;
  mix: Partial<Record<IndustryId, number>>;
  byOffice: Record<string, number>; // revenue by office ("city:industry")
}

/** One quarter of a rival's accounts at today's prices and shares. Changes nothing. */
export function rivalQuarter(g: GameState, r: Rival): RivalQuarter {
  const d = DIFF[g.difficulty];
  const m = g.macro;
  const pers = PERSONALITY[r.personality];
  const slow = 1 + Math.max(0, -m.gap) * 0.05; // customers pay late in downturns
  let rev = 0, opex = 0, da = 0, staff = 0, ar = 0, inv = 0, ap = 0, deferred = 0;
  const local = new Map<string, LocalProfit>();
  const mix: Partial<Record<IndustryId, number>> = {};
  const byOffice: Record<string, number> = {};
  for (const ro of r.offices) {
    const def = INDUSTRIES[ro.ind];
    const city = CITY[ro.city];
    const D = marketUnits(g, ro.city, ro.ind);
    const sold = Math.min(ro.share * D, ro.cap);
    const orev = sold * localPrice(g, ro.city, ro.ind) * ro.price;
    const fx = fxOf(g, ro.city);
    const loc = m.cpi * fx;
    const materials = sold * 1000 * def.varCost * inputIndex(g, ro.ind) * fx * city.wage ** def.local;
    const ops = ro.cap / (def.opsOut * (m.prodIdx ?? 1));
    const reps = ro.sales * (D / def.salesCover);
    const admin = (ops + reps) / 14;
    const pay = ops * wageOf(g, ro.city, ro.ind, 'ops') + reps * wageOf(g, ro.city, ro.ind, 'sales') + admin * wageOf(g, ro.city, ro.ind, 'admin');
    const hiring = 0.028 * pay; // replacing leavers and training, as the player pays
    const rent = (ops + reps + admin) * def.seatRent * 1000 * city.rent * loc;
    const facility = ro.cap * def.fixedPerCap * 1000 * (0.4 + 0.6 * city.rent) * loc;
    const marketing = MKT_INTENSITY[ro.ind] * (pers.sales / 0.2) * d.rivalSales * orev;
    const cost = (materials + pay + hiring + rent + facility + marketing) * r.eff;
    const dep = ((ro.cap * def.capPerUnit * 1000 * m.cpi) / def.deprQ) * r.eff;
    byOffice[officeKey(ro)] = orev;
    rev += orev;
    opex += cost;
    da += dep;
    staff += ops + reps + admin;
    ar += (orev * def.dso * slow) / 90;
    deferred += orev * def.deferred;
    if (hasInventory(ro.ind)) inv += 0.3 * materials * r.eff;
    ap += ((cost - pay * r.eff) * def.dpo) / 90;
    const lp = local.get(city.country) ?? { rev: 0, pre: 0, taxW: 0 };
    local.set(city.country, { rev: lp.rev + orev, pre: lp.pre + orev - cost - dep, taxW: lp.taxW + orev * city.tax });
    mix[ro.ind] = (mix[ro.ind] ?? 0) + orev;
  }
  for (const k of Object.keys(mix) as IndustryId[]) mix[k] = rev > 0 ? mix[k]! / rev : 1 / Object.keys(mix).length;
  if (!Object.keys(mix).length) mix[r.industries[0]] = 1;
  const primary = r.industries[0];
  const overhead = 25_000 * m.cpi * clamp(staff / 50, 0.2, 1) + 0.012 * rev + (r.isPublic ? 350_000 * m.cpi + 0.003 * rev : 0);
  // a leadership team at head office and a general manager in every office, paid as the player's are
  const execs = (clamp(2 + r.offices.length / 2, 2, 6) * 2 * CITY[r.hq].wage * fxOf(g, r.hq) + r.offices.reduce((a, ro) => a + 1.2 * CITY[ro.city].wage * fxOf(g, ro.city), 0)) * INDUSTRIES[primary].wages.admin * 1000 * 1.18 * m.wageIdx;
  const rd = pers.rd * d.rivalRd * rev * (r.industries.reduce((a, k) => a + RD_INTENSITY[k], 0) / r.industries.length);
  const ebitda = rev - opex - overhead - execs - rd;
  ap += ((overhead + rd) * INDUSTRIES[primary].dpo) / 90;
  const interest = (r.debt * (m.rate + r.spread)) / 400 - (Math.max(0, r.cash) * Math.max(0, m.rate - 1)) / 400;
  return { rev, opex, overhead, execs, rd, ebitda, da, interest, pretax: ebitda - da - interest, ar, inv, ap, deferred, staff, local, mix, byOffice };
}

const officeKey = (ro: RivalOffice) => `${ro.city}:${ro.ind}`;
const sum4 = (xs: number[]) => (xs.length ? (xs.slice(-4).reduce((a, b) => a + b, 0) * 4) / Math.min(4, xs.length) : 0);
export const rivalGrowth = (r: Rival) => growthOf(r.revTTM);

/** A rival valued exactly as the player is: the same function, the same private-company discount. */
export function rivalValuation(g: GameState, r: Rival, mix?: Partial<Record<IndustryId, number>>): { equity: number; parts: Record<string, number> } {
  const ind = r.industries[0];
  const plant = r.offices.reduce((s, ro) => s + ro.cap * INDUSTRIES[ro.ind].capPerUnit * 1000 * g.macro.cpi, 0) * 0.5;
  const v = valueCompany({
    rev: sum4(r.revTTM), ebitda: sum4(r.ebitdaTTM), growth: growthOf(likeForLike(r.revTTM, r.ramp ?? [])), mix: mix ?? rivalQuarter(g, r).mix,
    tech: r.tech[ind] ?? INDUSTRIES[ind].startTech, brand: r.brand, reputation: 50, sentiment: g.macro.sentiment, rate: g.macro.rate,
    cash: r.cash, debt: r.debt, assets: 0.5 * plant + 0.6 * r.ar + 0.4 * r.inv,
    // new plant at cost until a year of its sales is in the accounts, and grid plant out of growth until it is
    // like-for-like, exactly as for the player
    cip: (r.ramp ?? []).reduce((s, x) => s + x.cost * rampCarry(g, x), 0),
  });
  return { equity: r.isPublic ? v.equity : privateValue(v.equity, r.cash, r.debt), parts: v.parts };
}

/** How lenders see a rival. */
export const rivalCredit = (g: GameState, r: Rival) =>
  scoreCredit({ rev: sum4(r.revTTM), ebitda: sum4(r.ebitdaTTM), interest: (r.debt * (g.macro.rate + r.spread)) / 100, debt: r.debt, cash: r.cash, breaches: 0, cfo: 0.5, cpi: g.macro.cpi });

/** An established rival has a year of history and the working capital its trade needs. */
export function seedRivalAccounts(g: GameState, r: Rival) {
  const q = rivalQuarter(g, r);
  const back = [0.92, 0.946, 0.973, 1]; // about 11% a year of growth behind it
  r.rev = q.rev;
  r.ebitda = q.ebitda;
  r.profit = q.pretax > 0 ? q.pretax * 0.75 : q.pretax;
  r.revTTM = back.map((f) => q.rev * f);
  r.ebitdaTTM = back.map((f) => q.ebitda * f);
  r.ar = q.ar;
  r.inv = q.inv;
  r.wc = q.ar + q.inv - q.ap - q.deferred;
  const cr = rivalCredit(g, r);
  r.rating = cr.rating;
  r.spread = cr.spread + g.macro.spread * 0.5;
  r.valuation = rivalValuation(g, r, q.mix).equity;
}

/** What the player can see of a rival. */
export function rivalKnown(g: GameState, r: Rival): boolean {
  return g.company.intel >= 1 || r.isPublic || r.offices.some((ro) => (g.discovered[ro.city] ?? 0) >= 1) || !r.alive;
}
export const officeVisible = (g: GameState, ro: RivalOffice) => (g.discovered[ro.city] ?? 0) >= 1 || g.company.intel >= 1;
export const officeDetail = (g: GameState, ro: RivalOffice) => (g.discovered[ro.city] ?? 0) >= 2 || g.company.intel >= 1;
const overlapOffice = (g: GameState, r: Rival): Office | undefined => {
  const c = g.company;
  for (const ro of r.offices) {
    const o = c.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (o) return o;
  }
  return undefined;
};
const ctxFor = (g: GameState, r: Rival, o?: Office): EventCtx => {
  return ctxForRival(g, r, o);
};
function ctxForRival(g: GameState, r: Rival, o?: Office): EventCtx {
  const off = o ?? overlapOffice(g, r) ?? g.company.offices[0];
  return { rival: r.id, office: off.id, city: off.city, region: CITY[off.city].region, ind: off.ind };
}

/** Pre-market decisions: prices, sales effort, capacity, expansion, financing. */
export function rivalsDecide(g: GameState) {
  const d = DIFF[g.difficulty];
  const m = g.macro;
  for (const r of alive(g)) {
    const pers = PERSONALITY[r.personality];
    const costs = Math.max(1, r.rev - r.profit);
    const healthy = r.cash > costs * 1.5;
    for (const ro of r.offices) {
      const def = INDUSTRIES[ro.ind];
      const D = marketUnits(g, ro.city, ro.ind);
      const util = ro.cap > 0 ? (ro.share * D) / ro.cap : 1;
      // capacity follows demand, if the money is there
      // a plant takes as long to build for a rival as for the player, so one expansion at a time
      if (util > 0.88 && healthy && g.turn - (ro.built ?? -99) >= Math.max(1, def.buildQ)) {
        const add = ro.cap * randRange(g, 0.1, 0.25);
        ro.built = g.turn;
        const cost = add * (def.capPerUnit * 1000 * m.cpi + (wageOf(g, ro.city, ro.ind, 'ops') / def.opsOut) * 0.6);
        if (r.cash > cost + costs) {
          ro.cap += add;
          r.cash -= cost;
          if (isCapital(ro.ind)) (r.ramp ??= []).push(newPlant(ro.ind, add * def.capPerUnit * 1000 * m.cpi, g.turn));
        }
      } else if (util < 0.5 && !isCapital(ro.ind)) ro.cap *= 0.92;
      // price: personality anchor, nudged by how full they are; wars override
      let target = pers.price + (util > 0.95 ? 0.05 : util < 0.6 ? -0.04 : 0);
      if (ro.war > 0) {
        target = pers.price * 0.8;
        ro.war--;
      }
      // sales and marketing budget is a share of the office's revenue, with a floor of a couple of reps
      const rev = Math.min(ro.share * D, ro.cap) * localPrice(g, ro.city, ro.ind) * ro.price;
      const repWage = wageOf(g, ro.city, ro.ind, 'sales');
      // where you are taking their customers, better-run rivals fight back with sales effort and price
      const mine = g.company.offices.find((o) => o.city === ro.city && o.ind === ro.ind);
      const threat = mine && mine.hist.length >= 2 ? clamp((mine.share - mine.hist[Math.max(0, mine.hist.length - 5)].share) / Math.max(0.005, ro.share), 0, 1) + (mine.share > ro.share ? 0.5 : 0) : 0;
      const defend = 1 + d.defend * threat;
      if (threat > 0.2 && d.defend > 0 && ro.war === 0) target -= 0.04 * d.defend * threat;
      ro.price = clamp(ro.price + 0.35 * (target - ro.price), 0.55, 1.6);
      const budget = Math.max(pers.sales * SALES_INTENSITY[ro.ind] * d.rivalSales * defend * rev, 2 * repWage) * (healthy ? 1 : 0.7) * (m.phase === 'recession' && r.personality === 'conservative' ? 0.8 : 1);
      const effort = budget / ((D / def.salesCover) * repWage);
      ro.sales = clamp(ro.sales + 0.5 * (effort - ro.sales), 0.001, 1.5);
    }
    // expansion
    const pExp = pers.expand * (m.phase === 'boom' ? 1.3 : m.phase === 'recession' ? 0.4 : 1) * (0.7 + 0.3 * d.rivalSize);
    if (healthy && r.offices.length < d.rivalMax && chance(g, pExp)) {
      const ind = r.industries[0];
      const def = INDUSTRIES[ind];
      const here = new Set(r.offices.map((o) => o.city));
      const hqReg = CITY[r.hq].region;
      const c = weighted(g, CITIES.filter((x) => !here.has(x.id)), (x) => x.ind[ind] * Math.sqrt(x.pop * x.income) * (x.region === hqReg ? 2 : 1) * (g.company.offices.some((o) => o.city === x.id) ? 1 + pers.aggression * d.aggression : 1));
      if (c) {
        const cap = startUnits(ind);
        const cost = cap * def.capPerUnit * 1000 * m.cpi + 150_000 * m.cpi;
        if (r.cash > cost + costs * 2) {
          r.cash -= cost;
          // a rival's office sells from its first quarter (it is not short of staff), so its plant's year starts now
          if (isCapital(ind)) (r.ramp ??= []).push(newPlant(ind, cap * def.capPerUnit * 1000 * m.cpi, g.turn, { at: `${c.id}:${ind}` }));
          openRivalOffice(g, r, c.id, ind, 0);
          if ((g.discovered[c.id] ?? 0) >= 1) news(g, `${r.name} has opened in ${c.name}.`, 'rival');
          const mine = g.company.offices.find((o) => o.city === c.id && o.ind === ind);
          if (mine && c.id === g.company.home && EVENT.rival_enters && rivalCardFree(g) && queueEvent(g, 'rival_enters', ctxFor(g, r, mine))) g.counters.rivalCard = g.turn;
        }
      }
    }
    // financing: the same lenders and investors the player faces
    const credit = rivalCredit(g, r);
    r.rating = credit.rating;
    r.spread = Math.max(0.4, credit.spread + m.spread * 0.5);
    if (r.cash < costs * 0.75) {
      // borrow against receivables, stock and cash flow, as far as lenders allow and the personality will go
      const cap = debtCapacity(g, { ar: r.ar, inventory: r.inv, ebitda: sum4(r.ebitdaTTM), debt: r.debt, maxLev: credit.maxLev });
      const room = Math.max(0, (cap.base + cap.cashFlow + r.debt) * clamp(0.4 + 0.6 * pers.leverage, 0.4, 1) - r.debt);
      const amt = Math.min(room, costs * 1.5 - r.cash);
      if (amt > costs * 0.05) {
        r.debt += amt;
        r.cash += amt * 0.99; // arrangement fee
      }
      // still short: sell shares, if investors want them
      const runway = r.cash / costs;
      const appetite = equityAppetite(m.sentiment, rivalGrowth(r), runway) + (r.personality === 'disruptor' ? 0.35 : r.personality === 'innovator' ? 0.15 : 0);
      if (r.cash < costs * 0.75 && g.turn - r.lastRaise >= 3 && appetite >= 0.2 && r.valuation > 0) {
        const pct = m.sentiment < 0.9 ? 0.3 : 0.22;
        const raise = ((r.valuation * pct) / (1 - pct)) * 0.96;
        r.cash += raise;
        r.raised += raise;
        r.lastRaise = g.turn;
        if (r.known) news(g, `${r.name} has raised ${money(raise)} from investors.`, 'rival');
      }
    } else if (r.cash > costs * 4 && r.debt > 0) {
      const pay = Math.min(r.debt, r.cash - costs * 3);
      r.debt -= pay;
      r.cash -= pay;
    } else if (r.debt <= 0 && r.cash > costs * (r.personality === 'conservative' ? 8 : 5)) {
      // surplus cash goes back to the owners (dividends or buybacks), as boards make companies do
      r.cash -= 0.25 * (r.cash - costs * (r.personality === 'conservative' ? 8 : 5));
    }
  }
}

function absorb(g: GameState, buyer: Rival, target: Rival) {
  for (const ro of target.offices) {
    const mine = buyer.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (mine) {
      mine.share = clamp(mine.share + ro.share, 0, 0.9);
      mine.cap += ro.cap;
    } else buyer.offices.push(ro);
  }
  for (const k of target.industries) if (!buyer.industries.includes(k)) buyer.industries.push(k);
  for (const k of target.industries) buyer.tech[k] = Math.max(buyer.tech[k] ?? 0, target.tech[k] ?? 0);
  buyer.cash += Math.max(0, target.cash);
  buyer.ar += target.ar;
  buyer.inv += target.inv;
  buyer.wc += target.wc;
  target.offices = [];
  noteRivalExit(g, target);
  target.alive = false;
  target.fate = `Acquired by ${buyer.name}`;
}

function liquidate(g: GameState, r: Rival) {
  r.alive = false;
  r.fate = 'Bankrupt';
  for (const ro of r.offices) market(g, ro.city, ro.ind).f *= 0.97;
  r.offices = [];
}

/** Post-market: revenue, costs, cash, technology, distress, consolidation, and moves against the player. */
/** At most one rival card every fourth quarter (review wave 3): rivals keep acting on the map in between, but you are
 *  not asked to respond each time, and their moves count against the quarter's share of decision cards. */
/** What a rival offers for the whole company: a premium on its value, and something even when the market values it at next to nothing. */
export const takeoverPrice = (g: GameState, hostile: boolean) => Math.max(g.company.valuation, 250_000 * g.macro.cpi) * (hostile ? 1.3 : 1.15);

export const RIVAL_CARD_GAP = 4;
export const rivalCardFree = (g: GameState) => !g.queue.some((e) => EVENT[e.id]?.cat === 'rival') && g.turn - (g.counters.rivalCard ?? -99) >= RIVAL_CARD_GAP;

export function rivalsFinancials(g: GameState) {
  const d = DIFF[g.difficulty];
  const c = g.company;
  const m = g.macro;
  let acted = !rivalCardFree(g);
  const asked = acted;
  for (const r of alive(g)) {
    if (r.ramp) r.ramp = r.ramp.filter((x) => plantStillNew(g, x));
    const pers = PERSONALITY[r.personality];
    const q = rivalQuarter(g, r);
    for (const x of r.ramp ?? []) if (x.rev && x.at) x.rev.push(q.byOffice[x.at] ?? 0);
    const tax = countryTax(q.local, q.pretax, r.nolBy, { country: CITY[r.hq].country, rate: CITY[r.hq].tax });
    r.nolBy = tax.nolBy;
    r.profit = q.pretax - tax.tax;
    r.rev = q.rev;
    r.ebitda = q.ebitda;
    // working capital moves with the business: growth ties up cash, shrinking releases it
    const wc = q.ar + q.inv - q.ap - q.deferred;
    r.cash += r.profit - (wc - r.wc); // depreciation is spent again on replacing worn plant
    r.wc = wc;
    r.ar = q.ar;
    r.inv = q.inv;
    r.revTTM.push(q.rev);
    r.ebitdaTTM.push(q.ebitda);
    if (r.revTTM.length > 8) r.revTTM.shift();
    if (r.ebitdaTTM.length > 8) r.ebitdaTTM.shift();
    for (const k of r.industries) {
      const def = INDUSTRIES[k];
      const rp = q.rd / r.industries.length / (def.rdCost * 1000 * m.cpi);
      const target = def.startTech - 6 + 27 * Math.min(1, def.techGain + 0.1) * Math.log10(1 + rp) + (r.personality === 'innovator' ? 6 : 0);
      const t = r.tech[k] ?? def.startTech;
      r.tech[k] = clamp(t < target ? t + 0.12 * Math.max(def.techGain, 0.5) * (target - t) : t - Math.min(def.techDecay, 0.15 * (t - target)), 5, 100);
    }
    const avgShare = r.offices.length ? r.offices.reduce((s, o) => s + o.share, 0) / r.offices.length : 0;
    r.brand += 0.05 * (clamp(18 + 9 * r.offices.length ** 0.7 + 120 * avgShare, 0, 90) - r.brand);
    r.valuation = rivalValuation(g, r, q.mix).equity;
    r.known = rivalKnown(g, r);
    r.hostility = clamp(r.hostility - 0.12 * (pers.grudgeDecay ?? 1), 0, 10);
    if (pers.community) r.brand = Math.max(r.brand, 45); // members stay loyal
    r.relation += (0 - r.relation) * 0.03;
    if (r.pact && r.pactUntil < g.turn) {
      r.pact = undefined;
      if (r.known) news(g, `Your agreement with ${r.name} has lapsed.`, 'rival');
    }

    // distress and bankruptcy (a state champion is bailed out, three times at most)
    if (r.cash < 0 && pers.subsidised && (r.aid ?? 0) < 3) {
      const aid = Math.max(-r.cash, 0) + Math.max(1, r.rev - r.profit);
      r.cash += aid;
      r.debt += aid * 0.5;
      r.aid = (r.aid ?? 0) + 1;
      if (r.known) news(g, `${r.name} has received ${money(aid)} of state aid.`, 'rival');
    }
    if (r.cash < 0) {
      r.distress++;
      if (r.distress === 2 && r.known && EVENT.rival_distress && !acted) acted = queueEvent(g, 'rival_distress', ctxFor(g, r));
      if (r.distress >= 4) {
        const buyer = PERSONALITY[r.personality].neverSells ? undefined : alive(g).filter((x) => x !== r && x.cash > r.rev * 2).sort((a, b) => PERSONALITY[b.personality].acquisitive - PERSONALITY[a.personality].acquisitive)[0];
        if (buyer && chance(g, 0.5 + PERSONALITY[buyer.personality].acquisitive * 0.4)) {
          buyer.cash -= r.rev * 1.5;
          noteAcquisition(g, r.rev * 1.5, buyer.id);
          absorb(g, buyer, r);
          news(g, `${buyer.name} has bought the remains of ${r.name}.`, 'rival');
        } else {
          liquidate(g, r);
          news(g, `${r.name} has gone bankrupt. Its customers are up for grabs.`, 'rival');
        }
        continue;
      }
    } else r.distress = 0;

    // consolidation: acquirers buy weaker rivals
    if (pers.acquisitive > 0.4 && g.turn > 8 && chance(g, 0.025 * pers.acquisitive * d.aggression)) {
      const prey = alive(g).filter((x) => x !== r && !PERSONALITY[x.personality].neverSells && x.valuation < r.valuation * 0.5 && x.valuation < (r.cash + r.rev * 4) * 1.2).sort((a, b) => a.valuation - b.valuation)[0];
      if (prey) {
        const price = prey.valuation * 1.3;
        r.cash -= price * 0.35;
        r.debt += price * 0.65 + prey.debt;
        noteAcquisition(g, price + prey.debt, r.id);
        absorb(g, r, prey);
        news(g, `${r.name} has acquired ${prey.name} for ${money(price)}.`, 'rival');
      }
    }

    if (r.pact || acted || g.turn - r.lastMove < 3 || g.turn < 4) continue;
    const ov = overlapOffice(g, r);
    const threat = r.offices.reduce((s, ro) => s + (c.offices.find((o) => o.city === ro.city && o.ind === ro.ind)?.share ?? 0), 0);
    const aggr = pers.aggression * d.aggression;

    // retaliation for what the player did to them
    if (r.grievances > 0 && chance(g, 0.35 + pers.grudge * 0.5)) {
      r.grievances = 0;
      r.hostility = clamp(r.hostility + 1.5, 0, 10);
      const home = c.offices.find((o) => o.city === c.home) ?? c.offices[0];
      let ro = r.offices.find((x) => x.city === home.city && x.ind === home.ind);
      if (!ro && r.cash > 0) ro = openRivalOffice(g, r, home.city, home.ind, 0);
      if (ro) ro.war = 5;
      r.lastMove = g.turn;
      if (EVENT.rival_retaliation) acted = queueEvent(g, 'rival_retaliation', ctxFor(g, r, home));
      continue;
    }
    // hostile moves
    const pHostile = clamp((0.03 + 0.25 * aggr * (0.25 + threat * 4)) * (1 + r.hostility / 4), 0, 0.45);
    if (chance(g, pHostile)) {
      const weak = c.valuation < r.valuation * 0.6 || c.negCashTurns > 0;
      const opts: [string, number][] = [
        ['rival_price_war', ov ? pers.moves.war : 0],
        ['rival_poach', pers.moves.poach],
        ['rival_lawsuit', pers.moves.lawsuit],
        ['rival_lobby', pers.moves.lobby],
        ['rival_smear', 0.6 * aggr],
        ['rival_supplier', ov && INDUSTRIES[c.primary].varCost > 0.2 ? 0.8 : 0],
        ['rival_copy', (c.tech[c.primary] ?? 0) > (r.tech[c.primary] ?? 0) + 6 ? 1.5 : 0],
        ['rival_talent_raid', c.people.length ? 0.8 : 0],
        ['rival_trash_talk', 0.5],
        ['rival_takeover', weak && !c.cap.isPublic && pers.acquisitive > 0.1 ? 4 * pers.acquisitive : 0],
        ['rival_hostile_bid', weak && c.cap.isPublic && founderStake(c) < 0.5 ? 5 * pers.acquisitive : 0],
      ];
      const choice = weighted(g, opts.filter(([id]) => EVENT[id] && g.turn - (g.fired[id] ?? -99) >= 4), ([, w]) => w);
      if (choice) {
        const id = choice[0];
        if (id === 'rival_price_war' && ov) {
          const ro = r.offices.find((x) => x.city === ov.city && x.ind === ov.ind)!;
          ro.war = randInt(g, 4, 6);
        }
        const ctx = ctxFor(g, r, id === 'rival_price_war' ? ov : undefined);
        if (id === 'rival_talent_raid') {
          const p = pick(g, c.people);
          ctx.person = p.id;
        }
        if (id === 'rival_takeover' || id === 'rival_hostile_bid') ctx.amount = takeoverPrice(g, id === 'rival_hostile_bid');
        acted = queueEvent(g, id, ctx);
        if (acted) {
          r.lastMove = g.turn;
          r.hostility = clamp(r.hostility + 0.5, 0, 10);
        }
        continue;
      }
    }
    // friendly approaches
    const pFriendly = 0.02 + Math.max(0, r.relation) / 400 + (r.hostility > 3 && r.profit < 0 ? 0.08 : 0);
    if (chance(g, pFriendly)) {
      const opts: [string, number][] = [
        ['rival_truce', r.hostility >= 2.5 ? 3 : 0],
        ['rival_partnership', r.relation > 5 ? 2 : 0.4],
        ['rival_cartel', ov && r.personality !== 'innovator' ? 0.8 : 0],
        ['rival_merger', r.relation > 30 && Math.abs(Math.log(Math.max(1, r.valuation) / Math.max(1, c.valuation))) < 0.7 ? 1 : 0],
      ];
      const choice = weighted(g, opts.filter(([id]) => EVENT[id] && g.turn - (g.fired[id] ?? -99) >= 8), ([, w]) => w);
      if (choice) {
        acted = queueEvent(g, choice[0], ctxFor(g, r));
        if (acted) r.lastMove = g.turn;
      }
    }
  }
  if (acted && !asked) g.counters.rivalCard = g.turn;
}

// ───────────────────────── player diplomacy ─────────────────────────

const R = (g: GameState, id: number) => {
  const r = rivalById(g, id);
  return r && r.alive ? r : undefined;
};
const fail = (msg: string): ActionResult => ({ ok: false, msg });
const cool = (g: GameState, r: Rival, key: string, quarters: number): boolean => {
  const k = `dip:${key}:${r.id}`;
  if (g.turn - (g.counters[k] ?? -99) < quarters) return false;
  g.counters[k] = g.turn;
  return true;
};

export function improveRelations(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!cool(g, r, 'rel', 2)) return fail('You have only just sat down with them. Give it a couple of quarters.');
  const cost = 0.01 * scaleS(g);
  B.expense(g.company, 'ga', cost, 'cash');
  r.relation = clamp(r.relation + 8, -100, 100);
  r.hostility = clamp(r.hostility - 0.5, 0, 10);
  return { ok: true, msg: `A long dinner with ${r.ceo}. Relations are a little warmer.` };
}

export function truceOdds(g: GameState, r: Rival): number {
  const pers = PERSONALITY[r.personality];
  return clamp(0.5 - pers.aggression * 0.3 + (r.profit < 0 ? 0.25 : 0) + r.relation / 200 - r.grievances * 0.1, 0.05, 0.95);
}
export function startPact(g: GameState, r: Rival, pact: 'truce' | 'alliance', quarters: number) {
  r.pact = pact;
  r.pactUntil = g.turn + quarters;
  r.hostility = clamp(r.hostility - 3, 0, 10);
  r.grievances = 0;
  for (const ro of r.offices) ro.war = 0;
}
export function proposeTruce(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('You already have an agreement with them.');
  if (!cool(g, r, 'truce', 4)) return fail('They turned you down recently. Ask again in a year.');
  if (chance(g, truceOdds(g, r))) {
    startPact(g, r, 'truce', 8);
    feud(g, r, 'you', 'A truce: two years without hostile moves.');
    news(g, `${g.company.name} and ${r.name} have agreed to stop fighting, for now.`, 'rival');
    return { ok: true, msg: `${r.ceo} agrees: no hostile moves from either side for two years.` };
  }
  r.relation = clamp(r.relation - 5, -100, 100);
  return { ok: false, msg: `${r.ceo} is not interested. "We are winning," they say.` };
}
export function proposeAlliance(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact === 'alliance') return fail('You are already allies.');
  if (r.relation < 20) return fail('They do not trust you enough yet. Improve relations first.');
  if (!cool(g, r, 'ally', 4)) return fail('Asked too recently.');
  if (chance(g, clamp(0.3 + r.relation / 100 - PERSONALITY[r.personality].aggression * 0.2, 0.1, 0.9))) {
    startPact(g, r, 'alliance', 12);
    addMod(g, { kind: 'demand', pct: 3, quarters: 12, src: 'alliance' });
    for (const o of alive(g)) if (o !== r) o.hostility = clamp(o.hostility + 0.5, 0, 10);
    news(g, `${g.company.name} and ${r.name} have announced a strategic alliance.`, 'rival');
    return { ok: true, msg: `Alliance signed for three years: shared intelligence and joint marketing. Other rivals are watching.` };
  }
  return { ok: false, msg: `${r.ceo} would rather keep things informal.` };
}
export function poachTalent(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('That would break your agreement.');
  if (!cool(g, r, 'poach', 2)) return fail('Their people are on their guard. Wait a couple of quarters.');
  const cost = 0.03 * scaleS(g);
  if (cost > c.books.cash) return fail('Not enough cash for signing bonuses.');
  B.expense(c, 'ga', cost, 'cash');
  r.grievances++;
  r.hostility = clamp(r.hostility + 1, 0, 10);
  r.relation = clamp(r.relation - 15, -100, 100);
  if (!chance(g, 0.6)) {
    feud(g, r, 'you', 'You tried to poach their engineers; the approach leaked.');
    return { ok: false, msg: `The approach leaked. Nobody came across, and ${r.name} is furious.` };
  }
  const o = overlapOffice(g, r) ?? c.offices[0];
  const n = randInt(g, 2, 4);
  const s = o.staff.rnd;
  s.skill = (s.skill * s.n + 78 * n) / (s.n + n);
  s.n += n;
  s.fresh += n;
  for (const k of r.industries) r.tech[k] = clamp((r.tech[k] ?? 30) - 1.5, 5, 100);
  feud(g, r, 'you', `You poached ${n} of their engineers.`);
  return { ok: true, msg: `${n} of their best joined you in ${CITY[o.city].name}. ${r.name} will not forget it.` };
}
export function sueRival(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('That would break your agreement.');
  if (!cool(g, r, 'sue', 8)) return fail('You already have a case against them.');
  const cost = 0.04 * scaleS(g);
  if (cost > c.books.cash) return fail('Lawyers want paying up front.');
  B.expense(c, 'other', cost, 'cash');
  r.grievances++;
  r.hostility = clamp(r.hostility + 2, 0, 10);
  scheduleEvent(g, 'lawsuit_verdict', 3, ctxFor(g, r));
  feud(g, r, 'you', 'You sued them.');
  return { ok: true, msg: `Suit filed against ${r.name}. Expect a verdict in about three quarters.` };
}
export function lobbyAgainst(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!hasFlag(g, 'lobby')) return fail('You need a government affairs office (Corporate → Growth → Invest) to lobby.');
  if (!cool(g, r, 'lobby', 4)) return fail('Regulators have heard enough from you this year.');
  const cost = 0.03 * scaleS(g);
  B.expense(c, 'ga', cost, 'cash');
  r.hostility = clamp(r.hostility + 1, 0, 10);
  r.relation = clamp(r.relation - 10, -100, 100);
  feud(g, r, 'you', 'You lobbied regulators against them.');
  if (PERSONALITY[r.personality].homeShield && CITY[r.hq].country === CITY[c.home].country) {
    c.reputation = clamp(c.reputation - 2, 0, 100);
    return { ok: false, msg: `Regulators will not act against ${r.name}: it is the government's own champion. Your reputation took a small knock.` };
  }
  if (chance(g, 0.5)) {
    r.cash -= r.rev * 0.2;
    r.eff *= 1.02;
    return { ok: true, msg: `New rules land squarely on ${r.name}: compliance costs and a fine.` };
  }
  c.reputation = clamp(c.reputation - 2, 0, 100);
  return { ok: false, msg: 'The regulator saw through it. Your reputation took a small knock.' };
}

export function bidPrice(g: GameState, r: Rival, hostile: boolean): number {
  return Math.max(r.valuation, r.rev * 2) * (hostile ? 1.5 : 1.25) + r.debt * 0.5;
}
export function bidOdds(g: GameState, r: Rival, hostile: boolean): number {
  const pers = PERSONALITY[r.personality];
  if (pers.neverSells) return 0.02; // a family firm, a co-op or a giant is not for sale at any price
  if (hostile) return r.isPublic ? 0.6 : 0.25 + (r.distress > 0 ? 0.4 : 0);
  return clamp(0.15 + r.relation / 150 + (r.distress > 0 ? 0.5 : 0) + (r.profit < 0 ? 0.15 : 0) - (pers.id === 'conservative' ? 0.15 : 0) - (pers.id === 'predator' ? 0.2 : 0), 0.02, 0.95);
}
/** Take a rival's offices into the player's company. */
/** Customers an acquirer keeps: about a fifth of them use the change of owner to look elsewhere. */
export const ACQUIRED_KEEP = 0.75;
/** What the plant in some rival offices is worth to a buyer: 60% of what it would cost to build. */
export const plantFairValue = (offices: RivalOffice[]) => offices.reduce((s, ro) => s + (isCapital(ro.ind) ? ro.cap * INDUSTRIES[ro.ind].capPerUnit * 1000 * 0.6 : 0), 0);
/**
 * Fold rival offices into the player's company and return the value of the property taken on. The plant is
 * booked at its fair value, or at `paid` if less (a bargain: the price is allocated to the plant and there is
 * no goodwill), so goodwill is never negative.
 */
export function absorbIntoPlayer(g: GameState, r: Rival, offices: RivalOffice[], paid = Infinity): number {
  const c = g.company;
  const all = plantFairValue(offices);
  const scale = all > paid ? Math.max(0, paid) / all : 1;
  let fair = 0;
  for (const ro of offices) {
    ro.share *= ACQUIRED_KEEP;
    const def = INDUSTRIES[ro.ind];
    if (!c.divisions.includes(ro.ind)) {
      c.divisions.push(ro.ind);
      c.tech[ro.ind] = r.tech[ro.ind] ?? def.startTech;
    }
    const staff = { ops: Math.max(1, Math.round((ro.cap / def.opsOut) * 0.9)), sales: Math.max(0, Math.round(ro.sales * (marketUnits(g, ro.city, ro.ind) / def.salesCover))), rnd: 0, admin: 1 };
    staff.admin = Math.max(1, Math.round((staff.ops + staff.sales) / 14));
    const ppe = isCapital(ro.ind) ? ro.cap * def.capPerUnit * 1000 * 0.6 * scale : 0;
    fair += ppe;
    let o = c.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (o) {
      for (const k of ['ops', 'sales', 'admin'] as const) o.staff[k].n += staff[k];
      o.share = clamp(o.share + ro.share, 0, 0.92);
      if (isCapital(ro.ind)) o.cap += ro.cap;
      o.ppe += ppe;
    } else {
      o = makeOffice(g, ro.city, ro.ind, staff, isCapital(ro.ind) ? ro.cap : 0);
      o.opened = ro.opened;
      o.share = ro.share;
      o.lastDemand = ro.share * marketUnits(g, ro.city, ro.ind);
      o.ppe = ppe;
      o.morale = 55;
      c.offices.push(o);
    }
    o.integration = 4;
    g.discovered[ro.city] = 2;
  }
  r.offices = r.offices.filter((x) => !offices.includes(x));
  return fair;
}
export function bidForRival(g: GameState, id: number, hostile: boolean): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!cool(g, r, 'bid', 4)) return fail('They rejected an approach recently. Wait a year.');
  const price = bidPrice(g, r, hostile);
  const cashPart = c.cap.isPublic ? price * 0.5 : price;
  if (cashPart > c.books.cash) return fail(`You need ${money(cashPart)} in cash${c.cap.isPublic ? ' (the other half is paid in shares)' : ''}. You have ${money(c.books.cash)}.`);
  B.expense(c, 'other', price * 0.01, 'cash'); // advisers
  if (!chance(g, bidOdds(g, r, hostile))) {
    r.hostility = clamp(r.hostility + (hostile ? 3 : 0.5), 0, 10);
    r.relation = clamp(r.relation - (hostile ? 30 : 5), -100, 100);
    if (hostile) r.grievances++;
    feud(g, r, 'you', hostile ? 'Your hostile bid for them failed.' : 'They turned down your offer to buy them.');
    return { ok: false, msg: hostile ? `${r.name}'s board fought you off. You have made an enemy.` : `${r.ceo} declined. "Not for sale."` };
  }
  const before = companyHeadcount(c);
  const offices = r.offices.slice();
  noteAcquisition(g, price + Math.max(0, r.debt) * 0.5);
  const fair = absorbIntoPlayer(g, r, offices, price + Math.max(0, r.debt) * 0.5);
  // property is added inside absorbIntoPlayer; book the purchase against it
  c.books.ppe += fair;
  c.books.goodwill += cashPart - fair + (price - cashPart);
  c.books.cash -= cashPart;
  c.cfTags.acq -= cashPart;
  if (price > cashPart) {
    const n = (price - cashPart) / Math.max(0.01, c.cap.price);
    c.cap.shares += n;
    c.cap.holders.push({ name: `${r.name} shareholders`, shares: n, round: 'Acquisition', price: c.cap.price });
    c.books.paidIn += price - cashPart;
  }
  if (r.debt > 0) {
    c.books.debt += r.debt * 0.5;
    c.books.goodwill += r.debt * 0.5;
    c.loans.push({ id: 'ln' + ++g.uid, kind: 'term', name: `${r.name} assumed debt`, principal: r.debt * 0.5, limit: 0, spread: 3.5, fixedRate: 0, floating: true, start: g.turn, maturity: g.turn + 16, amort: (r.debt * 0.5) / 16, breaches: 0, waivedUntil: g.turn + 4 });
  }
  for (const k of r.industries) c.tech[k] = Math.max(c.tech[k] ?? 0, (r.tech[k] ?? 0) - 3);
  const added = companyHeadcount(c) - before;
  c.culture = clamp(c.culture - (3 + (added / Math.max(1, before + added)) * 22), 0, 100);
  noteRivalExit(g, r, price);
  r.alive = false;
  r.fate = `Acquired by ${c.name}`;
  g.counters.acquisitions = (g.counters.acquisitions ?? 0) + 1;
  for (const o of alive(g)) o.hostility = clamp(o.hostility + 1, 0, 10);
  news(g, `${c.name} has acquired ${r.name} for ${money(price)}.`, 'good');
  return { ok: true, msg: `${r.name} is yours: ${offices.length} offices and ${added} people to integrate. Your culture will feel it.` };
}

// ───────────────────────── specials used by rival events ─────────────────────────

Object.assign(SPECIALS, {
  truce: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) startPact(g, r, 'truce', 8);
    return r ? `Truce with ${r.name} for two years` : null;
  },
  alliance: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) startPact(g, r, 'alliance', 12);
    return r ? `Alliance with ${r.name} for three years` : null;
  },
  endPact: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) r.pact = undefined;
    return r ? `Agreement with ${r.name} ended` : null;
  },
  endWar: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) for (const ro of r.offices) ro.war = 0;
    return r ? `${r.name} ends the price war` : null;
  },
  grievance: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) r.grievances++;
    return null;
  },
  priceDownRegion: (g: GameState, ctx: EventCtx, arg: number) => {
    const reg = ctx.region ?? CITY[g.company.home].region;
    for (const k of g.company.divisions) g.company.policy[reg].price[k] = clamp((g.company.policy[reg].price[k] ?? 1) * (1 - arg / 100), 0.5, 1.8);
    return `Prices cut ${arg}% in the region`;
  },
  rivalExit: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (!r || r.offices.length < 2) return null;
    const city = ctx.city && r.offices.some((ro) => ro.city === ctx.city) ? ctx.city : r.offices.find((ro) => g.company.offices.some((o) => o.city === ro.city))?.city;
    if (!city) return null;
    r.offices = r.offices.filter((ro) => ro.city !== city);
    return `${r.name} withdraws from ${CITY[city].name}`;
  },
  cartel: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) for (const ro of r.offices) ro.price = clamp(ro.price * 1.1, 0.55, 1.6);
    return r ? `${r.name} raises its prices too` : null;
  },
  buyRivalOffice: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const c = g.company;
    const ro = r?.offices.find((x) => x.city === ctx.city) ?? r?.offices[0];
    if (!r || !ro) return null;
    const price = Math.min(c.books.cash * 0.8, ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind) * 2.5);
    // the price on the card is what is paid; plant worth more than that is booked at the price
    const fair = absorbIntoPlayer(g, r, [ro], price);
    noteAcquisition(g, price);
    c.books.ppe += fair;
    c.books.goodwill += price - fair;
    c.books.cash -= price;
    c.cfTags.acq -= price;
    r.cash += price;
    return `Bought ${r.name}'s ${CITY[ro.city].name} operation for ${money(price)}`;
  },
  mergeRival: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const c = g.company;
    if (!r) return null;
    const pct = clamp((r.valuation / Math.max(1, r.valuation + c.valuation)) * 100, 5, 60);
    const fair = absorbIntoPlayer(g, r, r.offices.slice());
    const value = r.valuation;
    noteAcquisition(g, Math.max(value, fair) + Math.max(0, r.debt));
    c.books.ppe += fair;
    c.books.goodwill += Math.max(0, value - fair);
    c.books.paidIn += Math.max(value, fair);
    dilute(g, (pct / (100 - pct)) * 100, `${r.name} shareholders`);
    c.culture = clamp(c.culture - 10, 0, 100);
    noteRivalExit(g, r, value);
    r.alive = false;
    r.fate = `Merged with ${c.name}`;
    return `Merged with ${r.name}; their shareholders now own ${pct.toFixed(0)}%`;
  },
  sellCompany: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const price = ctx.amount ?? g.company.valuation;
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'sold', title: 'Sold', turn: g.turn, text: `You sold ${g.company.name} to ${r?.name ?? 'a competitor'} for ${money(price)}. Your share came to ${money(price * founderStake(g.company))}. A fine outcome for a founder — but the company is no longer yours to run.` };
    return 'The company is sold';
  },
  takeover: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'takeover', title: 'Taken over', turn: g.turn, text: `${r?.name ?? 'A rival'} won control of ${g.company.name}. The new owners thanked you for your service at the first board meeting.` };
    return 'You have lost control of the company';
  },
  oust: (g: GameState) => {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'ousted', title: 'Removed by the board', turn: g.turn, text: `The investors who own most of ${g.company.name} have replaced you as chief executive. You keep your shares and lose your office.` };
    return 'The board has removed you';
  },
  boardCuts: (g: GameState) => {
    for (const o of g.company.offices) {
      for (const k of ['ops', 'sales', 'rnd', 'admin'] as const) o.staff[k].n = Math.max(k === 'admin' || k === 'ops' ? 1 : 0, Math.round(o.staff[k].n * 0.9));
      o.morale = clamp(o.morale - 10, 0, 100);
      o.scar += 12;
    }
    g.company.culture = clamp(g.company.culture - 4, 0, 100);
    return 'One in ten jobs cut across the company';
  },
});
