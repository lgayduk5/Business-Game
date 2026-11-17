// Rival companies: generation, quarterly AI, financials on the same economics as the player,
// escalation and retaliation, and the player's diplomatic options.
import * as B from './books';
import { CITIES, CITY, EVENT, INDUSTRIES, PERSONALITY, PERSONALITIES, RIVAL_CEOS, RIVAL_COLORS, RIVAL_NAMES, isCapital } from './content';
import { queueEvent, scaleS, scheduleEvent, SPECIALS } from './events';
import { dilute, founderStake } from './finance';
import { fxOf, inputIndex } from './macro';
import { localPrice, market, marketUnits } from './market';
import { addMod, hasFlag, news } from './mods';
import { DIFF, makeOffice } from './newgame';
import { companyHeadcount } from './people';
import type { ActionResult, EventCtx, GameState, IndustryId, Office, Rival, RivalOffice } from './types';
import { chance, clamp, money, pick, rand, randInt, randRange, shuffle, weighted } from './util';

const wageOf = (g: GameState, city: string, ind: IndustryId, role: 'ops' | 'sales') => INDUSTRIES[ind].wages[role] * 1000 * CITY[city].wage * g.macro.wageIdx * fxOf(g, city);
const alive = (g: GameState) => g.rivals.filter((r) => r.alive);
export const rivalById = (g: GameState, id: number | undefined) => g.rivals.find((r) => r.id === id);

/** Scale of a start-up operation in an industry, units a quarter (what the player starts with). */
export const startUnits = (ind: IndustryId) => (INDUSTRIES[ind].start.cap > 0 ? INDUSTRIES[ind].start.cap : INDUSTRIES[ind].start.ops * INDUSTRIES[ind].opsOut);

function openRivalOffice(g: GameState, r: Rival, city: string, ind: IndustryId, share: number): RivalOffice {
  const pers = PERSONALITY[r.personality];
  const D = marketUnits(g, city, ind);
  market(g, city, ind);
  const ro: RivalOffice = { city, ind, share, price: pers.price, sales: 0.02, cap: Math.max(startUnits(ind), share * D * 1.25), opened: g.turn - (share > 0 ? 10 : 0), war: 0 };
  r.offices.push(ro);
  return ro;
}

export function generateRivals(g: GameState, n: number): Rival[] {
  const d = DIFF[g.difficulty];
  const ind = g.company.primary;
  const pers = shuffle(g, PERSONALITIES).slice(0, n);
  const names = shuffle(g, RIVAL_NAMES);
  const ceos = shuffle(g, RIVAL_CEOS);
  // random keys are drawn once per item so the order does not depend on the sort algorithm (keeps seeds portable across browsers)
  const ranked = <T>(items: T[], key: (t: T) => number) => items.map((t) => [key(t) * rand(g), t] as [number, T]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const hqs = ranked(CITIES.filter((c) => c.id !== g.company.home), (c) => c.ind[ind] * Math.sqrt(c.pop));
  const taken: Record<string, number> = {};
  const rivals: Rival[] = [];
  pers.forEach((p, i) => {
    const def = INDUSTRIES[ind];
    const hq = hqs[i % hqs.length];
    const r: Rival = {
      id: i, name: names[i], ceo: ceos[i], personality: p.id, color: RIVAL_COLORS[i % RIVAL_COLORS.length], hq: hq.id, industries: [ind], offices: [], cash: 0, debt: 0,
      tech: { [ind]: clamp(def.startTech + 8 + (p.id === 'innovator' ? 12 : 0) + randRange(g, -4, 4) + (d.rivalSize - 1) * 6, 10, 90) },
      brand: 0, eff: p.eff * d.rivalEff, alive: true, isPublic: false, relation: randInt(g, -10, 10), hostility: p.aggression * d.aggression > 0.9 ? 2 : 1, pactUntil: -1,
      lastMove: -9, grievances: 0, rev: 0, profit: 0, revTTM: [], valuation: 0, distress: 0, known: false,
    };
    g.rivals.push(r); // so market lookups see it while we build
    const count = clamp(Math.round(2 * d.rivalSize + randRange(g, 0, 1.5) + (p.id === 'expander' ? 1 : 0)), 1, 8);
    const cands = ranked(CITIES.filter((c) => c.id !== hq.id), (c) => (c.region === hq.region ? 2 : 1) * c.ind[ind]);
    const cities = [hq.id, ...cands.slice(0, count - 1).map((c) => c.id)];
    if (i === 0 && !cities.includes(g.company.home)) cities[cities.length > 1 ? cities.length - 1 : 0] = g.company.home; // someone is always in your back yard
    for (const c of cities) {
      const room = 0.55 - (taken[c] ?? 0);
      if (room < 0.005) continue;
      // sized relative to what the player starts with, so rivals are established but within reach
      const units = startUnits(ind) * d.rivalSize * randRange(g, 1.0, 2.5) * (c === hq.id ? 1.8 : 1);
      const share = Math.min(room, 0.1, units / marketUnits(g, c, ind));
      taken[c] = (taken[c] ?? 0) + share;
      openRivalOffice(g, r, c, ind, share);
    }
    const annual = r.offices.reduce((s, ro) => s + ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind), 0) * 4;
    r.cash = annual * randRange(g, 0.3, 0.6);
    r.debt = annual * p.leverage * 0.5;
    r.brand = clamp(18 + 9 * r.offices.length ** 0.7 + randRange(g, 0, 8), 0, 90);
    r.rev = annual / 4;
    r.revTTM = [annual / 4];
    r.valuation = annual * def.revMult + r.cash - r.debt;
    rivals.push(r);
  });
  g.rivals = [];
  return rivals;
}

