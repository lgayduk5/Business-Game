// Head-to-Head Phase 1: seats, withSeat and markets resolved for several players at once.
import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/src/index';
import { mkKey } from '../engine/src/market';
import { pickRel, withSeat } from '../engine/src/seats';
import { marketSeat, markets } from '../engine/src/turn';
import { SEAT_KEYS, type GameState, type NewGameOpts, type SeatState } from '../engine/src/types';
import { rand } from '../engine/src/util';
import { opts } from './helpers';

const A = opts({ industry: 'saas', city: 'sfo', seed: 'duel-1', name: 'Alpha' });
const B = opts({ industry: 'saas', city: 'sfo', seed: 'duel-1', name: 'Beta', founder: 'sales' });

/** A two-seat state built by hand (Phase 2 brings newDuel): seat 0 from a, seat 1's private part from b. */
function duelOf(a: NewGameOpts, b: NewGameOpts): GameState {
  const g = newGame(a);
  const gb = newGame(b);
  const seat = (x: GameState) => Object.fromEntries(SEAT_KEYS.map((k) => [k, x[k]])) as SeatState;
  g.duel = { seats: [seat(g), seat(gb)], active: 0, phase: 'plan', sealed: [false, false] };
  for (const r of g.rivals) r.vs = [pickRel(r), pickRel(r)];
  return g;
}

const seatsFor = (g: GameState) => [0, 1].map((i) => marketSeat(g, (fn) => withSeat(g, i as 0 | 1, fn)));

describe('withSeat', () => {
  it('just runs the function in solo play', () => {
    const g = newGame(A);
    const c = g.company;
    expect(withSeat(g, 1, () => g.company)).toBe(c);
  });

  it('puts the seat in and takes it out again, also when the function throws', () => {
    const g = duelOf(A, B);
    const [s0, s1] = g.duel!.seats;
    const top = g.company;
    expect(withSeat(g, 1, () => g.company.name)).toBe('Beta');
    expect(g.company).toBe(top);
    expect(() => withSeat(g, 1, () => { throw new Error('boom'); })).toThrow('boom');
    expect(g.company).toBe(top);
    expect(s1.company.name).toBe('Beta');
    expect(s0.company.name).toBe('Alpha');
  });

  it('keeps what the function changed in the seat', () => {
    const g = duelOf(A, B);
    withSeat(g, 1, () => {
      g.company.books.cash += 123;
      g.flags.test = 5;
      g.status = 'lost';
    });
    expect(g.duel!.seats[1].flags.test).toBe(5);
    expect(g.duel!.seats[1].status).toBe('lost');
    expect(g.status).toBe('playing');
    expect(g.flags.test).toBeUndefined();
  });

  it('allows the same seat inside itself and refuses the other one', () => {
    const g = duelOf(A, B);
    expect(withSeat(g, 0, () => withSeat(g, 0, () => g.company.name))).toBe('Alpha');
    expect(() => withSeat(g, 0, () => withSeat(g, 1, () => 0))).toThrow();
    expect(withSeat(g, 1, () => g.company.name)).toBe('Beta'); // still usable afterwards
  });

  it("draws from the seat's own rng, or the world's when asked", () => {
    const g = duelOf(A, B);
    g.rng = 111;
    g.duel!.seats[0].rng = 222;
    g.duel!.seats[1].rng = 333;
    withSeat(g, 0, () => rand(g));
    expect(g.rng).toBe(111);
    expect(g.duel!.seats[0].rng).not.toBe(222);
    expect(g.duel!.seats[1].rng).toBe(333);
    withSeat(g, 1, () => rand(g), { worldRng: true });
    expect(g.rng).not.toBe(111);
    expect(g.duel!.seats[1].rng).toBe(333);
  });

  it("swaps each rival's standing with the seat", () => {
    const g = duelOf(A, B);
    const r = g.rivals[0];
    withSeat(g, 1, () => { r.relation = -80; r.grievances = 3; });
    expect(r.vs![1].relation).toBe(-80);
    expect(r.vs![1].grievances).toBe(3);
    expect(r.vs![0].relation).not.toBe(-80);
    expect(withSeat(g, 0, () => r.relation)).toBe(r.vs![0].relation);
    expect(withSeat(g, 1, () => r.relation)).toBe(-80);
  });

  it('carries the COO setting per seat', () => {
    const g = duelOf(A, B);
    g.duel!.seats[1].delegate = true;
    expect(withSeat(g, 1, () => g.settings.delegate)).toBe(true);
    expect(withSeat(g, 0, () => g.settings.delegate)).toBeFalsy();
  });
});

describe('markets with two players', () => {
  const named = (g: GameState) => {
    const out = new Map<string, number>();
    const add = (k: string, s: number) => out.set(k, (out.get(k) ?? 0) + s);
    for (const s of g.duel!.seats) for (const o of s.company.offices) add(mkKey(o.city, o.ind), o.share);
    for (const r of g.rivals) if (r.alive) for (const ro of r.offices) add(mkKey(ro.city, ro.ind), ro.share);
    return out;
  };

  it('an empty second seat changes nothing (solo numbers are the one-seat case)', () => {
    const solo = newGame(A);
    markets(solo);
    const g = duelOf(A, B);
    g.duel!.seats[1].company.offices = [];
    markets(g, seatsFor(g));
    expect(JSON.stringify(g.duel!.seats[0].company.offices)).toBe(JSON.stringify(solo.company.offices));
    expect(JSON.stringify(g.rivals.map((r) => r.offices))).toBe(JSON.stringify(solo.rivals.map((r) => r.offices)));
  });

  it('two players in one market share it with the rivals, never more than all of it', () => {
    const g = duelOf(A, B);
    const solo = newGame(A);
    for (let q = 0; q < 8; q++) {
      markets(g, seatsFor(g));
      markets(solo);
      for (const [k, s] of named(g)) expect(s, k).toBeLessThanOrEqual(1 + 1e-9);
    }
    const [a, b] = g.duel!.seats.map((s) => s.company.offices[0]);
    expect(a.city).toBe(b.city);
    expect(a.share).toBeGreaterThan(0);
    expect(b.share).toBeGreaterThan(0);
    // the second player takes customers the first would otherwise have won (shares themselves start capacity-bound)
    expect(a.last!.target).toBeLessThan(solo.company.offices[0].last!.target);
    expect(a.share).toBeLessThanOrEqual(solo.company.offices[0].share);
    expect(a.last!.attract.total).toBeCloseTo(b.last!.attract.total, 6);
  });
});
