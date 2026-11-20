// Music: which arrangement and cue the game state calls for, and the rules every synthesised piece follows.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { newGame } from '../engine/src/index';
import { moodOf, quarterCue } from '../src/music/mood';
import { opts, play } from './helpers';

function game() {
  const g = newGame(opts());
  play(g, 3);
  const q = g.company.quarters[g.company.quarters.length - 1];
  // a comfortable position: no burn, plenty of cash
  q.cf.cfo = 100;
  q.cf.capex = 0;
  g.company.books.cash = 1e6;
  g.macro.phase = 'expansion';
  return { g, q };
}

describe('desk track mood', () => {
  it('follows the business cycle', () => {
    const { g } = game();
    expect(moodOf(g)).toBe('calm');
    g.macro.phase = 'recovery';
    expect(moodOf(g)).toBe('calm');
    g.macro.phase = 'boom';
    expect(moodOf(g)).toBe('boom');
    g.macro.phase = 'slowdown';
    expect(moodOf(g)).toBe('downturn');
    g.macro.phase = 'recession';
    expect(moodOf(g)).toBe('downturn');
  });

  it('turns to crisis under two quarters of runway, whatever the economy', () => {
    const { g, q } = game();
    g.macro.phase = 'boom';
    q.cf.cfo = -400;
    q.cf.capex = -100; // burning 500 a quarter
    g.company.books.cash = 999;
    expect(moodOf(g)).toBe('crisis');
    g.company.books.cash = 1001;
    expect(moodOf(g)).toBe('boom');
    g.company.books.cash = -1;
    q.cf.cfo = 100;
    expect(moodOf(g)).toBe('crisis');
  });
});

describe('quarter cue', () => {
  it('is unresolved after a loss and lifted after a profitable record quarter', () => {
    const { g, q } = game();
    const prior = g.company.quarters.slice(0, -1);
    const best = Math.max(...prior.map((p) => p.pnl.revenue));
    q.ni = -1;
    expect(quarterCue(g)).toBe('badQuarter');
    q.ni = 1;
    q.pnl.revenue = best + 1;
    expect(quarterCue(g)).toBe('goodQuarter');
    q.pnl.revenue = best;
    expect(quarterCue(g)).toBe('quarter');
  });

  it('is neutral with no earlier quarter to beat', () => {
    const { g, q } = game();
    q.ni = 1;
    g.company.quarters = [q];
    expect(quarterCue(g)).toBe('quarter');
    g.company.quarters = [];
    expect(quarterCue(g)).toBe('quarter');
  });
});

describe('music modules', () => {
  const dir = new URL('../src/music/', import.meta.url);
  const pieces = readdirSync(dir).filter((f) => f.endsWith('.js'));

  it('exist for the title, the desk and the cues', () => {
    expect(pieces.sort()).toEqual(['opening-bell.js', 'paper-minimalism.js', 'stingers.js']);
  });

  it.each(pieces)('%s synthesises everything itself and lets the host drive time', (f) => {
    const src = readFileSync(new URL(f, dir), 'utf8');
    // no timers (the host schedules), no unseeded randomness, no imports, files or network
    expect(src).not.toMatch(/\b(setTimeout|setInterval|requestAnimationFrame|Math\.random|fetch|XMLHttpRequest)\b/);
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/\.(mp3|wav|ogg|m4a)\b/);
  });
});
