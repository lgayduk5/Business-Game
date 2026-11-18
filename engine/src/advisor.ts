// The learning layer: an advisory board that explains what happened each quarter, attribution of
// value created to market, strategy, execution and luck, and the end-of-game post-mortem.
import * as B from './books';
import { CITY, INDUSTRIES, INV, PERSONALITY } from './content';
import { covenantStatus, founderStake, revenueGrowth } from './finance';
import { attritionRate, companyHeadcount, headcount } from './people';
import type { AdvisorNote, GameState } from './types';
import { money, pct, turnLabel } from './util';
import { victoryStatus } from './victory';

const lastQ = (g: GameState, back = 0) => g.company.quarters[g.company.quarters.length - 1 - back];
const sgn = (x: number) => (x >= 0 ? '+' : '−');

/** Revenue change between the last two quarters, split into market, share, price and new offices. */
export function revenueBridge(g: GameState) {
  const c = g.company;
  let market = 0, share = 0, price = 0, fresh = 0, other = 0, young = 0;
  for (const o of c.offices) {
    const h = o.hist;
    const now = h[h.length - 1];
    const prev = h[h.length - 2];
    if (!now) continue;
    if (!prev || prev.mkt === undefined || now.mkt === undefined) {
      if (c.quarters.length >= 2 && o.opened >= 0) fresh += now.rev; // the founding office is not a new strategic move
      continue;
    }
    const m = prev.share * (now.mkt - prev.mkt) * (prev.px ?? 1);
    const s = (now.share - prev.share) * now.mkt * (prev.px ?? 1);
    const p = now.share * now.mkt * ((now.px ?? 1) - (prev.px ?? 1));
    market += m;
    share += s;
    if (g.turn - o.opened < 8 && o.opened >= 0) young += s; // ramping up a market you chose to enter
    price += p;
    other += now.rev - prev.rev - m - s - p;
  }
  const removed = (lastQ(g, 1)?.pnl.revenue ?? 0) - c.offices.reduce((s, o) => s + (o.hist[o.hist.length - 2]?.rev ?? 0), 0);
  return { market, share, price, fresh, young, other: other - Math.max(0, removed), total: (lastQ(g)?.pnl.revenue ?? 0) - (lastQ(g, 1)?.pnl.revenue ?? 0) };
}

