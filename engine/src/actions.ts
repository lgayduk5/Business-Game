// Player actions. Each validates, mutates the state and returns {ok, msg}.
import * as B from './books';
import { CITY, INDUSTRIES, isCapital } from './content';
import { plantEquity, plantValue } from './finance';
import { market, marketUnits } from './market';
import { news } from './mods';
import { makeOffice, makePerson } from './newgame';
import { headcount, layoff, marketWage, severanceCost } from './people';
import type { ActionResult, ExecRole, GameState, IndustryId, Office, RegionId, Role, SupplyMode } from './types';
import { ROLES } from './types';
import { clamp, money } from './util';

const ok = (msg: string): ActionResult => ({ ok: true, msg });
const no = (msg: string): ActionResult => ({ ok: false, msg });
export const officeById = (g: GameState, id: string): Office | undefined => g.company.offices.find((o) => o.id === id);
const playing = (g: GameState) => g.status === 'playing' || g.continued;

// ───────────── office tier ─────────────

export function setReqs(g: GameState, officeId: string, role: Role, n: number): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  o.staff[role].reqs = clamp(Math.round(n), 0, 5000);
  return ok(o.staff[role].reqs ? `${o.staff[role].reqs} open ${INDUSTRIES[o.ind].roles[role].toLowerCase()} positions. They fill as candidates are found.` : 'Hiring paused for that role.');
}
export function fire(g: GameState, officeId: string, role: Role, n: number): ActionResult {
  const o = officeById(g, officeId);
  return o ? layoff(g, o, role, n) : no('No such office.');
}
export function setPay(g: GameState, officeId: string, pay: number): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  const before = o.pay;
  o.pay = clamp(Math.round(pay * 100) / 100, 0.7, 1.6);
  if (o.pay < before - 0.001) o.morale = clamp(o.morale - (before - o.pay) * 60, 0, 100); // pay cuts hurt at once
  return ok(`Pay set to ${(o.pay * 100).toFixed(0)}% of the local market rate.`);
}
export function setTraining(g: GameState, officeId: string, level: number): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  o.training = clamp(Math.round(level), 0, 3);
  return ok(o.training ? `Training budget set to ${o.training * 2}% of payroll.` : 'Training stopped.');
}
export function setBackfill(g: GameState, officeId: string, on: boolean): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  o.autoBackfill = on;
  return ok(on ? 'People who leave will be replaced automatically.' : 'Leavers will not be replaced.');
}

/** Cost of adding capacity: construction is cheaper where land and labour are cheap. */
export function expandCost(g: GameState, o: Office, units: number): number {
  return units * INDUSTRIES[o.ind].capPerUnit * 1000 * g.macro.cpi * (0.6 + 0.4 * CITY[o.city].rent);
}
/** Share of a plant expansion lenders will finance against the new asset (project or equipment finance). */
export const assetFinanceLTV = (ind: IndustryId) => (INDUSTRIES[ind].capPerUnit >= 10 ? 0.7 : 0.5);
/** Project or equipment finance secured on a plant: fixed rate, amortising, covenants waived until it is built. */
function assetLoan(g: GameState, o: Office, lent: number, buildQ: number) {
  const c = g.company;
  const project = INDUSTRIES[o.ind].capPerUnit >= 10;
  // project finance is long and cheap: lenders are secured on a plant with decades of steady output
  const rate = Math.round((g.macro.rate + (project ? 1.8 : 3) + g.macro.spread * 0.5 + (c.ratingScore < 46 ? 1.5 : 0)) * 20) / 20;
  const term = project ? 80 : 28;
  c.loans.push({ id: 'ln' + (++g.uid), kind: project ? 'project' : 'equipment', name: `${CITY[o.city].name} ${project ? 'project' : 'equipment'} finance`, principal: lent, limit: 0, spread: 0, fixedRate: rate, floating: false,
    start: g.turn, maturity: g.turn + term, amort: lent / term, minCoverage: 1.2, breaches: 0, waivedUntil: g.turn + buildQ + 2, office: o.id });
  B.borrow(c, lent);
  B.expense(c, 'other', lent * 0.01, 'cash');
}

