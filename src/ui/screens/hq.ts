// HQ: where the company stands, what needs attention, what happened.
import { CITY, DIFF, INDUSTRIES, diffChanges, expectLine, globalShare, headcount, money, ttm, turnLabel, victoryStatus, type GameState } from '@engine';
import { $, N, P, delta, esc, lineChart, type Row } from '../kit';
import { on, render, ui } from '../store';
import { screens } from '../shell';
import { capacityTip, headTip, moraleTip, runway, shareTip, stakeTip, valuationTip } from '../tips';
import { sfx } from '../../audio';

export const hqExtras: ((g: GameState) => string)[] = [];

export const BIND_TEXT: Record<string, [string, string]> = {
  demand: ['Limited by demand', 'You can deliver more than customers are asking for. Add sales people or marketing, sharpen the price, or improve quality.'],
  staff: ['Limited by staff', 'Customers want more than your team can deliver. Hire, or raise prices until demand fits.'],
  facility: ['Limited by plant', 'The plant is full. Build capacity, or raise prices until demand fits.'],
  capacity: ['Limited by capacity', 'Demand exceeds what you can deliver.'],
  inventory: ['Limited by stock', 'You sold everything you had.'],
};

export function pnlRows(g: GameState): Row[] {
  const q = g.company.quarters[g.company.quarters.length - 1];
  if (!q) return [];
  const p = q.pnl;
  return [['Revenue', money(p.revenue)], ['Cost of sales', money(-p.cogs)], ['Sales & marketing', money(-p.sm)], ['R&D', money(-p.rd)], ['General & admin', money(-p.ga)],
    ['One-offs', money(-p.other)], ['EBITDA', money(q.ebitda), true], ['Depreciation', money(-p.da)], ['Interest', money(-p.interest)], ['Gains / losses', money(p.gains)], ['Tax', money(-p.tax)], ['Net income', money(q.ni), true]];
}

/** For the first two years HQ shows a concrete target instead of a distant victory: double the revenue you started with. */
export function starterGoal(g: GameState): { target: number; now: number } | undefined {
  if (g.turn >= 8 || g.mode !== 'standard') return undefined;
  const start = g.counters.startRevenue ?? 0;
  if (start <= 0) return undefined;
  const raw = 2 * start * g.macro.cpi;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const target = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((x) => x >= raw)!;
  const now = ttm(g.company, (q) => q.pnl.revenue);
  return now >= target ? undefined : { target, now };
}

export function macroLine(g: GameState): string {
  const m = g.macro;
  const phase = { expansion: 'Steady expansion', boom: 'Boom', slowdown: 'Slowdown', recession: 'Recession', recovery: 'Recovery' }[m.phase];
  return `<div class="kv">
    <div>Economy</div><div>${N(phase, 'Business cycle', 'Where the economy is in its cycle. Cyclical industries (consulting, manufacturing, logistics) swing hardest; subscriptions and contracted power barely move.', [['Output gap', `${m.gap.toFixed(1)}%`], ['Growth, annualised', `${m.growth.toFixed(1)}%`]], ['businessCycle'])}</div>
    <div>Central-bank rate</div><div>${N(m.rate.toFixed(2) + '%', 'Policy rate', 'The base for every floating-rate loan. The central bank raises it when inflation runs above 2% and cuts it in a slump.', [['Inflation', `${m.infl.toFixed(1)}%`], ['Credit spread add-on', `${m.spread.toFixed(1)} pts`]], ['interestRate', 'inflation'])}</div>
    <div>Inflation</div><div>${N(m.infl.toFixed(1) + '%', 'Inflation', 'How fast prices rise. Your reference prices rise with it automatically; wages rise a little faster, which is how margins get squeezed.', [['Wage growth', `${(m.infl + 0.8 + 0.4 * m.gap).toFixed(1)}%`], ['Price level since start', `${m.cpi.toFixed(2)}×`]], ['inflation'])}</div>
    <div>Investor mood</div><div>${N(m.sentiment.toFixed(2) + '×', 'Market sentiment', 'A multiplier on every valuation. Above 1, money is easy and multiples are rich; below 0.85 the IPO window is shut and funding rounds get harsh.', undefined, ['sentiment'])}</div>
  </div>`;
}

