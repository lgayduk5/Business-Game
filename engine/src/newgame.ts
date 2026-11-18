// World and company generation.
import { emptyBooks, emptyPnL, emptyTags, ttm } from './books';
import { CITIES, CITY, FOUNDER, INDUSTRIES, NAMES, REGION_LIST } from './content';
import { refreshEquityOffer, refreshLoanOffers, revalue } from './finance';
import { newMacro } from './macro';
import { market, marketUnits } from './market';
import { prepOffice } from './people';
import { refreshCandidates } from './actions';
import { generateRivals } from './rivals';
import { seedHistory } from './history';
import { DIFF } from './difficulty';
import { SAVE_VERSION } from './save';
import type { ExecRole, GameState, IndustryId, NewGameOpts, Office, Person, RegionId, RegionPolicy, VictoryId } from './types';
import { clamp, hashSeed, nextUid, normal, pick, randInt } from './util';

export function makePerson(g: GameState, role: ExecRole, office?: Office, quality = 0): Person {
  const skill = clamp(Math.round(normal(g, 58 + quality, 11)), 30, 95);
  const ind = office ? INDUSTRIES[office.ind] : INDUSTRIES[g.company.primary];
  const cityWage = office ? CITY[office.city].wage : CITY[g.company.home].wage;
  const base = role === 'GM' ? ind.wages.admin * 1.2 : ind.wages.admin * 2.0;
  return {
    id: 'p' + nextUid(g), name: `${pick(g, NAMES.first)} ${pick(g, NAMES.last)}`, role, skill, loyalty: randInt(g, 40, 85),
    salary: Math.round(base * 1000 * cityWage * (0.6 + skill / 100)), trait: pick(g, NAMES.traits), office: office?.id, hired: g.turn,
  };
}

export function makeOffice(g: GameState, cityId: string, ind: IndustryId, staff: { ops: number; sales: number; rnd: number; admin: number }, cap: number): Office {
  const city = CITY[cityId];
  const grp = (n: number) => ({ n, skill: clamp(city.talentQ + 3, 20, 95), reqs: 0, fresh: 0 });
  const o: Office = {
    id: 'o' + nextUid(g), city: cityId, ind, name: `${city.name} ${INDUSTRIES[ind].short}`, opened: g.turn,
    staff: { ops: grp(staff.ops), sales: grp(staff.sales), rnd: grp(staff.rnd), admin: grp(staff.admin) },
    pay: 1, morale: 66, autoBackfill: true, training: 0, cap, building: [], ppe: 0, accDep: 0, share: 0, inventory: 0, invValue: 0,
    lastDemand: 0, scar: 0, integration: 0, hist: [],
  };
  const gm = makePerson(g, 'GM', o);
  g.company.people.push(gm);
  o.gm = gm.id;
  market(g, cityId, ind);
  return o;
}

/** A Sprint game lasts ten years. */
export const SPRINT_QUARTERS = 40;

const ALL_REGIONS: RegionId[] = ['nae', 'naw', 'latam', 'europe', 'mea', 'apac'];
const perRegion = <T>(f: () => T) => Object.fromEntries(ALL_REGIONS.map((r) => [r, f()])) as Record<RegionId, T>;

