// Corporate finance: valuation, credit rating, debt and covenants, equity rounds, IPO, share price.
import * as B from './books';
import { CITY, FOUNDER, INDUSTRIES, INV, NAMES } from './content';
import { news, tempMod } from './mods';
import { DIFF } from './newgame';
import { companyHeadcount, exec, execBonus } from './people';
import type { ActionResult, Company, EquityOffer, GameState, IndustryId, Loan, LoanOffer } from './types';
import { clamp, money, nextUid, normal, pick, randRange } from './util';

const RATINGS: [number, string, number, number][] = [
  // min score, label, spread (pts), max leverage a lender will underwrite
  [88, 'AAA', 0.6, 4.5], [78, 'AA', 0.9, 4.0], [68, 'A', 1.3, 3.6], [58, 'BBB', 2.0, 3.2], [46, 'BB', 3.5, 3.0], [34, 'B', 5.5, 2.5], [-999, 'CCC', 9.0, 1.2],
];
export const ratingRow = (score: number) => RATINGS.find((r) => score >= r[0])!;

export function creditRating(g: GameState): { score: number; rating: string; spread: number; maxLev: number; parts: Record<string, number> } {
  const c = g.company;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const ebitda = B.ttm(c, (q) => q.ebitda);
  const int = B.ttm(c, (q) => q.pnl.interest);
  const debt = c.books.debt;
  const lev = debt <= 0 ? 0 : ebitda > 0 ? debt / ebitda : 9;
  const cov = int > 0 ? ebitda / int : 20;
  const parts: Record<string, number> = {
    Base: 50,
    Size: clamp(Math.log10(Math.max(rev, 1e5) / 1e6) * 10, -10, 30),
    Profitability: rev > 0 ? clamp((ebitda / rev) * 60, -20, 20) : -15,
    Leverage: -Math.min(40, lev * 7),
    'Interest cover': clamp((cov - 2) * 2, -10, 12),
    Liquidity: clamp((c.books.cash / Math.max(1, rev / 4)) * 4, -6, 8),
    'Track record': -6 * c.loans.reduce((s, l) => s + l.breaches, 0),
    CFO: execBonus(c, 'CFO') * 10,
  };
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const row = ratingRow(score);
  return { score, rating: row[1], spread: row[2], maxLev: row[3], parts };
}

export const loanRate = (g: GameState, l: Loan | LoanOffer) => (l.floating ? g.macro.rate + l.spread : l.fixedRate);

/** Pay interest and scheduled principal on every loan. */
export function serviceDebt(g: GameState): { interest: number; principal: number } {
  const c = g.company;
  let int = 0, princ = 0;
  for (const l of c.loans) {
    const i = (l.principal * loanRate(g, l)) / 400 + (l.kind === 'revolver' ? ((l.limit - l.principal) * 0.5) / 400 : 0);
    B.interest(c, i);
    int += i;
    let pay = Math.min(l.principal, l.amort);
    if (g.turn >= l.maturity && l.kind !== 'revolver') pay = l.principal;
    if (pay > 0) {
      B.repay(c, pay);
      l.principal -= pay;
      princ += pay;
      if (g.turn >= l.maturity) news(g, `${l.name} matured: ${money(pay)} repaid.`, 'info');
    }
    if (l.kind === 'revolver' && g.turn >= l.maturity) l.maturity += 12; // revolvers are renewed
  }
  c.loans = c.loans.filter((l) => l.principal > 1 || l.kind === 'revolver');
  // Idle cash earns a little; an overdraft costs a lot.
  if (c.books.cash > 0) B.interest(c, (-c.books.cash * Math.max(0, g.macro.rate - 1)) / 400);
  return { interest: int, principal: princ };
}

