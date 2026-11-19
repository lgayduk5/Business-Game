// Regression tests from the audit of victory, scoring, game modes, scenarios and the advisor.
import { describe, expect, it } from 'vitest';
import {
  adoptPolicy, buyBack, canKeepPlaying, checkEnd, dailyOpts, drawRevolver, dropPolicy, endTurn, equityOf, finalGrade, followOn, gameGrade,
  keepPlaying, lockInputs, migrate, newGame, openFranchise, queueEvent, raiseEquity, repayLoan, resolveEvent, scoreCode, setGuidance, setOptionPay,
  startIPO, startScenario, takeLoan, POLICIES, type ActionResult, type GameState,
} from '../engine/src/index';
import { opts, play } from './helpers';

/** A daily challenge played to its (shortened) end. */
function finishedDaily(): GameState {
  const g = newGame(dailyOpts('2026-11-08', 'Daily'));
  g.maxTurns = 6;
  play(g, 10);
  expect(g.status).not.toBe('playing');
  return g;
}

/** Every player action in finance.ts and mechanics.ts, with ordinary arguments. */
function financeActions(g: GameState): [string, () => ActionResult][] {
  const c = g.company;
  const revolver = c.loans.find((l) => l.kind === 'revolver');
  return [
    ['takeLoan', () => takeLoan(g, g.loanOffers[0]?.id ?? 'none', 1e6)],
    ['drawRevolver', () => drawRevolver(g, 1e5)],
    ['repayLoan', () => repayLoan(g, revolver?.id ?? c.loans[0]?.id ?? 'none', 1e4)],
    ['raiseEquity', () => raiseEquity(g, 0.1)],
    ['startIPO', () => startIPO(g)],
    ['followOn', () => followOn(g, 0.1)],
    ['buyBack', () => buyBack(g, 1e6)],
    ['adoptPolicy', () => adoptPolicy(g, POLICIES[0].id)],
    ['dropPolicy', () => dropPolicy(g, POLICIES[0].id)],
    ['setGuidance', () => setGuidance(g, 'stretch')],
    ['setOptionPay', () => setOptionPay(g, 0.2)],
    ['lockInputs', () => lockInputs(g, 8)],
    ['openFranchise', () => openFranchise(g, g.company.home)],
  ];
}

describe('audit: the grade and score code are frozen when the game ends', () => {
  it('stores the grade in the outcome and reads it from there', () => {
    const g = finishedDaily();
    const fg = g.outcome!.final!;
    expect(fg.grade).toBe(g.outcome!.grade);
    expect(gameGrade(g)).toEqual(fg);
    const code = scoreCode(g);
    // whatever happens to the company afterwards (a buyback raising the founder's stake, spent cash lifting the
    // enterprise value), the grade and the code stay as they were at the end
    g.company.books.cash -= 5e6;
    g.company.cap.shares *= 0.5;
    expect(finalGrade(g).score).not.toBe(fg.score); // worked out live, it would move
    expect(gameGrade(g)).toEqual(fg);
    expect(scoreCode(g)).toBe(code);
  });

  it('finance and mechanics actions refuse after the end (a buyback moved a grade C39 to C46)', () => {
    const g = finishedDaily();
    // a listed company with cash, offers and a credit line, so that every action would otherwise go through
    const c = g.company;
    c.cap.isPublic = true;
    c.cap.price = Math.max(1, c.valuation / c.cap.shares);
    c.cap.lastRoundTurn = -99;
    c.cap.holders.push({ name: 'Public shareholders', shares: c.cap.shares * 0.3, round: 'IPO', price: 1 });
    c.cap.shares *= 1.3;
    c.books.cash += 20e6;
    c.brand = 60;
    c.divisions.push('retail');
    g.discovered[c.home] = 2;
    c.offices = c.offices.filter((o) => o.ind !== 'retail' || o.city !== c.home);
    const before = JSON.stringify(g);
    for (const [name, act] of financeActions(g)) {
      const r = act();
      expect(r.ok, name).toBe(false);
      expect(r.msg, name).toBe('The game is over.');
    }
    expect(JSON.stringify(g)).toBe(before);
  });

  it('a won game that carries on still takes finance and mechanics actions', () => {
    const g = newGame(opts({ seed: 'carry-on-finance' }));
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'marketCap', title: 'Titan', turn: g.turn, text: '' };
    expect(setOptionPay(g, 0.1).ok).toBe(false);
    keepPlaying(g);
    expect(setOptionPay(g, 0.1).ok).toBe(true);
    expect(lockInputs(g, 4).ok).toBe(true);
  });

  it('a save from before the grade was frozen still shows one, worked out again', () => {
    const g = finishedDaily();
    const fg = g.outcome!.final!;
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    delete old.outcome!.final;
    const loaded = migrate(old);
    expect(gameGrade(loaded).grade).toBe(fg.grade);
    expect(gameGrade(loaded).score).toBeCloseTo(fg.score, 6);
    expect(scoreCode(loaded)).toBe(scoreCode(g));
  });

  it('a game ended by an event (a sale) freezes its result too', () => {
    const g = play(newGame(opts({ seed: 'sold', difficulty: 'easy' })), 4);
    const rival = g.rivals.find((r) => r.alive)!;
    queueEvent(g, 'rival_takeover', { rival: rival.id, amount: g.company.valuation * 1.2 });
    const pe = g.queue.find((e) => e.id === 'rival_takeover')!;
    resolveEvent(g, pe.uid, 0);
    expect(g.status).toBe('lost');
    expect(g.outcome!.how).toBe('sold');
    expect(g.outcome!.final).toBeDefined();
    expect(gameGrade(g)).toEqual(g.outcome!.final);
  });
});

