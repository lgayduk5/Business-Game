// Regression tests for the rivals audit (system 8): docs/BUG_AUDIT.md → "8. Rival AI & competitors".
import { describe, expect, it } from 'vitest';
import {
  EVENT, SPECIALS, bidCash, bidForRival, bidPrice, companyHeadcount, endTurn, equityOf, founderStake, improveRelations, launchDivision, lobbyAgainst,
  moneyText, netIncome, newGame, outcomeCash, poachTalent, proposeAlliance, proposeTruce, queueEvent, resolveEvent, rivalsFinancials, rivalsForDivisions,
  startPact, sueRival,
  totalAssets, totalLiabilities, type GameState,
} from '../engine/src/index';
import { opts } from './helpers';

const rich = (over: Parameters<typeof opts>[0] = {}): GameState => {
  const g = newGame(opts({ founder: 'heir', ...over }));
  g.company.books.cash += 2e9;
  g.company.books.paidIn += 2e9;
  g.company.open = { ...g.company.books };
  return g;
};
const imbalance = (g: GameState) => totalAssets(g.company.books) - totalLiabilities(g.company.books) - equityOf(g.company.books) - netIncome(g.company.pnl);

describe('audit: buying a rival', () => {
  it('while your shares trade at $0, the whole price is paid in cash, not in near-free shares', () => {
    let done = false;
    for (let s = 0; s < 40 && !done; s++) {
      const g = rich({ seed: 'zero' + s });
      const c = g.company;
      c.cap.isPublic = true;
      c.cap.price = 0;
      const r = g.rivals[0];
      r.relation = 100;
      r.distress = 2;
      const price = bidPrice(g, r, false);
      expect(bidCash(g, price)).toBe(price);
      const stake = founderStake(c), shares = c.cap.shares, cash = c.books.cash, off = imbalance(g);
      if (!bidForRival(g, r.id, false).ok) continue;
      done = true;
      expect(c.cap.shares).toBe(shares);
      expect(founderStake(c)).toBe(stake); // the probe saw 100% fall to 0.6%
      expect(cash - c.books.cash).toBeCloseTo(price * 1.01, 0); // price plus 1% adviser fees
      expect(Math.abs(imbalance(g) - off)).toBeLessThan(1);
    }
    expect(done).toBe(true);
    // with a real share price, half is still paid in shares
    const g = rich({ seed: 'zero-ok' });
    g.company.cap.isPublic = true;
    g.company.cap.price = 5;
    expect(bidCash(g, 100)).toBe(50);
  });

  it('a bid, suit or poaching raid you cannot pay for is not made, so it starts no cooldown', () => {
    const g = newGame(opts({ seed: 'cooldown' }));
    const c = g.company;
    const [a, b, d] = g.rivals;
    const cash = c.books.cash;
    c.books.cash = 1;
    expect(bidForRival(g, a.id, false).msg).toMatch(/^You need/);
    expect(sueRival(g, b.id).msg).toMatch(/Lawyers/);
    expect(poachTalent(g, d.id).msg).toMatch(/signing bonuses/);
    c.books.cash = cash + 1e9;
    expect(bidForRival(g, a.id, false).msg).not.toMatch(/recently/);
    expect(sueRival(g, b.id).ok).toBe(true);
    expect(poachTalent(g, d.id).msg).not.toMatch(/on their guard/);
  });
});

describe('audit: agreements', () => {
  it('a truce covers eight quarters of rival moves and an alliance twelve, then lapses', () => {
    for (const [kind, quarters] of [['truce', 8], ['alliance', 12]] as const) {
      const g = newGame(opts({ seed: 'pact-' + kind }));
      const r = g.rivals[1];
      startPact(g, r, kind, quarters);
      const T = g.turn;
      let covered = 0;
      for (let i = 0; i < quarters + 3; i++) {
        g.queue = [];
        const before = !!r.pact;
        endTurn(g);
        if (before) covered++; // this quarter's moves were made under the agreement
      }
      expect(covered, kind).toBe(quarters);
      expect(r.pact).toBeUndefined();
      expect(g.news.some((n) => n.turn === T + quarters - 1 && /lapsed/.test(n.text))).toBe(true);
    }
  });
});

