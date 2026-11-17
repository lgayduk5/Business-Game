// Corporate finance: valuation, credit rating, debt and covenants, equity rounds, IPO, share price.
import * as B from './books';
import { CITY, FOUNDER, INDUSTRIES, INV, NAMES } from './content';
import { invSum, news, tempMod } from './mods';
import { DIFF } from './difficulty';
import { companyHeadcount, exec, execBonus } from './people';
import type { ActionResult, CapTable, Company, GameState, IndustryId, Loan, LoanOffer } from './types';
import { clamp, money, nextUid, normal, pick, randRange } from './util';

const RATINGS: [number, string, number, number][] = [
  // min score, label, spread (pts), max leverage a lender will underwrite
  [88, 'AAA', 0.6, 4.5], [78, 'AA', 0.9, 4.0], [68, 'A', 1.3, 3.6], [58, 'BBB', 2.0, 3.2], [46, 'BB', 3.5, 3.0], [34, 'B', 5.5, 2.5], [-999, 'CCC', 9.0, 1.2],
];
export const ratingRow = (score: number) => RATINGS.find((r) => score >= r[0])!;

export interface CreditInputs { rev: number; ebitda: number; interest: number; debt: number; cash: number; breaches: number; cfo: number }
export interface Credit { score: number; rating: string; spread: number; maxLev: number; parts: Record<string, number> }

/** How lenders score any company — the player or a rival — from its last twelve months. */
export function scoreCredit(x: CreditInputs): Credit {
  const lev = x.debt <= 0 ? 0 : x.ebitda > 0 ? x.debt / x.ebitda : 9;
  const cov = x.interest > 0 ? x.ebitda / x.interest : 20;
  const parts: Record<string, number> = {
    Base: 50,
    Size: clamp(Math.log10(Math.max(x.rev, 1e5) / 1e6) * 10, -10, 30),
    Profitability: x.rev > 0 ? clamp((x.ebitda / x.rev) * 60, -20, 20) : -15,
    Leverage: -Math.min(40, lev * 7),
    'Interest cover': clamp((cov - 2) * 2, -10, 12),
    Liquidity: clamp((x.cash / Math.max(1, x.rev / 4)) * 4, -6, 8),
    'Track record': -6 * x.breaches,
    CFO: x.cfo * 10,
  };
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const row = ratingRow(score);
  return { score, rating: row[1], spread: row[2], maxLev: row[3], parts };
}

export function creditRating(g: GameState): Credit {
  const c = g.company;
  return scoreCredit({
    rev: B.ttm(c, (q) => q.pnl.revenue), ebitda: B.ttm(c, (q) => q.ebitda), interest: B.ttm(c, (q) => q.pnl.interest), debt: c.books.debt, cash: c.books.cash,
    breaches: c.loans.reduce((s, l) => s + l.breaches, 0), cfo: execBonus(c, 'CFO'),
  });
}

/** What lenders will advance against a borrowing base (receivables, stock, a little cash flow) and against cash flow itself. */
export function debtCapacity(g: GameState, x: { ar: number; inventory: number; ebitda: number; debt: number; maxLev: number }): { base: number; cashFlow: number } {
  const tight = g.macro.phase === 'recession' ? 0.6 : 1;
  const ebitda = Math.max(0, x.ebitda);
  return { base: (0.7 * x.ar + 0.4 * x.inventory + 0.3 * ebitda) * tight, cashFlow: Math.max(0, x.maxLev * ebitda - x.debt) * tight };
}

/** Investors' appetite for a private company's shares: market mood, a growth story, and whether it actually needs the money. */
export function equityAppetite(sentiment: number, story: number, runway: number): number {
  return (sentiment - 0.8) * 1.5 + clamp(story - 0.1, -0.4, 1) * 1.1 - (runway > 12 ? 0.6 : runway > 8 ? 0.25 : 0);
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
  const cap = debtCapacity(g, { ar: b.ar, inventory: b.inventory, ebitda, debt: b.debt, maxLev: r.maxLev });

  // A revolver is a borrowing-base facility: its limit follows receivables and inventory every quarter.
  const base = cap.base;
  const rv = c.loans.find((l) => l.kind === 'revolver');
  if (rv) rv.limit = Math.max(rv.principal, Math.min(base, rv.limit * 1.5 + 100_000));
  if (!rv) {
    const limit = base;
    if (limit > 100_000) offers.push({ id: id(), kind: 'revolver', name: `${bank()} revolving credit line`, max: limit, spread: spread + 0.3, fixedRate: 0, floating: true, term: 12, amortizing: false, minCoverage: 1.5,
      note: 'Draw and repay as needed. Sized on your receivables and inventory. A 0.5% fee applies to the unused part.' });
  }
  const cashFlowCap = cap.cashFlow;
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
  if (last) for (const v of Object.values(last.byInd)) tot += v!.rev;
  if (tot <= 0) return { [c.primary]: 1 };
  for (const [k, v] of Object.entries(last!.byInd)) out[k as IndustryId] = v!.rev / tot;
  return out;
}

