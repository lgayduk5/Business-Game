import { describe, expect, it } from 'vitest';
import {
  CITIES, FACTOR_FEE, PLANT_STAKE, canRecycle, checkEnd, endTurn, equityOf, finalGrade, newGame, openOffice, openOfficeCost, openOfficeFinancing, plantEquity,
  setFactoring, sellPlantStake, staffingHint, totalAssets, totalLiabilities, valuation, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const balanced = (g: GameState) => Math.abs(totalAssets(g.company.books) - totalLiabilities(g.company.books) - equityOf(g.company.books));

describe('invoice factoring', () => {
  it('turns most receivables into cash at once, for a fee booked as interest', () => {
    const a = newGame(opts({ industry: 'consulting', seed: 'factor' }));
    const b = newGame(opts({ industry: 'consulting', seed: 'factor' }));
    setFactoring(b, true);
    endTurn(a);
    endTurn(b);
    expect(b.company.books.ar).toBeLessThan(a.company.books.ar * 0.4);
    expect(b.company.books.cash).toBeGreaterThan(a.company.books.cash);
    const qa = a.company.quarters[a.company.quarters.length - 1], qb = b.company.quarters[b.company.quarters.length - 1];
    // the fee, less what the extra cash earns in the bank
    const fee = FACTOR_FEE * 0.8 * qb.pnl.revenue;
    expect(qb.pnl.interest - qa.pnl.interest).toBeGreaterThan(fee * 0.5);
    expect(qb.pnl.interest - qa.pnl.interest).toBeLessThanOrEqual(fee + 1);
    expect(Math.abs(qb.check.bs)).toBeLessThan(1);
    expect(Math.abs(qb.check.cash)).toBeLessThan(1);
  });
});

describe('energy: plants, project finance and capital recycling', () => {
  const energy = () => newGame(opts({ industry: 'energy', city: 'aus', seed: 'plants' }));
  it('a new plant can be opened with project finance, and the loan is tied to it', () => {
    const g = energy();
    const city = CITIES.find((c) => c.id !== 'aus' && c.ind.energy >= 1)!.id;
    g.discovered[city] = 1;
    const cost = openOfficeCost(g, city, 'energy');
    g.company.books.cash = cost.total - openOfficeFinancing(g, city, 'energy') + 100_000;
    g.company.open = { ...g.company.books };
    expect(openOffice(g, city, 'energy').ok).toBe(false); // not enough cash to pay for it outright
    expect(openOffice(g, city, 'energy', true).ok).toBe(true);
    const o = g.company.offices[g.company.offices.length - 1];
    expect(g.company.loans.some((l) => l.office === o.id && l.kind === 'project')).toBe(true);
  });
  it('a plant sells into the grid as soon as it has a crew to run it', () => {
    const g = energy();
    const city = CITIES.find((c) => c.id !== 'aus' && c.ind.energy >= 1)!.id;
    g.discovered[city] = 1;
    g.company.books.cash += 50e6;
    g.company.books.paidIn += 50e6;
    g.company.open = { ...g.company.books };
    openOffice(g, city, 'energy');
    endTurn(g); // the starter crew is hired during the first quarter
    endTurn(g);
    const o = g.company.offices[g.company.offices.length - 1];
    expect(o.last!.util).toBeGreaterThan(0.7);
  });
  it('selling a stake raises cash, keeps the books balanced, and the fund is paid after the plant’s loan', () => {
    const g = energy();
    const o = g.company.offices[0];
    expect(canRecycle(g, o)).toBe('');
    const cash = g.company.books.cash;
    const price = PLANT_STAKE * plantEquity(g, o);
    const before = valuation(g).equity;
    expect(sellPlantStake(g, o.id).ok).toBe(true);
    expect(g.company.books.cash - cash).toBeCloseTo(price * 0.98, -2);
    expect(balanced(g)).toBeLessThan(1);
    expect(o.minority).toBe(PLANT_STAKE);
    expect(canRecycle(g, o)).not.toBe(''); // only once
    // the company is worth less the fund's stake, plus the cash it received
    expect(valuation(g).equity).toBeLessThan(before + price);
    endTurn(g);
    const q = g.company.quarters[g.company.quarters.length - 1];
    expect(q.cf.dividends).toBeLessThan(0); // the fund's distribution
    expect(-q.cf.dividends).toBeLessThan(PLANT_STAKE * o.last!.contribution); // after debt service, not before
    expect(Math.abs(q.check.bs)).toBeLessThan(1);
  });
});

describe('staffing hint', () => {
  it('staffs for next quarter’s likely demand, not the share customers might give you one day', () => {
    const g = play(newGame(opts({ industry: 'consulting', seed: 'hint' })), 2);
    const o = g.company.offices[0];
    o.last!.target = o.share * 5; // customers would take you much further…
    const hint = staffingHint(g, o);
    // …but share only moves part of the way each quarter, so the hint grows by far less than five times
    expect(hint.ops).toBeLessThan(o.staff.ops.n * 2.5);
  });
});

describe('graded ending', () => {
  it('grades a game that runs to the end, and needs real growth for a win', () => {
    const g = newGame(opts({ seed: 'grade' }));
    g.maxTurns = 1;
    checkEnd(g);
    expect(g.outcome?.grade).toMatch(/^[A-F]$/);
    expect(g.status).toBe('lost'); // nothing grew in the first quarter
    const fg = finalGrade(g);
    expect(fg.score).toBeGreaterThanOrEqual(0);
    expect(fg.score).toBeLessThanOrEqual(100);
    expect(fg.rows.length).toBe(3);
  });
  it('a company that grew tenfold and leads its industry earns a winning grade', () => {
    const g = newGame(opts({ seed: 'grade2' }));
    g.company.valuation = (g.counters.startValuation ?? 1) * 40;
    for (const r of g.rivals) r.valuation = 1;
    g.counters.startRevenue = 1;
    const fg = finalGrade(g);
    expect(fg.rank).toBe(1);
    expect(fg.won).toBe(true);
  });
});
