// Offices: staffing, pay, capacity — and the regional levers that shape demand.
import {
  CITY, INDUSTRIES, PLANT_STAKE, REGIONS, ROLES, assetFinanceLTV, canRecycle, hasInventory, expandCapacity, expandCost, fire, forecastQuarter, gmOf, headcount, isCapital, marketWage, money, officeById, pct, plantEquity, plantValue, priceIndex, sellCapacity, sellPlantStake,
  setBackfill, setMarketing, setPay, setPrice, setReqs, setTraining, severanceCost, staffingHint, unitVarCost, closeOffice,
  type Forecast, type GameState, type Office, type RegionId, type Role, type IndustryId,
} from '@engine';
import { $, N, esc, explain, lineChart, seg, slider, stepper, tip } from '../kit';
import { act, on, render, ui } from '../store';
import { modals, screens } from '../shell';
import { attritionTip, capacityTip, moraleTip, poolTip, qualityTip, shareTip, wageTip } from '../tips';
import { BIND_TEXT } from './hq';
import { sfx } from '../../audio';

export const opsTabs: [string, string][] = [['list', 'All offices']];
export const opsViews: Record<string, (g: GameState) => string> = {};
export const opsExtras: ((g: GameState, o: Office) => string)[] = [];

function list(g: GameState): string {
  const c = g.company;
  return `<h1>Offices</h1><p class="muted">Each office serves one city in one industry. Tap one to manage its people and capacity.</p>
  <div class="choices">${c.offices.map((o) => {
    const l = o.last;
    return `<button class="choice" data-a="office" data-id="${o.id}"><span class="glyph">${INDUSTRIES[o.ind].icon}</span><b>${esc(CITY[o.city].name)}</b>
      <span class="muted">${INDUSTRIES[o.ind].name}, ${headcount(o)} people</span><br>
      ${l ? `${money(l.revenue)} a quarter, ${pct(o.share, 1)} share, ${BIND_TEXT[l.bind][0].toLowerCase()}` : 'Opening — no trading yet'}</button>`;
  }).join('')}</div>`;
}

