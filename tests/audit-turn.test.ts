// Regression tests from the audit of the core turn loop, determinism and history.
import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY, IND_LIST, checkEnd, endTurn, keepPlaying, launchDivision, lockInputs, marketUnits, mkKey, needsAttention, newGame, openFranchise, queueEvent,
  rand, resolveEvent, weighted, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const strip = (g: unknown) => JSON.stringify({ ...(g as object), id: 0, created: 0 });

/** A game won as last company standing, then continued. */
function continuedGame(): GameState {
  const g = newGame(opts());
  g.counters.startRevenue = 1;
  for (const r of g.rivals) r.alive = false;
  checkEnd(g);
  expect(g.status).toBe('won');
  keepPlaying(g);
  expect(g.continued).toBe(true);
  return g;
}

describe('audit: turn loop', () => {
  it('bankruptcy ends a game the player kept playing after a win', () => {
    const g = continuedGame();
    g.company.autoRevolver = false;
    g.company.negCashTurns = 1;
    g.company.books.cash = -1e9;
    endTurn(g);
    expect(g.outcome?.how).toBe('bankrupt');
    expect(g.status).toBe('lost');
    expect(g.continued).toBe(false); // otherwise the UI and the engine treat it as still playing
    expect(needsAttention(g)).toBe('The game has ended.');
    const before = strip(g);
    endTurn(g); // no more quarters
    expect(strip(g)).toBe(before);
  });

  it('a sale ends a game the player kept playing after a win', () => {
    const g = continuedGame();
    expect(queueEvent(g, 'rival_takeover', { rival: g.rivals[0].id, amount: g.company.valuation })).toBe(true);
    const pe = g.queue.find((e) => e.id === 'rival_takeover')!;
    resolveEvent(g, pe.uid, 0);
    expect(g.outcome?.how).toBe('sold');
    expect(g.continued).toBe(false);
    const turn = g.turn;
    endTurn(g);
    expect(g.turn).toBe(turn);
  });

  it('franchise royalties and the input-lock fee are counted before tax', () => {
    const g = play(newGame(opts({ industry: 'retail', seed: 'fr' })), 2);
    const c = g.company;
    c.brand = 60;
    const city = CITIES.find((x) => x.id !== c.home && x.country === CITY[c.home].country)!;
    g.discovered[city.id] = 1;
    expect(openFranchise(g, city.id).ok).toBe(true);
    expect(lockInputs(g, 4).ok).toBe(true);
    c.books.cash += 5e7; // no overdraft interest after tax
    endTurn(g);
    const p = c.quarters[c.quarters.length - 1].pnl;
    const pretax = p.revenue - p.cogs - p.sm - p.rd - p.ga - p.other - p.da - p.interest + p.gains;
    const taxed = Object.values(c.taxBy ?? {}).reduce((s, x) => s + x.pre, 0);
    expect(c.franchises![0].sales).toBeGreaterThan(0);
    expect(taxed).toBeCloseTo(pretax, 0);
  });
});

describe('audit: determinism', () => {
  it('looking at a new division’s markets on the map does not change the game', () => {
    const g = newGame(opts({ seed: 'mk' }));
    g.company.books.cash += 1e9;
    const other = IND_LIST.find((i) => i.id !== g.company.primary)!.id;
    expect(launchDivision(g, other).ok).toBe(true);
    play(g, 2);
    for (const ind of g.company.divisions) for (const ct of CITIES) expect(g.mk[mkKey(ct.id, ind)], `${ct.id}:${ind}`).toBeTruthy();
    const viewed: GameState = JSON.parse(JSON.stringify(g));
    const rng = viewed.rng;
    for (const ind of viewed.company.divisions) for (const ct of CITIES) marketUnits(viewed, ct.id, ind); // what the map screen reads
    expect(viewed.rng).toBe(rng);
    play(viewed, 4);
    play(g, 4);
    expect(strip(viewed)).toBe(strip(g));
  });

  it('weighted() never picks an item of zero weight, even on a draw of exactly 0', () => {
    const ZERO = 2463401483; // the generator state whose next draw is exactly 0
    const g = { rng: ZERO } as GameState;
    expect(rand(g)).toBe(0);
    g.rng = ZERO;
    expect(weighted(g, ['never', 'always'], (x) => (x === 'never' ? 0 : 1))).toBe('always');
  });
});

describe('audit: seeded history', () => {
  for (const ind of IND_LIST) {
    it(`the last seeded quarter is where the game starts (${ind.id})`, () => {
      const g = newGame(opts({ industry: ind.id, seed: 'h1' }));
      const c = g.company;
      const o = c.offices[0];
      const lastQ = c.quarters[c.quarters.length - 1];
      expect(o.hist[o.hist.length - 1].rev).toBeCloseTo(o.last!.revenue, 6);
      expect(o.hist[o.hist.length - 1].rev).toBeCloseTo(lastQ.pnl.revenue, 0);
      expect(g.history[g.history.length - 1].valuation).toBeCloseTo(c.valuation, 6);
      expect(o.hist[0].rev).toBeLessThanOrEqual(o.hist[3].rev * 1.0001); // still growing into the game
    });
  }
});
