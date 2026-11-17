import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY, REGION_LIST, attritionRate, closeOffice, companyHeadcount, endTurn, fire, founderStake, hireExec, hirePool, newGame, openOffice, raiseEquity, scout,
  setPay, setPrice, setReqs, signPartner, takeLoan, totalAssets, totalLiabilities, equityOf,
} from '../engine/src/index';
import { opts, play } from './helpers';

describe('world and expansion', () => {
  it('has 12-20 cities across several regions', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(12);
    expect(CITIES.length).toBeLessThanOrEqual(20);
    expect(REGION_LIST.length).toBeGreaterThanOrEqual(4);
  });
  it('fog of war: unknown cities need a market study before you can open there', () => {
    const g = newGame(opts({ city: 'aus', founder: 'heir' }));
    const far = CITIES.find((c) => c.region !== CITY.aus.region)!;
    expect(g.discovered[far.id]).toBe(0);
    expect(openOffice(g, far.id, g.company.primary).ok).toBe(false);
    expect(scout(g, far.id).ok).toBe(true);
    endTurn(g);
    endTurn(g);
    expect(g.discovered[far.id]).toBe(1);
    expect(openOffice(g, far.id, g.company.primary).ok).toBe(true);
    expect(g.discovered[far.id]).toBe(2);
    play(g, 6);
    const o = g.company.offices.find((x) => x.city === far.id)!;
    expect(o.staff.ops.n).toBeGreaterThan(0); // starter team was recruited
    expect(signPartner(g, CITY[far.id].region).ok).toBe(true);
    expect(closeOffice(g, o.id).ok).toBe(true);
    endTurn(g);
    const b = g.company.books;
    expect(Math.abs(totalAssets(b) - totalLiabilities(b) - equityOf(b) - (g.company.pnl.revenue))).toBeLessThan(1);
  });
});

describe('people', () => {
  it('better pay widens the hiring pool and lowers attrition', () => {
    const g = newGame(opts());
    const o = g.company.offices[0];
    const pool0 = hirePool(g, o, 'ops'), attr0 = attritionRate(g, o);
    setPay(g, o.id, 1.3);
    expect(hirePool(g, o, 'ops')).toBeGreaterThan(pool0);
    expect(attritionRate(g, o)).toBeLessThan(attr0);
  });
  it('requisitions fill over time and layoffs cost cash, morale and culture', () => {
    const g = newGame(opts());
    const o = g.company.offices[0];
    const before = companyHeadcount(g.company);
    setReqs(g, o.id, 'ops', 6);
    play(g, 2, () => undefined);
    expect(companyHeadcount(g.company)).toBeGreaterThan(before);
    const cash = g.company.books.cash, morale = o.morale, culture = g.company.culture;
    expect(fire(g, o.id, 'ops', 4).ok).toBe(true);
    expect(g.company.books.cash).toBeLessThan(cash);
    expect(o.morale).toBeLessThan(morale);
    expect(g.company.culture).toBeLessThan(culture);
  });
  it('executives can be hired into open seats', () => {
    const g = newGame(opts({ founder: 'heir' }));
    const cfo = g.candidates.find((p) => p.role === 'CFO')!;
    expect(hireExec(g, cfo.id).ok).toBe(true);
    expect(hireExec(g, g.candidates[0]?.id ?? 'x').ok).toBe(g.candidates.length > 0);
  });
});

describe('corporate finance', () => {
  it('equity raises bring cash and dilute the founder', () => {
    const g = newGame(opts());
    expect(g.equityOffer).toBeTruthy();
    const cash = g.company.books.cash;
    expect(raiseEquity(g, 0.2).ok).toBe(true);
    expect(g.company.books.cash).toBeGreaterThan(cash);
    expect(founderStake(g.company)).toBeCloseTo(0.8, 5);
  });
  it('loans land on the balance sheet, accrue interest and amortise', () => {
    const g = newGame(opts());
    const offer = g.loanOffers.find((o) => o.kind !== 'revolver')!; // a credit line is not drawn when opened
    expect(offer).toBeTruthy();
    expect(takeLoan(g, offer.id, offer.max).ok).toBe(true);
    expect(g.company.books.debt).toBeGreaterThan(0);
    const twin = newGame(opts());
    endTurn(g);
    endTurn(twin);
    const q = g.company.quarters[g.company.quarters.length - 1], tq = twin.company.quarters[twin.company.quarters.length - 1];
    // interest is net of what cash earns, so compare with the same game without the loan
    expect(q.pnl.interest).toBeGreaterThan(tq.pnl.interest);
    expect(q.cf.debtOut).toBeLessThan(0);
    expect(Math.abs(q.check.bs)).toBeLessThan(1);
  });
  it('raising the price lowers the share you are heading for', () => {
    const a = newGame(opts({ seed: 'p' })), b = newGame(opts({ seed: 'p' }));
    setPrice(b, CITY[b.company.home].region, b.company.primary, 1.4);
    endTurn(a);
    endTurn(b);
    expect(b.company.offices[0].last!.target).toBeLessThan(a.company.offices[0].last!.target);
    expect(b.company.offices[0].last!.price).toBeGreaterThan(a.company.offices[0].last!.price);
  });
});
