// Event engine: conditions, context binding, weighted outcomes with stat checks, effects, chains.
import * as B from './books';
import { CITIES, CITY, EVENT, EVENTS, INDUSTRIES, INV, REGIONS, hasInventory, isCapital } from './content';
import { addNol, dilute, founderStake, outsideShares, retireShares } from './finance';
import { localPrice, market, marketUnits } from './market';
import { addMod, hasFlag, news, setFlag } from './mods';
import { DIFF } from './difficulty';
import { feud } from './feud';
import { companyHeadcount, exec, headcount, personLeaves } from './people';
import type { Cond, EventCtx, EventDef, EventOption, Fx, GameState, Office, Outcome, PendingEvent, RegionId, Role, Scope } from './types';
import { ROLES } from './types';
import { chance, clamp, money, nextUid, rand, stochRound, weighted } from './util';

const lastQ = (g: GameState) => g.company.quarters[g.company.quarters.length - 1];
/** The yardstick for event money: roughly one quarter of revenue, with a floor for young companies. */
export const scaleS = (g: GameState) => Math.max(250_000 * g.macro.cpi, lastQ(g)?.pnl.revenue ?? 0);

export function evalCond(g: GameState, c: (Cond & { cashS?: number }) | undefined, ctx: EventCtx = {}): boolean {
  if (!c) return true;
  const co = g.company;
  const q = lastQ(g);
  const rev = q?.pnl.revenue ?? 0;
  const m = g.macro;
  const r = ctx.rival !== undefined ? g.rivals.find((x) => x.id === ctx.rival) : undefined;
  if (c.minTurn !== undefined && g.turn < c.minTurn) return false;
  if (c.maxTurn !== undefined && g.turn > c.maxTurn) return false;
  if (c.ind && !(ctx.ind ? c.ind.includes(ctx.ind) : co.divisions.some((d) => c.ind!.includes(d)))) return false;
  if (c.notInd && c.notInd.includes(co.primary)) return false;
  if (c.minRev !== undefined && rev < c.minRev * 1000) return false;
  if (c.maxRev !== undefined && rev > c.maxRev * 1000) return false;
  const hc = companyHeadcount(co);
  if (c.minHead !== undefined && hc < c.minHead) return false;
  if (c.maxHead !== undefined && hc > c.maxHead) return false;
  if (c.minOffices !== undefined && co.offices.length < c.minOffices) return false;
  if (c.minRegions !== undefined && new Set(co.offices.map((o) => CITY[o.city].region)).size < c.minRegions) return false;
  if (c.isPublic !== undefined && co.cap.isPublic !== c.isPublic) return false;
  if (c.hasDebt && co.books.debt <= 1000) return false;
  if (c.noDebt && co.books.debt > 1000) return false;
  if (c.minCashQ !== undefined || c.maxCashQ !== undefined) {
    const costs = q ? Math.max(1, q.pnl.revenue - q.ebitda) : 1;
    const cq = co.books.cash / costs;
    if (c.minCashQ !== undefined && cq < c.minCashQ) return false;
    if (c.maxCashQ !== undefined && cq > c.maxCashQ) return false;
  }
  if (c.cashS !== undefined && co.books.cash < c.cashS * scaleS(g)) return false;
  if (c.flag && !hasFlag(g, c.flag)) return false;
  if (c.notFlag && hasFlag(g, c.notFlag)) return false;
  if (c.macro) {
    const ok = { recession: m.phase === 'recession', boom: m.phase === 'boom', highRates: m.rate > 6, lowRates: m.rate < 2, highInfl: m.infl > 4.5, bear: m.sentiment < 0.8, bull: m.sentiment > 1.2 }[c.macro];
    if (!ok) return false;
  }
  if (c.notMacro && m.phase === c.notMacro) return false;
  if (c.minCulture !== undefined && co.culture < c.minCulture) return false;
  if (c.maxCulture !== undefined && co.culture > c.maxCulture) return false;
  if (c.minRep !== undefined && co.reputation < c.minRep) return false;
  if (c.maxRep !== undefined && co.reputation > c.maxRep) return false;
  if (c.minEsg !== undefined && co.esg < c.minEsg) return false;
  if (c.maxMorale !== undefined && !co.offices.some((o) => o.morale <= c.maxMorale!)) return false;
  if (c.exec && !exec(co, c.exec)) return false;
  if (c.noExec && exec(co, c.noExec)) return false;
  if (c.hasRival && !r) return false;
  if (c.hostile !== undefined && (!r || r.hostility < c.hostile)) return false;
  if (c.friendly !== undefined && (!r || r.relation < c.friendly)) return false;
  if (c.inventory && !co.divisions.some(hasInventory)) return false;
  if (c.capital && !co.divisions.some(isCapital)) return false;
  if (c.minShare !== undefined && !co.offices.some((o) => o.share >= c.minShare!)) return false;
  if (c.founderBelow !== undefined && founderStake(co) >= c.founderBelow) return false;
  if (c.profit && !(q && q.ni > 0)) return false;
  if (c.loss && !(q && q.ni < 0)) return false;
  if (c.minTech !== undefined && (co.tech[co.primary] ?? 0) < c.minTech) return false;
  if (c.minBrand !== undefined && co.brand < c.minBrand) return false;
  if (c.investors && co.cap.holders.length === 0) return false;
  if (c.invest && !co.investments.some((i) => i.def === c.invest && i.state === 'active')) return false;
  if (c.minAR !== undefined && !(rev > 0 && co.books.ar >= c.minAR * rev)) return false;
  if (c.keyLeftWithin !== undefined && !(g.counters.keyLeft !== undefined && g.turn - g.counters.keyLeft <= c.keyLeftWithin)) return false;
  return true;
}

const officeCtx = (o: Office): EventCtx => ({ office: o.id, city: o.city, region: CITY[o.city].region, ind: o.ind });

