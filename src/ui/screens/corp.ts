// Corporate: the three financial statements. Later milestones register more sub-tabs here.
import { equityOf, money, totalAssets, totalLiabilities, turnLabel, type GameState, type Quarter } from '@engine';
import { acct, esc, explain, seg, tip } from '../kit';
import { on, render, ui } from '../store';
import { screens } from '../shell';
import { sfx } from '../../audio';

export const corpTabs: [string, string][] = [['statements', 'Statements']];
export const corpViews: Record<string, (g: GameState) => string> = {};

type Line = [label: string, f: (q: Quarter) => number, cls?: string, why?: string];
const cell = (v: number) => `<td class="num ${v < -500 ? 'neg' : ''}">${acct(v)}</td>`;

const INCOME: Line[] = [
  ['Revenue', (q) => q.pnl.revenue, '', 'Sales recognised in the quarter, whether or not the customer has paid yet.'],
  ['Cost of sales', (q) => -q.pnl.cogs, 'sub', 'Materials, hosting or fuel, operations payroll and facility running costs.'],
  ['Gross profit', (q) => q.pnl.revenue - q.pnl.cogs, 'total', 'Revenue minus the direct cost of delivering it.'],
  ['Sales and marketing', (q) => -q.pnl.sm, 'sub', 'Sales payroll, marketing budgets, partner fees, market studies.'],
  ['Research and development', (q) => -q.pnl.rd, 'sub', 'R&D payroll and program budgets. Expensed as incurred.'],
  ['General and administrative', (q) => -q.pnl.ga, 'sub', 'Management payroll, rent, corporate overhead, recruiting and training.'],
  ['One-off items', (q) => -q.pnl.other, 'sub', 'Severance, legal settlements, fees, bad debts and other things that should not recur.'],
  ['EBITDA', (q) => q.ebitda, 'total', 'Earnings before interest, tax, depreciation and amortisation: the cash-like profit of the operations. Lenders measure your debt against it.'],
  ['Depreciation', (q) => -q.pnl.da, 'sub', 'This quarter’s share of what you paid for plant and equipment in the past. No cash leaves now.'],
  ['Net interest', (q) => -q.pnl.interest, 'sub', 'Interest earned on cash, less interest paid on debt.'],
  ['Gains and losses', (q) => q.pnl.gains, 'sub', 'Asset sales, write-downs, windfalls.'],
  ['Tax', (q) => -q.pnl.tax, 'sub', 'Tax on profit, after using up any past losses carried forward.'],
  ['Net income', (q) => q.ni, 'grand', 'The bottom line. It flows into retained earnings on the balance sheet.'],
];
const BALANCE: Line[] = [
  ['Assets', () => NaN, 'head'],
  ['Cash', (q) => q.bs.cash, 'sub', 'Money in the bank.'],
  ['Receivables', (q) => q.bs.ar, 'sub', 'Sales you have billed but not yet been paid for. Growing sales means growing receivables — profit you cannot spend yet.'],
  ['Inventory', (q) => q.bs.inventory, 'sub', 'Materials and goods bought but not yet sold, at cost.'],
  ['Property and equipment, net', (q) => q.bs.ppe - q.bs.accDep, 'sub', 'What you paid for plant, less depreciation charged so far.'],
  ['Goodwill', (q) => q.bs.goodwill, 'sub', 'The premium paid over the fair value of assets in acquisitions. Written down if the deal disappoints.'],
  ['Investments', (q) => q.bs.securities, 'sub', 'Financial investments held outside the business.'],
  ['Total assets', (q) => totalAssets(q.bs), 'total'],
  ['Liabilities', () => NaN, 'head'],
  ['Payables', (q) => q.bs.ap, 'sub', 'Bills from suppliers you have not paid yet. Free short-term financing — up to a point.'],
  ['Deferred revenue', (q) => q.bs.deferred, 'sub', 'Cash customers paid in advance for service you still owe them. A liability that is nice to have.'],
  ['Debt', (q) => q.bs.debt, 'sub', 'Loans and bonds outstanding.'],
  ['Total liabilities', (q) => totalLiabilities(q.bs), 'total'],
  ['Equity', () => NaN, 'head'],
  ['Paid-in capital', (q) => q.bs.paidIn, 'sub', 'Money shareholders put in, net of buybacks.'],
  ['Retained earnings', (q) => q.bs.retained, 'sub', 'All the profit ever made, less losses and dividends.'],
  ['Total equity', (q) => equityOf(q.bs), 'total'],
  ['Liabilities and equity', (q) => totalLiabilities(q.bs) + equityOf(q.bs), 'grand', 'Always equal to total assets. If it were not, the books would be wrong.'],
];
const CASHFLOW: Line[] = [
  ['Net income', (q) => q.cf.ni, '', 'Start from profit, then undo everything in it that was not cash.'],
  ['Depreciation', (q) => q.cf.da, 'sub', 'An expense that used no cash, so it is added back.'],
  ['Other non-cash items', (q) => q.cf.noncash, 'sub', 'Write-downs and losses on asset sales, added back.'],
  ['Change in receivables', (q) => -q.cf.dAR, 'sub', 'Sales booked but not collected reduce cash. This is where fast-growing companies leak.'],
  ['Change in inventory', (q) => -q.cf.dInv, 'sub', 'Stock you bought but have not sold ties up cash.'],
  ['Change in payables', (q) => q.cf.dAP, 'sub', 'Bills you have not paid yet are cash you still hold.'],
  ['Change in deferred revenue', (q) => q.cf.dDef, 'sub', 'Customers paying ahead of delivery puts cash in before the revenue is earned.'],
  ['Cash from operations', (q) => q.cf.cfo, 'total', 'What the business itself generated. Persistently below net income means profit is stuck in working capital.'],
  ['Capital expenditure', (q) => q.cf.capex, 'sub', 'Plant, equipment and capitalised projects.'],
  ['Acquisitions', (q) => q.cf.acquisitions, 'sub'],
  ['Asset sales', (q) => q.cf.disposals, 'sub'],
  ['Financial investments', (q) => q.cf.securities, 'sub'],
  ['Cash from investing', (q) => q.cf.cfi, 'total'],
  ['Borrowing', (q) => q.cf.debtIn, 'sub'],
  ['Debt repaid', (q) => q.cf.debtOut, 'sub'],
  ['Shares issued', (q) => q.cf.equityIn, 'sub'],
  ['Buybacks and dividends', (q) => q.cf.buybacks + q.cf.dividends, 'sub'],
  ['Cash from financing', (q) => q.cf.cff, 'total'],
  ['Change in cash', (q) => q.cf.net, 'grand', 'Equals the movement in the cash line of the balance sheet, every quarter.'],
];

