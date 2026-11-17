// The macro layer: business cycle, inflation, interest rates, credit, input prices,
// regional cycles and currencies. Small and stylised, but the causal chain is the real one:
// overheating → inflation → rate hikes → slowdown → cuts → recovery.
import { CITIES, CITY, IND_LIST, INDUSTRIES, REGION_LIST } from './content';
import { DIFF } from './difficulty';
import { news } from './mods';
import type { FxZone, GameState, IndustryId, Macro, RegionId } from './types';
import { chance, clamp, normal, randInt } from './util';

const FX_VOL: Record<FxZone, number> = { nae: 0, naw: 0, latam: 0.045, europe: 0.02, mea: 0.035, apac: 0.022, cad: 0.018 };
export const FX_ZONES = Object.keys(FX_VOL) as FxZone[];

export function newMacro(): Macro {
  const rec = <T>(v: () => T) => Object.fromEntries((['nae', 'naw', 'latam', 'europe', 'mea', 'apac'] as RegionId[]).map((r) => [r, v()])) as Record<RegionId, T>;
  return {
    gap: 0.5, growth: 2.4, infl: 2.2, rate: 3.0, spread: 1.2, sentiment: 1.0, cpi: 1, wageIdx: 1, commodity: 1, energy: 1, cloud: 1, labor: 1.02, prodIdx: 1,
    phase: 'expansion', recessionLeft: 0, shock: { gap: 0, infl: 0, rate: 0 },
    indIdx: Object.fromEntries(IND_LIST.map((i) => [i.id, 1])) as Record<IndustryId, number>,
    regionGap: rec(() => 0), fx: { ...rec(() => 1), cad: 1 }, hist: [],
  };
}