/** Pick the people, places and rivals an event is about. Null if it cannot apply right now. */
export function bindCtx(g: GameState, def: EventDef): EventCtx | null {
  const co = g.company;
  let ctx: EventCtx = {};
  for (const kind of def.bind ?? []) {
    if (kind === 'office') {
      // the office must be one the card can be about: in its industry, and the unhappy (or dominant) one if it says so
      const c = def.cond;
      const pool = co.offices.filter((o) => (!c?.ind || c.ind.includes(o.ind)) && (c?.maxMorale === undefined || o.morale <= c.maxMorale) && (c?.minShare === undefined || o.share >= c.minShare));
      // a card about a person and a place is about the place where that person works
      const o = pool.find((x) => x.id === ctx.office) ?? weighted(g, pool, (x) => 1 + headcount(x));
      if (!o) return null;
      ctx = { ...ctx, ...officeCtx(o) };
    } else if (kind === 'region') {
      if (ctx.region) continue;
      let regs = [...new Set(co.offices.filter((o) => !def.cond?.ind || def.cond.ind.includes(o.ind)).map((o) => CITY[o.city].region))];
      if (def.cat === 'macro') regs = regs.filter((r) => r !== 'nae' && r !== 'naw');
      if (!regs.length) return null;
      ctx.region = regs[Math.floor(rand(g) * regs.length)];
    } else if (kind === 'rival') {
      const alive = g.rivals.filter((r) => r.alive);
      const r = weighted(g, alive, (x) => 1 + 3 * x.offices.filter((ro) => co.offices.some((o) => o.city === ro.city && o.ind === ro.ind)).length);
      if (!r) return null;
      ctx.rival = r.id;
      const overlap = r.offices.find((ro) => co.offices.some((o) => o.city === ro.city && o.ind === ro.ind));
      if (overlap && !ctx.office) ctx = { ...ctx, ...officeCtx(co.offices.find((o) => o.city === overlap.city && o.ind === overlap.ind)!) };
    } else if (kind === 'person') {
      const p = weighted(g, co.people, (x) => (x.office ? 1 : 2.5) * (x.skill / 50));
      if (!p) return null;
      ctx.person = p.id;
      if (p.office) {
        const o = co.offices.find((x) => x.id === p.office);
        if (o) ctx = { ...ctx, ...officeCtx(o) };
      }
    } else if (kind === 'loan') {
      const l = co.loans.filter((x) => x.principal > 0).sort((a, b) => b.principal - a.principal)[0];
      if (!l) return null;
      ctx.loan = l.id;
    }
  }
  // An event about some industries only: name the one it is about, and, in a company that also has others,
  // keep its company-wide effects in that industry (a software outage should not cost the stores customers).
  const inds = def.cond?.ind;
  if (inds) {
    ctx.ind ??= inds.includes(co.primary) ? co.primary : co.divisions.find((d) => inds.includes(d));
    if (ctx.ind && co.divisions.some((d) => !inds.includes(d))) ctx.scoped = true;
  }
  return ctx;
}

export function fill(g: GameState, s: string, ctx: EventCtx): string {
  const co = g.company;
  const o = co.offices.find((x) => x.id === ctx.office) ?? co.offices[0];
  const r = g.rivals.find((x) => x.id === ctx.rival);
  const p = co.people.find((x) => x.id === ctx.person);
  const l = co.loans.find((x) => x.id === ctx.loan);
  const city = ctx.city ?? o?.city ?? co.home;
  const map: Record<string, string> = {
    company: co.name, city: CITY[city]?.name ?? '', office: o?.name ?? '', region: REGIONS[ctx.region ?? CITY[city].region].name,
    rival: r?.name ?? 'a competitor', rivalCeo: r?.ceo ?? 'their CEO', person: p?.name ?? 'a senior colleague', role: p ? (p.role === 'GM' ? 'general manager' : p.role) : 'manager',
    ind: INDUSTRIES[ctx.ind ?? co.primary].name.toLowerCase(), loan: l?.name ?? 'your loan', amount: ctx.amount !== undefined ? money(ctx.amount) : 'a sum',
  };
  return s.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
}

export function queueEvent(g: GameState, id: string, ctx: EventCtx = {}): boolean {
  if (!EVENT[id] || g.queue.some((e) => e.id === id)) return false;
  g.queue.push({ uid: nextUid(g), id, ctx, turn: g.turn });
  g.fired[id] = g.turn;
  return true;
}
export function scheduleEvent(g: GameState, id: string, delay: number, ctx: EventCtx = {}) {
  if (EVENT[id]) g.scheduled.push({ id, turn: g.turn + Math.max(1, delay), ctx });
}

/** Cards drawn from the deck per quarter on Normal, on average (Poisson). */
export const EVENT_RATE = 0.4;

const CAT_W = { macro: 0.8, market: 1, operational: 1, regulatory: 0.8, opportunity: 1, stress: 0.7, rival: 0 } as const;

/**
 * Cards about a rival that has gone, an office that has closed, a person who has left or a loan that has been
 * repaid no longer apply: drop them, waiting or scheduled. Run at the start of each quarter and after every action.
 */
export function pruneStale(g: GameState) {
  const co = g.company;
  const stale = (ctx: EventCtx) =>
    (ctx.rival !== undefined && !g.rivals.some((r) => r.id === ctx.rival && r.alive)) ||
    (ctx.office !== undefined && !co.offices.some((o) => o.id === ctx.office)) ||
    (ctx.person !== undefined && !co.people.some((p) => p.id === ctx.person)) ||
    (ctx.loan !== undefined && !co.loans.some((l) => l.id === ctx.loan));
  for (const s of g.scheduled) {
    if (s.id === 'lawsuit_verdict' && stale(s.ctx)) news(g, `Your lawsuit against ${g.rivals.find((r) => r.id === s.ctx.rival)?.name ?? 'a competitor'} lapsed: there is no longer anyone to collect from.`, 'info');
  }
  g.queue = g.queue.filter((pe) => !stale(pe.ctx));
  g.scheduled = g.scheduled.filter((s) => !stale(s.ctx));
}

/** Called at the start of each quarter: deliver scheduled events, then draw from the deck. */
export function drawEvents(g: GameState) {
  pruneStale(g);
  const due = g.scheduled.filter((s) => s.turn <= g.turn);
  g.scheduled = g.scheduled.filter((s) => s.turn > g.turn);
  for (const s of due) queueEvent(g, s.id, s.ctx);
  if (g.settings.sandbox.noEvents || g.turn < 2 || g.queue.length >= 2) return;
  // About half the quarters should pass without a card (decision 26). Cards already waiting — a rival's move,
  // a covenant breach, a resignation — count against this quarter's draw rather than coming on top of it.
  const lambda = EVENT_RATE * DIFF[g.difficulty].events;
  const u = rand(g);
  const p0 = Math.exp(-lambda);
  let n = u < p0 ? 0 : u < p0 * (1 + lambda) ? 1 : 2;
  n = Math.max(0, Math.min(n - g.queue.length, 2 - g.queue.length));
  const stress = 1 + 0.25 * ['easy', 'normal', 'hard', 'brutal'].indexOf(g.difficulty);
  const pool = EVENTS.filter((e) => (e.w ?? 1) > 0 && !(e.once && g.fired[e.id] !== undefined) && g.turn - (g.fired[e.id] ?? -999) >= (e.cool ?? 12) && evalCond(g, e.cond));
  for (let i = 0; i < n; i++) {
    const cats = new Set(g.queue.map((q) => EVENT[q.id].cat));
    const e = weighted(g, pool, (x) => (g.queue.some((q) => q.id === x.id) ? 0 : (x.w ?? 1) * CAT_W[x.cat] * (x.cat === 'stress' ? stress : 1) * (cats.has(x.cat) ? 0.3 : 1)));
    if (!e) break;
    const ctx = bindCtx(g, e);
    if (ctx && evalCond(g, e.cond, ctx)) queueEvent(g, e.id, ctx);
  }
}

// ───────────────────────── effects ─────────────────────────

