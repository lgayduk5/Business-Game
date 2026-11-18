// The third review: bugs found by playing every industry and mode with invariant checks after every action.
import { describe, expect, it } from 'vitest';
import {
  CITIES, EVENT, INDUSTRIES, SPECIALS, absorbIntoPlayer, advise, bindCtx, books, drawEvents, endTurn, equityOf, expandCapacity, fill, finalGrade, fire,
  gradeRule, launchDivision, maybeEntrant, netIncome, newGame, openOffice, outcomeCash, plantFairValue, pruneStale, queueEvent, resolveEvent, scheduleEvent,
  takeoverPrice, totalAssets, totalLiabilities, valuation, type GameState, type IndustryId,
} from '../engine/src/index';
import { opts, play } from './helpers';

const cityFor = (ind: IndustryId) => CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id))[0].id;
/** Assets less liabilities less equity, with this quarter's profit not yet closed into retained earnings. */
const imbalance = (g: GameState) => totalAssets(g.company.books) - totalLiabilities(g.company.books) - equityOf(g.company.books) - netIncome(g.company.pnl);

describe('deferred revenue that unwinds faster than it is earned', () => {
  it('is refunded to customers, never left as negative receivables', () => {
    const g = newGame(opts({ industry: 'saas', city: cityFor('saas'), seed: 'refund', mode: 'sandbox' }));
    play(g, 6);
    const o = g.company.offices[0];
    fire(g, o.id, 'ops', o.staff.ops.n);
    fire(g, o.id, 'sales', o.staff.sales.n);
    const cash = g.company.books.cash;
    for (let i = 0; i < 3; i++) {
      endTurn(g);
      expect(g.company.books.ar).toBeGreaterThanOrEqual(0);
    }
    expect(g.company.books.deferred).toBeLessThan(1);
    expect(g.company.books.cash).toBeLessThan(cash);
    expect(g.news.some((n) => /refunded/.test(n.text))).toBe(true);
  });
});

describe('takeover offers', () => {
  it('always name a price, even for a company the market values at nothing', () => {
    const g = newGame(opts({ seed: 'takeover' }));
    g.company.valuation = 0;
    expect(takeoverPrice(g, false)).toBeGreaterThan(200_000);
    const ctx = { rival: g.rivals[0].id, amount: 0 };
    expect(fill(g, EVENT.rival_takeover.text, ctx)).not.toMatch(/: ,/);
    expect(fill(g, '{amount}', ctx)).toBe('$0');
  });
});

describe('new entrants', () => {
  it('never arrive with no offices when every market is crowded', () => {
    const g = newGame(opts({ seed: 'crowded', difficulty: 'brutal' }));
    g.turn = 30;
    const ind = g.company.primary;
    // one incumbent already holds most of every market
    const big = g.rivals[0];
    big.offices = CITIES.map((c) => ({ city: c.id, ind, share: 0.56, price: 1, sales: 1, cap: 1e9, opened: 0, war: 0 }));
    const n = g.rivals.length;
    for (let i = 0; i < 400; i++) maybeEntrant(g);
    expect(g.rivals.length).toBe(n);
    for (const r of g.rivals) if (r.alive) expect(r.offices.length, r.name).toBeGreaterThan(0);
    expect(g.news.some((n) => / in \.$/.test(n.text))).toBe(false);
  });
});

describe('cards that no longer apply', () => {
  it('are dropped when their rival is gone, and a lawsuit against it lapses with a note', () => {
    const g = newGame(opts({ seed: 'stale' }));
    play(g, 3);
    const r = g.rivals[0];
    expect(queueEvent(g, 'rival_trash_talk', { rival: r.id })).toBe(true);
    scheduleEvent(g, 'lawsuit_verdict', 2, { rival: r.id });
    r.alive = false;
    pruneStale(g);
    expect(g.queue.some((e) => e.ctx.rival === r.id)).toBe(false);
    expect(g.scheduled.some((e) => e.ctx.rival === r.id)).toBe(false);
    expect(g.news.some((n) => /lawsuit against .* lapsed/.test(n.text))).toBe(true);
  });
  it('are dropped when their office closes', () => {
    const g = newGame(opts({ seed: 'stale-office' }));
    g.queue.push({ uid: 999, id: 'union', ctx: { office: 'no-such-office' }, turn: g.turn });
    drawEvents(g);
    expect(g.queue.some((e) => e.uid === 999)).toBe(false);
  });
});

