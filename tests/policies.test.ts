import { describe, expect, it } from 'vitest';
import {
  adoptPolicy, canFranchise, dropPolicy, endTurn, equityOf, inputIndex, invSum, launchDivision, lockInputs, newGame, openFranchise, policySlots, setGuidance, setOptionPay, stepGuidance,
  totalAssets, totalLiabilities, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const tied = (g: GameState) => Math.abs(totalAssets(g.company.books) - totalLiabilities(g.company.books) - equityOf(g.company.books)) < 1;
const lastQ = (g: GameState) => g.company.quarters[g.company.quarters.length - 1];

describe('company policies', () => {
  it('fill slots, change once a year, and work through the same modifiers as investments', () => {
    const g = newGame(opts({ seed: 'policy' }));
    expect(policySlots(g)).toBe(2);
    expect(adoptPolicy(g, 'remote').ok).toBe(true);
    expect(adoptPolicy(g, 'zeroBased').ok).toBe(true);
    expect(adoptPolicy(g, 'premium').ok).toBe(false); // no free slot
    expect(invSum(g, 'rent')).toBe(-40);
    expect(invSum(g, 'overhead')).toBe(-15);
    expect(adoptPolicy(g, 'premium', 'remote').ok).toBe(true); // a swap
    expect(dropPolicy(g, 'zeroBased').ok).toBe(false); // only one change a year
    play(g, 4);
    expect(dropPolicy(g, 'zeroBased').ok).toBe(true);
  });
  it('remote-first cuts the rent bill', () => {
    const a = newGame(opts({ seed: 'rent' }));
    const b = newGame(opts({ seed: 'rent' }));
    adoptPolicy(b, 'remote');
    endTurn(a);
    endTurn(b);
    expect(b.company.offices[0].last!.rent).toBeLessThan(a.company.offices[0].last!.rent * 0.7);
  });
});

describe('pay in stock options', () => {
  it('saves cash, keeps the books balanced, and issues shares to the pool', () => {
    const a = newGame(opts({ seed: 'options' }));
    const b = newGame(opts({ seed: 'options' }));
    expect(setOptionPay(b, 0.2).ok).toBe(true);
    endTurn(a);
    endTurn(b);
    expect(b.company.books.cash).toBeGreaterThan(a.company.books.cash);
    expect(b.company.cap.shares).toBeGreaterThan(a.company.cap.shares);
    expect(b.company.cap.holders.some((h) => h.round === 'Options')).toBe(true);
    expect(lastQ(b).cf.noncash).toBeGreaterThan(0);
    expect(Math.abs(lastQ(b).check.cash)).toBeLessThan(1);
    expect(tied(b)).toBe(true);
    const holders = b.company.cap.founder + b.company.cap.holders.reduce((s, h) => s + h.shares, 0);
    expect(holders).toBeCloseTo(b.company.cap.shares, 0);
  });
});

describe('locking input prices', () => {
  it('holds the input index while the contract runs, then lets it go', () => {
    const g = newGame(opts({ industry: 'mfg', seed: 'hedge' }));
    play(g, 2);
    expect(lockInputs(g, 4).ok).toBe(true);
    const locked = inputIndex(g, 'mfg');
    g.macro.commodity *= 1.5;
    expect(inputIndex(g, 'mfg')).toBeCloseTo(locked, 6);
    g.turn += 4;
    expect(inputIndex(g, 'mfg')).toBeGreaterThan(locked * 1.2);
  });
});

describe('earnings guidance', () => {
  it('beating it lifts the share price; missing it hurts more for a bolder promise', () => {
    const make = () => {
      const g = play(newGame(opts({ seed: 'guide' })), 8);
      g.company.cap.isPublic = true;
      return g;
    };
    const beat = make();
    expect(setGuidance(beat, 'cautious').ok).toBe(true);
    beat.company.guidance!.target = 1; // anything beats it
    beat.turn = beat.company.guidance!.due;
    const p0 = beat.company.cap.premium;
    stepGuidance(beat);
    expect(beat.company.cap.premium).toBeGreaterThan(p0);
    const miss = make();
    setGuidance(miss, 'stretch');
    miss.company.guidance!.target = 1e15;
    miss.turn = miss.company.guidance!.due;
    const p1 = miss.company.cap.premium;
    stepGuidance(miss);
    expect(miss.company.cap.premium).toBeLessThan(p1 * 0.85);
    expect(setGuidance(newGame(opts({ seed: 'private' })), 'base').ok).toBe(false);
  });
});

describe('franchising', () => {
  it('a retail franchise pays a fee now and a royalty on its sales, with no plant or staff', () => {
    const g = newGame(opts({ industry: 'retail', city: 'nyc', seed: 'franchise' }));
    g.company.brand = 40;
    const city = 'chi';
    g.discovered[city] = 1;
    expect(canFranchise(g, city)).toBe('');
    const cash = g.company.books.cash;
    expect(openFranchise(g, city).ok).toBe(true);
    expect(g.company.books.cash).toBeGreaterThan(cash);
    play(g, 4, () => undefined);
    const f = g.company.franchises![0];
    expect(f.sales).toBeGreaterThan(0);
    expect(g.company.offices.some((o) => o.city === city)).toBe(false);
    expect(tied(g)).toBe(true);
    const s = newGame(opts({ industry: 'saas', seed: 'nofranchise' }));
    s.discovered.chi = 1;
    expect(canFranchise(s, 'chi')).not.toBe('');
    expect(launchDivision).toBeTruthy();
  });
});