describe('audit: buying a distressed rival’s office', () => {
  it('the card names a city the rival is in, and buys that office, never another', () => {
    let checked = 0;
    for (let s = 0; s < 40 && checked < 3; s++) {
      const g = rich({ seed: 'distress' + s });
      const c = g.company;
      const r = g.rivals.find((x) => x.offices.length >= 2 && !x.offices.some((ro) => c.offices.some((o) => o.city === ro.city && o.ind === ro.ind)));
      if (!r) continue;
      g.queue = [];
      g.turn = 10;
      g.counters.rivalCard = -99;
      r.cash = -1e9;
      r.distress = 1;
      r.known = true;
      rivalsFinancials(g);
      const pe = g.queue.find((e) => e.id === 'rival_distress');
      if (!pe) continue;
      checked++;
      expect(r.offices.map((ro) => ro.city)).toContain(pe.ctx.city); // was the player's own city, where they had nothing
      const others = r.offices.filter((ro) => ro.city !== pe.ctx.city);
      resolveEvent(g, pe.uid, 0);
      expect(r.offices.some((ro) => ro.city === pe.ctx.city)).toBe(false);
      expect(r.offices).toEqual(others);
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('with no office in the named city, nothing is bought or charged', () => {
    const g = rich({ seed: 'distress-gone' });
    const r = g.rivals.find((x) => x.offices.length)!;
    const city = ['nyc', 'bos', 'tor', 'pit', 'chi', 'aus', 'sfo', 'lon', 'ams', 'ber'].find((x) => !r.offices.some((ro) => ro.city === x))!;
    const ctx = { rival: r.id, city };
    expect(outcomeCash(g, ctx, { text: '', fx: [['special', 'buyRivalOffice']] }).spend).toBe(0);
    const n = r.offices.length, cash = g.company.books.cash;
    expect(SPECIALS.buyRivalOffice(g, ctx, 0)).toBeNull();
    expect(r.offices.length).toBe(n);
    expect(g.company.books.cash).toBe(cash);
  });
});

describe('audit: the board’s cuts', () => {
  it('cut one job in ten across the company, never add anyone, and pay the severance the card shows', () => {
    const g = rich({ seed: 'cuts' });
    const c = g.company;
    const o = c.offices[0];
    // small teams, as in a young company: the old rounding cut nobody in a role of five or fewer
    o.staff.ops.n = 5;
    o.staff.sales.n = 4;
    o.staff.rnd.n = 3;
    o.staff.admin.n = 0; // a role with nobody in it used to gain a person
    const before = companyHeadcount(c);
    const staff = c.offices.map((x) => ({ ...Object.fromEntries((['ops', 'sales', 'rnd', 'admin'] as const).map((k) => [k, x.staff[k].n])) }));
    g.queue = [];
    queueEvent(g, 'board_ultimatum', {});
    const opt = EVENT.board_ultimatum.opts.findIndex((x) => x.out.some((out) => out.fx?.some((f) => f[0] === 'special' && f[1] === 'boardCuts')));
    expect(moneyText(g, {}, EVENT.board_ultimatum.opts[opt])).toMatch(/^Costs ~\$/);
    const shown = -outcomeCash(g, {}, EVENT.board_ultimatum.opts[opt].out[0]).spend;
    const cash = c.books.cash, off = imbalance(g);
    resolveEvent(g, g.queue.find((e) => e.id === 'board_ultimatum')!.uid, opt);
    const cut = before - companyHeadcount(c);
    expect(cut).toBe(Math.round(before * 0.1));
    c.offices.forEach((x, i) => {
      for (const k of ['ops', 'sales', 'rnd', 'admin'] as const) {
        expect(x.staff[k].n).toBeLessThanOrEqual(staff[i][k]);
        if (k === 'ops' || k === 'admin') expect(x.staff[k].n).toBeGreaterThanOrEqual(Math.min(1, staff[i][k]));
      }
    });
    expect(shown).toBeGreaterThan(0);
    expect(cash - c.books.cash).toBeCloseTo(shown, 0);
    expect(Math.abs(imbalance(g) - off)).toBeLessThan(1);
  });
});

describe('audit: rival consolidation', () => {
  it('a rival bought earlier in the quarter does not go on trading, borrowing or moving', () => {
    let found = 0;
    for (let s = 0; s < 400 && found < 2; s++) {
      const g = newGame(opts({ seed: 'cons' + s, difficulty: 'brutal' }));
      g.turn = 12;
      g.queue = [];
      const [a, b, ...rest] = g.rivals;
      a.personality = 'predator';
      a.valuation = 1e12;
      a.cash = 1e10;
      b.valuation = 1;
      b.personality = 'expander';
      for (const r of rest) r.valuation = 1e13; // nobody else is prey
      const hist = b.revTTM.length, cash = b.cash;
      rivalsFinancials(g);
      if (b.fate !== `Acquired by ${a.name}`) continue; // a moves first, so b is bought before its own step
      found++;
      expect(b.revTTM.length).toBe(hist);
      expect(b.cash).toBe(cash);
      expect(g.queue.every((e) => e.ctx.rival !== b.id)).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('audit: retaliation', () => {
  it('a rival hits back in a business it runs: a retailer opens no software office in your home city', () => {
    let hit = 0;
    for (let s = 0; s < 40 && hit < 2; s++) {
      const g = newGame(opts({ industry: 'saas', seed: 'ret' + s, founder: 'heir' }));
      g.company.books.cash += 50e6;
      g.company.books.paidIn += 50e6;
      if (!launchDivision(g, 'retail').ok) continue;
      const before = g.rivals.length;
      rivalsForDivisions(g);
      const r = g.rivals[before];
      if (!r) continue;
      g.turn = 12;
      g.queue = [];
      g.counters.rivalCard = -99;
      r.grievances = 3;
      r.lastMove = -9;
      r.cash = Math.abs(r.cash) + 1e8;
      rivalsFinancials(g);
      if (!g.queue.some((e) => e.id === 'rival_retaliation')) continue;
      hit++;
      for (const ro of r.offices) expect(r.industries).toContain(ro.ind); // it used to open a saas office in New York
    }
    expect(hit).toBeGreaterThan(0);
  });
});

describe('audit: after the game ends', () => {
  it('diplomacy and bids refuse, unless the player keeps playing', () => {
    const g = rich({ seed: 'over' });
    const id = g.rivals[0].id;
    g.status = 'lost';
    const acts = [
      () => improveRelations(g, id), () => proposeTruce(g, id), () => proposeAlliance(g, id), () => poachTalent(g, id),
      () => sueRival(g, id), () => lobbyAgainst(g, id), () => bidForRival(g, id, false), () => bidForRival(g, id, true),
    ];
    const cash = g.company.books.cash;
    for (const act of acts) expect(act()).toEqual({ ok: false, msg: 'The game is over.' });
    expect(g.company.books.cash).toBe(cash);
    g.continued = true;
    expect(improveRelations(g, id).ok).toBe(true);
  });
});
