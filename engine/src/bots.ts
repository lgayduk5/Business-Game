// Scripted players for the balance harness (scripts/sim.ts) and long-run tests.
// They use only the public actions a human has, plus what the UI shows.
import * as A from './actions';
import * as B from './books';
import { CITIES, CITY, EVENT, INDUSTRIES, INV, isCapital } from './content';
import { evalCond, optionEV, resolveEvent } from './events';
import { scenarioDef } from './scenarios';
const noEquity = (g: GameState) => !!scenarioDef(g)?.goal.noEquity;
import * as F from './finance';
import { diligence, invAvailable, invCost, startInvestment } from './invest';
const invCostOf = (g: GameState, id: string, scope?: string) => invCost(g, INV[id], scope);
import { localPrice, marketUnits } from './market';
import { exec } from './people';
import { bidForRival, bidOdds, bidPrice, improveRelations, poachTalent, proposeTruce, sueRival, truceOdds } from './rivals';
import type { GameState, IndustryId, Office } from './types';
import { clamp } from './util';

export interface BotParams {
  name: string;
  blurb: string;
  sales: number; // target sales coverage (effort) at full scale
  rd: number; // R&D spend as share of revenue
  price: number; // baseline price position
  mktg: number; // marketing as share of regional revenue
  expand: number; // max offices
  equity: boolean; // raise equity when offered and useful
  debt: boolean; // borrow to grow
  invest: boolean; // fund sensible investments
  ipo: boolean;
  runway: number; // quarters of runway it insists on before spending
  diplomacy: 'none' | 'peace' | 'war';
  special?: 'passive' | 'gouge' | 'flipper' | 'empire' | 'raider';
  /** Bets on one moonshot once it can comfortably afford to lose it. */
  moonshot?: boolean;
}

export const BOTS: Record<string, BotParams> = {
  passive: { name: 'Passive', blurb: 'Does nothing at all. The floor.', sales: 0, rd: 0, price: 1, mktg: 0, expand: 1, equity: false, debt: false, invest: false, ipo: false, runway: 99, diplomacy: 'none', special: 'passive' },
  steady: { name: 'Steady', blurb: 'Profitable growth, no outside money until it is cheap.', sales: 0.25, rd: 0.1, price: 1.0, mktg: 0.03, expand: 8, equity: false, debt: true, invest: true, ipo: true, runway: 6, diplomacy: 'peace' },
  blitz: { name: 'Blitz', blurb: 'Venture-funded land grab: raise, hire, expand, worry later.', sales: 0.5, rd: 0.14, price: 0.94, mktg: 0.06, expand: 16, equity: true, debt: false, invest: true, ipo: true, runway: 3, diplomacy: 'none' },
  premium: { name: 'Premium', blurb: 'Out-invest on R&D and charge for it.', sales: 0.3, rd: 0.2, price: 1.15, mktg: 0.04, expand: 8, equity: true, debt: false, invest: true, ipo: true, runway: 5, diplomacy: 'peace', moonshot: true },
  leveraged: { name: 'Leveraged', blurb: 'Debt-funded expansion; keeps all the equity.', sales: 0.35, rd: 0.1, price: 0.98, mktg: 0.04, expand: 12, equity: false, debt: true, invest: true, ipo: true, runway: 3, diplomacy: 'none' },
  // degenerate-strategy probes
  gouge: { name: 'Gouge', blurb: 'Probe: maximum price, minimum staff, harvest cash.', sales: 0.02, rd: 0, price: 1.8, mktg: 0, expand: 1, equity: false, debt: false, invest: false, ipo: false, runway: 99, diplomacy: 'none', special: 'gouge' },
  flipper: { name: 'Flipper', blurb: 'Probe: raise every round offered and sit on the cash.', sales: 0.1, rd: 0.05, price: 1.0, mktg: 0, expand: 1, equity: true, debt: false, invest: false, ipo: true, runway: 99, diplomacy: 'none', special: 'flipper' },
  warmonger: { name: 'Warmonger', blurb: 'Probe: sue and poach every rival, every chance it gets.', sales: 0.25, rd: 0.1, price: 0.95, mktg: 0.03, expand: 8, equity: true, debt: false, invest: true, ipo: true, runway: 4, diplomacy: 'war' },
  raider: { name: 'Raider', blurb: 'Probe: borrow and raise to buy rivals outright.', sales: 0.25, rd: 0.08, price: 1.0, mktg: 0.03, expand: 6, equity: true, debt: true, invest: false, ipo: true, runway: 3, diplomacy: 'peace', special: 'raider' },
  empire: { name: 'Empire', blurb: 'Probe: open in every city as fast as cash allows.', sales: 0.2, rd: 0.05, price: 1.0, mktg: 0.02, expand: 19, equity: true, debt: true, invest: false, ipo: true, runway: 2, diplomacy: 'none', special: 'empire' },
};

