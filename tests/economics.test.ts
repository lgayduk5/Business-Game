import { describe, expect, it } from 'vitest';
import {
  CITY, IND_LIST, INDUSTRIES, countryTax, endTurn, equityOf, fxOf, migrate, newGame, privateValue, quarterOf, rivalValuation, startScenario, stepIPO, totalAssets, totalLiabilities,
  turnLabel, valuation, type GameState, type LocalProfit,
} from '../engine/src/index';
import { opts, play } from './helpers';

describe('a new company has a year of history', () => {
  for (const ind of IND_LIST) {
    it(`opens trading, with accounts that tie out (${ind.id})`, () => {
      const g = newGame(opts({ industry: ind.id, seed: 'hist-' + ind.id }));
      const c = g.company;
      expect(c.quarters.map((q) => q.turn)).toEqual([-4, -3, -2, -1]);
      for (const q of c.quarters) {
        expect(Math.abs(q.check.bs)).toBeLessThan(1);
        expect(Math.abs(q.cf.cfo + q.cf.cfi + q.cf.cff - q.cf.net)).toBeLessThan(1);
        expect(q.cf.net).toBeCloseTo(0, 6);
      }
      expect(c.quarters[3].pnl.revenue).toBeGreaterThan(c.quarters[0].pnl.revenue); // it has been growing
      for (const o of c.offices) {
        expect(o.last).toBeTruthy(); // no "not trading yet" at turn 0
        expect(o.hist.length).toBe(4);
      }
      expect(g.history.length).toBe(4);
      const b = c.books;
      expect(Math.abs(totalAssets(b) - totalLiabilities(b) - equityOf(b))).toBeLessThan(1e-3);
    });
  }
  it('starts with the cash the founders put in: working capital is funded by their capital, not the bank balance', () => {
    const g = newGame(opts({ industry: 'consulting', seed: 'wc' }));
    const def = INDUSTRIES.consulting;
    expect(g.company.books.cash).toBeCloseTo(def.start.cash * 1000, -2);
    expect(g.company.books.ar).toBeGreaterThan(0); // clients already owe it money
  });
  it('the value of the business does not jump after the first quarter', () => {
    // enterprise value: equity can swing in percentage terms when debt is large (an energy project loan)
    for (const ind of IND_LIST) {
      const g = newGame(opts({ industry: ind.id, seed: 'jump-' + ind.id }));
      const v0 = g.company.valParts.ev;
      play(g, 1);
      const ratio = g.company.valParts.ev / v0;
      expect(ratio, ind.id).toBeGreaterThan(0.8);
      expect(ratio, ind.id).toBeLessThan(1.25);
    }
  });
  it('labels the quarters before the game began', () => {
    expect(quarterOf(-1)).toBe(4);
    expect(quarterOf(-4)).toBe(1);
    expect(turnLabel(-1)).toBe('Y0 Q4');
    expect(turnLabel(0)).toBe('Y1 Q1');
  });
  it('scenario history is seeded after the scenario sets up its position', () => {
    const g = startScenario('cash_crunch', 'Test');
    expect(g.company.quarters.length).toBe(4);
    expect(g.company.books.cash).toBe(300_000); // the scenario's numbers are kept
    expect(g.company.books.ar).toBe(1_400_000);
  });
});