function targets(g: GameState, scope: Scope | undefined, ctx: EventCtx, dflt: Scope = 'all'): Office[] {
  const co = g.company;
  const s = scope ?? dflt;
  if (s === 'office') {
    const o = co.offices.find((x) => x.id === ctx.office) ?? co.offices.slice().sort((a, b) => headcount(b) - headcount(a))[0];
    return o ? [o] : [];
  }
  if (s === 'region') return co.offices.filter((o) => CITY[o.city].region === (ctx.region ?? CITY[co.home].region) && (!ctx.scoped || o.ind === ctx.ind));
  if (s === 'ind' || ctx.scoped) return co.offices.filter((o) => o.ind === (ctx.ind ?? co.primary));
  return co.offices;
}
const modScope = (scope: Scope | undefined, ctx: EventCtx, co: GameState['company']) =>
  scope === 'office' ? { office: ctx.office ?? co.offices[0]?.id } : scope === 'region' ? { region: ctx.region ?? CITY[co.home].region, ...(ctx.scoped ? { ind: ctx.ind } : {}) } : scope === 'ind' || ctx.scoped ? { ind: ctx.ind ?? co.primary } : {};
const where = (g: GameState, scope: Scope | undefined, ctx: EventCtx) =>
  scope === 'office' ? ` in ${CITY[ctx.city ?? g.company.home].name}` : scope === 'region' ? ` in ${REGIONS[ctx.region ?? CITY[g.company.home].region].short}` : '';
const sg = (n: number, unit = '') => `${n >= 0 ? '+' : '−'}${Math.abs(n)}${unit}`;

type Special = (g: GameState, ctx: EventCtx, arg: number) => string | null;
export const SPECIALS: Record<string, Special> = {
  recession: (g) => {
    g.macro.recessionLeft = Math.max(g.macro.recessionLeft, 3);
    return 'A recession begins';
  },
  freezeHiring: (g) => {
    for (const o of g.company.offices) for (const r of ROLES) o.staff[r].reqs = 0;
    return 'All open positions closed';
  },
  priceUp: (g, ctx, arg) => {
    const co = g.company;
    for (const reg of Object.keys(co.policy) as RegionId[]) {
      if (ctx.region && arg < 0 && reg !== ctx.region) continue;
      for (const k of ctx.scoped && ctx.ind ? [ctx.ind] : co.divisions) co.policy[reg].price[k] = clamp((co.policy[reg].price[k] ?? 1) * (1 + Math.abs(arg) / 100), 0.5, 1.8);
    }
    return `Prices raised ${Math.abs(arg)}%${ctx.region && arg < 0 ? ` in ${REGIONS[ctx.region].short}` : ''}`;
  },
  priceDown: (g, ctx, arg) => {
    const co = g.company;
    for (const reg of Object.keys(co.policy) as RegionId[]) for (const k of ctx.scoped && ctx.ind ? [ctx.ind] : co.divisions) co.policy[reg].price[k] = clamp((co.policy[reg].price[k] ?? 1) * (1 - arg / 100), 0.5, 1.8);
    return `Prices cut ${arg}%`;
  },
  fixDebt: (g) => {
    let n = 0;
    for (const l of g.company.loans) if (l.floating && l.kind !== 'revolver') {
      l.floating = false;
      l.fixedRate = Math.round((g.macro.rate + l.spread + 0.4) * 20) / 20;
      n++;
    }
    return n ? `${n} floating loan${n > 1 ? 's' : ''} fixed at today's rate` : 'No floating loans to fix';
  },
  paydown: (g, _ctx, arg) => {
    const co = g.company;
    let budget = Math.min(co.books.cash * 0.8, co.books.debt * arg);
    if (budget <= 0) return null;
    const total = budget;
    for (const l of co.loans.slice().sort((a, b) => b.spread + b.fixedRate - (a.spread + a.fixedRate))) {
      const pay = Math.min(l.principal, budget);
      if (pay <= 0) continue;
      B.repay(co, pay);
      l.principal -= pay;
      if (l.amort > 0) l.amort = l.principal / Math.max(1, l.maturity - g.turn);
      budget -= pay;
    }
    co.loans = co.loans.filter((l) => l.principal > 1 || l.kind === 'revolver');
    return `${money(total - budget)} of debt repaid`;
  },
  discountRepay: (g, ctx) => {
    const co = g.company;
    const l = co.loans.find((x) => x.id === ctx.loan);
    if (!l) return null;
    const amt = Math.min(l.principal * 0.3, co.books.cash * 0.8);
    if (amt <= 0) return 'Not enough cash to take the offer';
    B.repay(co, amt);
    B.windfall(co, amt * 0.05);
    l.principal -= amt;
    if (l.amort > 0) l.amort = l.principal / Math.max(1, l.maturity - g.turn);
    return `${money(amt)} repaid for ${money(amt * 0.95)}`;
  },
  drawAll: (g) => {
    const co = g.company;
    const rv = co.loans.find((l) => l.kind === 'revolver');
    if (!rv || rv.limit - rv.principal <= 0) return 'No undrawn credit line to draw';
    const d = rv.limit - rv.principal;
    rv.principal = rv.limit;
    B.borrow(co, d);
    return `${money(d)} drawn on the credit line`;
  },
  cutRevolver: (g) => {
    const co = g.company;
    const rv = co.loans.find((l) => l.kind === 'revolver');
    if (!rv) return null;
    rv.limit = Math.max(rv.principal, rv.limit * 0.5);
    return `Credit line cut to ${money(rv.limit)}`;
  },
  hireAhead: (g) => {
    for (const o of g.company.offices) o.staff.ops.reqs += Math.max(1, Math.round(o.staff.ops.n * 0.15));
    return 'Requisitions opened for 15% more operations staff';
  },
  payUp: (g, ctx, arg) => {
    for (const o of targets(g, 'all', ctx)) {
      o.pay = clamp(o.pay + arg / 100, 0.7, 1.6);
      o.morale = clamp(o.morale + arg * 0.6, 0, 100);
    }
    return `Pay raised ${arg} points against market everywhere`;
  },
  payUpOffice: (g, ctx, arg) => {
    const o = targets(g, 'office', ctx)[0];
    if (!o) return null;
    o.pay = clamp(o.pay + arg / 100, 0.7, 1.6);
    o.morale = clamp(o.morale + arg * 0.8, 0, 100);
    return `Pay raised ${arg} points in ${CITY[o.city].name}`;
  },
  addSales: (g, ctx, arg) => addStaff(g, ctx, 'sales', arg),
  addRnd: (g, ctx, arg) => addStaff(g, ctx, 'rnd', arg),
  addOps: (g, ctx, arg) => addStaff(g, ctx, 'ops', arg),
  fringeUp: (g, ctx, arg) => {
    const o = targets(g, 'office', ctx)[0];
    if (o) market(g, o.city, o.ind).f *= 1 + (arg || 12) / 100;
    return 'Local competition got stronger';
  },
  fringeDown: (g, ctx, arg) => {
    const o = targets(g, 'office', ctx)[0];
    if (o) market(g, o.city, o.ind).f *= 1 - (arg || 10) / 100;
    return 'Local competition got weaker';
  },
  retainPerson: (g, ctx) => {
    const p = g.company.people.find((x) => x.id === ctx.person);
    if (p) p.retained = g.turn + 7; // inclusive: this quarter and the next seven
    return p ? `${p.name} is locked in for two years` : null;
  },
  factorAR: (g) => {
    const co = g.company;
    const amt = co.books.ar * 0.8;
    if (amt <= 0) return 'No receivables to sell';
    B.collect(co, amt * 0.85);
    B.writeOffAR(co, amt * 0.15);
    return `${money(amt)} of receivables sold for ${money(amt * 0.85)}`;
  },
  waiverFee: (g, ctx) => {
    const l = g.company.loans.find((x) => x.id === ctx.loan);
    if (!l) return null;
    B.expense(g.company, 'other', l.principal * 0.015, 'cash');
    return `Waiver fee of ${money(l.principal * 0.015)} paid`;
  },
  paydownLoan: (g, ctx) => {
    const co = g.company;
    const l = co.loans.find((x) => x.id === ctx.loan);
    if (!l) return null;
    const amt = Math.min(l.principal * 0.4, Math.max(0, co.books.cash * 0.7));
    B.repay(co, amt);
    l.principal -= amt;
    if (l.amort > 0) l.amort = l.principal / Math.max(1, l.maturity - g.turn);
    return `${money(amt)} of the loan repaid`;
  },
  buyback10: (g) => {
    const co = g.company;
    const amt = co.books.cash * 0.1;
    if (!co.cap.isPublic || amt <= 0 || !(co.cap.price > 0)) return null; // no free shares at a $0 price (as finance.buyBack)
    const n = retireShares(co.cap, Math.min(amt / co.cap.price, outsideShares(co.cap) * 0.3));
    if (n <= 0) return null;
    B.buyback(co, n * co.cap.price);
    return `${money(n * co.cap.price)} of shares bought back cheaply`;
  },
};
SPECIALS.startDividend = (g) => {
  const c = g.company;
  const amt = Math.max(10_000, Math.round((c.valuation * 0.02) / 4 / 10_000) * 10_000);
  c.cap.dividend = Math.max(c.cap.dividend, amt);
  return `A dividend of ${money(amt)} a quarter`;
};
SPECIALS.payAmount = (g, ctx, arg) => {
  const amt = (ctx.amount ?? 0.1 * scaleS(g)) * (arg || 1);
  B.expense(g.company, 'other', amt, 'cash');
  return `${money(amt)} paid`;
};
SPECIALS.impairGoodwill = (g, ctx, arg) => {
  const amt = Math.min(g.company.books.goodwill, (ctx.amount ?? 0) * (arg || 1));
  if (amt <= 0) return null;
  B.impair(g.company, 'goodwill', amt);
  return `${money(amt)} of goodwill written off`;
};
function addStaff(g: GameState, ctx: EventCtx, role: Role, n: number): string | null {
  const o = targets(g, 'office', ctx)[0];
  if (!o) return null;
  const s = o.staff[role];
  s.skill = (s.skill * s.n + 72 * n) / (s.n + n);
  s.n += n;
  s.fresh += n;
  return `${n} experienced ${INDUSTRIES[o.ind].roles[role].toLowerCase()} joined in ${CITY[o.city].name}`;
}