const lastQ = (g: GameState) => g.company.quarters[g.company.quarters.length - 1];
const quarterlyCosts = (g: GameState) => {
  const q = lastQ(g);
  return q ? Math.max(1, q.pnl.revenue - q.ebitda + q.pnl.interest) : 150_000;
};
/** Cash to keep in hand: half a quarter of costs, plus the runway the strategy insists on at the current burn. */
const reserve = (g: GameState, p: BotParams) => {
  const q = lastQ(g);
  // operating burn: plant and offices are bought deliberately (and largely financed), so they do not count as running out of money
  const burn = q ? Math.max(0, -q.cf.cfo) : quarterlyCosts(g) * 0.3;
  return quarterlyCosts(g) * 1.0 + burn * Math.min(p.runway, 12);
};
const spare = (g: GameState, p: BotParams) => g.company.books.cash - reserve(g, p);
const runwayQ = (g: GameState) => {
  const q = lastQ(g);
  const burn = q ? -q.cf.cfo : 0;
  return burn > 0 ? g.company.books.cash / burn : 99;
};

function answerEvents(g: GameState) {
  for (const pe of g.queue.slice()) {
    const def = EVENT[pe.id];
    let best = -1, bestV = -Infinity;
    def.opts.forEach((o, i) => {
      if (!evalCond(g, o.req, pe.ctx)) return;
      if (noEquity(g) && o.out.some((x) => (x.fx ?? []).some((f) => f[0] === 'equity'))) return; // the challenge forbids selling shares
      const v = optionEV(g, pe, i);
      if (v > bestV) { bestV = v; best = i; }
    });
    resolveEvent(g, pe.uid, Math.max(0, best));
  }
}

/** How much R&D an industry rewards, relative to software. */
const RD_WEIGHT: Record<IndustryId, number> = { saas: 1, biotech: 1, mfg: 0.4, energy: 0.2, logistics: 0.2, consulting: 0.25, retail: 0.1 };
/** How much sales coverage an industry rewards: contracted and capacity-limited businesses need little. */
const SALES_WEIGHT: Record<IndustryId, number> = { saas: 1, consulting: 1, retail: 0.6, biotech: 0.6, mfg: 0.6, logistics: 0.5, energy: 0.12 };