export interface CovenantBreach { loan: Loan; kind: 'leverage' | 'coverage' | 'cash'; value: number; limit: number }
export function covenantStatus(g: GameState): { lev: number; cov: number; breaches: CovenantBreach[] } {
  const c = g.company;
  const ebitda = B.ttm(c, (q) => q.ebitda);
  const int = B.ttm(c, (q) => q.pnl.interest);
  const lev = c.books.debt <= 0 ? 0 : ebitda > 0 ? c.books.debt / ebitda : 99;
  const cov = int > 0 ? ebitda / int : 99;
  const breaches: CovenantBreach[] = [];
  if (c.quarters.length >= 2) {
    for (const l of c.loans) {
      if (l.waivedUntil >= g.turn || l.principal <= 0) continue;
      if (l.maxLeverage && lev > l.maxLeverage) breaches.push({ loan: l, kind: 'leverage', value: lev, limit: l.maxLeverage });
      else if (l.minCoverage && cov < l.minCoverage) breaches.push({ loan: l, kind: 'coverage', value: cov, limit: l.minCoverage });
      else if (l.minCash && c.books.cash < l.minCash) breaches.push({ loan: l, kind: 'cash', value: c.books.cash, limit: l.minCash });
    }
  }
  return { lev, cov, breaches };
}

export function refreshLoanOffers(g: GameState) {
  const c = g.company;
  const r = creditRating(g);
  c.rating = r.rating;
  c.ratingScore = r.score;
  const spread = Math.max(0.4, r.spread + g.macro.spread * 0.5 + FOUNDER[c.founder].loanSpread + DIFF[g.difficulty].spread - execBonus(c, 'CFO'));
  const ebitda = Math.max(0, B.ttm(c, (q) => q.ebitda));
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const b = c.books;
  const netPpe = b.ppe - b.accDep;
  const bank = () => pick(g, NAMES.banks);
  const offers: LoanOffer[] = [];
  const id = () => 'lo' + nextUid(g);
  const tight = g.macro.phase === 'recession' ? 0.6 : 1;

  if (!c.loans.some((l) => l.kind === 'revolver')) {
    const limit = (0.7 * b.ar + 0.4 * b.inventory + 0.3 * ebitda) * tight;
    if (limit > 100_000) offers.push({ id: id(), kind: 'revolver', name: `${bank()} revolving credit line`, max: limit, spread: spread + 0.3, fixedRate: 0, floating: true, term: 12, amortizing: false, minCoverage: 1.5,
      note: 'Draw and repay as needed. Sized on your receivables and inventory. A 0.5% fee applies to the unused part.' });
  }
  const cashFlowCap = Math.max(0, r.maxLev * ebitda - b.debt) * tight;
  if (cashFlowCap > 200_000) offers.push({ id: id(), kind: 'term', name: `${bank()} term loan`, max: cashFlowCap, spread, fixedRate: 0, floating: true, term: 20, amortizing: true,
    maxLeverage: Math.round((r.maxLev + 1) * 10) / 10, minCoverage: r.score >= 58 ? 2.5 : 1.8,
    note: 'Floating rate, repaid in equal instalments over five years. Covenants are tested every quarter.' });
  const assetCap = Math.max(0, 0.6 * netPpe - b.debt) * tight;
  if (assetCap > 200_000) offers.push({ id: id(), kind: 'equipment', name: `${bank()} asset-backed loan`, max: assetCap, spread: spread + 0.6, fixedRate: Math.round((g.macro.rate + spread + 1.2) * 20) / 20, floating: false, term: 28, amortizing: true,
    minCash: Math.round(assetCap * 0.03), note: 'Fixed rate, secured on plant and equipment. No leverage covenant, but you must keep a minimum cash balance.' });
  if (r.score >= 46 && rev > 60e6 * g.macro.cpi) offers.push({ id: id(), kind: 'bond', name: 'Seven-year corporate bond', max: Math.max(0, 2.5 * ebitda - 0.5 * b.debt), spread, fixedRate: Math.round((g.macro.rate + spread + 0.6) * 20) / 20, floating: false, term: 28, amortizing: false,
    maxLeverage: r.maxLev + 1.5, note: 'Fixed coupon, nothing repaid until maturity — then all of it at once. Refinancing risk is yours.' });
  if (c.cap.holders.length > 0 && !c.cap.isPublic && ebitda <= 0 && c.cap.lastPost > 0) offers.push({ id: id(), kind: 'venture', name: 'Venture debt facility', max: 0.25 * c.cap.lastPost * 0.2 + 250_000, spread: 0, fixedRate: Math.round((g.macro.rate + 8.5) * 2) / 2, floating: false, term: 12, amortizing: true, warrants: 1,
    minCash: 150_000, note: 'For companies with investors but no profits. Expensive, short, and the lender takes warrants (1% dilution).' });
  offers.push({ id: id(), kind: 'distressed', name: 'Specialty lender bridge loan', max: Math.max(200_000, 0.3 * rev + 0.25 * netPpe), spread: 0, fixedRate: Math.round((g.macro.rate + 13 + g.macro.spread) * 2) / 2, floating: false, term: 8, amortizing: true,
    note: 'Fast money at a punishing rate, repaid within two years. A last resort, not a plan.' });
  g.loanOffers = offers.filter((o) => o.max > 50_000);
}

