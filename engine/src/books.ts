// Double-entry ledger. Every helper is a balanced posting, so the balance sheet ties
// by construction, and cash movements carry a tag so the cash-flow statement can be
// cross-checked (indirect CFO must equal the sum of operating cash movements).
import type { Books, CashFlow, Company, ExpCat, Office, PnL, Quarter } from './types';

export const emptyPnL = (): PnL => ({ revenue: 0, cogs: 0, sm: 0, rd: 0, ga: 0, other: 0, da: 0, interest: 0, gains: 0, tax: 0 });
export const emptyTags = (): Company['cfTags'] => ({ op: 0, inv: 0, fin: 0, capex: 0, acq: 0, disp: 0, sec: 0, debtIn: 0, debtOut: 0, eqIn: 0, buyback: 0, div: 0, noncash: 0 });
export const emptyBooks = (): Books => ({ cash: 0, ar: 0, inventory: 0, ppe: 0, accDep: 0, goodwill: 0, securities: 0, ap: 0, deferred: 0, debt: 0, paidIn: 0, retained: 0 });

type CashTag = 'op' | 'capex' | 'acq' | 'disp' | 'sec' | 'debtIn' | 'debtOut' | 'eqIn' | 'buyback' | 'div';
function cash(c: Company, amt: number, tag: CashTag) {
  c.books.cash += amt;
  c.cfTags[tag] += amt;
}

/** Operating expense, paid in cash now or put on account (accounts payable). */
export function expense(c: Company, cat: ExpCat, amt: number, pay: 'cash' | 'ap' = 'cash') {
  if (!amt) return;
  c.pnl[cat] += amt;
  if (pay === 'cash') cash(c, -amt, 'op');
  else c.books.ap += amt;
}
/** Stock-based pay: an expense in the accounts, paid in new shares rather than cash (added back in operating cash flow). */
export function stockComp(c: Company, cat: ExpCat, amt: number) {
  if (!amt) return;
  c.pnl[cat] += amt;
  c.books.paidIn += amt;
  c.cfTags.noncash += amt;
}
/** Recognise revenue. Billings can exceed revenue (customers prepaying) — the excess is deferred revenue. */
export function bill(c: Company, revenue: number, deferredDelta: number) {
  c.pnl.revenue += revenue;
  c.books.ar += revenue + deferredDelta;
  c.books.deferred += deferredDelta;
}
export function collect(c: Company, amt: number) {
  c.books.ar -= amt;
  cash(c, amt, 'op');
}
export function writeOffAR(c: Company, amt: number) {
  amt = Math.min(amt, c.books.ar);
  c.books.ar -= amt;
  c.pnl.other += amt;
  return amt;
}
export function payAP(c: Company, amt: number) {
  c.books.ap -= amt;
  cash(c, -amt, 'op');
}
export function buyInventory(c: Company, o: Office, amt: number) {
  c.books.inventory += amt;
  o.invValue += amt;
  c.books.ap += amt;
}
/** Inventory leaving the balance sheet into cost of goods sold (sold, spoiled or written off). */
export function useInventory(c: Company, o: Office, amt: number) {
  amt = Math.min(amt, o.invValue);
  c.books.inventory -= amt;
  o.invValue -= amt;
  c.pnl.cogs += amt;
}
export function capex(c: Company, amt: number, o?: Office) {
  c.books.ppe += amt;
  if (o) o.ppe += amt;
  cash(c, -amt, 'capex');
}
export function depreciate(c: Company, amt: number, o?: Office) {
  c.books.accDep += amt;
  if (o) o.accDep += amt;
  c.pnl.da += amt;
}
/** Non-cash write-down of an asset. */
export function impair(c: Company, acct: 'ppe' | 'goodwill' | 'securities', amt: number, o?: Office) {
  if (amt <= 0) return;
  if (acct === 'ppe') {
    amt = Math.min(amt, c.books.ppe - c.books.accDep);
    c.books.accDep += amt;
    if (o) o.accDep += amt;
  } else {
    amt = Math.min(amt, c.books[acct]);
    c.books[acct] -= amt;
  }
  c.pnl.gains -= amt;
  c.cfTags.noncash += amt;
}
/** Sell or scrap property: removes gross cost and accumulated depreciation, books the gain or loss. */
export function dispose(c: Company, gross: number, acc: number, proceeds: number, o?: Office) {
  c.books.ppe -= gross;
  c.books.accDep -= acc;
  if (o) {
    o.ppe -= gross;
    o.accDep -= acc;
  }
  cash(c, proceeds, 'disp');
  const gain = proceeds - (gross - acc);
  c.pnl.gains += gain;
  c.cfTags.noncash -= gain;
}
export function borrow(c: Company, amt: number) {
  c.books.debt += amt;
  cash(c, amt, 'debtIn');
}
export function repay(c: Company, amt: number) {
  c.books.debt -= amt;
  cash(c, -amt, 'debtOut');
}
export function interest(c: Company, amt: number) {
  c.pnl.interest += amt;
  cash(c, -amt, 'op');
}
export function tax(c: Company, amt: number) {
  c.pnl.tax += amt;
  cash(c, -amt, 'op');
}
export function issueEquity(c: Company, net: number) {
  c.books.paidIn += net;
  cash(c, net, 'eqIn');
}
export function buyback(c: Company, amt: number) {
  c.books.paidIn -= amt;
  cash(c, -amt, 'buyback');
}
export function dividend(c: Company, amt: number) {
  c.books.retained -= amt;
  cash(c, -amt, 'div');
}
/** One-off cash gain outside normal operations (grants, settlements won). */
export function windfall(c: Company, amt: number) {
  c.pnl.gains += amt;
  cash(c, amt, 'op');
}
export function buySecurities(c: Company, amt: number) {
  c.books.securities += amt;
  cash(c, -amt, 'sec');
}
export function sellSecurities(c: Company, book: number, proceeds: number) {
  book = Math.min(book, c.books.securities);
  c.books.securities -= book;
  cash(c, proceeds, 'sec');
  const gain = proceeds - book;
  c.pnl.gains += gain;
  c.cfTags.noncash -= gain;
}
/** Asset purchase: fair-value property plus goodwill for the premium. */
export function acquire(c: Company, price: number, fairPpe: number, o?: Office) {
  fairPpe = Math.min(fairPpe, Math.max(0, price)); // a bargain: the whole price goes to the property, and no goodwill
  c.books.ppe += fairPpe;
  if (o) o.ppe += fairPpe;
  c.books.goodwill += price - fairPpe;
  cash(c, -price, 'acq');
}