function staff(g: GameState, o: Office, p: BotParams) {
  const c = g.company;
  const def = INDUSTRIES[o.ind];
  const hint = A.staffingHint(g, o);
  const l = o.last;
  const growing = !l || l.bind !== 'demand' ? 1.15 : 1.05;
  const plant = isCapital(o.ind) ? Math.ceil((o.cap * 1.05) / (def.opsOut * (l?.prodMult ?? 1))) : Infinity;
  // where people are the capacity, staff to the work you have, not the work you hope for
  const idle = !isCapital(o.ind) && l && l.util < 0.82;
  A.setReqs(g, o.id, 'ops', idle ? 0 : Math.max(0, Math.min(Math.ceil(hint.ops * growing), plant) - o.staff.ops.n));
  if (l && l.util < 0.55 && o.staff.ops.n > 2 && g.turn - o.opened > 4) A.fire(g, o.id, 'ops', Math.floor(o.staff.ops.n * 0.15));
  // sales: add reps while the office has idle capacity, earns a contribution, and cash allows
  const D = marketUnits(g, o.city, o.ind);
  const need = Math.max(1, D / def.salesCover);
  const cover = o.staff.sales.n / need;
  const earning = !l || l.contribution > -0.05 * l.revenue;
  const ok = spare(g, p) > 0 && earning && (runwayQ(g) > p.runway || (lastQ(g)?.ebitda ?? 0) > 0);
  const slack = isCapital(o.ind) ? 0.85 : 0.95;
  // grow the sales team in steps the company can absorb: a few per cent of the market's coverage, at most a third of the team
  const step = Math.min(Math.max(1, Math.round(need * 0.03)), 1 + Math.round(o.staff.sales.n * 0.35));
  const want = cover < p.sales * SALES_WEIGHT[o.ind] && ok && (!l || (l.bind === 'demand' && l.util < slack)) ? step : 0;
  if (l && l.bind !== 'demand' && cover > p.sales * SALES_WEIGHT[o.ind] * 1.5 && o.staff.sales.n > 2) A.fire(g, o.id, 'sales', Math.ceil(o.staff.sales.n * 0.2));
  A.setReqs(g, o.id, 'sales', want);
  // R&D people: sized to what the industry rewards, once the office pays its way (software and biotech invest from day one)
  const w = RD_WEIGHT[o.ind];
  const rdWage = A.marketWage(g, o, 'rnd');
  const rdWant = w >= 1 || (l && l.contribution > 0) ? Math.floor(((l?.revenue ?? 0) * p.rd * w) / rdWage) : 0;
  A.setReqs(g, o.id, 'rnd', Math.max(0, Math.min(rdWant - o.staff.rnd.n, 3)));
  if (o.staff.rnd.n > rdWant + 2 && w < 1) A.fire(g, o.id, 'rnd', o.staff.rnd.n - rdWant - 1);
  A.setReqs(g, o.id, 'admin', Math.max(0, hint.admin - o.staff.admin.n));
  // plant: build when the plant is the limit and customers want more
  // (a grid sells whatever a full plant makes, so there a full plant is the signal on its own)
  if (isCapital(o.ind) && l && l.bind === 'facility' && (l.target > o.share * 1.05 || (def.grid && l.util > 0.9)) && o.building.length === 0) {
    const units = Math.max(10, Math.round(o.cap * 0.3));
    const cost = A.expandCost(g, o, units);
    const own = cost * (1 - A.assetFinanceLTV(o.ind)) * (1 - (o.minority ?? 0));
    if (cost < spare(g, p)) A.expandCapacity(g, o.id, units);
    else if ((p.debt || def.capPerUnit >= 10) && B.ttm(c, (q) => q.ebitda) > 0) {
      if (own >= spare(g, p)) {
        // capital recycling pays for the owner's share of the build, if a running plant can be part-sold
        const r = c.offices.find((x) => !A.canRecycle(g, x));
        if (r && spare(g, p) + A.PLANT_STAKE * F.plantEquity(g, r) * 0.98 > own) A.sellPlantStake(g, r.id);
      }
      if (own < spare(g, p)) A.expandCapacity(g, o.id, units, true);
    }
  }
  if (p.special !== 'gouge') A.setPay(g, o.id, o.morale < 45 ? 1.1 : 1.0);
  A.setTraining(g, o.id, p.invest && g.turn > 6 && (lastQ(g)?.ebitda ?? 0) > 0 ? 1 : 0);
}

