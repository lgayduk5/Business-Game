// Regression tests from the audit of the gameplay screens (HQ, offices, regions, map, corporate, intel, rivals):
// what a screen says about an action must match what the engine does when the player takes it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CITIES, CITY, INDUSTRIES, acquireTarget, closeOffice, endTurn, expandCapacity, improveRelations, money, newGame, openFranchise, openOffice, severanceCost, signPartner, spawnTarget, startInvestment,
  startScenario, stepInvestments, turnLabel, ROLES, type GameState,
} from '../engine/src/index';
import { opts } from './helpers';

// Capture the screens' click handlers, and keep them away from the DOM: render and act are stand-ins here.
const H = vi.hoisted(() => ({ handlers: {} as Record<string, (d: DOMStringMap) => unknown> }));
vi.mock('../src/ui/store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/ui/store')>();
  return { ...mod, on: (name: string, fn: (d: DOMStringMap) => unknown) => (H.handlers[name] = fn), render: () => undefined, act: (r: { ok: boolean }) => r.ok };
});

let ui: typeof import('../src/ui/store').ui;
let screens: typeof import('../src/ui/shell').screens;
let views: { ops: Record<string, (g: GameState) => string>; corp: Record<string, (g: GameState) => string>; intel: Record<string, (g: GameState) => string> };
beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= { innerWidth: 1200 };
  for (const s of ['hq', 'map', 'ops', 'regions', 'corp', 'capital', 'team', 'invest', 'policies', 'intel', 'events', 'rivals']) await import(`../src/ui/screens/${s}.ts`);
  ({ ui } = await import('../src/ui/store'));
  ({ screens } = await import('../src/ui/shell'));
  views = { ops: (await import('../src/ui/screens/ops')).opsViews, corp: (await import('../src/ui/screens/corp')).corpViews, intel: (await import('../src/ui/screens/intel')).intelViews };
});
const show = (g: GameState, sel: Record<string, unknown> = {}) => {
  ui.g = g;
  ui.sel = sel as typeof ui.sel;
  ui.sub = {};
};
const quarter = (g: GameState, n = 1) => {
  for (let i = 0; i < n; i++) {
    g.queue = [];
    endTurn(g);
  }
  g.queue = [];
};
/** A second office near home, with a quarter of trading behind it. */
function twoOffices(industry = 'mfg' as const) {
  const g = newGame(opts({ industry }));
  g.company.books.cash = 50e6;
  const other = CITIES.find((c) => c.id !== g.company.home && c.region === CITY[g.company.home].region)!;
  g.discovered[other.id] = 2;
  expect(openOffice(g, other.id, g.company.primary).ok).toBe(true);
  quarter(g, 2);
  return { g, o: g.company.offices[1] };
}

