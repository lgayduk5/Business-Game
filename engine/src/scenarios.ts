// Scenario challenges: a prepared starting position and a single goal with a deadline.
import * as B from './books';
import { SCENARIOS } from './content';
import { founderStake } from './finance';
import { startInvestment } from './invest';
import { news } from './mods';
import { newGame } from './newgame';
import { seedHistory } from './history';
import type { GameState, NewGameOpts, ScenarioDef } from './types';
import { money, pct } from './util';

/** Change balance-sheet accounts at the start of a game, keeping the books balanced through paid-in capital. */
function adjust(g: GameState, f: (b: GameState['company']['books']) => void) {
  const b = g.company.books;
  const before = b.cash + b.ar + b.inventory + (b.ppe - b.accDep) + b.goodwill + b.securities - b.ap - b.deferred - b.debt;
  f(b);
  const after = b.cash + b.ar + b.inventory + (b.ppe - b.accDep) + b.goodwill + b.securities - b.ap - b.deferred - b.debt;
  b.paidIn += after - before;
  g.company.open = { ...b };
}

const SETUPS: Record<string, (g: GameState) => void> = {
  cashCrunch: (g) => {
    const c = g.company;
    const o = c.offices[0];
    o.cap = 2200;
    o.ppe = 2200 * 2800;
    o.staff.ops.n = 30;
    o.staff.sales.n = 6;
    o.staff.admin.n = 3;
    o.share *= 2.6;
    o.lastDemand *= 2.6;
    o.inventory = 1400;
    o.invValue = 1400 * 480;
    // Suppliers have been stretched to breaking point: the overdue bills fall due this quarter.
    adjust(g, (b) => {
      b.ppe = o.ppe;
      b.cash = 300_000;
      b.ar = 1_400_000;
      b.inventory = o.invValue;
      b.ap = 1_700_000;
      b.debt = 3_000_000;
    });
    c.loans = [
      { id: 'lnS1', kind: 'revolver', name: 'Lakeshore revolving credit line', principal: 1_200_000, limit: 1_600_000, spread: 3.5, fixedRate: 0, floating: true, start: 0, maturity: 12, amort: 0, minCoverage: 1.5, breaches: 0, waivedUntil: 2 },
      { id: 'lnS2', kind: 'term', name: 'Equipment term loan', principal: 1_800_000, limit: 0, spread: 3, fixedRate: 0, floating: true, start: 0, maturity: 20, amort: 90_000, maxLeverage: 3.5, breaches: 0, waivedUntil: 2 },
    ];
  },
  rateShock: (g) => {
    const c = g.company;
    const o = c.offices[0];
    o.cap = 2600;
    o.ppe = 2600 * 22000;
    o.share = Math.min(0.12, o.share * 3.5);
    o.lastDemand *= 3.5;
    adjust(g, (b) => {
      b.ppe = o.ppe;
      b.cash = 2_500_000;
      b.debt = 36_000_000;
    });
    c.loans = [{ id: 'lnR1', kind: 'project', name: 'Floating-rate project loan', principal: 36_000_000, limit: 0, spread: 2.2, fixedRate: 0, floating: true, start: 0, maturity: 72, amort: 36_000_000 / 72, minCoverage: 1.3, breaches: 0, waivedUntil: 1 }];
    g.macro.infl = 4.8;
    g.macro.gap = 2.2;
    g.macro.shock.rate = 1.5;
  },
  blitzscale: (g) => {
    const c = g.company;
    const raised = 15_000_000;
    B.issueEquity(c, raised);
    c.cap.holders.push({ name: 'Ridgeline Ventures', shares: c.cap.shares * 0.25, round: 'Series A', price: (raised / 0.25) / c.cap.shares });
    c.cap.shares *= 1.25;
    c.cap.rounds = 1;
    c.cap.lastPost = raised / 0.2;
    c.open = { ...c.books };
    c.cfTags = { op: 0, inv: 0, fin: 0, capex: 0, acq: 0, disp: 0, sec: 0, debtIn: 0, debtOut: 0, eqIn: 0, buyback: 0, div: 0, noncash: 0 };
  },
  turnaround: (g) => {
    const c = g.company;
    const o = c.offices[0];
    o.cap = 1500;
    o.ppe = 1500 * 1400;
    // Years of drift: too many managers, a marketing team nobody measures, a menu team, discounting.
    o.staff.ops.n = 64;
    o.staff.sales.n = 8;
    o.staff.rnd.n = 3;
    o.staff.admin.n = 10;
    o.pay = 1.0;
    o.morale = 32;
    o.scar = 15;
    o.share = o.share * 2.8;
    o.lastDemand *= 2.8;
    c.culture = 34;
    c.reputation = 42;
    c.policy.nae.price.retail = 0.92;
    c.policy.nae.marketing = 120_000;
    adjust(g, (b) => {
      b.ppe = o.ppe;
      b.cash = 2_200_000;
    });
  },
  phase3: (g) => {
    const c = g.company;
    adjust(g, (b) => { b.cash = 6_000_000; });
    const r = startInvestment(g, 'drug');
    const inv = c.investments[c.investments.length - 1];
    if (r.ok && inv) {
      inv.stage = 3;
      inv.stageLeft = 4;
    }
    c.tech.biotech = (c.tech.biotech ?? 20) + 6;
    c.open = { ...c.books };
    c.pnl = B.emptyPnL();
    c.cfTags = { op: 0, inv: 0, fin: 0, capex: 0, acq: 0, disp: 0, sec: 0, debtIn: 0, debtOut: 0, eqIn: 0, buyback: 0, div: 0, noncash: 0 };
  },
  network: (g) => {
    adjust(g, (b) => { b.cash += 4_000_000; });
    for (const id of ['lon', 'ber', 'chi', 'sin']) g.discovered[id] = Math.max(1, g.discovered[id] ?? 0);
  },
};

