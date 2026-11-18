// The field changes (review wave 3): funded startups and late giants enter, every industry you launch into
// has incumbents, and rivals have lives of their own — new chief executives, listings, spin-offs, scandals.
import { CITIES, CITY, INDUSTRIES, PERSONALITY, PERSONALITIES, RIVAL_CEOS, RIVAL_COLORS, RIVAL_NAMES } from './content';
import { DIFF } from './difficulty';
import { feud } from './feud';
import { rivalEV } from './finance';
import { localPrice, marketUnits } from './market';
import { news } from './mods';
import { openRivalOffice, rivalKnown, rivalValuation, seedRivalAccounts, sizeGridRival, startUnits } from './rivals';
import type { GameState, IndustryId, Personality, Rival, RivalOffice } from './types';
import { chance, clamp, money, pick, rand, randInt, randRange, weighted } from './util';

const alive = (g: GameState) => g.rivals.filter((r) => r.alive);
const CLASSIC: Personality[] = ['expander', 'costcutter', 'innovator', 'predator', 'conservative', 'disruptor'];

function freshName(g: GameState): string {
  const used = new Set(g.rivals.map((r) => r.name));
  const free = RIVAL_NAMES.filter((n) => !used.has(n));
  if (free.length) return pick(g, free);
  const base = pick(g, RIVAL_NAMES);
  for (let k = 2; ; k++) if (!used.has(`${base} ${k}`)) return `${base} ${k}`;
}
function freshCeo(g: GameState): string {
  const used = new Set(alive(g).map((r) => r.ceo));
  const free = RIVAL_CEOS.filter((n) => !used.has(n));
  return pick(g, free.length ? free : RIVAL_CEOS);
}

/** A rival company with no offices yet. */
function blank(g: GameState, ind: IndustryId, p: Personality, hq: string): Rival {
  const d = DIFF[g.difficulty];
  const def = INDUSTRIES[ind];
  const id = Math.max(-1, ...g.rivals.map((r) => r.id)) + 1;
  const r: Rival = {
    id, name: freshName(g), ceo: freshCeo(g), personality: p, color: RIVAL_COLORS[id % RIVAL_COLORS.length], hq, industries: [ind], offices: [], cash: 0, debt: 0,
    tech: { [ind]: clamp(def.startTech + 6 + (p === 'innovator' || p === 'bigtech' ? 10 : 0) + randRange(g, -4, 4) + (d.rivalSize - 1) * 6, 10, 90) },
    brand: 0, eff: PERSONALITY[p].eff * d.rivalEff, alive: true, isPublic: false, relation: randInt(g, -10, 10), hostility: 1, pactUntil: -1,
    lastMove: g.turn, grievances: 0, rev: 0, profit: 0, ebitda: 0, revTTM: [], ebitdaTTM: [], ar: 0, inv: 0, wc: 0, nolBy: {}, spread: 3.5, rating: 'BB', raised: 0, lastRaise: -99,
    valuation: 0, distress: 0, known: false, since: g.turn,
  };
  g.rivals.push(r);
  return r;
}

function finish(g: GameState, r: Rival) {
  seedRivalAccounts(g, r);
  r.valuation = rivalValuation(g, r).equity;
  r.known = rivalKnown(g, r);
  g.counters[`rivalStart${r.id}`] = r.valuation / g.macro.cpi; // its growth is judged from the day it arrived
  g.counters[`rivalStartEV${r.id}`] = rivalEV(r) / g.macro.cpi;
}

/**
 * A new rival in an industry. `established` gives it the footprint of an incumbent (several cities, a few
 * years of customers); otherwise it is a funded newcomer with one or two offices. A Big Tech entrant opens
 * where the player earns most.
 */