/** Apply effect tuples. Returns a plain-language line for each visible effect. */
export function applyFx(g: GameState, fx: Fx[], ctx: EventCtx): string[] {
  const co = g.company;
  const S = scaleS(g);
  const out: string[] = [];
  const say = (s: string | null) => s && out.push(s);
  const rival = g.rivals.find((r) => r.id === ctx.rival);
  // an event about one industry keeps its cost effects there (cloud credits should not cut a factory's material bill)
  const scopedInd = ctx.scoped && ctx.ind ? { ind: ctx.ind } : {};
  for (const f of fx) {
    switch (f[0]) {
      case 'cash': B.windfall(co, f[1] * S); say(`${money(f[1] * S)} received`); break;
      case 'cost': B.expense(co, f[2] ?? 'other', f[1] * S, 'cash'); say(`${money(f[1] * S)} spent`); break;
      case 'flat': B.expense(co, f[2] ?? 'other', f[1] * 1000 * g.macro.cpi, 'cash'); say(`${money(f[1] * 1000 * g.macro.cpi)} spent`); break;
      case 'capex': B.capex(co, f[1] * S); say(`${money(f[1] * S)} invested in equipment`); break;
      case 'tax': B.tax(co, f[1] * S); say(`${money(f[1] * S)} tax bill`); break;
      case 'nol': addNol(co, CITY[co.home].country, f[1] * S); say(`${money(f[1] * S)} of tax losses to carry forward`); break;
      case 'morale': for (const o of targets(g, f[2], ctx)) o.morale = clamp(o.morale + f[1], 0, 100); say(`Morale ${sg(f[1])}${where(g, f[2], ctx)}`); break;
      case 'skill': for (const o of targets(g, f[2], ctx)) for (const r of ROLES) o.staff[r].skill = clamp(o.staff[r].skill + f[1], 15, 95); say(`Skill ${sg(f[1])}${where(g, f[2], ctx)}`); break;
      case 'culture': co.culture = clamp(co.culture + f[1], 0, 100); say(`Culture ${sg(f[1])}`); break;
      case 'brand': co.brand = clamp(co.brand + f[1], 0, 100); say(`Brand ${sg(f[1])}`); break;
      case 'rbrand': { const r = ctx.region ?? CITY[co.home].region; co.regionBrand[r] = clamp(co.regionBrand[r] + f[1], 0, 100); say(`Brand ${sg(f[1])} in ${REGIONS[r].short}`); break; }
      case 'rep': co.reputation = clamp(co.reputation + f[1], 0, 100); say(`Reputation ${sg(f[1])}`); break;
      case 'esg': co.esg = clamp(co.esg + f[1], 0, 100); say(`ESG ${sg(f[1])}`); break;
      case 'tech': { const k = ctx.ind && co.divisions.includes(ctx.ind) ? ctx.ind : co.primary; co.tech[k] = clamp((co.tech[k] ?? 0) + f[1], 5, 100); say(`Technology ${sg(f[1])}`); break; }
      case 'loyalty': { const p = co.people.find((x) => x.id === ctx.person); for (const x of p ? [p] : co.people) x.loyalty = clamp(x.loyalty + f[1], 0, 100); say(`Loyalty ${sg(f[1])}${p ? ` for ${p.name}` : ' among key people'}`); break; }
      case 'demand': addMod(g, { kind: 'demand', pct: f[1], quarters: f[2], src: 'event', ...modScope(f[3], ctx, co) }); say(`Customer pull ${sg(f[1], '%')}${where(g, f[3], ctx)} for ${f[2]} quarters`); break;
      case 'market': addMod(g, { kind: 'market', pct: f[1], quarters: f[2], src: 'event', ...(f[3] === 'region' ? { region: ctx.region ?? CITY[co.home].region, ...(ctx.scoped ? { ind: ctx.ind } : {}) } : f[3] === 'ind' || ctx.scoped ? { ind: ctx.ind ?? co.primary } : {}) }); say(`Whole market ${sg(f[1], '%')} for ${f[2]} quarters`); break;
      case 'wages': addMod(g, { kind: 'wages', pct: f[1], quarters: f[2], src: 'event', ...scopedInd }); say(`Wage costs ${sg(f[1], '%')} for ${f[2]} quarters`); break;
      case 'inputs': addMod(g, { kind: 'inputs', pct: hasFlag(g, 'hedged') && f[1] > 0 ? f[1] / 2 : f[1], quarters: f[2], src: 'event', ...scopedInd }); say(`Input costs ${sg(hasFlag(g, 'hedged') && f[1] > 0 ? f[1] / 2 : f[1], '%')} for ${f[2]} quarters${hasFlag(g, 'hedged') && f[1] > 0 ? ' (hedges absorbed half)' : ''}`); break;
      case 'capacity': addMod(g, { kind: 'capacity', pct: f[1], quarters: f[2], src: 'event', ...modScope(f[3], ctx, co) }); say(`Capacity ${sg(f[1], '%')}${where(g, f[3], ctx)} for ${f[2]} quarters`); break;
      case 'prod': addMod(g, { kind: 'prod', pct: f[1], quarters: f[2], src: 'event', ...modScope(f[3], ctx, co) }); say(`Productivity ${sg(f[1], '%')}${where(g, f[3], ctx)} for ${f[2]} quarters`); break;
      case 'attrition': addMod(g, { kind: 'attrition', pct: f[1], quarters: f[2], src: 'event', ...scopedInd }); say(`Attrition ${sg(f[1], '%')} for ${f[2]} quarters`); break;
      case 'valuation': addMod(g, { kind: 'valuation', pct: f[1], quarters: f[2], src: 'event' }); say(`Valuation ${sg(f[1], '%')} for ${f[2]} quarters`); break;
      case 'staff': {
        let d = 0;
        for (const o of targets(g, f[3], ctx)) for (const r of f[2] ? [f[2]] : ROLES) {
          const s = o.staff[r];
          const n = f[1] < 0 ? -Math.min(s.n, stochRound(g, (s.n * -f[1]) / 100)) : stochRound(g, (s.n * f[1]) / 100);
          s.n += n;
          d += n;
        }
        say(d ? `${Math.abs(d)} ${d < 0 ? 'people left' : 'people joined'}${where(g, f[3], ctx)}` : null);
        break;
      }
      case 'share': for (const o of targets(g, f[2], ctx)) o.share = clamp(o.share * (1 + f[1] / 100), 0, 0.95); say(`Market share ${sg(f[1], '%')}${where(g, f[2], ctx)}`); break;
      case 'hostility': if (rival) { rival.hostility = clamp(rival.hostility + f[1], 0, 10); say(`${rival.name} is ${f[1] > 0 ? 'angrier' : 'calmer'}`); } break;
      case 'relation': if (rival) { rival.relation = clamp(rival.relation + f[1], -100, 100); say(`Relations with ${rival.name} ${sg(f[1])}`); } break;
      case 'rivalCash': if (rival) rival.cash += f[1] * rival.rev * 4; break;
      case 'rivalTech': for (const r of rival ? [rival] : g.rivals) for (const k of r.industries) r.tech[k] = clamp((r.tech[k] ?? 30) + f[1], 5, 100); say(`${rival ? rival.name : 'Rivals'} ${f[1] > 0 ? 'gained' : 'lost'} ground on technology`); break;
      case 'rivalBrand': if (rival) rival.brand = clamp(rival.brand + f[1], 0, 100); break;
      case 'rivalShare': // with no rival named, whichever rivals compete with you there ("they sign with a rival")
        for (const r of rival ? [rival] : g.rivals.filter((x) => x.alive)) for (const ro of r.offices) if ((!ctx.city || ro.city === ctx.city) && (rival || !ctx.ind || ro.ind === ctx.ind)) ro.share = clamp(ro.share * (1 + f[1] / 100), 0, 0.9);
        break;
      case 'gap': g.macro.shock.gap += f[1]; say(f[1] < 0 ? 'The economy weakens' : 'The economy strengthens'); break;
      case 'rate': g.macro.shock.rate += f[1]; say(`Central-bank rate ${sg(f[1], ' pts')}`); break;
      case 'infl': g.macro.shock.infl += f[1]; say(`Inflation ${sg(f[1], ' pts')}`); break;
      case 'commodity': g.macro.commodity *= 1 + (hasFlag(g, 'hedged') ? f[1] / 2 : f[1]) / 100; say(`Commodity prices ${sg(f[1], '%')}${hasFlag(g, 'hedged') ? ' (you are half hedged)' : ''}`); break;
      case 'energyIdx': g.macro.energy *= 1 + (hasFlag(g, 'hedged') ? f[1] / 2 : f[1]) / 100; say(`Energy prices ${sg(f[1], '%')}${hasFlag(g, 'hedged') ? ' (you are half hedged)' : ''}`); break;
      case 'sentiment': g.macro.sentiment = clamp(g.macro.sentiment * (1 + f[1] / 100), 0.4, 1.8); say(`Investor mood ${sg(f[1], '%')}`); break;
      case 'spread': g.macro.spread = clamp(g.macro.spread + f[1], 0.5, 8); say(`Credit spreads ${sg(f[1], ' pts')}`); break;
      case 'fx': { const r = ctx.region ?? CITY[co.home].region; if (r !== 'nae' && r !== 'naw') { g.macro.fx[r] = clamp(g.macro.fx[r] * (1 + (hasFlag(g, 'hedged') ? f[1] / 2 : f[1]) / 100), 0.4, 1.6); say(`${REGIONS[r].short} currency ${sg(f[1], '%')}`); } break; }
      case 'regionGap': { const r = ctx.region ?? CITY[co.home].region; g.macro.regionGap[r] = clamp(g.macro.regionGap[r] + f[1], -6, 4); say(`${REGIONS[r].short} economy ${f[1] < 0 ? 'weakens' : 'strengthens'}`); break; }
      case 'flag': setFlag(g, f[1], f[2]); break;
      case 'unflag': delete g.flags[f[1]]; break;
      case 'personLeave': { const p = co.people.find((x) => x.id === ctx.person); if (p) say(`${p.name} left. ${personLeaves(g, p, 'left the company')}`); break; }
      case 'debtCall': {
        const l = co.loans.find((x) => x.id === ctx.loan);
        if (l) { const amt = l.principal * f[1]; B.repay(co, amt); l.principal -= amt; if (l.amort > 0) l.amort = l.principal / Math.max(1, l.maturity - g.turn); say(`The lender demanded ${money(amt)} back immediately`); }
        break;
      }
      case 'rateUp': { const l = co.loans.find((x) => x.id === ctx.loan); if (l) { l.spread += f[1]; l.fixedRate += f[1]; say(`Loan rate ${sg(f[1], ' pts')}`); } break; }
      case 'waive': { const l = co.loans.find((x) => x.id === ctx.loan); for (const x of l ? [l] : co.loans) x.waivedUntil = g.turn + 3; say('Covenants waived for three quarters'); break; }
      case 'equity': {
        const pct = f[1] / 100;
        const pre = Math.max(200_000, co.valuation * f[2]);
        const n = (co.cap.shares * pct) / (1 - pct);
        const gross = n * (pre / co.cap.shares);
        B.issueEquity(co, gross * 0.95);
        co.cap.shares += n;
        co.cap.holders.push({ name: 'Emergency investors', shares: n, round: 'Bridge', price: pre / (co.cap.shares - n) });
        co.cap.lastRoundTurn = g.turn;
        co.cap.boardPressure = Math.min(10, co.cap.boardPressure + 1);
        g.counters.equityRaised = (g.counters.equityRaised ?? 0) + gross;
        say(`${money(gross * 0.95)} raised for ${f[1]}% of the company`);
        break;
      }
      case 'loan': {
        const amt = f[1] * S;
        co.loans.push({ id: 'ln' + nextUid(g), kind: 'distressed', name: 'Bridge loan', principal: amt, limit: 0, spread: 0, fixedRate: f[2], floating: false, start: g.turn, maturity: g.turn + f[3], amort: amt / f[3], breaches: 0, waivedUntil: g.turn + 2 });
        B.borrow(co, amt);
        say(`${money(amt)} borrowed at ${f[2]}%`);
        break;
      }
      case 'dilute': dilute(g, f[1], 'Staff and partners'); say(`${f[1]}% new shares issued`); break;
      case 'writeoff': { const a = B.writeOffAR(co, co.books.ar * f[1]); say(`${money(a)} of receivables written off`); break; }
      case 'invLoss': for (const o of targets(g, 'office', ctx)) { const v = o.invValue * f[1]; o.inventory *= 1 - f[1]; B.useInventory(co, o, v); say(`${money(v)} of inventory lost`); } break;
      case 'ppeLoss': for (const o of targets(g, 'office', ctx)) { const v = (o.ppe - o.accDep) * f[1]; B.impair(co, 'ppe', v, o); o.cap *= 1 - f[1] * 0.8; say(`${money(v)} of plant written off`); } break;
      case 'mnaTarget': g.counters.spawnTarget = 1; say('A new acquisition target is on the Deals page'); break;
      case 'discover': { const c = CITIES.find((x) => (g.discovered[x.id] ?? 0) === 0); if (c) { g.discovered[c.id] = 1; say(`${c.name} is now open to you`); } break; }
      case 'special': say(SPECIALS[f[1]]?.(g, ctx, f[2] ?? 0) ?? null); break;
    }
  }
  return out;
}

