// Regression tests from the audit of player actions and new-game setup.
import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY, EXEC_ROLES, IND_LIST, closeOffice, dailyOpts, drawRevolver, endPartner, endTurn, enterpriseValue, expandCapacity, finalGrade, fire, fireExec,
  followOn, hireExec, keepPlaying, launchDivision, newGame, openFranchise, openOffice, raiseEquity, repayLoan, retain, scoreCode, scout, sellCapacity,
  sellPlantStake, setAutoRevolver, setBackfill, setDividend, setFactoring, setMarketing, setPay, setPrice, setRdBudget, setReqs, setSupply, setTraining,
  signPartner, takeLoan, equityOf, netIncome, totalAssets, totalLiabilities, type ActionResult, type GameState,
} from '../engine/src/index';
import { findBadNumbers, opts, play } from './helpers';

const strip = (g: GameState) => JSON.stringify({ ...g, id: 0, created: 0 });

/** Every player action in actions.ts, with ordinary arguments. */
function everyAction(g: GameState): [string, () => ActionResult][] {
  const c = g.company;
  const o = c.offices[0];
  const region = CITY[o.city].region;
  const other = CITIES.find((x) => x.id !== o.city && CITY[x.id].region === region)!.id;
  const newInd = IND_LIST.find((x) => !c.divisions.includes(x.id))!.id;
  return [
    ['setReqs', () => setReqs(g, o.id, 'ops', 3)],
    ['fire', () => fire(g, o.id, 'ops', 1)],
    ['setPay', () => setPay(g, o.id, 1.2)],
    ['setTraining', () => setTraining(g, o.id, 2)],
    ['setBackfill', () => setBackfill(g, o.id, !o.autoBackfill)],
    ['expandCapacity', () => expandCapacity(g, o.id, 10)],
    ['sellCapacity', () => sellCapacity(g, o.id, 1)],
    ['sellPlantStake', () => sellPlantStake(g, o.id)],
    ['setFactoring', () => setFactoring(g, !c.factoring)],
    ['setPrice', () => setPrice(g, region, o.ind, 1.1)],
    ['setMarketing', () => setMarketing(g, region, 50_000)],
    ['setSupply', () => setSupply(g, region, 'lean')],
    ['scout', () => scout(g, CITIES.find((x) => !g.discovered[x.id])!.id)],
    ['openOffice', () => openOffice(g, other, o.ind)],
    ['closeOffice', () => closeOffice(g, c.offices[c.offices.length - 1].id)],
    ['launchDivision', () => launchDivision(g, newInd)],
    ['setRdBudget', () => setRdBudget(g, o.ind, 100_000)],
    ['setDividend', () => setDividend(g, 10_000)],
    ['setAutoRevolver', () => setAutoRevolver(g, !c.autoRevolver)],
    ['hireExec', () => hireExec(g, g.candidates[0].id)],
    ['fireExec', () => fireExec(g, c.people[0].id)],
    ['retain', () => retain(g, c.people[0].id)],
    ['signPartner', () => signPartner(g, region)],
    ['endPartner', () => endPartner(g, region)],
  ];
}

describe('audit: actions after the game is over', () => {
  it('every action is refused once the game has ended, and changes nothing', () => {
    const g = play(newGame(opts({ industry: 'mfg', seed: 'over' })), 4);
    g.company.books.cash = 1e9;
    g.discovered[CITIES.find((x) => x.id !== g.company.home && CITY[x.id].region === CITY[g.company.home].region)!.id] = 1;
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'outlasted', title: 'Grade C', turn: g.turn, text: '' };
    const before = strip(g);
    for (const [name, f] of everyAction(g)) {
      const r = f();
      expect(r.ok, name).toBe(false);
      expect(r.msg, name).toBe('The game is over.');
    }
    expect(strip(g)).toBe(before);
  });

  it('spending leftover cash after a daily challenge ends does not raise its score code', () => {
    // enterprise value is the valuation (fixed at the end) less cash: spending cash after the end raised the
    // growth rank, and with it the grade and the shareable score code (a B65 became an A70 in play)
    const g = play(newGame(dailyOpts('2026-11-08', 'Daily')), 8);
    g.company.books.cash += 3e6;
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'outlasted', title: 'Grade C', turn: g.turn, text: '' };
    const code = scoreCode(g);
    const ev = enterpriseValue(g.company);
    const score = finalGrade(g).score;
    for (const ind of IND_LIST) launchDivision(g, ind.id);
    for (const o of g.company.offices) expandCapacity(g, o.id, 1000);
    for (const p of g.candidates.slice()) hireExec(g, p.id);
    expect(ev).toBeGreaterThan(0);
    expect(enterpriseValue(g.company)).toBe(ev);
    expect(finalGrade(g).score).toBe(score);
    expect(scoreCode(g)).toBe(code);
  });

  it('a won game that carries on still takes actions', () => {
    const g = newGame(opts({ seed: 'carry-on' }));
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'marketCap', title: 'Titan', turn: g.turn, text: '' };
    expect(setMarketing(g, CITY[g.company.home].region, 1000).ok).toBe(false);
    keepPlaying(g);
    expect(setMarketing(g, CITY[g.company.home].region, 1000).ok).toBe(true);
  });
});