export function newGame(opts: NewGameOpts): GameState {
  const def = INDUSTRIES[opts.industry];
  const city = CITY[opts.city];
  const f = FOUNDER[opts.founder];
  const d = DIFF[opts.difficulty];
  if (!def || !city || !f) throw new Error('Unknown industry, city or founder');
  const victories = Object.fromEntries((['marketCap', 'dominance', 'ipo', 'innovation', 'reputation', 'lastStanding'] as VictoryId[]).map((v) => [v, true])) as Record<VictoryId, boolean>;
  const sandbox = opts.mode === 'sandbox';
  const g: GameState = {
    v: SAVE_VERSION, id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), seed: opts.seed, rng: hashSeed(opts.seed), uid: 0, turn: 0,
    maxTurns: opts.sprint ? SPRINT_QUARTERS : 100, mode: opts.mode, scenario: opts.scenario, difficulty: opts.difficulty,
    rules: { ...(opts.sprint ? { sprint: true } : {}), ...(opts.ironman ? { ironman: true } : {}), ...(opts.daily ? { daily: opts.daily } : {}) },
    settings: { victories, sandbox: { noBankruptcy: sandbox, revealMap: sandbox, noEvents: false, calmMacro: false }, tutorial: true, delegate: true },
    company: {
      name: opts.name || 'Newco', founder: opts.founder, home: opts.city, primary: opts.industry, divisions: [opts.industry], offices: [],
      tech: { [opts.industry]: clamp(def.startTech + f.tech + (f.ind?.[opts.industry] ?? 0), 5, 100) }, rdBudget: {},
      brand: clamp(4 + f.brand, 0, 100), reputation: 50, esg: 45, culture: clamp(55 + f.culture, 0, 100),
      regionBrand: perRegion(() => 0), policy: perRegion<RegionPolicy>(() => ({ price: {}, marketing: 0, supply: 'balanced' })),
      books: emptyBooks(), open: emptyBooks(), techInfo: {}, loans: [],
      cap: { shares: 10_000_000, founder: 10_000_000 * f.equity, holders: [], isPublic: false, ipoTurn: -1, ipoStage: 0, price: 0, premium: 1, lastRoundTurn: -99, lastPost: 0, rounds: 0, expectedEps: 0, dividend: 0, boardPressure: 0 },
      people: [], investments: [], nol: 0, nolBy: {}, intel: 0, quarters: [], pnl: emptyPnL(), cfTags: emptyTags(), valuation: 0, valParts: {}, rating: 'B', ratingScore: 40,
      autoRevolver: true, negCashTurns: 0, moonshots: 0, diligence: {},
    },
    discovered: {}, scouting: [], mk: {}, cityIdx: Object.fromEntries(CITIES.map((c) => [c.id, 1])), macro: newMacro(), rivals: [],
    queue: [], scheduled: [], fired: {}, eventLog: [], flags: {}, mods: [], news: [], advisor: [], history: [],
    attribution: { market: 0, strategy: 0, luck: 0, execution: 0, notes: [] }, targets: [], candidates: [], loanOffers: [],
    status: 'playing', continued: false, streaks: {}, counters: {}, created: Date.now(),
  };
  const c = g.company;
  if (f.equity < 1) c.cap.holders.push({ name: 'Founding backers', shares: 10_000_000 * (1 - f.equity), round: 'Founding', price: 0 });
  c.regionBrand[city.region] = clamp(6 + f.brand, 0, 100);

  // The founding office.
  const s = def.start;
  const o = makeOffice(g, opts.city, opts.industry, s, s.cap);
  o.opened = -3; // you have been at this a while before the game starts
  c.offices.push(o);
  const b = c.books;
  b.cash = s.cash * 1000 * f.cash * d.cash;
  b.ppe = o.ppe = s.cap * def.capPerUnit * 1000;
  if (s.debt > 0) {
    b.debt = s.debt * 1000;
    const project = opts.industry === 'energy';
    c.loans.push({
      id: 'ln' + nextUid(g), kind: project ? 'project' : 'term', name: project ? 'Founding project loan' : 'Founding equipment loan', principal: b.debt, limit: 0,
      spread: 3, fixedRate: 6, floating: !project, start: 0, maturity: project ? 72 : 24, amort: b.debt / (project ? 72 : 24), breaches: 0, waivedUntil: 4, office: o.id,
    });
  }
  b.paidIn = b.cash + b.ppe - b.debt;
  c.open = { ...b };

  for (const cd of CITIES) g.discovered[cd.id] = cd.id === opts.city ? 2 : cd.region === city.region || sandbox ? 1 : 0;
  g.rivals = generateRivals(g, opts.rivals ?? d.rivals);

  // The company has been trading for a while: an established customer base that fills most of its
  // capacity. Without enough sales effort to hold it, share drifts down towards what the team can sustain.
  o.opened = -6;
  const D = marketUnits(g, o.city, o.ind);
  const capUnits = prepOffice(g, o).capacity;
  o.share = Math.min(0.12, (0.85 * capUnits) / D);
  o.lastDemand = o.share * D;
  // a year of trading history (a scenario seeds it after rearranging the starting position)
  if (opts.mode === 'scenario') revalue(g);
  else seedHistory(g);
  g.counters.startValuation = c.valuation;
  g.counters.startRevenue = ttm(c, (q) => q.pnl.revenue);
  g.counters.startFounderValue = c.valuation * (c.cap.founder / c.cap.shares);
  for (const r of g.rivals) g.counters[`rivalStart${r.id}`] = r.valuation;
  g.counters.lastSentiment = g.macro.sentiment;
  refreshCandidates(g);
  refreshLoanOffers(g);
  refreshEquityOffer(g);
  return g;
}

export { ALL_REGIONS, REGION_LIST };