/** Rough dollar value of an outcome, used only to measure luck (realised minus expected). */
function outcomeValue(g: GameState, o: Outcome): number {
  const S = scaleS(g);
  let v = 0;
  for (const f of o.fx ?? []) {
    switch (f[0]) {
      case 'cash': v += f[1] * S; break;
      case 'cost': case 'tax': v -= f[1] * S; break;
      case 'flat': v -= f[1] * 1000; break;
      case 'morale': v += f[1] * 0.004 * S; break;
      case 'culture': v += f[1] * 0.01 * S; break;
      case 'brand': v += f[1] * 0.012 * S; break;
      case 'rep': v += f[1] * 0.008 * S; break;
      case 'tech': v += f[1] * 0.03 * S; break;
      case 'demand': v += (f[1] / 100) * f[2] * S * 0.5; break;
      case 'market': v += (f[1] / 100) * f[2] * S * 0.4; break;
      case 'wages': v -= (f[1] / 100) * f[2] * S * 0.3; break;
      case 'inputs': v -= (f[1] / 100) * f[2] * S * 0.25; break;
      case 'capacity': case 'prod': v += (f[1] / 100) * f[2] * S * 0.3; break;
      case 'staff': v += (f[1] / 100) * S * 0.6; break;
      case 'share': v += (f[1] / 100) * S * 1.5; break;
      case 'writeoff': v -= f[1] * g.company.books.ar; break;
      case 'debtCall': v -= f[1] * S * 0.5; break;
      case 'personLeave': v -= 0.1 * S; break;
      case 'valuation': v += (f[1] / 100) * S * 0.5; break;
    }
  }
  return v;
}