export function startScenario(id: string, name: string): GameState {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('Unknown scenario');
  const opts: NewGameOpts = { name, industry: s.industry, city: s.city, founder: s.founder, difficulty: s.difficulty, seed: s.seed, mode: 'scenario', scenario: s.id };
  const g = newGame(opts);
  SETUPS[s.setup]?.(g);
  seedHistory(g);
  g.maxTurns = 100;
  g.counters.scenarioEnd = s.turns;
  g.counters.startValuation = g.company.valuation;
  g.counters.scenarioStartValuation = g.company.valuation;
  news(g, s.goal.text, 'info');
  return g;
}

export function scenarioDef(g: GameState): ScenarioDef | undefined {
  return g.scenario ? SCENARIOS.find((x) => x.id === g.scenario) : undefined;
}

export interface ScenarioStatus { progress: number; met: boolean; failed: string; detail: string; left: number }
/** Progress on the scenario goal. `turn` is the number of quarters completed (defaults to the current turn). */
export function scenarioStatus(g: GameState, turn = g.turn): ScenarioStatus | undefined {
  const s = scenarioDef(g);
  if (!s) return undefined;
  const c = g.company;
  const end = g.counters.scenarioEnd ?? s.turns;
  const left = Math.max(0, end - turn);
  const goal = s.goal;
  const rev = B.ttm(c, (q) => q.pnl.revenue);
  let failed = '';
  if (goal.noEquity && (g.counters.equityRaised ?? 0) > 0) failed = 'You sold shares, which this challenge forbids.';
  if (goal.maxDilution !== undefined && founderStake(c) < 1 - goal.maxDilution) failed = `You own less than ${pct(1 - goal.maxDilution)} of the company.`;
  let progress = 0, met = false, detail = '';
  switch (goal.kind) {
    case 'survive': progress = Math.min(1, turn / goal.value); met = turn >= goal.value; detail = `${Math.min(turn, goal.value)} of ${goal.value} quarters survived.`; break;
    case 'valuation': {
      // the rate-shock goal is judged at the deadline; the others as soon as the bar is cleared
      const atEnd = s.id === 'rate_shock';
      const target = goal.value * g.macro.cpi;
      progress = Math.min(1, c.valuation / target);
      met = atEnd ? left === 0 && c.valuation >= target : c.valuation >= target;
      detail = `Worth ${money(c.valuation)} of the ${money(target)} needed${atEnd ? ' at the deadline' : ''}.`;
      break;
    }
    case 'revenue': progress = Math.min(1, rev / goal.value); met = rev >= goal.value && turn >= 2; detail = `${money(rev)} of ${money(goal.value)} annual revenue.`; break;
    case 'profit': {
      const played = c.quarters.filter((q) => q.turn >= 0); // the history before the game starts does not count
      const qs = played.slice(-goal.value);
      const n = qs.length === goal.value && qs.every((q) => q.ni > 0) ? goal.value : played.slice().reverse().findIndex((q) => q.ni <= 0);
      const streak = n < 0 ? played.length : n;
      progress = Math.min(1, streak / goal.value);
      met = streak >= goal.value;
      detail = `${Math.min(streak, goal.value)} of ${goal.value} profitable quarters in a row.`;
      break;
    }
    case 'offices': {
      const prof = B.ttm(c, (q) => q.ni) > 0;
      progress = Math.min(1, c.offices.length / goal.value) * (prof ? 1 : 0.9);
      met = c.offices.length >= goal.value && prof && turn >= 4;
      detail = `${c.offices.length} of ${goal.value} offices; ${prof ? 'profitable' : 'not yet profitable'} over the last year.`;
      break;
    }
    default: detail = goal.text;
  }
  if (failed) met = false;
  return { progress, met, failed, detail, left };
}

/** Scenario win or loss, called from checkEnd with the number of quarters completed. Returns true if the game ended. */
export function checkScenario(g: GameState, turn = g.turn): boolean {
  const s = scenarioDef(g);
  const st = scenarioStatus(g, turn);
  if (!s || !st) return false;
  if (st.failed) {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'scenario', title: 'Challenge failed', turn: g.turn, text: st.failed };
    return true;
  }
  if (st.met) {
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'scenario', title: `${s.name}: complete`, turn: g.turn, text: `You did it. ${st.detail}` };
    return true;
  }
  if (st.left === 0 && s.goal.kind !== 'survive') {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'scenario', title: 'Out of time', turn: g.turn, text: `The deadline has passed. ${st.detail}` };
    return true;
  }
  return false;
}