export function spawnRival(g: GameState, ind: IndustryId, p: Personality, established: boolean): Rival {
  const d = DIFF[g.difficulty];
  const def = INDUSTRIES[ind];
  const pers = PERSONALITY[p];
  const c = g.company;
  const hqs = CITIES.filter((x) => x.id !== c.home && x.ind[ind] >= 0.8);
  const hq = weighted(g, hqs, (x) => x.ind[ind] * Math.sqrt(x.pop))?.id ?? hqs[0].id;
  const r = blank(g, ind, p, hq);
  const best = c.offices.filter((o) => o.ind === ind).sort((a, b) => (b.last?.revenue ?? 0) - (a.last?.revenue ?? 0))[0];
  const n = established ? randInt(g, 2, 4) : randInt(g, 1, 2);
  const cities = [hq, ...CITIES.filter((x) => x.id !== hq && x.ind[ind] >= 0.8).map((x) => [x, x.ind[ind] * (x.region === CITY[hq].region ? 2 : 1) * rand(g)] as const)
    .sort((a, b) => b[1] - a[1]).slice(0, n - 1).map(([x]) => x.id)];
  if (pers.targetsBest && best && !cities.includes(best.city)) cities[cities.length - 1] = best.city;
  for (const city of cities) {
    const taken = g.rivals.reduce((s, x) => s + (x.offices.find((o) => o.city === city && o.ind === ind)?.share ?? 0), 0);
    const room = 0.55 - taken;
    if (room < 0.005) continue;
    const units = startUnits(ind) * d.rivalSize * randRange(g, 1, 2.2) * (city === hq ? 1.6 : 1) * (def.grid ? 0.45 : 1) * (established ? 1 : 0.6);
    const ro = openRivalOffice(g, r, city, ind, Math.min(room, 0.08, units / marketUnits(g, city, ind)));
    if (!established) ro.opened = g.turn; // a newcomer ramps up like any new office
  }
  sizeGridRival(g, r, ind, established ? 1 : 0.6);
  const annual = r.offices.reduce((s, ro) => s + ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind), 0) * 4;
  const cpi = g.macro.cpi;
  r.cash = p === 'bigtech' ? 60e6 * cpi * d.rivalSize : established ? annual * randRange(g, 0.3, 0.6) : annual * 1.5 + 4e6 * cpi * d.rivalSize; // a newcomer arrives with its funding round
  r.debt = annual * pers.leverage * 0.5;
  r.brand = p === 'bigtech' ? 55 : pers.community ? 45 : established ? clamp(18 + 9 * r.offices.length ** 0.7 + randRange(g, 0, 8), 0, 90) : 12;
  r.isPublic = p === 'bigtech';
  if (!established) r.raised = r.cash;
  finish(g, r);
  return r;
}

/** Launching a division means meeting its incumbents: two or three named rivals per new industry. */
export function rivalsForDivisions(g: GameState) {
  const c = g.company;
  for (const ind of c.divisions) {
    if (ind === c.primary || g.counters[`divRivals:${ind}`] !== undefined) continue;
    g.counters[`divRivals:${ind}`] = g.turn;
    const there = alive(g).filter((r) => r.offices.some((o) => o.ind === ind)).length;
    const need = clamp(2 + (chance(g, 0.5) ? 1 : 0) - there, 0, 3);
    const pool = PERSONALITIES.filter((p) => !p.late).map((p) => p.id);
    const made: Rival[] = [];
    for (let i = 0; i < need; i++) made.push(spawnRival(g, ind, pick(g, pool), true));
    for (const r of made) r.known = true;
    if (made.length) news(g, `${INDUSTRIES[ind].name} has its incumbents: ${made.map((r) => `${r.name} (${PERSONALITY[r.personality].label.toLowerCase()})`).join(', ')}.`, 'rival');
  }
}

/** Entrants per quarter on this difficulty: DIFF.entrants is per decade; booms bring more, recessions fewer. */
export function entrantChance(g: GameState): number {
  const cycle = { boom: 1.6, expansion: 1.1, recovery: 1, slowdown: 0.6, recession: 0.3 }[g.macro.phase] ?? 1;
  return (DIFF[g.difficulty].entrants / 40) * cycle;
}