export function expandCapacity(g: GameState, officeId: string, units: number, financed = false): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  if (!isCapital(o.ind)) return no('This business has no plant to expand — capacity is people.');
  units = Math.max(0, Math.round(units));
  const cost = expandCost(g, o, units);
  if (units <= 0) return no('Choose how much to build.');
  const c = g.company;
  const def = INDUSTRIES[o.ind];
  const ltv = assetFinanceLTV(o.ind);
  const lent = financed ? cost * ltv : 0;
  // a fund that owns part of the plant puts in its share of the equity, as joint-venture partners do
  const partner = (o.minority ?? 0) * (cost - lent);
  if (financed && c.negCashTurns > 0) return no('Lenders will not finance new assets while you are overdrawn.');
  if (cost - lent - partner > c.books.cash) return no(`You need ${money(cost - lent - partner)} of your own money for this${financed ? ' (lenders cover the rest)' : ''}${partner ? ' (the plant’s fund pays its share)' : ''}; you have ${money(c.books.cash)}.`);
  if (lent > 0) assetLoan(g, o, lent, def.buildQ);
  if (partner > 0) B.issueEquity(c, partner);
  B.capex(c, cost, o);
  o.building.push({ units, ready: g.turn + def.buildQ, cost });
  return ok(`Building ${units.toLocaleString()} units of capacity for ${money(cost)}${lent ? `, ${money(lent)} of it borrowed against the new asset` : ''}${partner ? `, ${money(partner)} from the plant’s fund` : ''}. Ready in ${def.buildQ} quarters.`);
}
export function sellCapacity(g: GameState, officeId: string, units: number): ActionResult {
  const o = officeById(g, officeId);
  if (!o || !isCapital(o.ind)) return no('Nothing to sell.');
  units = clamp(Math.round(units), 0, o.cap);
  if (units <= 0) return no('Nothing to sell.');
  const cip = o.building.reduce((s, b) => s + b.cost, 0);
  const frac = units / o.cap;
  const gross = (o.ppe - cip) * frac;
  const acc = o.accDep * frac;
  const proceeds = (gross - acc) * 0.5;
  B.dispose(g.company, gross, acc, proceeds, o);
  o.cap -= units;
  return ok(`Sold capacity for ${money(proceeds)} — half its book value. Fire sales are expensive.`);
}

export const PLANT_STAKE = 0.49;
/** Can this office's plant be part-sold? Only heavy plant with a year of running history. */
export function canRecycle(g: GameState, o: Office): string {
  if (INDUSTRIES[o.ind].capPerUnit < 10) return 'Only power plants and similar long-lived assets attract infrastructure funds.';
  if (o.minority) return 'A fund already owns part of this plant.';
  if (o.hist.length < 4 || g.turn - o.opened < 4) return 'Funds want a year of running history first.';
  if (plantValue(g, o) <= 0) return 'The plant does not make money yet.';
  if (plantEquity(g, o) <= 0) return 'The plant owes its lenders more than a fund would pay for it.';
  return '';
}
/**
 * Capital recycling: sell a minority stake in a running plant to an infrastructure fund and use the cash
 * to build the next one. The fund takes its share of the plant's cash profit every quarter from then on.
 */
export function sellPlantStake(g: GameState, officeId: string): ActionResult {
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  const why = canRecycle(g, o);
  if (why) return no(why);
  const price = PLANT_STAKE * plantEquity(g, o);
  B.issueEquity(g.company, price * 0.98); // a stake in a subsidiary: non-controlling interest, after fees
  o.minority = PLANT_STAKE;
  g.counters.recycled = (g.counters.recycled ?? 0) + price;
  news(g, `${g.company.name} sold ${Math.round(PLANT_STAKE * 100)}% of its ${CITY[o.city].name} plant to an infrastructure fund for ${money(price)}.`, 'good');
  return ok(`Sold ${Math.round(PLANT_STAKE * 100)}% of the plant for ${money(price * 0.98)} after fees. From now on the fund receives ${Math.round(PLANT_STAKE * 100)}% of what the plant earns after its own loan is serviced.`);
}

/** Sell invoices to a factor as you bill them: most receivables turn into cash at once, for a fee. */
export const FACTOR_SHARE = 0.8;
export const FACTOR_FEE = 0.015; // of the invoices sold, per quarter
export function setFactoring(g: GameState, on: boolean): ActionResult {
  g.company.factoring = on;
  return ok(on ? `From next quarter a factor buys ${Math.round(FACTOR_SHARE * 100)}% of your invoices as you bill them, for ${(FACTOR_FEE * 100).toFixed(1)}% of their value.` : 'Factoring stopped. Receivables will build back up as customers pay on their usual terms.');
}

// ───────────── region tier ─────────────

