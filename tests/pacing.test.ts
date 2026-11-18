import { describe, expect, it } from 'vitest';
import { EVENT, EVENTS, autoDelegate, bindCtx, delegateChoice, delegateEvent, lowStakes, newGame, queueEvent, RIVAL_CARD_GAP, type GameState } from '../engine/src/index';
import { opts, play } from './helpers';

const fresh = (seed: string): GameState => {
  const g = play(newGame(opts({ seed })), 3, () => undefined);
  g.queue = [];
  return g;
};

describe('let the COO handle it', () => {
  it('never takes a crisis, a rival move, or anything that touches financing or ownership', () => {
    const g = fresh('coo-kinds');
    let small = 0;
    for (const e of EVENTS) {
      const ctx = bindCtx(g, e);
      if (!ctx) continue;
      g.queue = [];
      if (!queueEvent(g, e.id, ctx)) continue;
      const pe = g.queue[0];
      if (!lowStakes(g, pe)) continue;
      small++;
      expect(['stress', 'rival'], e.id).not.toContain(e.cat);
      for (const o of e.opts) for (const out of o.out) for (const f of out.fx ?? []) expect(['equity', 'loan', 'debtCall', 'dilute', 'valuation'], e.id).not.toContain(f[0]);
    }
    expect(small).toBeGreaterThan(5); // there are small cards to hand over
  });
  it('picks an allowed option, resolves the card and takes it off the queue', () => {
    const g = fresh('coo-resolve');
    const e = EVENTS.find((x) => {
      const ctx = bindCtx(g, x);
      g.queue = [];
      return ctx && queueEvent(g, x.id, ctx) && lowStakes(g, g.queue[0]);
    })!;
    expect(e).toBeTruthy();
    const pe = g.queue[0];
    const i = delegateChoice(g, pe);
    expect(i).toBeGreaterThanOrEqual(0);
    const res = delegateEvent(g, pe.uid);
    expect(res?.choice).toBeTruthy();
    expect(g.queue.length).toBe(0);
    expect(g.eventLog[g.eventLog.length - 1].id).toBe(e.id);
  });
  it('refuses a card that is not small', () => {
    const g = fresh('coo-big');
    const e = EVENTS.find((x) => x.cat === 'stress' && bindCtx(g, x))!;
    g.queue = [];
    queueEvent(g, e.id, bindCtx(g, e)!);
    expect(delegateEvent(g, g.queue[0].uid)).toBeNull();
    expect(g.queue.length).toBe(1);
  });
  it('only acts on its own when the setting is on', () => {
    const g = fresh('coo-setting');
    const e = EVENTS.find((x) => {
      const ctx = bindCtx(g, x);
      g.queue = [];
      return ctx && queueEvent(g, x.id, ctx) && lowStakes(g, g.queue[0]);
    })!;
    g.settings.delegate = false;
    expect(autoDelegate(g)).toEqual([]);
    expect(g.queue.length).toBe(1);
    g.settings.delegate = true;
    expect(autoDelegate(g).map((r) => r.title).length).toBe(1);
    expect(g.queue.length).toBe(0);
    expect(EVENT[e.id]).toBeTruthy();
  });
});

describe('pacing', () => {
  it('fewer than half of quarters open with a decision card', () => {
    let quarters = 0, withCard = 0;
    for (const ind of ['saas', 'retail', 'mfg'] as const) {
      for (let s = 0; s < 3; s++) {
        const g = newGame(opts({ industry: ind, seed: `pace-${ind}-${s}` }));
        while (g.status === 'playing' && g.turn < 40) {
          quarters++;
          if (g.queue.length) withCard++;
          play(g, 1);
        }
      }
    }
    expect(quarters).toBeGreaterThan(200);
    expect(withCard / quarters).toBeLessThan(0.5);
  });
  it('rival moves come as a card at most once every four quarters (follow-ups to your own choices aside)', () => {
    const g = newGame(opts({ seed: 'pace-rival' }));
    const seen: number[] = [];
    for (let i = 0; i < 40 && g.status === 'playing'; i++) {
      if (g.queue.some((e) => EVENT[e.id].cat === 'rival' && e.turn === g.turn - 1)) seen.push(g.turn);
      play(g, 1);
    }
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(RIVAL_CARD_GAP);
  });
});
