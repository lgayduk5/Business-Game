// Save files: versioned JSON with light validation and numbered, forward-only migrations.
//
// `GameState.v` is the schema version of the state itself. When a change to GameState would break an
// older save, bump SAVE_VERSION and add a step to MIGRATIONS that turns a version N state into N + 1.
// Steps run in order, so a save from any older version is brought all the way forward. Additions that
// only need a default value go in fillDefaults(), which runs after the steps on every load.
import { CITY } from './content';
import type { GameState } from './types';

export const SAVE_FORMAT = 'going-concern-save';
export const SAVE_VERSION = 3;

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
  if ((f.v ?? 0) > SAVE_VERSION || ((f.state as GameState).v ?? 0) > SAVE_VERSION) throw new Error('This save comes from a newer version of the game. Update the app and try again.');
  return migrate(f.state as GameState);
}

type Step = (g: GameState) => void;
/** MIGRATIONS[n] upgrades a version-n state to version n + 1. */
export const MIGRATIONS: Record<number, Step> = {
  // v1 → v2: buybacks used to retire shares without taking them from any holder, so older cap tables
  // can add up to more than the share count. Scale the outside holders down to fit.
  1: (g) => {
    const cap = g.company?.cap;
    if (!cap) return;
    const outside = cap.holders.reduce((s, h) => s + h.shares, 0);
    const room = Math.max(0, cap.shares - cap.founder);
    if (outside > room + 1 && outside > 0) for (const h of cap.holders) h.shares *= room / outside;
  },
  // v2 → v3: tax losses are pooled by country (the old single pool belonged to the home country), Toronto
  // trades in its own currency, and rivals keep full accounts (EBITDA, working capital, credit, equity raised).
  2: (g) => {
    const c = g.company;
    c.nolBy ??= c.nol > 0 ? { [CITY[c.home]?.country ?? 'US']: c.nol } : {};
    g.macro.fx.cad ??= 1;
    for (const r of g.rivals ?? []) {
      const margin = r.rev > 0 ? Math.max(-0.5, Math.min(0.6, r.profit / r.rev / 0.75)) : 0.1;
      r.ebitda ??= r.rev * margin;
      r.ebitdaTTM ??= (r.revTTM ?? []).map((x) => x * margin);
      r.ar ??= r.rev * 0.5;
      r.inv ??= 0;
      r.wc ??= r.ar * 0.6;
      r.nolBy ??= {};
      r.spread ??= 3.5;
      r.rating ??= 'BB';
      r.raised ??= 0;
      r.lastRaise ??= -99;
    }
  },
};

/** Bring a state from any older version up to SAVE_VERSION, then fill anything still missing. */
export function migrate(g: GameState): GameState {
  const need = ['company', 'macro', 'rivals', 'turn', 'rng', 'seed'] as const;
  for (const k of need) if (g[k] === undefined) throw new Error(`The save is damaged (missing ${k}).`);
  let v = Math.max(1, g.v ?? 1);
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(g);
    v++;
  }
  g.v = v;
  fillDefaults(g);
  return g;
}

/** Defaults for fields added after a save was written. Safe to run on any state, any number of times. */
export function fillDefaults(g: GameState): GameState {
  g.counters ??= {};
  g.settings.delegate ??= true;
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
  // starting values for the end-of-game grade (older saves: the earliest record there is)
  g.counters.startRevenue ??= g.history[0]?.revenue ? g.history[0].revenue * 4 : 0;
  g.counters.startFounderValue ??= (g.counters.startValuation ?? g.history[0]?.valuation ?? 1) * 0.8;
  g.rivals.forEach((r, i) => (g.counters[`rivalStart${r.id}`] ??= g.history[0]?.rivals?.[i] || r.valuation || 1));
  return g;
}
