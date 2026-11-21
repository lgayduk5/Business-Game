// Valuation around new plant (decision 89). The playtest found honest Easy energy games losing 80% of their value the
// quarter they opened a plant, more again the next, then quadrupling a year later and falling back. Three things the
// trailing-year accounts did to a new plant caused it; each is pinned here, for the player and for rivals.
import { describe, expect, it } from 'vitest';
import {
  CITIES, FOUNDERS, LIKE_FOR_LIKE_Q, SPECIALS, books, endTurn, growthOf, likeForLike, newGame, newPlant, openOffice, openOfficeCost, openOfficeFinancing, rampCarry,
  rivalGrowth, rivalValuation, sellCapacity, type GameState, type IndustryId, type NewPlant, type Rival,
} from '../engine/src/index';
import { BOTS, botTurn } from '../engine/src/bots';
import { opts, play } from './helpers';

const cityFor = (ind: IndustryId) => CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id))[0].id;

/** One game, copied: the copy opens a second office (financed against its plant, where it has one), the original does not. */
function twins(ind: IndustryId, seed: string) {
  const a = newGame(opts({ industry: ind, city: cityFor(ind), seed }));
  play(a, 2);
  books.issueEquity(a.company, 20e6); // enough for a plant, in both copies
  const b: GameState = structuredClone(a);
  const city = CITIES.find((c) => c.ind[ind] >= 1 && c.id !== b.company.home && (b.discovered[c.id] ?? 0) >= 1)!.id;
  const setup = openOfficeCost(b, city, ind).setup;
  const fee = openOfficeFinancing(b, city, ind) * 0.01;
  expect(openOffice(b, city, ind, true).ok).toBe(true);
  return { a, b, o: b.company.offices.find((x) => x.city === city)!, setup, fee };
}

describe('the reported case', () => {
  it('Easy energy played steadily: opening a plant no longer moves the valuation fourfold in a quarter', () => {
    // energy/easy/steady/full/s0 in `npm run playtest`: $9.8M, then $2.0M the quarter it opened a plant, $0.5M, then up to
    // $26M a year later and back to $5.7M, the worst quarter moving 11.6 times
    const city = CITIES.filter((c) => c.ind.energy >= 1)[0].id;
    const g = newGame({ name: 'Playtest Co', industry: 'energy', city, founder: FOUNDERS[6 % FOUNDERS.length].id, difficulty: 'easy', seed: 'pt-energy-easy-0-full', mode: 'standard' });
    let prev = g.company.valuation, worst = 1;
    while (g.turn < 12 && g.status === 'playing') {
      botTurn(g, BOTS.steady);
      if (g.status !== 'playing') break;
      endTurn(g);
      const v = g.company.valuation;
      worst = Math.max(worst, v / prev, prev / v);
      prev = v;
    }
    expect(g.company.offices.length).toBeGreaterThan(1);
    expect(worst).toBeLessThan(2);
  });
});

describe('the quarter an office opens', () => {
  // a software office also takes a share of the region's marketing from the first one, which then sells a little less;
  // a power plant's neighbour is unaffected
  for (const [ind, within] of [['energy', 0.03], ['saas', 0.1]] as [IndustryId, number][]) {
    it(`${ind}: valuation looks through its opening costs, so the rest of the business is valued as before`, () => {
      const { a, b, o, setup, fee } = twins(ind, `open-${ind}`);
      endTurn(a);
      endTurn(b);
      // its first staff arrive during the quarter, so it sells nothing yet
      expect(o.hist[0].rev).toBe(0);
      // the setup, the project-finance fee and what it cost to run before its first sale are opening costs
      expect(b.company.quarters[b.company.quarters.length - 1].opening).toBeCloseTo(setup + fee - o.hist[0].contrib, 0);
      // left in the trailing year, they cut the margin and so the multiple on the whole business by about 40%
      expect(b.company.valParts.ops / a.company.valParts.ops).toBeGreaterThan(1 - within);
      expect(b.company.valParts.ops / a.company.valParts.ops).toBeLessThan(1 + within);
    });
  }
  it('a plant that has not sold anything is carried at its full cost', () => {
    const { a, b, o } = twins('energy', 'open-cost');
    const cost = o.ramp![0].cost;
    endTurn(a);
    endTurn(b);
    // it was carried at three quarters of its cost, as though a quarter of its sales were already in the accounts
    expect(b.company.valParts.cip - a.company.valParts.cip).toBeCloseTo(cost, -3);
  });
});

describe('like-for-like growth', () => {
  it("a new grid plant's sales are not growth until both years compared include them", () => {
    const { b, o } = twins('energy', 'lfl');
    play(b, 6);
    const p = o.ramp!.find((r) => r.rev)!;
    // it records the office's sales from its first sale
    expect(p.rev).toEqual(o.hist.slice(1).map((h) => h.rev));
    const v = b.company.valParts;
    expect(v.growth).toBeCloseTo(growthOf(likeForLike(b.company.quarters.map((q) => q.pnl.revenue), b.company.offices.flatMap((x) => x.ramp ?? []))), 9);
    // the second plant about doubled sales; counted as growth, it re-rated the whole company for a year, then wore off
    expect(v.growthAll - v.growth).toBeGreaterThan(0.3);
    // with two full years of its sales behind it, it is like-for-like, and the record goes
    play(b, LIKE_FOR_LIKE_Q - p.rev!.length);
    expect(p.rev).toHaveLength(LIKE_FOR_LIKE_Q);
    expect(b.company.valParts.growth).toBeCloseTo(b.company.valParts.growthAll, 9);
    play(b, 1);
    expect(o.ramp ?? []).toHaveLength(0);
  });
  it('only for a whole new office in a grid industry: elsewhere a new office wins its customers over time, and that is growth', () => {
    expect(newPlant('energy', 1, 0, {}).rev).toEqual([]);
    expect(newPlant('energy', 1, 0).rev).toBeUndefined(); // an expansion: its sales cannot be told from the rest of the office's
    for (const ind of ['retail', 'mfg', 'logistics', 'biotech'] as IndustryId[]) expect(newPlant(ind, 1, 0, {}).rev).toBeUndefined();
  });
});