export function setPrice(g: GameState, region: RegionId, ind: IndustryId, p: number): ActionResult {
  g.company.policy[region].price[ind] = clamp(Math.round(p * 100) / 100, 0.5, 1.8);
  return ok(`Price set to ${(g.company.policy[region].price[ind]! * 100).toFixed(0)}% of the market reference.`);
}
export function setMarketing(g: GameState, region: RegionId, amount: number): ActionResult {
  g.company.policy[region].marketing = Math.max(0, Math.round(amount));
  return ok(`Marketing budget: ${money(g.company.policy[region].marketing)} a quarter.`);
}
export function setSupply(g: GameState, region: RegionId, mode: SupplyMode): ActionResult {
  const c = g.company;
  if (c.policy[region].supply === mode) return ok('No change.');
  const rev = c.offices.filter((o) => CITY[o.city].region === region).reduce((s, o) => s + (o.last?.revenue ?? 0), 0);
  B.expense(c, 'cogs', rev * 0.01, 'ap'); // requalifying suppliers
  c.policy[region].supply = mode;
  return ok(`Supply chain switched to ${mode}. Requalifying suppliers cost ${money(rev * 0.01)}.`);
}

// ───────────── expansion ─────────────

export function scoutCost(g: GameState, cityId: string): number {
  return 40_000 * g.macro.cpi * (CITY[cityId].region === CITY[g.company.home].region ? 1 : 2);
}
export function scout(g: GameState, cityId: string): ActionResult {
  if (!CITY[cityId]) return no('Unknown city.');
  if ((g.discovered[cityId] ?? 0) > 0) return no('You already know this market.');
  if (g.scouting.some((s) => s.city === cityId)) return no('A study is already under way.');
  const cost = scoutCost(g, cityId);
  if (cost > g.company.books.cash) return no('Not enough cash for a market study.');
  B.expense(g.company, 'sm', cost, 'cash');
  g.scouting.push({ city: cityId, ready: g.turn + 1 });
  return ok(`Market study commissioned for ${money(cost)}. Results next quarter.`);
}

export function openOfficeCost(g: GameState, cityId: string, ind: IndustryId): { setup: number; capex: number; units: number; total: number } {
  const city = CITY[cityId];
  const def = INDUSTRIES[ind];
  const setup = 60_000 * g.macro.cpi * (0.5 + 0.5 * city.rent) * (1 + city.reg);
  const units = def.start.cap;
  const capex = units * def.capPerUnit * 1000 * g.macro.cpi * (0.6 + 0.4 * city.rent);
  return { setup, capex, units, total: setup + capex };
}
/** Opening a plant-heavy office can be part-financed against the plant, as an expansion can. */
export function openOfficeFinancing(g: GameState, cityId: string, ind: IndustryId): number {
  return openOfficeCost(g, cityId, ind).capex * assetFinanceLTV(ind);
}
export function openOffice(g: GameState, cityId: string, ind: IndustryId, financed = false): ActionResult {
  const c = g.company;
  if (!playing(g)) return no('The game is over.');
  if (!CITY[cityId]) return no('Unknown city.');
  if ((g.discovered[cityId] ?? 0) < 1) return no('Commission a market study first.');
  if (!c.divisions.includes(ind)) return no('You do not operate in that industry yet.');
  if (c.offices.some((o) => o.city === cityId && o.ind === ind)) return no('You already have that office.');
  const cost = openOfficeCost(g, cityId, ind);
  const lent = financed && cost.capex > 0 ? openOfficeFinancing(g, cityId, ind) : 0;
  if (lent > 0 && c.negCashTurns > 0) return no('Lenders will not finance new assets while you are overdrawn.');
  if (cost.total - lent > c.books.cash) return no(`Opening here costs ${money(cost.total)}${lent ? `, ${money(lent)} of it lent against the plant` : ''}; you have ${money(c.books.cash)}.`);
  const def = INDUSTRIES[ind];
  const o = makeOffice(g, cityId, ind, { ops: 0, sales: 0, rnd: 0, admin: 1 }, cost.units);
  B.expense(c, 'ga', cost.setup, 'cash');
  if (lent > 0) assetLoan(g, o, lent, 0);
  if (cost.capex > 0) B.capex(c, cost.capex, o);
  o.staff.ops.reqs = isCapital(ind) ? Math.max(1, Math.ceil((cost.units / def.opsOut) * 0.8)) : 3;
  o.staff.sales.reqs = ind === 'retail' ? 0 : 1;
  c.offices.push(o);
  g.discovered[cityId] = 2;
  g.counters.officesOpened = (g.counters.officesOpened ?? 0) + 1;
  news(g, `${c.name} opened in ${CITY[cityId].name}.`, 'good');
  return ok(`Office opened in ${CITY[cityId].name}. A starter team is being recruited — adjust hiring on the office page.`);
}

