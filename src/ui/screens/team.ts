// R&D and People: technology by division, executives, key people, culture.
import {
  CITY, EXEC_ROLES, FOUNDER, IND_LIST, INDUSTRIES, companyHeadcount, divisionCost, exec, fireExec, flightRisk, hireExec, launchDivision, money, pct, retain,
  setRdBudget, ttm, type ExecRole, type GameState, type IndustryId, type Person,
} from '@engine';
import { $, N, esc, meter, slider } from '../kit';
import { act, on, render, ui } from '../store';
import { corpTabs, corpViews } from './corp';
import { sfx } from '../../audio';

export const rdExtras: ((g: GameState) => string)[] = [];
export const peopleExtras: ((g: GameState) => string)[] = [];

const EXEC_WHAT: Record<ExecRole, string> = {
  GM: 'Runs an office: lifts productivity, morale and process quality.',
  CFO: 'Lowers loan spreads, lifts your credit rating, and is required for an IPO.',
  CTO: 'Makes every R&D dollar and engineer more effective.',
  COO: 'Raises operations productivity in every office.',
  CMO: 'Makes marketing budgets work harder.',
  CHRO: 'Widens hiring pools, reduces attrition, and protects the culture.',
};

function rd(g: GameState): string {
  const c = g.company;
  const rev = ttm(c, (q) => q.pnl.revenue);
  const divs = c.divisions.map((k) => {
    const def = INDUSTRIES[k];
    const t = c.tech[k] ?? 0;
    const info = c.techInfo[k];
    const staff = c.offices.filter((o) => o.ind === k).reduce((s, o) => s + o.staff.rnd.n, 0);
    return `<div class="sheet"><h2 style="margin-top:0">${def.name}</h2>
      <div class="kv"><div>Technology level</div><div>${N(t.toFixed(1), 'Technology level', 'How good your product or process is, 0–100. It is the main input to quality in tech-heavy industries. It converges on whatever your R&D effort can sustain — stop investing and it drifts back down.', [['Heading towards', info ? info.target.toFixed(0) : '—'], ['Research points per quarter', info ? info.rp.toFixed(1) : '—'], [`${def.roles.rnd} on staff`, String(staff)], ['Weight of tech in quality', pct(def.techW)]], ['rd', 'moat'])}</div>
        <div>Sustained by current effort</div><div><b class="serif">${info ? info.target.toFixed(0) : '—'}</b></div></div>
      <div style="margin:10px 0">${meter(t / 100)}</div>
      ${slider({ label: 'Program budget per quarter', act: 'rdBudget', attrs: `data-ind="${k}"`, min: 0, max: Math.max(300_000, Math.round((rev * 0.08) / 10_000) * 10_000), step: 5000, value: c.rdBudget[k] ?? 0, fmt: 'money',
        help: `Outside labs, tooling and trials. ${money(def.rdCost * 1000 * g.macro.cpi)} buys one research point — about what a skilled ${def.roles.rnd.toLowerCase().replace(/s$/, '')} produces. Each tenfold increase in effort adds roughly the same number of tech points.` })}
      <p class="small muted">Hire ${def.roles.rnd.toLowerCase()} in your offices for lasting capability; use the budget when you need a faster push.</p></div>`;
  }).join('');
  const others = IND_LIST.filter((d) => !c.divisions.includes(d.id));
  const launch = others.length ? `<h2>Enter a new industry</h2><p class="muted">A second division spreads risk across cycles, but splits your attention and starts behind the incumbents.</p><div class="choices">${others.map((d) => `
    <button class="choice" data-a="askDivision" data-ind="${d.id}"><span class="glyph">${d.icon}</span><b>${d.name}</b><span class="muted">${esc(d.blurb)}</span><br><span class="small">Launch cost ${money(divisionCost(g, d.id))}</span></button>`).join('')}</div>` : '';
  return `<h1>Research and development</h1><div class="grid2">${divs}</div>${rdExtras.map((f) => f(g)).join('')}${launch}`;
}

function personRow(g: GameState, p: Person, where: string): string {
  const risk = flightRisk(g, p);
  return `<tr><td><b>${esc(p.name)}</b><br><span class="small muted">${esc(where)}, ${esc(p.trait.toLowerCase())}</span></td>
    <td class="num">${N(p.skill, 'Skill', EXEC_WHAT[p.role])}</td>
    <td class="num">${N(p.loyalty.toFixed(0), 'Loyalty', 'How attached this person is. Rises with a strong culture and good office morale, falls otherwise.', [['Chance of resigning each quarter', pct(risk, 1)], ['Locked in until', (p.retained ?? -1) >= g.turn ? `${p.retained! - g.turn} more quarters` : 'not locked in']], ['keyPerson'])}</td>
    <td class="num">${$(p.salary * g.macro.wageIdx, 'Salary', 'Per quarter, rising with wages generally.')}</td>
    <td class="nowrap">${risk > 0.012 ? `<button class="btn sm" data-a="retain" data-id="${p.id}">Retain</button> ` : ''}<button class="linkish small" data-a="askFire" data-id="${p.id}">Replace</button></td></tr>`;
}

