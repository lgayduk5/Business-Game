// Investments: upfront and ongoing cost, ramp-up, payoff curves, staged gates, hidden risk.
import * as B from './books';
import { CITY, INDUSTRIES, INV, INVESTMENTS } from './content';
import { applyFx, queueEvent } from './events';
import { curveMult, news } from './mods';
import { execBonus } from './people';
import type { ActionResult, ActiveInvestment, GameState, IndustryId, InvestmentDef, RegionId } from './types';
import { chance, clamp, money, nextUid } from './util';

const DEPR_Q = 20; // capitalised project spend is written off over five years

/** Annual revenue of whatever the investment applies to. */
function revBasis(g: GameState, def: InvestmentDef, scope?: string): number {
  const c = g.company;
  const offs = def.scope === 'office' ? c.offices.filter((o) => o.id === scope) : def.scope === 'region' ? c.offices.filter((o) => CITY[o.city].region === scope) : c.offices;
  return offs.reduce((s, o) => s + (o.last?.revenue ?? 0), 0) * 4;
}
export function invCost(g: GameState, def: InvestmentDef, scope?: string): number {
  return Math.max(def.base * 1000 * g.macro.cpi, def.perRev * revBasis(g, def, scope));
}
/** Total cost of a staged project if every stage is funded. */
export const stagedTotal = (def: InvestmentDef) => (def.stages ?? []).reduce((s, st) => s + st.cost, 0);

export function invAvailable(g: GameState, def: InvestmentDef, scope?: string): { ok: boolean; why: string } {
  const c = g.company;
  if (def.scope !== 'corp' && !scope) return { ok: false, why: 'Choose where.' };
  if (def.inds) {
    const o = def.scope === 'office' ? c.offices.find((x) => x.id === scope) : undefined;
    const has = o ? def.inds.includes(o.ind) : def.scope === 'region' ? c.offices.some((x) => CITY[x.city].region === scope && def.inds!.includes(x.ind)) : c.divisions.some((d) => def.inds!.includes(d));
    if (!has) return { ok: false, why: `Only for ${def.inds.map((k) => INDUSTRIES[k]?.short ?? k).join(', ')}.` };
  }
  if (def.minRev && revBasis(g, { ...def, scope: 'corp' }) < def.minRev * 1000 * g.macro.cpi) return { ok: false, why: `Needs ${money(def.minRev * 1000 * g.macro.cpi)} of annual revenue.` };
  const live = c.investments.filter((i) => i.def === def.id && (i.state === 'ramp' || i.state === 'active') && (def.scope === 'corp' || i.scope === scope));
  if (live.length && (def.unique !== false || !def.stages)) return { ok: false, why: 'Already running.' };
  if (live.length >= 3) return { ok: false, why: 'Three of these at once is the limit.' };
  return { ok: true, why: '' };
}
export const catalog = (g: GameState, scope: InvestmentDef['scope']) => INVESTMENTS.filter((d) => d.scope === scope && (!d.inds || g.company.divisions.some((k) => d.inds!.includes(k))));

/** The division an investment's technology flows into. */
function techInd(g: GameState, def: InvestmentDef, inv: ActiveInvestment): IndustryId {
  const c = g.company;
  if (def.scope === 'office') return c.offices.find((o) => o.id === inv.scope)?.ind ?? c.primary;
  return def.inds?.find((k) => c.divisions.includes(k)) ?? c.primary;
}

