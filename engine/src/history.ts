// A new company has been trading for a while before the game starts. This gives it a year of accounts,
// the working capital its trade needs, and a first look at each office's results, so turn 0 shows an
// established business rather than "not trading yet" and the valuation does not jump after the first quarter.
import * as B from './books';
import { revalue } from './finance';
import { globalShare, localPrice, priceIndex } from './market';
import { headcount } from './people';
import { endTurn } from './turn';
import type { Books, CashFlow, GameState, PnL, Quarter } from './types';

/** Quarters of history a new company starts with. */
export const HISTORY_QUARTERS = 4;

const scalePnl = (p: PnL, f: number) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v * f])) as unknown as PnL;
const netAssets = (b: Books) => B.totalAssets(b) - B.totalLiabilities(b);

/**
 * Seed four quarters of history (turns −4 to −1) from one ordinary quarter played on a throwaway copy
 * with no events and a calm economy. Working-capital accounts the game has not already set (receivables,
 * stock, payables, deferred revenue) are filled in at their trading level, funded by the founders' capital,
 * so cash is unchanged. Safe to call again after a scenario has rearranged the starting position.
 */
export function seedHistory(g: GameState) {
  const c = g.company;
  const h: GameState = JSON.parse(JSON.stringify(g));
  h.settings.sandbox = { ...h.settings.sandbox, noEvents: true, calmMacro: true, noBankruptcy: true };
  h.queue = [];
  h.scheduled = [];
  endTurn(h);
  const hc = h.company;
  const q = hc.quarters[hc.quarters.length - 1];
  if (!q) return;
  // The history follows the path the business is on: a second quarter on the copy shows its momentum.
  const snap: GameState = JSON.parse(JSON.stringify(h));
  endTurn(snap);
  const next = snap.company.quarters[snap.company.quarters.length - 1]?.pnl.revenue ?? q.pnl.revenue;
  const gq = q.pnl.revenue > 0 ? Math.min(0.05, Math.max(-0.02, next / q.pnl.revenue - 1)) : 0;
  // The copy's quarter is the one about to be played, so the seeded quarters end one step before it.
  const BACKCAST = Array.from({ length: HISTORY_QUARTERS }, (_, i) => (1 + gq) ** -(HISTORY_QUARTERS - i));
  const f1 = BACKCAST[HISTORY_QUARTERS - 1];

  // Working capital at its trading level.
  const b = c.books, hb = hc.books;
  const before = netAssets(b);
  if (b.ar === 0) b.ar = hb.ar;
  if (b.ap === 0) b.ap = hb.ap;
  if (b.deferred === 0) b.deferred = hb.deferred;
  if (b.inventory === 0 && hb.inventory > 0) {
    b.inventory = hb.inventory;
    for (const o of c.offices) {
      const ho = hc.offices.find((x) => x.id === o.id);
      if (ho) Object.assign(o, { inventory: ho.inventory, invValue: ho.invValue });
    }
  }
  b.paidIn += netAssets(b) - before;

  // Each office's last results and a year of its history.
  for (const o of c.offices) {
    const last = hc.offices.find((x) => x.id === o.id)?.last;
    if (!last) continue;
    // last quarter sold a little less than the coming one will
    for (const k of ['demand', 'sold', 'produced', 'revenue', 'materials', 'lost'] as const) last[k] *= f1;
    last.contribution = last.revenue - last.materials - Object.values(last.wages).reduce((a, b) => a + b, 0) - last.rent - last.facility - last.marketing - last.hiring - last.training;
    last.util = last.capacity > 0 ? last.sold / last.capacity : 0;
    o.last = last;
    const mkt = last.market * localPrice(g, o.city, o.ind);
    // `last` is already the final seeded quarter, so the path back from it is f / f1 (its own entry equals it)
    o.hist = BACKCAST.map((f) => ({ rev: (last.revenue * f) / f1, contrib: (last.contribution * f) / f1, share: o.share, mkt: mkt * f, px: priceIndex(g, o) }));
  }

  // Four quarters of accounts on today's balance sheet: what the business earned went to its owners and
  // what it lost they put in, so the cash ties out quarter by quarter.
  c.quarters = BACKCAST.map((f, i): Quarter => {
    const pnl = scalePnl(q.pnl, f);
    const ni = B.netIncome(pnl);
    const cfo = ni + pnl.da;
    const cf: CashFlow = {
      ni, da: pnl.da, noncash: 0, dAR: 0, dInv: 0, dAP: 0, dDef: 0, cfo, capex: -pnl.da, acquisitions: 0, disposals: 0, securities: 0, cfi: -pnl.da,
      debtIn: 0, debtOut: 0, equityIn: Math.max(0, -ni), buybacks: 0, dividends: Math.min(0, -ni), cff: -ni, net: 0, directOp: cfo,
    };
    const byInd: Quarter['byInd'] = Object.fromEntries(Object.entries(q.byInd).map(([k, v]) => [k, { rev: v!.rev * f, contrib: v!.contrib * f }]));
    return {
      turn: i - BACKCAST.length, pnl, bs: { ...b }, cf, ebitda: B.ebitdaOf(pnl), ni, headcount: q.headcount, byInd,
      check: { bs: B.totalAssets(b) - B.totalLiabilities(b) - B.equityOf(b), cash: 0 },
    };
  });
  c.open = { ...b };
  c.pnl = B.emptyPnL();
  c.cfTags = B.emptyTags();
  revalue(g);

  const share = globalShare(g, c.primary);
  const morale = c.offices.length ? c.offices.reduce((s, o) => s + o.morale * headcount(o), 0) / Math.max(1, q.headcount) : 0;
  // Values and shares are measured at the end of each seeded quarter: today's figures are the last one's.
  const back = (i: number) => BACKCAST[i] / f1;
  g.history = c.quarters.map((x, i) => ({
    turn: x.turn, revenue: x.pnl.revenue, ebitda: x.ebitda, ni: x.ni, cash: b.cash, debt: b.debt, valuation: c.valuation * back(i), share: share * back(i), headcount: x.headcount,
    morale, gap: g.macro.gap, rate: g.macro.rate, rivals: g.rivals.map((r) => (r.alive ? r.valuation * back(i) : 0)),
  }));
}
