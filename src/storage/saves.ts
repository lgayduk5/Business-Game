// Save games in IndexedDB: one autosave per game, written every quarter, plus three manual slots.
// Falls back to memory if IndexedDB is unavailable (private browsing on some devices).
import { fromSaveFile, migrate, toSaveFile, turnLabel, type GameState } from '@engine';

export interface SaveMeta { slot: string; name: string; turn: number; when: number; label: string; industry: string; gameId: string }
interface Rec extends SaveMeta { state: GameState }

const DB = 'going-concern';
const STORE = 'saves';
const AUTO_KEEP = 6;
let dbp: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Rec>();

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      // done once committed: a full disk fails the commit after the request itself has succeeded
      t.oncomplete = () => resolve(r.result);
      t.onabort = t.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));
}

const meta = (slot: string, g: GameState): Rec => ({
  slot, name: g.company.name, turn: g.turn, when: Date.now(), label: turnLabel(g.turn), industry: g.company.primary, gameId: g.id,
  state: JSON.parse(JSON.stringify(g)) as GameState,
});

/** False if the browser did not keep the save (storage full or unavailable): it then lasts only until the page closes. */
export async function saveTo(slot: string, g: GameState): Promise<boolean> {
  const rec = meta(slot, g);
  memory.set(slot, rec);
  return (await tx('readwrite', (s) => s.put(rec))) !== undefined;
}
export async function autosave(g: GameState): Promise<boolean> {
  const ok = await saveTo('auto:' + g.id, g);
  const autos = (await listSaves()).filter((x) => x.slot.startsWith('auto:'));
  for (const old of autos.slice(AUTO_KEEP)) await deleteSave(old.slot);
  return ok;
}
async function listAll(): Promise<SaveMeta[]> {
  const all = ((await tx<Rec[]>('readonly', (s) => s.getAll() as IDBRequest<Rec[]>)) ?? [...memory.values()]) as Rec[];
  return all.map(({ state, ...m }) => (void state, m)).sort((a, b) => b.when - a.when);
}
/** Saved games the player can load (rewind points are kept apart). */
export async function listSaves(): Promise<SaveMeta[]> {
  return (await listAll()).filter((x) => !x.slot.startsWith(RW));
}

// Rewind points: the game as it stood at the start of each of its last few quarters.
const RW = 'rw:';
/** Keep the start of this quarter for rewinding, and drop points too old (or, after a rewind, too new) to use. */
export async function snapshot(g: GameState, keep: number): Promise<void> {
  if (g.status !== 'playing') return;
  await saveTo(`${RW}${g.id}:${g.turn}`, g);
  for (const s of (await listAll()).filter((x) => x.slot.startsWith(RW))) {
    const [, id, turn] = s.slot.split(':');
    if (id === g.id ? Number(turn) <= g.turn - keep || Number(turn) > g.turn : Date.now() - s.when > 30 * 864e5) await deleteSave(s.slot);
  }
}
/** Rewind points for a game, newest first. */
export async function snapshots(gameId: string): Promise<{ slot: string; turn: number }[]> {
  return (await listAll()).filter((x) => x.slot.startsWith(`${RW}${gameId}:`)).map((x) => ({ slot: x.slot, turn: x.turn })).sort((a, b) => b.turn - a.turn);
}
export async function dropSnapshots(gameId: string): Promise<void> {
  for (const s of await snapshots(gameId)) await deleteSave(s.slot);
}
/** A copy of the saved game, or null if there is none or it cannot be read (damaged, or from a newer version). */
export async function loadFrom(slot: string): Promise<GameState | null> {
  const rec = (await tx<Rec>('readonly', (s) => s.get(slot) as IDBRequest<Rec>)) ?? memory.get(slot);
  try {
    // a copy: the record kept in memory (no IndexedDB) must not change as the loaded game is played
    return rec ? migrate(JSON.parse(JSON.stringify(rec.state)) as GameState) : null;
  } catch {
    return null;
  }
}
export async function deleteSave(slot: string): Promise<void> {
  memory.delete(slot);
  await tx('readwrite', (s) => s.delete(slot));
}

/** Download the game as a .json save file. */
export function exportSave(g: GameState) {
  const blob = new Blob([JSON.stringify(toSaveFile(g))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${g.company.name.replace(/[^\w-]+/g, '_')}-${turnLabel(g.turn).replace(' ', '')}.goingconcern.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Read a save file chosen by the player. Throws a readable error if it is not one. */
export async function importSave(file: File): Promise<GameState> {
  const text = await file.text();
  return fromSaveFile(text);
}