export function takeLoan(g: GameState, offerId: string, amount: number): ActionResult {
  const c = g.company;
  const o = g.loanOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: 'That offer has expired.' };
  amount = Math.min(amount, o.max);
  if (amount < 10_000) return { ok: false, msg: 'Amount too small.' };
  const drawn = o.kind === 'revolver' ? 0 : amount;
  const loan: Loan = {
    id: 'ln' + nextUid(g), kind: o.kind, name: o.name, principal: drawn, limit: o.kind === 'revolver' ? amount : 0, spread: o.spread, fixedRate: o.fixedRate, floating: o.floating,
    start: g.turn, maturity: g.turn + o.term, amort: o.amortizing ? drawn / o.term : 0, maxLeverage: o.maxLeverage, minCoverage: o.minCoverage, minCash: o.minCash, breaches: 0, waivedUntil: g.turn + 1,
  };
  c.loans.push(loan);
  if (drawn > 0) B.borrow(c, drawn);
  B.expense(c, 'other', amount * 0.01, 'cash'); // arrangement fee
  if (o.warrants) dilute(g, o.warrants, 'Lender warrants');
  g.loanOffers = g.loanOffers.filter((x) => x.id !== offerId);
  return { ok: true, msg: o.kind === 'revolver' ? `Credit line of ${money(amount)} opened. Draw on it when you need cash.` : `Borrowed ${money(amount)} at ${loanRate(g, loan).toFixed(2)}%.` };
}

export function drawRevolver(g: GameState, amount: number): ActionResult {
  const l = g.company.loans.find((x) => x.kind === 'revolver');
  if (!l) return { ok: false, msg: 'No credit line.' };
  amount = Math.min(amount, l.limit - l.principal);
  if (amount <= 0) return { ok: false, msg: 'The line is fully drawn.' };
  l.principal += amount;
  B.borrow(g.company, amount);
  return { ok: true, msg: `Drew ${money(amount)} on the credit line.` };
}

export function repayLoan(g: GameState, loanId: string, amount: number): ActionResult {
  const c = g.company;
  const l = c.loans.find((x) => x.id === loanId);
  if (!l) return { ok: false, msg: 'Loan not found.' };
  amount = Math.min(amount, l.principal, Math.max(0, c.books.cash));
  if (amount <= 0) return { ok: false, msg: 'Nothing to repay, or no cash.' };
  const fee = l.kind === 'bond' ? amount * 0.02 : 0;
  B.repay(c, amount);
  if (fee) B.expense(c, 'other', fee, 'cash');
  l.principal -= amount;
  if (l.amort > 0) l.amort = l.principal / Math.max(1, l.maturity - g.turn);
  if (l.principal <= 1 && l.kind !== 'revolver') c.loans = c.loans.filter((x) => x !== l);
  return { ok: true, msg: `Repaid ${money(amount)}${fee ? ` (plus ${money(fee)} early-redemption premium)` : ''}.` };
}