describe('rivals', () => {
  it('are valued by the same rules: a new grid plant is carried from its first sale and kept out of growth', () => {
    const g = newGame(opts({ industry: 'energy', city: cityFor('energy'), seed: 'lfl-rival' }));
    const r = g.rivals.find((x) => x.alive && x.industries[0] === 'energy')!;
    // with money to spare, it opens a plant of its own
    for (let i = 0; i < 40 && !(r.ramp ?? []).some((x) => x.rev); i++) {
      r.cash = 5e8;
      endTurn(g);
    }
    const p = r.ramp!.find((x) => x.rev)!;
    const ro = r.offices.find((x) => `${x.city}:${x.ind}` === p.at)!;
    // a rival's office sells from the quarter it opens, so that is where its year starts
    expect(p.done).toBe(ro.opened);
    expect(p.rev![0]).toBeGreaterThan(0);
    endTurn(g);
    const v = rivalValuation(g, r);
    expect(v.parts.growth).toBeCloseTo(growthOf(likeForLike(r.revTTM, r.ramp ?? [])), 9);
    expect(v.parts.growth).toBeLessThan(rivalGrowth(r));
  });
});

describe('new plant goes with the office', () => {
  const carried = (g: GameState, ps: readonly NewPlant[]) => ps.reduce((s, x) => s + x.cost * rampCarry(g, x), 0);
  const has = (r: Rival, at: string | undefined) => r.offices.some((ro) => `${ro.city}:${ro.ind}` === at);
  for (const ind of ['energy', 'retail'] as IndustryId[]) {
    it(`${ind}: a rival's plant in an office it gives up is no longer carried at cost`, () => {
      const g = newGame(opts({ industry: ind, city: cityFor(ind), seed: 'plant-office' }));
      const r = g.rivals.find((x) => x.alive && x.industries[0] === ind)!;
      let p: NewPlant | undefined;
      for (let i = 0; i < 40 && !p; i++) {
        r.cash = 5e8;
        endTurn(g);
        // every record of a rival's new plant, expansions included, names the office it is in
        expect((r.ramp ?? []).every((x) => x.at)).toBe(true);
        p = r.offices.length >= 2 ? (r.ramp ?? []).find((x) => rampCarry(g, x) > 0 && has(r, x.at)) : undefined;
      }
      expect(p).toBeDefined();
      const cip = rivalValuation(g, r).parts.cip;
      const gone = carried(g, r.ramp!.filter((x) => x.at === p!.at));
      SPECIALS.rivalExit(g, { rival: r.id, city: p!.at!.split(':')[0] }, 0);
      expect(has(r, p!.at)).toBe(false);
      // it carried that plant at cost after the office had gone
      expect(gone).toBeGreaterThan(0);
      expect(rivalValuation(g, r).parts.cip).toBeCloseTo(cip - gone, 0);
      endTurn(g);
      expect((r.ramp ?? []).some((x) => x.at === p!.at)).toBe(false);
    });
  }
  it('a grid rival that withdraws and comes back keeps one record of the office, so its sales leave growth once', () => {
    let back = '';
    for (let s = 0; s < 60 && !back; s++) {
      const g = newGame(opts({ industry: 'energy', city: cityFor('energy'), seed: 'plant-office' + s }));
      const r = g.rivals.find((x) => x.alive && x.industries[0] === 'energy')!;
      const left = new Map<string, number>();
      for (let i = 0; i < 80 && !back && r.alive; i++) {
        r.cash = 5e8;
        endTurn(g);
        const lfl = (r.ramp ?? []).filter((x) => x.rev).map((x) => x.at);
        expect(new Set(lfl).size).toBe(lfl.length);
        for (const [at, t] of left) if (g.turn - t < LIKE_FOR_LIKE_Q && has(r, at) && lfl.includes(at)) back = at;
        // withdraw from a new plant once it has a couple of quarters of sales
        const p = (r.ramp ?? []).find((x) => x.rev && x.rev.length >= 2 && !left.has(x.at!));
        if (p && r.offices.length >= 2) {
          SPECIALS.rivalExit(g, { rival: r.id, city: p.at!.split(':')[0] }, 0);
          left.set(p.at!, g.turn);
        }
      }
      if (back) expect(rivalValuation(g, r).parts.growth).toBeCloseTo(growthOf(likeForLike(r.revTTM, (r.ramp ?? []).filter((x) => has(r, x.at)))), 9);
    }
    expect(back).not.toBe('');
  });
  it('selling some of your own new plant stops carrying that part at cost', () => {
    const { b, o } = twins('energy', 'sell-new');
    const before = carried(b, o.ramp!);
    expect(before).toBeGreaterThan(0);
    const units = Math.round(o.cap / 4), left = 1 - units / o.cap;
    expect(sellCapacity(b, o.id, units).ok).toBe(true);
    expect(carried(b, o.ramp!) / before).toBeCloseTo(left, 9);
  });
});