describe('buying plant for less than it is worth', () => {
  const setup = () => {
    const g = newGame(opts({ industry: 'energy', city: cityFor('energy'), seed: 'bargain' }));
    play(g, 2);
    return g;
  };
  it('books the plant at the price paid, so goodwill is never negative', () => {
    const g = setup();
    const r = g.rivals.find((x) => x.alive && x.offices.length)!;
    const fair = plantFairValue(r.offices);
    expect(fair).toBeGreaterThan(0);
    const got = absorbIntoPlayer(g, r, r.offices.slice(), fair / 3);
    expect(got).toBeCloseTo(fair / 3, 0);
  });
  it('the card for buying a rival office charges what it says', () => {
    const g = setup();
    g.company.books.cash = 50e6;
    const r = g.rivals.find((x) => x.alive && x.offices.length)!;
    const ctx = { rival: r.id, city: r.offices[0].city };
    const shown = -outcomeCash(g, ctx, { text: '', fx: [['special', 'buyRivalOffice']] }).spend;
    const cash = g.company.books.cash;
    const goodwill = g.company.books.goodwill;
    const off = imbalance(g);
    SPECIALS.buyRivalOffice(g, ctx, 0);
    expect(cash - g.company.books.cash).toBeCloseTo(shown, 0);
    expect(g.company.books.goodwill).toBeGreaterThanOrEqual(goodwill);
    expect(Math.abs(imbalance(g) - off)).toBeLessThan(1);
  });
  it('a deal target bought below its plant value books no negative goodwill', () => {
    const g = setup();
    const before = g.company.books.goodwill;
    const off = imbalance(g);
    books.acquire(g.company, 1e6, 5e6, g.company.offices[0]);
    expect(g.company.books.goodwill).toBeGreaterThanOrEqual(before);
    expect(Math.abs(imbalance(g) - off)).toBeLessThan(1);
  });
});

describe('the end-of-game grade', () => {
  it('shows a winning letter only for a winning result', () => {
    const g = newGame(opts({ seed: 'grade-cap' }));
    play(g, 8);
    for (const r of g.rivals) r.alive = false; // first of one, with a goal met: a high score
    g.turn = g.maxTurns - 1;
    const fg = finalGrade(g);
    expect(fg.score).toBeGreaterThanOrEqual(60);
    expect(fg.multiple).toBeLessThan(3); // but the stake has not tripled in eight quarters
    expect(fg.grade).toBe('C');
    expect(fg.won).toBe(false);
    expect(fg.rows.some(([k, v]) => /Not enough growth/.test(k) && /stops at C/.test(v))).toBe(true);
  });
  it('states the rule with the bands each length actually uses', () => {
    expect(gradeRule(false)).toMatch(/A \(75\+\) or B \(60\+\).*tripled/);
    expect(gradeRule(true)).toMatch(/A \(67\+\) or B \(52\+\).*a quarter/);
  });
  it('takes no more decisions once the game is over', () => {
    const g = newGame(opts({ seed: 'over' }));
    play(g, 2);
    g.maxTurns = g.turn + 1;
    g.settings.victories = Object.fromEntries(Object.keys(g.settings.victories).map((k) => [k, false])) as GameState['settings']['victories'];
    queueEvent(g, 'rival_takeover', { rival: g.rivals[0].id, amount: 1e6 });
    endTurn(g);
    expect(g.status).not.toBe('playing');
    expect(g.queue.length).toBe(0);
    g.queue.push({ uid: 4242, id: 'rival_takeover', ctx: { rival: g.rivals[0].id, amount: 1e6 }, turn: g.turn });
    const outcome = g.outcome;
    expect(resolveEvent(g, 4242, 0)).toBeNull();
    expect(g.outcome).toBe(outcome);
  });
});