function priceAndMarketing(g: GameState, p: BotParams) {
  const c = g.company;
  const regions = new Set(c.offices.map((o) => CITY[o.city].region));
  for (const r of regions) {
    const offs = c.offices.filter((o) => CITY[o.city].region === r);
    const rev = offs.reduce((s, o) => s + (o.last?.revenue ?? 0), 0);
    A.setMarketing(g, r, rev * p.mktg);
    for (const k of new Set(offs.map((o) => o.ind))) {
      const cur = c.policy[r].price[k] ?? p.price;
      const bound = offs.filter((o) => o.ind === k && o.last && o.last.bind !== 'demand').length;
      const idle = offs.filter((o) => o.ind === k && o.last && o.last.util < 0.7).length;
      let next = cur + (bound ? 0.03 : idle ? -0.02 : 0.25 * (p.price - cur));
      next = clamp(next, p.price - 0.12, p.price + 0.2);
      if (INDUSTRIES[k as IndustryId].grid) next = Math.min(next, p.price); // the grid buys at the going rate and no higher
      A.setPrice(g, r, k as IndustryId, p.special === 'gouge' ? 1.8 : next);
    }
  }
}

/** Score a city for a new office: market value per dollar of local cost, with a bonus for regions you already know. */
function cityScore(g: GameState, city: string, ind: IndustryId): number {
  const ct = CITY[city];
  const v = marketUnits(g, city, ind) * localPrice(g, city, ind);
  const cost = 0.5 * ct.wage + 0.3 * ct.rent + 0.2 + ct.reg * 0.3;
  const known = g.company.offices.some((o) => CITY[o.city].region === ct.region) ? 1.3 : 1;
  return (v / cost) * known * (1 - ct.risk * 0.5) * (1 - ct.tax);
}

function expand(g: GameState, p: BotParams) {
  const c = g.company;
  if (c.offices.length >= p.expand) return;
  const ind = c.primary;
  const settled = c.offices.every((o) => g.turn - o.opened > (p.special === 'empire' ? 1 : 4));
  if (!settled) return;
  if (spare(g, p) <= 0) return;
  // a new office loses money for a year or so: only expand from a profitable base (venture-funded strategies excepted)
  if (!(p.equity && p.runway <= 3) && B.ttm(c, (q) => q.ebitda) <= 0) return;
  const cands = CITIES.filter((x) => !c.offices.some((o) => o.city === x.id && o.ind === ind)).sort((a, b) => cityScore(g, b.id, ind) - cityScore(g, a.id, ind));
  const best = cands[0];
  if (!best) return;
  if ((g.discovered[best.id] ?? 0) < 1) {
    if (!g.scouting.some((s) => s.city === best.id)) A.scout(g, best.id);
    return;
  }
  const cost = A.openOfficeCost(g, best.id, ind).total;
  // plant-heavy offices are part-financed against the plant once the business earns enough to carry the loan
  const lent = isCapital(ind) && B.ttm(c, (q) => q.ebitda) > 0 ? A.openOfficeFinancing(g, best.id, ind) : 0;
  const need = (cost - lent) * 2 + quarterlyCosts(g) * 0.5;
  if (need >= spare(g, p)) {
    // capital recycling: sell part of a running plant only if that pays for the next one
    const o = c.offices.find((x) => !A.canRecycle(g, x));
    if (!o || spare(g, p) + A.PLANT_STAKE * F.plantEquity(g, o) * 0.98 < need) return;
    A.sellPlantStake(g, o.id);
  }
  A.openOffice(g, best.id, ind, lent > 0);
}

