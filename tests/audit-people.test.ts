// Regression tests from the audit of people: staff, hiring, pay, morale, executives and key people.
import { describe, expect, it } from 'vitest';
import {
  CITIES, EXEC_ROLES, IND_LIST, ROLES, endTurn, exec, fire, fireExec, hireExec, newGame, retain, setBackfill, setPay, setReqs, setTraining,
  staffingHint, type GameState,
} from '../engine/src/index';
import { findBadNumbers, opts, simplePolicy } from './helpers';

const richGame = (): GameState => {
  const g = newGame(opts({ seed: 'audit-people' }));
  g.company.books.cash = 1e9;
  return g;
};

describe('audit: executives', () => {
  it('the search fee is in today’s money, like the salary shown next to the candidate', () => {
    const g = richGame();
    g.macro.wageIdx = 2;
    const p = g.candidates.find((x) => x.role === 'CFO')!;
    const before = g.company.books.cash;
    expect(hireExec(g, p.id).ok).toBe(true);
    // the team screen shows p.salary × wageIdx a quarter; the fee is 1.2 quarters of that
    expect(before - g.company.books.cash).toBeCloseTo(p.salary * 2 * 1.2, 6);
  });

  it('replacing an executive opens the search at once', () => {
    const g = richGame();
    const p = g.candidates.find((x) => x.role === 'CFO')!;
    hireExec(g, p.id);
    endTurn(g);
    expect(g.turn % 4).not.toBe(0); // the yearly refresh would not bring new candidates
    expect(g.candidates.some((x) => x.role === 'CFO')).toBe(false);
    expect(fireExec(g, p.id).ok).toBe(true);
    expect(exec(g.company, 'CFO')).toBeUndefined();
    const shortlist = g.candidates.filter((x) => x.role === 'CFO');
    expect(shortlist.length).toBe(2);
    expect(hireExec(g, shortlist[0].id).ok).toBe(true);
    expect(g.company.people.filter((x) => x.role === 'CFO' && !x.office).length).toBe(1);
  });

  it('replacing a general manager brings in exactly one successor and no executive candidates', () => {
    const g = richGame();
    const o = g.company.offices[0];
    const before = g.candidates.length;
    const gm = g.company.people.find((x) => x.office === o.id)!;
    expect(fireExec(g, gm.id).ok).toBe(true);
    const gms = g.company.people.filter((x) => x.office === o.id);
    expect(gms.length).toBe(1);
    expect(o.gm).toBe(gms[0].id);
    expect(g.candidates.length).toBe(before);
  });

  it('a retention package costs one and a half quarters of salary (as the People screen says)', () => {
    const g = richGame();
    g.macro.wageIdx = 1.5;
    const gm = g.company.people[0];
    const before = g.company.books.cash;
    expect(retain(g, gm.id).ok).toBe(true);
    expect(before - g.company.books.cash).toBeCloseTo(gm.salary * 1.5 * 1.5, 6);
  });
});

/** Headcount whole and non-negative, skill and morale within their clamps, one GM per office, no duplicate executives. */
function checkPeople(g: GameState, where: string) {
  const c = g.company;
  for (const r of EXEC_ROLES) {
    const n = c.people.filter((p) => p.role === r && !p.office).length;
    expect(n, `${where}: ${r}`).toBeLessThanOrEqual(1);
    if (n) expect(g.candidates.some((p) => p.role === r), `${where}: candidates for a filled ${r} seat`).toBe(false);
  }
  for (const p of c.people) if (p.office) expect(c.offices.some((o) => o.id === p.office), `${where}: GM of a closed office`).toBe(true);
  for (const o of c.offices) {
    expect(c.people.filter((p) => p.office === o.id).length, `${where}: GMs in ${o.id}`).toBe(1);
    expect(c.people.some((p) => p.id === o.gm)).toBe(true);
    expect(o.morale).toBeGreaterThanOrEqual(0);
    expect(o.morale).toBeLessThanOrEqual(100);
    const hint = staffingHint(g, o);
    for (const r of ROLES) {
      const s = o.staff[r];
      for (const v of [s.n, s.reqs, s.fresh, hint[r]]) {
        expect(Number.isInteger(v), `${where}: ${o.id} ${r} ${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(s.skill).toBeGreaterThanOrEqual(15);
      expect(s.skill).toBeLessThanOrEqual(95);
    }
  }
}

describe('audit: people invariants', () => {
  it('hold every quarter under random HR decisions', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const ind of IND_LIST.slice(0, 4)) {
      const g = newGame(opts({ industry: ind.id, city: CITIES[5].id, seed: `audit-people-${ind.id}`, mode: 'sandbox' }));
      for (let t = 0; t < 30 && g.status === 'playing'; t++) {
        simplePolicy(g);
        const c = g.company;
        for (let k = 0; k < 4; k++) {
          const o = c.offices[Math.floor(rnd() * c.offices.length)];
          const r = ROLES[Math.floor(rnd() * ROLES.length)];
          const x = rnd();
          if (x < 0.2) fire(g, o.id, r, Math.floor(rnd() * (o.staff[r].n + 2)));
          else if (x < 0.35) setReqs(g, o.id, r, rnd() * 20);
          else if (x < 0.45) setPay(g, o.id, 0.6 + rnd() * 1.1);
          else if (x < 0.55) setTraining(g, o.id, Math.floor(rnd() * 4));
          else if (x < 0.6) setBackfill(g, o.id, rnd() < 0.5);
          else if (x < 0.75 && g.candidates.length) hireExec(g, g.candidates[Math.floor(rnd() * g.candidates.length)].id);
          else if (x < 0.85) fireExec(g, c.people[Math.floor(rnd() * c.people.length)].id);
          else retain(g, c.people[Math.floor(rnd() * c.people.length)].id);
        }
        checkPeople(g, `${ind.id} t${g.turn} decisions`);
        endTurn(g);
        checkPeople(g, `${ind.id} t${g.turn}`);
        expect(findBadNumbers(g.company.offices)).toEqual([]);
      }
    }
  });
});