export function closeOffice(g: GameState, officeId: string): ActionResult {
  const c = g.company;
  const o = officeById(g, officeId);
  if (!o) return no('No such office.');
  if (c.offices.length <= 1) return no('You cannot close your last office.');
  let sev = 0;
  for (const r of ROLES) sev += severanceCost(g, o, r, o.staff[r].n);
  const lease = 2 * (o.last?.rent ?? 0) + 2 * (o.last?.facility ?? 0);
  B.expense(c, 'other', sev + lease, 'cash');
  if (o.ppe > 0) B.dispose(c, o.ppe, o.accDep, (o.ppe - o.accDep) * 0.4, o);
  if (o.invValue > 0) B.useInventory(c, o, o.invValue);
  g.counters.layoffs = (g.counters.layoffs ?? 0) + headcount(o);
  c.people = c.people.filter((p) => p.office !== o.id);
  c.offices = c.offices.filter((x) => x !== o);
  c.reputation = clamp(c.reputation - 2, 0, 100);
  c.culture = clamp(c.culture - 2, 0, 100);
  g.discovered[o.city] = c.offices.some((x) => x.city === o.city) ? 2 : 1;
  news(g, `${c.name} closed its ${CITY[o.city].name} office. Severance and lease-break costs: ${money(sev + lease)}.`, 'bad');
  return ok(`Office closed. It cost ${money(sev + lease)} to exit.`);
}

export function divisionCost(g: GameState, ind: IndustryId): number {
  return Math.max(400_000 * g.macro.cpi, 0.04 * B.ttm(g.company, (q) => q.pnl.revenue)) * (1 + INDUSTRIES[ind].regSens * 0.5);
}
export function launchDivision(g: GameState, ind: IndustryId): ActionResult {
  const c = g.company;
  if (c.divisions.includes(ind)) return no('You already operate in that industry.');
  const cost = divisionCost(g, ind);
  if (cost > c.books.cash) return no(`Launching a new division costs ${money(cost)}.`);
  B.expense(c, 'rd', cost, 'cash');
  c.divisions.push(ind);
  c.tech[ind] = INDUSTRIES[ind].startTech - 4;
  news(g, `${c.name} is entering ${INDUSTRIES[ind].name}.`, 'info');
  return ok(`${INDUSTRIES[ind].name} division launched. You start behind the incumbents; open an office to begin trading.`);
}

// ───────────── corporate tier ─────────────

export function setRdBudget(g: GameState, ind: IndustryId, amount: number): ActionResult {
  g.company.rdBudget[ind] = Math.max(0, Math.round(amount));
  return ok(`R&D program budget: ${money(g.company.rdBudget[ind]!)} a quarter.`);
}
export function setDividend(g: GameState, amount: number): ActionResult {
  const cap = g.company.cap;
  const before = cap.dividend;
  cap.dividend = Math.max(0, Math.round(amount));
  if (cap.isPublic && cap.dividend < before * 0.95) {
    cap.premium = clamp(cap.premium * 0.9, 0.5, 1.8);
    return ok('Dividend cut. Income investors are selling — the share price will feel it.');
  }
  return ok(cap.dividend ? `Dividend set to ${money(cap.dividend)} a quarter.` : 'No dividend.');
}
export function setAutoRevolver(g: GameState, on: boolean): ActionResult {
  g.company.autoRevolver = on;
  return ok(on ? 'The credit line will be drawn automatically if cash runs short.' : 'Automatic drawing is off.');
}

// ───────────── executives ─────────────