export function advise(g: GameState): AdvisorNote[] {
  const c = g.company;
  const q = lastQ(g);
  if (!q) return [];
  const pq = lastQ(g, 1);
  const notes: (AdvisorNote & { p: number })[] = [];
  const add = (p: number, n: AdvisorNote) => notes.push({ ...n, p });
  const rev = q.pnl.revenue;

  // ── what moved revenue
  if (pq && pq.pnl.revenue > 0) {
    const br = revenueBridge(g);
    const chg = br.total / pq.pnl.revenue;
    if (Math.abs(chg) > 0.03) {
      const parts: [number, string][] = [
        [br.market, `the markets you serve ${br.market >= 0 ? 'grew' : 'shrank'} (${sgn(br.market)}${money(Math.abs(br.market))})`],
        [br.share, `you ${br.share >= 0 ? 'won' : 'lost'} market share (${sgn(br.share)}${money(Math.abs(br.share))})`],
        [br.price, `your prices ${br.price >= 0 ? 'rose' : 'fell'} (${sgn(br.price)}${money(Math.abs(br.price))})`],
        [br.fresh, `new offices added ${money(br.fresh)}`],
        [br.other, `capacity limits ${br.other < 0 ? 'cost' : 'freed up'} ${money(Math.abs(br.other))}`],
      ];
      const why = parts.filter(([v]) => Math.abs(v) > Math.abs(br.total) * 0.15).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 3).map(([, t]) => t);
      add(chg < -0.08 ? 6 : 3, { who: 'CFO', tone: chg >= 0 ? 'good' : chg < -0.08 ? 'warn' : 'info', title: `Revenue ${chg >= 0 ? 'up' : 'down'} ${pct(Math.abs(chg))}`, text: why.length ? `Mostly because ${why.join(', ')}.` : 'Small moves on several fronts.', terms: ['marketShare'] });
    }
  }
  // ── cash versus profit
  const gap = q.cf.cfo - q.ni;
  if (Math.abs(gap) > Math.max(25_000, Math.abs(q.ni) * 0.4, rev * 0.08)) {
    // each driver, worded for the way it moved: [effect on cash, if it added cash, if it took cash]
    const drivers: [number, string, string][] = [
      [-q.cf.dAR, 'customers paying down what they owed', 'customers owing you more'],
      [-q.cf.dInv, 'running down inventory', 'more inventory on the shelves'],
      [q.cf.dAP, 'paying suppliers later', 'paying suppliers sooner'],
      [q.cf.dDef, 'customers paying in advance', 'earning revenue customers had paid for in advance'],
      [q.cf.da + q.cf.noncash, 'non-cash charges like depreciation', 'gains that brought in no cash'],
    ];
    const items: [number, string][] = drivers.map(([v, more, less]) => [v, v >= 0 ? more : less]);
    const big = items.filter(([v]) => Math.abs(v) > Math.abs(gap) * 0.2).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 2);
    add(gap < 0 ? 5 : 2, { who: 'CFO', tone: gap < 0 ? 'warn' : 'info', title: gap < 0 ? 'Profit did not turn into cash' : 'Cash came in faster than profit', text: `Operations ${q.cf.cfo >= 0 ? 'produced' : 'used'} ${money(Math.abs(q.cf.cfo))} against net income of ${money(q.ni)}. ${big.map(([v, t]) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))} from ${t}`).join('; ')}.`, terms: ['workingCapital', 'cashFlow'] });
  }
  // ── runway
  const burn = -(q.cf.cfo + q.cf.capex);
  if (burn > 0) {
    const rw = c.books.cash / burn;
    if (rw < 2) add(10, { who: 'CFO', tone: 'bad', title: `Under two quarters of cash`, text: `You are burning ${money(burn)} a quarter with ${money(c.books.cash)} in the bank. Raise money, draw on credit or cut costs now — every option gets worse each quarter you wait.`, terms: ['runway'] });
    else if (rw < 4) add(7, { who: 'CFO', tone: 'warn', title: `${rw.toFixed(1)} quarters of runway`, text: `Fundraising and loans take time and go better when you are not desperate. Start now.`, terms: ['runway'] });
  }
  // ── covenants
  const cov = covenantStatus(g);
  for (const l of c.loans) {
    if (l.maxLeverage && cov.lev < 50 && cov.lev > l.maxLeverage * 0.85) add(8, { who: 'CFO', tone: cov.lev > l.maxLeverage ? 'bad' : 'warn', title: 'Close to a leverage covenant', text: `Debt is ${cov.lev.toFixed(1)}× EBITDA against a limit of ${l.maxLeverage}× on ${l.name}. Repay some debt or grow EBITDA before the next test.`, terms: ['covenant', 'leverage'] });
    if (l.minCoverage && cov.cov < 50 && cov.cov < l.minCoverage * 1.15) add(8, { who: 'CFO', tone: cov.cov < l.minCoverage ? 'bad' : 'warn', title: 'Interest cover is thin', text: `EBITDA covers interest ${cov.cov.toFixed(1)}× against a minimum of ${l.minCoverage}× on ${l.name}.`, terms: ['covenant'] });
  }
  // ── office limits
  for (const o of c.offices) {
    const l = o.last;
    if (!l || g.turn - o.opened < 2) continue;
    if (l.bind !== 'demand' && l.lost > rev * 0.05) add(5, { who: 'COO', tone: 'warn', title: `${CITY[o.city].name} is turning customers away`, text: `Customers would buy about ${money(l.lost)} a quarter more than you can deliver, held back by ${l.bind === 'facility' ? 'plant capacity — build, or raise prices until demand fits' : 'too few people — hire, or raise prices'}.`, terms: ['capacity'] });
    else if (l.util < 0.6 && headcount(o) > 4) add(4, { who: 'COO', tone: 'warn', title: `${CITY[o.city].name} is ${pct(1 - l.util)} idle`, text: `You are paying for capacity customers are not using. Add sales effort, sharpen the price, or slim the team.`, terms: ['utilisation', 'fixedCosts'] });
    if (l.contribution < -0.15 * Math.max(l.revenue, 1) && g.turn - o.opened > 6) add(4, { who: 'COO', tone: 'warn', title: `${CITY[o.city].name} loses money on its own account`, text: `It cost ${money(-l.contribution)} more than it earned last quarter, before any head-office costs. Fix it or consider closing it.`, terms: ['contribution'] });
  }
  // ── people
  for (const o of c.offices) {
    if (headcount(o) < 6) continue;
    if (o.morale < 38) add(5, { who: 'CHRO', tone: 'warn', title: `Morale is low in ${CITY[o.city].name}`, text: `Morale is ${o.morale.toFixed(0)} and attrition ${pct(attritionRate(g, o), 1)} a quarter. Tap morale on the office page to see why.`, terms: ['morale', 'attrition'] });
  }
  // ── technology
  const tInfo = c.techInfo[c.primary];
  const t = c.tech[c.primary] ?? 0;
  if (tInfo && tInfo.target < t - 3 && INDUSTRIES[c.primary].techW >= 0.4) add(3, { who: 'CTO', tone: 'info', title: 'Technology is slipping', text: `Your R&D effort sustains a level of about ${tInfo.target.toFixed(0)}, below today's ${t.toFixed(0)}. Without more investment you will drift back.`, terms: ['rd'] });
  const rivalTech = Math.max(0, ...g.rivals.filter((r) => r.alive && (c.intel >= 1 || r.isPublic)).map((r) => r.tech[c.primary] ?? 0));
  if (rivalTech > t + 10) add(4, { who: 'CTO', tone: 'warn', title: 'Rivals are ahead on technology', text: `The best rival you can see is at ${rivalTech.toFixed(0)} against your ${t.toFixed(0)}. In ${INDUSTRIES[c.primary].short}, technology is ${pct(INDUSTRIES[c.primary].techW)} of what customers call quality.`, terms: ['rd', 'moat'] });
  // ── rivals
  for (const r of g.rivals) {
    if (!r.alive || r.pact) continue;
    if (r.hostility >= 5 && (c.intel >= 1 || r.offices.some((ro) => c.offices.some((o) => o.city === ro.city)))) add(5, { who: 'Chair', tone: 'warn', title: `${r.name} is spoiling for a fight`, text: `Hostility is ${r.hostility.toFixed(0)} of 10. ${PERSONALITY[r.personality].label}s ${r.personality === 'costcutter' ? 'win price wars' : r.personality === 'innovator' ? 'poach engineers' : r.personality === 'predator' ? 'buy the wounded' : 'retaliate where you are weakest'}. A truce or better relations would cool it.` });
  }
  // ── macro
  const m = g.macro;
  const floating = c.loans.filter((l) => l.floating).reduce((s, l) => s + l.principal, 0);
  if (m.phase === 'recession' && (m.hist[m.hist.length - 2]?.gap ?? 0) > -2) add(6, { who: 'Chair', tone: 'warn', title: 'Recession', text: 'Demand is falling, customers will pay later and lenders will tighten. Protect cash; this is also when competitors weaken.', terms: ['businessCycle'] });
  if (floating > rev && (m.hist[m.hist.length - 2]?.rate ?? m.rate) < m.rate - 0.4) add(5, { who: 'CFO', tone: 'warn', title: 'Rates are rising on your floating debt', text: `${money(floating)} of your debt is floating. Each point on the policy rate costs ${money(floating / 100 / 4)} a quarter.`, terms: ['interestRate'] });
  // ── control
  if (founderStake(c) < 0.5 && c.cap.holders.length && q.ni < 0 && !c.cap.isPublic) add(6, { who: 'Chair', tone: 'warn', title: 'You no longer control the board', text: `You own ${pct(founderStake(c), 0)}. Investors are patient while losses shrink; after enough losing quarters they may replace you.`, terms: ['dilution'] });
  // ── goals
  const close = victoryStatus(g).filter((v) => v.enabled && v.progress > 0.8).sort((a, b) => b.progress - a.progress)[0];
  if (close) add(2, { who: 'Chair', tone: 'good', title: `Within reach: ${close.name}`, text: `${close.desc} ${close.detail}` });
  // ── good news
  if (pq && q.ni > 0 && pq.ni <= 0) add(3, { who: 'CFO', tone: 'good', title: 'Profitable', text: `Net income turned positive this quarter.${c.nol > 0 ? ` ${money(c.nol)} of losses carried forward will shelter the first profits from tax.` : ''}`, terms: c.nol > 0 ? ['taxLoss'] : [] });
  const best = Math.max(...c.quarters.slice(0, -1).map((x) => x.pnl.revenue), 0);
  if (rev > best * 1.02 && c.quarters.length > 4 && revenueGrowth(c) > 0.15) add(1, { who: 'CMO', tone: 'good', title: 'Record quarter', text: `Revenue of ${money(rev)} is the highest yet, ${pct(revenueGrowth(c))} up on a year ago.` });

  const order = { bad: 0, warn: 1, good: 2, info: 3 } as const;
  return notes.sort((a, b) => order[a.tone] - order[b.tone] || b.p - a.p).slice(0, 7).map(({ p, ...n }) => n);
}

