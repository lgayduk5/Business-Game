// Scripted players for the balance harness (scripts/sim.ts) and long-run tests.
// They use only the public actions a human has, plus what the UI shows.
import * as A from './actions';
import * as B from './books';
import { CITIES, CITY, EVENT, INDUSTRIES, INV, isCapital } from './content';
import { evalCond, optionEV, resolveEvent } from './events';
import * as F from './finance';
import { diligence, invAvailable, startInvestment } from './invest';
import { localPrice, marketUnits } from './market';
import { companyHeadcount, exec } from './people';
import { bidForRival, bidOdds, bidPrice, improveRelations, poachTalent, proposeTruce, sueRival, truceOdds } from './rivals';
import type { GameState, IndustryId, Office, RegionId } from './types';
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
}

export const BOTS: Record<string, BotParams> = {
  passive: { name: 'Passive', blurb: 'Does nothing at all. The floor.', sales: 0, rd: 0, price: 1, mktg: 0, expand: 1, equity: false, debt: false, invest: false, ipo: false, runway: 99, diplomacy: 'none', special: 'passive' },
  steady: { name: 'Steady', blurb: 'Profitable growth, no outside money until it is cheap.', sales: 0.25, rd: 0.1, price: 1.0, mktg: 0.03, expand: 8, equity: false, debt: true, invest: true, ipo: true, runway: 6, diplomacy: 'peace' },
  blitz: { name: 'Blitz', blurb: 'Venture-funded land grab: raise, hire, expand, worry later.', sales: 0.5, rd: 0.14, price: 0.94, mktg: 0.06, expand: 16, equity: true, debt: false, invest: true, ipo: true, runway: 3, diplomacy: 'none' },
  premium: { name: 'Premium', blurb: 'Out-invest on R&D and charge for it.', sales: 0.3, rd: 0.2, price: 1.15, mktg: 0.04, expand: 8, equity: true, debt: false, invest: true, ipo: true, runway: 5, diplomacy: 'peace' },
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
const runwayQ = (g: GameState) => {
  const q = lastQ(g);
  const burn = q ? -(q.cf.cfo + q.cf.capex) : 0;
  return burn > 0 ? g.company.books.cash / burn : 99;
};

function answerEvents(g: GameState) {
  for (const pe of g.queue.slice()) {
    const def = EVENT[pe.id];
    let best = -1, bestV = -Infinity;
    def.opts.forEach((o, i) => {
      if (!evalCond(g, o.req, pe.ctx)) return;
      const v = optionEV(g, pe, i);
      if (v > bestV) { bestV = v; best = i; }
    });
    resolveEvent(g, pe.uid, Math.max(0, best));
  }
}

function staff(g: GameState, o: Office, p: BotParams) {
  const def = INDUSTRIES[o.ind];
  const hint = A.staffingHint(g, o);
  const l = o.last;
  const growing = !l || l.bind !== 'demand' ? 1.15 : 1.05;
  A.setReqs(g, o.id, 'ops', Math.max(0, Math.ceil(hint.ops * growing) - o.staff.ops.n));
  if (l && l.util < 0.55 && o.staff.ops.n > 2 && g.turn - o.opened > 4) A.fire(g, o.id, 'ops', Math.floor(o.staff.ops.n * 0.15));
  // sales: grow coverage towards the target while it pays and cash allows
  const D = marketUnits(g, o.city, o.ind);
  const need = Math.max(1, D / def.salesCover);
  const cover = o.staff.sales.n / need;
  const ok = runwayQ(g) > p.runway && (lastQ(g)?.ebitda ?? 0) > -0.5 * (lastQ(g)?.pnl.revenue ?? 1) || g.company.books.cash > quarterlyCosts(g) * 8;
  const want = cover < p.sales && ok && (!l || l.bind === 'demand') ? Math.max(1, Math.round(need * 0.04)) : 0;
  A.setReqs(g, o.id, 'sales', want);
  // R&D people: sized to the R&D share of the office's revenue
  const rdWage = A.marketWage(g, o, 'rnd');
  const rdWant = Math.floor(((l?.revenue ?? 0) * p.rd) / rdWage);
  A.setReqs(g, o.id, 'rnd', Math.max(0, Math.min(rdWant - o.staff.rnd.n, 4)));
  A.setReqs(g, o.id, 'admin', Math.max(0, hint.admin - o.staff.admin.n));
  if (isCapital(o.ind) && l && l.bind === 'facility' && o.building.length === 0) {
    const units = Math.round(o.cap * 0.3);
    if (A.expandCost(g, o, units) < g.company.books.cash - quarterlyCosts(g) * p.runway) A.expandCapacity(g, o.id, units);
  }
  if (p.special !== 'gouge') A.setPay(g, o.id, o.morale < 45 ? 1.1 : 1.0);
  A.setTraining(g, o.id, p.invest && g.turn > 6 ? 1 : 0);
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
  const rich = c.books.cash > quarterlyCosts(g) * (p.runway + 2);
  if (!rich) return;
  const cands = CITIES.filter((x) => !c.offices.some((o) => o.city === x.id && o.ind === ind)).sort((a, b) => cityScore(g, b.id, ind) - cityScore(g, a.id, ind));
  const best = cands[0];
  if (!best) return;
  if ((g.discovered[best.id] ?? 0) < 1) {
    if (!g.scouting.some((s) => s.city === best.id)) A.scout(g, best.id);
    return;
  }
  const cost = A.openOfficeCost(g, best.id, ind).total;
  if (cost < c.books.cash - quarterlyCosts(g) * p.runway) A.openOffice(g, best.id, ind);
}

function finance(g: GameState, p: BotParams) {
  const c = g.company;
  const rw = runwayQ(g);
  const rv = g.loanOffers.find((o) => o.kind === 'revolver');
  if (rv && (p.debt || rw < 4)) F.takeLoan(g, rv.id, rv.max);
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
}

const GOOD_INV = ['sales_academy', 'training_academy', 'cyber', 'culture_program', 'quality_system', 'succession', 'pricing_engine', 'loyalty_program', 'reliability', 'process_innovation', 'telematics', 'knowledge_platform', 'rd_lab', 'erp', 'platform', 'drug', 'storage', 'automation', 'delivery_app', 'hedging', 'sustainability', 'foundation'];
function invest(g: GameState, p: BotParams) {
  const c = g.company;
  if (!p.invest || c.books.cash < quarterlyCosts(g) * (p.runway + 3)) return;
  for (const id of GOOD_INV) {
    const def = INV[id];
    if (!def) continue;
    const scope = def.scope === 'office' ? c.offices.find((o) => !def.inds || def.inds.includes(o.ind))?.id : def.scope === 'region' ? CITY[c.home].region : undefined;
    if (!invAvailable(g, def, scope).ok) continue;
    if (!c.diligence[id] && (def.risk || def.trap)) diligence(g, id, scope);
    if (def.trap && c.diligence[id] && def.truth) continue;
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
    }
  }
}

/** One quarter of decisions for a bot. Call before endTurn. */
export function botTurn(g: GameState, p: BotParams) {
  answerEvents(g);
  if (p.special === 'passive') return;
  for (const o of g.company.offices) staff(g, o, p);
  priceAndMarketing(g, p);
  if (p.special !== 'gouge' && p.special !== 'flipper') expand(g, p);
  finance(g, p);
  people(g);
  invest(g, p);
  diplomacy(g, p);
  if (p.special === 'flipper' && g.company.books.cash > quarterlyCosts(g) * 12) {
    const t = INV.treasury;
    if (t && invAvailable(g, t).ok) startInvestment(g, 'treasury');
  }
  void companyHeadcount;
  void (null as unknown as RegionId);
}