function officeView(g: GameState): string {
  const c = g.company;
  const o = officeById(g, ui.sel.office ?? '') ?? c.offices[0];
  ui.sel.office = o.id;
  const def = INDUSTRIES[o.ind];
  const city = CITY[o.city];
  const region = city.region;
  const pol = c.policy[region];
  const l = o.last;
  const gm = gmOf(c, o);
  const hint = staffingHint(g, o);

  const status = l
    ? `<div class="note ${l.bind === 'demand' ? '' : 'warn'}"><b>${BIND_TEXT[l.bind][0]}.</b><p>${BIND_TEXT[l.bind][1]}${l.lost > 1000 ? ` About ${money(l.lost)} of sales a quarter is going unserved.` : ''}</p></div>`
    : `<div class="note"><b>Not trading yet.</b><p>Set up the team and end the quarter.</p></div>`;

  const quarter = l ? `<div class="sheet"><h2>Last quarter</h2><div class="kv">
      <div>Revenue</div><div>${$(l.revenue, 'Office revenue', 'Units sold × price per unit.', [['Units sold', Math.round(l.sold).toLocaleString()], ['Price per unit', money(l.price)], ['Market size (units)', Math.round(l.market).toLocaleString()]])}</div>
      <div>Market share</div><div>${shareTip(o)}</div>
      <div>Capacity used</div><div>${capacityTip(g, o)}</div>
      <div>Quality</div><div>${qualityTip(g, o)}</div>
      <div>Unit cost <span class="sub">vs price ${money(l.price)}</span></div><div>${$(l.unitCost, 'Unit cost', 'Materials, operations payroll and facility cost per unit sold. The gap to price is your gross margin per unit; idle capacity raises it because payroll is paid whether or not there is work.', [['Variable cost per unit', money(unitVarCost(g, o))], ['Gross margin per unit', money(l.price - l.unitCost)]], ['grossMargin', 'fixedCosts'])}</div>
      ${hasInventory(o.ind) ? `<div>Inventory <span class="sub">${Math.round(o.inventory).toLocaleString()} units</span></div><div>${$(o.invValue, 'Inventory', `Goods made or bought but not yet sold, at cost. You hold about ${def.dio} days of stock; ${pct(def.spoil)} of anything unsold is lost each quarter.`, [['Produced last quarter', Math.round(l.produced).toLocaleString()], ['Sold last quarter', Math.round(l.sold).toLocaleString()]], ['inventory', 'workingCapital'])}</div>` : ''}
      <div>Contribution</div><div>${$(l.contribution, 'Office contribution', 'What this office earns after its own costs, before corporate overhead, R&D programs, interest and tax.', [['Revenue', money(l.revenue)], ['Materials / hosting / fuel', money(-l.materials)], ['Payroll', money(-(l.wages.ops + l.wages.sales + l.wages.rnd + l.wages.admin))], ['Rent', money(-l.rent)], ['Facility', money(-l.facility)], ['Marketing', money(-l.marketing)], ['Hiring and training', money(-(l.hiring + l.training))], ['Contribution', money(l.contribution), true]], ['contribution'])}</div>
    </div></div>` : '';

  const next = forecastView(g, o);

  const team = `<div class="sheet"><h2>Team</h2>
    <p class="small muted">Morale ${moraleTip(o)}, attrition ${attritionTip(g, o)} a quarter${gm ? `, run by ${N(gm.name, 'General manager', `${gm.trait}. A strong GM lifts productivity, morale and process quality; a weak one drags them down.`, [['Skill', String(gm.skill)], ['Loyalty', String(gm.loyalty)], ['Salary per quarter', money(gm.salary * g.macro.wageIdx)]])}` : ''}.</p>
    <div class="scrollx"><table class="ledger"><thead><tr><th>Role</th><th class="num">People</th><th class="num">Skill</th><th>Open positions</th><th class="num">Payroll</th><th></th></tr></thead><tbody>
    ${ROLES.map((r) => {
      const s = o.staff[r];
      const sug = r === 'ops' || r === 'admin' ? hint[r] : 0;
      return `<tr><td><b>${def.roles[r]}</b>${sug > s.n + s.reqs ? `<br><span class="small hi">need about ${sug}</span>` : ''}</td>
        <td class="num">${N(s.n, def.roles[r], roleText(r, def.roles[r]), [['Joined last quarter (still ramping)', String(s.fresh)], ['Market wage', money(marketWage(g, o, r))]])}</td>
        <td class="num">${N(s.skill.toFixed(0), 'Skill', 'Average skill, 0–100. Rises with tenure and training, diluted by new hires. Paying above market attracts better candidates.')}</td>
        <td>${stepper(s.reqs, 'reqs', `data-office="${o.id}" data-role="${r}"`)} <span class="small muted">pool ${poolTip(g, o, r)}</span></td>
        <td class="num">${wageTip(g, o, r)}</td>
        <td>${s.n > 0 ? `<button class="linkish small" data-a="askLayoff" data-office="${o.id}" data-role="${r}">Lay off</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>
    ${slider({ label: 'Pay against the local market', act: 'pay', attrs: `data-office="${o.id}"`, min: 0.7, max: 1.6, step: 0.05, value: o.pay, fmt: 'pct',
      help: 'Higher pay widens the hiring pool, brings better people and cuts attrition. Cutting pay hits morale at once.' })}
    <div class="field"><div class="lab"><span>Training budget</span></div>${seg('training', [['0', 'None'], ['1', '2% of payroll'], ['2', '4%'], ['3', '6%']], String(o.training), `data-office="${o.id}"`)}
      <div class="help">Builds skill every quarter and lifts morale.</div></div>
    <div class="field"><div class="lab"><span>Replace people who leave</span></div>${seg('backfill', [['1', 'Automatically'], ['0', 'No']], o.autoBackfill ? '1' : '0', `data-office="${o.id}"`)}</div>
  </div>`;

  const plant = isCapital(o.ind) ? plantView(g, o) : '';

  const price = priceIndex(g, o);
  const market = `<div class="sheet"><h2>Price and marketing</h2><p class="small muted">Set for all of ${esc(REGIONS[region].name)}.</p>
    ${slider({ label: `${def.short} price vs market`, act: 'price', attrs: `data-region="${region}" data-ind="${o.ind}"`, min: 0.6, max: 1.6, step: 0.02, value: price, fmt: 'pct',
      tipBody: explain('Price position', `Your price relative to the going rate, which rises with inflation on its own. Customers here have a price elasticity of about ${def.elast}: a 10% premium costs roughly ${(def.elast * 10).toFixed(0)}% of your pull — worth it if you are short of capacity or your quality is well above the bar.`, [['Reference price per unit', money((l?.price ?? 0) / price)], ['Your price per unit', money(l?.price ?? 0)]], ['elasticity', 'pricingPower']),
      help: 'Raise it when you cannot keep up with demand; lower it to take share when you have idle capacity.' })}
    ${slider({ label: 'Marketing per quarter', act: 'marketing', attrs: `data-region="${region}"`, min: 0, max: Math.max(200_000, Math.round(((l?.revenue ?? 0) * 0.6) / 10_000) * 10_000), step: 5000, value: pol.marketing, fmt: 'money',
      help: 'Adds to sales reach now and builds regional brand over time. Returns diminish: doubling the budget does not double the effect.' })}
    <p class="small muted">Regional brand ${N(c.regionBrand[region].toFixed(0), 'Regional brand', 'How well known you are in this region, 0–100. Built by marketing and by simply having customers; fades about 3.5% a quarter if you stop.', [['Company-wide brand', c.brand.toFixed(0)]], ['brand'])}</p>
  </div>`;

  const chart = o.hist.length > 1 ? `<div class="sheet"><h2>History</h2>${lineChart([{ name: 'Revenue', color: 'var(--ink)', data: o.hist.map((h) => h.rev) }, { name: 'Contribution', color: 'var(--green)', data: o.hist.map((h) => h.contrib) }], { turns: o.hist.map((_, i) => g.turn - o.hist.length + i), id: 'office' })}</div>` : '';
  const close = c.offices.length > 1 ? `<p><button class="btn danger sm" data-a="askClose" data-office="${o.id}">Close this office</button></p>` : '';

  return `<div class="spread"><h1>${esc(city.name)} <span class="muted" style="font-size:.7em">${def.name}</span></h1>
    ${c.offices.length > 1 ? `<button class="btn sm" data-a="sub" data-k="ops" data-v="list">All offices</button>` : ''}</div>
    ${status}<div class="grid2">${quarter}${next}${market}<div class="wide">${team}</div>${plant}${chart}${opsExtras.map((f) => f(g, o)).join('')}</div>${close}`;
}

// The dry run is cheap (a few milliseconds) but runs once per state of the game, not on every redraw.
let fcCache: { key: string; f: Forecast } | null = null;
function forecastFor(g: GameState): Forecast {
  const key = JSON.stringify(g); // any decision changes the forecast
  if (fcCache?.key !== key) fcCache = { key, f: forecastQuarter(g) };
  return fcCache.f;
}

/** "Next quarter, if nothing changes": demand, capacity, revenue, contribution and cash from a dry run. */
function forecastView(g: GameState, o: Office): string {
  const f = forecastFor(g);
  const n = f.offices[o.id];
  if (!n) return '';
  const l = o.last;
  const units = (x: number) => Math.round(x).toLocaleString();
  const vs = (a: number, b: number | undefined) => (b && Math.abs(a / b - 1) >= 0.01 ? ` <span class="small ${a < b ? 'neg' : 'pos'}">${a >= b ? '▲' : '▼'} ${Math.abs((a / b - 1) * 100).toFixed(0)}%</span>` : '');
  const turnedAway = n.bind !== 'demand' && n.lost > 1000;
  const how = 'A dry run of the coming quarter with the decisions you have made so far: the same people, prices, pay and building plans; no new events and a steady economy. Hiring and customers still vary, so treat it as a likely outcome, not a promise.';
  return `<div class="sheet"><h2>Next quarter, if nothing changes</h2><div class="kv">
      <div>Customers want <span class="sub">units</span></div><div>${N(units(n.demand), 'Likely demand', how, [['Last quarter', l ? units(l.demand) : '—']], ['marketShare'])}${vs(n.demand, l?.demand)}</div>
      <div>You can deliver <span class="sub">units</span></div><div>${N(units(n.capacity), 'Likely capacity', 'What your people and plant could produce next quarter, counting hires already on their way and people likely to leave.', [['Last quarter', l ? units(l.capacity) : '—']], ['capacity'])}${vs(n.capacity, l?.capacity)}</div>
      <div>Revenue</div><div>${$(n.revenue, 'Likely revenue', how, [['Units sold', units(n.sold)], ['Last quarter', l ? money(l.revenue) : '—']])}${vs(n.revenue, l?.revenue)}</div>
      <div>Contribution</div><div>${$(n.contribution, 'Likely contribution', 'What this office would earn after its own costs next quarter. ' + how, [['Last quarter', l ? money(l.contribution) : '—']], ['contribution'])}</div>
      <div>Company cash at quarter end</div><div>${$(f.cash, 'Likely cash', 'Cash for the whole company at the end of the coming quarter, after every office, head office, interest, tax and building already committed.', [['Cash today', money(g.company.books.cash)], ['Cash from operations', money(f.cfo)], ['Net income', money(f.ni)]], ['cashFlow'])}</div>
    </div>${turnedAway ? `<p class="small hi">On this plan you would turn away about ${money(n.lost)} of sales: ${n.bind === 'facility' ? 'the plant is the limit' : 'there are not enough people'}.</p>` : ''}
    ${f.cash < 0 ? '<p class="small neg">On this plan the company runs out of cash next quarter.</p>' : ''}</div>`;
}

function plantView(g: GameState, o: Office): string {
  const def = INDUSTRIES[o.ind];
  const step = Math.max(10, Math.round(def.start.cap / 4 / 10) * 10);
  const pending = ui.sub['build:' + o.id] ? Number(ui.sub['build:' + o.id]) : step * 2;
  return `<div class="sheet"><h2>Plant and equipment</h2><div class="kv">
    <div>Capacity</div><div>${N(Math.round(o.cap).toLocaleString(), 'Plant capacity', 'Units the facility can turn out per quarter, if you have the staff to run it.', [['Book value', money(o.ppe - o.accDep)], ['Running cost per quarter', money(o.last?.facility ?? 0)]], ['capex', 'depreciation'])} units</div>
    <div>Under construction</div><div>${o.building.length ? o.building.map((b) => `${Math.round(b.units).toLocaleString()} (ready in ${b.ready - g.turn} qtr)`).join(', ') : 'nothing'}</div></div>
    ${slider({ label: 'Build more', act: 'buildAmt', attrs: `data-office="${o.id}"`, min: step, max: step * 40, step, value: pending, fmt: 'x', help: `${money(expandCost(g, o, pending))} now, ready in ${def.buildQ} quarters. Then depreciated over ${def.deprQ / 4} years.` })}
    <div class="row"><button class="btn primary" data-a="build" data-office="${o.id}" data-units="${pending}">Build ${pending.toLocaleString()} units for ${money(expandCost(g, o, pending))}</button>
    <button class="btn" data-a="buildFin" data-office="${o.id}" data-units="${pending}">${tip(`Finance ${Math.round(assetFinanceLTV(o.ind) * 100)}% against the asset`, explain(INDUSTRIES[o.ind].capPerUnit >= 10 ? 'Project finance' : 'Equipment finance', `Lenders fund ${Math.round(assetFinanceLTV(o.ind) * 100)}% of the build, secured on the new asset, at a fixed rate over ${INDUSTRIES[o.ind].capPerUnit >= 10 ? 20 : 7} years. You put in ${money(expandCost(g, o, pending) * (1 - assetFinanceLTV(o.ind)) * (1 - (o.minority ?? 0)))}${o.minority ? `; the fund that owns ${Math.round(o.minority * 100)}% of the plant puts in its share` : ''}. The loan carries a coverage covenant: EBITDA must stay above 1.2× interest.`, undefined, ['leverage', 'covenant']), 'plain')}</button>
    ${o.cap > step ? `<button class="btn sm danger" data-a="sellCap" data-office="${o.id}" data-units="${step}">Sell ${step} units</button>` : ''}</div>
    ${INDUSTRIES[o.ind].capPerUnit >= 10 ? recycleBlock(g, o) : ''}</div>`;
}

/** Capital recycling: sell part of a running plant to an infrastructure fund. */
function recycleBlock(g: GameState, o: Office): string {
  if (o.minority) return `<p class="small muted" style="margin-top:10px">An infrastructure fund owns ${Math.round(o.minority * 100)}% of this plant. It receives that share of what the plant earns after its own loan is serviced, and pays its share of any expansion.</p>`;
  const why = canRecycle(g, o);
  const price = PLANT_STAKE * plantEquity(g, o);
  return `<div class="row" style="margin-top:10px;gap:8px;align-items:center"><button class="btn" data-a="recycle" data-office="${o.id}" ${why ? 'disabled' : ''}>${tip(`Sell ${Math.round(PLANT_STAKE * 100)}% to a fund${why ? '' : ` for ${money(price)}`}`, explain('Capital recycling', `Infrastructure funds pay well for running plants because they accept a lower return for steady cash. Selling ${Math.round(PLANT_STAKE * 100)}% of this one raises money to build the next. From then on the fund receives its share of what the plant earns after its loan is serviced, and the stake no longer counts towards your company's value.`,
    [['A fund values the whole plant at', money(plantValue(g, o))], ['Less the loans secured on it', money(plantValue(g, o) - plantEquity(g, o))], [`Price for ${Math.round(PLANT_STAKE * 100)}%`, money(price), true]], ['valuation']), 'plain')}</button>${why ? `<span class="small muted">${esc(why)}</span>` : ''}</div>`;
}

const roleText = (r: Role, name: string) =>
  ({ ops: `${name} deliver the product. Their number, skill and morale set what the office can produce.`, sales: `${name} create demand. Without them you rely on word of mouth.`, rnd: `${name} raise your technology level, which lifts quality in every office of this industry.`, admin: `${name} keep the office running. You need about one for every 14 people or productivity suffers.` })[r];

opsViews.list = list;
opsViews.office = officeView;
screens.ops = (g) => {
  const cur = ui.sub.ops && opsViews[ui.sub.ops] ? ui.sub.ops : g.company.offices.length > 1 ? 'list' : 'office';
  const tabs = opsTabs.length > 1 ? `<div class="subtabs">${opsTabs.map(([k, l]) => `<button data-a="sub" data-k="ops" data-v="${k}" aria-pressed="${cur === k || (k === 'list' && cur === 'office')}">${l}</button>`).join('')}</div>` : '';
  return tabs + opsViews[cur](g);
};

on('reqs', (d) => {
  const g = ui.g!;
  const o = officeById(g, d.office!)!;
  const role = d.role as Role;
  act(setReqs(g, o.id, role, o.staff[role].reqs + Number(d.d)), sfx.tick);
});
on('pay', (d) => void act(setPay(ui.g!, d.office!, Number(d.value))));
on('training', (d) => void act(setTraining(ui.g!, d.office!, Number(d.v))));
on('backfill', (d) => void act(setBackfill(ui.g!, d.office!, d.v === '1')));
on('price', (d) => void act(setPrice(ui.g!, d.region as RegionId, d.ind as IndustryId, Number(d.value))));
on('marketing', (d) => void act(setMarketing(ui.g!, d.region as RegionId, Number(d.value))));
on('buildAmt', (d) => {
  ui.sub['build:' + d.office] = d.value!;
  render();
});
on('build', (d) => void act(expandCapacity(ui.g!, d.office!, Number(d.units)), sfx.build));
on('buildFin', (d) => void act(expandCapacity(ui.g!, d.office!, Number(d.units), true), sfx.build));
on('sellCap', (d) => void act(sellCapacity(ui.g!, d.office!, Number(d.units))));
on('recycle', (d) => void act(sellPlantStake(ui.g!, d.office!)));
on('askLayoff', (d) => {
  ui.modal = { kind: 'layoff', data: { office: d.office, role: d.role, n: 1 } };
  render();
});
on('layoffN', (d) => {
  const m = ui.modal!.data;
  const o = officeById(ui.g!, m.office)!;
  m.n = Math.max(1, Math.min(o.staff[m.role as Role].n, m.n + Number(d.d)));
  render();
});
on('layoffAll', () => {
  const m = ui.modal!.data;
  m.n = officeById(ui.g!, m.office)!.staff[m.role as Role].n;
  render();
});
on('doLayoff', () => {
  const m = ui.modal!.data;
  ui.modal = null;
  act(fire(ui.g!, m.office, m.role, m.n), sfx.bad);
});
on('askClose', (d) => {
  ui.modal = { kind: 'confirm', data: { title: 'Close this office?', text: 'Everyone is laid off with severance, the lease is broken at a cost of two quarters of rent, plant is sold at 40% of book value, and your customers here go to competitors.', yes: 'Close the office', act: 'doClose', arg: d.office } };
  render();
});
on('doClose', (d) => {
  ui.modal = null;
  ui.sub.ops = 'list';
  act(closeOffice(ui.g!, d.arg!), sfx.bad);
});

modals.layoff = (g, m) => {
  const o = officeById(g!, m.office)!;
  const role = m.role as Role;
  const cost = severanceCost(g!, o, role, m.n);
  const frac = m.n / headcount(o);
  return `<h2>Lay off ${INDUSTRIES[o.ind].roles[role].toLowerCase()}</h2>
    <p>Severance in ${esc(CITY[o.city].name)} runs to ${(0.5 + 1.5 * CITY[o.city].reg).toFixed(1)} quarters of pay per person — labour law here is ${CITY[o.city].reg > 0.6 ? 'strict' : CITY[o.city].reg > 0.4 ? 'moderate' : 'light'}.</p>
    <div class="row">${stepper(m.n, 'layoffN', '')}<button class="btn sm" data-a="layoffAll">All ${o.staff[role].n}</button></div>
    <div class="kv" style="margin:14px 0"><div>Severance, paid now</div><div><b class="serif neg">${money(cost)}</b></div>
      <div>Saves per quarter</div><div><b class="serif">${money(m.n * marketWage(g!, o, role) * o.pay)}</b></div>
      <div>Morale of those who stay</div><div><b class="serif neg">−${(4 + 25 * frac).toFixed(0)} now, and a scar that fades over a year</b></div></div>
    <p class="small muted">Layoffs also dent culture, and large ones dent your reputation with future hires.</p>
    <div class="row end"><button class="btn" data-a="close">Cancel</button><button class="btn danger" data-a="doLayoff">Lay off ${m.n}</button></div>`;
};
modals.confirm = (_g, m) => `<h2>${esc(m.title)}</h2><p>${esc(m.text)}</p><div class="row end"><button class="btn" data-a="close">Cancel</button><button class="btn danger" data-a="${m.act}" data-arg="${esc(m.arg ?? '')}">${esc(m.yes)}</button></div>`;