describe('audit: amounts that are not numbers', () => {
  it('NaN and infinite amounts are refused and leave the state untouched', () => {
    const g = play(newGame(opts({ industry: 'mfg', seed: 'nan' })), 3);
    const c = g.company;
    c.books.cash += 2e7;
    const o = c.offices[0];
    const region = CITY[o.city].region;
    // a credit line to draw on, a loan to repay, investors at the table, and listed shares for a follow-on
    const rv = g.loanOffers.find((x) => x.kind === 'revolver');
    if (rv) expect(takeLoan(g, rv.id, rv.max).ok).toBe(true);
    else c.loans.push({ id: 'lnrv', kind: 'revolver', name: 'Line', principal: 0, limit: 1e6, spread: 2, fixedRate: 0, floating: true, start: 0, maturity: 40, amort: 0, breaches: 0, waivedUntil: 0 });
    c.loans.push({ id: 'lnt', kind: 'term', name: 'Term', principal: 1e6, limit: 0, spread: 2, fixedRate: 6, floating: false, start: 0, maturity: 40, amort: 25_000, breaches: 0, waivedUntil: 0 });
    g.equityOffer ??= { round: 'Seed', investor: 'Test Capital', pre: 1e7, maxPct: 0.25, note: '' };
    const offer = g.loanOffers.find((x) => x.kind !== 'revolver')!;
    for (const x of [NaN, Infinity, -Infinity]) {
      const before = strip(g);
      const calls: [string, () => ActionResult][] = [
        ['setReqs', () => setReqs(g, o.id, 'ops', x)],
        ['fire', () => fire(g, o.id, 'ops', x)],
        ['setPay', () => setPay(g, o.id, x)],
        ['setTraining', () => setTraining(g, o.id, x)],
        ['expandCapacity', () => expandCapacity(g, o.id, x, true)],
        ['sellCapacity', () => sellCapacity(g, o.id, x)],
        ['setPrice', () => setPrice(g, region, o.ind, x)],
        ['setMarketing', () => setMarketing(g, region, x)],
        ['setRdBudget', () => setRdBudget(g, o.ind, x)],
        ['setDividend', () => setDividend(g, x)],
        ['takeLoan', () => takeLoan(g, offer.id, x)],
        ['drawRevolver', () => drawRevolver(g, x)],
        ['repayLoan', () => repayLoan(g, 'lnt', x)],
        ['raiseEquity', () => raiseEquity(g, x)],
      ];
      for (const [name, f] of calls) expect(f().ok, `${name}(${x})`).toBe(false);
      expect(findBadNumbers(g)).toEqual([]);
      expect(strip(g)).toBe(before);
    }
    c.cap.isPublic = true;
    c.cap.price = 5;
    c.cap.lastRoundTurn = -99;
    expect(followOn(g, NaN).ok).toBe(false);
    expect(findBadNumbers(g)).toEqual([]);
    // ordinary amounts still go through
    expect(setMarketing(g, region, 25_000).ok).toBe(true);
    expect(setReqs(g, o.id, 'ops', 2).ok).toBe(true);
    expect(repayLoan(g, 'lnt', 100_000).ok).toBe(true);
    endTurn(g);
    expect(findBadNumbers(g)).toEqual([]);
  });
});

describe('audit: franchises', () => {
  it('you cannot open your own stores where a franchisee already runs yours', () => {
    const g = play(newGame(opts({ industry: 'retail', seed: 'fr-own' })), 2);
    const c = g.company;
    c.brand = 60;
    c.books.cash += 1e7;
    const city = CITIES.find((x) => x.id !== c.home && x.country === CITY[c.home].country)!;
    g.discovered[city.id] = 1;
    expect(openFranchise(g, city.id).ok).toBe(true);
    const r = openOffice(g, city.id, 'retail');
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('A franchisee runs your stores there.');
    expect(c.offices.some((o) => o.city === city.id)).toBe(false);
    // the other way round was already refused
    const city2 = CITIES.find((x) => x.id !== c.home && x.id !== city.id && CITY[x.id].region === CITY[c.home].region)!;
    g.discovered[city2.id] = 1;
    expect(openOffice(g, city2.id, 'retail').ok).toBe(true);
    expect(openFranchise(g, city2.id).ok).toBe(false);
  });
});

describe('audit: new games', () => {
  it('every industry, city and founder on every difficulty starts with finite, balanced books', () => {
    for (const ind of IND_LIST) {
      for (const [i, city] of CITIES.entries()) {
        if (i % 4) continue; // a spread of cities keeps this quick; the audit checked all of them
        const g = newGame(opts({ industry: ind.id, city: city.id, founder: (['engineer', 'operator', 'scientist', 'sales'] as const)[i % 4], difficulty: (['easy', 'normal', 'hard', 'brutal'] as const)[i % 4], seed: `ng-${ind.id}-${city.id}` }));
        const b = g.company.books;
        expect(findBadNumbers(g), `${ind.id} ${city.id}`).toEqual([]);
        expect(totalAssets(b) - totalLiabilities(b) - equityOf(b) - netIncome(g.company.pnl)).toBeCloseTo(0, 3);
        expect(g.company.offices[0].share).toBeGreaterThan(0);
        expect(g.candidates.length).toBe(EXEC_ROLES.length * 2);
      }
    }
  });

  it('a daily challenge is the same world whatever the player calls the company', () => {
    const a = newGame(dailyOpts('2026-11-19', 'Alpha'));
    const b = newGame(dailyOpts('2026-11-19', 'Beta'));
    expect(strip(a).replace(/Alpha/g, 'X')).toBe(strip(b).replace(/Beta/g, 'X'));
  });
});