export function startInvestment(g: GameState, defId: string, scope?: string): ActionResult {
  const c = g.company;
  const def = INV[defId];
  if (!def) return { ok: false, msg: 'Unknown investment.' };
  const av = invAvailable(g, def, scope);
  if (!av.ok) return { ok: false, msg: av.why };
  const upfront = invCost(g, def, scope);
  const first = def.stages ? 0 : upfront;
  if (first > c.books.cash) return { ok: false, msg: `That needs ${money(first)}; you have ${money(c.books.cash)}.` };
  const inv: ActiveInvestment = {
    uid: nextUid(g), def: def.id, scope, start: g.turn, upfront, stage: 0, stageLeft: def.stages ? def.stages[0].q : def.ramp,
    state: def.ramp > 0 || def.stages ? 'ramp' : 'active', age: 0, granted: 0, diligenced: !!c.diligence[def.id], bookValue: 0,
  };
  if (!def.stages) {
    if (isSecurity(def)) {
      B.buySecurities(c, upfront);
      inv.bookValue = upfront;
    } else {
      const cap = upfront * def.capex;
      if (cap > 0) B.capex(c, cap);
      inv.bookValue = cap;
      B.expense(c, def.cat2, upfront - cap, 'cash');
    }
  }
  c.investments.push(inv);
  if (def.start) applyFx(g, def.start, { office: def.scope === 'office' ? scope : undefined, region: def.scope === 'region' ? (scope as RegionId) : undefined });
  g.counters.invested = (g.counters.invested ?? 0) + first;
  return { ok: true, msg: def.stages ? `${def.name} started. First stage: ${def.stages[0].name}, ${def.stages[0].q} quarters.` : `${def.name} funded for ${money(upfront)}.${def.ramp ? ` Pays off from ${def.ramp} quarters out.` : ''}` };
}

/** Financial investments sit on the balance sheet as securities rather than plant. */
const isSecurity = (def: InvestmentDef) => def.cat === 'financial' && def.capex >= 1;

function writeDown(g: GameState, inv: ActiveInvestment, def: InvestmentDef) {
  if (inv.bookValue <= 0) return;
  B.impair(g.company, isSecurity(def) ? 'securities' : 'ppe', inv.bookValue);
  inv.bookValue = 0;
}

export function cancelInvestment(g: GameState, uid: number): ActionResult {
  const c = g.company;
  const inv = c.investments.find((i) => i.uid === uid);
  if (!inv || (inv.state !== 'ramp' && inv.state !== 'active')) return { ok: false, msg: 'Nothing to cancel.' };
  const def = INV[inv.def];
  let msg = `${def.name} stopped.`;
  if (isSecurity(def) && inv.bookValue > 0) {
    const proceeds = inv.bookValue * (def.id === 'treasury' ? 0.99 : 0.6);
    B.sellSecurities(c, inv.bookValue, proceeds);
    msg = `${def.name} sold for ${money(proceeds)}.`;
    inv.bookValue = 0;
  } else if (inv.bookValue > 0) {
    msg += ` ${money(inv.bookValue)} of capitalised spend was written off.`;
    writeDown(g, inv, def);
  }
  inv.state = 'cancelled';
  return { ok: true, msg };
}

/** Pay for due diligence on an investment type: reveals what the pitch left out. */
export function diligenceCost(g: GameState, def: InvestmentDef, scope?: string) {
  return Math.max(8000 * g.macro.cpi, 0.015 * invCost(g, def, scope));
}
export function diligence(g: GameState, defId: string, scope?: string): ActionResult {
  const c = g.company;
  const def = INV[defId];
  if (!def) return { ok: false, msg: 'Unknown investment.' };
  if (c.diligence[defId]) return { ok: false, msg: 'Already investigated.' };
  const cost = diligenceCost(g, def, scope);
  if (cost > c.books.cash) return { ok: false, msg: 'Not enough cash for due diligence.' };
  B.expense(c, 'ga', cost, 'cash');
  c.diligence[defId] = true;
  return { ok: true, msg: def.truth ? 'The report is back — and it is not what the pitch said.' : 'The report is back: the pitch was honest. The risks are the ones you were told about.' };
}

