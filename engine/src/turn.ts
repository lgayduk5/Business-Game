// End-of-quarter resolution. Order matters; see docs/design.md.
import { advise, trackAttribution } from './advisor';
import * as B from './books';
import { CITY, FOUNDER, INDUSTRIES, REGION_LIST, EVENT, hasInventory } from './content';
import { autoDelegate, drawEvents, queueEvent } from './events';
import { covenantStatus, payTaxes, plantDebtService, refreshEquityOffer, refreshLoanOffers, revalue, serviceDebt, stepIPO, type LocalProfit } from './finance';
import { stepInvestments } from './invest';
import { stepTargets } from './mna';
import { inputIndex, stepMacro, fxOf } from './macro';
import { globalShare, localPrice, marketUnits, priceIndex, resolveMarkets } from './market';
import { invSum, news, tempMod } from './mods';
import { companyHeadcount, execBonus, headcount, payroll, personLeaves, prepOffice, stepKeyPeople, stepPeople, type Prep } from './people';
import { FACTOR_FEE, FACTOR_SHARE, refreshCandidates } from './actions';
import { rivalsDecide, rivalsFinancials } from './rivals';
import { maybeEntrant, rivalLifeEvents, rivalsForDivisions } from './competitors';
import type { ExpCat, GameState, IndustryId, Office, Quarter, Role } from './types';
import { ROLES } from './types';
import { clamp, money, turnLabel } from './util';
import { checkEnd } from './victory';

const ROLE_CAT: Record<Role, ExpCat> = { ops: 'cogs', sales: 'sm', rnd: 'rd', admin: 'ga' };

/** Unit-cost saving from the company's total volume in an industry. */
export function scaleSaving(g: GameState, ind: IndustryId): number {
  const units = g.company.offices.filter((o) => o.ind === ind).reduce((s, o) => s + (o.last?.sold ?? 0), 0) * 4;
  return (INDUSTRIES[ind].scale * clamp(Math.log10(Math.max(1, units / 20000)), 0, 2)) / 2;
}

export function unitVarCost(g: GameState, o: Office): number {
  const def = INDUSTRIES[o.ind];
  const city = CITY[o.city];
  const supply = g.company.policy[city.region].supply;
  const supplyF = def.varCost > 0.2 ? (supply === 'lean' ? 0.94 : supply === 'resilient' ? 1.05 : 1) : 1;
  return 1000 * def.varCost * inputIndex(g, o.ind) * fxOf(g, o.city) * city.wage ** def.local * supplyF * (1 - scaleSaving(g, o.ind)) *
    tempMod(g, 'inputs', o) * (1 + invSum(g, 'inputCost', o) / 100);
}

function completeBuilds(g: GameState) {
  for (const o of g.company.offices) {
    for (const b of o.building) {
      if (b.ready <= g.turn) {
        o.cap += b.units;
        news(g, `New capacity is online in ${CITY[o.city].name}: +${Math.round(b.units).toLocaleString()} units a quarter.`, 'good');
      }
    }
    o.building = o.building.filter((b) => b.ready > g.turn);
  }
  for (const s of g.scouting) {
    if (s.ready <= g.turn) {
      g.discovered[s.city] = Math.max(g.discovered[s.city] ?? 0, 1);
      news(g, `The market study of ${CITY[s.city].name} is in. The city is now open to you.`, 'info');
    }
  }
  g.scouting = g.scouting.filter((s) => s.ready > g.turn);
}

function stepTech(g: GameState) {
  const c = g.company;
  for (const k of c.divisions) {
    const def = INDUSTRIES[k];
    let staffRP = 0;
    for (const o of c.offices) if (o.ind === k) staffRP += o.staff.rnd.n * (0.5 + o.staff.rnd.skill / 100);
    const budget = c.rdBudget[k] ?? 0;
    const rp = (staffRP + budget / (def.rdCost * 1000 * g.macro.cpi)) * (1 + execBonus(c, 'CTO') * 0.5) * FOUNDER[c.founder].rdEff * (1 + invSum(g, 'rdEff') / 100);
    const target = def.startTech - 6 + 27 * Math.min(1, def.techGain + 0.1) * Math.log10(1 + rp);
    const t = c.tech[k] ?? def.startTech;
    c.tech[k] = clamp(t < target ? t + 0.12 * Math.max(def.techGain, 0.5) * (target - t) : t - Math.min(def.techDecay, 0.15 * (t - target)), 5, 100);
    c.techInfo[k] = { rp, target };
  }
}

