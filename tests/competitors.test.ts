import { describe, expect, it } from 'vitest';
import {
  PERSONALITIES, PERSONALITY, bidOdds, endTurn, feud, launchDivision, lobbyAgainst, nemesis, newGame, rivalsForDivisions, setFlag, spawnRival, sueRival, victoryStatus,
  type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const rich = (g: GameState) => {
  g.company.books.cash += 50e6;
  g.company.books.paidIn += 50e6;
  g.company.open = { ...g.company.books };
  return g;
};

describe('the field changes', () => {
  it('has the five new personalities, with move weights for every one', () => {
    for (const id of ['dynasty', 'state', 'bigtech', 'pe', 'coop']) expect(PERSONALITY[id as keyof typeof PERSONALITY], id).toBeTruthy();
    for (const p of PERSONALITIES) expect(Object.keys(p.moves).sort(), p.id).toEqual(['lawsuit', 'lobby', 'poach', 'war']);
  });
  it('never starts a game with a late entrant', () => {
    for (let s = 0; s < 12; s++) expect(newGame(opts({ seed: 'late' + s })).rivals.some((r) => PERSONALITY[r.personality].late)).toBe(false);
  });
  it('launching a division brings two or three incumbents in that industry', () => {
    const g = rich(newGame(opts({ industry: 'saas', seed: 'division' })));
    expect(launchDivision(g, 'retail').ok).toBe(true);
    const before = g.rivals.length;
    rivalsForDivisions(g);
    const made = g.rivals.slice(before);
    expect(made.length).toBeGreaterThanOrEqual(2);
    expect(made.length).toBeLessThanOrEqual(3);
    for (const r of made) {
      expect(r.industries).toContain('retail');
      expect(r.offices.length).toBeGreaterThan(0);
      expect(r.revTTM[r.revTTM.length - 1]).toBeGreaterThan(0); // trading from day one, like any incumbent
    }
    rivalsForDivisions(g); // only once per division
    expect(g.rivals.length).toBe(before + made.length);
    endTurn(g);
  });
  it('a Big Tech entrant goes for the player’s best market, with deep pockets', () => {
    const g = play(newGame(opts({ industry: 'saas', seed: 'bigtech' })), 4);
    const r = spawnRival(g, 'saas', 'bigtech', false);
    expect(r.offices.some((o) => o.city === g.company.offices[0].city)).toBe(true);
    expect(r.cash).toBeGreaterThan(20e6);
    expect(r.since).toBe(g.turn);
    endTurn(g);
  });
  it('newcomers keep arriving over a long game', () => {
    let entrants = 0;
    for (let s = 0; s < 3; s++) {
      const g = play(newGame(opts({ industry: 'saas', seed: 'entrants' + s })), 60);
      entrants += g.rivals.filter((r) => r.since !== undefined && r.since > 0).length;
    }
    expect(entrants).toBeGreaterThan(0);
  });
  it('young newcomers do not stop you being the last one standing', () => {
    const g = newGame(opts({ seed: 'last' }));
    g.counters.startRevenue = 1;
    for (const r of g.rivals) r.alive = false;
    const r = spawnRival(g, g.company.primary, 'disruptor', false);
    expect(victoryStatus(g).find((v) => v.id === 'lastStanding')!.met).toBe(true);
    g.turn += 12;
    expect(r.alive).toBe(true);
    expect(victoryStatus(g).find((v) => v.id === 'lastStanding')!.met).toBe(false); // three years on, it counts
  });
});

describe('personalities behave as described', () => {
  it('a family firm, a co-op or a giant cannot be bought', () => {
    const g = newGame(opts({ seed: 'nosale' }));
    for (const p of ['dynasty', 'coop', 'bigtech'] as const) {
      const r = spawnRival(g, g.company.primary, p, true);
      r.relation = 100;
      r.distress = 3;
      expect(bidOdds(g, r, false)).toBeLessThan(0.05);
      expect(bidOdds(g, r, true)).toBeLessThan(0.05);
    }
  });
  it('a dynasty stays angry far longer', () => {
    const g = newGame(opts({ seed: 'grudge' }));
    const a = spawnRival(g, g.company.primary, 'dynasty', true);
    const b = spawnRival(g, g.company.primary, 'expander', true);
    a.hostility = b.hostility = 8;
    play(g, 8, () => undefined);
    expect(a.hostility).toBeGreaterThan(b.hostility + 0.5);
  });
  it('the state bails out its champion', () => {
    const g = newGame(opts({ seed: 'aid' }));
    const r = spawnRival(g, g.company.primary, 'state', true);
    r.cash = -1e9; // far beyond what lenders or investors would cover
    endTurn(g);
    expect(r.alive).toBe(true);
    expect(r.aid).toBe(1);
    expect(r.cash).toBeGreaterThan(-1e9);
  });
  it('regulators at home will not act against a state champion', () => {
    const g = rich(newGame(opts({ seed: 'shield', city: 'nyc' })));
    setFlag(g, 'lobby');
    const r = spawnRival(g, g.company.primary, 'state', true);
    r.hq = 'chi'; // same country as the player
    r.known = true;
    const res = lobbyAgainst(g, r.id);
    expect(res.ok).toBe(false);
    expect(res.msg).toContain('champion');
  });
});

describe('the nemesis', () => {
  it('is the rival with the deepest grudge, with the story of the feud', () => {
    const g = rich(newGame(opts({ seed: 'nemesis' })));
    expect(nemesis(g)).toBeUndefined();
    const r = g.rivals[1];
    r.known = true;
    expect(sueRival(g, r.id).ok).toBe(true);
    feud(g, r, 'them', 'They started a price war in your home city.');
    const n = nemesis(g)!;
    expect(n.id).toBe(r.id);
    expect(n.feud!.map((x) => x.who)).toEqual(['you', 'them']);
  });
});