/** License out a staged project in progress: cash now, upside gone. */
export function licenseValue(g: GameState, inv: ActiveInvestment): number {
  const def = INV[inv.def];
  if (!def.stages || inv.state !== 'ramp') return 0;
  let p = 1;
  for (let i = inv.stage; i < def.stages.length; i++) p *= def.stages[i].p;
  return p * inv.upfront * 14 * g.macro.sentiment;
}
export function licenseOut(g: GameState, uid: number): ActionResult {
  const inv = g.company.investments.find((i) => i.uid === uid);
  if (!inv) return { ok: false, msg: 'No such project.' };
  const v = licenseValue(g, inv);
  if (v <= 0) return { ok: false, msg: 'Nothing to license.' };
  B.windfall(g.company, v);
  inv.state = 'done';
  news(g, `${g.company.name} licensed out ${INV[inv.def].name} for ${money(v)}.`, 'good');
  return { ok: true, msg: `Licensed for ${money(v)}. A bigger partner carries the risk — and keeps the upside.` };
}

/** Quarterly step. Returns spend routed through payables (for the working-capital calculation). */
export function stepInvestments(g: GameState): number {
  const c = g.company;
  let ap = 0;
  for (const inv of c.investments) {
    const def = INV[inv.def];
    if (!def || (inv.state !== 'ramp' && inv.state !== 'active')) continue;
    const where = def.scope === 'office' ? ` in ${CITY[c.offices.find((o) => o.id === inv.scope)?.city ?? c.home].name}` : '';
    if (def.scope === 'office' && !c.offices.some((o) => o.id === inv.scope)) {
      inv.state = 'cancelled';
      writeDown(g, inv, def);
      continue;
    }
    if (inv.state === 'ramp') {
      if (def.stages) {
        const st = def.stages[inv.stage];
        const cost = (st.cost * inv.upfront) / st.q;
        B.expense(c, 'rd', cost, 'ap');
        ap += cost;
        g.counters.invested = (g.counters.invested ?? 0) + cost;
        if (--inv.stageLeft <= 0) {
          const p = clamp(st.p * (1 + execBonus(c, 'CTO') * 0.15), 0, 0.97);
          if (chance(g, p)) {
            g.attribution.luck += (1 - p) * cost * st.q;
            if (inv.stage + 1 < def.stages.length) {
              inv.stage++;
              inv.stageLeft = def.stages[inv.stage].q;
              news(g, `${def.name}: ${st.name} succeeded. Next: ${def.stages[inv.stage].name}.`, 'good');
            } else {
              inv.state = 'active';
              inv.age = 0;
              if (def.moonshot) c.moonshots++;
              news(g, `${def.name} is complete. The payoff starts now.`, 'good');
            }
          } else {
            g.attribution.luck -= p * cost * st.q;
            inv.state = 'failed';
            news(g, `${def.name} failed at ${st.name}. Everything spent on it is gone.`, 'bad');
          }
        }
      } else if (--inv.stageLeft <= 0) {
        inv.state = 'active';
        inv.age = 0;
        news(g, `${def.name}${where} is up and running.`, 'good');
      }
      continue;
    }
    // active
    const m = curveMult(def, inv);
    const ongoing = def.ongoing * inv.upfront;
    if (ongoing > 0) {
      B.expense(c, def.cat2, ongoing, 'ap');
      ap += ongoing;
    }
    if (def.fx.income) {
      const inc = def.fx.income * inv.upfront * m;
      if (isSecurity(def)) B.interest(c, -inc * (0.6 + 0.4 * (g.macro.rate / 3)));
      else B.expense(c, def.cat2, -inc, 'cash'); // income booked as a saving on the same line
    }
    if (def.fx.tech) {
      const due = def.fx.tech * m - inv.granted;
      if (due > 0) {
        const k = techInd(g, def, inv);
        c.tech[k] = clamp((c.tech[k] ?? 0) + due, 5, 100);
        inv.granted += due;
      }
    }
    if (inv.bookValue > 0 && !isSecurity(def)) {
      const dep = Math.min(inv.bookValue, (inv.upfront * def.capex) / DEPR_Q);
      B.depreciate(c, dep);
      inv.bookValue -= dep;
    }
    if (def.risk && chance(g, def.risk.p)) {
      news(g, `${def.risk.text}.`, 'bad');
      g.attribution.notes.push({ turn: g.turn, kind: def.trap ? 'strategy' : 'luck', text: `${def.name}: ${def.risk.text}`, value: -inv.upfront });
      const ctx = { office: def.scope === 'office' ? inv.scope : undefined, region: def.scope === 'region' ? (inv.scope as RegionId) : undefined };
      if (def.risk.fx) applyFx(g, def.risk.fx, ctx);
      if (def.risk.event) queueEvent(g, def.risk.event, ctx);
      writeDown(g, inv, def);
      inv.state = 'failed';
      continue;
    }
    if (def.hit && chance(g, def.hit.p)) {
      const pay = def.hit.mult * inv.upfront;
      if (isSecurity(def)) B.sellSecurities(c, inv.bookValue, pay);
      else B.windfall(c, pay);
      inv.bookValue = 0;
      inv.state = 'done';
      g.attribution.luck += pay * (1 - def.hit.p * 8);
      news(g, `${def.hit.text}: ${money(pay)} in.`, 'good');
      continue;
    }
    inv.age++;
    if (def.life > 0 && inv.age >= def.life && def.curve !== 'backloaded') {
      if (isSecurity(def) && inv.bookValue > 0) B.sellSecurities(c, inv.bookValue, inv.bookValue * 0.5);
      inv.bookValue = 0;
      inv.state = 'done';
    }
  }
  c.investments = c.investments.filter((i) => i.state === 'ramp' || i.state === 'active' || g.turn - i.start < 60).slice(-80);
  return ap;
}

