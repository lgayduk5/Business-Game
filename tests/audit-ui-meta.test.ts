// Regression tests from the audit of the UI meta screens (title and new-game setup, modes, tutorial, learn, files,
// modals): what these screens promise must match what the engine and the browser actually do.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHALLENGES, TERM, dailyOpts, dailySetup, fromSaveFile, keepPlaying, newGame, scenarioStars, scoreCode, startScenario, toSaveFile, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

// Capture the screens' click handlers, and keep them away from the DOM: render, act and toast are stand-ins here.
const H = vi.hoisted(() => ({ handlers: {} as Record<string, (d: DOMStringMap, el?: unknown) => unknown>, renders: 0, toasts: [] as string[] }));
vi.mock('../src/ui/store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/ui/store')>();
  return {
    ...mod, on: (name: string, fn: (d: DOMStringMap) => unknown) => (H.handlers[name] = fn), render: () => void H.renders++,
    act: (r: { ok: boolean }) => r.ok, toast: (m: string) => void H.toasts.push(m),
  };
});

/** Just enough of the browser for the screens' module-level listeners and their use of storage. */
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
}
const g0 = globalThis as Record<string, unknown>;
g0.window ??= { innerWidth: 1200, addEventListener: () => undefined, setTimeout, clearTimeout };
g0.document ??= { addEventListener: () => undefined, visibilityState: 'visible' };
g0.localStorage ??= fakeStorage();
g0.sessionStorage ??= fakeStorage();

