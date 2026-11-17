// Mergers and acquisitions: small targets that come up for sale, due diligence, integration.
import * as B from './books';
import { CITIES, CITY, INDUSTRIES, NAMES, isCapital } from './content';
import { scheduleEvent } from './events';
import { localPrice, market, marketUnits } from './market';
import { addMod, news } from './mods';
import { makeOffice } from './newgame';
import { companyHeadcount, headcount } from './people';
import type { ActionResult, GameState, MnaTarget } from './types';
import { chance, clamp, money, nextUid, pick, randInt, randRange, weighted } from './util';

const SUFFIX: Record<string, string[]> = { saas: ['Labs', 'Software', 'Cloud'], retail: ['Kitchens', 'Stores', 'Table'], mfg: ['Works', 'Industries', 'Precision'], logistics: ['Freight', 'Lines', 'Express'], energy: ['Power', 'Renewables', 'Wind'], consulting: ['Partners', 'Advisory', 'Group'], biotech: ['Therapeutics', 'Bio', 'Sciences'] };

export function spawnTarget(g: GameState, cityId?: string): MnaTarget | undefined {
  const c = g.company;
  const pool = CITIES.filter((x) => (g.discovered[x.id] ?? 0) >= 1);
  const city = cityId ? CITY[cityId] : weighted(g, pool, (x) => (c.offices.some((o) => o.city === x.id) ? 3 : 1));
  if (!city) return undefined;
  const ind = pick(g, c.divisions);
  const def = INDUSTRIES[ind];
  const D = marketUnits(g, city.id, ind) * localPrice(g, city.id, ind);
  const mine = c.quarters[c.quarters.length - 1]?.pnl.revenue ?? 0;
  const revenue = clamp(D * randRange(g, 0.004, 0.03), 100_000 * g.macro.cpi, Math.max(400_000 * g.macro.cpi, 1.5 * mine));
  const cap = isCapital(ind) ? (revenue / localPrice(g, city.id, ind)) * 1.15 : 0;
  const t: MnaTarget = {
    id: 't' + nextUid(g), name: `${pick(g, NAMES.targets)} ${pick(g, SUFFIX[ind])}`, city: city.id, ind, revenue, margin: randRange(g, 0.02, 0.2), share: revenue / D,
    staff: Math.max(3, Math.ceil(revenue / localPrice(g, city.id, ind) / (def.opsOut * 0.8) / 0.7)), cap,
    price: revenue * 4 * def.revMult * randRange(g, 0.8, 1.35) * g.macro.sentiment + cap * def.capPerUnit * 1000 * 0.5,
    culture: randInt(g, 30, 80), hidden: chance(g, 0.3) ? randRange(g, 0.12, 0.45) : 0, synergy: Math.round(randRange(g, -6, 14)), diligenced: false, expires: g.turn + 4,
    blurb: pick(g, ['Founder retiring.', 'Backers want out.', 'Lost its biggest customer and needs a home.', 'Growing fast, short of capital.', 'A family business with no successor.']),
  };
  g.targets.push(t);
  return t;
}

export function stepTargets(g: GameState) {
  g.targets = g.targets.filter((t) => t.expires > g.turn);
  if (g.counters.spawnTarget) {
    spawnTarget(g);
    g.counters.spawnTarget = 0;
  }
  if (g.turn >= 6 && g.targets.length < 3 && chance(g, 0.16)) spawnTarget(g);
  // Goodwill is tested once a year: a business that is losing money cannot carry it.
  const c = g.company;
  if (g.turn % 4 === 3 && c.books.goodwill > 0 && B.ttm(c, (q) => q.ebitda) < 0) {
    const amt = c.books.goodwill * 0.25;
    B.impair(c, 'goodwill', amt);
    news(g, `Goodwill impaired by ${money(amt)}: the businesses you bought are not earning what you paid for.`, 'bad');
  }
}

export const targetDiligenceCost = (t: MnaTarget) => Math.max(15_000, 0.02 * t.price);
export function diligenceTarget(g: GameState, id: string): ActionResult {
  const t = g.targets.find((x) => x.id === id);
  if (!t) return { ok: false, msg: 'That deal is gone.' };
  if (t.diligenced) return { ok: false, msg: 'Already investigated.' };
  const cost = targetDiligenceCost(t);
  if (cost > g.company.books.cash) return { ok: false, msg: 'Not enough cash for due diligence.' };
  B.expense(g.company, 'ga', cost, 'cash');
  t.diligenced = true;
  if (t.hidden > 0) t.price *= 1 - t.hidden * 0.5; // sellers concede part of what you found
  return { ok: true, msg: t.hidden > 0 ? `The accountants found liabilities the seller did not mention. The price has been cut to ${money(t.price)}.` : 'Clean. The business is what the seller says it is.' };
}

export function acquireTarget(g: GameState, id: string): ActionResult {
  const c = g.company;
  const t = g.targets.find((x) => x.id === id);
  if (!t) return { ok: false, msg: 'That deal is gone.' };
  if (t.price > c.books.cash) return { ok: false, msg: `The price is ${money(t.price)}; you have ${money(c.books.cash)}. Arrange financing first.` };
  const def = INDUSTRIES[t.ind];
  const fair = t.cap * def.capPerUnit * 1000 * 0.6;
  const split = { ops: Math.max(1, Math.round(t.staff * 0.7)), sales: Math.round(t.staff * 0.15), rnd: Math.round(t.staff * 0.05), admin: Math.max(1, Math.round(t.staff * 0.1)) };
  let o = c.offices.find((x) => x.city === t.city && x.ind === t.ind);
  const before = companyHeadcount(c);
  if (o) {
    for (const r of ['ops', 'sales', 'rnd', 'admin'] as const) {
      const s = o.staff[r];
      s.skill = (s.skill * s.n + 55 * split[r]) / Math.max(1, s.n + split[r]);
      s.n += split[r];
    }
    o.share = clamp(o.share + t.share, 0, 0.9);
    o.cap += t.cap;
    o.morale = clamp(o.morale - 5, 0, 100);
  } else {
    o = makeOffice(g, t.city, t.ind, split, t.cap);
    o.opened = g.turn - 6;
    o.share = t.share;
    o.lastDemand = t.share * marketUnits(g, t.city, t.ind);
    o.morale = 58;
    c.offices.push(o);
  }
  B.acquire(c, t.price, fair, o);
  o.integration = 4;
  const ratio = t.staff / Math.max(1, before + t.staff);
  c.culture = clamp(c.culture - (1 + ratio * Math.abs(c.culture - t.culture) * 0.5), 0, 100);
  market(g, t.city, t.ind).f *= 0.97;
  if (t.synergy) addMod(g, { kind: 'demand', pct: t.synergy, quarters: 12, office: o.id, src: 'acquisition' });
  if (t.hidden > 0 && !t.diligenced) scheduleEvent(g, 'acq_skeleton', randInt(g, 2, 4), { office: o.id, city: o.city, region: CITY[o.city].region, ind: o.ind, amount: t.hidden * t.price });
  g.discovered[t.city] = 2;
  g.targets = g.targets.filter((x) => x !== t);
  g.counters.acquisitions = (g.counters.acquisitions ?? 0) + 1;
  news(g, `${c.name} acquired ${t.name} in ${CITY[t.city].name} for ${money(t.price)}.`, 'good');
  return { ok: true, msg: `${t.name} is yours. Integration takes four quarters; ${headcount(o)} people now work in ${CITY[t.city].name}.` };
}
