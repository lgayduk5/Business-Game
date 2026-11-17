import { describe, expect, it } from 'vitest';
import { IND_LIST, equityOf, newGame, totalAssets, totalLiabilities } from '../engine/src/index';
import { findBadNumbers, opts, play } from './helpers';

describe('financial statements', () => {
  for (const ind of IND_LIST) {
    it(`tie out every quarter (${ind.id})`, () => {
      const g = play(newGame(opts({ industry: ind.id })), 40);
      const qs = g.company.quarters;
      expect(qs.length).toBeGreaterThan(4);
      for (const q of qs) {
        // assets = liabilities + equity
        expect(Math.abs(q.check.bs)).toBeLessThan(1);
        expect(Math.abs(totalAssets(q.bs) - totalLiabilities(q.bs) - equityOf(q.bs))).toBeLessThan(1);
        // change in cash on the balance sheet = cash flow statement
        expect(Math.abs(q.check.cash)).toBeLessThan(1);
        // indirect operating cash flow = sum of operating cash movements
        expect(Math.abs(q.cf.cfo - q.cf.directOp)).toBeLessThan(1);
        expect(Math.abs(q.cf.cfo + q.cf.cfi + q.cf.cff - q.cf.net)).toBeLessThan(1);
      }
      // each closing balance sheet is the next quarter's opening one
      for (let i = 1; i < qs.length; i++) expect(Math.abs(qs[i].bs.cash - qs[i - 1].bs.cash - qs[i].cf.net)).toBeLessThan(1);
      expect(findBadNumbers(g)).toEqual([]);
    });
  }

  it('opening balance sheet balances', () => {
    const g = newGame(opts());
    const b = g.company.books;
    expect(Math.abs(totalAssets(b) - totalLiabilities(b) - equityOf(b))).toBeLessThan(1e-6);
  });
});
