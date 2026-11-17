// People: wages, productivity, hiring pipelines, attrition, morale, layoffs, key people.
import { CITY, FOUNDER, INDUSTRIES, NAMES, isCapital } from './content';
import { expense } from './books';
import { fxOf } from './macro';
import { invSum, news, tempMod } from './mods';
import type { ActionResult, Company, ExecRole, GameState, Office, Person, Role } from './types';
import { ROLES } from './types';
import { clamp, normal, rand, stochRound } from './util';

export const headcount = (o: Office) => o.staff.ops.n + o.staff.sales.n + o.staff.rnd.n + o.staff.admin.n;
export const companyHeadcount = (c: Company) => c.offices.reduce((s, o) => s + headcount(o), 0);
export const exec = (c: Company, role: ExecRole): Person | undefined => c.people.find((p) => p.role === role && !p.office);
export const gmOf = (c: Company, o: Office): Person | undefined => (o.gm ? c.people.find((p) => p.id === o.gm) : undefined);
/** An executive's contribution: 0 with nobody in the seat, up to about +0.45 for a star. */
export const execBonus = (c: Company, role: ExecRole) => {
  const p = exec(c, role);
  return p ? (p.skill - 50) / 100 : 0;
};

/** Going market wage for a role in this office's city and industry, $ per quarter. */
export function marketWage(g: GameState, o: Office, role: Role): number {
  const def = INDUSTRIES[o.ind];
  return def.wages[role] * 1000 * CITY[o.city].wage * g.macro.wageIdx * fxOf(g, o.city) * tempMod(g, 'wages', o) * (1 + invSum(g, 'wageCost', o) / 100);
}
export const payroll = (g: GameState, o: Office, role: Role) => o.staff[role].n * marketWage(g, o, role) * o.pay;

export function productivity(g: GameState, o: Office): { mult: number; parts: Record<string, number> } {
  const c = g.company;
  const ops = o.staff.ops;
  const hc = headcount(o);
  const need = Math.max(1, hc / 14);
  const gm = gmOf(c, o);
  const parts: Record<string, number> = {
    Skill: 0.5 + ops.skill / 100,
    Morale: clamp(0.7 + (0.3 * o.morale) / 60, 0.7, 1.15),
    Culture: 0.9 + (0.2 * c.culture) / 100,
    'New-hire ramp': ops.n > 0 ? 1 - (0.5 * Math.min(ops.fresh, ops.n)) / ops.n : 1,
    'Management span': o.staff.admin.n >= need ? 1 : 1 - 0.3 * (1 - o.staff.admin.n / need),
    Leadership: (gm ? 1 + (gm.skill - 50) / 400 : 0.97) * (1 + execBonus(c, 'COO') * 0.2),
    Programs: (1 + invSum(g, 'prod', o) / 100) * tempMod(g, 'prod', o) * FOUNDER[c.founder].opsProd,
    Integration: o.integration > 0 ? 0.9 : 1,
    'Industry progress': g.macro.prodIdx ?? 1,
  };
  return { mult: Object.values(parts).reduce((a, b) => a * b, 1), parts };
}

export interface Prep {
  prodMult: number;
  prodParts: Record<string, number>;
  laborCap: number;
  capacity: number;
  facility: number;
}
export function prepOffice(g: GameState, o: Office): Prep {
  const def = INDUSTRIES[o.ind];
  const { mult, parts } = productivity(g, o);
  const laborCap = o.staff.ops.n * def.opsOut * mult;
  const capMod = tempMod(g, 'capacity', o) * (1 + invSum(g, 'capacity', o) / 100);
  const facility = isCapital(o.ind) ? o.cap * capMod : Infinity;
  return { prodMult: mult, prodParts: parts, laborCap, facility, capacity: Math.min(laborCap * (isCapital(o.ind) ? 1 : capMod), facility) };
}

/** How many candidates this office can realistically land for a role this quarter. */
export function hirePool(g: GameState, o: Office, role: Role): number {
  const c = g.company;
  const city = CITY[o.city];
  const roleF = { ops: 1.6, sales: 0.8, rnd: 0.7 * (city.talentQ / 60), admin: 0.6 }[role];
  const base = 3 + city.pop * (city.talent / 100) * (city.tal[o.ind] ?? 1) * 5 * roleF;
  const pay = clamp(o.pay ** 3, 0.3, 2.6);
  const brand = 0.7 + (0.6 * (0.5 * c.brand + 0.5 * c.reputation)) / 100;
  const slack = clamp(2 - g.macro.labor, 0.6, 1.3);
  const crowd = 0.9 ** g.rivals.filter((r) => r.alive && r.offices.some((x) => x.city === o.city && x.ind === o.ind)).length;
  return base * pay * brand * slack * crowd * (1 + invSum(g, 'hirePool', o) / 100) * (1 + execBonus(c, 'CHRO') * 0.5);
}

