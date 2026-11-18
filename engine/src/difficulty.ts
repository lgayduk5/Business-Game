// Difficulty levels. Every number a level changes lives here, so the new-company wizard can show
// players exactly what they are choosing (and so no other module has to import newgame.ts for it).
import type { Difficulty } from './types';

export interface DiffDef {
  label: string;
  /** Who the level is for. */
  who: string;
  /** What to expect across all industries, in plain words (kept in line with the balance harness). The cards show the measured rate for the industry picked (winrates.ts); this is the fallback. */
  expect: string;
  cash: number; // starting cash multiplier
  rivals: number; rivalSize: number; rivalEff: number; aggression: number;
  rivalSales: number; rivalRd: number; rivalMax: number; // how well rivals are run: S&M and R&D intensity, office cap
  defend: number; // how hard rivals fight back where you are taking their customers
  rivalOps: number; // operational quality edge of rivals (people and process)
  events: number; // multiplier on the event deck rate
  recession: number; // multiplier on the odds of a recession starting
  spread: number; // extra points lenders charge you
  appetite: number; // investor appetite adjustment
  // victory bars (before industry factors and inflation)
  titan: number; // Titan valuation bar, $
  blueChip: number; // Blue chip valuation bar, $
  kingShare: number; // Category king: share of the named companies' sales
  techBar: number; // Pioneer technology level
  goodRev: number; // Good company revenue bar, $ a year
  ipoMinRev: number; // revenue needed to list, $ a year
  entrants: number; // new rivals per decade, on average
  churn: number; // multiplier on product churn (industries where customers leave for a better product)
}

export const DIFF: Record<Difficulty, DiffDef> = {
  easy: {
    label: 'Easy', who: 'Your first company, or learning how the money works.',
    expect: 'A sensible plan wins about 9 games in 10. Mistakes are forgiven.', // balance report: honest strategies about 93%, the best 95%
    cash: 1.6, rivals: 4, rivalSize: 0.6, rivalEff: 1.08, aggression: 0.5, rivalSales: 0.75, rivalRd: 0.75, rivalMax: 8, defend: 0, rivalOps: -6,
    events: 0.6, recession: 0.6, spread: -0.5, appetite: 0.25,
    titan: 0.8e9, blueChip: 3.75e8, kingShare: 0.3, techBar: 74, goodRev: 25e6, ipoMinRev: 25e6, entrants: 1.5, churn: 0,
  },
  normal: {
    label: 'Normal', who: 'You know what a balance sheet is and want a fair fight.',
    expect: 'A good plan wins about 8 games in 10; a careless one goes broke.', // honest about 84%, best 86%
    cash: 1.0, rivals: 5, rivalSize: 1.0, rivalEff: 1.0, aggression: 1.0, rivalSales: 1.0, rivalRd: 1.0, rivalMax: 12, defend: 0.6, rivalOps: 3,
    events: 1.0, recession: 1.0, spread: 0, appetite: 0,
    titan: 2e9, blueChip: 1e9, kingShare: 0.35, techBar: 80, goodRev: 50e6, ipoMinRev: 40e6, entrants: 2.5, churn: 0.25,
  },
  hard: {
    label: 'Hard', who: 'You have won on Normal and want rivals who punish mistakes.',
    expect: 'A good plan wins about 6 games in 10. Slack gets punished.', // honest about 64%, best 70%
    cash: 0.85, rivals: 5, rivalSize: 1.4, rivalEff: 0.95, aggression: 1.3, rivalSales: 1.35, rivalRd: 1.35, rivalMax: 15, defend: 1.3, rivalOps: 10,
    events: 1.15, recession: 1.2, spread: 0.5, appetite: -0.1,
    titan: 4e9, blueChip: 2e9, kingShare: 0.4, techBar: 84, goodRev: 100e6, ipoMinRev: 60e6, entrants: 3, churn: 0.6,
  },
  brutal: {
    label: 'Brutal', who: 'A test, not a story. Expect to lose a few companies.',
    expect: 'Even a very good plan wins only about one game in three.', // honest about 31%, best 35%
    cash: 0.7, rivals: 6, rivalSize: 1.9, rivalEff: 0.9, aggression: 1.7, rivalSales: 1.7, rivalRd: 1.6, rivalMax: 19, defend: 2, rivalOps: 15,
    events: 1.3, recession: 1.4, spread: 2, appetite: -0.2,
    titan: 7e9, blueChip: 3.75e9, kingShare: 0.45, techBar: 87, goodRev: 200e6, ipoMinRev: 80e6, entrants: 3.5, churn: 0.75,
  },
};

export const DIFFICULTIES = Object.keys(DIFF) as Difficulty[];

/**
 * A Sprint is the same game in ten years rather than twenty-five, so its bars are lower: the money bars a fifth of
 * the full game's and listing at half the revenue. The technology, reputation and ESG bars only matter if Pioneer or
 * Good company is switched back on (a Sprint does not offer them: SPRINT_OFF). The qualifying periods are halved
 * (victory.ts), and staged projects run at twice the pace (invest.ts).
 */
export const SPRINT_BARS = { money: 0.2, ipoRev: 0.5, tech: 20, rep: 80, esg: 72 };
/**
 * Victories a Sprint does not offer. Each needs decades or a lead in size over rivals that start several times
 * bigger (the reason a Sprint ranks by growth): being the most valuable company in the industry (Titan), two
 * listed years worth more than half your rivals (Blue chip), a reputation built over a generation (Good company),
 * a moonshot that only biotech can land and lead with inside a decade (Pioneer), and outlasting every rival, which
 * in ten years means buying them all (Last one standing). A Sprint is won on the grade at the end, or early as
 * Category king.
 */
export const SPRINT_OFF = ['marketCap', 'ipo', 'reputation', 'innovation', 'lastStanding'] as const;

/** Plain-language list of what a level changes, compared with Normal. */
export function diffChanges(d: Difficulty): string[] {
  const x = DIFF[d];
  const n = DIFF.normal;
  const times = (v: number) => `×${Number(v.toFixed(2))}`;
  const out: string[] = [];
  out.push(`${x.rivals} rivals, ${x.rivalSize === 1 ? 'normal size' : `${times(x.rivalSize)} the usual size`}, entering up to ${x.rivalMax} cities`);
  out.push(x.defend === 0 ? 'Rivals do not fight back when you take their customers' : x.defend <= n.defend ? 'Rivals defend their home markets' : 'Rivals fight hard for every customer you take');
  if (x.cash !== 1) out.push(`${times(x.cash)} starting cash`);
  if (x.spread) out.push(`Loans ${x.spread > 0 ? '+' : '−'}${Math.abs(x.spread)} point${Math.abs(x.spread) === 1 ? '' : 's'}`);
  if (x.events !== 1 || x.recession !== 1) out.push(`${times(x.events)} events, ${times(x.recession)} recession odds`);
  if (x.churn > n.churn) out.push(x.churn >= 0.7 ? 'Software customers desert a product that falls behind' : 'Software customers leave a product that falls behind');
  else if (x.churn === 0) out.push('Software customers stay even when your product lags');
  return out;
}
