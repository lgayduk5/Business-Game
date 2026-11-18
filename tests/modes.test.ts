import { describe, expect, it } from 'vitest';
import {
  CHALLENGES, CHAPTERS, SPRINT_QUARTERS, canRewind, capTarget, checkEnd, dailyOpts, dailySetup, endTurn, goalTarget, goalText, migrate, newGame, readScoreCode, rewindTo,
  scenarioStars, scenarioStatus, scoreCode, startScenario, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g));

describe('Sprint', () => {
  it('lasts ten years, with lower bars, and ends in a grade', () => {
    const full = newGame(opts({ seed: 'sprint' }));
    const g = newGame(opts({ seed: 'sprint', sprint: true }));
    expect(g.maxTurns).toBe(SPRINT_QUARTERS);
    expect(capTarget(g)).toBeLessThan(capTarget(full) * 0.5);
    g.turn = SPRINT_QUARTERS - 1;
    checkEnd(g);
    expect(g.status).not.toBe('playing');
    expect(g.outcome?.grade).toMatch(/^[A-F]$/);
  });
});

describe('daily challenge', () => {
  it('gives everyone the same world on the same date', () => {
    expect(dailySetup('2026-11-18')).toEqual(dailySetup('2026-11-18'));
    const a = newGame(dailyOpts('2026-11-18', 'A'));
    const b = newGame(dailyOpts('2026-11-18', 'B'));
    play(a, 4);
    play(b, 4);
    expect(a.company.valuation).toBeCloseTo(b.company.valuation, 0);
    expect(a.rules).toEqual({ sprint: true, ironman: true, daily: '2026-11-18' });
    const days = new Set(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((d) => JSON.stringify(dailySetup(d))));
    expect(days.size).toBeGreaterThan(1);
    expect(() => dailySetup('tomorrow')).toThrow();
  });
  it('makes a score code that reads back, and catches a changed one', () => {
    const g = newGame(dailyOpts('2026-11-18', 'Daily'));
    g.turn = g.maxTurns - 1;
    checkEnd(g);
    const code = scoreCode(g);
    expect(code).toMatch(/^GC-261118-[A-F]\d{1,3}-\d+(\.\d)?[KMB]-[2-9A-Z]{4}$/);
    const read = readScoreCode(code)!;
    expect(read.ok).toBe(true);
    expect(read.date).toBe('2026-11-18');
    expect(read.grade).toBe(g.outcome!.grade);
    const forged = code.replace(/-([A-F])(\d+)-/, (_m, gr, n) => `-${gr === 'A' ? 'B' : 'A'}${n}-`);
    expect(readScoreCode(forged)!.ok).toBe(false);
    expect(readScoreCode('hello')).toBeNull();
    expect(scoreCode(newGame(opts()))).toBe(''); // only daily games have one
  });
});

describe('rewind', () => {
  it('goes back to the start of an earlier quarter, counts the rewind, and replays the same way', () => {
    const g = newGame(opts({ seed: 'rewind' }));
    play(g, 3);
    const snap = clone(g);
    play(g, 2);
    const back = rewindTo(g, snap);
    expect(back.turn).toBe(snap.turn);
    expect(back.counters.rewinds).toBe(1);
    expect(back.replay?.from).toBe(snap.turn);
    // the world is deterministic: the same choices lead to the same place
    play(back, 2);
    expect(back.company.valuation).toBeCloseTo(g.company.valuation, 0);
  });
  it('is not allowed in Ironman or daily games, or further back than four quarters', () => {
    const iron = newGame(opts({ seed: 'iron', ironman: true }));
    expect(canRewind(iron)).toBe(false);
    expect(() => rewindTo(iron, clone(iron))).toThrow();
    const g = newGame(opts({ seed: 'far' }));
    const old = clone(g);
    play(g, 6);
    expect(() => rewindTo(g, old)).toThrow();
  });
});

describe('scenarios: medals, Brutal versions and the campaign', () => {
  it('has a consulting challenge and five chapters, one layer each', () => {
    expect(CHALLENGES.some((s) => s.industry === 'consulting')).toBe(true);
    expect(CHAPTERS.map((s) => s.chapter)).toEqual([1, 2, 3, 4, 5]);
    expect(CHAPTERS.map((s) => s.layer)).toEqual(['Office', 'Region', 'Capital', 'Rivals', 'Public company']);
    for (const s of CHAPTERS) expect(s.tips?.length, s.id).toBeGreaterThan(2);
  });
  it('every scenario and chapter starts, on its own difficulty and on Brutal', () => {
    for (const s of [...CHALLENGES, ...CHAPTERS]) {
      for (const brutal of [false, true]) {
        const g = startScenario(s.id, 'T', { brutal });
        expect(g.difficulty, s.id).toBe(brutal ? 'brutal' : s.difficulty);
        expect(!!g.rules.brutal).toBe(brutal);
        const st = scenarioStatus(g)!;
        expect(st.met, s.id).toBe(false);
        expect(goalText(g)).not.toContain('{');
        endTurn(g);
      }
    }
  });
  it('relative goals are set from where the company starts', () => {
    const g = startScenario('ch1', 'T');
    expect(goalTarget(g)).toBeGreaterThanOrEqual(1.6 * g.counters.startRevenue!);
    expect(goalTarget(g)).toBeLessThan(1.8 * g.counters.startRevenue!);
  });
  it('awards bronze, silver for the bonus and gold for Brutal', () => {
    const g = startScenario('ch5', 'T');
    expect(scenarioStars(g)).toBe(0);
    g.company.cap.isPublic = true;
    checkEnd(g);
    expect(g.status).toBe('won');
    expect(scenarioStars(g)).toBe(2); // listed straight away, with time to spare
    const b = startScenario('ch5', 'T', { brutal: true });
    b.company.cap.isPublic = true;
    checkEnd(b);
    expect(scenarioStars(b)).toBe(3);
  });
  it('the Rivals chapter is judged against the biggest rival in your city', () => {
    const g = startScenario('ch4', 'T');
    const st = scenarioStatus(g)!;
    expect(st.progress).toBeLessThan(1); // you start behind
    expect(st.detail).toContain('as much as');
  });
});

describe('older saves', () => {
  it('get default rules', () => {
    const g = newGame(opts({ seed: 'rules' }));
    const old = clone(g) as unknown as Record<string, unknown>;
    delete old.rules;
    const m = migrate(old as unknown as GameState);
    expect(m.rules).toEqual({});
    endTurn(m);
  });
});
