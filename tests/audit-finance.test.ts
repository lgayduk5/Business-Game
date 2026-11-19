// Regression tests from the audit of accounting and finance (books, loans, equity, IPO, exit).
import { describe, expect, it } from 'vitest';
import {
  books as B, buyBack, canKeepPlaying, endTurn, fire, followOn, keepPlaying, newGame, outsideShares, revalue, stepIPO, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

/** A listed company with its shares worth nothing: it owes far more than the business is worth. */
function worthless(): GameState {
  const g = newGame(opts({ seed: 'worthless' }));
  const c = g.company;
  c.cap.isPublic = true;
  c.cap.holders.push({ name: 'Public shareholders', shares: 2e6, round: 'IPO', price: 1 });
  c.cap.shares += 2e6;
  c.cap.lastRoundTurn = -10;
  c.books.debt += 500e6;
  c.books.goodwill += 500e6;
  c.loans.push({ id: 'big', kind: 'term', name: 'Big loan', principal: 500e6, limit: 0, spread: 3, fixedRate: 0, floating: true, start: 0, maturity: 40, amort: 0, breaches: 0, waivedUntil: 99 });
  revalue(g);
  expect(c.cap.price).toBe(0);
  return g;
}

describe('audit: finance', () => {
  it('a recession does not turn refunds owed to customers into profit', () => {
    // a subscription business stops serving its customers: the prepaid service must be refunded, boom or bust
    const run = (recession: boolean) => {
      const g = play(newGame(opts({ industry: 'saas', seed: 'refund' })), 8);
      const o = g.company.offices[0];
      for (const r of ['ops', 'sales'] as const) fire(g, o.id, r, o.staff[r].n);
      if (recession) g.macro.shock.gap = -8;
      endTurn(g);
      expect(g.macro.gap < -1.5).toBe(recession);
      return { q: g.company.quarters[g.company.quarters.length - 1], refunded: g.news.some((n) => n.turn === g.turn - 1 && /refunded/.test(n.text)) };
    };
    const calm = run(false), bust = run(true);
    expect(calm.refunded).toBe(true);
    expect(bust.refunded).toBe(true);
    expect(bust.q.pnl.other).toBeGreaterThan(0);
    expect(bust.q.pnl.other).toBeCloseTo(calm.q.pnl.other, 0);
    // and the helper itself writes off nothing when receivables are below zero
    const g = newGame(opts());
    g.company.books.ar = -1000;
    expect(B.writeOffAR(g.company, -20)).toBe(0);
    expect(g.company.books.ar).toBe(-1000);
    expect(g.company.pnl.other).toBe(0);
  });

  it('shares that trade at nothing cannot be bought back for free or sold for nothing', () => {
    const g = worthless();
    const c = g.company;
    const before = JSON.stringify({ books: c.books, cap: c.cap });
    expect(buyBack(g, c.books.cash * 0.5).ok).toBe(false);
    expect(followOn(g, 0.1).ok).toBe(false);
    expect(JSON.stringify({ books: c.books, cap: c.cap })).toBe(before);
    expect(outsideShares(c.cap)).toBe(2e6);
  });

  it('a follow-on offering waits a couple of quarters after the IPO, like any other', () => {
    const g = newGame(opts({ seed: 'ipo' }));
    g.macro.sentiment = 1.2;
    g.company.cap.ipoStage = 2;
    stepIPO(g);
    expect(g.company.cap.isPublic).toBe(true);
    g.turn++;
    expect(followOn(g, 0.1).ok).toBe(false);
    g.turn++;
    expect(followOn(g, 0.1).ok).toBe(true);
  });

  it('a company sold to a buyout fund cannot be played on, even with a winning grade', () => {
    const g = newGame(opts());
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'exit', title: 'Exit, grade A', turn: g.turn, grade: 'A', text: 'Sold.' };
    expect(canKeepPlaying(g)).toBe(false);
    keepPlaying(g);
    expect(g.status).toBe('won');
    expect(g.continued).toBe(false);
    // any other win can still be played on
    g.outcome = { ...g.outcome, how: 'marketCap' };
    expect(canKeepPlaying(g)).toBe(true);
    keepPlaying(g);
    expect(g.status).toBe('playing');
  });

  it('the quarterly report counts IPO proceeds in the change in cash once', () => {
    const g = play(newGame(opts({ seed: 'ipo-cash' })), 4);
    let prev = g.report!.cash;
    for (let i = 0; i < 4; i++) {
      if (i === 1) {
        g.macro.sentiment = 1.4;
        g.company.cap.ipoStage = 2; // the shares price at this quarter's close, after the books are shut
      }
      endTurn(g);
      expect(g.report!.cashDelta).toBeCloseTo(g.report!.cash - prev, 0);
      prev = g.report!.cash;
    }
    expect(g.company.cap.isPublic).toBe(true);
  });
});
