// Regression tests from the audit of investments, R&D projects and acquisitions.
import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY, INV, INVESTMENTS, PLANT_STAKE, acquireTarget, cancelInvestment, diligence, diligenceTarget, endTurn, equityOf, keepPlaying, licenseOut, licenseValue,
  netIncome, newGame, openFranchise, spawnTarget, startInvestment, totalAssets, totalLiabilities, type ActionResult, type GameState,
} from '../engine/src/index';
import { findBadNumbers, opts, play } from './helpers';

const strip = (g: GameState) => JSON.stringify({ ...g, id: 0, created: 0 });
const running = (g: GameState) => g.company.investments.filter((i) => i.state === 'ramp' || i.state === 'active');

describe('audit: investments and deals after the game is over', () => {
  /** A biotech game with something to cancel, a project to license and a target to buy. */
  function setup() {
    const g = play(newGame(opts({ industry: 'biotech', seed: 'inv-over' })), 3);
    g.company.books.cash = 1e9;
    expect(startInvestment(g, 'treasury').ok).toBe(true);
    expect(startInvestment(g, 'drug').ok).toBe(true);
    endTurn(g);
    expect(spawnTarget(g, g.company.home)).toBeDefined();
    return g;
  }
  function everyAction(g: GameState): [string, () => ActionResult][] {
    const c = g.company;
    const drug = c.investments.find((i) => i.def === 'drug')!;
    const held = c.investments.find((i) => i.def === 'treasury')!;
    const t = g.targets[0];
    return [
      ['startInvestment', () => startInvestment(g, 'culture_program')],
      ['cancelInvestment', () => cancelInvestment(g, held.uid)],
      ['diligence', () => diligence(g, 'crypto_treasury')],
      ['licenseOut', () => licenseOut(g, drug.uid)],
      ['diligenceTarget', () => diligenceTarget(g, t.id)],
      ['acquireTarget', () => acquireTarget(g, t.id)],
    ];
  }

  it('every investment and deal action is refused once the game has ended, and changes nothing', () => {
    // the grade and daily score code are recomputed from live state, so these moved it after the end
    const g = setup();
    expect(licenseValue(g, g.company.investments.find((i) => i.def === 'drug')!)).toBeGreaterThan(0);
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'outlasted', title: 'Grade C', turn: g.turn, text: '' };
    const before = strip(g);
    for (const [name, f] of everyAction(g)) {
      const r = f();
      expect(r.ok, name).toBe(false);
      expect(r.msg, name).toBe('The game is over.');
    }
    expect(strip(g)).toBe(before);
  });

  it('a won game that carries on still takes them', () => {
    const g = setup();
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'marketCap', title: 'Titan', turn: g.turn, text: '' };
    keepPlaying(g);
    for (const [name, f] of everyAction(g)) expect(f().ok, name).toBe(true);
  });
});

describe('audit: licensing a staged project', () => {
  it('a project cannot be licensed in the quarter it starts (start-and-license printed money without limit)', () => {
    const g = play(newGame(opts({ industry: 'biotech', seed: 'lic' })), 2);
    const c = g.company;
    const cash = c.books.cash;
    for (let i = 0; i < 20; i++) {
      expect(startInvestment(g, 'drug').ok).toBe(true);
      const inv = c.investments[c.investments.length - 1];
      expect(licenseValue(g, inv)).toBe(0);
      expect(licenseOut(g, inv.uid).ok).toBe(false);
      cancelInvestment(g, inv.uid);
    }
    expect(c.books.cash).toBe(cash);
    // once the first quarter has been funded it can be licensed, once
    expect(startInvestment(g, 'drug').ok).toBe(true);
    const inv = c.investments[c.investments.length - 1];
    endTurn(g);
    expect(licenseValue(g, inv)).toBeGreaterThan(0);
    expect(licenseOut(g, inv.uid).ok).toBe(true);
    expect(licenseOut(g, inv.uid).ok).toBe(false);
  });
});

describe('audit: investment history', () => {
  it('running investments are never dropped when the history is trimmed', () => {
    // the list was cut to its last 80 entries, running or not: a long game with lots of finished campaigns lost its
    // oldest running investments (their effect gone, and treasury holdings stuck on the balance sheet for good)
    const g = play(newGame(opts({ industry: 'mfg', seed: 'hist' })), 2);
    const c = g.company;
    c.books.cash = 1e9;
    expect(startInvestment(g, 'treasury').ok).toBe(true);
    const held = c.investments[c.investments.length - 1];
    const region = CITY[c.home].region;
    for (let i = 0; i < 85; i++) {
      expect(startInvestment(g, 'regional_campaign', region).ok).toBe(true);
      cancelInvestment(g, c.investments[c.investments.length - 1].uid);
    }
    endTurn(g);
    expect(c.investments).toContain(held);
    expect(held.state).toBe('active');
    expect(c.investments.length).toBeLessThanOrEqual(80);
    expect(c.books.securities).toBeCloseTo(held.bookValue, 0);
    const r = cancelInvestment(g, held.uid);
    expect(r.ok).toBe(true);
    expect(c.books.securities).toBeCloseTo(0, 0);
  });
});

