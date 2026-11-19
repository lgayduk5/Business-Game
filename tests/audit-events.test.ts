// Regression tests for the events audit (system 7): docs/BUG_AUDIT.md → "7. Events".
import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY, EVENT, SPECIALS, bindCtx, closeOffice, endTurn, flightRisk, hasFlag, launchDivision, moneyText, newGame, openOffice, queueEvent,
  resolveEvent, retain, setFlag, tempMod, type EventDef, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g));
const rich = (over: Parameters<typeof opts>[0] = {}): GameState => {
  const g = newGame(opts({ founder: 'heir', ...over }));
  g.company.books.cash += 80e6;
  g.company.books.paidIn += 80e6;
  g.company.open = { ...g.company.books };
  return g;
};
const resolveFirst = (g: GameState, id: string, i: number) => resolveEvent(g, g.queue.find((e) => e.id === id)!.uid, i);
const office = (g: GameState, city: string, ind: string) => {
  g.discovered[city] = 1;
  const r = openOffice(g, city, ind as never);
  expect(r.ok, r.msg).toBe(true);
  return g.company.offices[g.company.offices.length - 1];
};
/** Bind an event under many different draws and collect the contexts that pass its condition. */
const binds = (g: GameState, id: string, n = 80) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const h = clone(g);
    h.rng = (h.rng + k * 7919) >>> 0;
    const ctx = bindCtx(h, EVENT[id]);
    if (ctx) out.push(ctx);
  }
  return out;
};

describe('audit: outcome draws and cooldowns', () => {
  it('an outcome of zero weight is never picked, even on a draw of exactly 0', () => {
    const ZERO = 2463401483; // the generator state whose next draw is exactly 0
    const def: EventDef = {
      id: 'audit_zero', cat: 'operational', title: 'T', text: 'x', w: 0, lesson: '',
      opts: [{ label: 'a', hint: 'b', out: [{ w: 0, text: 'never' }, { w: 1, text: 'always' }] }],
    };
    EVENT[def.id] = def;
    try {
      const g = newGame(opts({ seed: 'zero' }));
      g.queue = [];
      queueEvent(g, def.id, {});
      g.rng = ZERO;
      expect(resolveEvent(g, g.queue[0].uid, 0)!.text).toBe('always');
    } finally {
      delete EVENT[def.id];
    }
  });

  it('a retention deal locks a person in for two years: eight quarterly checks, not nine', () => {
    const card = rich({ seed: 'retain' });
    const deal = clone(card);
    const [a] = card.company.people, [b] = deal.company.people;
    expect(SPECIALS.retainPerson(card, { person: a.id }, 0)).toMatch(/two years/); // the key-resignation counter-offer
    expect(retain(deal, b.id).msg).toMatch(/two-year/); // the team screen's retention package
    for (const [g, p] of [[card, a], [deal, b]] as const) {
      const t = g.turn;
      for (let k = 0; k < 8; k++) expect(flightRisk({ ...g, turn: t + k }, p), `quarter ${k}`).toBe(0);
      expect(flightRisk({ ...g, turn: t + 8 }, p)).toBeGreaterThan(0);
    }
  });

  it('a flag set for 8 quarters ("hedge for two years") lasts 8 quarters', () => {
    const g = newGame(opts({ seed: 'flag' }));
    setFlag(g, 'hedged', 8);
    const t = g.turn;
    for (let k = 0; k < 8; k++) expect(hasFlag({ ...g, turn: t + k }, 'hedged')).toBe(true);
    expect(hasFlag({ ...g, turn: t + 8 }, 'hedged')).toBe(false);
  });
});