export function attritionRate(g: GameState, o: Office): number {
  const c = g.company;
  const util = o.last?.util ?? 0.8;
  const overwork = Math.max(0, util - 0.92) * 3;
  const r =
    INDUSTRIES[o.ind].baseAttr * (1 + ((55 - o.morale) / 55) * 1.2) * o.pay ** -2.5 * g.macro.labor ** 1.5 * (1 + overwork) *
    (1.25 - (0.5 * c.culture) / 100) * (1 + invSum(g, 'attrition', o) / 100) * tempMod(g, 'attrition', o) * (1 - execBonus(c, 'CHRO') * 0.4);
  return clamp(r, 0.004, 0.3);
}

export function moraleTarget(g: GameState, o: Office, growing: number): { target: number; parts: Record<string, number> } {
  const c = g.company;
  const util = o.last?.util ?? 0.8;
  const gm = gmOf(c, o);
  const parts: Record<string, number> = {
    Baseline: 50,
    Pay: (o.pay - 1) * 70,
    Culture: (c.culture - 50) * 0.3,
    Leadership: gm ? (gm.skill - 50) * 0.15 : -3,
    Workload: -Math.max(0, util - 0.92) * 75 - (util < 0.5 ? (0.5 - util) * 20 : 0),
    'Layoff scars': -o.scar,
    Momentum: growing > 0.04 ? 4 : growing < -0.04 ? -4 : 0,
    Programs: invSum(g, 'morale', o) + o.training * 2,
  };
  return { target: clamp(Object.values(parts).reduce((a, b) => a + b, 0), 5, 98), parts };
}

/** Quarterly people step for one office: quits, hires, skill and morale. Returns hiring and training cost. */
export function stepPeople(g: GameState, o: Office, growing: number): { hires: number; quits: number; rate: number; hiring: number; training: number; moraleTarget: number; moraleParts: Record<string, number> } {
  const c = g.company;
  const city = CITY[o.city];
  const rate = attritionRate(g, o);
  let quits = 0, hires = 0, hiring = 0;
  let wageBill = 0;
  for (const role of ROLES) {
    const s = o.staff[role];
    s.fresh = 0;
    const q = Math.min(s.n, stochRound(g, s.n * rate * (role === 'admin' ? 0.7 : 1)));
    s.n -= q;
    quits += q;
    if (o.autoBackfill) s.reqs += q;
    if (s.reqs > 0) {
      const h = Math.min(s.reqs, stochRound(g, hirePool(g, o, role)));
      if (h > 0) {
        const hs = clamp(city.talentQ + (o.pay - 1) * 35 + normal(g, 0, 4), 20, 95);
        s.skill = (s.skill * s.n + hs * h) / (s.n + h);
        s.n += h;
        s.fresh = h;
        s.reqs -= h;
        hires += h;
        hiring += h * 0.6 * marketWage(g, o, role);
      }
    }
    const gain = 0.25 + o.training * 0.5 + invSum(g, 'skill', o);
    s.skill = clamp(s.skill + gain * (1 - s.skill / 95), 15, 95);
    wageBill += payroll(g, o, role);
  }
  const mt = moraleTarget(g, o, growing);
  o.morale = clamp(o.morale + 0.3 * (mt.target - o.morale), 0, 100);
  o.scar *= 0.75;
  if (o.integration > 0) o.integration--;
  const training = o.training * 0.02 * wageBill;
  expense(c, 'ga', hiring + training, 'ap');
  g.counters.quits = (g.counters.quits ?? 0) + quits;
  g.counters.hires = (g.counters.hires ?? 0) + hires;
  return { hires, quits, rate, hiring, training, moraleTarget: mt.target, moraleParts: mt.parts };
}

export function severanceCost(g: GameState, o: Office, role: Role, n: number): number {
  return n * marketWage(g, o, role) * o.pay * (0.5 + 1.5 * CITY[o.city].reg);
}

