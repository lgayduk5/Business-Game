// Capital: debt, covenants, equity rounds, IPO, dividends and buybacks.
import {
  FACTOR_FEE, FACTOR_SHARE, buyBack, covenantStatus, drawRevolver, followOn, founderStake, ipoChecklist, loanRate, money, pct, raiseEquity, repayLoan, setAutoRevolver, setDividend, setFactoring,
  startIPO, takeLoan, ttm, turnLabel, type GameState,
} from '@engine';
import { $, N, esc, explain, seg, slider, tip, x2, type Row } from '../kit';
import { act, on, render, ui } from '../store';
import { corpTabs, corpViews } from './corp';
import { ratingTip, stakeTip, valuationTip } from '../tips';
import { sfx } from '../../audio';

const COUNTRY: Record<string, string> = { US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', GB: 'United Kingdom', NL: 'Netherlands', DE: 'Germany', NG: 'Nigeria', AE: 'UAE', IN: 'India', SG: 'Singapore', CN: 'China', JP: 'Japan', AU: 'Australia' };

/** Tax by country: losses carried forward, and last quarter's taxable profit and tax. */
function taxRows(g: GameState): Row[] {
  const c = g.company;
  const keys = [...new Set([...Object.keys(c.nolBy ?? {}), ...Object.keys(c.taxBy ?? {})])];
  return keys.map((k): Row => {
    const t = c.taxBy?.[k];
    return [COUNTRY[k] ?? k, `${money(c.nolBy?.[k] ?? 0)} carried${t ? ` · last quarter ${money(t.pre)} taxable, ${money(t.tax)} tax` : ''}`];
  });
}

function capital(g: GameState): string {
  const c = g.company;
  const cov = covenantStatus(g);
  const ebitda = ttm(c, (q) => q.ebitda);

  const loans = c.loans.length ? `<div class="scrollx"><table class="ledger"><thead><tr><th>Loan</th><th class="num">Owed</th><th class="num">Rate</th><th class="num">Due</th><th>Covenants</th><th></th></tr></thead><tbody>${c.loans.map((l) => {
    const tests: string[] = [];
    if (l.maxLeverage) tests.push(`${N(`debt ≤ ${l.maxLeverage}× EBITDA`, 'Leverage covenant', 'Total debt divided by the last twelve months of EBITDA must stay under this. Break it and the lender can demand fees, a higher rate, or their money back.', [['Now', cov.lev > 50 ? 'no EBITDA' : x2(cov.lev, 1) + '×'], ['Limit', l.maxLeverage + '×']], ['covenant', 'leverage'])}`);
    if (l.minCoverage) tests.push(`${N(`EBITDA ≥ ${l.minCoverage}× interest`, 'Coverage covenant', 'EBITDA must cover interest by this multiple.', [['Now', cov.cov > 50 ? 'n/a' : x2(cov.cov, 1) + '×'], ['Minimum', l.minCoverage + '×']], ['covenant'])}`);
    if (l.minCash) tests.push(`${N(`cash ≥ ${money(l.minCash)}`, 'Minimum cash covenant', 'You must keep at least this much in the bank.', [['Now', money(c.books.cash)]], ['covenant'])}`);
    const breached = cov.breaches.some((b) => b.loan.id === l.id);
    return `<tr><td><b>${esc(l.name)}</b>${l.kind === 'revolver' ? `<br><span class="small muted">limit ${money(l.limit)}</span>` : ''}${breached ? '<br><span class="chip bad">in breach</span>' : ''}</td>
      <td class="num">${$(l.principal, 'Outstanding', l.amort > 0 ? `Repaid ${money(l.amort)} a quarter.` : l.kind === 'revolver' ? 'Draw and repay freely up to the limit.' : 'Repaid in one go at maturity.', [['Interest per quarter', money((l.principal * loanRate(g, l)) / 400)]])}</td>
      <td class="num">${N(loanRate(g, l).toFixed(2) + '%', 'Interest rate', l.floating ? 'Floating: the central-bank rate plus your spread. It moves every quarter.' : 'Fixed for the life of the loan.', l.floating ? [['Policy rate', g.macro.rate.toFixed(2) + '%'], ['Your spread', l.spread.toFixed(2) + ' pts']] : undefined, ['interestRate'])}</td>
      <td class="num">${turnLabel(l.maturity)}</td><td class="small">${tests.join('<br>') || 'none'}</td>
      <td>${l.kind === 'revolver' ? `<button class="btn sm" data-a="draw" data-amt="${Math.min(l.limit - l.principal, Math.max(50_000, l.limit / 4))}">Draw</button> ` : ''}${l.principal > 0 ? `<button class="btn sm" data-a="repay" data-id="${l.id}">Repay</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="muted">No debt.</p>';

  const offers = g.loanOffers.map((o) => {
    const amt = Number(ui.sub['loan:' + o.id] ?? Math.round(o.max / 2 / 1000) * 1000);
    return `<div class="sheet"><h3 style="margin-top:0">${esc(o.name)}</h3><p class="small">${esc(o.note)}</p>
      <p class="small muted">${loanRate(g, o).toFixed(2)}% ${o.floating ? 'floating' : 'fixed'}, ${o.term / 4} years${o.maxLeverage ? `, debt ≤ ${o.maxLeverage}× EBITDA` : ''}${o.minCoverage ? `, EBITDA ≥ ${o.minCoverage}× interest` : ''}${o.minCash ? `, cash ≥ ${money(o.minCash)}` : ''}. 1% arrangement fee.</p>
      ${slider({ label: 'Amount', act: 'loanAmt', attrs: `data-id="${o.id}"`, min: 10_000, max: Math.floor(o.max / 1000) * 1000, step: 1000, value: Math.min(amt, o.max), fmt: 'money' })}
      <button class="btn primary" data-a="takeLoan" data-id="${o.id}" data-amt="${Math.min(amt, o.max)}">${o.kind === 'revolver' ? 'Open the line' : `Borrow ${money(Math.min(amt, o.max))}`}</button></div>`;
  }).join('');

  const eo = g.equityOffer;
  const epct = Number(ui.sub.eqPct ?? 0.15);
  const equity = c.cap.isPublic
    ? `<p>Listed since ${turnLabel(c.cap.ipoTurn)}. Share price ${N('$' + c.cap.price.toFixed(2), 'Share price', 'Fair value per share times the market’s premium or discount. Beat expectations and the premium grows; miss and it shrinks.', [['Premium to fair value', x2(c.cap.premium)], ['Expected earnings per share', '$' + c.cap.expectedEps.toFixed(3)]], ['valuation'])}.</p>
       <div class="row"><button class="btn" data-a="followOn">Sell 10% new shares</button><button class="btn" data-a="buyback">Buy back shares with 20% of cash</button></div>`
    : c.cap.ipoStage > 0 ? `<div class="note good"><b>IPO in progress.</b><p>${c.cap.ipoStage === 1 ? 'Filed. Roadshow next quarter.' : 'Roadshow under way. Shares price next quarter if the window stays open.'}</p></div>`
    : eo ? `<div class="note good"><b>${esc(eo.investor)} wants in: ${esc(eo.round)}.</b><p>${esc(eo.note)}</p></div>
        <div class="kv"><div>Pre-money valuation</div><div>${$(eo.pre, 'Pre-money valuation', 'What the investor says the company is worth before their money goes in. Price per share = this ÷ existing shares.', [['Your current valuation', money(c.valuation)]], ['dilution', 'valuation'])}</div></div>
        ${slider({ label: 'Stake to sell', act: 'eqPct', min: 0.05, max: eo.maxPct, step: 0.01, value: Math.min(epct, eo.maxPct), fmt: 'pct' })}
        <p>Sell ${pct(Math.min(epct, eo.maxPct))} for <b class="serif">${money(((eo.pre * Math.min(epct, eo.maxPct)) / (1 - Math.min(epct, eo.maxPct))) * 0.96)}</b> after fees. Your stake goes from ${pct(founderStake(c), 1)} to <b class="serif">${pct(founderStake(c) * (1 - Math.min(epct, eo.maxPct)), 1)}</b>.</p>
        <button class="btn primary" data-a="raise" data-pct="${Math.min(epct, eo.maxPct)}">Take the money</button>`
    : `<p class="muted">No investors at the table this quarter. They come when you are growing, when markets are confident, and not too soon after your last round.</p>`;

  const ipo = !c.cap.isPublic && c.cap.ipoStage === 0 ? (() => {
    const ck = ipoChecklist(g);
    return `<h3>Going public</h3><ul class="feed">${ck.items.map((i) => `<li><span>${i.ok ? '✔' : '—'}</span><span>${tip(esc(i.label), explain(i.label, i.tip), 'plain')}</span></li>`).join('')}</ul>
      <button class="btn ${ck.ok ? 'go' : ''}" data-a="ipo" ${ck.ok ? '' : 'disabled'}>File for an IPO</button>
      <p class="small muted">Costs about ${money(1.5e6 * g.macro.cpi)} up front and 7% of the money raised. Sells 18% new shares over two quarters. Afterwards the market judges you every quarter.</p>`;
  })() : '';

  return `<h1>Capital</h1>
    <div class="grid2">
      <div class="sheet"><h2>Standing</h2><div class="kv">
        <div>Credit rating</div><div>${ratingTip(g)}</div>
        <div>Debt</div><div>${$(c.books.debt, 'Total debt', 'Everything owed to lenders.', [['EBITDA, last 12 months', money(ebitda)], ['Debt / EBITDA', cov.lev > 50 ? 'n/a' : x2(cov.lev, 1) + '×']], ['leverage'])}</div>
        <div>Valuation</div><div>${valuationTip(g)}</div>
        <div>Your stake</div><div>${stakeTip(g)}</div>
        <div>Tax losses carried forward</div><div>${$(c.nol, 'Tax loss carryforward', 'Past losses you can set against future profits in the same country. They shelter up to 80% of each quarter’s taxable income there until used up; a loss in one country does nothing for profits in another.', taxRows(g))}</div>
      </div>
      <div class="field" style="margin-top:12px"><div class="lab"><span>Draw on the credit line automatically when cash runs short</span></div>${seg('autoRev', [['1', 'Yes'], ['0', 'No']], c.autoRevolver ? '1' : '0')}</div>
      <div class="field" style="margin-top:12px"><div class="lab"><span>${tip('Sell invoices to a factor', explain('Invoice factoring', `A factor buys ${Math.round(FACTOR_SHARE * 100)}% of your invoices as you bill them, so most of what customers owe you arrives at once instead of when they pay. It costs ${(FACTOR_FEE * 100).toFixed(1)}% of the invoices sold, every quarter, booked as interest. Useful when slow-paying clients tie up cash; stop when you no longer need it and receivables build back up.`, [['Customers owe you now', money(c.books.ar)], ['Cost a quarter at last quarter’s sales', money(FACTOR_FEE * FACTOR_SHARE * (c.quarters[c.quarters.length - 1]?.pnl.revenue ?? 0))]], ['workingCapital']), 'plain')}</span></div>${seg('factor', [['1', 'On'], ['0', 'Off']], c.factoring ? '1' : '0')}</div>
      ${c.cap.isPublic || c.cap.dividend > 0 ? slider({ label: 'Dividend per quarter', act: 'dividend', min: 0, max: Math.max(100_000, Math.round(Math.max(0, ebitda) / 4 / 10_000) * 10_000), step: 10_000, value: c.cap.dividend, fmt: 'money', help: 'Income investors like a steady dividend and punish a cut.' }) : ''}
      </div>
      <div class="sheet"><h2>Equity</h2>${equity}${ipo}</div>
      <div class="sheet wide"><h2>Debt</h2>${loans}</div>
    </div>
    <h2>Lenders’ offers this quarter</h2><div class="grid2">${offers || '<p class="muted">Nobody is offering to lend this quarter.</p>'}</div>`;
}
corpTabs.push(['capital', 'Capital']);
corpViews.capital = capital;

on('loanAmt', (d) => { ui.sub['loan:' + d.id] = d.value!; render(); });
on('takeLoan', (d) => void act(takeLoan(ui.g!, d.id!, Number(d.amt)), sfx.cash));
on('draw', (d) => void act(drawRevolver(ui.g!, Number(d.amt)), sfx.cash));
on('repay', (d) => {
  const l = ui.g!.company.loans.find((x) => x.id === d.id);
  if (l) act(repayLoan(ui.g!, l.id, Math.min(l.principal, Math.max(l.principal / 4, 50_000))));
});
on('eqPct', (d) => { ui.sub.eqPct = d.value!; render(); });
on('raise', (d) => void act(raiseEquity(ui.g!, Number(d.pct)), sfx.cash));
on('ipo', () => void act(startIPO(ui.g!), sfx.good));
on('followOn', () => void act(followOn(ui.g!, 0.1), sfx.cash));
on('buyback', () => void act(buyBack(ui.g!, ui.g!.company.books.cash * 0.2)));
on('dividend', (d) => void act(setDividend(ui.g!, Number(d.value))));
on('autoRev', (d) => void act(setAutoRevolver(ui.g!, d.v === '1')));
on('factor', (d) => void act(setFactoring(ui.g!, d.v === '1')));