let ui: typeof import('../src/ui/store').ui;
let modals: typeof import('../src/ui/shell').modals;
let wizard: typeof import('../src/ui/screens/title').wizard;
let S: typeof import('../src/storage/saves');
const run = async (name: string, d: Record<string, string> = {}) => H.handlers[name](d as DOMStringMap);
beforeAll(async () => {
  for (const s of ['hq', 'ops', 'learn', 'files', 'modes', 'modals']) await import(`../src/ui/screens/${s}.ts`);
  ({ ui } = await import('../src/ui/store'));
  ({ modals } = await import('../src/ui/shell'));
  ({ wizard } = await import('../src/ui/screens/title'));
  S = await import('../src/storage/saves');
});
beforeEach(() => {
  H.toasts = [];
  (g0.localStorage as Storage).clear();
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('new-company setup', () => {
  it('typing a company name does not re-render (a render swallowed the click on Next), and a blank name is refused on Next', async () => {
    await run('newGame');
    const w = ui.wizard!;
    Object.assign(w, { step: 3, industry: 'saas', city: 'nyc', name: '' });
    // the Next button cannot be disabled by an empty name: typing does not re-render, so it would stay disabled
    expect(wizard()).not.toMatch(/data-a="wzNext"\s+disabled/);
    const before = H.renders;
    await run('wzName', { value: 'Acme' });
    expect(H.renders).toBe(before);
    expect(w.name).toBe('Acme');
    await run('wzName', { value: '   ' });
    await run('wzNext');
    expect(w.step).toBe(3);
    expect(H.toasts[H.toasts.length - 1]).toMatch(/name/);
    await run('wzName', { value: '<b>Hi</b> & 🚀' });
    await run('wzNext');
    expect(w.step).toBe(4);
    expect(wizard()).toContain('&lt;b&gt;Hi&lt;/b&gt; &amp; 🚀');
  });
});

describe('the daily challenge', () => {
  it('starts the date on the screen (past midnight the clock is already on the next, different challenge)', async () => {
    const shown = '2026-11-17';
    expect(dailySetup('2026-11-18').industry).not.toBe(dailySetup(shown).industry);
    vi.useFakeTimers({ now: new Date('2026-11-18T00:00:30'), toFake: ['Date'] }); // the modal was opened at 23:59
    try {
      await run('dailyStart', { v: shown });
    } finally {
      vi.useRealTimers();
    }
    expect(ui.g!.rules.daily).toBe(shown);
    expect(ui.g!.company.primary).toBe(dailySetup(shown).industry);
  });

  it('gives one go a day: starting again opens the same game rather than a fresh copy', async () => {
    const date = '2026-11-21';
    await run('dailyStart', { v: date });
    const first = ui.g!;
    await flush();
    await run('dailyStart', { v: date });
    expect(ui.g).toBe(first);
    vi.useFakeTimers({ now: new Date('2026-11-21T12:00:00'), toFake: ['Date'] });
    try {
      ui.saves = await S.listSaves();
      const html = modals.daily(null, {});
      expect(html).not.toContain('data-a="dailyStart"');
      expect(html).toContain(`data-slot="auto:${first.id}"`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps showing the score code after Keep playing', () => {
    const g = newGame(dailyOpts('2026-11-08', 'Daily'));
    g.maxTurns = 6;
    play(g, 10);
    const code = scoreCode(g);
    expect(code).toMatch(/^GC-/);
    g.status = 'won'; // keepPlaying needs a win; the code is frozen with the grade either way
    g.outcome!.kind = 'won';
    keepPlaying(g);
    expect(g.continued).toBe(true);
    expect(scoreCode(g)).toBe(code);
    expect(modals.menu(g, {})).toContain(code);
  });
});

describe('scenario medals', () => {
  it('the medal text matches the engine: Brutal without the bonus is silver, gold needs both', () => {
    const s = CHALLENGES[0];
    const won = (brutal: boolean, bonus: boolean) => {
      const g = startScenario(s.id, 'Medal', { brutal });
      g.status = 'won';
      g.outcome = { kind: 'won', how: 'scenario', title: 'Done', turn: g.turn, text: '' };
      if (s.goal.kind === 'survive') g.company.valuation = (g.counters.scenarioStartValuation ?? 0) * (bonus ? 2 : 0.5);
      else g.counters.scenarioLeft = bonus ? s.turns : 0;
      return g;
    };
    expect(scenarioStars(won(true, false))).toBe(2);
    expect(scenarioStars(won(true, true))).toBe(3);
    const texts = [modals.scenarios(null, {}), modals.scenarioBrief(null, { id: s.id }), modals.over(won(true, false), {})].join(' ');
    expect(texts).not.toMatch(/gold for the Brutal version|Gold: finish the Brutal version/i);
    expect(modals.scenarios(null, {})).toContain('silver for the bonus or for finishing the Brutal version');
    expect(modals.over(won(true, false), {})).toContain('Silver medal');
  });
});

describe('saves and the end screen', () => {
  it('a damaged save file is refused in plain words, not with a TypeError or a game that fails at the first quarter', () => {
    const good = toSaveFile(newGame(opts({ seed: 'import' })));
    const damage: ((s: Record<string, any>) => void)[] = [
      (s) => delete s.settings, (s) => (s.rivals = {}), (s) => delete s.company.offices, (s) => delete s.company.books, (s) => (s.turn = 'x'),
      (s) => delete s.company.cap, (s) => ((s.v = 2), delete s.macro.fx), (s) => (s.company.home = 'atlantis'), (s) => (s.company.offices[0].city = 'nowhere'),
    ];
    for (const d of damage) {
      const f = JSON.parse(JSON.stringify(good));
      d(f.state);
      expect(() => fromSaveFile(JSON.stringify(f))).toThrow(/^That save file is damaged/);
    }
    expect(fromSaveFile(JSON.stringify(good)).company.name).toBe('Testco');
  });

  it('a finished game loaded from a save still offers to replay its last year', async () => {
    const g = newGame(opts({ seed: 'replay-after-load' }));
    g.maxTurns = 5;
    while (g.status === 'playing') {
      await S.snapshot(g, 4);
      play(g, 1);
    }
    const loaded = JSON.parse(JSON.stringify(g)) as GameState; // as if read back after the page was closed
    ui.g = loaded;
    ui.modal = { kind: 'over', data: { sticky: true } };
    modals.over(loaded, {});
    await flush();
    await flush();
    const html = modals.over(loaded, {});
    expect(html).toContain('Replay the last year');
    expect((html.match(/data-a="rewind"/g) ?? []).length).toBe(4);
  });

  it('deleting a save asks first', async () => {
    const g = newGame(opts({ seed: 'delete-me' }));
    await S.saveTo('slot2', g);
    ui.saves = await S.listSaves();
    await run('delSlot', { slot: 'slot2' });
    expect(ui.modal?.kind).toBe('confirm');
    expect(await S.loadFrom('slot2')).not.toBeNull();
    await run(ui.modal!.data.act, { arg: ui.modal!.data.arg });
    expect(await S.loadFrom('slot2')).toBeNull();
  });
});

describe('a glossary entry opened from a dialog', () => {
  it('goes back to that dialog on Close: an event card that ended the game, or with more cards waiting, is not lost', async () => {
    const id = Object.keys(TERM)[0];
    const card = { kind: 'event', data: { sticky: true, cat: 'Rival', result: { title: 'Sold', choice: 'Sell', text: '', effects: [], luck: 0, terms: [id] } } };
    ui.modal = card;
    await run('term', { id });
    expect(ui.modal?.kind).toBe('term');
    await run('close');
    expect(ui.modal).toBe(card); // it used to close both, so eventDone (the end screen, the next card) never ran
    // opened from a screen (a tooltip's link), Close just closes it
    ui.modal = null;
    await run('term', { id });
    await run('close');
    expect(ui.modal).toBeNull();
  });
});