/**
 * Year-on-year growth from a run of quarterly revenues. With two years of history: the last four quarters
 * against the four before. With less, the run is annualised from its first quarter to its last (comparing
 * a year against a single earlier quarter would understate it).
 */
export function growthOf(revs: number[]): number {
  if (revs.length < 8) {
    if (revs.length < 2) return 0.3;
    const a = revs[0], b = revs[revs.length - 1];
    return a > 0 ? clamp((b / a) ** (4 / (revs.length - 1)) - 1, -0.5, 2) : 0.3;
  }
  const last = revs.slice(-4).reduce((s, x) => s + x, 0);
  const prevQ = revs.slice(-8, -4);
  const prev = (prevQ.reduce((s, x) => s + x, 0) * 4) / prevQ.length;
  return prev > 0 ? clamp(last / prev - 1, -0.5, 2) : 0.3;
}
export const revenueGrowth = (c: Company): number => growthOf(c.quarters.map((q) => q.pnl.revenue));

/** Risk-adjusted value of staged R&D still in progress (mostly matters for biotech). */
export function pipelineValue(g: GameState): number {
  let v = 0;
  for (const inv of g.company.investments) {
    const def = INV[inv.def];
    if (!def?.stages || inv.state !== 'ramp') continue;
    let p = 1;
    for (let i = inv.stage; i < def.stages.length; i++) p *= def.stages[i].p;
    v += p * inv.upfront * 40 * g.macro.sentiment;
  }
  return v;
}

export interface ValueInputs {
  rev: number; // last twelve months
  ebitda: number; // last twelve months
  growth: number; // revenue growth, year on year
  mix: Partial<Record<IndustryId, number>>; // revenue weights by industry
  tech: number;
  brand: number;
  reputation: number;
  sentiment: number; // market mood (and anything else that scales every multiple)
  rate: number; // central-bank rate, %
  cash: number;
  debt: number;
  pipeline?: number; // risk-adjusted R&D still in progress
  promise?: number; // what a young company is worth on its story alone
  assets?: number; // what the assets would fetch
}

/**
 * Transparent multiples-based valuation, used for the player and every rival alike. Fast growers are
 * priced on revenue; as growth slows below about 25% a year investors increasingly price the profits
 * instead, with an EBITDA multiple that agrees with the revenue multiple for a company earning its
 * industry's typical margin. Higher interest rates lower every multiple.
 */
export function valueCompany(x: ValueInputs): { equity: number; parts: Record<string, number> } {
  let mult = 0, target = 0;
  for (const [k, w] of Object.entries(x.mix)) {
    mult += w! * INDUSTRIES[k as IndustryId].revMult;
    target += w! * INDUSTRIES[k as IndustryId].targetMargin;
  }
  const margin = x.rev > 0 ? x.ebitda / x.rev : -1;
  const growthF = clamp(1 + 1.6 * (x.growth - 0.1), 0.4, 3.2);
  const marginF = clamp(1 + 2 * (margin - target), 0.35, 1.8);
  const ebitdaMult = mult / Math.max(0.05, target);
  const byRev = x.rev * mult * growthF * marginF;
  const byEbitda = Math.max(0, x.ebitda) * ebitdaMult * growthF;
  const ebitdaW = clamp((0.25 - x.growth) / 0.25, 0, 0.8);
  const qualityF = (1 + (x.tech - 50) / 250) * (1 + (x.brand - 30) / 300) * (0.9 + (0.2 * x.reputation) / 100);
  const rateF = clamp(1 - 0.04 * (x.rate - 3), 0.75, 1.15);
  const ops = ((1 - ebitdaW) * byRev + ebitdaW * byEbitda) * qualityF * x.sentiment * rateF;
  const pipeline = x.pipeline ?? 0, promise = x.promise ?? 0, assets = x.assets ?? 0;
  const ev = Math.max(ops + pipeline, promise, assets);
  const equity = Math.max(0, ev + x.cash - x.debt);
  return {
    equity,
    parts: { rev: x.rev, ebitda: x.ebitda, mult, growth: x.growth, growthF, margin, target, marginF, byRev, byEbitda, ebitdaMult, ebitdaW, qualityF, sentiment: x.sentiment, rate: x.rate, rateF, ops, pipeline, promise, assets, ev, cash: x.cash, debt: x.debt },
  };
}

