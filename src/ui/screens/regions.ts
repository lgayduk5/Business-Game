// Regions: pricing, marketing, supply chain and partners for everything you run in a region.
import {
  CITY, INDUSTRIES, PARTNER, REGIONS, REGION_LIST, endPartner, money, partnerCost, setSupply, signPartner,
  type GameState, type RegionId, type SupplyMode,
} from '@engine';
import { $, N, esc, explain, seg, slider, type Row } from '../kit';
import { act, on, ui } from '../store';
import { opsTabs, opsViews } from './ops';
import { sfx } from '../../audio';

export const regionExtras: ((g: GameState, r: RegionId) => string)[] = [];

function regions(g: GameState): string {
  const c = g.company;
  const present = REGION_LIST.filter((r) => c.offices.some((o) => CITY[o.city].region === r));
  const absent = REGION_LIST.filter((r) => !present.includes(r));
  const one = (r: RegionId) => {
    const offs = c.offices.filter((o) => CITY[o.city].region === r);
    const pol = c.policy[r];
    const rev = offs.reduce((s, o) => s + (o.last?.revenue ?? 0), 0);
    const contrib = offs.reduce((s, o) => s + (o.last?.contribution ?? 0), 0);
    const inds = [...new Set(offs.map((o) => o.ind))];
    const hasPartner = pol.partner && pol.partner.until >= g.turn;
    const materials = inds.some((k) => INDUSTRIES[k].varCost > 0.2);
    return `<div class="sheet"><div class="spread"><h2 style="margin-top:0">${esc(REGIONS[r].name)}</h2><span class="muted small">${offs.map((o) => CITY[o.city].name).join(', ')}</span></div>
      <div class="kv">
        <div>Revenue <span class="sub">last quarter</span></div><div>${$(rev, 'Regional revenue', 'Sales from every office in the region.', offs.map((o): Row => [o.name, money(o.last?.revenue ?? 0)]))}</div>
        <div>Contribution</div><div>${$(contrib, 'Regional contribution', 'Revenue less the offices’ own costs, before corporate overhead.', offs.map((o): Row => [o.name, money(o.last?.contribution ?? 0)]), ['contribution'])}</div>
        <div>Brand</div><div>${N(c.regionBrand[r].toFixed(0), 'Regional brand', 'How well known you are here, 0–100. Marketing and market share build it; it fades about 3.5% a quarter.', [['Company-wide brand', c.brand.toFixed(0)]], ['brand'])}</div>
        <div>Currency</div><div>${N(g.macro.fx[r].toFixed(2), 'Exchange rate', 'Value of the local currency against your reporting currency (1.00 at the start). Local revenue and local costs both move with it, so what moves is the dollar value of your margin.', undefined, ['fxRisk'])}</div>
      </div>
      <h3>Price</h3>
      ${inds.map((k) => slider({ label: `${INDUSTRIES[k].short} price vs market`, act: 'price', attrs: `data-region="${r}" data-ind="${k}"`, min: 0.6, max: 1.6, step: 0.02, value: pol.price[k] ?? 1, fmt: 'pct',
        tipBody: explain('Price position', `Relative to the going rate, which follows inflation on its own. Elasticity here is about ${INDUSTRIES[k].elast}: each 10% of premium costs roughly ${(INDUSTRIES[k].elast * 10).toFixed(0)}% of your pull with customers.`, undefined, ['elasticity', 'pricingPower']) })).join('')}
      <h3>Marketing</h3>
      ${slider({ label: 'Budget per quarter', act: 'marketing', attrs: `data-region="${r}"`, min: 0, max: Math.max(200_000, Math.round((rev * 0.6) / 10_000) * 10_000), step: 5000, value: pol.marketing, fmt: 'money', help: 'Split across the region’s offices by market size. Builds brand over time.' })}
      ${materials ? `<h3>Supply chain</h3>${seg('supply', [['lean', 'Lean'], ['balanced', 'Balanced'], ['resilient', 'Resilient']], pol.supply, `data-region="${r}"`)}
        <p class="small muted">${{ lean: 'Single-sourced and just-in-time: inputs cost 6% less, quality is a touch lower, and every disruption hits harder.', balanced: 'A sensible mix of cost and safety.', resilient: 'Dual-sourced with buffer stock: inputs cost 5% more, quality is better and disruptions mostly pass you by.' }[pol.supply]}</p>` : ''}
      <h3>Local partner</h3>
      ${hasPartner ? `<p>${esc(pol.partner!.name)} distributes for you until ${pol.partner!.until - g.turn + 1} quarters from now: +${pol.partner!.boost * 100}% presence for ${pol.partner!.fee * 100}% of sales. <button class="linkish" data-a="endPartner" data-region="${r}">End it</button></p>`
        : `<p class="small muted">A local distributor gets you accepted faster: +${PARTNER.boost * 100}% presence for two years, for ${PARTNER.fee * 100}% of regional sales.</p><button class="btn sm" data-a="signPartner" data-region="${r}">Sign a partner for ${money(partnerCost(g))}</button>`}
      ${regionExtras.map((f) => f(g, r)).join('')}
    </div>`;
  };
  return `<h1>Regions</h1><p class="muted">Decisions here apply to every office in the region.</p>
    <div class="grid2">${present.map(one).join('')}</div>
    ${absent.length ? `<p class="muted small" style="margin-top:14px">No offices yet in ${absent.map((r) => REGIONS[r].name).join(', ')}. Open one from the map.</p>` : ''}`;
}
opsTabs.push(['regions', 'Regions']);
opsViews.regions = regions;

on('supply', (d) => void act(setSupply(ui.g!, d.region as RegionId, d.v as SupplyMode)));
on('signPartner', (d) => void act(signPartner(ui.g!, d.region as RegionId), sfx.good));
on('endPartner', (d) => void act(endPartner(ui.g!, d.region as RegionId)));

// (price and marketing handlers are registered in ops.ts)
