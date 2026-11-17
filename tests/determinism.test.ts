import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/src/index';
import { opts, play } from './helpers';

const strip = (g: unknown) => JSON.stringify({ ...(g as object), id: 0, created: 0 });

describe('determinism', () => {
  it('same seed and actions give an identical game', () => {
    const a = play(newGame(opts({ seed: 'alpha' })), 30);
    const b = play(newGame(opts({ seed: 'alpha' })), 30);
    expect(strip(a)).toEqual(strip(b));
  });
  it('different seeds diverge', () => {
    const a = play(newGame(opts({ seed: 'alpha' })), 12);
    const b = play(newGame(opts({ seed: 'beta' })), 12);
    expect(strip(a)).not.toEqual(strip(b));
  });
  it('a game survives a save/load round trip mid-play', () => {
    const a = play(newGame(opts({ seed: 'gamma' })), 10);
    const b = JSON.parse(JSON.stringify(a));
    play(a, 10);
    play(b, 10);
    expect(strip(a)).toEqual(strip(b));
  });
});