/** What the player can see of a rival. */
export function rivalKnown(g: GameState, r: Rival): boolean {
  return g.company.intel >= 1 || r.isPublic || r.offices.some((ro) => (g.discovered[ro.city] ?? 0) >= 1) || !r.alive;
}
export const officeVisible = (g: GameState, ro: RivalOffice) => (g.discovered[ro.city] ?? 0) >= 1 || g.company.intel >= 1;
export const officeDetail = (g: GameState, ro: RivalOffice) => (g.discovered[ro.city] ?? 0) >= 2 || g.company.intel >= 1;
const overlapOffice = (g: GameState, r: Rival): Office | undefined => {
  const c = g.company;
  for (const ro of r.offices) {
    const o = c.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (o) return o;
  }
  return undefined;
};
const ctxFor = (g: GameState, r: Rival, o?: Office): EventCtx => {
  const off = o ?? overlapOffice(g, r) ?? g.company.offices[0];
  return { rival: r.id, office: off.id, city: off.city, region: CITY[off.city].region, ind: off.ind };
};

/** Pre-market decisions: prices, sales effort, capacity, expansion, financing. */
export function rivalsDecide(g: GameState) {
  const d = DIFF[g.difficulty];
  const m = g.macro;
  for (const r of alive(g)) {
    const pers = PERSONALITY[r.personality];
    const costs = Math.max(1, r.rev - r.profit);
    const healthy = r.cash > costs * 1.5;
    for (const ro of r.offices) {
      const def = INDUSTRIES[ro.ind];
      const D = marketUnits(g, ro.city, ro.ind);
      const util = ro.cap > 0 ? (ro.share * D) / ro.cap : 1;
      // capacity follows demand, if the money is there
      if (util > 0.88 && healthy) {
        const add = ro.cap * randRange(g, 0.1, 0.25);
        const cost = add * (def.capPerUnit * 1000 * m.cpi + (wageOf(g, ro.city, ro.ind, 'ops') / def.opsOut) * 0.6);
        if (r.cash > cost + costs) {
          ro.cap += add;
          r.cash -= cost;
        }
      } else if (util < 0.5 && !isCapital(ro.ind)) ro.cap *= 0.92;
      // price: personality anchor, nudged by how full they are; wars override
      let target = pers.price + (util > 0.95 ? 0.05 : util < 0.6 ? -0.04 : 0);
      if (ro.war > 0) {
        target = pers.price * 0.8;
        ro.war--;
      }
      // sales and marketing budget is a share of the office's revenue, with a floor of a couple of reps
      const rev = Math.min(ro.share * D, ro.cap) * localPrice(g, ro.city, ro.ind) * ro.price;
      const repWage = wageOf(g, ro.city, ro.ind, 'sales');
      // where you are taking their customers, better-run rivals fight back with sales effort and price
      const mine = g.company.offices.find((o) => o.city === ro.city && o.ind === ro.ind);
      const threat = mine && mine.hist.length >= 2 ? clamp((mine.share - mine.hist[Math.max(0, mine.hist.length - 5)].share) / Math.max(0.005, ro.share), 0, 1) + (mine.share > ro.share ? 0.5 : 0) : 0;
      const defend = 1 + d.defend * threat;
      if (threat > 0.2 && d.defend > 0 && ro.war === 0) target -= 0.04 * d.defend * threat;
      ro.price = clamp(ro.price + 0.35 * (target - ro.price), 0.55, 1.6);
      const budget = Math.max(pers.sales * d.rivalSales * defend * rev, 2 * repWage) * (healthy ? 1 : 0.7) * (m.phase === 'recession' && r.personality === 'conservative' ? 0.8 : 1);
      const effort = budget / ((D / def.salesCover) * repWage);
      ro.sales = clamp(ro.sales + 0.5 * (effort - ro.sales), 0.001, 1.5);
    }
    // expansion
    const pExp = pers.expand * (m.phase === 'boom' ? 1.3 : m.phase === 'recession' ? 0.4 : 1) * (0.7 + 0.3 * d.rivalSize);
    if (healthy && r.offices.length < d.rivalMax && chance(g, pExp)) {
      const ind = r.industries[0];
      const def = INDUSTRIES[ind];
      const here = new Set(r.offices.map((o) => o.city));
      const hqReg = CITY[r.hq].region;
      const c = weighted(g, CITIES.filter((x) => !here.has(x.id)), (x) => x.ind[ind] * Math.sqrt(x.pop * x.income) * (x.region === hqReg ? 2 : 1) * (g.company.offices.some((o) => o.city === x.id) ? 1 + pers.aggression * d.aggression : 1));
      if (c) {
        const cap = startUnits(ind);
        const cost = cap * def.capPerUnit * 1000 * m.cpi + 150_000 * m.cpi;
        if (r.cash > cost + costs * 2) {
          r.cash -= cost;
          openRivalOffice(g, r, c.id, ind, 0);
          if ((g.discovered[c.id] ?? 0) >= 1) news(g, `${r.name} has opened in ${c.name}.`, 'rival');
          const mine = g.company.offices.find((o) => o.city === c.id && o.ind === ind);
          if (mine && c.id === g.company.home && EVENT.rival_enters) queueEvent(g, 'rival_enters', ctxFor(g, r, mine));
        }
      }
    }
    // financing
    const annual = Math.max(1, r.rev * 4);
    if (r.cash < costs * 0.5 && r.debt / annual < pers.leverage * 1.5 + 0.3 && m.phase !== 'recession') {
      const amt = annual * 0.15;
      r.debt += amt;
      r.cash += amt;
    } else if (r.cash > costs * 4 && r.debt > 0) {
      const pay = Math.min(r.debt, r.cash - costs * 3);
      r.debt -= pay;
      r.cash -= pay;
    }
    if (r.personality === 'disruptor' && r.cash < costs && m.sentiment > 0.85 && chance(g, 0.5)) r.cash += annual * 0.4; // another funding round
  }
}

