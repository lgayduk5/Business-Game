// Records full solo games (state hash and rng after every quarter, plus the history) so a refactor of the turn
// can prove that solo play is unchanged: tests/duel-solo-replay.test.ts replays them and compares.
//   npx tsx scripts/solo-fixtures.ts           write tests/fixtures/solo-replay.json (only before an intended change)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { BOTS, botTurn } from '../engine/src/bots';
import { endTurn, newGame } from '../engine/src/index';
import type { GameState, NewGameOpts } from '../engine/src/types';

export interface SoloFixture { opts: NewGameOpts; bot: string; delegate: boolean; turns: { turn: number; rng: number; hash: string }[]; history: GameState['history']; status: string }

/** Games chosen to cover different industries, difficulties and styles (rival fights, acquisitions, debt, the COO). */
export const FIXTURE_GAMES: { opts: NewGameOpts; bot: string; delegate: boolean }[] = [
  { opts: { name: 'Fx1', industry: 'saas', city: 'sfo', founder: 'engineer', difficulty: 'normal', seed: 'fx-saas', mode: 'standard' }, bot: 'blitz', delegate: true },
  { opts: { name: 'Fx2', industry: 'mfg', city: 'szx', founder: 'operator', difficulty: 'hard', seed: 'fx-mfg', mode: 'standard' }, bot: 'leveraged', delegate: false },
  { opts: { name: 'Fx3', industry: 'retail', city: 'nyc', founder: 'finance', difficulty: 'brutal', seed: 'fx-retail', mode: 'standard' }, bot: 'raider', delegate: false },
];

export const stateHash = (g: GameState) => createHash('sha1').update(JSON.stringify({ ...g, id: 0, created: 0 })).digest('hex').slice(0, 16);

export function playFixture(spec: { opts: NewGameOpts; bot: string; delegate: boolean }, step: (g: GameState) => void = endTurn): SoloFixture {
  const g = newGame(spec.opts);
  g.settings.delegate = spec.delegate;
  const turns: SoloFixture['turns'] = [{ turn: g.turn, rng: g.rng, hash: stateHash(g) }];
  while (g.status === 'playing' && g.turn < g.maxTurns) {
    botTurn(g, BOTS[spec.bot]);
    if (g.status !== 'playing') break;
    step(g);
    turns.push({ turn: g.turn, rng: g.rng, hash: stateHash(g) });
  }
  return { ...spec, turns, history: g.history, status: g.status };
}

if (process.argv[1]?.endsWith('solo-fixtures.ts')) {
  const out = FIXTURE_GAMES.map((s) => playFixture(s));
  writeFileSync(new URL('../tests/fixtures/solo-replay.json', import.meta.url), JSON.stringify(out) + '\n');
  for (const f of out) console.log(`${f.opts.industry}/${f.bot}: ${f.turns.length - 1} quarters, ${f.status}`);
}