// ───────────────────────── valuation ─────────────────────────

/** Revenue mix by industry for the latest quarter (falls back to the primary industry). */
function revenueMix(c: Company): Partial<Record<IndustryId, number>> {
  const last = c.quarters[c.quarters.length - 1];
  const out: Partial<Record<IndustryId, number>> = {};
  let tot = 0;
  if (last) for (const [k, v] of Object.entries(last.byInd)) tot += v!.rev;
  if (tot <= 0) return { [c.primary]: 1 };
  for (const [k, v] of Object.entries(last!.byInd)) out[k as IndustryId] = v!.rev / tot;
  return out;
}

export function revenueGrowth(c: Company): number {
  const qs = c.quarters;
  if (qs.length < 5) {
    if (qs.length < 2) return 0.3;
    const a = qs[0].pnl.revenue, b = qs[qs.length - 1].pnl.revenue;
    return a > 0 ? clamp((b / a) ** (4 / (qs.length - 1)) - 1, -0.5, 2) : 0.3;
  }
  const last = qs.slice(-4).reduce((s, q) => s + q.pnl.revenue, 0);
  const prevQ = qs.slice(-8, -4);
  const prev = (prevQ.reduce((s, q) => s + q.pnl.revenue, 0) * 4) / prevQ.length;
  return prev > 0 ? clamp(last / prev - 1, -0.5, 2) : 0.3;
}

/** Risk-adjusted value of staged R&D still in progress (mostly matters for biotech). */
export function pipelineValue(g: GameState): number {
  let v = 0;
  for (const inv of g.company.investments) {
    const def = INV[inv.def];
    if (!def?.stages || inv.state !== 'ramp') continue;
    let p = 1;
    for (let i = inv.stage; i < def.stages.length; i++) p *= def.stages[i].p;
    v += p * inv.upfront * 14 * g.macro.sentiment;
  }
  return v;
}

/** Transparent multiples-based valuation. Returns equity value and every factor that went into it. */
export function valuation(g: GameState): { equity: number; parts: Record<string, number> } {
  const c = g.company;
  const b = c.books;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const ebitda = B.ttm(c, (q) => q.ebitda);
  const growth = revenueGrowth(c);
  const margin = rev > 0 ? ebitda / rev : -1;
  const mix = revenueMix(c);
  let mult = 0, target = 0;
  for (const [k, w] of Object.entries(mix)) {
    mult += w! * INDUSTRIES[k as IndustryId].revMult;
    target += w! * INDUSTRIES[k as IndustryId].targetMargin;
  }
  const growthF = clamp(1 + 1.6 * (growth - 0.1), 0.4, 3.2);
  const marginF = clamp(1 + 2 * (margin - target), 0.35, 1.8);
  const qualityF = (1 + ((c.tech[c.primary] ?? 40) - 50) / 250) * (1 + (c.brand - 30) / 300) * (0.9 + (0.2 * c.reputation) / 100);
  const sentiment = g.macro.sentiment * tempMod(g, 'valuation') * (c.cap.isPublic ? 1 : FOUNDER[c.founder].valuation);
  const ops = rev * mult * growthF * marginF * qualityF * sentiment;
  const pipeline = pipelineValue(g);
  const promise = 2.2e6 * g.macro.cpi * sentiment * (1 + companyHeadcount(c) / 40) * Math.exp(-g.turn / 24);
  const assets = 0.5 * (b.ppe - b.accDep) + 0.6 * b.ar + 0.4 * b.inventory;
  const ev = Math.max(ops + pipeline, promise, assets);
  const equity = Math.max(0, ev + b.cash + b.securities - b.debt);
  return {
    equity,
    parts: { rev, mult, growth, growthF, margin, target, marginF, qualityF, sentiment, ops, pipeline, promise, assets, ev, cash: b.cash + b.securities, debt: b.debt },
  };
}

