import type { GameState } from './types';

// ── deterministic RNG (mulberry32). State lives in GameState.rng so saves replay identically.
export function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rand(g: GameState): number {
  let t = (g.rng += 0x6d2b79f5);
  g.rng = g.rng >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (g: GameState, a: number, b: number) => a + (b - a) * rand(g);
export const randInt = (g: GameState, a: number, b: number) => Math.floor(randRange(g, a, b + 1));
export const chance = (g: GameState, p: number) => rand(g) < p;
export function normal(g: GameState, mean = 0, sd = 1): number {
  const u = Math.max(1e-9, rand(g));
  const v = rand(g);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function pick<T>(g: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(g) * arr.length)];
}
export function weighted<T>(g: GameState, items: readonly T[], w: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, w(it));
  if (total <= 0) return undefined;
  let r = rand(g) * total;
  for (const it of items) {
    r -= Math.max(0, w(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
/** Rounds a fractional count stochastically so small rates still bite. */
export function stochRound(g: GameState, x: number): number {
  const f = Math.floor(x);
  return f + (rand(g) < x - f ? 1 : 0);
}
export function shuffle<T>(g: GameState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const nextUid = (g: GameState) => ++g.uid;

export const yearOf = (turn: number) => 1 + Math.floor(turn / 4);
export const quarterOf = (turn: number) => (turn % 4) + 1;
export const turnLabel = (turn: number) => `Y${yearOf(turn)} Q${quarterOf(turn)}`;

// ── formatting
export function money(x: number, digits = 1): string {
  if (!isFinite(x)) return '—';
  const s = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : digits)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : digits)}K`;
  return `${s}$${a.toFixed(0)}`;
}
export function num(x: number, digits = 0): string {
  if (!isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(x / 1e3).toFixed(0)}K`;
  return x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export const pct = (x: number, digits = 0) => (isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—');
export const signed = (x: number, digits = 0) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;
export const signedPct = (x: number, digits = 0) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%`;