function officeFinancials(g: GameState, r: Rival, ro: RivalOffice): { rev: number; cost: number } {
  const def = INDUSTRIES[ro.ind];
  const city = CITY[ro.city];
  const D = marketUnits(g, ro.city, ro.ind);
  const sold = Math.min(ro.share * D, ro.cap);
  const rev = sold * localPrice(g, ro.city, ro.ind) * ro.price;
  const loc = g.macro.cpi * fxOf(g, ro.city);
  const variable = sold * 1000 * def.varCost * inputIndex(g, ro.ind) * fxOf(g, ro.city) * city.wage ** def.local;
  const staff = ro.cap / def.opsOut;
  const labour = staff * wageOf(g, ro.city, ro.ind, 'ops');
  const sm = ro.sales * (D / def.salesCover) * wageOf(g, ro.city, ro.ind, 'sales');
  const fixed = ro.cap * def.fixedPerCap * 1000 * (0.4 + 0.6 * city.rent) * loc + staff * 1.3 * def.seatRent * 1000 * city.rent * loc;
  const upkeep = (ro.cap * def.capPerUnit * 1000 * g.macro.cpi) / def.deprQ;
  return { rev, cost: (variable + labour + sm + fixed + upkeep) * r.eff };
}

function absorb(g: GameState, buyer: Rival, target: Rival) {
  for (const ro of target.offices) {
    const mine = buyer.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (mine) {
      mine.share = clamp(mine.share + ro.share, 0, 0.9);
      mine.cap += ro.cap;
    } else buyer.offices.push(ro);
  }
  for (const k of target.industries) if (!buyer.industries.includes(k)) buyer.industries.push(k);
  for (const k of target.industries) buyer.tech[k] = Math.max(buyer.tech[k] ?? 0, target.tech[k] ?? 0);
  target.offices = [];
  target.alive = false;
  target.fate = `Acquired by ${buyer.name}`;
}

function liquidate(g: GameState, r: Rival) {
  r.alive = false;
  r.fate = 'Bankrupt';
  for (const ro of r.offices) market(g, ro.city, ro.ind).f *= 0.97;
  r.offices = [];
}