function boosted(g: GameState, ctx: EventCtx, o: Outcome): number {
  let w = o.w ?? 1;
  if (!o.boost) return w;
  const [stat, th, mult] = o.boost;
  const co = g.company;
  const pass =
    stat === 'flag' ? hasFlag(g, String(th)) :
    stat === 'exec' ? !!exec(co, th as never) :
    stat === 'culture' ? co.culture >= Number(th) :
    stat === 'rep' ? co.reputation >= Number(th) :
    stat === 'brand' ? co.brand >= Number(th) :
    stat === 'esg' ? co.esg >= Number(th) :
    stat === 'tech' ? (co.tech[co.primary] ?? 0) >= Number(th) :
    stat === 'intel' ? co.intel >= Number(th) :
    stat === 'morale' ? (co.offices.find((x) => x.id === ctx.office)?.morale ?? 50) >= Number(th) :
    stat === 'relation' ? (g.rivals.find((r) => r.id === ctx.rival)?.relation ?? 0) >= Number(th) : false;
  if (pass) w *= mult;
  return w;
}

const FATAL = new Set(['sellCompany', 'takeover', 'oust', 'takePrivate']);
/** Expected value of an option by the engine's own yardstick (used by bots and the balance harness, never shown). */
export function optionEV(g: GameState, pe: PendingEvent, i: number): number {
  const opt = EVENT[pe.id].opts[i];
  const ws = opt.out.map((o) => boosted(g, pe.ctx, o));
  const tot = ws.reduce((a, b) => a + b, 0) || 1;
  let ev = 0;
  opt.out.forEach((o, k) => {
    const fatal = (o.fx ?? []).some((f) => f[0] === 'special' && FATAL.has(f[1]));
    ev += ((fatal ? -1e15 : outcomeValue(g, o)) * ws[k]) / tot;
  });
  return ev;
}

// ── what an option does to your cash: shown on the card (decision 27 keeps the odds hidden, not the bill)