/** Private companies trade at a discount for illiquidity — on the business, not on the cash in the bank. */
export const PRIVATE_DISCOUNT = 0.8;
export const privateValue = (equity: number, cash: number, debt: number) => Math.max(0, PRIVATE_DISCOUNT * (equity - (cash - debt)) + (cash - debt));

/** The player's company, valued. Returns equity value and every factor that went into it. */
export function valuation(g: GameState): { equity: number; parts: Record<string, number> } {
  const c = g.company;
  const b = c.books;
  const sentiment = g.macro.sentiment * tempMod(g, 'valuation') * (c.cap.isPublic ? 1 : FOUNDER[c.founder].valuation);
  return valueCompany({
    rev: B.ttm(c, (q) => q.pnl.revenue), ebitda: B.ttm(c, (q) => q.ebitda), growth: revenueGrowth(c), mix: revenueMix(c),
    tech: c.tech[c.primary] ?? 40, brand: c.brand, reputation: c.reputation, sentiment, rate: g.macro.rate,
    cash: b.cash + b.securities, debt: b.debt, pipeline: pipelineValue(g),
    promise: 2.2e6 * g.macro.cpi * sentiment * (1 + companyHeadcount(c) / 40) * Math.exp(-g.turn / 24),
    assets: 0.5 * (b.ppe - b.accDep) + 0.6 * b.ar + 0.4 * b.inventory,
  });
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
    c.valParts.discount = PRIVATE_DISCOUNT;
    c.valuation = privateValue(v.equity, v.parts.cash, v.parts.debt);
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
  // a drug pipeline is a growth story in its own right
  const story = pipelineValue(g) > 0.3 * Math.max(1, c.valuation) ? Math.max(growth, 0.35) : growth;
  const appetite = DIFF[g.difficulty].appetite + equityAppetite(s, story, runway) + (g.turn < 8 ? 0.5 : 0) + (pipelineValue(g) > 0 ? 0.35 : 0);
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

export function ipoChecklist(g: GameState): { ok: boolean; items: { label: string; ok: boolean; tip: string }[] } {
  const c = g.company;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  // listing needs scale; what counts as scale depends on how the market values the industry
  const min = DIFF[g.difficulty].ipoMinRev * g.macro.cpi * Math.min(1, INDUSTRIES[c.primary].capTarget);
  const items = [
    { label: `Revenue of at least ${money(min)} a year`, ok: rev >= min, tip: 'Public investors want scale. Smaller listings get no analyst coverage and trade poorly.' },
    { label: 'Two years of quarterly accounts', ok: g.turn >= 8, tip: 'Regulators require audited history.' },
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
  const intrinsic = v.equity / cap.shares;
  // Bankers price below fair value so the deal clears; how far below, and how the first day trades, depends on the mood.
  const s = g.macro.sentiment;
  const discount = clamp(0.88 + 0.12 * (s - 1) + normal(g, 0, 0.03), 0.75, 0.97);
  const pop = clamp(normal(g, 0.1 + 0.4 * (s - 1), 0.12), -0.25, 0.8);
  const price = intrinsic * discount;
  const newShares = (cap.shares * 0.18) / 0.82;
  const gross = newShares * price;
  B.issueEquity(c, gross * 0.93);
  cap.shares += newShares;
  cap.holders.push({ name: 'Public shareholders', shares: newShares, round: 'IPO', price });
  cap.isPublic = true;
  cap.ipoTurn = g.turn;
  cap.ipoStage = 0;
  cap.premium = clamp(discount * (1 + pop), 0.5, 1.8);
  cap.price = intrinsic * cap.premium;
  cap.lastPost = cap.price * cap.shares;
  const last = c.quarters[c.quarters.length - 1];
  cap.expectedEps = last ? last.ni / cap.shares : 0;
  c.valuation = cap.price * cap.shares;
  g.counters.equityRaised = (g.counters.equityRaised ?? 0) + gross;
  news(g, `${c.name} is now a public company. Shares priced at $${price.toFixed(2)} and closed the first day at $${cap.price.toFixed(2)} (${pop >= 0 ? '+' : '−'}${Math.abs(pop * 100).toFixed(0)}%). ${money(gross * 0.93)} raised after fees.`, 'good');
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

/** Shares held outside the founder, from the cap table itself. */
export const outsideShares = (cap: CapTable) => cap.holders.reduce((s, h) => s + h.shares, 0);

/**
 * Retire shares bought back in the market. Sellers are the outside holders, pro rata (the founder does
 * not sell), and no more than half of all outside shares can be bought in one go. Keeps the cap table
 * adding up: founder + holders = shares. Returns the number of shares retired.
 */
export function retireShares(cap: CapTable, n: number): number {
  const outside = outsideShares(cap);
  n = Math.min(n, outside * 0.5);
  if (!(n > 0)) return 0;
  const f = n / outside;
  for (const h of cap.holders) h.shares -= h.shares * f;
  cap.shares -= n;
  return n;
}

export function buyBack(g: GameState, amount: number): ActionResult {
  const c = g.company;
  const cap = c.cap;
  if (!cap.isPublic) return { ok: false, msg: 'Buybacks need a public market for your shares.' };
  amount = Math.min(amount, c.books.cash * 0.8);
  const want = amount / (cap.price * 1.03);
  if (want <= 0 || amount < 10_000) return { ok: false, msg: 'Not enough cash for a buyback.' };
  const n = retireShares(cap, want);
  if (n <= 0) return { ok: false, msg: 'There are no outside shares left to buy.' };
  B.buyback(c, n * cap.price * 1.03);
  return { ok: true, msg: `Bought back ${Math.round(n).toLocaleString()} shares${n < want - 1 ? ' — as many as holders would sell' : ''}. You now own ${(founderStake(c) * 100).toFixed(1)}%.` };
}

/** Profit made locally in one country this quarter: office contribution less office depreciation. */
export interface LocalProfit { rev: number; pre: number; taxW: number }

/** Add tax losses to a country's pool (and the total shown on the books). */
export function addNol(c: Company, country: string, amt: number) {
  c.nolBy[country] = Math.max(0, (c.nolBy[country] ?? 0) + amt);
  c.nol = Object.values(c.nolBy).reduce((a, b) => a + b, 0);
}

/**
 * Corporate tax, country by country. Each country taxes what was earned there: its offices' own profit
 * plus a revenue-weighted share of head-office costs, R&D programmes, interest and one-offs. A loss in one
 * country is carried forward there and shelters nothing anywhere else (up to 80% of a later year's profit).
 */
export function countryTax(local: Map<string, LocalProfit>, pretax: number, nolBy: Record<string, number>, home: { country: string; rate: number }, adj = 1) {
  const rows = local.size ? [...local.entries()] : [[home.country, { rev: 0, pre: 0, taxW: 0 }] as [string, LocalProfit]];
  const totRev = rows.reduce((s, [, x]) => s + x.rev, 0);
  const central = pretax - rows.reduce((s, [, x]) => s + x.pre, 0);
  const nol = { ...nolBy };
  const by: Record<string, { pre: number; tax: number }> = {};
  let tax = 0;
  for (const [k, x] of rows) {
    const p = x.pre + central * (totRev > 0 ? x.rev / totRev : 1 / rows.length);
    const rate = x.rev > 0 ? x.taxW / x.rev : home.rate;
    let t = 0;
    if (p > 0) {
      const use = Math.min(nol[k] ?? 0, p * 0.8);
      nol[k] = (nol[k] ?? 0) - use;
      t = (p - use) * rate * adj;
    } else nol[k] = (nol[k] ?? 0) - p;
    tax += t;
    by[k] = { pre: p, tax: t };
  }
  for (const k of Object.keys(nol)) if (nol[k] < 1) delete nol[k];
  return { tax, nolBy: nol, by };
}

export function payTaxes(g: GameState, pretax: number, local: Map<string, LocalProfit>): number {
  const c = g.company;
  const t = countryTax(local, pretax, c.nolBy, { country: CITY[c.home].country, rate: CITY[c.home].tax }, Math.max(0.2, 1 + invSum(g, 'tax') / 100));
  c.nolBy = t.nolBy;
  c.nol = Object.values(t.nolBy).reduce((a, b) => a + b, 0);
  c.taxBy = t.by;
  if (t.tax > 0) B.tax(c, t.tax);
  return t.tax;
}