describe('audit: the starting stake the grade measures growth from', () => {
  // energy in Lagos: the founding project loan is close to what the business is worth, and some seeds start at $0
  const lagos = () => newGame(opts({ industry: 'energy', city: 'lag', founder: 'engineer', seed: 's13' }));

  it('is never a near-zero valuation, so ordinary growth is not a million-fold multiple', () => {
    const g = lagos();
    const c = g.company;
    const stake = c.cap.founder / c.cap.shares;
    expect(c.valuation).toBe(0); // the case that made "Your stake grew 2,580,891×"
    expect(g.counters.startFounderValue).toBeCloseTo((stake * equityOf(c.books)) / 3, 0);
    // the business is later worth its book value: a few times the floor, not millions of times $1
    c.valuation = equityOf(c.books);
    const fg = finalGrade(g);
    expect(fg.multiple).toBeGreaterThan(2);
    expect(fg.multiple).toBeLessThan(4);
  });

  it('leaves every ordinary start alone', () => {
    for (const [industry, city] of [['saas', 'sfo'], ['mfg', 'chi'], ['energy', 'ber'], ['biotech', 'bos']] as const) {
      const g = newGame(opts({ industry, city, seed: 'start-' + industry }));
      const c = g.company;
      expect(g.counters.startFounderValue, industry).toBe(c.valuation * (c.cap.founder / c.cap.shares));
    }
  });
});

describe('audit: a scenario the player kept going after', () => {
  it('is not judged on the challenge again (it ended the game again a quarter later)', () => {
    const g = startScenario('ch5', 'T');
    g.company.cap.isPublic = true;
    checkEnd(g);
    expect(g.status).toBe('won');
    const title = g.outcome!.title;
    expect(canKeepPlaying(g)).toBe(true);
    keepPlaying(g);
    endTurn(g);
    expect(g.status).toBe('playing');
    expect(g.continued).toBe(true);
    expect(g.outcome!.title).toBe(title);
  });

  it('cannot turn a completed challenge into a failed one', () => {
    // Profitable and broke forbids selling shares: once it is complete, selling them is the player's business
    const g = startScenario('cash_crunch', 'T');
    play(g, 20, () => {}); // left alone, it survives
    expect(g.status).toBe('won');
    keepPlaying(g);
    g.counters.equityRaised = 1e6;
    endTurn(g);
    expect(g.status).toBe('playing');
    expect(g.outcome!.kind).toBe('won');
  });

  it('a kept-going game still ends in bankruptcy', () => {
    const g = startScenario('ch5', 'T');
    g.company.cap.isPublic = true;
    checkEnd(g);
    keepPlaying(g);
    g.company.negCashTurns = 2;
    checkEnd(g);
    expect(g.status).toBe('lost');
    expect(g.outcome!.how).toBe('bankrupt');
  });
});