/** Money specials, valued the way they will actually be applied. Spend is P&L cash; finance is debt and equity flows. */
const SPECIAL_MONEY: Record<string, (g: GameState, ctx: EventCtx, arg: number) => { spend?: number; finance?: number }> = {
  payAmount: (g, ctx, arg) => ({ spend: -(ctx.amount ?? 0.1 * scaleS(g)) * (arg || 1) }),
  waiverFee: (g, ctx) => ({ spend: -0.015 * (g.company.loans.find((l) => l.id === ctx.loan)?.principal ?? 0) }),
  buyRivalOffice: (g, ctx) => {
    const r = g.rivals.find((x) => x.id === ctx.rival);
    const ro = r?.offices.find((x) => x.city === ctx.city) ?? r?.offices[0];
    return ro ? { spend: -Math.min(Math.max(0, g.company.books.cash) * 0.8, ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind) * 2.5) } : {};
  },
  paydown: (g, _ctx, arg) => ({ finance: -Math.min(Math.max(0, g.company.books.cash) * 0.8, g.company.books.debt * arg) }),
  paydownLoan: (g, ctx) => ({ finance: -Math.min(0.4 * (g.company.loans.find((l) => l.id === ctx.loan)?.principal ?? 0), Math.max(0, g.company.books.cash) * 0.7) }),
  discountRepay: (g, ctx) => ({ finance: -Math.min(0.3 * (g.company.loans.find((l) => l.id === ctx.loan)?.principal ?? 0), Math.max(0, g.company.books.cash) * 0.8) * 0.95 }),
  drawAll: (g) => {
    const rv = g.company.loans.find((l) => l.kind === 'revolver');
    return { finance: rv ? rv.limit - rv.principal : 0 };
  },
  factorAR: (g) => ({ finance: 0.68 * g.company.books.ar }),
  buyback10: (g) => ({ finance: g.company.cap.isPublic && g.company.cap.price > 0 ? -0.1 * Math.max(0, g.company.books.cash) : 0 }),
};

/** Cash an outcome moves: spend (costs and windfalls) and finance (borrowing, repaying, selling shares). */
export function outcomeCash(g: GameState, ctx: EventCtx, o: Outcome): { spend: number; finance: number } {
  const S = scaleS(g);
  const co = g.company;
  let spend = 0, finance = 0;
  for (const f of o.fx ?? []) {
    switch (f[0]) {
      case 'cash': spend += f[1] * S; break;
      case 'cost': case 'capex': case 'tax': spend -= f[1] * S; break;
      case 'flat': spend -= f[1] * 1000 * g.macro.cpi; break;
      case 'loan': finance += f[1] * S; break;
      case 'debtCall': finance -= f[1] * (co.loans.find((l) => l.id === ctx.loan)?.principal ?? 0); break;
      case 'equity': { const pct = f[1] / 100; finance += (pct / (1 - pct)) * Math.max(200_000, co.valuation * f[2]) * 0.95; break; }
      case 'special': { const m = SPECIAL_MONEY[f[1]]?.(g, ctx, f[2] ?? 0); spend += m?.spend ?? 0; finance += m?.finance ?? 0; break; }
    }
  }
  return { spend, finance };
}
/** Special effects that move cash; the content tests check every money-moving special is listed here. */
export const MONEY_SPECIALS = new Set(Object.keys(SPECIAL_MONEY));

const approx = (x: number) => {
  const a = Math.abs(x);
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, a))) - 1);
  const r = Math.round(a / p) * p;
  return '~' + money(r, r >= 1e6 && r < 1e7 ? 1 : 0);
};

/** Plain words for the certain money in an option, e.g. "Costs ~$27K". Empty if nothing changes hands. */
export function moneyText(g: GameState, ctx: EventCtx, opt: EventOption): string {
  const vals = opt.out.map((o) => outcomeCash(g, ctx, o));
  const part = (xs: number[], neg: string, pos: string, both: string): string => {
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const big = Math.max(Math.abs(lo), Math.abs(hi));
    if (big < 500) return '';
    const tiny = big * 0.02;
    if (Math.abs(hi - lo) <= tiny) return `${lo < 0 ? neg : pos} ${approx(lo)}`;
    if (hi <= tiny) return lo > -tiny ? `${neg} up to ${approx(lo)}` : hi < -tiny ? `${neg} ${approx(hi)} to ${approx(lo)}` : `${neg} up to ${approx(lo)}`;
    if (lo >= -tiny) return `${pos} up to ${approx(hi)}`;
    return `${both}: from ${approx(lo).replace('~', '−~')} to ${approx(hi).replace('~', '+~')}`;
  };
  const spend = part(vals.map((v) => v.spend), 'Costs', 'Brings in', 'Cash');
  const fin = part(vals.map((v) => v.finance), 'Pays out', 'Raises', 'Financing');
  return [spend, fin].filter(Boolean).join('. ');
}

export interface EventView { uid: number; def: EventDef; title: string; text: string; options: { label: string; hint: string; enabled: boolean; odds: string; money: string }[] }
export function viewEvent(g: GameState, pe: PendingEvent): EventView {
  const def = EVENT[pe.id];
  return {
    uid: pe.uid, def, title: fill(g, def.title, pe.ctx), text: fill(g, def.text, pe.ctx),
    options: def.opts.map((o) => ({ label: fill(g, o.label, pe.ctx), hint: fill(g, o.hint, pe.ctx), enabled: evalCond(g, o.req, pe.ctx), odds: o.out.length > 1 ? 'Uncertain outcome' : '', money: moneyText(g, pe.ctx, o) })),
  };
}

const ENTITIES: readonly string[] = ['office', 'city', 'region', 'rival', 'person', 'loan'];
/** What a follow-up inherits from the card that led to it: the industry, and only the office, region, rival, person or
 *  loan it is itself about. Otherwise closing an office would quietly cancel, say, a bribery probe that began there. */
function chainCtx(ctx: EventCtx, id: string): EventCtx {
  const keep = new Set<string>((EVENT[id]?.bind ?? []).flatMap((b) => (b === 'office' ? ['office', 'city', 'region'] : [b])));
  return Object.fromEntries(Object.entries(ctx).filter(([k]) => keep.has(k) || !ENTITIES.includes(k))) as EventCtx;
}