export const founderStake = (c: Company) => c.cap.founder / c.cap.shares;

/** Update valuation and (if listed) the share price. Called once per quarter after the books close. */
export function revalue(g: GameState) {
  const c = g.company;
  const v = valuation(g);
  c.valParts = v.parts;
  const cap = c.cap;
  if (cap.isPublic) {
    const intrinsic = v.equity / cap.shares;
    const last = c.quarters[c.quarters.length - 1];
    const eps = last ? last.ni / cap.shares : 0;
    const surprise = clamp((eps - cap.expectedEps) / Math.max(Math.abs(cap.expectedEps), intrinsic * 0.01, 1e-9), -0.3, 0.3);
    cap.premium = clamp(cap.premium + 0.3 * (1 - cap.premium) + 0.6 * surprise + normal(g, 0, 0.04), 0.5, 1.8);
    cap.price = intrinsic * cap.premium;
    cap.expectedEps = 0.6 * cap.expectedEps + 0.4 * eps * 1.03;
    c.valParts.premium = cap.premium;
    c.valParts.surprise = surprise;
    c.valuation = cap.price * cap.shares;
  } else {
    // Private companies trade at a discount for illiquidity — on the business, not on the cash in the bank.
    const net = v.parts.cash - v.parts.debt;
    c.valParts.discount = 0.8;
    c.valuation = Math.max(0, 0.8 * (v.equity - net) + net);
    cap.price = c.valuation / cap.shares;
  }
}

// ───────────────────────── equity ─────────────────────────

export function dilute(g: GameState, pctNew: number, holder: string) {
  const cap = g.company.cap;
  const n = (cap.shares * pctNew) / 100;
  cap.shares += n;
  cap.holders.push({ name: holder, shares: n, round: 'grant', price: 0 });
}

const ROUNDS = ['Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Growth round', 'Late-stage round'];

export function refreshEquityOffer(g: GameState) {
  const c = g.company;
  const cap = c.cap;
  g.equityOffer = undefined;
  if (cap.isPublic || cap.ipoStage > 0) return;
  if (g.turn - cap.lastRoundTurn < 3 && cap.rounds > 0) return;
  const s = g.macro.sentiment;
  const growth = revenueGrowth(c);
  const last = c.quarters[c.quarters.length - 1];
  const costs = last ? Math.max(1, last.pnl.revenue - last.ebitda) : 1;
  const runway = c.books.cash / costs;
  // Investors need a story — growth, a pipeline, or a young company with promise — and a reason you need the money.
  const appetite = DIFF[g.difficulty].appetite + (s - 0.8) * 1.5 + clamp(growth - 0.1, -0.4, 1) * 1.1 + (g.turn < 8 ? 0.5 : 0) + (pipelineValue(g) > 0 ? 0.35 : 0) - (runway > 12 ? 0.6 : runway > 8 ? 0.25 : 0);
  if (appetite < 0.2) return;
  const enthusiasm = clamp(randRange(g, 0.85, 1.12) * (0.9 + 0.15 * Math.min(1, appetite)), 0.7, 1.25);
  // They price the business and take the cash at face value.
  const net = c.books.cash + c.books.securities - c.books.debt;
  const pre = Math.max(400_000, (c.valuation - net) * enthusiasm + net);
  const down = cap.lastPost > 0 && pre < cap.lastPost * 0.9;
  g.equityOffer = {
    round: ROUNDS[Math.min(cap.rounds, ROUNDS.length - 1)], investor: pick(g, NAMES.investors), pre, maxPct: s < 0.9 ? 0.3 : 0.25,
    note: down ? 'This would be a down round: a lower valuation than your last raise. Expect unhappy employees and earlier investors.' : s < 0.9 ? 'Capital is scarce right now; investors want a bigger stake.' : 'Standard terms. One board seat.',
  };
}