function statements(g: GameState): string {
  const c = g.company;
  const which = ui.sel.stmt ?? 'income';
  const wide = window.innerWidth > 700;
  const qs = c.quarters.slice(wide ? -6 : -3);
  const lines = which === 'income' ? INCOME : which === 'balance' ? BALANCE : CASHFLOW;
  const picker = seg('stmt', [['income', 'Income'], ['balance', 'Balance sheet'], ['cash', 'Cash flow']], which);
  if (!qs.length) return `<h1>Financial statements</h1>${picker}<div class="note" style="margin-top:14px"><b>No quarters closed yet.</b><p>End your first quarter and the books will appear here.</p></div>`;
  const lastQ = qs[qs.length - 1];
  const tie = `<div class="note good"><b>The books tie out.</b><p>Assets − liabilities − equity = ${money(Math.round(lastQ.check.bs))}. Change in cash on the balance sheet − cash-flow statement = ${money(Math.round(lastQ.check.cash))}.</p></div>`;
  return `<h1>Financial statements</h1>${picker}
    <div class="sheet" style="margin-top:14px"><p class="small muted" style="margin-top:0">In thousands of dollars. Negative numbers are in parentheses. Tap a line for what it means.</p><div class="scrollx"><table class="ledger fit">
    <thead><tr><th></th>${qs.map((q) => `<th class="num">${turnLabel(q.turn)}</th>`).join('')}</tr></thead><tbody>
    ${lines.map(([label, f, cls, why]) => `<tr class="${cls ?? ''}"><td>${why ? tip(esc(label), explain(label, why), 'plain') : esc(label)}</td>${cls === 'head' ? qs.map(() => '<td></td>').join('') : qs.map((q) => cell(f(q))).join('')}</tr>`).join('')}
    </tbody></table></div></div>${tie}`;
}
corpViews.statements = statements;

/**
 * Corporate's sub-tabs in three groups, so a phone shows a row of three and a row of two or three rather than
 * seven pills over two lines. A tab registered without a group joins the last one.
 */
export const CORP_GROUPS: [id: string, label: string, tabs: string[]][] = [
  ['money', 'Money', ['statements', 'capital']],
  ['growth', 'Growth', ['invest', 'deals', 'rd']],
  ['org', 'Organisation', ['people', 'policies']],
];
const groupOf = (tab: string) => (CORP_GROUPS.find(([, , t]) => t.includes(tab)) ?? CORP_GROUPS[CORP_GROUPS.length - 1])[0];
const tabsIn = (group: string) => corpTabs.filter(([k]) => groupOf(k) === group);

screens.corp = (g) => {
  const cur = ui.sub.corp && corpViews[ui.sub.corp] ? ui.sub.corp : corpTabs[0][0];
  const group = groupOf(cur);
  ui.sub['corp:' + group] = cur; // each group remembers where you were in it
  const groups = CORP_GROUPS.filter(([id]) => tabsIn(id).length);
  const inGroup = tabsIn(group);
  const tabs = corpTabs.length > 1
    ? `<div class="corpnav">${seg('corpGroup', groups.map(([id, label]) => [id, label]), group, 'class="grow"')}
      ${inGroup.length > 1 ? `<div class="subtabs">${inGroup.map(([k, l]) => `<button data-a="sub" data-k="corp" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>` : ''}</div>`
    : '';
  return tabs + corpViews[cur](g);
};
on('corpGroup', (d) => {
  const group = d.v!;
  const first = tabsIn(group)[0]?.[0];
  ui.sub.corp = ui.sub['corp:' + group] ?? first ?? ui.sub.corp;
  sfx.tap();
  render(false);
});
on('stmt', (d) => {
  ui.sel.stmt = d.v;
  sfx.tap();
  render();
});