/** Post-market: revenue, costs, cash, technology, distress, consolidation, and moves against the player. */
export function rivalsFinancials(g: GameState) {
  const d = DIFF[g.difficulty];
  const c = g.company;
  const m = g.macro;
  let acted = g.queue.some((e) => EVENT[e.id]?.cat === 'rival');
  for (const r of alive(g)) {
    const pers = PERSONALITY[r.personality];
    let rev = 0, cost = 0;
    for (const ro of r.offices) {
      const f = officeFinancials(g, r, ro);
      rev += f.rev;
      cost += f.cost;
    }
    const rd = pers.rd * DIFF[g.difficulty].rivalRd * rev;
    const pre = rev - cost - 0.06 * rev - rd - (r.debt * (m.rate + 3.5 + m.spread)) / 400;
    r.profit = pre > 0 ? pre * 0.75 : pre;
    r.rev = rev;
    r.cash += r.profit;
    r.revTTM.push(rev);
    if (r.revTTM.length > 8) r.revTTM.shift();
    for (const k of r.industries) {
      const def = INDUSTRIES[k];
      const rp = rd / r.industries.length / (def.rdCost * 1000 * m.cpi);
      const target = def.startTech - 6 + 27 * Math.min(1, def.techGain + 0.1) * Math.log10(1 + rp) + (r.personality === 'innovator' ? 6 : 0);
      const t = r.tech[k] ?? def.startTech;
      r.tech[k] = clamp(t < target ? t + 0.12 * Math.max(def.techGain, 0.5) * (target - t) : t - Math.min(def.techDecay, 0.15 * (t - target)), 5, 100);
    }
    const avgShare = r.offices.length ? r.offices.reduce((s, o) => s + o.share, 0) / r.offices.length : 0;
    r.brand += 0.05 * (clamp(18 + 9 * r.offices.length ** 0.7 + 120 * avgShare, 0, 90) - r.brand);
    const last4 = r.revTTM.slice(-4).reduce((a, b) => a + b, 0) * (4 / Math.min(4, r.revTTM.length));
    const prev4 = r.revTTM.length >= 8 ? r.revTTM.slice(0, 4).reduce((a, b) => a + b, 0) : last4 / 1.1;
    const growth = clamp(last4 / Math.max(1, prev4) - 1, -0.5, 1.5);
    const margin = rev > 0 ? r.profit / rev : -0.5;
    r.valuation = Math.max(0, last4 * INDUSTRIES[r.industries[0]].revMult * clamp(1 + 1.6 * (growth - 0.1), 0.4, 3) * clamp(1 + 2 * (margin - INDUSTRIES[r.industries[0]].targetMargin * 0.5), 0.35, 1.8) * m.sentiment + r.cash - r.debt);
    r.isPublic = r.isPublic || r.valuation > 1e9 * m.cpi;
    r.known = rivalKnown(g, r);
    r.hostility = clamp(r.hostility - 0.12, 0, 10);
    r.relation += (0 - r.relation) * 0.03;
    if (r.pact && r.pactUntil < g.turn) {
      r.pact = undefined;
      if (r.known) news(g, `Your agreement with ${r.name} has lapsed.`, 'rival');
    }

    // distress and bankruptcy
    if (r.cash < 0) {
      r.distress++;
      if (r.distress === 2 && r.known && EVENT.rival_distress && !acted) acted = queueEvent(g, 'rival_distress', ctxFor(g, r));
      if (r.distress >= 4) {
        const buyer = alive(g).filter((x) => x !== r && x.cash > r.rev * 2).sort((a, b) => PERSONALITY[b.personality].acquisitive - PERSONALITY[a.personality].acquisitive)[0];
        if (buyer && chance(g, 0.5 + PERSONALITY[buyer.personality].acquisitive * 0.4)) {
          buyer.cash -= r.rev * 1.5;
          absorb(g, buyer, r);
          news(g, `${buyer.name} has bought the remains of ${r.name}.`, 'rival');
        } else {
          liquidate(g, r);
          news(g, `${r.name} has gone bankrupt. Its customers are up for grabs.`, 'rival');
        }
        continue;
      }
    } else r.distress = 0;

    // consolidation: acquirers buy weaker rivals
    if (pers.acquisitive > 0.4 && g.turn > 8 && chance(g, 0.025 * pers.acquisitive * d.aggression)) {
      const prey = alive(g).filter((x) => x !== r && x.valuation < r.valuation * 0.5 && x.valuation < (r.cash + r.rev * 4) * 1.2).sort((a, b) => a.valuation - b.valuation)[0];
      if (prey) {
        const price = prey.valuation * 1.3;
        r.cash -= price * 0.35;
        r.debt += price * 0.65 + prey.debt;
        absorb(g, r, prey);
        news(g, `${r.name} has acquired ${prey.name} for ${money(price)}.`, 'rival');
      }
    }

    if (r.pact || acted || g.turn - r.lastMove < 3 || g.turn < 4) continue;
    const ov = overlapOffice(g, r);
    const threat = r.offices.reduce((s, ro) => s + (c.offices.find((o) => o.city === ro.city && o.ind === ro.ind)?.share ?? 0), 0);
    const aggr = pers.aggression * d.aggression;

    // retaliation for what the player did to them
    if (r.grievances > 0 && chance(g, 0.35 + pers.grudge * 0.5)) {
      r.grievances = 0;
      r.hostility = clamp(r.hostility + 1.5, 0, 10);
      const home = c.offices.find((o) => o.city === c.home) ?? c.offices[0];
      let ro = r.offices.find((x) => x.city === home.city && x.ind === home.ind);
      if (!ro && r.cash > 0) ro = openRivalOffice(g, r, home.city, home.ind, 0);
      if (ro) ro.war = 5;
      r.lastMove = g.turn;
      if (EVENT.rival_retaliation) acted = queueEvent(g, 'rival_retaliation', ctxFor(g, r, home));
      continue;
    }
    // hostile moves
    const pHostile = clamp((0.03 + 0.25 * aggr * (0.25 + threat * 4)) * (1 + r.hostility / 4), 0, 0.45);
    if (chance(g, pHostile)) {
      const weak = c.valuation < r.valuation * 0.6 || c.negCashTurns > 0;
      const opts: [string, number][] = [
        ['rival_price_war', ov ? ({ costcutter: 3, disruptor: 2.5, expander: 2, predator: 1, innovator: 0.3, conservative: 0.3 }[r.personality]) : 0],
        ['rival_poach', { innovator: 2.5, disruptor: 2, expander: 1, predator: 1, costcutter: 0.5, conservative: 0.4 }[r.personality]],
        ['rival_lawsuit', { innovator: 1.5, predator: 1.5, conservative: 1, costcutter: 0.5, expander: 0.5, disruptor: 0.3 }[r.personality]],
        ['rival_lobby', { conservative: 2.5, predator: 1, costcutter: 0.5, innovator: 0.4, expander: 0.3, disruptor: 0.2 }[r.personality]],
        ['rival_smear', 0.6 * aggr],
        ['rival_supplier', ov && INDUSTRIES[c.primary].varCost > 0.2 ? 0.8 : 0],
        ['rival_copy', (c.tech[c.primary] ?? 0) > (r.tech[c.primary] ?? 0) + 6 ? 1.5 : 0],
        ['rival_talent_raid', c.people.length ? 0.8 : 0],
        ['rival_trash_talk', 0.5],
        ['rival_takeover', weak && !c.cap.isPublic && pers.acquisitive > 0.1 ? 4 * pers.acquisitive : 0],
        ['rival_hostile_bid', weak && c.cap.isPublic && founderStake(c) < 0.5 ? 5 * pers.acquisitive : 0],
      ];
      const choice = weighted(g, opts.filter(([id]) => EVENT[id] && g.turn - (g.fired[id] ?? -99) >= 4), ([, w]) => w);
      if (choice) {
        const id = choice[0];
        if (id === 'rival_price_war' && ov) {
          const ro = r.offices.find((x) => x.city === ov.city && x.ind === ov.ind)!;
          ro.war = randInt(g, 4, 6);
        }
        const ctx = ctxFor(g, r, id === 'rival_price_war' ? ov : undefined);
        if (id === 'rival_talent_raid') {
          const p = pick(g, c.people);
          ctx.person = p.id;
        }
        if (id === 'rival_takeover' || id === 'rival_hostile_bid') ctx.amount = c.valuation * (id === 'rival_takeover' ? 1.15 : 1.3);
        acted = queueEvent(g, id, ctx);
        if (acted) {
          r.lastMove = g.turn;
          r.hostility = clamp(r.hostility + 0.5, 0, 10);
        }
        continue;
      }
    }
    // friendly approaches
    const pFriendly = 0.02 + Math.max(0, r.relation) / 400 + (r.hostility > 3 && r.profit < 0 ? 0.08 : 0);
    if (chance(g, pFriendly)) {
      const opts: [string, number][] = [
        ['rival_truce', r.hostility >= 2.5 ? 3 : 0],
        ['rival_partnership', r.relation > 5 ? 2 : 0.4],
        ['rival_cartel', ov && r.personality !== 'innovator' ? 0.8 : 0],
        ['rival_merger', r.relation > 30 && Math.abs(Math.log(Math.max(1, r.valuation) / Math.max(1, c.valuation))) < 0.7 ? 1 : 0],
      ];
      const choice = weighted(g, opts.filter(([id]) => EVENT[id] && g.turn - (g.fired[id] ?? -99) >= 8), ([, w]) => w);
      if (choice) {
        acted = queueEvent(g, choice[0], ctxFor(g, r));
        if (acted) r.lastMove = g.turn;
      }
    }
  }
}

