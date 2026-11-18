// The second review: energy, SaaS on hard levels, ranking by growth, the Sprint, founders, measured win rates.
import { describe, expect, it } from 'vitest';
import {
  CITIES, DIFF, DIFFICULTIES, FOUNDERS, INDUSTRIES, INV, PRODUCT_GAP, SPRINT_NEED, SPRINT_OFF, VICTORY_NEED, companyGrowth, endTurn, enterpriseValue, expectLine,
  finalGrade, inTen, measuredRate, newGame, noteAcquisition, rankByGrowth, rivalValueGrowth, stageQ, startInvestment, victoryBars, victoryStatus, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

const energyCity = CITIES.filter((c) => c.ind.energy >= 1).sort((a, b) => a.id.localeCompare(b.id))[0].id;

describe('energy (review 2: close to unwinnable)', () => {
  it('rivals start about your size, not several times it', () => {
    for (const d of DIFFICULTIES) {
      const g = newGame(opts({ industry: 'energy', city: energyCity, difficulty: d, seed: 'energy-size-' + d }));
      const mine = g.company.offices.reduce((s, o) => s + o.cap, 0);
      for (const r of g.rivals) {
        const theirs = r.offices.reduce((s, o) => s + o.cap, 0);
        // between 0.8 and 1.5 times you, scaled by how big the level makes rivals (at least 0.9)
        const scale = Math.max(0.9, DIFF[d].rivalSize);
        expect(theirs / mine, `${d} ${r.name}`).toBeGreaterThan(0.7 * scale);
        expect(theirs / mine, `${d} ${r.name}`).toBeLessThan(1.6 * scale);
      }
    }
  });
  it('the end-of-game grade ranks energy companies by growth, like a Sprint', () => {
    const g = newGame(opts({ industry: 'energy', city: energyCity, seed: 'energy-rank' }));
    expect(rankByGrowth(g)).toBe(true);
    expect(rankByGrowth(newGame(opts({ industry: 'saas', seed: 'saas-rank' })))).toBe(false);
    g.turn = g.maxTurns - 1;
    expect(finalGrade(g).rows[0][0]).toMatch(/^Rank by growth/);
  });
});

describe('growth is measured on the whole business', () => {
  it('starts at one for everyone, so the grade can compare a levered player with unlevered rivals', () => {
    const g = newGame(opts({ industry: 'energy', city: energyCity, seed: 'ev-start' }));
    expect(companyGrowth(g)).toBeCloseTo(1, 6);
    for (const r of g.rivals) expect(rivalValueGrowth(g, r)).toBeCloseTo(1, 6);
  });
  it('counts the debt that financed a plant as part of the business, and cash raised and kept as not', () => {
    const g = newGame(opts({ industry: 'energy', city: energyCity, seed: 'ev-debt' }));
    const before = enterpriseValue(g.company);
    g.company.books.cash += 5e6; // raise money and sit on it: equity goes up, the business does not
    g.company.valuation += 5e6;
    expect(enterpriseValue(g.company)).toBeCloseTo(before, 0);
  });
  it('treats what was paid for an acquisition as capital put in, not as growth', () => {
    const g = newGame(opts({ seed: 'ev-acq' }));
    const before = companyGrowth(g);
    // buy a business worth what you paid: value goes up by the price, and so does the base
    const price = enterpriseValue(g.company);
    g.company.valuation += price;
    noteAcquisition(g, price);
    expect(companyGrowth(g)).toBeCloseTo(before, 3);
  });
  it('a newcomer counts against you on growth only once it is worth more than you', () => {
    const g = newGame(opts({ seed: 'newcomer', sprint: true }));
    const r = g.rivals[0];
    r.since = 20; // a startup that arrived late, judged from its first round: its growth would beat anyone's
    g.counters[`rivalStartEV${r.id}`] = 1;
    g.turn = g.maxTurns - 1;
    r.valuation = g.company.valuation * 0.5;
    const small = finalGrade(g).rank;
    r.valuation = g.company.valuation * 2;
    expect(finalGrade(g).rank).toBe(small + 1);
  });
});

describe('SaaS on hard levels (review 2: ignored difficulty)', () => {
  it('customers leave a product that trails the best one in the market, harder on harder levels, and not on Easy', () => {
    const lost: Record<string, number> = {};
    for (const d of DIFFICULTIES) {
      const g = newGame(opts({ industry: 'saas', difficulty: d, seed: 'churn' }));
      const r = g.rivals.find((x) => x.offices.some((o) => o.city === g.company.home))!;
      r.tech.saas = (g.company.tech.saas ?? 0) + PRODUCT_GAP; // a full product generation ahead
      endTurn(g);
      lost[d] = g.company.offices[0].last?.churn ?? 0;
    }
    expect(lost.easy).toBe(0);
    expect(lost.normal).toBeGreaterThan(0);
    expect(lost.hard).toBeGreaterThan(lost.normal);
    expect(lost.brutal).toBeGreaterThan(lost.hard);
    expect(INDUSTRIES.saas.productChurn).toBeGreaterThan(0);
    expect(INDUSTRIES.retail.productChurn ?? 0).toBe(0);
  });
});

describe('every victory has a bar it can be won at', () => {
  it('Blue chip keeps its own valuation bar, so lowering Titan did not make listing easier', () => {
    for (const d of DIFFICULTIES) expect(DIFF[d].blueChip).toBeLessThan(DIFF[d].titan);
  });
  it('a moonshot is open from $10M of revenue, and a failed one does not stop you trying again', () => {
    const g = newGame(opts({ industry: 'saas', seed: 'moon' }));
    g.company.books.cash = 50e6;
    play(g, 1);
    g.company.offices[0].last!.revenue = 2.6e6; // $10.4M a year
    expect(startInvestment(g, 'moonshot').ok).toBe(true);
    g.company.investments.find((x) => x.def === 'moonshot')!.state = 'failed';
    expect(startInvestment(g, 'moonshot').ok).toBe(true);
  });
});

describe('the Sprint (review 2: harder than the full game)', () => {
  it('leaves out the victories ten years cannot fit, and halves the qualifying periods of the rest', () => {
    const g = newGame(opts({ seed: 'sprint-off', sprint: true }));
    for (const v of victoryStatus(g)) expect(v.enabled, v.id).toBe(!(SPRINT_OFF as readonly string[]).includes(v.id));
    expect(victoryStatus(g).find((v) => v.id === 'dominance')!.need).toBe(SPRINT_NEED.dominance);
    expect(SPRINT_NEED.dominance).toBeLessThan(VICTORY_NEED.dominance);
    expect(victoryBars('saas', 'normal', true).map(([n]) => n)).toEqual(['Category king']);
    expect(victoryBars('saas', 'normal', false)).toHaveLength(6);
    const full = newGame(opts({ seed: 'sprint-off' }));
    expect(victoryStatus(full).every((v) => v.enabled)).toBe(true);
  });
  it('runs development projects at twice the pace, for the same money', () => {
    const g = newGame(opts({ seed: 'sprint-stage', sprint: true }));
    const full = newGame(opts({ seed: 'sprint-stage' }));
    for (const st of INV.moonshot.stages!) {
      expect(stageQ(g, st)).toBe(Math.max(1, Math.ceil(st.q / 2)));
      expect(stageQ(full, st)).toBe(st.q);
    }
  });
  it('grades on a ten-year scale: the same company scores a better letter in a Sprint than over twenty-five years', () => {
    const order = ['F', 'D', 'C', 'B', 'A'];
    let better = 0, worse = 0;
    for (let k = 0; k < 6; k++) {
      const s = play(newGame(opts({ seed: 'sprint-grade-' + k, sprint: true })), 39);
      if (s.status !== 'playing') continue;
      const fg = finalGrade(s);
      const asFull: GameState = JSON.parse(JSON.stringify(s));
      asFull.rules = {};
      const ff = finalGrade(asFull);
      if (order.indexOf(fg.grade) > order.indexOf(ff.grade)) better++;
      if (order.indexOf(fg.grade) < order.indexOf(ff.grade)) worse++;
    }
    expect(worse).toBe(0);
    expect(better).toBeGreaterThan(0);
  });
});

describe('founders (review 2: 51% to 71%)', () => {
  it('every founder has perks that match the numbers', () => {
    for (const f of FOUNDERS) {
      expect(f.perks.length, f.id).toBeGreaterThan(0);
      if (f.loanSpread < 0) expect(f.perks.join(' '), f.id).toMatch(new RegExp(`Loans ${Math.abs(f.loanSpread)} points? cheaper`));
      if (f.cash > 1 && f.cash < 3) expect(f.perks.join(' '), f.id).toMatch(new RegExp(`\\+${Math.round((f.cash - 1) * 100)}% starting cash`));
    }
  });
});

describe('difficulty cards show measured win rates for the industry picked (review 2)', () => {
  it('reads the harness results for every industry and difficulty, full game and Sprint', () => {
    for (const ind of Object.keys(INDUSTRIES) as (keyof typeof INDUSTRIES)[]) for (const d of DIFFICULTIES) for (const sprint of [false, true]) {
      const m = measuredRate(ind, d, sprint);
      expect(m, `${ind} ${d} ${sprint}`).toBeDefined();
      expect(m!.games).toBeGreaterThanOrEqual(8);
      expect(expectLine(ind, d, sprint)).toContain(`${Math.round(m!.win * 100)}%`);
    }
  });
  it('says it plainly', () => {
    expect(inTen(0.62)).toBe('about 6 games in 10');
    expect(inTen(0.04)).toBe('fewer than 1 game in 20');
    expect(inTen(0.97)).toBe('almost every game');
  });
});