/** Plain-language list of what an investment does at full effect. */
export function fxSummary(def: InvestmentDef): string[] {
  const f = def.fx;
  const s = (n: number, unit = '%') => `${n > 0 ? '+' : '−'}${Math.abs(n)}${unit}`;
  const out: string[] = [];
  if (f.prod) out.push(`${s(f.prod)} operations productivity`);
  if (f.capacity) out.push(`${s(f.capacity)} capacity`);
  if (f.demand) out.push(`${s(f.demand)} pull with customers`);
  if (f.quality) out.push(`${s(f.quality, '')} quality`);
  if (f.tech) out.push(`${s(f.tech, '')} technology`);
  if (f.inputCost) out.push(`${s(f.inputCost)} input costs`);
  if (f.wageCost) out.push(`${s(f.wageCost)} wage costs`);
  if (f.salesEff) out.push(`${s(f.salesEff)} sales effectiveness`);
  if (f.rdEff) out.push(`${s(f.rdEff)} R&D effectiveness`);
  if (f.attrition) out.push(`${s(f.attrition)} attrition`);
  if (f.hirePool) out.push(`${s(f.hirePool)} hiring pool`);
  if (f.morale) out.push(`${s(f.morale, '')} morale`);
  if (f.brand) out.push(`${s(f.brand, '')} brand a quarter`);
  if (f.regionBrand) out.push(`${s(f.regionBrand, '')} regional brand a quarter`);
  if (f.culture) out.push(`${s(f.culture, '')} culture a quarter`);
  if (f.skill) out.push(`${s(f.skill, '')} skill a quarter`);
  if (f.rep) out.push(`${s(f.rep, '')} reputation a quarter`);
  if (f.esg) out.push(`${s(f.esg, '')} ESG a quarter`);
  if (f.loyalty) out.push(`${s(f.loyalty, '')} key-person loyalty a quarter`);
  if (f.income) out.push(`${(f.income * 400).toFixed(1)}% a year in income or savings`);
  if (f.tax) out.push(`${s(f.tax)} tax bill`);
  if (f.intel) out.push('full visibility of rivals');
  if (def.hit) out.push(`${(def.hit.p * 100).toFixed(1)}% chance a quarter of a ${def.hit.mult}× payout`);
  return out;
}