// ───────────────────────── player diplomacy ─────────────────────────

const R = (g: GameState, id: number) => {
  const r = rivalById(g, id);
  return r && r.alive ? r : undefined;
};
const fail = (msg: string): ActionResult => ({ ok: false, msg });
const cool = (g: GameState, r: Rival, key: string, quarters: number): boolean => {
  const k = `dip:${key}:${r.id}`;
  if (g.turn - (g.counters[k] ?? -99) < quarters) return false;
  g.counters[k] = g.turn;
  return true;
};

export function improveRelations(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!cool(g, r, 'rel', 2)) return fail('You have only just sat down with them. Give it a couple of quarters.');
  const cost = 0.01 * scaleS(g);
  B.expense(g.company, 'ga', cost, 'cash');
  r.relation = clamp(r.relation + 8, -100, 100);
  r.hostility = clamp(r.hostility - 0.5, 0, 10);
  return { ok: true, msg: `A long dinner with ${r.ceo}. Relations are a little warmer.` };
}

export function truceOdds(g: GameState, r: Rival): number {
  const pers = PERSONALITY[r.personality];
  return clamp(0.5 - pers.aggression * 0.3 + (r.profit < 0 ? 0.25 : 0) + r.relation / 200 - r.grievances * 0.1, 0.05, 0.95);
}
export function startPact(g: GameState, r: Rival, pact: 'truce' | 'alliance', quarters: number) {
  r.pact = pact;
  r.pactUntil = g.turn + quarters;
  r.hostility = clamp(r.hostility - 3, 0, 10);
  r.grievances = 0;
  for (const ro of r.offices) ro.war = 0;
}
export function proposeTruce(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('You already have an agreement with them.');
  if (!cool(g, r, 'truce', 4)) return fail('They turned you down recently. Ask again in a year.');
  if (chance(g, truceOdds(g, r))) {
    startPact(g, r, 'truce', 8);
    news(g, `${g.company.name} and ${r.name} have agreed to stop fighting, for now.`, 'rival');
    return { ok: true, msg: `${r.ceo} agrees: no hostile moves from either side for two years.` };
  }
  r.relation = clamp(r.relation - 5, -100, 100);
  return { ok: false, msg: `${r.ceo} is not interested. "We are winning," they say.` };
}
export function proposeAlliance(g: GameState, id: number): ActionResult {
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact === 'alliance') return fail('You are already allies.');
  if (r.relation < 20) return fail('They do not trust you enough yet. Improve relations first.');
  if (!cool(g, r, 'ally', 4)) return fail('Asked too recently.');
  if (chance(g, clamp(0.3 + r.relation / 100 - PERSONALITY[r.personality].aggression * 0.2, 0.1, 0.9))) {
    startPact(g, r, 'alliance', 12);
    addMod(g, { kind: 'demand', pct: 3, quarters: 12, src: 'alliance' });
    for (const o of alive(g)) if (o !== r) o.hostility = clamp(o.hostility + 0.5, 0, 10);
    news(g, `${g.company.name} and ${r.name} have announced a strategic alliance.`, 'rival');
    return { ok: true, msg: `Alliance signed for three years: shared intelligence and joint marketing. Other rivals are watching.` };
  }
  return { ok: false, msg: `${r.ceo} would rather keep things informal.` };
}
export function poachTalent(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('That would break your agreement.');
  if (!cool(g, r, 'poach', 2)) return fail('Their people are on their guard. Wait a couple of quarters.');
  const cost = 0.03 * scaleS(g);
  if (cost > c.books.cash) return fail('Not enough cash for signing bonuses.');
  B.expense(c, 'ga', cost, 'cash');
  r.grievances++;
  r.hostility = clamp(r.hostility + 1, 0, 10);
  r.relation = clamp(r.relation - 15, -100, 100);
  if (!chance(g, 0.6)) return { ok: false, msg: `The approach leaked. Nobody came across, and ${r.name} is furious.` };
  const o = overlapOffice(g, r) ?? c.offices[0];
  const n = randInt(g, 2, 4);
  const s = o.staff.rnd;
  s.skill = (s.skill * s.n + 78 * n) / (s.n + n);
  s.n += n;
  s.fresh += n;
  for (const k of r.industries) r.tech[k] = clamp((r.tech[k] ?? 30) - 1.5, 5, 100);
  return { ok: true, msg: `${n} of their best joined you in ${CITY[o.city].name}. ${r.name} will not forget it.` };
}
export function sueRival(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (r.pact) return fail('That would break your agreement.');
  if (!cool(g, r, 'sue', 8)) return fail('You already have a case against them.');
  const cost = 0.04 * scaleS(g);
  if (cost > c.books.cash) return fail('Lawyers want paying up front.');
  B.expense(c, 'other', cost, 'cash');
  r.grievances++;
  r.hostility = clamp(r.hostility + 2, 0, 10);
  scheduleEvent(g, 'lawsuit_verdict', 3, ctxFor(g, r));
  return { ok: true, msg: `Suit filed against ${r.name}. Expect a verdict in about three quarters.` };
}
export function lobbyAgainst(g: GameState, id: number): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!hasFlag(g, 'lobby')) return fail('You need a government affairs office (Corporate → Invest) to lobby.');
  if (!cool(g, r, 'lobby', 4)) return fail('Regulators have heard enough from you this year.');
  const cost = 0.03 * scaleS(g);
  B.expense(c, 'ga', cost, 'cash');
  r.hostility = clamp(r.hostility + 1, 0, 10);
  r.relation = clamp(r.relation - 10, -100, 100);
  if (chance(g, 0.5)) {
    r.cash -= r.rev * 0.2;
    r.eff *= 1.02;
    return { ok: true, msg: `New rules land squarely on ${r.name}: compliance costs and a fine.` };
  }
  c.reputation = clamp(c.reputation - 2, 0, 100);
  return { ok: false, msg: 'The regulator saw through it. Your reputation took a small knock.' };
}