export function stepMacro(g: GameState) {
  const m = g.macro;
  const calm = g.settings.sandbox.calmMacro;
  const prevGap = m.gap;
  const prevPhase = m.phase;

  // Recessions arrive more often when the economy is overheated or money is tight.
  if (m.recessionLeft > 0) {
    m.gap -= 1.0;
    m.recessionLeft--;
  } else if (!calm && g.turn > 5) {
    const real = m.rate - m.infl;
    const p = (0.016 + Math.max(0, m.gap - 1.5) * 0.012 + Math.max(0, real - 2.5) * 0.012) * DIFF[g.difficulty].recession;
    if (chance(g, p)) {
      m.recessionLeft = randInt(g, 2, 4);
      m.gap -= 1.6;
      news(g, 'Leading indicators have turned sharply down. Economists are using the word "recession".', 'macro');
    }
  }
  const real = m.rate - m.infl;
  m.gap = 0.88 * m.gap + (calm ? 0 : normal(g, 0, 0.45)) - 0.08 * (real - 0.5) + 0.1 + m.shock.gap;
  m.gap = clamp(m.gap, -9, 6);
  m.infl = clamp(m.infl + 0.06 * m.gap + 0.08 * (2 - m.infl) + (calm ? 0 : normal(g, 0, 0.18)) + m.shock.infl, -1, 14);
  const target = clamp(2.5 + 1.5 * (m.infl - 2) + 0.6 * m.gap, 0, 14);
  m.rate = clamp(Math.round((m.rate + 0.3 * (target - m.rate) + m.shock.rate) * 20) / 20, 0, 16);
  m.shock = { gap: 0, infl: 0, rate: 0 };

  const spreadT = clamp(1.2 - 0.35 * m.gap + (m.recessionLeft > 0 ? 1.5 : 0), 0.5, 8);
  m.spread += 0.5 * (spreadT - m.spread);
  // (interest rates also act on valuations directly, through the multiple: see valueCompany)
  const sentT = clamp(1 + 0.06 * m.gap - 0.02 * (m.rate - 3), 0.45, 1.7);
  m.sentiment = clamp(m.sentiment + 0.4 * (sentT - m.sentiment) + (calm ? 0 : normal(g, 0, 0.03)), 0.4, 1.8);
  m.labor = clamp(1 + 0.05 * m.gap, 0.7, 1.35);
  m.growth = 2.2 + 4 * (m.gap - prevGap);

  // Price levels.
  m.cpi *= 1 + m.infl / 400;
  m.wageIdx *= 1 + Math.max(-1, m.infl + 0.8 + 0.4 * m.gap) / 400;
  m.prodIdx = (m.prodIdx ?? 1) * (1 + 0.8 / 400); // productivity keeps pace with real wages over the long run
  const noise = (sd: number) => (calm ? 0 : normal(g, 0, sd));
  const realC = m.commodity / (m.cpi / (1 + m.infl / 400));
  m.commodity = clamp(realC + 0.08 * (1 - realC) + 0.012 * m.gap + noise(0.035), 0.45, 2.6) * m.cpi;
  const realE = m.energy / (m.cpi / (1 + m.infl / 400));
  m.energy = clamp(realE + 0.06 * (1 - realE) + 0.015 * m.gap + noise(0.06), 0.4, 3.2) * m.cpi;
  m.cloud *= (1 + m.infl / 400) * 0.992;

  // Secular industry trends (fast-growing sectors mature over time).
  for (const d of IND_LIST) m.indIdx[d.id] *= 1 + (d.trend * Math.max(0.4, 1 - g.turn / 160)) / 4;

  // Regional cycles and currencies.
  for (const r of REGION_LIST) {
    m.regionGap[r] = clamp(0.8 * m.regionGap[r] + noise(0.35), -6, 4);
  }
  for (const z of FX_ZONES) if (FX_VOL[z] > 0) m.fx[z] = clamp((m.fx[z] ?? 1) + 0.05 * (1 - (m.fx[z] ?? 1)) + noise(FX_VOL[z]), 0.4, 1.6);
  for (const c of CITIES) g.cityIdx[c.id] *= 1 + (c.growth + 0.25 * (m.gap + m.regionGap[c.region])) / 400;
  for (const k of Object.keys(g.mk)) g.mk[k].s = clamp(1 + 0.85 * (g.mk[k].s - 1) + noise(0.012), 0.6, 1.5);

  m.phase = m.recessionLeft > 0 || m.gap < -2 ? 'recession' : m.gap < -0.5 ? (m.gap > prevGap ? 'recovery' : 'slowdown') : m.gap > 2 ? 'boom' : 'expansion';
  if (m.phase !== prevPhase) {
    const txt: Record<Macro['phase'], string> = {
      recession: 'The economy is in recession. Demand is falling, lenders are nervous.',
      recovery: 'The economy is recovering. Demand is climbing back from the bottom.',
      slowdown: 'Growth is slowing. Order books are getting thinner.',
      boom: 'The economy is booming. Demand is strong — and so is wage pressure.',
      expansion: 'The economy is back to steady expansion.',
    };
    news(g, txt[m.phase], 'macro');
  }
  m.hist.push({ gap: m.gap, infl: m.infl, rate: m.rate, sentiment: m.sentiment });
  if (m.hist.length > 48) m.hist.shift();
}

/** Demand multiplier from the business cycle for an industry in a region. */
export function cycleMult(g: GameState, ind: IndustryId, region: RegionId): number {
  return clamp(1 + INDUSTRIES[ind].cyc * (g.macro.gap + g.macro.regionGap[region]) * 0.035, 0.5, 1.5);
}

/** Nominal input-cost index for an industry's variable costs. */
export function inputIndex(g: GameState, ind: IndustryId): number {
  const m = g.macro;
  switch (INDUSTRIES[ind].inputKey) {
    case 'commodity': return m.commodity;
    case 'energy': return 0.5 * m.energy + 0.5 * m.cpi;
    case 'cloud': return m.cloud;
    default: return m.cpi;
  }
}

/** Value of a city's local currency in the reporting currency. */
export const fxOf = (g: GameState, city: string) => g.macro.fx[CITY[city].fx ?? CITY[city].region] ?? 1;
