// Modifiers: temporary effects from events, and standing effects from active investments.
import { POLICY } from './policyData';
import { CITY, INV } from './content';
import type { ActiveInvestment, GameState, InvFx, InvestmentDef, Office, RegionId, TempMod } from './types';

/** Fraction (0..1) of an investment's full effect delivered at its current age. */
export function curveMult(def: InvestmentDef, inv: ActiveInvestment): number {
  if (inv.state !== 'active') return 0;
  const t = inv.age;
  switch (def.curve) {
    case 'steady':
    case 'risky':
      return Math.min(1, (t + 1) / 2);
    case 'backloaded': {
      const n = def.life || 8;
      return Math.min(1, ((t + 1) / n) ** 2);
    }
    case 'decaying':
      return Math.exp((-3 * t) / Math.max(1, def.life));
  }
}

/** Sum of an investment effect across everything in scope for this office/region (corporate always counts). */
export function invSum(g: GameState, key: keyof InvFx, o?: Office, region?: RegionId): number {
  let s = 0;
  const reg = region ?? (o ? CITY[o.city].region : undefined);
  for (const inv of g.company.investments) {
    if (inv.state !== 'active') continue;
    const def = INV[inv.def];
    const v = def?.fx[key];
    if (!v) continue;
    if (def.scope === 'office' && (!o || inv.scope !== o.id)) continue;
    if (def.scope === 'region' && inv.scope !== reg) continue;
    if (def.inds && o && !def.inds.includes(o.ind)) continue;
    s += v * curveMult(def, inv);
  }
  for (const id of g.company.policies ?? []) s += POLICY[id]?.fx[key] ?? 0; // company policies apply everywhere
  return s;
}

/** Product of temporary modifiers of a kind that apply to this office (or company-wide if none given). */
export function tempMod(g: GameState, kind: TempMod['kind'], o?: Office): number {
  let m = 1;
  for (const t of g.mods) {
    if (t.kind !== kind || t.until < g.turn) continue;
    if (t.office && (!o || t.office !== o.id)) continue;
    if (t.region && (!o || CITY[o.city].region !== t.region)) continue;
    if (t.ind && (!o || o.ind !== t.ind)) continue;
    m *= 1 + t.pct / 100;
  }
  return Math.max(0.05, m);
}

export function addMod(g: GameState, m: Omit<TempMod, 'until'> & { quarters: number }) {
  const { quarters, ...rest } = m;
  g.mods.push({ ...rest, until: g.turn + Math.max(1, quarters) - 1 });
}

export function hasFlag(g: GameState, name: string): boolean {
  if ((g.flags[name] ?? -1) >= g.turn) return true;
  return g.company.investments.some((i) => i.state === 'active' && INV[i.def]?.flag === name);
}
export function setFlag(g: GameState, name: string, quarters?: number) {
  g.flags[name] = quarters ? g.turn + quarters - 1 : 9999; // inclusive, as in addMod: `quarters` quarters counting this one
}

export function news(g: GameState, text: string, tone: GameState['news'][number]['tone'] = 'info') {
  g.news.push({ turn: g.turn, text, tone });
  if (g.news.length > 80) g.news.splice(0, g.news.length - 80);
}