export function bidPrice(g: GameState, r: Rival, hostile: boolean): number {
  return Math.max(r.valuation, r.rev * 2) * (hostile ? 1.5 : 1.25) + r.debt * 0.5;
}
export function bidOdds(g: GameState, r: Rival, hostile: boolean): number {
  const pers = PERSONALITY[r.personality];
  if (hostile) return r.isPublic ? 0.6 : 0.25 + (r.distress > 0 ? 0.4 : 0);
  return clamp(0.15 + r.relation / 150 + (r.distress > 0 ? 0.5 : 0) + (r.profit < 0 ? 0.15 : 0) - (pers.id === 'conservative' ? 0.15 : 0) - (pers.id === 'predator' ? 0.2 : 0), 0.02, 0.95);
}
/** Take a rival's offices into the player's company. */
export function absorbIntoPlayer(g: GameState, r: Rival, offices: RivalOffice[]): number {
  const c = g.company;
  let fair = 0;
  for (const ro of offices) {
    const def = INDUSTRIES[ro.ind];
    if (!c.divisions.includes(ro.ind)) {
      c.divisions.push(ro.ind);
      c.tech[ro.ind] = r.tech[ro.ind] ?? def.startTech;
    }
    const staff = { ops: Math.max(1, Math.round((ro.cap / def.opsOut) * 0.9)), sales: Math.max(0, Math.round(ro.sales * (marketUnits(g, ro.city, ro.ind) / def.salesCover))), rnd: 0, admin: 1 };
    staff.admin = Math.max(1, Math.round((staff.ops + staff.sales) / 14));
    const ppe = isCapital(ro.ind) ? ro.cap * def.capPerUnit * 1000 * 0.6 : 0;
    fair += ppe;
    let o = c.offices.find((x) => x.city === ro.city && x.ind === ro.ind);
    if (o) {
      for (const k of ['ops', 'sales', 'admin'] as const) o.staff[k].n += staff[k];
      o.share = clamp(o.share + ro.share, 0, 0.92);
      if (isCapital(ro.ind)) o.cap += ro.cap;
      o.ppe += ppe;
    } else {
      o = makeOffice(g, ro.city, ro.ind, staff, isCapital(ro.ind) ? ro.cap : 0);
      o.opened = ro.opened;
      o.share = ro.share;
      o.lastDemand = ro.share * marketUnits(g, ro.city, ro.ind);
      o.ppe = ppe;
      o.morale = 55;
      c.offices.push(o);
    }
    o.integration = 4;
    g.discovered[ro.city] = 2;
  }
  r.offices = r.offices.filter((x) => !offices.includes(x));
  return fair;
}
export function bidForRival(g: GameState, id: number, hostile: boolean): ActionResult {
  const c = g.company;
  const r = R(g, id);
  if (!r) return fail('No such rival.');
  if (!cool(g, r, 'bid', 4)) return fail('They rejected an approach recently. Wait a year.');
  const price = bidPrice(g, r, hostile);
  const cashPart = c.cap.isPublic ? price * 0.5 : price;
  if (cashPart > c.books.cash) return fail(`You need ${money(cashPart)} in cash${c.cap.isPublic ? ' (the other half is paid in shares)' : ''}. You have ${money(c.books.cash)}.`);
  B.expense(c, 'other', price * 0.01, 'cash'); // advisers
  if (!chance(g, bidOdds(g, r, hostile))) {
    r.hostility = clamp(r.hostility + (hostile ? 3 : 0.5), 0, 10);
    r.relation = clamp(r.relation - (hostile ? 30 : 5), -100, 100);
    if (hostile) r.grievances++;
    return { ok: false, msg: hostile ? `${r.name}'s board fought you off. You have made an enemy.` : `${r.ceo} declined. "Not for sale."` };
  }
  const before = companyHeadcount(c);
  const offices = r.offices.slice();
  const fair = absorbIntoPlayer(g, r, offices);
  // property is added inside absorbIntoPlayer; book the purchase against it
  c.books.ppe += fair;
  c.books.goodwill += cashPart - fair + (price - cashPart);
  c.books.cash -= cashPart;
  c.cfTags.acq -= cashPart;
  if (price > cashPart) {
    const n = (price - cashPart) / Math.max(0.01, c.cap.price);
    c.cap.shares += n;
    c.cap.holders.push({ name: `${r.name} shareholders`, shares: n, round: 'Acquisition', price: c.cap.price });
    c.books.paidIn += price - cashPart;
  }
  if (r.debt > 0) {
    c.books.debt += r.debt * 0.5;
    c.books.goodwill += r.debt * 0.5;
    c.loans.push({ id: 'ln' + ++g.uid, kind: 'term', name: `${r.name} assumed debt`, principal: r.debt * 0.5, limit: 0, spread: 3.5, fixedRate: 0, floating: true, start: g.turn, maturity: g.turn + 16, amort: (r.debt * 0.5) / 16, breaches: 0, waivedUntil: g.turn + 4 });
  }
  for (const k of r.industries) c.tech[k] = Math.max(c.tech[k] ?? 0, (r.tech[k] ?? 0) - 3);
  const added = companyHeadcount(c) - before;
  c.culture = clamp(c.culture - (3 + (added / Math.max(1, before + added)) * 22), 0, 100);
  r.alive = false;
  r.fate = `Acquired by ${c.name}`;
  g.counters.acquisitions = (g.counters.acquisitions ?? 0) + 1;
  for (const o of alive(g)) o.hostility = clamp(o.hostility + 1, 0, 10);
  news(g, `${c.name} has acquired ${r.name} for ${money(price)}.`, 'good');
  return { ok: true, msg: `${r.name} is yours: ${offices.length} offices and ${added} people to integrate. Your culture will feel it.` };
}