function people(g: GameState): string {
  const c = g.company;
  const f = FOUNDER[c.founder];
  const execs = c.people.filter((p) => !p.office);
  const gms = c.people.filter((p) => p.office);
  const open = EXEC_ROLES.filter((r) => !exec(c, r));
  const head = companyHeadcount(c);
  const q = c.quarters[c.quarters.length - 1];
  const avgMorale = head ? c.offices.reduce((s, o) => s + o.morale * (o.staff.ops.n + o.staff.sales.n + o.staff.rnd.n + o.staff.admin.n), 0) / head : 0;
  return `<h1>People</h1>
    <div class="grid2">
    <div class="sheet"><h2>The company</h2><div class="kv">
      <div>Culture</div><div>${N(c.culture.toFixed(0), 'Culture', 'How well the company works as a company, 0–100. It moves productivity by ±10%, drives attrition and key-person loyalty, and tilts the odds in a crisis. Hiring faster than about 12% a quarter dilutes it; layoffs and badly integrated acquisitions damage it.', [['Founder effect', (f.culture >= 0 ? '+' : '') + f.culture], ['Settles towards', (52 + f.culture + (exec(c, 'CHRO') ? ((exec(c, 'CHRO')!.skill - 50) / 10) : 0)).toFixed(0)]], ['culture'])}</div>
      <div>Average morale</div><div><b class="serif">${avgMorale.toFixed(0)}</b></div>
      <div>Headcount</div><div><b class="serif">${head}</b>${q ? ` <span class="small muted">was ${q.headcount}</span>` : ''}</div>
      <div>Reputation</div><div>${N(c.reputation.toFixed(0), 'Reputation', 'How customers, regulators and future employees see you, 0–100. Affects demand a little, hiring more, and whether an IPO is possible.', [['ESG score', c.esg.toFixed(0)]], ['reputation'])}</div>
      <div>Left / joined all-time</div><div><b class="serif">${g.counters.quits ?? 0} / ${g.counters.hires ?? 0}</b></div>
    </div>${peopleExtras.map((x) => x(g)).join('')}</div>
    <div class="sheet"><h2>Executive team</h2>
      ${execs.length ? `<div class="scrollx"><table class="ledger"><thead><tr><th>Executive</th><th class="num">Skill</th><th class="num">Loyalty</th><th class="num">Salary</th><th></th></tr></thead><tbody>${execs.map((p) => personRow(g, p, p.role)).join('')}</tbody></table></div>` : '<p class="muted">You are doing every job yourself. That works for a while.</p>'}
      ${open.length ? `<h3>Open seats</h3><p class="small muted">Hiring costs a search fee and signing bonus of 1.2 quarters' salary, paid at once.</p>${open.map((r) => `<p style="margin-bottom:4px"><b>${r}.</b> <span class="muted">${EXEC_WHAT[r]}</span></p><div class="row" style="margin-bottom:10px">${g.candidates.filter((p) => p.role === r).map((p) => `<button class="btn sm" data-a="hireExec" data-id="${p.id}">${esc(p.name)}, skill ${p.skill}, ${money(p.salary * g.macro.wageIdx)}/qtr</button>`).join('') || '<span class="small muted">No candidates this quarter.</span>'}</div>`).join('')}` : ''}
    </div>
    <div class="sheet wide"><h2>General managers</h2><div class="scrollx"><table class="ledger"><thead><tr><th>Manager</th><th class="num">Skill</th><th class="num">Loyalty</th><th class="num">Salary</th><th></th></tr></thead><tbody>
      ${gms.map((p) => { const o = c.offices.find((x) => x.id === p.office); return personRow(g, p, o ? CITY[o.city].name : ''); }).join('')}</tbody></table></div>
      <p class="small muted">A general manager who leaves takes two quarters of productivity with them. Retention packages cost one and a half quarters of salary and lock them in for two years.</p></div>
    </div>`;
}
corpTabs.push(['rd', 'R&D'], ['people', 'People']);
corpViews.rd = rd;
corpViews.people = people;

on('rdBudget', (d) => void act(setRdBudget(ui.g!, d.ind as IndustryId, Number(d.value))));
on('hireExec', (d) => void act(hireExec(ui.g!, d.id!), sfx.deal));
on('retain', (d) => void act(retain(ui.g!, d.id!), sfx.spend));
on('askFire', (d) => {
  const p = ui.g!.company.people.find((x) => x.id === d.id);
  if (!p) return;
  ui.modal = { kind: 'confirm', data: { title: `Replace ${p.name}?`, text: `They leave with two quarters of pay (${money(p.salary * ui.g!.macro.wageIdx * 2)}). ${p.office ? 'An internal successor takes over, usually a weaker one.' : 'The seat stays empty until you hire.'}`, yes: 'Replace', act: 'doFire', arg: p.id } };
  render();
});
on('doFire', (d) => {
  ui.modal = null;
  act(fireExec(ui.g!, d.arg!), sfx.somber);
});
on('askDivision', (d) => {
  const k = d.ind as IndustryId;
  ui.modal = { kind: 'confirm', data: { title: `Enter ${INDUSTRIES[k].name}?`, text: `${INDUSTRIES[k].economics} Launching costs ${money(divisionCost(ui.g!, k))} now; then open an office from the map.`, yes: 'Launch the division', act: 'doDivision', arg: k } };
  render();
});
on('doDivision', (d) => {
  ui.modal = null;
  act(launchDivision(ui.g!, d.arg as IndustryId), sfx.milestone);
});
