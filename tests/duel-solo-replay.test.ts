// Solo guard for Head-to-Head: three full solo games recorded before the seats refactor must replay exactly,
// quarter by quarter (same state, same random draws). Regenerate the fixture only for an intended solo change:
// npx tsx scripts/solo-fixtures.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURE_GAMES, playFixture, type SoloFixture } from '../scripts/solo-fixtures';

const recorded = JSON.parse(readFileSync(new URL('./fixtures/solo-replay.json', import.meta.url), 'utf8')) as SoloFixture[];

describe('solo replay fixtures', () => {
  it('cover the recorded games', () => {
    expect(recorded.map((f) => f.opts.seed)).toEqual(FIXTURE_GAMES.map((s) => s.opts.seed));
  });
  for (const spec of FIXTURE_GAMES) {
    it(`${spec.opts.industry} (${spec.bot}, ${spec.opts.difficulty}) replays identically`, () => {
      const want = recorded.find((f) => f.opts.seed === spec.opts.seed)!;
      const got = playFixture(spec);
      const firstDiff = got.turns.findIndex((t, i) => t.hash !== want.turns[i]?.hash || t.rng !== want.turns[i]?.rng);
      expect(firstDiff, `first divergent quarter: ${got.turns[firstDiff]?.turn}`).toBe(-1);
      expect(got.turns.length).toBe(want.turns.length);
      expect(got.history).toEqual(want.history);
      expect(got.status).toBe(want.status);
    });
  }
});