describe('audit: acquisitions', () => {
  it('an acquisition cannot put your own stores beside a franchisee', () => {
    // openOffice refuses this (one or the other in a city); buying a local chain went round it and both sold
    const g = play(newGame(opts({ industry: 'retail', seed: 'fr' })), 2);
    const c = g.company;
    const city = CITIES.find((x) => x.id !== c.home && CITY[x.id].region === CITY[c.home].region)!.id;
    g.discovered[city] = 1;
    c.brand = 40;
    expect(openFranchise(g, city).ok).toBe(true);
    const t = spawnTarget(g, city)!;
    c.books.cash += t.price * 2;
    const r = acquireTarget(g, t.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('A franchisee runs your stores there.');
    expect(c.offices.some((o) => o.city === city)).toBe(false);
  });

  it('a fund that part-owns the plant pays its share of a business bought into it', () => {
    // the fund takes its share of the plant's earnings and value: after buying a $49M wind farm into a 49%-fund-owned
    // plant, the fund's distributions quadrupled and its stake grew by $22M while the player had paid the whole price
    const g = play(newGame(opts({ industry: 'energy', seed: 'fund' })), 2);
    const c = g.company;
    const o = c.offices[0];
    o.minority = PLANT_STAKE;
    const t = spawnTarget(g, o.city)!;
    expect(t.ind).toBe('energy');
    const add = t.price * 0.6 - c.books.cash; // enough for the player's share only, booked so the statements tie
    for (const b of [c.books, c.open]) {
      b.cash += add;
      b.paidIn += add;
    }
    const r = acquireTarget(g, t.id);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toContain('paid by the plant’s fund');
    expect(c.books.cash).toBeCloseTo(t.price * 0.6 - t.price * (1 - PLANT_STAKE), 0);
    expect(c.cfTags.eqIn).toBeCloseTo(t.price * PLANT_STAKE, 0);
    expect(c.offices).toHaveLength(1);
    endTurn(g);
    expect(Math.abs(c.quarters[c.quarters.length - 1].check.bs)).toBeLessThan(1);
  });

  it('random investments, cancellations, licences and acquisitions keep the books whole', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let deals = 0;
    for (const industry of ['mfg', 'biotech', 'energy'] as const) {
      const g = newGame(opts({ industry, seed: `fuzz-${industry}` }));
      const c = g.company;
      for (let t = 0; t < 30 && g.status === 'playing'; t++) {
        // fresh capital, booked so that the quarter's statements still tie out
        for (const b of [c.books, c.open]) {
          b.cash += 2e6;
          b.paidIn += 2e6;
        }
        g.counters.spawnTarget = 1;
        for (let k = 0; k < 3; k++) {
          const def = INVESTMENTS[Math.floor(rnd() * INVESTMENTS.length)];
          const scope = def.scope === 'office' ? c.offices[Math.floor(rnd() * c.offices.length)].id : def.scope === 'region' ? CITY[c.home].region : undefined;
          if (rnd() < 0.3) diligence(g, def.id, scope);
          startInvestment(g, def.id, scope);
        }
        for (const inv of running(g)) {
          if (rnd() < 0.05) cancelInvestment(g, inv.uid);
          else if (INV[inv.def].stages && rnd() < 0.1) licenseOut(g, inv.uid);
        }
        for (const tg of g.targets.slice()) {
          if (rnd() < 0.5) diligenceTarget(g, tg.id);
          if (rnd() < 0.5 && acquireTarget(g, tg.id).ok) deals++;
        }
        endTurn(g);
        const q = c.quarters[c.quarters.length - 1];
        expect(Math.abs(q.check.bs)).toBeLessThan(1);
        expect(Math.abs(q.check.cash)).toBeLessThan(1);
        const b = c.books;
        // and still tie between quarters (anything booked after the close sits in the open quarter's P&L)
        expect(Math.abs(totalAssets(b) - totalLiabilities(b) - equityOf(b) - netIncome(c.pnl))).toBeLessThan(1);
        expect(b.goodwill).toBeGreaterThanOrEqual(0);
        // securities on the balance sheet are exactly the financial investments still held
        const held = running(g).filter((i) => INV[i.def].cat === 'financial' && INV[i.def].capex >= 1).reduce((s, i) => s + i.bookValue, 0);
        expect(b.securities).toBeCloseTo(held, 0);
        expect(findBadNumbers(g)).toEqual([]);
      }
    }
    expect(deals).toBeGreaterThan(5);
  });
});