function finance(g: GameState, p: BotParams) {
  const c = g.company;
  const rw = runwayQ(g);
  const rv = g.loanOffers.find((o) => o.kind === 'revolver');
  if (rv && (p.debt || rw < 4)) F.takeLoan(g, rv.id, rv.max);
  if (noEquity(g)) g.equityOffer = undefined;
  if (g.equityOffer && p.equity && (p.special === 'flipper' || rw < p.runway + 4 || (p.name === 'Blitz' && F.founderStake(c) > 0.3))) F.raiseEquity(g, p.special === 'flipper' ? g.equityOffer.maxPct : 0.15);
  if (g.equityOffer && !p.equity && rw < 2.5) F.raiseEquity(g, 0.12); // survival beats pride
  if (p.debt && c.offices.length < p.expand) {
    const tl = g.loanOffers.find((o) => o.kind === 'term' || o.kind === 'equipment');
    if (tl && B.ttm(c, (q) => q.ebitda) > 0 && c.books.debt < 2 * Math.max(0, B.ttm(c, (q) => q.ebitda))) F.takeLoan(g, tl.id, tl.max * 0.6);
  }
  if (rw < 1.5 && !g.equityOffer) {
    const br = g.loanOffers.find((o) => o.kind === 'distressed');
    if (br) F.takeLoan(g, br.id, Math.min(br.max, quarterlyCosts(g) * 2));
  }
  if (p.ipo && F.ipoChecklist(g).ok) F.startIPO(g);
  // working capital: sell invoices when cash is tight and customers owe a lot; stop once comfortable
  const qrev = lastQ(g)?.pnl.revenue ?? 0;
  if (!c.factoring && c.books.ar > 0.4 * qrev && (rw < p.runway + 1 || spare(g, p) < 0)) A.setFactoring(g, true);
  else if (c.factoring && spare(g, p) > quarterlyCosts(g) * 3) A.setFactoring(g, false);
}

function people(g: GameState) {
  const c = g.company;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const plan: [string, number][] = [['CFO', 12e6], ['COO', 30e6], ['CTO', 20e6], ['CHRO', 50e6], ['CMO', 40e6]];
  for (const [role, at] of plan) {
    if (rev < at * g.macro.cpi || exec(c, role as never)) continue;
    const cand = g.candidates.filter((x) => x.role === role).sort((a, b) => b.skill - a.skill)[0];
    if (cand && c.books.cash > quarterlyCosts(g) * 3) A.hireExec(g, cand.id);
  }
  for (const p of c.people) if (p.loyalty < 30 && (p.retained ?? -1) < g.turn && p.skill > 60 && c.books.cash > quarterlyCosts(g) * 4) A.retain(g, p.id);
  // a scenario whose goal is a listing: hire the CFO it needs and file as soon as the checklist is clear
  if (scenarioDef(g)?.goal.kind === 'ipo') {
    if (!exec(c, 'CFO')) {
      const cand = g.candidates.filter((x) => x.role === 'CFO').sort((a, b) => b.skill - a.skill)[0];
      if (cand) A.hireExec(g, cand.id);
    }
    if (F.ipoChecklist(g).ok) F.startIPO(g);
  }
}