describe('rivals run on the same economics as the player', () => {
  it('a company is worth the same whether it is the player or a rival', () => {
    const g = play(newGame(opts({ industry: 'saas', founder: 'engineer', seed: 'same-value' })), 8);
    const c = g.company;
    c.reputation = 50; // rivals have no reputation score: compare on neutral ground
    const r = g.rivals[0];
    // make the rival a copy of the player's company
    r.revTTM = c.quarters.slice(-8).map((q) => q.pnl.revenue);
    r.ebitdaTTM = c.quarters.slice(-8).map((q) => q.ebitda);
    r.tech = { saas: c.tech.saas };
    r.brand = c.brand;
    r.cash = c.books.cash + c.books.securities;
    r.debt = c.books.debt;
    r.isPublic = false;
    const mine = valuation(g);
    const theirs = rivalValuation(g, r, { saas: 1 });
    expect(theirs.parts.ops).toBeCloseTo(mine.parts.ops, -2);
    expect(theirs.equity).toBeCloseTo(privateValue(mine.equity, mine.parts.cash, mine.parts.debt), -2);
  });
  it('rival margins look like their industry, and they do not hoard cash', () => {
    const margins: number[] = [];
    const cashToRev: number[] = [];
    for (let s = 0; s < 3; s++) {
      const g = play(newGame(opts({ industry: 'saas', seed: 'rival-margin-' + s })), 40);
      for (const r of g.rivals.filter((x) => x.alive)) {
        const rev = r.revTTM.slice(-4).reduce((a, b) => a + b, 0);
        if (rev <= 0) continue;
        margins.push(r.ebitdaTTM.slice(-4).reduce((a, b) => a + b, 0) / rev);
        cashToRev.push(r.cash / rev);
      }
    }
    margins.sort((a, b) => a - b);
    const med = margins[Math.floor(margins.length / 2)];
    // the review found 35–43% net margins; real software firms of this size run about −10% to +20% net
    expect(med).toBeLessThan(INDUSTRIES.saas.targetMargin + 0.12);
    expect(med).toBeGreaterThan(INDUSTRIES.saas.targetMargin - 0.2);
    expect(Math.max(...cashToRev)).toBeLessThan(3);
  });
  it('rivals borrow from lenders who look at their numbers, and pay interest and tax', () => {
    const g = play(newGame(opts({ industry: 'mfg', seed: 'rival-credit' })), 20);
    for (const r of g.rivals.filter((x) => x.alive)) {
      expect(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']).toContain(r.rating);
      expect(r.spread).toBeGreaterThan(0);
    }
  });
});

describe('tax is paid country by country', () => {
  const home = { country: 'US', rate: 0.27 };
  it('a loss in one country shelters nothing in another', () => {
    const local = new Map<string, LocalProfit>([
      ['US', { rev: 10e6, pre: 1e6, taxW: 10e6 * 0.27 }],
      ['CA', { rev: 2e6, pre: -0.5e6, taxW: 2e6 * 0.26 }],
    ]);
    const t = countryTax(local, 0.5e6, {}, home);
    expect(t.tax).toBeCloseTo(1e6 * 0.27, 0);
    expect(t.nolBy.CA).toBeCloseTo(0.5e6, 0);
    expect(t.nolBy.US ?? 0).toBe(0);
  });
  it('losses carried forward shelter up to 80% of later profit in the same country', () => {
    const local = new Map<string, LocalProfit>([['CA', { rev: 2e6, pre: 1e6, taxW: 2e6 * 0.26 }]]);
    const t = countryTax(local, 1e6, { CA: 5e6 }, home);
    expect(t.tax).toBeCloseTo(0.2e6 * 0.26, 0);
    expect(t.nolBy.CA).toBeCloseTo(4.2e6, 0);
  });
  it('head-office costs are shared out by revenue', () => {
    const local = new Map<string, LocalProfit>([
      ['US', { rev: 6e6, pre: 2e6, taxW: 6e6 * 0.27 }],
      ['GB', { rev: 4e6, pre: 2e6, taxW: 4e6 * 0.25 }],
    ]);
    const t = countryTax(local, 3e6, {}, home); // 1M of central costs
    expect(t.by.US.pre).toBeCloseTo(1.4e6, 0);
    expect(t.by.GB.pre).toBeCloseTo(1.6e6, 0);
  });
});

describe('currencies', () => {
  it('Toronto trades in Canadian dollars; New York does not move', () => {
    const g = newGame(opts({ seed: 'cad' }));
    for (let i = 0; i < 20; i++) endTurn(g);
    expect(CITY.tor.region).toBe(CITY.nyc.region);
    expect(fxOf(g, 'nyc')).toBe(1);
    expect(fxOf(g, 'tor')).not.toBe(1);
  });
});

describe('IPO day', () => {
  const ipo = (sentiment: number, seed: number) => {
    const g = newGame(opts({ seed: 'ipo' }));
    g.rng = (g.rng + seed * 7919) >>> 0;
    g.macro.sentiment = sentiment;
    g.company.cap.ipoStage = 2;
    stepIPO(g);
    return g.company.cap.premium;
  };
  it('the first-day pop depends on the market mood and is not fixed', () => {
    const avg = (s: number) => Array.from({ length: 30 }, (_, i) => ipo(s, i)).reduce((a, b) => a + b, 0) / 30;
    const pops = new Set(Array.from({ length: 10 }, (_, i) => ipo(1, i).toFixed(4)));
    expect(pops.size).toBeGreaterThan(5);
    expect(avg(1.4)).toBeGreaterThan(avg(0.85) + 0.1);
  });
});

describe('save migration to v3', () => {
  it('moves tax losses into the home country and fills in rival accounts', () => {
    const g: GameState = newGame(opts({ seed: 'mig3' }));
    const old = JSON.parse(JSON.stringify(g));
    old.v = 2;
    old.company.nol = 5e6;
    delete old.company.nolBy;
    delete old.macro.fx.cad;
    for (const r of old.rivals) for (const k of ['ebitda', 'ebitdaTTM', 'ar', 'inv', 'wc', 'nolBy', 'spread', 'rating', 'raised', 'lastRaise']) delete r[k];
    const m = migrate(old);
    expect(m.company.nolBy[CITY[m.company.home].country]).toBe(5e6);
    expect(m.macro.fx.cad).toBe(1);
    for (const r of m.rivals) expect(Array.isArray(r.ebitdaTTM)).toBe(true);
    endTurn(m); // and the game carries on
    expect(m.turn).toBe(g.turn + 1);
  });
});