export function raiseEquity(g: GameState, pct: number): ActionResult {
  const c = g.company;
  const cap = c.cap;
  const of = g.equityOffer;
  if (!of) return { ok: false, msg: 'No investors at the table this quarter.' };
  pct = clamp(pct, 0.02, of.maxPct);
  const price = of.pre / cap.shares;
  const newShares = (cap.shares * pct) / (1 - pct);
  const gross = newShares * price;
  B.issueEquity(c, gross * 0.96);
  const down = cap.lastPost > 0 && of.pre < cap.lastPost * 0.9;
  cap.shares += newShares;
  cap.holders.push({ name: of.investor, shares: newShares, round: of.round, price });
  cap.lastRoundTurn = g.turn;
  cap.lastPost = of.pre + gross;
  cap.rounds++;
  cap.price = price;
  cap.boardPressure = Math.min(10, cap.boardPressure + 1);
  if (down) {
    for (const o of c.offices) o.morale = clamp(o.morale - 6, 0, 100);
    c.reputation = clamp(c.reputation - 3, 0, 100);
  }
  g.equityOffer = undefined;
  g.counters.equityRaised = (g.counters.equityRaised ?? 0) + gross;
  news(g, `${c.name} closed its ${of.round}: ${money(gross)} from ${of.investor} at a ${money(of.pre)} pre-money valuation.`, down ? 'bad' : 'good');
  return { ok: true, msg: `Raised ${money(gross * 0.96)} net. You now own ${(founderStake(c) * 100).toFixed(1)}%.` };
}

const IPO_MIN_REV = { easy: 25e6, normal: 40e6, hard: 60e6, brutal: 80e6 } as const;

export function ipoChecklist(g: GameState): { ok: boolean; items: { label: string; ok: boolean; tip: string }[] } {
  const c = g.company;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  const min = IPO_MIN_REV[g.difficulty] * g.macro.cpi;
  const items = [
    { label: `Revenue of at least ${money(min)} a year`, ok: rev >= min, tip: 'Public investors want scale. Smaller listings get no analyst coverage and trade poorly.' },
    { label: 'Two years of quarterly accounts', ok: c.quarters.length >= 8 || g.turn >= 8, tip: 'Regulators require audited history.' },
    { label: 'A Chief Financial Officer', ok: !!exec(c, 'CFO'), tip: 'Nobody will underwrite a listing without a CFO to sign the accounts.' },
    { label: 'Reputation of 40 or better', ok: c.reputation >= 40, tip: 'Underwriters will not attach their name to a company with a bad one.' },
    { label: 'An open IPO window (market sentiment ≥ 0.85)', ok: g.macro.sentiment >= 0.85, tip: 'In bear markets, new listings simply do not get done.' },
    { label: 'No covenant breaches outstanding', ok: covenantStatus(g).breaches.length === 0, tip: 'A company in default cannot list.' },
  ];
  return { ok: items.every((i) => i.ok) && !c.cap.isPublic && c.cap.ipoStage === 0, items };
}

export function startIPO(g: GameState): ActionResult {
  const c = g.company;
  if (!ipoChecklist(g).ok) return { ok: false, msg: 'Not ready to list yet.' };
  c.cap.ipoStage = 1;
  B.expense(c, 'other', 1.5e6 * g.macro.cpi, 'cash');
  news(g, `${c.name} has filed to go public.`, 'good');
  return { ok: true, msg: 'Filed. The roadshow happens next quarter and shares price the quarter after — if the window stays open.' };
}

