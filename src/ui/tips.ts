// Reusable explanations for the numbers that appear on several screens.
import {
  CITY, INDUSTRIES, attritionRate, covenantStatus, creditRating, founderStake, headcount, hirePool, marketWage, money, pct, refQuality,
  type GameState, type Office, type Role,
} from '@engine';
import { $, N, P, explain, tip, x2, type Row, esc } from './kit';

const last = (g: GameState) => g.company.quarters[g.company.quarters.length - 1];

export function runway(g: GameState): { quarters: number; burn: number } {
  const q = last(g);
  const burn = q ? -(q.cf.cfo + q.cf.capex) : 0;
  return { burn, quarters: burn > 0 ? g.company.books.cash / burn : Infinity };
}

export function cashTip(g: GameState): string {
  const c = g.company;
  const q = last(g);
  const r = runway(g);
  const rows: Row[] = q
    ? [['Cash from operations', money(q.cf.cfo)], ['Investing (capex, deals)', money(q.cf.cfi)], ['Financing (debt, equity)', money(q.cf.cff)], ['Change last quarter', money(q.cf.net), true],
        ['Runway at this burn', r.quarters === Infinity ? 'not burning cash' : `${r.quarters.toFixed(1)} quarters`]]
    : [];
  return $(c.books.cash, 'Cash', 'Money in the bank right now. Profit is an opinion; cash is a fact. If this goes below zero for two quarters running, the company is insolvent.', rows, ['runway', 'workingCapital']);
}

export function valuationTip(g: GameState): string {
  const c = g.company;
  const v = c.valParts;
  const w = v.ebitdaW ?? 0;
  // new grid plant is left out of growth until its sales are like-for-like; opening costs are left out of EBITDA
  const lfl = Math.abs((v.growthAll ?? v.growth ?? 0) - (v.growth ?? 0)) > 0.005;
  const opening = (v.opening ?? 0) > 0 ? ' before opening costs' : '';
  const rows: Row[] = [
    ['Revenue, last 12 months', money(v.rev ?? 0)],
    ['× industry multiple', x2(v.mult ?? 0, 1) + '×'],
    ['× growth factor', `${x2(v.growthF ?? 1)} (${lfl ? `like-for-like growth ${pct(v.growth ?? 0)}; ${pct(v.growthAll ?? 0)} counting new plant` : `growth ${pct(v.growth ?? 0)}`})`],
    ['× margin factor', `${x2(v.marginF ?? 1)} (EBITDA${opening} ${pct(v.margin ?? 0)} vs ${pct(v.target ?? 0)} typical)`],
    ['= priced on revenue', money(v.byRev ?? 0)],
  ];
  if (w > 0) {
    rows.push([`EBITDA${opening}, last 12 months`, money(v.ebitda ?? 0)], ['× EBITDA multiple × growth', `${x2(v.ebitdaMult ?? 0, 1)}× × ${x2(v.growthF ?? 1)}`], ['= priced on profits', money(v.byEbitda ?? 0)],
      [`Blend: growth below 25% shifts investors to profits`, `${pct(1 - w)} revenue / ${pct(w)} profits`]);
  }
  rows.push(
    ['× tech, brand, reputation', x2(v.qualityF ?? 1)],
    ['× market sentiment', x2(v.sentiment ?? 1)],
    ['× interest rates', `${x2(v.rateF ?? 1)} (policy rate ${(v.rate ?? 3).toFixed(2)}%)`],
    ['Operating value', money(v.ops ?? 0), true],
  );
  if ((v.pipeline ?? 0) > 0) rows.push(['+ R&D pipeline (risk-adjusted)', money(v.pipeline)]);
  if ((v.cip ?? 0) > 0) rows.push(['+ New plant not yet in a year of sales, at cost', money(v.cip)]);
  if ((v.ev ?? 0) > (v.ops ?? 0) + (v.pipeline ?? 0) + (v.cip ?? 0) + 1) rows.push(['Floor: promise or asset value', money(v.ev)]);
  rows.push(['+ cash', money(v.cash ?? 0)], ['− debt', money(v.debt ?? 0)]);
  if (c.cap.isPublic) rows.push(['× market premium to fair value', x2(v.premium ?? 1)]);
  else rows.push(['× private-company discount', '0.80']);
  rows.push([c.cap.isPublic ? 'Market capitalisation' : 'Equity value', money(c.valuation), true]);
  return $(c.valuation, c.cap.isPublic ? 'Market capitalisation' : 'Company valuation',
    c.cap.isPublic ? 'Share price × shares outstanding. The market pays for growth and margins, and punishes missed expectations.' : 'What investors would pay for all the shares today. Fast growers are priced on revenue; as growth slows, on profits. Higher interest rates lower every multiple.',
    rows, ['valuation', 'multiple', 'ebitda']);
}

