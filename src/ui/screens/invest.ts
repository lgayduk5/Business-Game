// Investments and deals: the catalogue, what is running, and businesses for sale.
import {
  stageQ, CITY, INDUSTRIES, INV, REGIONS, acquireTarget, cancelInvestment, catalog, curveMult, diligence, diligenceCost, diligenceTarget, fxSummary, invAvailable, invCost,
  licenseOut, licenseValue, money, pct, stagedTotal, startInvestment, targetDiligenceCost,
  type ActiveInvestment, type GameState, type InvestmentDef, type Office, type RegionId,
} from '@engine';
import { $, N, esc, explain, spark, tip, type Row } from '../kit';
import { act, on, ui } from '../store';
import { corpTabs, corpViews } from './corp';
import { opsExtras } from './ops';
import { regionExtras } from './regions';
import { sfx } from '../../audio';

const CATS: [string, string][] = [['rd', 'Research'], ['brand', 'Brand and customers'], ['people', 'People'], ['training', 'People'], ['systems', 'Systems and risk'], ['supply', 'Supply chain'], ['automation', 'Plant'], ['office', 'Property'], ['esg', 'Sustainability'], ['financial', 'Treasury']];
const CURVE: Record<string, [string, number[], string]> = {
  steady: ['Steady', [0, 0.5, 1, 1, 1, 1, 1], 'Full effect soon after it starts, for as long as you keep paying for it.'],
  backloaded: ['Back-loaded', [0, 0.02, 0.08, 0.2, 0.4, 0.7, 1], 'Little at first, most of the benefit at the end. Patience required; cancelling early wastes nearly everything.'],
  decaying: ['Decaying', [1, 0.6, 0.37, 0.22, 0.13, 0.08, 0.05], 'Strongest on day one, fading from there. Has to be repeated to be sustained.'],
  risky: ['Risky', [0, 0, 0, 1, 0, 0, 0], 'Usually nothing; occasionally a lot. Judge it by expected value and by whether you can afford to lose the stake.'],
};

function card(g: GameState, def: InvestmentDef, scope?: string): string {
  const c = g.company;
  const cost = invCost(g, def, scope);
  const av = invAvailable(g, def, scope);
  const known = !!c.diligence[def.id];
  const cv: [string, number[], string] = def.stages ? ['Staged', [0, 0, 0.1, 0.1, 0.1, 1, 1], 'Paid for in stages, each with a gate that can fail. Nothing comes back until the last gate is passed — but you can stop at any gate and keep what you have not yet spent.'] : CURVE[def.curve];
  const fx = fxSummary(def);
  const costRows: Row[] = def.stages
    ? [...def.stages.map((s): Row => [`${s.name}: ${stageQ(g, s)} quarters, ${pct(s.p)} to pass`, money(s.cost * cost)]), ['If every stage is funded', money(stagedTotal(def) * cost), true], ['Chance of reaching the end', pct(def.stages.reduce((p, s) => p * s.p, 1))]]
    : [['Up front', money(cost)], ['Of which capitalised', pct(def.capex)], ['Then per quarter', money(def.ongoing * cost)], ['Starts paying after', `${def.ramp} quarters`]];
  const risk = def.risk ? (known ? def.risk.p : def.risk.shownP) : 0;
  return `<div class="sheet"><div class="spread"><h3 style="margin:0">${esc(def.name)}</h3>${tip(`${cv[0]} ${spark(cv[1])}`, explain(`${cv[0]} payoff`, cv[2]), 'plain')}</div>
    <p class="small" style="margin:6px 0">${esc(def.desc)} <span class="muted">${esc(def.pitch)}</span></p>
    ${fx.length ? `<p class="small" style="margin:6px 0"><b>${fx.map(esc).join(', ')}.</b></p>` : ''}
    <p class="small muted" style="margin:6px 0">${def.stages ? `Staged: ${$(stagedTotal(def) * cost, def.name, 'Paid stage by stage. Each gate can fail; you can stop at any time and lose only what is spent.', costRows, ['sunkCost', 'realOption'])} over ${def.stages.reduce((s, x) => s + stageQ(g, x), 0)} quarters${g.rules?.sprint ? ' (half the usual time: this is a Sprint)' : ''}`
      : `${$(cost, def.name, 'The larger of a minimum cost and a share of the revenue it applies to.', costRows, ['capex', 'opex'])}${def.ongoing ? ` then ${money(def.ongoing * cost)} a quarter` : ''}`}${def.risk ? `, ${N(pct(risk, 1) + ' failure risk a quarter', 'Risk', known ? 'What due diligence found.' : 'This is what you have been told. Due diligence would tell you whether it is true.', undefined, ['dueDiligence'])}` : ''}.</p>
    ${known && def.truth ? `<div class="note bad"><b>Due diligence found</b><p>${esc(def.truth)}</p></div>` : ''}
    ${known && !def.truth && (def.risk || def.trap) ? `<p class="small pos">Due diligence: the pitch is honest.</p>` : ''}
    <div class="row"><button class="btn sm primary" data-a="invest" data-id="${def.id}" data-scope="${scope ?? ''}" ${av.ok ? '' : 'disabled'}>${av.ok ? 'Fund' : esc(av.why)}</button>
    ${!known && av.ok ? `<button class="btn sm" data-a="dd" data-id="${def.id}" data-scope="${scope ?? ''}">Due diligence, ${money(diligenceCost(g, def, scope))}</button>` : ''}</div></div>`;
}