export function layoff(g: GameState, o: Office, role: Role, n: number): ActionResult {
  const c = g.company;
  const s = o.staff[role];
  n = Math.min(Math.floor(n), s.n);
  if (n <= 0) return { ok: false, msg: 'Nobody to lay off in that role.' };
  const before = headcount(o);
  const cost = severanceCost(g, o, role, n);
  expense(c, 'other', cost, 'cash');
  s.n -= n;
  s.reqs = 0;
  s.fresh = Math.min(s.fresh, s.n);
  const frac = n / before;
  o.scar += 6 + 40 * frac;
  o.morale = clamp(o.morale - (4 + 25 * frac), 0, 100);
  c.culture = clamp(c.culture - (0.5 + (6 * frac * before) / Math.max(1, companyHeadcount(c) + n)), 0, 100);
  if (frac > 0.15) c.reputation = clamp(c.reputation - (1 + 5 * frac), 0, 100);
  g.counters.layoffs = (g.counters.layoffs ?? 0) + n;
  if (n >= 10) news(g, `${c.name} laid off ${n} people in ${city(o)}. Severance cost ${Math.round(cost / 1000)}K.`, 'bad');
  return { ok: true, msg: `Laid off ${n}. Severance paid; morale and culture took a hit.` };
}
const city = (o: Office) => CITY[o.city].name;

// ───────────── key people ─────────────

/** Remove a key person and apply the damage their departure does. */
export function personLeaves(g: GameState, p: Person, why = 'resigned'): string {
  const c = g.company;
  c.people = c.people.filter((x) => x.id !== p.id);
  const planned = g.company.investments.some((i) => i.state === 'active' && i.def === 'succession');
  const soft = planned ? 0.5 : 1;
  let effect = '';
  if (p.office) {
    const o = c.offices.find((x) => x.id === p.office);
    if (o) {
      const succ: Person = { ...p, id: 'p' + (++g.uid), name: `${pickName(g)}`, skill: clamp(Math.round(p.skill - (planned ? 4 : 12) + normal(g, 0, 5)), 25, 92), loyalty: 60, hired: g.turn, retained: undefined };
      c.people.push(succ);
      o.gm = succ.id;
      o.morale = clamp(o.morale - 6 * soft, 0, 100);
      g.mods.push({ kind: 'prod', pct: -8 * soft, until: g.turn + 1, office: o.id, src: 'GM departure' });
      effect = `${succ.name} steps up; expect a rough couple of quarters in ${CITY[o.city].name}.`;
    }
  } else {
    switch (p.role) {
      case 'CTO':
        c.tech[c.primary] = clamp((c.tech[c.primary] ?? 0) - 3 * soft, 5, 100);
        for (const o of c.offices) o.staff.rnd.n = Math.max(0, o.staff.rnd.n - stochRound(g, o.staff.rnd.n * 0.06 * soft));
        effect = 'Some engineers followed, and the roadmap slipped.';
        break;
      case 'CFO':
        g.mods.push({ kind: 'valuation', pct: -5 * soft, until: g.turn + 2, src: 'CFO departure' });
        effect = 'Investors and lenders are asking questions.';
        break;
      case 'COO':
        g.mods.push({ kind: 'prod', pct: -4 * soft, until: g.turn + 1, src: 'COO departure' });
        effect = 'Operations will wobble for a while.';
        break;
      case 'CMO':
        c.brand = clamp(c.brand - 2 * soft, 0, 100);
        effect = 'Campaigns in flight lost their owner.';
        break;
      default:
        c.culture = clamp(c.culture - 2 * soft, 0, 100);
        effect = 'People noticed.';
    }
  }
  g.counters.keyDepartures = (g.counters.keyDepartures ?? 0) + 1;
  news(g, `${p.name}, ${p.role === 'GM' ? 'general manager' : p.role}, has ${why}. ${effect}`, 'bad');
  return effect;
}
function pickName(g: GameState): string {
  const f = NAMES.first, l = NAMES.last;
  return `${f[Math.floor(rand(g) * f.length)]} ${l[Math.floor(rand(g) * l.length)]}`;
}

/** Per-quarter chance that this person resigns. */
export function flightRisk(g: GameState, p: Person): number {
  if ((p.retained ?? -1) >= g.turn) return 0;
  return clamp(0.012 * (1.7 - (p.loyalty / 100) * 1.4) * g.macro.labor * (p.skill > 75 ? 1.4 : 1), 0, 0.2);
}

/** Loyalty drift and resignations. Returns people who decided to leave this quarter. */
export function stepKeyPeople(g: GameState): Person[] {
  const c = g.company;
  const leaving: Person[] = [];
  for (const p of c.people) {
    const o = p.office ? c.offices.find((x) => x.id === p.office) : undefined;
    const drift = (c.culture - 50) * 0.02 + (o ? (o.morale - 55) * 0.03 : 0) + invSum(g, 'loyalty') - 0.3;
    p.loyalty = clamp(p.loyalty + drift, 0, 100);
    if (rand(g) < flightRisk(g, p)) leaving.push(p);
  }
  return leaving;
}