describe('audit: effects', () => {
  it('a buyback card retires no shares for free when the share price is $0', () => {
    const g = rich({ seed: 'bb0' });
    play(g, 2, () => undefined);
    g.queue = [];
    g.company.cap.isPublic = true;
    g.company.cap.price = 0;
    const shares = g.company.cap.shares, cash = g.company.books.cash;
    queueEvent(g, 'short_report', {});
    expect(moneyText(g, {}, EVENT.short_report.opts[1])).toBe('');
    resolveFirst(g, 'short_report', 1);
    expect(g.company.cap.shares).toBe(shares);
    expect(g.company.books.cash).toBe(cash);
  });

  it('"Raise local prices" in a currency crisis raises prices only in that region', () => {
    const g = rich({ seed: 'fx' });
    const away = CITIES.find((c) => c.region === 'europe')!;
    office(g, away.id, g.company.primary);
    g.queue = [];
    const home = CITY[g.company.home].region, ind = g.company.primary;
    const before = { home: g.company.policy[home].price[ind] ?? 1, away: g.company.policy.europe.price[ind] ?? 1 };
    queueEvent(g, 'currency_crisis', { region: 'europe' });
    const r = resolveFirst(g, 'currency_crisis', 1)!;
    expect(g.company.policy[home].price[ind] ?? 1).toBeCloseTo(before.home);
    expect(g.company.policy.europe.price[ind]).toBeCloseTo(before.away * 1.08);
    expect(r.effects.join(' ')).toContain('Prices raised 8% in');
  });

  it('"they sign with a rival" makes the rivals in that city stronger, even with no rival named on the card', () => {
    const g = rich({ industry: 'mfg', seed: 'rshare' });
    play(g, 2, () => undefined);
    g.queue = [];
    const o = g.company.offices[0];
    const r = g.rivals.find((x) => x.alive)!;
    r.offices.push({ ...r.offices[0], city: o.city, ind: o.ind, share: 0.2 });
    const ro = r.offices[r.offices.length - 1];
    queueEvent(g, 'mfg_breakdown', { office: o.id, city: o.city, region: CITY[o.city].region, ind: o.ind });
    resolveFirst(g, 'mfg_breakdown', 1);
    expect(ro.share).toBeCloseTo(0.2 * 1.03);
  });

  it('an event about one industry keeps its cost effects in that industry', () => {
    // cloud credits cut a software company's hosting bill, not its factory's materials
    const g = rich({ industry: 'saas', seed: 'scope' });
    expect(launchDivision(g, 'mfg').ok).toBe(true);
    const plant = office(g, g.company.home, 'mfg');
    play(g, 2, () => undefined);
    g.queue = [];
    const sw = g.company.offices.find((x) => x.ind === 'saas')!;
    const ctx = bindCtx(g, EVENT.saas_cloud_credits)!;
    expect(ctx.scoped).toBe(true);
    queueEvent(g, 'saas_cloud_credits', ctx);
    resolveFirst(g, 'saas_cloud_credits', 0);
    expect(tempMod(g, 'inputs', sw)).toBeCloseTo(0.6);
    expect(tempMod(g, 'inputs', plant)).toBe(1);
    // a driver pay rise for the trucks does not raise pay in the shops
    const h = rich({ industry: 'logistics', seed: 'scope2' });
    expect(launchDivision(h, 'retail').ok).toBe(true);
    const shop = office(h, h.company.home, 'retail');
    play(h, 2, () => undefined);
    h.queue = [];
    const pay = shop.pay, truckPay = h.company.offices[0].pay;
    queueEvent(h, 'log_driver_shortage', bindCtx(h, EVENT.log_driver_shortage)!);
    resolveFirst(h, 'log_driver_shortage', 0);
    expect(h.company.offices.find((x) => x.id === shop.id)!.pay).toBe(pay);
    expect(h.company.offices[0].pay).toBeCloseTo(truckPay + 0.1);
  });
});

