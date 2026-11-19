// Regression tests from the audit of saving, loading and the browser storage around it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOTS, botTurn } from '../engine/src/bots';
import {
  REWIND_QUARTERS, endTurn, fromSaveFile, migrate, newGame, rewindTo, runQuarters, toSaveFile, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

/** JSON with keys sorted: a key set to undefined and later given a value moves in a reloaded game, which is not a difference. */
const canon = (x: unknown) => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The storage module afresh (it keeps its database handle and in-memory saves at module level). */
async function storage(idb?: unknown) {
  vi.resetModules();
  vi.unstubAllGlobals();
  if (idb) vi.stubGlobal('indexedDB', idb);
  return import('../src/storage/saves');
}
afterEach(() => vi.unstubAllGlobals());

/**
 * Just enough of IndexedDB for the storage module: requests succeed, then the transaction commits, unless `fail()`
 * says the disk is full, in which case a write's request still succeeds but its transaction aborts (as browsers do).
 */
function fakeIndexedDB(fail: () => boolean = () => false) {
  const data = new Map<string, unknown>();
  const later = (f: () => void) => setTimeout(f, 0);
  const db = {
    transaction(_store: string, mode: string) {
      const t: Record<string, (() => void) | unknown> = {};
      const staged: (() => void)[] = [];
      const req = (result: () => unknown, commit?: () => void) => {
        const r: Record<string, unknown> = {};
        later(() => {
          r.result = result();
          if (commit) staged.push(commit);
          (r.onsuccess as (() => void) | undefined)?.();
        });
        return r;
      };
      t.objectStore = () => ({
        put: (rec: { slot: string }) => { const c = structuredClone(rec); return req(() => rec.slot, () => data.set(rec.slot, c)); },
        get: (k: string) => req(() => structuredClone(data.get(k))),
        getAll: () => req(() => [...data.values()].map((x) => structuredClone(x))),
        delete: (k: string) => req(() => undefined, () => data.delete(k)),
      });
      later(() => later(() => {
        if (mode === 'readwrite' && fail()) return (t.onabort as (() => void) | undefined)?.();
        for (const c of staged) c();
        (t.oncomplete as (() => void) | undefined)?.();
      }));
      return t;
    },
  };
  return {
    data,
    open() {
      const r: Record<string, unknown> = { result: db };
      later(() => (r.onsuccess as () => void)());
      return r;
    },
  };
}

describe('save and load round trip', () => {
  it('a game saved and loaded every few quarters, mid-quarter too, plays on exactly like one that never was', async () => {
    const S = await storage(); // no IndexedDB here: the in-memory store
    const bot = BOTS[Object.keys(BOTS)[2]];
    const a = newGame(opts({ seed: 'twin', sprint: true }));
    let b = fromSaveFile(JSON.stringify(toSaveFile(a)));
    for (let t = 0; t < 24 && a.status === 'playing'; t++) {
      botTurn(a, bot);
      botTurn(b, bot);
      if (t % 3 === 1) {
        await S.saveTo('slot1', b);
        b = (await S.loadFrom('slot1'))!;
      }
      endTurn(a);
      endTurn(b);
      if (t % 4 === 0) b = fromSaveFile(JSON.stringify(toSaveFile(b)));
    }
    expect(a.turn).toBeGreaterThan(10);
    expect(canon(b)).toBe(canon(a));
  });
});

describe('browser storage', () => {
  it('loading a game kept in memory gives a copy: playing it on does not change the save', async () => {
    const S = await storage();
    const g = play(newGame(opts({ seed: 'alias' })), 3);
    await S.saveTo('slot1', g);
    const a = (await S.loadFrom('slot1'))!;
    play(a, 3);
    const b = (await S.loadFrom('slot1'))!;
    expect(a.turn).toBe(6);
    expect(b.turn).toBe(3);
    expect((await S.listSaves()).find((x) => x.slot === 'slot1')!.turn).toBe(3);
  });

  it('a game written by a newer version is refused from the browser as from a file, and a damaged one reads as nothing', async () => {
    const g = newGame(opts({ seed: 'newer' }));
    const newer = { ...copy(g), v: 99 };
    expect(() => migrate(copy(newer))).toThrow(/newer version/);
    expect(() => fromSaveFile(JSON.stringify(toSaveFile(newer)))).toThrow(/newer version/);
    const S = await storage();
    await S.saveTo('auto:new', newer);
    expect(await S.loadFrom('auto:new')).toBeNull();
    await S.saveTo('slot2', { ...copy(g), macro: undefined } as unknown as GameState);
    expect(await S.loadFrom('slot2')).toBeNull();
    expect(await S.loadFrom('slot3')).toBeNull();
  });

  it('a save the browser fails to commit (storage full) is reported as not kept', async () => {
    let full = false;
    const idb = fakeIndexedDB(() => full);
    const S = await storage(idb);
    const g = play(newGame(opts({ seed: 'quota' })), 2);
    expect(await S.saveTo('slot1', g)).toBe(true);
    expect((await S.loadFrom('slot1'))!.turn).toBe(2);
    full = true;
    expect(await S.autosave(g)).toBe(false);
    expect(idb.data.has('auto:' + g.id)).toBe(false);
    full = false;
    expect(await S.autosave(g)).toBe(true);
    expect(idb.data.has('auto:' + g.id)).toBe(true);
    // with no IndexedDB at all the game lives only as long as the page
    const M = await storage();
    expect(await M.saveTo('slot1', g)).toBe(false);
    expect((await M.loadFrom('slot1'))!.turn).toBe(2);
  });
});

describe('rewinding', () => {
  it('a fast-forward into the end of the game still leaves the last four quarters to rewind to', async () => {
    const S = await storage();
    const bot = BOTS[Object.keys(BOTS)[0]];
    const g = newGame(opts({ seed: 'ff2', sprint: true }));
    g.settings.sandbox.noEvents = true; // no cards to stop the fast-forward
    // as the game screen does: a rewind point when the game starts, then after every quarter (or run of quarters)
    await S.snapshot(g, REWIND_QUARTERS);
    let last = { n: 0, starts: [] as GameState[] };
    while (g.status === 'playing') {
      botTurn(g, bot);
      last = runQuarters(g, g.turn < 32 ? 1 : 8);
      for (const s of [...last.starts, g]) await S.snapshot(s, REWIND_QUARTERS);
    }
    expect(last.n).toBeGreaterThan(REWIND_QUARTERS); // the game ended inside a long fast-forward
    const end = g.outcome!.turn;
    expect(last.starts.map((s) => s.turn)).toEqual([end - 3, end - 2, end - 1, end]);
    const points = (await S.snapshots(g.id)).slice(0, REWIND_QUARTERS);
    expect(points.map((p) => p.turn)).toEqual([end, end - 1, end - 2, end - 3]);
    for (const p of points) expect(rewindTo(g, (await S.loadFrom(p.slot))!).turn).toBe(p.turn);
  });

  it('the quarter starts a fast-forward hands back are the ones stepping a quarter at a time gives', () => {
    const a = play(newGame(opts({ seed: 'steps' })), 2);
    a.settings.sandbox.noEvents = true;
    const b = copy(a);
    const r = runQuarters(a, 8);
    const seen: string[] = [];
    for (let i = 0; i < r.n; i++) {
      if (i) seen.push(canon(b));
      endTurn(b);
    }
    expect(r.starts.map(canon)).toEqual(seen.slice(-REWIND_QUARTERS));
    expect(canon(r.state)).toBe(canon(b));
    expect(runQuarters(newGame(opts({ seed: 'iron', ironman: true })), 3).starts).toEqual([]);
  });
});

describe('the engine worker bridge', () => {
  it('a quarter the engine cannot finish rejects (it used to hang behind the busy screen) and leaves the game as it was', async () => {
    vi.resetModules();
    const { runTurns } = await import('../src/ui/store');
    const g = play(newGame(opts({ seed: 'crash' })), 2);
    g.company.offices[0].city = 'nowhere'; // damaged: no such city
    const before = JSON.stringify(g);
    await expect(runTurns(g, 1)).rejects.toThrow();
    expect(JSON.stringify(g)).toBe(before);
    // and when the worker fails as well, the error still reaches the caller
    class FailingWorker {
      onerror: ((e: unknown) => void) | null = null;
      postMessage() {
        setTimeout(() => this.onerror?.({}), 0);
      }
    }
    vi.stubGlobal('Worker', FailingWorker);
    await expect(runTurns(g, 1)).rejects.toThrow();
    expect(JSON.stringify(g)).toBe(before);
  });
});