export function stakeTip(g: GameState): string {
  const c = g.company;
  const s = founderStake(c);
  const rows: Row[] = [['Your shares', Math.round(c.cap.founder).toLocaleString()], ['All shares', Math.round(c.cap.shares).toLocaleString()],
    ...c.cap.holders.filter((h) => h.shares > 1).slice(-5).map((h): Row => [h.name, pct(h.shares / c.cap.shares, 1)]), ['Your stake is worth', money(s * c.valuation), true]];
  return P(s, 'Your ownership', 'The share of the company you still own. Every equity raise sells part of it; below 50% the board can overrule you.', rows, 1, ['dilution']);
}

export function shareTip(o: Office): string {
  const r = o.last;
  if (!r) return N(pct(o.share, 2), 'Market share', 'Your share of this city’s market. No trading history yet.');
  const a = r.attract;
  const rows: Row[] = [
    ['Sales reach (people + marketing)', `${x2(a.m)}  (${pct(a.effort, 0)} coverage)`],
    ['× quality', `${x2(a.q)}  (${a.quality.toFixed(0)} vs bar)`],
    ['× brand', x2(a.b)],
    ['× price', x2(a.p)],
    ['× presence in the city', x2(a.pres)],
    ['× reputation and programs', x2(a.mods)],
    ['Your pull', x2(a.A, 3), true],
    ['Everyone’s pull incl. locals', x2(a.total, 2)],
    ['Share you are heading for', pct(r.target, 2), true],
    ...(r.churn ? [['− customers who left for a better product', pct(r.churn, 2)] as Row] : []),
    ['Share today', pct(o.share, 2)],
  ];
  return P(o.share, 'Market share', `Customers choose on reach, quality, brand and price. Your pull divided by everyone’s is the share you are heading for; ${INDUSTRIES[o.ind].short} customers move about ${pct(INDUSTRIES[o.ind].stick)} of the way each quarter.${INDUSTRIES[o.ind].productChurn ? ' If a rival here has better technology, some of your customers leave for it every quarter — more the further behind you are, and more on harder levels.' : ''}`, rows, 2, ['marketShare', 'elasticity']);
}

export function capacityTip(g: GameState, o: Office): string {
  const r = o.last;
  const def = INDUSTRIES[o.ind];
  if (!r) return N('—', 'Capacity', 'How much this office can deliver in a quarter.');
  const rows: Row[] = [[`${def.roles.ops} × output each`, `${o.staff.ops.n} × ${def.opsOut}`],
    ...Object.entries(r.prodParts).filter(([, v]) => Math.abs(v - 1) > 0.005).map(([k, v]): Row => [`× ${k.toLowerCase()}`, x2(v)]),
    ['What the team can deliver', Math.round(r.laborCap).toLocaleString(), true]];
  if (def.capPerUnit > 0) rows.push(['What the plant can deliver', Math.round(o.cap).toLocaleString()]);
  rows.push(['Capacity (the lower of the two)', Math.round(r.capacity).toLocaleString(), true], ['Customer demand', Math.round(r.demand).toLocaleString()]);
  return N(pct(r.util), 'Utilisation', 'Units delivered as a share of what the office could deliver. Under 70% you are paying people to wait; over 95% quality slips and people burn out.', rows, ['utilisation', 'capacity']);
}