export interface EventResult { title: string; choice: string; text: string; effects: string[]; lesson: string; luck: number; terms: string[] }
export function resolveEvent(g: GameState, uid: number, optIdx: number): EventResult | null {
  const pe = g.queue.find((e) => e.uid === uid);
  if (!pe || (g.status !== 'playing' && !g.continued)) return null;
  const def = EVENT[pe.id];
  const opt: EventOption | undefined = def.opts[optIdx];
  if (!opt || !evalCond(g, opt.req, pe.ctx)) return null;
  const ws = opt.out.map((o) => boosted(g, pe.ctx, o));
  const tot = ws.reduce((a, b) => a + b, 0) || 1;
  let r = rand(g) * tot, pick = 0;
  ws.forEach((w, i) => { if (w > 0) pick = i; }); // if rounding leaves a sliver: the last outcome that can happen
  for (let i = 0; i < ws.length; i++) {
    r -= ws[i];
    if (ws[i] > 0 && r <= 0) { pick = i; break; } // a zero weight is never picked, even when the draw is exactly 0 (as weighted())
  }
  const out = opt.out[pick];
  const vals = opt.out.map((o) => outcomeValue(g, o));
  const luck = opt.out.length > 1 ? vals[pick] - vals.reduce((s, v, i) => s + (v * ws[i]) / tot, 0) : 0;
  const text = fill(g, out.text, pe.ctx);
  const title = fill(g, def.title, pe.ctx);
  const choice = fill(g, opt.label, pe.ctx);
  const effects = applyFx(g, out.fx ?? [], pe.ctx);
  for (const [id, delay, p] of out.chain ?? []) if (chance(g, p ?? 1)) scheduleEvent(g, id, delay, chainCtx(pe.ctx, id));
  g.queue = g.queue.filter((e) => e.uid !== uid);
  if (g.status !== 'playing') { // that choice ended the game (a sale, a takeover), a kept-going one included
    g.continued = false;
    g.queue = [];
  }
  g.attribution.luck += luck;
  if (Math.abs(luck) > 0.04 * scaleS(g)) g.attribution.notes.push({ turn: g.turn, kind: 'luck', text: `${title}: ${text}`, value: luck });
  g.eventLog.push({ turn: g.turn, id: def.id, title, choice, result: text, luck, cat: def.cat });
  const rival = pe.ctx.rival !== undefined ? g.rivals.find((r) => r.id === pe.ctx.rival) : undefined;
  if (rival && (def.cat === 'rival' || def.bind?.includes('rival'))) feud(g, rival, 'them', `${title}. You: ${choice.toLowerCase()}. ${text}`);
  if (g.eventLog.length > 200) g.eventLog.shift();
  // Colour the news by how it turned out against the odds (or the outcome's own tone), not by whether money was spent.
  const tone = out.tone ?? (luck > 0.005 * scaleS(g) ? 'good' : luck < -0.005 * scaleS(g) ? 'bad' : 'info');
  news(g, `${title}: ${text}`, tone);
  pruneStale(g); // a card about the person who just left (or the rival just bought) no longer applies
  return { title, choice, text, effects, lesson: def.lesson, luck, terms: def.terms ?? [] };
}

// ── "Let the COO handle it" (review wave 3): small decisions need not interrupt the quarter.

/** Cards the COO may take: never a crisis or a rival's move, nothing that touches financing, ownership or the
 *  company's survival, and no option that can swing more than 4% of a quarter's revenue either way. */
export const DELEGATE_LIMIT = 0.04;
const SAFE_SPECIALS = new Set(['payAmount']);
export function lowStakes(g: GameState, pe: PendingEvent): boolean {
  const def = EVENT[pe.id];
  if (!def || def.cat === 'stress' || def.cat === 'rival') return false;
  const cap = DELEGATE_LIMIT * scaleS(g);
  for (const opt of def.opts) {
    for (const o of opt.out) {
      if ((o.fx ?? []).some((f) => (f[0] === 'special' && !SAFE_SPECIALS.has(f[1])) || ['equity', 'loan', 'debtCall', 'dilute', 'valuation', 'personLeave', 'mnaTarget'].includes(f[0]))) return false;
      const m = outcomeCash(g, pe.ctx, o);
      if (m.finance !== 0 || Math.abs(m.spend) > cap || Math.abs(outcomeValue(g, o)) > cap) return false;
    }
  }
  return true;
}

/** The COO plays safe: the option with the best worst case, then the best average. It knows the odds no better than you do,
 *  so this is a sensible default rather than the best answer. */
export function delegateChoice(g: GameState, pe: PendingEvent): number {
  const def = EVENT[pe.id];
  let best = -1, bestKey: [number, number] = [-Infinity, -Infinity];
  def.opts.forEach((opt, i) => {
    if (!evalCond(g, opt.req, pe.ctx)) return;
    const worst = Math.min(...opt.out.map((o) => outcomeValue(g, o)));
    const avg = opt.out.reduce((s, o) => s + outcomeValue(g, o), 0) / opt.out.length;
    if (worst > bestKey[0] + 1e-9 || (Math.abs(worst - bestKey[0]) <= 1e-9 && avg > bestKey[1])) {
      best = i;
      bestKey = [worst, avg];
    }
  });
  return best;
}

/** Hand one card to the COO. Returns what happened, or null if the card is not one the COO may take. */
export function delegateEvent(g: GameState, uid: number): EventResult | null {
  const pe = g.queue.find((e) => e.uid === uid);
  if (!pe || !lowStakes(g, pe)) return null;
  const i = delegateChoice(g, pe);
  return i < 0 ? null : resolveEvent(g, uid, i);
}

/** With the setting on, the COO takes every small card waiting at the start of a quarter. */
export function autoDelegate(g: GameState): EventResult[] {
  if (!g.settings.delegate) return [];
  const out: EventResult[] = [];
  for (const pe of [...g.queue]) {
    const r = delegateEvent(g, pe.uid);
    if (r) out.push(r);
  }
  return out;
}

const FX_KINDS = new Set(['cash', 'cost', 'flat', 'capex', 'morale', 'culture', 'brand', 'rbrand', 'rep', 'esg', 'tech', 'skill', 'loyalty', 'demand', 'market', 'wages', 'inputs', 'capacity', 'prod', 'attrition', 'staff', 'share', 'hostility', 'relation', 'rivalCash', 'rivalTech', 'rivalBrand', 'rivalShare', 'gap', 'rate', 'infl', 'commodity', 'energyIdx', 'sentiment', 'spread', 'fx', 'regionGap', 'flag', 'unflag', 'personLeave', 'debtCall', 'rateUp', 'waive', 'equity', 'loan', 'dilute', 'valuation', 'writeoff', 'invLoss', 'ppeLoss', 'tax', 'nol', 'mnaTarget', 'discover', 'special']);
/** Validate the deck (used by tests): returns a list of problems. */
export function validateEvents(): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const e of EVENTS) {
    if (ids.has(e.id)) errs.push(`duplicate id ${e.id}`);
    ids.add(e.id);
    if (!e.opts?.length) errs.push(`${e.id}: no options`);
    for (const o of e.opts ?? []) {
      if (!o.out?.length) errs.push(`${e.id}: option "${o.label}" has no outcomes`);
      for (const out of o.out ?? []) {
        for (const [id] of out.chain ?? []) if (!EVENT[id]) errs.push(`${e.id}: chain to unknown event ${id}`);
        for (const f of out.fx ?? []) {
          if (!FX_KINDS.has(f[0])) errs.push(`${e.id}: unknown effect ${f[0]}`);
          if (f[0] === 'special' && !SPECIALS[f[1]]) errs.push(`${e.id}: unknown special ${f[1]}`);
        }
      }
    }
  }
  for (const d of Object.values(INV)) if (d.risk?.event && !EVENT[d.risk.event]) errs.push(`investment ${d.id}: unknown risk event ${d.risk.event}`);
  return errs;
}
