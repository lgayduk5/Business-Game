// Save files: versioned JSON with light validation and forward migration.
import type { GameState } from './types';

export const SAVE_FORMAT = 'going-concern-save';
export const SAVE_VERSION = 1;

export interface SaveFile { format: string; v: number; saved: number; name: string; turn: number; state: GameState }

export function toSaveFile(g: GameState): SaveFile {
  return { format: SAVE_FORMAT, v: SAVE_VERSION, saved: Date.now(), name: g.company.name, turn: g.turn, state: g };
}

/** Parse and check a save file. Throws with a readable message if it is not one. */
export function fromSaveFile(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Going Concern save (it is not valid JSON).');
  }
  const f = data as Partial<SaveFile>;
  if (!f || f.format !== SAVE_FORMAT || typeof f.state !== 'object' || !f.state) throw new Error('That file is not a Going Concern save.');
  if ((f.v ?? 0) > SAVE_VERSION) throw new Error('This save comes from a newer version of the game. Update the app and try again.');
  return migrate(f.state as GameState);
}

/** Fill anything an older save is missing, so old games keep loading as the game grows. */
export function migrate(g: GameState): GameState {
  const need = ['company', 'macro', 'rivals', 'turn', 'rng', 'seed'] as const;
  for (const k of need) if (g[k] === undefined) throw new Error(`The save is damaged (missing ${k}).`);
  g.counters ??= {};
  g.streaks ??= {};
  g.flags ??= {};
  g.mods ??= [];
  g.queue ??= [];
  g.scheduled ??= [];
  g.targets ??= [];
  g.candidates ??= [];
  g.loanOffers ??= [];
  g.eventLog ??= [];
  g.news ??= [];
  g.advisor ??= [];
  g.history ??= [];
  g.attribution ??= { market: 0, strategy: 0, luck: 0, execution: 0, notes: [] };
  g.company.techInfo ??= {};
  g.company.open ??= { ...g.company.books };
  g.company.diligence ??= {};
  g.macro.prodIdx ??= 1;
  g.v = Math.max(g.v ?? 1, 1);
  return g;
}
