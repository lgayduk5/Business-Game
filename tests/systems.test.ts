import { describe, expect, it } from 'vitest';
import {
  EVENT, EVENTS, INV, INVESTMENTS, acquireTarget, bindCtx, cancelInvestment, curveMult, diligence, diligenceTarget, endTurn, evalCond, invSum, newGame, queueEvent,
  resolveEvent, spawnTarget, startInvestment, viewEvent,
} from '../engine/src/index';
import { findBadNumbers, opts, play } from './helpers';

const rich = () => {
  const g = newGame(opts({ founder: 'heir', seed: 'inv' }));
  g.company.books.cash += 50e6;
  g.company.books.paidIn += 50e6;
  g.company.open = { ...g.company.books };
  return g;
};
const tied = (g: ReturnType<typeof rich>) => {
  endTurn(g);
  const q = g.company.quarters[g.company.quarters.length - 1];
  expect(Math.abs(q.check.bs)).toBeLessThan(1);
  expect(Math.abs(q.check.cash)).toBeLessThan(1);
};

describe('investments', () => {
  it('payoff curves have the right shapes', () => {
    const at = (curve: string, life: number, age: number) => curveMult({ curve, life } as never, { state: 'active', age } as never);
    expect(at('steady', 0, 5)).toBe(1);
    expect(at('backloaded', 8, 1)).toBeLessThan(at('backloaded', 8, 6));
    expect(at('backloaded', 8, 20)).toBe(1);
    expect(at('decaying', 6, 0)).toBeGreaterThan(at('decaying', 6, 4));
  });
  it('cost money up front, ramp, then deliver their effect', () => {
    const g = rich();
    const cash = g.company.books.cash;
    expect(startInvestment(g, 'culture_program').ok).toBe(true);
    expect(g.company.books.cash).toBeLessThan(cash);
    expect(invSum(g, 'culture')).toBe(0); // still ramping
    tied(g);
    tied(g);
    expect(invSum(g, 'culture')).toBeGreaterThan(0);
    expect(startInvestment(g, 'culture_program').ok).toBe(false); // unique
  });
  it('every available investment can be started and keeps the books tied', () => {
    const g = rich();
    play(g, 4, () => undefined);
    let started = 0;
    for (const d of INVESTMENTS) {
      const scope = d.scope === 'office' ? g.company.offices[0].id : d.scope === 'region' ? 'naw' : undefined;
      if (startInvestment(g, d.id, scope).ok) started++;
    }
    expect(started).toBeGreaterThan(10);
    for (let i = 0; i < 12; i++) {
      g.queue = [];
      tied(g);
    }
    for (const inv of g.company.investments.slice(0, 6)) cancelInvestment(g, inv.uid);
    tied(g);
    expect(findBadNumbers(g)).toEqual([]);
  });
  it('traps understate their risk until due diligence reveals it', () => {
    const traps = INVESTMENTS.filter((d) => d.trap);
    expect(traps.length).toBeGreaterThanOrEqual(4);
    for (const d of traps) {
      expect(d.truth, d.id).toBeTruthy();
      if (d.risk) expect(d.risk.shownP, d.id).toBeLessThan(d.risk.p);
    }
    const g = rich();
    expect(diligence(g, traps[0].id).ok).toBe(true);
    expect(g.company.diligence[traps[0].id]).toBe(true);
  });
  it('staged projects pay stage by stage and end in success or failure', () => {
    const g = rich();
    expect(startInvestment(g, 'platform').ok).toBe(true);
    const total = INV.platform.stages!.reduce((s, st) => s + st.q, 0);
    for (let i = 0; i < total + 1; i++) {
      g.queue = [];
      tied(g);
    }
    expect(['active', 'failed']).toContain(g.company.investments[0].state);
  });
});

describe('events', () => {
  it('every event can be bound, shown and resolved on every option without breaking the books', () => {
    for (const e of EVENTS) {
      for (let i = 0; i < e.opts.length; i++) {
        const g = rich();
        play(g, 3, () => undefined);
        g.queue = [];
        const ctx = bindCtx(g, e) ?? {};
        expect(queueEvent(g, e.id, ctx), e.id).toBe(true);
        const v = viewEvent(g, g.queue[0]);
        expect(v.text).not.toContain('{');
        if (!evalCond(g, e.opts[i].req, ctx)) continue;
        const res = resolveEvent(g, g.queue[0].uid, i);
        expect(res, `${e.id} option ${i}`).toBeTruthy();
        expect(res!.text).not.toContain('{');
        g.queue = [];
        tied(g);
        expect(findBadNumbers(g), `${e.id} option ${i}`).toEqual([]);
      }
    }
  });
  it('chains schedule their follow-ups', () => {
    const g = rich();
    queueEvent(g, 'exclusive_reseller', bindCtx(g, EVENT.exclusive_reseller)!);
    let scheduled = false;
    for (let i = 0; i < 30 && !scheduled; i++) {
      const h = JSON.parse(JSON.stringify(g));
      h.rng = i * 7919;
      resolveEvent(h, h.queue[0].uid, 0);
      scheduled = h.scheduled.some((s: { id: string }) => s.id === 'reseller_squeeze');
    }
    expect(scheduled).toBe(true);
  });
});

describe('acquisitions', () => {
  it('buying a target adds an office, goodwill and people', () => {
    const g = rich();
    play(g, 2, () => undefined);
    const t = spawnTarget(g)!;
    expect(diligenceTarget(g, t.id).ok).toBe(true);
    const offices = g.company.offices.length;
    expect(acquireTarget(g, t.id).ok).toBe(true);
    expect(g.company.offices.length).toBeGreaterThanOrEqual(offices);
    expect(g.company.books.goodwill).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) {
      g.queue = [];
      tied(g);
    }
  });
});
