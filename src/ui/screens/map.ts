// The board: a stylised world drawn in SVG, with fog over cities you have not studied.
import {
  CITIES, CITY, INDUSTRIES, REGIONS, assetFinanceLTV, localPrice, marketUnits, money, openOffice, openOfficeCost, openOfficeFinancing, pct, scout, scoutCost,
  type CityDef, type GameState, type IndustryId,
} from '@engine';
import { $, N, esc } from '../kit';
import { act, afterRender, on, render, ui } from '../store';
import { screens } from '../shell';
import { sfx } from '../../audio';

/** Smooth closed outline through a few points (Catmull-Rom → Bézier). */
function blob(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(0)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(0)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(0)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(0)} ${p2[0]},${p2[1]}`;
  }
  return d + 'Z';
}
const LAND: [number, number][][] = [
  [[40, 120], [120, 58], [260, 46], [390, 52], [452, 104], [428, 200], [366, 252], [300, 272], [244, 330], [204, 398], [150, 404], [116, 340], [66, 262], [36, 190]],
  [[268, 402], [340, 386], [412, 432], [402, 502], [352, 546], [308, 520], [278, 462]],
  [[438, 104], [480, 58], [560, 30], [652, 58], [684, 120], [642, 172], [560, 166], [500, 172], [452, 152]],
  [[448, 252], [520, 224], [600, 240], [632, 300], [610, 382], [570, 462], [520, 476], [488, 402], [452, 332]],
  [[640, 200], [700, 118], [800, 78], [880, 108], [902, 200], [882, 282], [852, 332], [832, 424], [790, 434], [770, 362], [740, 384], [700, 334], [690, 296], [642, 306], [618, 252]],
  [[904, 128], [946, 138], [958, 192], [926, 218], [898, 180]],
  [[858, 450], [920, 430], [986, 456], [980, 516], [920, 536], [868, 510]],
];
const LAND_PATHS = LAND.map(blob);
const LABELS: [string, number, number][] = [['Atlantic America', 300, 34], ['Central & Pacific America', 16, 96], ['Latin America', 52, 478], ['Europe', 560, 20], ['Middle East & Africa', 600, 500], ['Asia-Pacific', 760, 58]];

export const mapOverlays: ((g: GameState, c: CityDef, r: number) => string)[] = [];
export const cityExtras: ((g: GameState, c: CityDef) => string)[] = [];

const marketValue = (g: GameState, city: string, ind: IndustryId) => marketUnits(g, city, ind) * localPrice(g, city, ind);

function mapSvg(g: GameState): string {
  const c = g.company;
  const tokens = CITIES.map((ct) => {
    const lvl = g.discovered[ct.id] ?? 0;
    const mine = c.offices.some((o) => o.city === ct.id);
    const r = 9 + 2.2 * Math.sqrt(ct.pop * ct.income);
    const sel = ui.sel.city === ct.id;
    const studying = g.scouting.some((s) => s.city === ct.id);
    let body: string;
    if (lvl === 0) body = `<circle r="${r + 20}" fill="url(#fog)" opacity=".9"/><circle r="${r}" fill="var(--paper)" stroke="var(--ink2)" stroke-width="2" stroke-dasharray="4 4"/><text y="6" text-anchor="middle" style="font:700 17px var(--serif);stroke:none">${studying ? '…' : '?'}</text>`;
    else if (mine) body = `<circle r="${r}" fill="var(--ink)" stroke="var(--ink)" stroke-width="2"/><circle r="${Math.max(4, r * 0.42)}" fill="var(--hi)" stroke="var(--ink)" stroke-width="1.5"/>`;
    else body = `<circle r="${r}" fill="var(--sheet)" stroke="var(--ink)" stroke-width="2"/>`;
    return `<g class="city" data-a="city" data-id="${ct.id}" transform="translate(${ct.x},${ct.y})" role="button" aria-label="${esc(ct.name)}">
      ${sel ? `<circle r="${r + 7}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>` : ''}${body}${mapOverlays.map((f) => f(g, ct, r)).join('')}
      <text y="${r + 18}" text-anchor="middle">${esc(ct.name)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 1000 560" role="img" aria-label="World map">
    <defs><pattern id="fog" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink2)" stroke-width="1.6"/></pattern></defs>
    ${LAND_PATHS.map((d) => `<path d="${d}" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5"/>`).join('')}
    ${LABELS.map(([t, x, y]) => `<text x="${x}" y="${y}" style="font:italic 600 15px var(--serif);fill:var(--ink2)">${t}</text>`).join('')}
    ${tokens}</svg>`;
}

function citySheet(g: GameState): string {
  const c = g.company;
  const ct = CITY[ui.sel.city ?? ''] ?? CITY[c.home];
  const lvl = g.discovered[ct.id] ?? 0;
  const head = `<div class="spread"><h2 style="margin-top:0">${esc(ct.name)}</h2><span class="chip">${esc(REGIONS[ct.region].name)}</span></div>`;
  if (lvl === 0) {
    const studying = g.scouting.some((s) => s.city === ct.id);
    return `<div class="sheet">${head}<p>${esc(REGIONS[ct.region].blurb)} Beyond that, you only have rumours about ${esc(ct.name)}.</p>
      ${studying ? '<div class="note"><b>Market study under way.</b><p>Results arrive next quarter.</p></div>' : `<button class="btn primary" data-a="scout" data-id="${ct.id}">Commission a market study for ${money(scoutCost(g, ct.id))}</button>
      <p class="small muted">Takes one quarter. Reveals costs, talent and market size, and lets you open an office here.</p>`}</div>`;
  }
  const rate = (x: number) => `${Math.round(x * 100)}%`;
  const facts = `<div class="kv">
    <div>People</div><div>${N(ct.pop.toFixed(1) + 'M', 'Population', 'People in the metro area. More people, more customers and a deeper hiring pool.', [['Growth per year', ct.growth.toFixed(1) + '%']])}</div>
    <div>Income per head</div><div>${N(rate(ct.income), 'Income', 'Spending power relative to a reference city. Market size scales with population × income.')}</div>
    <div>Wages</div><div>${N(rate(ct.wage), 'Wage index', 'What people cost here relative to a reference city. Local-service prices (restaurants, consulting) follow wages; tradable goods mostly do not.', undefined, ['opex'])}</div>
    <div>Rent</div><div>${N(rate(ct.rent), 'Rent index', 'Office and site costs relative to a reference city.')}</div>
    <div>Corporate tax</div><div>${N(rate(ct.tax), 'Tax rate', 'Your effective tax rate is the revenue-weighted average of the cities you sell in.')}</div>
    <div>Regulation</div><div>${N(ct.reg > 0.6 ? 'Heavy' : ct.reg > 0.4 ? 'Moderate' : 'Light', 'Regulation', 'Heavy regulation protects local incumbents, raises set-up costs and makes layoffs expensive.', [['Severance, quarters of pay', (0.5 + 1.5 * ct.reg).toFixed(1)]])}</div>
    <div>Talent</div><div>${N(`${ct.talent} deep, skill ${ct.talentQ}`, 'Talent', 'Depth is how many people you can hire per quarter; skill is how good the average hire is.')}</div>
    <div>Stability</div><div>${N(ct.risk > 0.3 ? 'Volatile' : ct.risk > 0.12 ? 'Some risk' : 'Stable', 'Stability', 'Volatile places see more shocks: currency swings, strikes, sudden rule changes.')}</div></div>`;
  const markets = `<table class="ledger"><thead><tr><th>Market</th><th class="num">Size a quarter</th><th class="num">Your share</th><th></th></tr></thead><tbody>${c.divisions.map((k) => {
    const o = c.offices.find((x) => x.city === ct.id && x.ind === k);
    const cost = openOfficeCost(g, ct.id, k);
    const fit = ct.ind[k];
    return `<tr><td><b>${INDUSTRIES[k].short}</b><br><span class="small muted">${fit >= 1.5 ? 'Excellent' : fit >= 1.1 ? 'Good' : fit >= 0.8 ? 'Average' : 'Thin'} fit</span></td>
      <td class="num">${$(marketValue(g, ct.id, k), 'Market size', 'Everything customers in this city spend on this industry in a quarter, at today’s prices. It moves with the economy, the city’s growth and the industry’s long-run trend.', [['City fit for the industry', fit.toFixed(1) + '×'], ['Strength of local incumbents', (g.mk[`${ct.id}:${k}`]?.f ?? INDUSTRIES[k].fringe).toFixed(1)]], ['marketShare'])}</td>
      <td class="num">${o ? pct(o.share, 2) : '—'}</td>
      <td>${o ? `<button class="btn sm" data-a="office" data-id="${o.id}">Manage</button>` : c.franchises?.some((f) => f.city === ct.id && f.ind === k) ? '<span class="small muted">A franchisee runs your stores here</span>' : `<button class="btn sm primary" data-a="openOffice" data-id="${ct.id}" data-ind="${k}">Open for ${money(cost.total)}</button>${cost.capex > 0 ? ` <button class="btn sm" data-a="openOfficeFin" data-id="${ct.id}" data-ind="${k}" title="Lenders fund ${Math.round(assetFinanceLTV(k) * 100)}% of the plant, for a 1% arrangement fee">Finance the plant: ${money(cost.total - openOfficeFinancing(g, ct.id, k))} of your own</button>` : ''}`}</td></tr>`;
  }).join('')}</tbody></table>`;
  return `<div class="sheet">${head}<p>${esc(ct.blurb)}</p>${facts}<h3>Markets</h3><div class="scrollx">${markets}</div>${cityExtras.map((f) => f(g, ct)).join('')}</div>`;
}

screens.map = (g) => {
  const known = CITIES.filter((ct) => (g.discovered[ct.id] ?? 0) > 0).length;
  return `<div class="spread"><h1>World</h1><span class="muted small">${known} of ${CITIES.length} cities explored</span></div>
    <div class="mapwrap">${mapSvg(g)}</div>
    <div class="legend" style="margin:8px 0 14px"><span><i style="background:var(--ink);height:10px;width:10px;border-radius:50%"></i>Your office</span><span><i style="background:var(--sheet);border:1.5px solid var(--ink);height:10px;width:10px;border-radius:50%"></i>Explored</span><span><i style="border:1.5px dashed var(--ink2);height:10px;width:10px;border-radius:50%;background:none"></i>Unexplored</span><span>Circle size shows market size</span></div>
    ${citySheet(g)}`;
};

on('city', (d) => {
  ui.sel.city = d.id;
  sfx.tap();
  render();
});
on('scout', (d) => void act(scout(ui.g!, d.id!), sfx.research));
on('openOffice', (d) => void act(openOffice(ui.g!, d.id!, d.ind as IndustryId), sfx.milestone));
on('openOfficeFin', (d) => void act(openOffice(ui.g!, d.id!, d.ind as IndustryId, true), sfx.milestone));

// On phones the board is wider than the screen: keep the selected city in view.
let centred = '';
afterRender(() => {
  const wrap = document.querySelector<HTMLElement>('.mapwrap');
  if (!wrap || !ui.g) { centred = ''; return; }
  const id = ui.sel.city ?? ui.g.company.home;
  if (centred === id) return;
  centred = id;
  const svg = wrap.querySelector('svg')!;
  wrap.scrollLeft = (CITY[id].x / 1000) * svg.clientWidth - wrap.clientWidth / 2;
});
