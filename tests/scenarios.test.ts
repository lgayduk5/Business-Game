import { describe, expect, it } from 'vitest';
import { SCENARIOS, endTurn, equityOf, fromSaveFile, migrate, raiseEquity, scenarioStatus, startScenario, toSaveFile, totalAssets, totalLiabilities } from '../engine/src/index';
import { BOTS, botTurn } from '../engine/src/bots';

describe('scenarios', () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: starts balanced, tracks its goal, and ends by its deadline`, () => {
      const g = startScenario(s.id, 'Test');
      const b = g.company.books;
      expect(Math.abs(totalAssets(b) - totalLiabilities(b) - equityOf(b))).toBeLessThan(1);
      expect(scenarioStatus(g)).toBeTruthy();
      for (let i = 0; i < s.turns + 2 && g.status === 'playing'; i++) {
        botTurn(g, BOTS.steady);
        if (g.status !== 'playing') break;
        endTurn(g);
        const q = g.company.quarters[g.company.quarters.length - 1];
        expect(Math.abs(q.check.bs)).toBeLessThan(1);
        expect(Math.abs(q.check.cash)).toBeLessThan(1);
      }
      expect(g.status).not.toBe('playing');
      expect(g.outcome?.how === 'scenario' || g.outcome?.how === 'bankrupt' || g.outcome?.how === 'sold' || g.outcome?.how === 'ousted').toBe(true);
    });
  }
  it('forbidding equity really forbids it', () => {
    const g = startScenario('cash_crunch', 'Test');
    g.equityOffer = { round: 'Seed', investor: 'X', pre: 5e6, maxPct: 0.2, note: '' };
    raiseEquity(g, 0.1);
    endTurn(g);
    expect(g.status).toBe('lost');
    expect(g.outcome?.text).toMatch(/sold shares/);
  });
});

describe('save files', () => {
  it('round-trip through a save file and keep playing identically', () => {
    const a = startScenario('blitzscale', 'Saver');
    for (let i = 0; i < 6; i++) { botTurn(a, BOTS.steady); endTurn(a); }
    const b = fromSaveFile(JSON.stringify(toSaveFile(a)));
    for (let i = 0; i < 6; i++) { botTurn(a, BOTS.steady); endTurn(a); botTurn(b, BOTS.steady); endTurn(b); }
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
  });
  it('rejects files that are not saves, and repairs old ones', () => {
    expect(() => fromSaveFile('not json')).toThrow(/not a Going Concern save/);
    expect(() => fromSaveFile(JSON.stringify({ format: 'something-else' }))).toThrow(/not a Going Concern save/);
    expect(() => fromSaveFile(JSON.stringify({ format: 'going-concern-save', v: 99, state: {} }))).toThrow(/newer version/);
    const g = startScenario('network', 'Old');
    const old = JSON.parse(JSON.stringify(g));
    delete old.counters; delete old.attribution; delete old.company.techInfo;
    const m = migrate(old);
    // only the baselines the end-of-game grade needs are filled in
    expect(Object.keys(m.counters).filter((k) => !/^(rivalStart\d+|startFounderValue|startRevenue)$/.test(k))).toEqual([]);
    expect(m.attribution.notes).toEqual([]);
  });
});