/** Now and then a funded startup enters — and late in the game, perhaps a giant — so the field never empties. */
export function maybeEntrant(g: GameState): Rival | undefined {
  const d = DIFF[g.difficulty];
  if (g.turn < 8 || alive(g).length >= d.rivals + 3 || !chance(g, entrantChance(g))) return undefined;
  const c = g.company;
  const ind = weighted(g, c.divisions, (k) => (k === c.primary ? 2 : 1)) ?? c.primary;
  const giant = g.turn >= 24 && !g.rivals.some((r) => r.personality === 'bigtech') && chance(g, 0.3);
  const p: Personality = giant ? 'bigtech' : weighted(g, ['disruptor', 'disruptor', 'disruptor', 'coop', 'expander'] as Personality[], () => 1)!;
  const r = spawnRival(g, ind, p, false);
  r.known = true;
  const where = r.offices.map((o) => CITY[o.city].name).join(' and ');
  const mine = r.offices.find((o) => c.offices.some((x) => x.city === o.city && x.ind === o.ind));
  news(g, giant
    ? `${r.name}, a technology giant, has entered ${INDUSTRIES[ind].name} with ${money(r.cash)} to spend — starting in ${where}.${mine ? ` That is your market in ${CITY[mine.city].name}.` : ''}`
    : `A new rival: ${r.name}, ${PERSONALITY[p].label.toLowerCase()}, has entered ${INDUSTRIES[ind].name} in ${where}.`, 'rival');
  return r;
}

// ── rival life events: each is a news line, and sometimes an opening for you

const SCANDALS = ['its accounts are under investigation', 'a product it sold turns out to be unsafe', 'its chief executive was caught misleading investors', 'customer data has leaked', 'a whistleblower describes years of overbilling'];

function spinOff(g: GameState, r: Rival): Rival | undefined {
  // an industry it diversified into, or the offices in one region away from home
  let offices: RivalOffice[] = [];
  let what = '';
  if (r.industries.length > 1) {
    const ind = r.industries[r.industries.length - 1];
    offices = r.offices.filter((o) => o.ind === ind);
    what = INDUSTRIES[ind].name;
  } else {
    const regions = [...new Set(r.offices.map((o) => CITY[o.city].region))].filter((x) => x !== CITY[r.hq].region);
    const reg = regions.find((x) => r.offices.filter((o) => CITY[o.city].region === x).length >= 2);
    if (reg) {
      offices = r.offices.filter((o) => CITY[o.city].region === reg);
      what = `${reg === 'europe' ? 'European' : reg === 'apac' ? 'Asia-Pacific' : reg === 'latam' ? 'Latin American' : reg === 'mea' ? 'Middle East and Africa' : 'North American'}`;
    }
  }
  if (!offices.length || offices.length === r.offices.length) return undefined;
  const ind = offices[0].ind;
  const s = blank(g, ind, pick(g, CLASSIC), offices[0].city);
  s.offices = offices;
  s.industries = [...new Set(offices.map((o) => o.ind))];
  for (const k of s.industries) s.tech[k] = r.tech[k] ?? s.tech[k];
  r.offices = r.offices.filter((o) => !offices.includes(o));
  r.industries = [...new Set(r.offices.map((o) => o.ind))];
  const part = offices.reduce((a, o) => a + o.share * marketUnits(g, o.city, o.ind) * localPrice(g, o.city, o.ind), 0)
    / Math.max(1, [...offices, ...r.offices].reduce((a, o) => a + o.share * marketUnits(g, o.city, o.ind) * localPrice(g, o.city, o.ind), 0));
  s.cash = Math.max(0, r.cash) * part;
  s.debt = r.debt * part;
  r.cash -= s.cash;
  r.debt -= s.debt;
  s.brand = r.brand * 0.8;
  s.relation = 10; // a new management team, with no history with you
  s.known = true;
  finish(g, s);
  if (r.known) news(g, `${r.name} has spun off its ${what} business as ${s.name}. Smaller and independent, it may be open to offers.`, 'rival');
  return s;
}