function stepBrand(g: GameState) {
  const c = g.company;
  let present = 0, sumRb = 0;
  for (const r of REGION_LIST) {
    const offs = c.offices.filter((o) => CITY[o.city].region === r);
    let rb = c.regionBrand[r];
    if (!offs.length) {
      c.regionBrand[r] = rb * 0.97;
      continue;
    }
    let addr = 0, sh = 0;
    for (const o of offs) {
      const v = marketUnits(g, o.city, o.ind) * localPrice(g, o.city, o.ind);
      addr += v;
      sh += v * o.share;
    }
    const x = c.policy[r].marketing / Math.max(1, 0.006 * addr);
    const gain = 5 * Math.min(2, Math.sqrt(x)) * (1 - rb / 100) + 8 * (sh / Math.max(1, addr)) + invSum(g, 'regionBrand', undefined, r);
    rb = clamp(rb + gain - 0.035 * rb, 0, 100);
    c.regionBrand[r] = rb;
    present++;
    sumRb += rb;
  }
  const wavg = present ? (sumRb / present) * Math.sqrt(present / REGION_LIST.length) : 0;
  c.brand = clamp(c.brand + 0.08 * (wavg - c.brand) + invSum(g, 'brand') + (c.reputation - 50) * 0.01, 0, 100);
}

function stepCulture(g: GameState, prevHead: number) {
  const c = g.company;
  const hc = companyHeadcount(c);
  const growth = (hc - prevHead) / Math.max(5, prevHead);
  const base = 52 + FOUNDER[c.founder].culture + execBonus(c, 'CHRO') * 10;
  c.culture = clamp(c.culture + 0.04 * (base - c.culture) + invSum(g, 'culture') - Math.max(0, growth - 0.12) * 18, 0, 100);
  c.reputation = clamp(c.reputation + 0.03 * (50 + (c.esg - 50) * 0.3 - c.reputation) + invSum(g, 'rep'), 0, 100);
  const resilient = REGION_LIST.filter((r) => c.policy[r].supply === 'resilient' && c.offices.some((o) => CITY[o.city].region === r)).length;
  const last = c.quarters[c.quarters.length - 1];
  const green = last && last.pnl.revenue > 0 ? (last.byInd.energy?.rev ?? 0) / last.pnl.revenue : 0;
  c.esg = clamp(c.esg + 0.02 * (45 + 30 * green - c.esg) + invSum(g, 'esg') + 0.1 * resilient, 0, 100);
}

