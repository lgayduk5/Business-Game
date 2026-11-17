// Difficulty levels. Every number a level changes lives here, so the new-company wizard can show
// players exactly what they are choosing (and so no other module has to import newgame.ts for it).
import type { Difficulty } from './types';

export interface DiffDef {
  label: string;
  /** Who the level is for. */
  who: string;
  /** What to expect, in plain words (kept in line with the balance harness). */
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
  kingShare: number; // Category king: share of the named companies' sales
  techBar: number; // Pioneer technology level
  goodRev: number; // Good company revenue bar, $ a year
  ipoMinRev: number; // revenue needed to list, $ a year
  entrants: number; // new rivals per decade, on average
}

export const DIFF: Record<Difficulty, DiffDef> = {
  easy: {
    label: 'Easy', who: 'Your first company, or learning how the money works.',
    expect: 'A sensible plan nearly always wins. Mistakes are forgiven.',
    cash: 1.6, rivals: 4, rivalSize: 0.6, rivalEff: 1.08, aggression: 0.5, rivalSales: 0.75, rivalRd: 0.75, rivalMax: 8, defend: 0, rivalOps: -6,
    events: 0.6, recession: 0.6, spread: -0.5, appetite: 0.25,
    titan: 1.5e9, kingShare: 0.3, techBar: 82, goodRev: 25e6, ipoMinRev: 25e6, entrants: 1.5,
  },
  normal: {
    label: 'Normal', who: 'You know what a balance sheet is and want a fair fight.',
    expect: 'A strong plan usually wins; a careless one goes broke.',
    cash: 1.0, rivals: 5, rivalSize: 1.0, rivalEff: 1.0, aggression: 1.0, rivalSales: 1.0, rivalRd: 1.0, rivalMax: 12, defend: 0.6, rivalOps: 3,
    events: 1.0, recession: 1.0, spread: 0, appetite: 0,
    titan: 4e9, kingShare: 0.35, techBar: 88, goodRev: 50e6, ipoMinRev: 40e6, entrants: 2.5,
  },
  hard: {
    label: 'Hard', who: 'You have won on Normal and want rivals who punish mistakes.',
    expect: 'A strong plan wins more often than not. Slack gets punished.',
    cash: 0.85, rivals: 5, rivalSize: 1.4, rivalEff: 0.95, aggression: 1.3, rivalSales: 1.35, rivalRd: 1.35, rivalMax: 15, defend: 1.3, rivalOps: 10,
    events: 1.15, recession: 1.2, spread: 0.5, appetite: -0.1,
    titan: 8e9, kingShare: 0.4, techBar: 91, goodRev: 100e6, ipoMinRev: 60e6, entrants: 3,
  },
  brutal: {
    label: 'Brutal', who: 'A test, not a story. Expect to lose a few companies.',
    expect: 'Even a very good plan wins only some of the time.',
    cash: 0.7, rivals: 6, rivalSize: 1.9, rivalEff: 0.9, aggression: 1.7, rivalSales: 1.7, rivalRd: 1.6, rivalMax: 19, defend: 2, rivalOps: 15,
    events: 1.3, recession: 1.4, spread: 1, appetite: -0.2,
    titan: 15e9, kingShare: 0.45, techBar: 94, goodRev: 200e6, ipoMinRev: 80e6, entrants: 3.5,
  },
};

export const DIFFICULTIES = Object.keys(DIFF) as Difficulty[];

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
  return out;
}