const GOOD_INV = ['sales_academy', 'training_academy', 'cyber', 'culture_program', 'quality_system', 'succession', 'pricing_engine', 'loyalty_program', 'reliability', 'process_innovation', 'telematics', 'knowledge_platform', 'rd_lab', 'erp', 'platform', 'drug', 'storage', 'automation', 'delivery_app', 'hedging', 'sustainability', 'foundation'];
function invest(g: GameState, p: BotParams) {
  const c = g.company;
  if (!p.invest || spare(g, p) < quarterlyCosts(g)) return;
  // a moonshot, sized so that losing it would not hurt: the whole bet is less than a third of the spare cash (whether
  // or not the business is in profit yet: a growing software company burns cash and can still afford the bet). One at
  // a time, and if it fails, another later (as a player chasing Pioneer would) until one lands.
  if (p.moonshot && INV.moonshot && c.moonshots === 0 && !c.investments.some((x) => x.def === 'moonshot' && (x.state === 'ramp' || x.state === 'active')) && invAvailable(g, INV.moonshot).ok
    && invCostOf(g, 'moonshot') * 3 < spare(g, p)) {
    if (startInvestment(g, 'moonshot').ok) return;
  }
  if (B.ttm(c, (q) => q.ebitda) <= 0) return;
  // in a grid industry every spare dollar earns more in the next plant than in a programme: fund that first
  const home = c.offices.find((o) => INDUSTRIES[o.ind].grid);
  if (home && spare(g, p) < 2 * A.expandCost(g, home, Math.max(10, Math.round(home.cap * 0.3))) * (1 - A.assetFinanceLTV(home.ind))) return;
  for (const id of GOOD_INV) {
    const def = INV[id];
    if (!def) continue;
    const scope = def.scope === 'office' ? c.offices.find((o) => !def.inds || def.inds.includes(o.ind))?.id : def.scope === 'region' ? CITY[c.home].region : undefined;
    if (!invAvailable(g, def, scope).ok) continue;
    if (!c.diligence[id] && (def.risk || def.trap)) diligence(g, id, scope);
    if (def.trap && c.diligence[id] && def.truth) continue;
    if (invCostOf(g, id, scope) * 2 > spare(g, p)) continue;
    if (invCostOf(g, id, scope) > 0.03 * B.ttm(c, (q) => q.pnl.revenue)) continue; // programmes sized to the business, not bought on a whim
    const r = startInvestment(g, id, scope);
    if (r.ok) return; // one a quarter
  }
}

function diplomacy(g: GameState, p: BotParams) {
  for (const r of g.rivals.filter((x) => x.alive)) {
    if (p.diplomacy === 'peace') {
      if (r.hostility >= 3 && !r.pact && truceOdds(g, r) > 0.4) proposeTruce(g, r.id);
      else if (r.relation < 10 && g.turn % 4 === r.id % 4) improveRelations(g, r.id);
    } else if (p.diplomacy === 'war' && !r.pact) {
      poachTalent(g, r.id);
      sueRival(g, r.id);
    }
    if (p.special === 'raider') {
      const price = bidPrice(g, r, false);
      if (price < g.company.books.cash * 0.7 && bidOdds(g, r, false) > 0.3) bidForRival(g, r.id, false);
    } else if ((p.name === 'Leveraged' || p.name === 'Blitz') && g.turn > 12) {
      // consolidators buy a weaker rival when it is cheap against the cash in hand and likely to say yes
      const price = bidPrice(g, r, false);
      if (price < g.company.books.cash * 0.6 && bidOdds(g, r, false) > 0.35 && r.valuation < g.company.valuation * 0.6) bidForRival(g, r.id, false);
    }
  }
}

/** Biotech lives on its pipeline: keep two candidates in trials and raise money against them. */
function biotech(g: GameState) {
  const c = g.company;
  if (!c.divisions.includes('biotech')) return;
  const live = c.investments.filter((i) => i.def === 'drug' && i.state === 'ramp').length;
  const def = INV.drug;
  if (def && live < 2 && c.books.cash > (live ? 0.6 : 0.25) * def.base * 1000 * g.macro.cpi * 2.7) startInvestment(g, 'drug');
  if (g.equityOffer && runwayQ(g) < 8) F.raiseEquity(g, 0.2);
}

/** One quarter of decisions for a bot. Call before endTurn. */
export function botTurn(g: GameState, p: BotParams) {
  answerEvents(g);
  if (p.special === 'passive') return;
  for (const o of g.company.offices) staff(g, o, p);
  priceAndMarketing(g, p);
  if (p.special !== 'gouge' && p.special !== 'flipper') expand(g, p);
  biotech(g);
  finance(g, p);
  people(g);
  invest(g, p);
  diplomacy(g, p);
  if (p.special === 'flipper' && spare(g, p) > quarterlyCosts(g) * 6) {
    const t = INV.treasury;
    if (t && invAvailable(g, t).ok) startInvestment(g, 'treasury');
  }
}