describe('UI gameplay screens', () => {
  it('HQ escapes the world seed once, not twice', () => {
    const g = newGame(opts({ seed: `x&y'z` }));
    show(g);
    const html = screens.hq!(g);
    expect(html).toContain('seed x&amp;y&#39;z');
    expect(html).not.toContain('&amp;amp;');
  });

  it('the close-office warning names every cost the engine charges', () => {
    const { g, o } = twoOffices();
    show(g, { office: o.id });
    H.handlers.askClose({ office: o.id });
    const text: string = ui.modal!.data.text;
    // the engine charges two quarters of rent AND of facility running costs on top of severance
    expect(o.last!.facility).toBeGreaterThan(0);
    expect(text).toMatch(/two quarters of rent and facility running costs/);
    expect(text).toMatch(/stock on hand is written off/);
    const sev = ROLES.reduce((s, r) => s + severanceCost(g, o, r, o.staff[r].n), 0);
    expect(closeOffice(g, o.id).msg).toContain(money(sev + 2 * o.last!.rent + 2 * o.last!.facility));
  });

  it('the price of a dinner with a rival is what the engine charges, with prices up', () => {
    const g = newGame(opts());
    quarter(g);
    g.macro.cpi = 1.5;
    g.company.quarters[g.company.quarters.length - 1].pnl.revenue = 100_000; // small: the floor applies, in today's money
    g.company.intel = 1;
    const r = g.rivals.find((x) => x.alive)!;
    show(g, { rival: r.id });
    const html = views.intel.rivals(g);
    const shown = /Relations \+8, hostility down a little\. ([^<]*)\./.exec(html)![1];
    const before = g.company.books.cash;
    expect(improveRelations(g, r.id).ok).toBe(true);
    expect(shown).toBe(money(before - g.company.books.cash));
  });

  it('a rival that has been bought or gone bust is not offered for deals', () => {
    const g = newGame(opts());
    quarter(g);
    g.company.intel = 1;
    const r = g.rivals.find((x) => x.alive)!;
    r.alive = false;
    r.fate = 'Bankrupt';
    show(g, { rival: r.id });
    const html = views.intel.rivals(g);
    expect(html).not.toContain(`data-a="askBid" data-id="${r.id}"`);
    expect(html).not.toContain(`data-a="dip" data-k="relations" data-id="${r.id}"`);
  });

  it('neither the map nor the deals page offers stores where a franchisee already runs them', () => {
    const g = newGame(opts({ industry: 'retail' }));
    quarter(g);
    g.company.books.cash = 50e6;
    g.company.brand = 60;
    const city = CITIES.find((c) => c.id !== g.company.home)!;
    g.discovered[city.id] = 2;
    expect(openFranchise(g, city.id).ok).toBe(true);
    expect(openOffice(g, city.id, 'retail').ok).toBe(false);
    show(g, { city: city.id });
    expect(screens.map!(g)).not.toContain(`data-a="openOffice" data-id="${city.id}" data-ind="retail"`);
    // nor to buy a store business there (the engine refuses that too)
    const t = spawnTarget(g, city.id)!;
    expect(t.ind).toBe('retail');
    expect(acquireTarget(g, t.id).ok).toBe(false);
    expect(views.corp.deals(g)).not.toContain(`data-a="acquire" data-id="${t.id}"`);
  });

  it('a deal in its last quarter says so instead of "open for 0 more quarters"', () => {
    const g = newGame(opts());
    quarter(g, 2);
    const t = spawnTarget(g)!;
    t.expires = g.turn; // still on the table this quarter: the end of the quarter drops it
    show(g);
    const html = views.corp.deals(g);
    expect(html).toContain('Last quarter to buy.');
    expect(html).not.toContain('0 more quarters');
  });

  it("an investment still starting up shows the running cost the engine actually charges this quarter", () => {
    const g = newGame(opts());
    quarter(g);
    g.company.books.cash = 50e6;
    expect(startInvestment(g, 'culture_program').ok).toBe(true);
    show(g);
    const html = views.corp.invest(g);
    const row = /Starting up, 1 quarter to go<\/td><td class="num">([^<]*)<\/td>/.exec(html);
    expect(row).not.toBeNull();
    const clone: GameState = JSON.parse(JSON.stringify(g));
    expect(row![1]).toBe(money(stepInvestments(clone))); // nothing is charged until it is up and running
  });

  it('a plant expansion in its last quarter of construction is not "ready in 0 qtr"', () => {
    const g = newGame(opts({ industry: 'mfg' }));
    g.company.books.cash = 50e6;
    const o = g.company.offices[0];
    expect(expandCapacity(g, o.id, 100).ok).toBe(true);
    quarter(g, INDUSTRIES.mfg.buildQ); // it comes online as this quarter resolves
    show(g, { office: o.id });
    const html = views.ops.office(g);
    expect(html).toContain('100 (online this quarter)');
    expect(html).not.toContain('ready in 0 qtr');
  });

  it('a local partner shows the last quarter it distributes for you', () => {
    const g = newGame(opts());
    quarter(g);
    const region = CITY[g.company.home].region;
    expect(signPartner(g, region).ok).toBe(true);
    show(g);
    const html = views.ops.regions(g);
    expect(html).toContain(`until ${turnLabel(g.company.policy[region].partner!.until)}:`);
    expect(html).not.toContain('quarters from now');
  });

  it('a scenario does not hold out the standard victories as ways to win', () => {
    const g = startScenario('cash_crunch', 'Testco');
    g.queue = [];
    show(g);
    expect(screens.hq!(g)).not.toContain('Closest goal');
    expect(views.intel.goals(g)).not.toContain('The first goal you reach wins the game');
  });
});
