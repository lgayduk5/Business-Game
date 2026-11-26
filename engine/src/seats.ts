// Head-to-Head seats: one shared world, two players. withSeat puts one seat's private fields at the top level of
// the state, so every solo system (offices, finance, events, advisor, COO) runs unchanged for that player.
import { SEAT_KEYS, type GameState, type Rival, type RivalSeatRel, type SeatState } from './types';

/** A rival's standing with the player whose seat is in (Head-to-Head keeps one per seat in `r.vs`). */
export const RIVAL_SEAT_KEYS = ['relation', 'hostility', 'pactUntil', 'pact', 'lastMove', 'grievances', 'known', 'feud'] as const satisfies readonly (keyof RivalSeatRel)[];

type Bag = Record<string, unknown>;
function swapIn(top: Bag, seat: Bag, keys: readonly string[]): Bag {
  const parked: Bag = {};
  for (const k of keys) {
    parked[k] = top[k];
    top[k] = seat[k];
  }
  return parked;
}
function swapOut(top: Bag, seat: Bag, parked: Bag, keys: readonly string[]) {
  for (const k of keys) {
    seat[k] = top[k];
    top[k] = parked[k];
  }
}

/** The seat currently swapped in, if any (not saved: it only exists while withSeat runs). */
const inSeat = new WeakMap<GameState, number>();
export const seatIn = (g: GameState): number | undefined => inSeat.get(g);

export interface SeatOpts {
  /** Keep the world rng at g.rng while the seat is in (AI rivals and shared events draw from it). */
  worldRng?: boolean;
}

/**
 * Run fn with seat i's fields at the top level of g, then put them back (also when fn throws). In solo play (no
 * g.duel) it just runs fn. Calling it again for the same seat inside fn just runs fn; for the other seat, it throws.
 */
export function withSeat<T>(g: GameState, i: 0 | 1, fn: () => T, opts: SeatOpts = {}): T {
  const d = g.duel;
  if (!d) return fn();
  const cur = inSeat.get(g);
  if (cur === i) return fn();
  if (cur !== undefined) throw new Error(`withSeat(${i}) inside seat ${cur}`);
  const seat = d.seats[i] as unknown as Bag;
  const top = g as unknown as Bag;
  const keys = opts.worldRng ? SEAT_KEYS.filter((k) => k !== 'rng') : SEAT_KEYS;
  const parked = swapIn(top, seat, keys);
  const delegate = g.settings.delegate;
  g.settings.delegate = d.seats[i].delegate;
  const rivals: [Rival, Bag][] = [];
  for (const r of g.rivals) if (r.vs) rivals.push([r, swapIn(r as unknown as Bag, r.vs[i] as unknown as Bag, RIVAL_SEAT_KEYS)]);
  inSeat.set(g, i);
  try {
    return fn();
  } finally {
    inSeat.delete(g);
    // rivals that entered while the seat was in have no standing with either seat yet: both start from what the
    // entry left at the top level (Phase 2: give the other seat a fresh standing, e.g. known only to this seat)
    for (const r of g.rivals) if (!r.vs) r.vs = [pickRel(r), pickRel(r)];
    for (const [r, parkedR] of rivals) swapOut(r as unknown as Bag, r.vs![i] as unknown as Bag, parkedR, RIVAL_SEAT_KEYS);
    d.seats[i].delegate = g.settings.delegate;
    g.settings.delegate = delegate;
    swapOut(top, seat, parked, keys);
  }
}

/** A rival's standing with the player as it stands at the top level. */
export function pickRel(r: Rival): RivalSeatRel {
  const out: Bag = {};
  for (const k of RIVAL_SEAT_KEYS) out[k] = (r as unknown as Bag)[k];
  if (r.feud) out.feud = r.feud.map((f) => ({ ...f }));
  return out as unknown as RivalSeatRel;
}

/** Both seats' indices, for loops. */
export const SEATS = [0, 1] as const;

/** The seats of a game: two in Head-to-Head, none in solo. */
export const seatsOf = (g: GameState): SeatState[] => g.duel?.seats ?? [];