/** Why a fast-forward should stop here ('' = nothing needs the player). */
export function needsAttention(g: GameState): string {
  if (g.status !== 'playing' && !g.continued) return 'The game has ended.';
  if (g.queue.length) return 'A decision is waiting for you.';
  const c = g.company;
  if (c.books.cash < 0) return 'Cash is negative.';
  const last = c.quarters[c.quarters.length - 1];
  if (last && last.cf.cfo + last.cf.capex < 0 && c.books.cash < -(last.cf.cfo + last.cf.capex) * 2) return 'Less than two quarters of cash left.';
  if (g.advisor.some((n) => n.tone === 'bad')) return 'Your advisors have raised a red flag.';
  return '';
}

// ───────────────────────── attribution ─────────────────────────

/**
 * Splits each quarter's change in shareholder value (valuation, net of new money raised and cash returned)
 * into four sources. Market: industry growth, the business cycle and investor mood. Strategy: where you
 * chose to compete — new offices, acquisitions, divisions and price positioning. Luck: the dice in events,
 * trials and venture bets, measured as outcome minus expected value. Execution: everything else — how well
 * you ran what you chose.
 */
export function trackAttribution(g: GameState) {
  const c = g.company;
  const a = g.attribution;
  const q = lastQ(g);
  if (!q) return;
  const prevVal = g.history.length ? g.history[g.history.length - 1].valuation : g.counters.startValuation ?? c.valuation;
  const created = c.valuation - prevVal - q.cf.equityIn - q.cf.buybacks - q.cf.dividends; // buybacks/dividends are negative cash flows
  const ttmRev = Math.max(1, B.ttm(c, (x) => x.pnl.revenue));
  const k = Math.min(15, Math.max(0.3, c.valuation / ttmRev)) * 4; // value of a quarterly revenue dollar at today's multiple
  const br = revenueBridge(g);
  const sentPrev = g.counters.lastSentiment ?? g.macro.sentiment;
  const sentEffect = sentPrev > 0 ? prevVal * (g.macro.sentiment / sentPrev - 1) : 0;
  g.counters.lastSentiment = g.macro.sentiment;
  const market = br.market * k + sentEffect;
  const strategy = (br.fresh + br.price + br.young) * k;
  const luckNow = a.luck - (g.counters.lastLuck ?? 0);
  g.counters.lastLuck = a.luck;
  const execution = created - market - strategy - luckNow;
  a.market += market;
  a.strategy += strategy;
  a.execution += execution;
  const scale = Math.max(Math.abs(prevVal) * 0.08, 250_000);
  const note = (kind: 'market' | 'strategy' | 'execution', value: number, text: string) => {
    if (Math.abs(value) > scale) a.notes.push({ turn: g.turn, kind, text, value });
  };
  if (Math.abs(sentEffect) > scale) note('market', sentEffect, `Investor mood ${sentEffect > 0 ? 'lifted' : 'cut'} every valuation, yours included`);
  else note('market', market, `The markets you serve ${market > 0 ? 'grew' : 'shrank'}${g.macro.phase === 'recession' ? ' in the recession' : ''}`);
  const opened = c.offices.filter((o) => o.hist.length === 1);
  note('strategy', strategy, opened.length ? `Opening in ${opened.map((o) => CITY[o.city].name).join(', ')}` : br.price > 0 ? 'Raising prices' : br.price < 0 ? 'Cutting prices' : 'Where you chose to compete');
  const pq = lastQ(g, 1);
  const mNow = q.pnl.revenue > 0 ? q.ebitda / q.pnl.revenue : 0;
  const mPrev = pq && pq.pnl.revenue > 0 ? pq.ebitda / pq.pnl.revenue : mNow;
  const mover = c.offices.filter((o) => o.hist.length >= 2).sort((x, y) => Math.abs(y.share - y.hist[y.hist.length - 2].share) - Math.abs(x.share - x.hist[x.hist.length - 2].share))[0];
  const moved = mover ? mover.share - mover.hist[mover.hist.length - 2].share : 0;
  const bits = [Math.abs(mNow - mPrev) > 0.03 ? `EBITDA margin ${mNow > mPrev ? 'up' : 'down'} from ${pct(mPrev)} to ${pct(mNow)}` : '', mover && Math.abs(moved) > 0.0005 ? `share ${moved > 0 ? 'won' : 'lost'} in ${CITY[mover.city].name}` : ''].filter(Boolean);
  note('execution', execution, bits.length ? `${execution > 0 ? 'Better' : 'Weaker'} operations: ${bits.join(', ')}` : execution > 0 ? 'The business ran better than the quarter before' : 'The business ran worse than the quarter before');
  if (a.notes.length > 120) a.notes.splice(0, a.notes.length - 120);
}