describe('audit: what a card is about', () => {
  it('a walkout, a union drive and an antitrust inquiry name the office that meets the condition', () => {
    const g = rich({ industry: 'consulting', seed: 'walk' });
    for (const c of CITIES.filter((x) => x.region === CITY[g.company.home].region).slice(1, 4)) office(g, c.id, 'consulting');
    play(g, 6, () => undefined);
    const offs = g.company.offices;
    expect(offs.length).toBeGreaterThanOrEqual(3);
    offs.forEach((o, i) => {
      o.morale = i === 0 ? 20 : 80;
      o.share = i === 0 ? 0.4 : 0.05;
      o.staff.ops.n = Math.max(o.staff.ops.n, 20);
    });
    for (const id of ['walkout', 'union', 'antitrust']) {
      const got = binds(g, id);
      expect(got.length, id).toBeGreaterThan(0);
      expect(new Set(got.map((c) => c.office)), id).toEqual(new Set([offs[0].id]));
    }
  });

  it('a regional card about one industry picks a region where that industry operates', () => {
    const g = rich({ industry: 'energy', seed: 'curtail' });
    expect(launchDivision(g, 'retail').ok).toBe(true);
    const away = CITIES.find((c) => c.region !== CITY[g.company.home].region)!;
    office(g, away.id, 'retail');
    play(g, 8, () => undefined);
    const home = CITY[g.company.home].region;
    for (const id of ['energy_curtailment', 'energy_subsidy']) {
      const got = binds(g, id);
      expect(got.length, id).toBeGreaterThan(0);
      expect(new Set(got.map((c) => c.region)), id).toEqual(new Set([home]));
    }
    // and the subsidy repeal shrinks the energy market there, not the shops'
    g.queue = [];
    queueEvent(g, 'energy_subsidy', binds(g, 'energy_subsidy', 1)[0]);
    resolveFirst(g, 'energy_subsidy', 2);
    expect(g.mods.find((m) => m.kind === 'market')).toMatchObject({ region: home, ind: 'energy' });
  });

  it('a card about a person and their office names the office they work in', () => {
    const g = rich({ industry: 'consulting', seed: 'partner' });
    for (const c of CITIES.slice(1, 4)) office(g, c.id, 'consulting');
    play(g, 4, () => undefined);
    let checked = 0;
    for (const ctx of binds(g, 'cons_partner_exit')) {
      const p = g.company.people.find((x) => x.id === ctx.person)!;
      if (!p.office) continue;
      expect(ctx.office).toBe(p.office);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('audit: the queue and follow-ups', () => {
  it('a card about someone who has just left is withdrawn, not shown and charged', () => {
    const g = rich({ seed: 'stale' });
    play(g, 3, () => undefined);
    g.queue = [];
    const p = g.company.people[0];
    const r = g.rivals.find((x) => x.alive)!;
    queueEvent(g, 'key_resignation', { person: p.id, office: p.office });
    queueEvent(g, 'rival_talent_raid', { rival: r.id, person: p.id });
    resolveFirst(g, 'key_resignation', 1); // wish them well
    expect(g.company.people.some((x) => x.id === p.id)).toBe(false);
    expect(g.queue.map((e) => e.id)).toEqual([]);
  });

  it('closing the office a bribe was paid in does not cancel the bribery probe', () => {
    const g = rich({ industry: 'consulting', seed: 'bribe' });
    const far = office(g, CITIES.find((c) => c.region !== CITY[g.company.home].region)!.id, 'consulting');
    play(g, 7, () => undefined);
    g.queue = [];
    let h: GameState | undefined;
    for (let k = 0; k < 40 && !h; k++) {
      const x = clone(g);
      x.rng = (x.rng + k * 7919) >>> 0;
      queueEvent(x, 'bribe', { office: far.id, city: far.city, region: CITY[far.city].region, ind: far.ind });
      resolveFirst(x, 'bribe', 1);
      if (x.scheduled.some((s) => s.id === 'bribery_probe')) h = x;
    }
    expect(h).toBeDefined();
    expect(closeOffice(h!, far.id).ok).toBe(true);
    let fired = false;
    for (let t = 0; t < 10 && !fired; t++) {
      endTurn(h!);
      fired = h!.queue.some((q) => q.id === 'bribery_probe');
      h!.queue = [];
    }
    expect(fired).toBe(true);
  });

  it('a follow-up still keeps what it is about: the union office, the cartel rival', () => {
    const g = rich({ seed: 'chainctx' });
    play(g, 3, () => undefined);
    g.queue = [];
    const o = g.company.offices[0];
    o.morale = 50;
    queueEvent(g, 'union', bindCtx(g, EVENT.union)!);
    resolveFirst(g, 'union', 0);
    expect(g.scheduled.find((s) => s.id === 'union_contract')!.ctx.office).toBe(o.id);
    const r = g.rivals.find((x) => x.alive)!;
    for (let k = 0; k < 40 && !g.scheduled.some((s) => s.id === 'cartel_probe'); k++) {
      const x = clone(g);
      x.rng = (x.rng + k * 7919) >>> 0;
      queueEvent(x, 'rival_cartel', { rival: r.id });
      resolveFirst(x, 'rival_cartel', 0);
      if (x.scheduled.some((s) => s.id === 'cartel_probe')) g.scheduled = x.scheduled;
    }
    expect(g.scheduled.find((s) => s.id === 'cartel_probe')!.ctx.rival).toBe(r.id);
  });
});