export const EXEC_ROLES: ExecRole[] = ['CFO', 'CTO', 'COO', 'CMO', 'CHRO'];
export function refreshCandidates(g: GameState) {
  const taken = new Set(g.company.people.filter((p) => !p.office).map((p) => p.role));
  g.candidates = [];
  for (const role of EXEC_ROLES) {
    if (taken.has(role)) continue;
    for (let i = 0; i < 2; i++) g.candidates.push(makePerson(g, role, undefined, i === 0 ? 4 : -4));
  }
}
export function hireExec(g: GameState, personId: string): ActionResult {
  const c = g.company;
  const p = g.candidates.find((x) => x.id === personId);
  if (!p) return no('That candidate has taken another job.');
  if (c.people.some((x) => x.role === p.role && !x.office)) return no(`You already have a ${p.role}.`);
  const fee = p.salary * 1.2;
  if (fee > c.books.cash) return no(`The search fee and signing bonus come to ${money(fee)}.`);
  B.expense(c, 'ga', fee, 'cash');
  p.hired = g.turn;
  c.people.push(p);
  g.candidates = g.candidates.filter((x) => x.role !== p.role);
  news(g, `${p.name} joined ${c.name} as ${p.role}.`, 'good');
  return ok(`${p.name} hired as ${p.role}.`);
}
export function fireExec(g: GameState, personId: string): ActionResult {
  const c = g.company;
  const p = c.people.find((x) => x.id === personId);
  if (!p) return no('No such person.');
  B.expense(c, 'other', p.salary * g.macro.wageIdx * 2, 'cash');
  c.people = c.people.filter((x) => x !== p);
  if (p.office) {
    const o = officeById(g, p.office);
    if (o) {
      const gm = makePerson(g, 'GM', o, -3);
      c.people.push(gm);
      o.gm = gm.id;
      o.morale = clamp(o.morale - 4, 0, 100);
      return ok(`${p.name} was let go. ${gm.name} steps up as general manager.`);
    }
  }
  return ok(`${p.name} was let go with two quarters of pay.`);
}
/** Retention package: a cash bonus now buys loyalty and a lock-in period. */
export function retain(g: GameState, personId: string): ActionResult {
  const c = g.company;
  const p = c.people.find((x) => x.id === personId);
  if (!p) return no('No such person.');
  const cost = p.salary * g.macro.wageIdx * 1.5;
  if (cost > c.books.cash) return no(`A retention package costs ${money(cost)}.`);
  B.expense(c, 'ga', cost, 'cash');
  p.loyalty = clamp(p.loyalty + 25, 0, 100);
  p.retained = g.turn + 8;
  return ok(`${p.name} signed a two-year retention package for ${money(cost)}.`);
}

/** Rough guide to what a full team for the office's current demand would look like. */
export function staffingHint(g: GameState, o: Office): Record<Role, number> {
  const def = INDUSTRIES[o.ind];
  const D = marketUnits(g, o.city, o.ind);
  market(g, o.city, o.ind);
  // staff for what you can sell next quarter: share moves only part of the way to where customers would take you
  const next = o.share + def.stick * Math.max(0, (o.last?.target ?? o.share) - o.share);
  const want = Math.max(o.last?.demand ?? 0, next * D);
  const ops = Math.ceil(Math.min(isCapital(o.ind) ? o.cap : Infinity, want * 1.1) / (def.opsOut * (o.last?.prodMult ?? 1)));
  const hc = headcount(o);
  return { ops, sales: o.staff.sales.n, rnd: o.staff.rnd.n, admin: Math.max(1, Math.ceil(hc / 14)) };
}
export { marketWage };

// ───────────── regional partners ─────────────

export const PARTNER = { boost: 0.25, fee: 0.06, quarters: 8 };
export function partnerCost(g: GameState): number {
  return 50_000 * g.macro.cpi;
}
/** Sign a local distribution partner: faster acceptance in the region in exchange for a cut of sales. */
export function signPartner(g: GameState, region: RegionId): ActionResult {
  const c = g.company;
  const pol = c.policy[region];
  if (pol.partner && pol.partner.until >= g.turn) return no('You already have a partner in this region.');
  if (!c.offices.some((o) => CITY[o.city].region === region)) return no('Open an office in the region first.');
  const cost = partnerCost(g);
  if (cost > c.books.cash) return no('Not enough cash to set up the partnership.');
  B.expense(c, 'sm', cost, 'cash');
  pol.partner = { name: `${CITY[c.offices.find((o) => CITY[o.city].region === region)!.city].name} Channel Partners`, boost: PARTNER.boost, fee: PARTNER.fee, until: g.turn + PARTNER.quarters - 1 };
  return ok(`Partner signed for two years: +${PARTNER.boost * 100}% presence in the region for ${PARTNER.fee * 100}% of sales.`);
}
export function endPartner(g: GameState, region: RegionId): ActionResult {
  const pol = g.company.policy[region];
  if (!pol.partner) return no('No partner to drop.');
  pol.partner = undefined;
  return ok('Partnership ended.');
}