// ───────────────────────── post-mortem ─────────────────────────

export interface PostMortem {
  headline: string;
  verdict: string;
  stats: [string, string][];
  shares: { market: number; strategy: number; luck: number; execution: number };
  moments: { turn: number; kind: string; text: string; value: number }[];
  lessons: { title: string; text: string; terms?: string[] }[];
}

export function postMortem(g: GameState): PostMortem {
  const c = g.company;
  const a = g.attribution;
  const o = g.outcome;
  const peakRev = Math.max(0, ...g.history.map((h) => h.revenue)) * 4;
  const peakVal = Math.max(0, ...g.history.map((h) => h.valuation));
  const raised = g.counters.equityRaised ?? 0;
  const stake = founderStake(c);
  const tot = Math.abs(a.market) + Math.abs(a.strategy) + Math.abs(a.luck) + Math.abs(a.execution) || 1;
  const shares = { market: a.market / tot, strategy: a.strategy / tot, luck: a.luck / tot, execution: a.execution / tot };
  const biggest = (Object.entries(shares) as [keyof typeof shares, number][]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  const why: Record<string, [string, string]> = {
    market: ['The tide decided most of it.', 'Industry growth, the business cycle and investor mood moved your value more than anything you did. That is common — and it is why good decisions can look bad and bad ones good.'],
    strategy: ['Where you chose to play mattered most.', 'Your choices of markets, acquisitions and price positioning drove the result more than how well you ran the day-to-day.'],
    luck: ['Fortune had a big say.', 'Events, trials and bets went unusually well or badly against their odds. Judge the decisions by the odds you faced, not the outcomes you got.'],
    execution: ['How you ran the business made the difference.', 'Share won or lost, costs and margins — the quality of operations drove your value more than the markets you picked or the dice.'],
  };
  const lessons: PostMortem['lessons'] = [];
  const qs = c.quarters;
  if (o?.how === 'bankrupt' && B.ttm(c, (q) => q.ni) > 0) lessons.push({ title: 'Profitable and insolvent', text: 'You were making money on paper when the cash ran out. Growth ties cash up in receivables, inventory and plant before it pays back. Watch the cash-flow statement, not just the income statement.', terms: ['workingCapital', 'cashFlow'] });
  else if (o?.how === 'bankrupt') lessons.push({ title: 'Running out of runway', text: 'The money ran out before the business could pay its own way. Cut burn or raise capital while you still have quarters to spare; desperate fundraising is the most expensive kind.', terms: ['runway', 'burnRate'] });
  if (stake < 0.2 && raised > 0) lessons.push({ title: 'Diluted away', text: `You raised ${money(raised)} and own ${pct(stake, 0)} of what you built. Each round looked reasonable; together they sold the company. Raise when valuations are high and only what you need.`, terms: ['dilution'] });
  if (o?.how === 'ousted') lessons.push({ title: 'Losing the board', text: 'Below half the votes, a founder serves at the investors’ pleasure. Persistent losses spend that patience.', terms: ['dilution'] });
  const traps = c.investments.filter((i) => INV[i.def]?.trap && i.state === 'failed');
  if (traps.length) lessons.push({ title: 'A deal that was too good', text: `${traps.map((i) => INV[i.def].name).join(', ')} failed in exactly the way due diligence would have warned you about. Cheap checks before expensive commitments.`, terms: ['dueDiligence'] });
  const breaches = c.loans.reduce((s, l) => s + l.breaches, 0) + (g.eventLog.filter((e) => e.id === 'covenant_breach').length);
  if (breaches) lessons.push({ title: 'The lender took the wheel', text: 'Covenant breaches hand control to lenders before the money is gone. Borrow with headroom you can keep through a recession.', terms: ['covenant', 'leverage'] });
  const wars = g.eventLog.filter((e) => e.id === 'rival_price_war').length;
  if (wars >= 2) lessons.push({ title: 'Price wars', text: `You fought ${wars} price wars. The winner of a price war is the lowest-cost producer with the deepest pockets; everyone else needs a reason for customers to pay more.`, terms: ['moat', 'pricingPower'] });
  const lost = c.offices.reduce((s, x) => s + (x.last?.lost ?? 0), 0);
  if (lost > (qs[qs.length - 1]?.pnl.revenue ?? 0) * 0.1) lessons.push({ title: 'Customers you could not serve', text: 'At the end you were still turning away demand. Capacity takes quarters to add; plan it before the orders arrive.', terms: ['capacity'] });
  if (a.luck < -Math.abs(a.execution) * 0.5 && a.luck < 0) lessons.push({ title: 'Unlucky, not wrong', text: 'More of your result came from bad dice than bad decisions. Resilience — cash, insurance, hedges — is how a company survives the luck it does not deserve.', terms: ['expectedValue', 'hedging'] });
  if (lessons.length < 3) lessons.push({ title: 'The constraint', text: 'Every office is limited by one thing at a time — demand, people or plant. The best players spend almost all their effort on whichever one binds.', terms: ['capacity', 'utilisation'] });
  if (lessons.length < 3) lessons.push({ title: 'Cash is a fact', text: 'Profit is an opinion. Keep enough cash and credit to survive the next recession and you get to play the recovery.', terms: ['runway'] });
  return {
    headline: o ? o.title : 'Still going',
    verdict: why[biggest[0]][0] + ' ' + why[biggest[0]][1],
    stats: [
      ['Lasted', o ? turnLabel(o.turn) : turnLabel(g.turn)],
      ['Peak revenue (a year)', money(peakRev)],
      ['Peak valuation', money(peakVal)],
      ['Final valuation', money(c.valuation)],
      ['Your stake at the end', `${pct(stake, 1)}, worth ${money(stake * c.valuation)}`],
      ['Money raised from investors', money(raised)],
      ['Offices at the end', String(c.offices.length)],
      ['People at the end', String(companyHeadcount(c))],
      ['Decisions taken in events', String(g.eventLog.length)],
      ['Rivals outlasted', `${g.rivals.filter((r) => !r.alive).length} of ${g.rivals.length}`],
    ],
    shares,
    moments: a.notes.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 8).sort((x, y) => x.turn - y.turn),
    lessons: lessons.slice(0, 4),
  };
}
