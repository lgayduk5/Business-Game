// Corporate → Organisation → Policies (review wave 3): standing company policies, pay in stock options, locking input
// prices, and earnings guidance once listed. Franchising sits on the map, city by city.
import {
  CITY, GUIDANCE, OPTION_LEVELS, POLICIES, POLICY, ROYALTY, FRANCHISE_FEE, adoptPolicy, canFranchise, dropPolicy, guidanceTarget, lockInputs, money, openFranchise, pct, policySlots,
  policyWait, setGuidance, setOptionPay, turnLabel, type CityDef, type GameState,
} from '@engine';
import { esc, seg } from '../kit';
import { act, on, ui } from '../store';
import { corpTabs, corpViews } from './corp';
import { cityExtras } from './map';

function policies(g: GameState): string {
  const c = g.company;
  const active = c.policies ?? [];
  const slots = policySlots(g);
  const wait = policyWait(g);
  const free = active.length < slots;
  const cards = POLICIES.map((p) => {
    const on = active.includes(p.id);
    const buttons = on
      ? `<button class="btn sm" data-a="dropPolicy" data-id="${p.id}" ${wait ? 'disabled' : ''}>Drop</button>`
      : free
        ? `<button class="btn sm go" data-a="adoptPolicy" data-id="${p.id}">Adopt</button>`
        : !wait ? active.map((a) => `<button class="btn sm" data-a="adoptPolicy" data-id="${p.id}" data-r="${a}">Instead of ${esc(POLICY[a].name)}</button>`).join('') : '';
    return `<div class="choice" aria-pressed="${on}"><b>${esc(p.name)}</b><span class="muted">${esc(p.desc)}</span>
      <p class="small" style="margin:6px 0">${esc(p.lesson)}</p><div class="row" style="flex-wrap:wrap;gap:6px">${buttons}</div></div>`;
  }).join('');
  const opt = c.optionPay ?? 0;
  const pool = c.cap.holders.find((h) => h.round === 'Options');
  const h = c.hedge && c.hedge.until > g.turn ? c.hedge : undefined;
  const cogs = c.quarters[c.quarters.length - 1]?.pnl.cogs ?? 0;
  const gd = c.guidance;
  return `<h1>Policies</h1><p class="muted">Standing choices about how the company works. Each one is a trade-off.</p>
    <div class="sheet"><div class="spread"><h2 style="margin:0">Company policies</h2><span class="small muted">${active.length} of ${slots} slots used${wait ? ` · next change in ${wait} quarter${wait === 1 ? '' : 's'}` : ''}</span></div>
      <p class="small muted">Two slots to start; a third at $10M of annual revenue, a fourth at $50M, a fifth once listed. You can fill an empty slot at any time, but change or drop a policy only once a year.</p>
      <div class="choices">${cards}</div></div>
    <div class="grid2">
      <div class="sheet"><h2>Pay in stock options</h2>
        <p class="small">Part of every salary paid in options instead of cash. It still counts as a cost in the accounts, but no cash leaves, people stay longer, and every grant issues new shares.</p>
        <div class="field">${seg('optionPay', OPTION_LEVELS.map((x) => [String(x), x ? pct(x) : 'None']), String(opt))}</div>
        <p class="small muted">${pool ? `The option pool holds ${pct(pool.shares / c.cap.shares, 1)} of the company.` : 'No options granted yet.'}</p></div>
      <div class="sheet"><h2>Lock input prices</h2>
        ${h ? `<p>Commodity, energy and cloud prices are locked until <b>${turnLabel(h.until)}</b>, for ${money(h.fee)} a quarter.</p>`
          : `<p class="small">Forward contracts fix what you pay for materials, energy or cloud capacity. You are protected if prices rise and miss out if they fall; the contracts cost a small fee each quarter.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="lockInputs" data-v="4">Lock for 4 quarters (~${money(cogs * 0.008)} a quarter)</button><button class="btn sm" data-a="lockInputs" data-v="8">Lock for 8 quarters (~${money(cogs * 0.012)} a quarter)</button></div>`}</div>
      ${c.cap.isPublic ? `<div class="sheet"><h2>Earnings guidance</h2>
        ${gd ? `<p>You told the market to expect about <b>${money(gd.target)}</b> of revenue in the year to ${turnLabel(gd.due)} (${GUIDANCE[gd.level].name.toLowerCase()}).</p>`
          : `<p class="small">Tell the market what revenue to expect over the next year. Beat it and the shares rise; miss it and they fall — further the bolder the promise.</p>
          <div class="choices" style="grid-template-columns:1fr">${(Object.keys(GUIDANCE) as (keyof typeof GUIDANCE)[]).map((k) => `<button class="choice" data-a="guidance" data-v="${k}"><b>${GUIDANCE[k].name}: ${money(guidanceTarget(g, k))}</b><span class="muted">Beat it: shares +${Math.round(GUIDANCE[k].beat * 100)}%. Miss it: ${Math.round(GUIDANCE[k].miss * 100)}%.</span></button>`).join('')}</div>`}</div>` : ''}
    </div>`;
}

corpTabs.push(['policies', 'Policies']);
corpViews.policies = policies;
on('adoptPolicy', (d) => void act(adoptPolicy(ui.g!, d.id!, d.r)));
on('dropPolicy', (d) => void act(dropPolicy(ui.g!, d.id!)));
on('optionPay', (d) => void act(setOptionPay(ui.g!, Number(d.v))));
on('lockInputs', (d) => void act(lockInputs(ui.g!, Number(d.v))));
on('guidance', (d) => void act(setGuidance(ui.g!, d.v as keyof typeof GUIDANCE)));

// Franchising, from a city on the map (retail).
cityExtras.push((g: GameState, ct: CityDef) => {
  const c = g.company;
  if (!c.divisions.includes('retail')) return '';
  const f = c.franchises?.find((x) => x.city === ct.id);
  if (f) return `<h3>Franchise</h3><p class="small">A franchisee runs your stores in ${esc(ct.name)}: about ${money(f.sales)} of sales a quarter, ${money(f.sales * ROYALTY)} of it yours.</p>`;
  const why = canFranchise(g, ct.id);
  if (why === 'You run your own stores there.') return '';
  return `<h3>Franchise</h3><p class="small">A partner opens and runs stores under your brand: no plant or staff of your own, a ${money(FRANCHISE_FEE * g.macro.cpi)} fee up front and ${pct(ROYALTY)} of their sales. You give up most of the margin, and their mistakes are your brand's.</p>
    ${why ? `<p class="small muted">${esc(why)}</p>` : `<button class="btn sm" data-a="franchise" data-id="${ct.id}">Franchise in ${esc(CITY[ct.id].name)}</button>`}`;
});
on('franchise', (d) => void act(openFranchise(ui.g!, d.id!)));