export function endTurn(g: GameState): void {
  if (g.status !== 'playing' && !g.continued) return;
  const c = g.company;
  const prevQ: Quarter | undefined = c.quarters[c.quarters.length - 1];
  const prevHead = prevQ?.headcount ?? companyHeadcount(c);
  const prevVal = c.valuation;
  const cashStart = c.open.cash;

  completeBuilds(g);
  stepMacro(g);
  rivalsForDivisions(g);
  maybeEntrant(g);
  rivalsDecide(g);

  const preps = new Map<string, Prep>();
  for (const o of c.offices) preps.set(o.id, prepOffice(g, o));
  resolveMarkets(g, preps);

  // ── offices: costs, people, inventory
  const growing = prevQ && c.quarters.length >= 2 ? prevQ.pnl.revenue / Math.max(1, c.quarters[c.quarters.length - 2].pnl.revenue) - 1 : 0.05;
  let revenue = 0, apSpend = 0, arTarget = 0, defTarget = 0, dpoW = 0;
  const byInd: Quarter['byInd'] = {};
  const local = new Map<string, LocalProfit>(); // profit earned in each tax jurisdiction
  const slow = 1 + Math.max(0, -g.macro.gap) * 0.05; // customers pay late in downturns
  for (const o of c.offices) {
    const def = INDUSTRIES[o.ind];
    const city = CITY[o.city];
    const res = o.last!;
    const uv = unitVarCost(g, o);
    if (hasInventory(o.ind)) {
      const buy = res.produced * uv;
      B.buyInventory(c, o, buy);
      apSpend += buy;
      o.inventory += res.produced;
      const avg = o.inventory > 0 ? o.invValue / o.inventory : uv;
      const spoiled = (o.inventory - res.sold) * def.spoil;
      res.materials = (res.sold + spoiled) * avg;
      B.useInventory(c, o, res.materials);
      o.inventory = Math.max(0, o.inventory - res.sold - spoiled);
      if (o.inventory < 1e-6) {
        B.useInventory(c, o, o.invValue);
        o.inventory = 0;
      }
    } else {
      res.materials = res.sold * uv;
      B.expense(c, 'cogs', res.materials, 'ap');
      apSpend += res.materials;
    }
    let wages = 0;
    for (const role of ROLES) {
      const w = payroll(g, o, role);
      res.wages[role] = w;
      wages += w;
      B.expense(c, ROLE_CAT[role], w, 'cash');
    }
    const loc = g.macro.cpi * fxOf(g, o.city);
    res.rent = headcount(o) * def.seatRent * 1000 * city.rent * loc;
    res.facility = o.cap * def.fixedPerCap * 1000 * (0.4 + 0.6 * city.rent) * loc;
    B.expense(c, 'ga', res.rent, 'ap');
    B.expense(c, 'cogs', res.facility, 'ap');
    B.expense(c, 'sm', res.marketing, 'ap');
    const ppl = stepPeople(g, o, growing);
    Object.assign(res, { hiring: ppl.hiring, training: ppl.training, attrRate: ppl.rate, quits: ppl.quits, hires: ppl.hires, moraleTarget: ppl.moraleTarget, moraleParts: ppl.moraleParts });
    apSpend += res.rent + res.facility + res.marketing + ppl.hiring + ppl.training;
    // depreciation on finished plant only
    const cip = o.building.reduce((s, b) => s + b.cost, 0);
    const dep = Math.max(0, Math.min((o.ppe - cip) / def.deprQ, o.ppe - cip - o.accDep));
    B.depreciate(c, dep, o);

    res.unitCost = res.sold > 0 ? (res.materials + res.wages.ops + res.facility) / res.sold : 0;
    res.contribution = res.revenue - res.materials - wages - res.rent - res.facility - res.marketing - res.hiring - res.training;
    revenue += res.revenue;
    arTarget += (res.revenue * def.dso * slow) / 90;
    defTarget += res.revenue * def.deferred;
    dpoW += res.revenue * def.dpo;
    const lp = local.get(city.country) ?? { rev: 0, pre: 0, taxW: 0 };
    local.set(city.country, { rev: lp.rev + res.revenue, pre: lp.pre + res.contribution - dep, taxW: lp.taxW + res.revenue * city.tax });
    const bi = (byInd[o.ind] ??= { rev: 0, contrib: 0 });
    bi.rev += res.revenue;
    bi.contrib += res.contribution;
    o.hist.push({ rev: res.revenue, contrib: res.contribution, share: o.share, mkt: res.market * localPrice(g, o.city, o.ind), px: priceIndex(g, o) });
    if (o.hist.length > 24) o.hist.shift();
    // an infrastructure fund that owns part of the plant takes its share of what the plant earns after its own loan
    if (o.minority) {
      const dist = o.minority * Math.max(0, res.contribution - plantDebtService(g, o));
      if (dist > 0) B.dividend(c, dist);
    }
    // regional partner takes a cut of sales
    const partner = c.policy[city.region].partner;
    if (partner && partner.until >= g.turn && partner.fee > 0) {
      B.expense(c, 'sm', res.revenue * partner.fee, 'ap');
      apSpend += res.revenue * partner.fee;
    }
  }

  // ── corporate costs
  // Head-office cost: a small fixed part that grows with the organisation, plus a share of revenue; listing adds compliance.
  const overhead = 25_000 * g.macro.cpi * clamp(companyHeadcount(c) / 50, 0.2, 1) + 0.012 * revenue + (c.cap.isPublic ? 350_000 * g.macro.cpi + 0.003 * revenue : 0);
  B.expense(c, 'ga', overhead, 'ap');
  apSpend += overhead;
  for (const p of c.people) B.expense(c, 'ga', p.salary * g.macro.wageIdx, 'cash');
  for (const k of c.divisions) {
    const b = c.rdBudget[k] ?? 0;
    B.expense(c, 'rd', b, 'ap');
    apSpend += b;
  }
  apSpend += stepInvestments(g);

  // ── revenue, collections, payables
  B.bill(c, revenue, defTarget - c.books.deferred);
  if (g.macro.gap < -1.5) B.writeOffAR(c, c.books.ar * clamp(0.003 * (-g.macro.gap - 1), 0, 0.02));
  // a factor buys most invoices as they are billed: receivables fall, for a fee
  const arKeep = c.factoring ? arTarget * (1 - FACTOR_SHARE) : arTarget;
  B.collect(c, Math.max(0, c.books.ar - arKeep));
  if (c.factoring) B.interest(c, FACTOR_FEE * FACTOR_SHARE * revenue);
  const dpo = revenue > 0 ? dpoW / revenue : INDUSTRIES[c.primary].dpo;
  B.payAP(c, Math.max(0, c.books.ap - (apSpend * dpo) / 90));

  // ── financing costs and tax
  serviceDebt(g);
  const p = c.pnl;
  const pretax = p.revenue - p.cogs - p.sm - p.rd - p.ga - p.other - p.da - p.interest + p.gains;
  payTaxes(g, pretax, local);
  if (c.cap.dividend > 0 && c.books.cash > c.cap.dividend) B.dividend(c, c.cap.dividend);

  // ── liquidity
  if (c.books.cash < 0 && c.autoRevolver) {
    const rv = c.loans.find((l) => l.kind === 'revolver');
    if (rv) {
      const draw = Math.min(rv.limit - rv.principal, -c.books.cash * 1.1 + 20_000);
      if (draw > 0) {
        rv.principal += draw;
        B.borrow(c, draw);
        news(g, `Cash ran short; ${money(draw)} was drawn automatically on the credit line.`, 'bad');
      }
    }
  }
  if (c.books.cash < 0) {
    c.negCashTurns++;
    B.interest(c, -c.books.cash * 0.05); // unauthorised overdraft
  } else c.negCashTurns = 0;

  // ── close the books
  const q = B.closeQuarter(c, g.turn, c.open, { headcount: companyHeadcount(c), byInd });
  c.quarters.push(q);
  if (c.quarters.length > 40) c.quarters.shift();
  c.open = { ...c.books };

  c.intel = Math.min(1, invSum(g, 'intel'));
  stepTargets(g);
  stepTech(g);
  stepBrand(g);
  stepCulture(g, prevHead);
  revalue(g);
  stepIPO(g);
  rivalsFinancials(g);
  rivalLifeEvents(g);

  const cov = covenantStatus(g);
  for (const br of cov.breaches) {
    br.loan.breaches++;
    if (!(EVENT['covenant_breach'] && queueEvent(g, 'covenant_breach', { loan: br.loan.id, note: br.kind }))) {
      B.expense(c, 'other', br.loan.principal * 0.01, 'cash');
      br.loan.spread += 1;
      br.loan.fixedRate += 1;
      br.loan.waivedUntil = g.turn + 2;
      news(g, `Covenant breach on ${br.loan.name}. The lender charged a waiver fee and raised the rate by a point.`, 'bad');
    }
  }
  if (c.negCashTurns === 1 && EVENT['liquidity_crisis']) queueEvent(g, 'liquidity_crisis', {});

  for (const p of stepKeyPeople(g)) {
    if (!(EVENT['key_resignation'] && queueEvent(g, 'key_resignation', { person: p.id, office: p.office }))) personLeaves(g, p);
  }

  trackAttribution(g);
  g.history.push({
    turn: g.turn, revenue: q.pnl.revenue, ebitda: q.ebitda, ni: q.ni, cash: c.books.cash, debt: c.books.debt, valuation: c.valuation,
    share: globalShare(g, c.primary), headcount: q.headcount,
    morale: c.offices.length ? c.offices.reduce((s, o) => s + o.morale * headcount(o), 0) / Math.max(1, q.headcount) : 0,
    gap: g.macro.gap, rate: g.macro.rate, rivals: g.rivals.map((r) => (r.alive ? r.valuation : 0)),
  });

  const prevRev = prevQ?.pnl.revenue ?? 0;
  g.report = {
    turn: g.turn, headline: `${turnLabel(g.turn)} results`, revenue: q.pnl.revenue, prevRevenue: prevRev, ni: q.ni,
    cashDelta: c.books.cash - cashStart, cash: c.books.cash, valuation: c.valuation, prevValuation: prevVal, bullets: [],
  };
  g.advisor = advise(g);
  checkEnd(g);

  // ── roll into the next quarter
  g.turn++;
  g.mods = g.mods.filter((m) => m.until >= g.turn);
  if (g.status === 'playing' || g.continued) {
    refreshLoanOffers(g);
    refreshEquityOffer(g);
    if (g.turn % 4 === 0 || !g.candidates.length) refreshCandidates(g);
    drawEvents(g);
    const done = autoDelegate(g);
    if (done.length) g.report.delegated = done.map((r) => ({ title: r.title, choice: r.choice, text: r.text }));
  }
}