function hq(g: GameState): string {
  const c = g.company;
  const q = c.quarters[c.quarters.length - 1];
  const pq = c.quarters[c.quarters.length - 2];
  const r = runway(g);
  const hist = g.history;
  const notes: string[] = [];
  if (g.queue.length) notes.push(`<div class="note warn"><b>${g.queue.length} decision${g.queue.length > 1 ? 's' : ''} waiting.</b> <button class="linkish" data-a="openEvent">Open</button></div>`);
  if (r.quarters < 4) notes.push(`<div class="note bad"><b>${r.quarters.toFixed(1)} quarters of cash left.</b><p>You are burning ${money(r.burn)} a quarter. Cut costs, grow revenue, or raise money before it runs out.</p></div>`);
  for (const n of g.advisor.slice(0, 3)) notes.push(`<div class="note ${n.tone}"><b>${esc(n.who)}: ${esc(n.title)}</b><p>${esc(n.text)}</p></div>`);
  if (!q && !(g.settings.tutorial && g.mode !== 'scenario')) notes.push(`<div class="note"><b>Your first quarter.</b><p>Look over your office, set hiring and prices, then press <span class="hi">End quarter</span>. Tap any dotted number to see where it comes from.</p></div>`);

  const D = DIFF[g.difficulty];
  const tag = `<span class="small muted gametag">${N(`${D.label}${g.mode === 'sandbox' ? ' sandbox' : ''} · seed ${g.seed}`, `${D.label} difficulty`, `${D.who} ${expectLine(g.company.primary, g.difficulty, !!g.rules?.sprint)}`, [...diffChanges(g.difficulty).map((t): Row => [t, '']), ['World seed', g.seed]])}</span>`;
  const position = `<div class="sheet"><div class="spread"><h2>Position</h2>${tag}</div><div class="kv">
    <div>Revenue <span class="sub">last quarter</span></div><div>${q ? $(q.pnl.revenue, 'Revenue', 'What customers were billed last quarter, summed across offices.', c.offices.map((o): Row => [o.name, money(o.last?.revenue ?? 0)]), ['revenue']) : '—'} ${q && pq ? delta(q.pnl.revenue, pq.pnl.revenue) : ''}</div>
    <div>Net income <span class="sub">last quarter</span></div><div>${q ? $(q.ni, 'Net income', 'What is left after every cost, interest and tax. Not the same as cash: see the cash-flow statement.', pnlRows(g), ['netIncome', 'ebitda']) : '—'}</div>
    <div>Cash runway</div><div>${N(r.quarters === Infinity ? 'not burning' : r.quarters.toFixed(1) + ' qtrs', 'Runway', 'How long the cash lasts at last quarter’s rate of burn (operating cash flow plus capex).', [['Cash', money(c.books.cash)], ['Burn per quarter', r.burn > 0 ? money(r.burn) : 'none']], ['runway'])}</div>
    <div>${c.cap.isPublic ? 'Market cap' : 'Valuation'}</div><div>${valuationTip(g)}</div>
    <div>Your stake</div><div>${stakeTip(g)}</div>
    <div>World share <span class="sub">${INDUSTRIES[c.primary].short}</span></div><div>${P(globalShare(g, c.primary), 'World market share', `Your sales as a share of the whole ${INDUSTRIES[c.primary].name} market across every city, including ones you have not entered.`, undefined, 2, ['marketShare'])}</div>
    <div>People</div><div>${headTip(g)}</div>
    <div>Debt</div><div>${$(c.books.debt, 'Debt', 'Everything you owe lenders.', c.loans.map((l): Row => [l.name, money(l.principal)]), ['leverage'])}</div>
  </div></div>`;

  const chart = `<div class="sheet"><h2>Trend</h2>${lineChart([
    { name: 'Revenue', color: 'var(--ink)', data: hist.map((h) => h.revenue) },
    { name: 'Net income', color: 'var(--green)', data: hist.map((h) => h.ni) },
    { name: 'Cash', color: 'var(--red)', data: hist.map((h) => h.cash), dash: true },
  ], { turns: hist.map((h) => h.turn), id: 'hq' })}</div>`;

  const offices = `<div class="sheet wide"><div class="spread"><h2>Offices</h2><button class="btn sm" data-a="tab" data-v="ops">Manage</button></div><div class="scrollx"><table class="ledger stack">
    <thead><tr><th>Office</th><th class="num">Revenue</th><th class="num">Margin</th><th class="num">Share</th><th class="num">Used</th><th class="num">Morale</th><th>Limit</th></tr></thead><tbody>
    ${c.offices.map((o) => {
      const l = o.last;
      return `<tr class="tap" data-a="office" data-id="${o.id}"><td class="head"><b>${esc(CITY[o.city].name)}</b> <span class="muted small">${INDUSTRIES[o.ind].short}, ${headcount(o)} people</span></td>
      <td class="num" data-label="Revenue">${l ? $(l.revenue, 'Office revenue', 'Units sold × price.', [['Units sold', Math.round(l.sold).toLocaleString()], ['Price per unit', money(l.price)]]) : '—'}</td>
      <td class="num" data-label="Margin">${l && l.revenue > 0 ? P(l.contribution / l.revenue, 'Contribution margin', 'Office revenue minus everything the office itself costs (materials, payroll, rent, marketing, hiring). Corporate overhead, R&D programs, interest and tax come on top.', [['Contribution', money(l.contribution)]], 0, ['contribution']) : '—'}</td>
      <td class="num" data-label="Share">${shareTip(o)}</td><td class="num" data-label="Capacity used">${capacityTip(g, o)}</td><td class="num" data-label="Morale">${moraleTip(o)}</td>
      <td data-label="Limit">${l ? `<span class="chip ${l.bind === 'demand' ? '' : 'warn'}">${BIND_TEXT[l.bind][0].replace('Limited by ', '')}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;

  // a scenario is judged on its own goal, and a game kept going after a win no longer counts victories
  const best = g.mode === 'scenario' || g.continued ? undefined : victoryStatus(g).filter((v) => v.enabled).sort((a, b) => b.progress - a.progress)[0];
  const start = starterGoal(g);
  const goal = start
    ? `<div class="sheet"><div class="spread"><h2>First goal</h2><button class="btn sm" data-a="sub" data-k="intel" data-v="goals">All goals</button></div>
    <p style="margin-top:0"><b class="serif">Reach ${money(start.target)} of annual revenue.</b> Grow the business you have before chasing the big prizes. The ways to win the game are under <i>All goals</i>.</p>
    <div class="meter"><i style="width:${Math.min(1, start.now / start.target) * 100}%"></i></div><p class="small muted">${money(start.now)} over the last four quarters. This goal gives way to the closest victory after two years, or as soon as you reach it.</p></div>`
    : best ? `<div class="sheet"><div class="spread"><h2>Closest goal</h2><button class="btn sm" data-a="sub" data-k="intel" data-v="goals">All goals</button></div>
    <p style="margin-top:0"><b class="serif">${esc(best.name)}.</b> ${esc(best.desc)}</p><div class="meter"><i style="width:${best.progress * 100}%"></i></div><p class="small muted">${esc(best.detail)}</p></div>` : '';
  const news = `<div class="sheet"><h2>News</h2>${g.news.length ? `<ul class="feed">${g.news.slice(-8).reverse().map((n) => `<li class="${n.tone}"><span>${turnLabel(n.turn)}</span><span>${esc(n.text)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing to report yet.</p>'}</div>`;
  const economy = `<div class="sheet"><h2>Economy</h2>${macroLine(g)}</div>`;
  return `${notes.join('')}<div class="grid2">${hqExtras.map((f) => f(g)).join('')}${position}${chart}${offices}${goal}${economy}${news}</div>`;
}
screens.hq = hq;

on('office', (d) => {
  ui.sel.office = d.id;
  if (ui.tab !== 'ops') sfx.page();
  else sfx.tap();
  ui.tab = 'ops';
  ui.sub.ops = 'office';
  render(false);
});