// ───────────────────────── specials used by rival events ─────────────────────────

Object.assign(SPECIALS, {
  truce: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) startPact(g, r, 'truce', 8);
    return r ? `Truce with ${r.name} for two years` : null;
  },
  alliance: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) startPact(g, r, 'alliance', 12);
    return r ? `Alliance with ${r.name} for three years` : null;
  },
  endPact: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) r.pact = undefined;
    return r ? `Agreement with ${r.name} ended` : null;
  },
  endWar: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) for (const ro of r.offices) ro.war = 0;
    return r ? `${r.name} ends the price war` : null;
  },
  grievance: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) r.grievances++;
    return null;
  },
  priceDownRegion: (g: GameState, ctx: EventCtx, arg: number) => {
    const reg = ctx.region ?? CITY[g.company.home].region;
    for (const k of g.company.divisions) g.company.policy[reg].price[k] = clamp((g.company.policy[reg].price[k] ?? 1) * (1 - arg / 100), 0.5, 1.8);
    return `Prices cut ${arg}% in the region`;
  },
  rivalExit: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (!r || r.offices.length < 2) return null;
    r.offices = r.offices.filter((ro) => ro.city !== ctx.city);
    return `${r.name} withdraws from ${CITY[ctx.city ?? ''].name}`;
  },
  cartel: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    if (r) for (const ro of r.offices) ro.price = clamp(ro.price * 1.1, 0.55, 1.6);
    return r ? `${r.name} raises its prices too` : null;
  },
  buyRivalOffice: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const c = g.company;
    const ro = r?.offices.find((x) => x.city === ctx.city) ?? r?.offices[0];
    if (!r || !ro) return null;
    const price = Math.min(c.books.cash * 0.8, ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind) * 2.5);
    const fair = absorbIntoPlayer(g, r, [ro]);
    c.books.ppe += fair;
    c.books.goodwill += Math.max(0, price - fair);
    c.books.cash -= Math.max(price, fair);
    c.cfTags.acq -= Math.max(price, fair);
    r.cash += price;
    return `Bought ${r.name}'s ${CITY[ro.city].name} operation for ${money(Math.max(price, fair))}`;
  },
  mergeRival: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const c = g.company;
    if (!r) return null;
    const pct = clamp((r.valuation / Math.max(1, r.valuation + c.valuation)) * 100, 5, 60);
    const fair = absorbIntoPlayer(g, r, r.offices.slice());
    const value = r.valuation;
    c.books.ppe += fair;
    c.books.goodwill += Math.max(0, value - fair);
    c.books.paidIn += Math.max(value, fair);
    dilute(g, (pct / (100 - pct)) * 100, `${r.name} shareholders`);
    c.culture = clamp(c.culture - 10, 0, 100);
    r.alive = false;
    r.fate = `Merged with ${c.name}`;
    return `Merged with ${r.name}; their shareholders now own ${pct.toFixed(0)}%`;
  },
  sellCompany: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    const price = ctx.amount ?? g.company.valuation;
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'sold', title: 'Sold', turn: g.turn, text: `You sold ${g.company.name} to ${r?.name ?? 'a competitor'} for ${money(price)}. Your share came to ${money(price * founderStake(g.company))}. A fine outcome for a founder — but the company is no longer yours to run.` };
    return 'The company is sold';
  },
  takeover: (g: GameState, ctx: EventCtx) => {
    const r = rivalById(g, ctx.rival);
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'takeover', title: 'Taken over', turn: g.turn, text: `${r?.name ?? 'A rival'} won control of ${g.company.name}. The new owners thanked you for your service at the first board meeting.` };
    return 'You have lost control of the company';
  },
  oust: (g: GameState) => {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'ousted', title: 'Removed by the board', turn: g.turn, text: `The investors who own most of ${g.company.name} have replaced you as chief executive. You keep your shares and lose your office.` };
    return 'The board has removed you';
  },
  boardCuts: (g: GameState) => {
    for (const o of g.company.offices) {
      for (const k of ['ops', 'sales', 'rnd', 'admin'] as const) o.staff[k].n = Math.max(k === 'admin' || k === 'ops' ? 1 : 0, Math.round(o.staff[k].n * 0.9));
      o.morale = clamp(o.morale - 10, 0, 100);
      o.scar += 12;
    }
    g.company.culture = clamp(g.company.culture - 4, 0, 100);
    return 'One in ten jobs cut across the company';
  },
});