/** Advance an IPO in progress. Called each quarter after revaluation. */
export function stepIPO(g: GameState) {
  const c = g.company;
  const cap = c.cap;
  if (cap.ipoStage === 0) return;
  if (g.macro.sentiment < 0.72) {
    cap.ipoStage = 0;
    news(g, `Markets have turned. ${c.name} has pulled its IPO; the fees already paid are gone.`, 'bad');
    return;
  }
  if (cap.ipoStage === 1) {
    cap.ipoStage = 2;
    news(g, `${c.name}'s IPO roadshow is under way.`, 'info');
    return;
  }
  const v = valuation(g);
  const price = (v.equity / cap.shares) * 0.88; // the IPO discount
  const newShares = (cap.shares * 0.18) / 0.82;
  const gross = newShares * price;
  B.issueEquity(c, gross * 0.93);
  cap.shares += newShares;
  cap.holders.push({ name: 'Public shareholders', shares: newShares, round: 'IPO', price });
  cap.isPublic = true;
  cap.ipoTurn = g.turn;
  cap.ipoStage = 0;
  cap.premium = 1;
  cap.price = price / 0.88;
  cap.lastPost = cap.price * cap.shares;
  const last = c.quarters[c.quarters.length - 1];
  cap.expectedEps = last ? last.ni / cap.shares : 0;
  c.valuation = cap.price * cap.shares;
  g.counters.equityRaised = (g.counters.equityRaised ?? 0) + gross;
  news(g, `${c.name} is now a public company. Shares priced at $${price.toFixed(2)} and closed the first day at $${cap.price.toFixed(2)}. ${money(gross * 0.93)} raised after fees.`, 'good');
}

export function followOn(g: GameState, pct: number): ActionResult {
  const c = g.company;
  const cap = c.cap;
  if (!cap.isPublic) return { ok: false, msg: 'Only listed companies can sell shares to the public.' };
  if (g.turn - cap.lastRoundTurn < 2) return { ok: false, msg: 'Investors need a couple of quarters between offerings.' };
  pct = clamp(pct, 0.02, 0.2);
  const price = cap.price * 0.94;
  const n = (cap.shares * pct) / (1 - pct);
  B.issueEquity(c, n * price * 0.96);
  cap.shares += n;
  cap.holders.push({ name: 'Public shareholders', shares: n, round: 'Follow-on', price });
  cap.lastRoundTurn = g.turn;
  cap.premium = clamp(cap.premium * (1 - pct * 0.6), 0.5, 1.8); // the market reads new supply as a signal
  return { ok: true, msg: `Sold ${(pct * 100).toFixed(0)}% new shares at $${price.toFixed(2)} and raised ${money(n * price * 0.96)}.` };
}

export function buyBack(g: GameState, amount: number): ActionResult {
  const c = g.company;
  const cap = c.cap;
  if (!cap.isPublic) return { ok: false, msg: 'Buybacks need a public market for your shares.' };
  amount = Math.min(amount, c.books.cash * 0.8);
  const outside = cap.shares - cap.founder;
  const n = Math.min(amount / (cap.price * 1.03), outside * 0.5);
  if (n <= 0 || amount < 10_000) return { ok: false, msg: 'Not enough cash for a buyback.' };
  B.buyback(c, n * cap.price * 1.03);
  cap.shares -= n;
  const pub = cap.holders.filter((h) => h.name === 'Public shareholders');
  let left = n;
  for (const h of pub) {
    const d = Math.min(h.shares, left);
    h.shares -= d;
    left -= d;
  }
  return { ok: true, msg: `Bought back ${Math.round(n).toLocaleString()} shares. You now own ${(founderStake(c) * 100).toFixed(1)}%.` };
}

/** Company-wide effective tax rate: revenue-weighted across office cities. */
export function taxRate(g: GameState): number {
  const c = g.company;
  let w = 0, t = 0;
  for (const o of c.offices) {
    const r = o.last?.revenue ?? 0;
    w += r;
    t += r * CITY[o.city].tax;
  }
  return w > 0 ? t / w : CITY[c.home].tax;
}