export const netIncome = (p: PnL) => p.revenue - p.cogs - p.sm - p.rd - p.ga - p.other - p.da - p.interest + p.gains - p.tax;
export const ebitdaOf = (p: PnL) => p.revenue - p.cogs - p.sm - p.rd - p.ga - p.other;
export const totalAssets = (b: Books) => b.cash + b.ar + b.inventory + (b.ppe - b.accDep) + b.goodwill + b.securities;
export const totalLiabilities = (b: Books) => b.ap + b.deferred + b.debt;
export const equityOf = (b: Books) => b.paidIn + b.retained;

/** Close the quarter: roll net income into retained earnings and produce the three statements. */
export function closeQuarter(c: Company, turn: number, prev: Books, extra: Pick<Quarter, 'headcount' | 'byInd'>): Quarter {
  const pnl = { ...c.pnl };
  const ni = netIncome(pnl);
  c.books.retained += ni;
  const b = c.books;
  const t = c.cfTags;
  const dAR = b.ar - prev.ar;
  const dInv = b.inventory - prev.inventory;
  const dAP = b.ap - prev.ap;
  const dDef = b.deferred - prev.deferred;
  const cfo = ni + pnl.da + t.noncash - dAR - dInv + dAP + dDef;
  const cfi = t.capex + t.acq + t.disp + t.sec;
  const cff = t.debtIn + t.debtOut + t.eqIn + t.buyback + t.div;
  const cf: CashFlow = {
    ni, da: pnl.da, noncash: t.noncash, dAR, dInv, dAP, dDef, cfo,
    capex: t.capex, acquisitions: t.acq, disposals: t.disp, securities: t.sec, cfi,
    debtIn: t.debtIn, debtOut: t.debtOut, equityIn: t.eqIn, buybacks: t.buyback, dividends: t.div, cff,
    net: cfo + cfi + cff, directOp: t.op,
  };
  const q: Quarter = {
    turn, pnl, bs: { ...b }, cf, ebitda: ebitdaOf(pnl), ni, opening: c.opening ?? 0, ...extra,
    check: {
      bs: totalAssets(b) - totalLiabilities(b) - equityOf(b),
      cash: b.cash - prev.cash - cf.net,
    },
  };
  c.pnl = emptyPnL();
  c.cfTags = emptyTags();
  c.opening = 0;
  return q;
}

/** Trailing-twelve-month sum of a quarterly metric (annualised if fewer than four quarters exist). */
export function ttm(c: Company, f: (q: Quarter) => number): number {
  const qs = c.quarters.slice(-4);
  if (!qs.length) return 0;
  const s = qs.reduce((a, q) => a + f(q), 0);
  return (s * 4) / qs.length;
}
