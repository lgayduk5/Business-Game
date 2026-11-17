import { describe, expect, it } from 'vitest';
import { SPECIALS, buyBack, migrate, newGame, outsideShares, type GameState } from '../engine/src/index';
import { opts } from './helpers';

const sums = (g: GameState) => g.company.cap.founder + outsideShares(g.company.cap);

/** A listed company with 10M founder shares, 1M in public hands and 4M held by a venture fund. */
function listed(): GameState {
  const g = newGame(opts({ founder: 'engineer', seed: 'cap' }));
  const cap = g.company.cap;
  cap.founder = 10e6;
  cap.holders = [{ name: 'Venture fund', shares: 4e6, round: 'Series A', price: 1 }, { name: 'Public shareholders', shares: 1e6, round: 'IPO', price: 5 }];
  cap.shares = 15e6;
  cap.isPublic = true;
  cap.price = 10;
  g.company.books.cash += 100e6;
  g.company.books.paidIn += 100e6;
  return g;
}

describe('cap table', () => {
  it('a buyback takes shares from real holders, so founder + holders = shares', () => {
    const g = listed();
    expect(sums(g)).toBeCloseTo(g.company.cap.shares, 3);
    expect(buyBack(g, 50e6).ok).toBe(true);
    const cap = g.company.cap;
    expect(cap.shares).toBeLessThan(15e6);
    expect(cap.founder).toBe(10e6); // the founder does not sell
    expect(sums(g)).toBeCloseTo(cap.shares, 3);
    for (const h of cap.holders) expect(h.shares).toBeGreaterThanOrEqual(0);
  });
  it('repeated buybacks never retire more shares than outsiders hold', () => {
    const g = listed();
    for (let i = 0; i < 30; i++) buyBack(g, 1e9);
    expect(g.company.cap.shares).toBeGreaterThanOrEqual(g.company.cap.founder);
    expect(sums(g)).toBeCloseTo(g.company.cap.shares, 3);
  });
  it('the event buyback keeps the cap table whole too', () => {
    const g = listed();
    SPECIALS.buyback10(g, {}, 0);
    expect(sums(g)).toBeCloseTo(g.company.cap.shares, 3);
  });
  it('old saves with a broken cap table are repaired on load', () => {
    const g = listed();
    g.v = 1;
    g.company.cap.shares = 12.5e6; // what the old buyback left behind: holders still add up to 15M
    migrate(g);
    expect(sums(g)).toBeCloseTo(12.5e6, 3);
    expect(g.v).toBeGreaterThanOrEqual(2);
  });
});