function running(g: GameState, list: ActiveInvestment[]): string {
  if (!list.length) return '';
  const c = g.company;
  return `<div class="scrollx"><table class="ledger"><thead><tr><th>Investment</th><th>Status</th><th class="num">Cost a quarter</th><th></th></tr></thead><tbody>${list.map((inv) => {
    const def = INV[inv.def];
    const where = def.scope === 'office' ? CITY[c.offices.find((o) => o.id === inv.scope)?.city ?? c.home].name : def.scope === 'region' ? REGIONS[inv.scope as RegionId].short : '';
    let status: string, per = def.ongoing * inv.upfront;
    if (inv.state === 'ramp' && def.stages) {
      const st = def.stages[inv.stage];
      status = `${st.name}, ${inv.stageLeft} quarter${inv.stageLeft === 1 ? '' : 's'} left, ${pct(st.p)} to pass`;
      per = (st.cost * inv.upfront) / stageQ(g, st);
    } else if (inv.state === 'ramp') {
      status = `Starting up, ${inv.stageLeft} quarter${inv.stageLeft === 1 ? '' : 's'} to go`;
      per = 0; // the running cost starts once it is up and running
    } else status = `Delivering ${pct(curveMult(def, inv))} of full effect`;
    const lic = licenseValue(g, inv);
    return `<tr><td><b>${esc(def.name)}</b>${where ? `<br><span class="small muted">${esc(where)}</span>` : ''}</td><td class="small">${status}</td><td class="num">${money(per)}</td>
      <td class="nowrap">${lic > 0 && def.inds?.includes('biotech') ? `<button class="btn sm" data-a="license" data-uid="${inv.uid}">License out, ${money(lic)}</button> ` : ''}<button class="linkish small" data-a="cancelInv" data-uid="${inv.uid}">Stop</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function invest(g: GameState): string {
  const live = g.company.investments.filter((i) => i.state === 'ramp' || i.state === 'active');
  const defs = catalog(g, 'corp');
  const groups = [...new Set(CATS.map(([, n]) => n))].map((name) => {
    const ds = defs.filter((d) => CATS.find(([k]) => k === d.cat)?.[1] === name);
    return ds.length ? `<h2>${name}</h2><div class="grid2">${ds.map((d) => card(g, d)).join('')}</div>` : '';
  }).join('');
  const past = g.company.investments.filter((i) => i.state === 'failed' || i.state === 'done').slice(-5);
  return `<h1>Investments</h1><p class="muted">Each has a cost now, a wait, and a payoff shape. Some are not what they seem — due diligence is cheap.</p>
    ${live.length ? `<div class="sheet"><h2>Running</h2>${running(g, live)}</div>` : ''}
    ${past.length ? `<p class="small muted">Recently ended: ${past.map((i) => `${INV[i.def].name} (${i.state === 'failed' ? 'failed' : 'completed'})`).join(', ')}.</p>` : ''}
    ${groups}`;
}

function deals(g: GameState): string {
  const c = g.company;
  const cards = g.targets.map((t) => {
    const fit = Math.abs(c.culture - t.culture);
    return `<div class="sheet"><div class="spread"><h3 style="margin:0">${esc(t.name)}</h3><span class="chip">${esc(CITY[t.city].name)}</span></div>
      <p class="small muted" style="margin:4px 0 8px">${INDUSTRIES[t.ind].name}. ${esc(t.blurb)} ${t.expires > g.turn ? `Offer open for ${t.expires - g.turn} more quarter${t.expires - g.turn === 1 ? '' : 's'}.` : 'Last quarter to buy.'}</p>
      <div class="kv">
        <div>Revenue a quarter</div><div>${$(t.revenue, 'Target revenue', 'What the business sells each quarter today.', [['Local market share', pct(t.share, 2)], ['Staff', String(t.staff)]])}</div>
        <div>Operating margin</div><div><b class="serif">${pct(t.margin)}</b></div>
        <div>Asking price</div><div>${$(t.price, 'Asking price', 'Paid in cash at closing. Whatever you pay above the fair value of the plant becomes goodwill on your balance sheet.', [['Price / annual revenue', (t.price / (t.revenue * 4)).toFixed(1) + '×'], ['Typical multiple for the industry', INDUSTRIES[t.ind].revMult + '×']], ['goodwill', 'multiple'])}</div>
        <div>Culture fit</div><div>${N(fit < 12 ? 'Close' : fit < 28 ? 'Some friction' : 'Clash', 'Culture fit', 'The bigger the gap between the two cultures and the bigger the target relative to you, the more your own culture suffers in integration.', [['Their culture', String(t.culture)], ['Yours', c.culture.toFixed(0)]], ['integration', 'culture'])}</div>
        <div>What you know</div><div>${t.diligenced ? (t.hidden > 0 ? '<span class="neg">Hidden liabilities found; price cut</span>' : '<span class="pos">Clean books</span>') + `, synergy ${t.synergy >= 0 ? '+' : ''}${t.synergy}%` : 'Only what the seller says'}</div>
      </div>
      <div class="row" style="margin-top:10px">${c.franchises?.some((f) => f.city === t.city && f.ind === t.ind) ? '<span class="small muted">A franchisee runs your stores there, so you cannot buy here.</span>' : `<button class="btn sm primary" data-a="acquire" data-id="${t.id}">Buy for ${money(t.price)}</button>`}
      ${t.diligenced ? '' : `<button class="btn sm" data-a="ddTarget" data-id="${t.id}">Due diligence, ${money(targetDiligenceCost(t))}</button>`}</div></div>`;
  }).join('');
  return `<h1>Deals</h1><p class="muted">Buying a business is the fastest way into a city and the easiest way to overpay. Integration takes a year and dents productivity while it lasts.</p>
    ${cards ? `<div class="grid2">${cards}</div>` : `<div class="note"><b>Nothing for sale this quarter.</b><p>Businesses come up a few times a year, more often in cities you already know.</p></div>`}
    ${c.books.goodwill > 0 ? `<p class="small muted">Goodwill on your balance sheet: ${$(c.books.goodwill, 'Goodwill', 'The premium you paid over the fair value of what you bought. It is tested every year and written down if the company is not earning its keep.', undefined, ['goodwill'])}.</p>` : ''}
    ${dealsExtras.map((f) => f(g)).join('')}`;
}
export const dealsExtras: ((g: GameState) => string)[] = [];
corpTabs.push(['invest', 'Invest'], ['deals', 'Deals']);
corpViews.invest = invest;
corpViews.deals = deals;

// office- and region-scoped investments appear where they apply
opsExtras.push((g: GameState, o: Office) => {
  const defs = catalog(g, 'office').filter((d) => !d.inds || d.inds.includes(o.ind));
  const live = g.company.investments.filter((i) => i.scope === o.id && (i.state === 'ramp' || i.state === 'active'));
  return defs.length ? `<div class="wide"><h2>Invest in this office</h2>${live.length ? `<div class="sheet">${running(g, live)}</div>` : ''}<div class="grid2">${defs.map((d) => card(g, d, o.id)).join('')}</div></div>` : '';
});
regionExtras.push((g: GameState, r: RegionId) => {
  const defs = catalog(g, 'region');
  const live = g.company.investments.filter((i) => i.scope === r && (i.state === 'ramp' || i.state === 'active'));
  return defs.length ? `<h3>Regional investments</h3>${live.length ? running(g, live) : ''}${defs.map((d) => card(g, d, r)).join('')}` : '';
});

on('invest', (d) => void act(startInvestment(ui.g!, d.id!, d.scope || undefined), sfx.build));
on('dd', (d) => void act(diligence(ui.g!, d.id!, d.scope || undefined), sfx.tick));
on('cancelInv', (d) => void act(cancelInvestment(ui.g!, Number(d.uid))));
on('license', (d) => void act(licenseOut(ui.g!, Number(d.uid)), sfx.cash));
on('ddTarget', (d) => void act(diligenceTarget(ui.g!, d.id!), sfx.tick));
on('acquire', (d) => void act(acquireTarget(ui.g!, d.id!), sfx.good));