describe('events about one industry in a company with several', () => {
  it('stay in that industry', () => {
    const g = newGame(opts({ industry: 'retail', city: cityFor('retail'), seed: 'conglomerate' }));
    play(g, 4);
    g.company.books.cash = 80e6;
    expect(launchDivision(g, 'saas').ok).toBe(true);
    g.discovered[cityFor('saas')] = Math.max(1, g.discovered[cityFor('saas')] ?? 0);
    const res = openOffice(g, cityFor('saas'), 'saas');
    expect(res.ok, res.msg).toBe(true);
    play(g, 2);
    const ctx = bindCtx(g, EVENT.churn_wave)!;
    expect(ctx.ind).toBe('saas');
    expect(ctx.scoped).toBe(true);
    for (const o of g.company.offices) if (o.ind === 'saas') o.share = 0.05; // a new office with customers to lose
    const shares = new Map(g.company.offices.map((o) => [o.id, o.share]));
    g.queue.push({ uid: 777, id: 'churn_wave', ctx, turn: g.turn });
    resolveEvent(g, 777, 2); // push on: share −7% "everywhere"
    for (const o of g.company.offices) {
      if (o.ind === 'retail') expect(o.share, o.name).toBe(shares.get(o.id));
      else expect(o.share, o.name).toBeLessThan(shares.get(o.id)!);
    }
  });
  it('leave a single-industry company exactly as before', () => {
    const g = newGame(opts({ industry: 'saas', city: cityFor('saas'), seed: 'single' }));
    play(g, 4);
    expect(bindCtx(g, EVENT.churn_wave)!.scoped).toBeUndefined();
  });
});

describe('the CFO explains cash against profit in the right direction', () => {
  it('says inventory was run down when stock fell', () => {
    const g = newGame(opts({ industry: 'retail', city: cityFor('retail'), seed: 'cfo-note' }));
    play(g, 4);
    const q = g.company.quarters[g.company.quarters.length - 1];
    q.cf.dInv = -4e6; // stock fell: cash came in
    q.cf.dAR = q.cf.dAP = q.cf.dDef = 0;
    q.cf.cfo = q.ni + q.cf.da + q.cf.noncash + 4e6;
    const note = advise(g).find((n) => n.title === 'Cash came in faster than profit');
    expect(note?.text).toMatch(/running down inventory/);
    expect(note?.text).not.toMatch(/more inventory on the shelves/);
  });
});

describe('a plant being built', () => {
  it('is valued at cost, so financing one does not wipe out the equity', () => {
    const g = newGame(opts({ industry: 'energy', city: cityFor('energy'), seed: 'cip' }));
    play(g, 2);
    g.company.books.cash = 30e6;
    const o = g.company.offices[0];
    const before = valuation(g).equity;
    expect(expandCapacity(g, o.id, 400, true).ok).toBe(true);
    const cost = o.building[0].cost;
    // only the arrangement fee leaves: cash and debt move by the plant's cost, and the plant is counted at it
    expect(Math.abs(valuation(g).equity - before)).toBeLessThan(0.02 * cost);
  });
  it('and a new plant counts at cost until a year of its sales is in the accounts', () => {
    const g = newGame(opts({ industry: 'energy', city: cityFor('energy'), seed: 'ramp' }));
    play(g, 2);
    g.company.books.cash = 60e6;
    const city = CITIES.find((c) => c.ind.energy >= 1 && c.id !== g.company.home && (g.discovered[c.id] ?? 0) >= 1)!.id;
    expect(openOffice(g, city, 'energy').ok).toBe(true);
    const o = g.company.offices.find((x) => x.city === city)!;
    expect(o.ramp?.length).toBe(1);
    for (let i = 0; i < 5; i++) endTurn(g);
    expect(o.ramp?.length ?? 0).toBe(0);
  });
});

describe('every industry, played with every action', () => {
  it('keeps the books balanced and the numbers finite', () => {
    for (const ind of Object.keys(INDUSTRIES) as IndustryId[]) {
      const g = newGame(opts({ industry: ind, city: cityFor(ind), seed: 'r3-' + ind }));
      play(g, 12);
      expect(Math.abs(imbalance(g)), ind).toBeLessThan(5);
      expect(g.company.books.ar, ind).toBeGreaterThanOrEqual(0);
      expect(g.company.books.goodwill, ind).toBeGreaterThanOrEqual(0);
    }
  });
});
