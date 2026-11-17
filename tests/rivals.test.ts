import { describe, expect, it } from 'vitest';
import {
  DIFF, INDUSTRIES, bidForRival, checkEnd, endTurn, improveRelations, keepPlaying, newGame, poachTalent, proposeTruce, rivalKnown, startUnits, sueRival, victoryStatus,
  type Difficulty,
} from '../engine/src/index';
import { findBadNumbers, opts, play } from './helpers';

describe('rival companies', () => {
  it('each difficulty fields its rivals, bigger on harder levels', () => {
    const size: Record<string, number> = {};
    for (const d of Object.keys(DIFF) as Difficulty[]) {
      const g = newGame(opts({ difficulty: d, seed: 'r1' }));
      expect(g.rivals.length).toBe(DIFF[d].rivals);
      expect(new Set(g.rivals.map((r) => r.personality)).size).toBe(g.rivals.length);
      size[d] = g.rivals.reduce((s, r) => s + r.rev, 0) / g.rivals.length;
      // established, but within reach of a start-up: no rival office starts more than a few times the player's
      for (const r of g.rivals) for (const ro of r.offices) expect(ro.cap).toBeLessThan(startUnits(ro.ind) * 12);
    }
    expect(size.brutal).toBeGreaterThan(size.normal);
    expect(size.normal).toBeGreaterThan(size.easy);
  });
  it('someone is already in your home market, and rivals you can see are known', () => {
    const g = newGame(opts({ city: 'aus' }));
    expect(g.rivals.some((r) => r.offices.some((ro) => ro.city === 'aus'))).toBe(true);
    expect(g.rivals.some((r) => rivalKnown(g, r))).toBe(true);
  });
  it('rivals grow, act, and stay solvent-or-dead over a long game', () => {
    for (const d of ['easy', 'brutal'] as Difficulty[]) {
      const g = play(newGame(opts({ difficulty: d, seed: 'long-' + d })), 60);
      for (const r of g.rivals) {
        expect(Number.isFinite(r.cash) && Number.isFinite(r.valuation)).toBe(true);
        if (r.alive) expect(r.offices.length).toBeGreaterThan(0);
      }
      expect(g.eventLog.some((e) => e.cat === 'rival')).toBe(true);
      expect(findBadNumbers(g)).toEqual([]);
    }
  });
});

describe('diplomacy', () => {
  it('relations, truces, poaching and lawsuits change the relationship', () => {
    const g = newGame(opts({ founder: 'heir', seed: 'dip' }));
    const r = g.rivals[0];
    const rel = r.relation;
    expect(improveRelations(g, r.id).ok).toBe(true);
    expect(r.relation).toBeGreaterThan(rel);
    expect(improveRelations(g, r.id).ok).toBe(false); // cooldown
    const p = g.rivals[1];
    poachTalent(g, p.id);
    expect(p.grievances).toBe(1);
    expect(sueRival(g, p.id).ok).toBe(true);
    expect(g.scheduled.some((s) => s.id === 'lawsuit_verdict')).toBe(true);
    let truce = false;
    for (let i = 0; i < 8 && !truce; i++) {
      truce = proposeTruce(g, g.rivals[2].id).ok;
      g.turn += 4;
    }
    expect(truce).toBe(true);
    expect(g.rivals[2].pact).toBe('truce');
  });
  it('a successful bid absorbs the rival and keeps the books tied', () => {
    let done = false;
    for (let s = 0; s < 40 && !done; s++) {
      const g = newGame(opts({ founder: 'heir', seed: 'bid' + s }));
      g.company.books.cash += 2e9;
      g.company.books.paidIn += 2e9;
      g.company.open = { ...g.company.books };
      const r = g.rivals[0];
      r.relation = 100;
      r.distress = 2;
      const offices = g.company.offices.length;
      if (!bidForRival(g, r.id, false).ok) continue;
      done = true;
      expect(r.alive).toBe(false);
      expect(g.company.offices.length).toBeGreaterThan(offices);
      for (let i = 0; i < 4; i++) {
        g.queue = [];
        endTurn(g);
        const q = g.company.quarters[g.company.quarters.length - 1];
        expect(Math.abs(q.check.bs)).toBeLessThan(1);
        expect(Math.abs(q.check.cash)).toBeLessThan(1);
      }
    }
    expect(done).toBe(true);
  });
});

describe('victory and defeat', () => {
  it('lists six paths to victory with progress between 0 and 1', () => {
    const g = newGame(opts());
    const vs = victoryStatus(g);
    expect(vs.map((v) => v.id)).toEqual(['marketCap', 'dominance', 'ipo', 'innovation', 'reputation', 'lastStanding']);
    for (const v of vs) expect(v.progress >= 0 && v.progress <= 1).toBe(true);
  });
  it('last company standing wins', () => {
    const g = newGame(opts());
    for (const r of g.rivals) r.alive = false;
    checkEnd(g);
    expect(g.status).toBe('won');
    expect(g.outcome!.how).toBe('lastStanding');
    keepPlaying(g);
    expect(g.status).toBe('playing');
    endTurn(g);
    expect(g.status).toBe('playing');
  });
  it('two quarters of negative cash is insolvency, unless the sandbox forbids it', () => {
    const g = newGame(opts());
    g.company.negCashTurns = 2;
    checkEnd(g);
    expect(g.outcome!.how).toBe('bankrupt');
    const s = newGame(opts({ mode: 'sandbox' }));
    s.company.negCashTurns = 5;
    checkEnd(s);
    expect(s.status).toBe('playing');
  });
  it('Titan needs two quarters as the most valuable company above the bar', () => {
    const g = newGame(opts());
    for (let i = 0; i < 2; i++) {
      g.company.valuation = 1e12;
      for (const r of g.rivals) r.valuation = 1e9;
      checkEnd(g);
    }
    expect(g.outcome?.how).toBe('marketCap');
    void INDUSTRIES;
  });
});