/** Called once a quarter, after the rivals' accounts are done. */
export function rivalLifeEvents(g: GameState) {
  const m = g.macro;
  const d = DIFF[g.difficulty];
  if (g.turn < 4) return;
  const rateYearAgo = m.hist[m.hist.length - 5]?.rate ?? m.rate;
  for (const r of alive(g)) {
    const pers = PERSONALITY[r.personality];
    // a new chief executive: the company may change its character
    if (g.turn - (r.ceoSince ?? -99) >= 16 && chance(g, 0.012)) {
      const old = r.ceo;
      r.ceo = freshCeo(g);
      r.ceoSince = g.turn;
      r.relation = clamp(r.relation + 10, -100, 100);
      r.hostility = clamp(r.hostility - 2, 0, 10);
      let change = '';
      if (CLASSIC.includes(r.personality)) {
        const next = pick(g, CLASSIC.filter((p) => p !== r.personality));
        r.personality = next;
        r.eff = PERSONALITY[next].eff * d.rivalEff;
        change = ` Expect a different company: ${PERSONALITY[next].label.toLowerCase()}.`;
      }
      if (r.known) news(g, `${r.name} has replaced ${old} with ${r.ceo} as chief executive.${change} A new boss is a chance to reset relations.`, 'rival');
      if (r.feud?.length) feud(g, r, 'them', `A new chief executive, ${r.ceo}.`);
      continue;
    }
    // a listing, once it is big enough and its owners are the kind who sell shares
    if (!r.isPublic && !pers.privately && r.valuation > 1e9 * m.cpi) {
      r.isPublic = true;
      const raise = 0.15 * r.valuation;
      r.cash += raise;
      r.raised += raise;
      if (r.known) news(g, `${r.name} has listed on the stock exchange, raising ${money(raise)}. Its shares now trade, so a takeover would be by tender offer.`, 'rival');
      continue;
    }
    // a scandal: its customers start looking around
    if (g.turn - (g.counters[`scandal${r.id}`] ?? -99) >= 12 && chance(g, 0.006)) {
      g.counters[`scandal${r.id}`] = g.turn;
      r.brand = clamp(r.brand - 15, 0, 100);
      for (const o of r.offices) o.share *= 0.9;
      r.cash -= 0.1 * Math.max(0, r.rev);
      if (r.known) news(g, `Scandal at ${r.name}: ${pick(g, SCANDALS)}. Its customers are looking for alternatives.`, 'rival');
      continue;
    }
    // a private-equity owner sells what it can when borrowing gets dearer
    if (pers.ratesSell && m.rate - rateYearAgo > 0.75 && r.offices.length > 1 && r.debt > 0 && chance(g, 0.25)) {
      const ro = r.offices.slice().sort((a, b) => a.share - b.share)[0];
      const value = ro.share * marketUnits(g, ro.city, ro.ind) * localPrice(g, ro.city, ro.ind) * 4 * 1.2;
      const buyer = alive(g).filter((x) => x !== r && x.cash > value && x.industries.includes(ro.ind)).sort((a, b) => PERSONALITY[b.personality].acquisitive - PERSONALITY[a.personality].acquisitive)[0];
      r.offices = r.offices.filter((o) => o !== ro);
      r.cash += value;
      r.debt = Math.max(0, r.debt - value);
      if (buyer) {
        buyer.cash -= value;
        const mine = buyer.offices.find((o) => o.city === ro.city && o.ind === ro.ind);
        if (mine) { mine.share = clamp(mine.share + ro.share, 0, 0.9); mine.cap += ro.cap; } else buyer.offices.push(ro);
      }
      if (r.known) news(g, `With rates rising, ${r.name} has sold its ${CITY[ro.city].name} business${buyer ? ` to ${buyer.name}` : ''} to pay down debt.`, 'rival');
      continue;
    }
    // a spin-off from a sprawling company
    if ((r.industries.length > 1 || r.offices.length >= 5) && alive(g).length < d.rivals + 4 && chance(g, 0.008)) spinOff(g, r);
  }
}