export function moraleTip(o: Office): string {
  const parts = o.last?.moraleParts ?? {};
  const rows: Row[] = Object.entries(parts).filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]): Row => [k, (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0)]);
  if (o.last) rows.push(['Heading towards', o.last.moraleTarget.toFixed(0), true]);
  return N(o.morale.toFixed(0), 'Morale', 'How people in this office feel, 0–100. It drifts 30% of the way to its target each quarter. Low morale cuts productivity and raises attrition.', rows, ['morale', 'attrition']);
}

export function attritionTip(g: GameState, o: Office): string {
  const r = attritionRate(g, o);
  return P(r, 'Attrition', `Share of staff expected to quit each quarter (${pct(1 - (1 - r) ** 4)} a year). Driven by morale, pay against the market, how tight the labour market is, workload and culture. Every leaver costs a recruiting fee and a quarter of ramp-up.`,
    [['Industry baseline', pct(INDUSTRIES[o.ind].baseAttr, 1)], ['Pay vs market', pct(o.pay)], ['Morale', o.morale.toFixed(0)], ['Left last quarter', String(o.last?.quits ?? 0)]], 1, ['attrition']);
}

export function wageTip(g: GameState, o: Office, role: Role): string {
  const w = marketWage(g, o, role);
  return $(w * o.pay * o.staff[role].n, 'Payroll', `What this team costs each quarter.`,
    [['Market wage per person', money(w)], ['× your pay policy', pct(o.pay)], ['× people', String(o.staff[role].n)], [`${CITY[o.city].name} wage index`, x2(CITY[o.city].wage)]], ['opex']);
}

export function poolTip(g: GameState, o: Office, role: Role): string {
  const p = hirePool(g, o, role);
  return N(`~${Math.max(1, Math.round(p))}`, 'Hiring pool', `Roughly how many ${INDUSTRIES[o.ind].roles[role].toLowerCase()} you can land per quarter here. Deeper in big, skilled cities; raise pay or your reputation to widen it. Rivals in the city shrink it.`,
    [['City talent depth', String(CITY[o.city].talent)], ['Your pay policy', pct(o.pay)], ['Labour market tightness', x2(g.macro.labor)]]);
}

export function ratingTip(g: GameState): string {
  const r = creditRating(g);
  const cov = covenantStatus(g);
  return tip(esc(r.rating), explain('Credit rating', 'How lenders see you. It sets the spread you pay over the central-bank rate and how much anyone will lend.',
    [...Object.entries(r.parts).map(([k, v]): Row => [k, (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0)]), ['Score', r.score.toFixed(0), true], ...(r.cap ? [['Best rating at your size', `${r.cap} (BB below $50M of revenue, BBB below $250M)`] as Row] : []), ['Spread over policy rate', `${r.spread.toFixed(1)} pts`],
      ['Debt / EBITDA', cov.lev > 50 ? 'n/a' : x2(cov.lev, 1) + '×'], ['EBITDA / interest', cov.cov > 50 ? 'n/a' : x2(cov.cov, 1) + '×']], ['creditRating', 'leverage', 'covenant']));
}

export const qualityTip = (g: GameState, o: Office) =>
  N((o.last?.attract.quality ?? 0).toFixed(0), 'Quality', 'What customers experience: part technology, part the skill and mood of the people delivering it, part process. The bar rises a little every year as the industry improves.',
    [['Your quality', (o.last?.attract.quality ?? 0).toFixed(0)], ['The bar this year', refQuality(g).toFixed(0)], ['Technology level', (g.company.tech[o.ind] ?? 0).toFixed(0)], ['Team skill', o.staff.ops.skill.toFixed(0)], ['Morale', o.morale.toFixed(0)]]);

export const headTip = (g: GameState) => {
  const c = g.company;
  return N(c.offices.reduce((s, o) => s + headcount(o), 0), 'Headcount', 'Everyone on the payroll.', c.offices.map((o): Row => [o.name, String(headcount(o))]));
};
