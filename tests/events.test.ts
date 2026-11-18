import { describe, expect, it } from 'vitest';
import { EVENTS, MONEY_SPECIALS, SPECIALS, bindCtx, endTurn, evalCond, moneyText, newGame, queueEvent, resolveEvent, scaleS, type GameState } from '../engine/src/index';
import { opts, play } from './helpers';

const rich = (): GameState => {
  const g = newGame(opts({ founder: 'heir', seed: 'money' }));
  g.company.books.cash += 50e6;
  g.company.books.paidIn += 50e6;
  g.company.open = { ...g.company.books };
  play(g, 3, () => undefined);
  g.queue = [];
  return g;
};

describe('event cards say what they cost', () => {
  it('every option that moves cash shows the amount before you choose it', () => {
    const base = rich();
    const silent: string[] = [];
    for (const e of EVENTS) {
      for (let i = 0; i < e.opts.length; i++) {
        const g: GameState = JSON.parse(JSON.stringify(base));
        const ctx = bindCtx(g, e) ?? {};
        if (!queueEvent(g, e.id, ctx) || !evalCond(g, e.opts[i].req, ctx)) continue;
        const shown = moneyText(g, ctx, e.opts[i]);
        const S = scaleS(g);
        // try several draws so options with uncertain outcomes are tested on more than one of them
        for (let k = 0; k < 4; k++) {
          const h: GameState = JSON.parse(JSON.stringify(g));
          h.rng = (h.rng + k * 7919) >>> 0;
          const cash = h.company.books.cash;
          resolveEvent(h, h.queue[0].uid, i);
          if (Math.abs(h.company.books.cash - cash) > 0.03 * S && !shown) silent.push(`${e.id} option ${i} "${e.opts[i].label}" moved ${Math.round(h.company.books.cash - cash)} without saying so`);
        }
      }
    }
    expect(silent).toEqual([]);
  });
  it('a certain cost is shown as a single amount', () => {
    const g = rich();
    const opt = { label: 'x', hint: 'y', out: [{ text: 'a', fx: [['cost', 0.1]] }] } as never;
    expect(moneyText(g, {}, opt)).toMatch(/^Costs ~\$/);
    const two = { label: 'x', hint: 'y', out: [{ text: 'a', fx: [['cost', 0.1]] }, { text: 'b', fx: [['cost', 0.3]] }] } as never;
    expect(moneyText(g, {}, two)).toMatch(/^Costs ~\$.+ to ~\$/);
    expect(moneyText(g, {}, { label: 'x', hint: 'y', out: [{ text: 'a', fx: [['morale', 3]] }] } as never)).toBe('');
  });
  it('every special effect that moves cash is valued for the card', () => {
    const base = rich();
    endTurn(base);
    base.queue = [];
    const missing: string[] = [];
    for (const [name, fn] of Object.entries(SPECIALS)) {
      if (['sellCompany', 'takeover', 'oust'].includes(name)) continue; // these end the game
      const g: GameState = JSON.parse(JSON.stringify(base));
      g.company.cap.isPublic = true; // so buybacks can run
      g.company.cap.price = Math.max(1, g.company.cap.price);
      const ctx = { rival: g.rivals[0].id, loan: g.company.loans[0]?.id, office: g.company.offices[0].id, city: g.company.offices[0].city, region: 'naw' as const };
      const cash = g.company.books.cash;
      fn(g, ctx, 1);
      if (Math.abs(g.company.books.cash - cash) > 1000 && !MONEY_SPECIALS.has(name)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});

describe('new cards from the review', () => {
  it('a take-private offer ends the game with a grade, judged on the price paid', () => {
    const g = newGame(opts({ seed: 'exit' }));
    g.company.cap.isPublic = true;
    const before = g.company.valuation;
    g.queue = [];
    expect(queueEvent(g, 'take_private', {})).toBe(true);
    resolveEvent(g, g.queue[0].uid, 0);
    expect(g.status).not.toBe('playing');
    expect(g.outcome?.how).toBe('exit');
    expect(g.outcome?.grade).toMatch(/^[A-F]$/);
    expect(g.company.valuation).toBeCloseTo(before * 1.3, 0);
  });
  it('the biggest-customer card needs a large receivables book; the old-colleague card needs a recent departure', () => {
    const g = newGame(opts({ industry: 'consulting', seed: 'conds' }));
    play(g, 2, () => undefined);
    const rev = g.company.quarters[g.company.quarters.length - 1].pnl.revenue;
    g.company.books.ar = 0.1 * rev;
    expect(evalCond(g, { minAR: 0.6 })).toBe(false);
    g.company.books.ar = rev;
    expect(evalCond(g, { minAR: 0.6 })).toBe(true);
    expect(evalCond(g, { keyLeftWithin: 8 })).toBe(false);
    g.counters.keyLeft = g.turn - 3;
    expect(evalCond(g, { keyLeftWithin: 8 })).toBe(true);
  });
  it('the union drive leads to a first contract', () => {
    const g = newGame(opts({ seed: 'union' }));
    g.queue = [];
    queueEvent(g, 'union', bindCtx(g, EVENTS.find((e) => e.id === 'union')!)!);
    resolveEvent(g, g.queue[0].uid, 0);
    expect(g.scheduled.some((s) => s.id === 'union_contract')).toBe(true);
  });
});
