// "Next quarter, if nothing changes" (review wave 3): play the coming quarter on a throwaway copy with
// today's decisions, no new events and a calm economy, and report what each office would do.
import { endTurn } from './turn';
import type { GameState, OfficeResult } from './types';

export interface OfficeForecast {
  demand: number; // units customers would buy from you
  capacity: number; // units you could deliver
  sold: number;
  revenue: number;
  contribution: number;
  bind: OfficeResult['bind'];
  lost: number;
}
export interface Forecast {
  turn: number;
  offices: Record<string, OfficeForecast>;
  revenue: number;
  ebitda: number;
  ni: number;
  cash: number; // cash at the end of the coming quarter
  cfo: number;
}

/**
 * A dry run of the coming quarter. Decisions already made (hiring, prices, pay, building) are kept; cards
 * waiting for an answer are left unanswered, no new ones are drawn, and the economy holds steady. Hiring and
 * demand still carry their usual noise, so read it as a likely outcome rather than a promise.
 */
export function forecastQuarter(g: GameState): Forecast {
  const h: GameState = JSON.parse(JSON.stringify(g));
  h.settings.sandbox = { ...h.settings.sandbox, noEvents: true, calmMacro: true, noBankruptcy: true };
  h.queue = [];
  h.scheduled = [];
  endTurn(h);
  const c = h.company;
  const q = c.quarters[c.quarters.length - 1];
  const offices: Record<string, OfficeForecast> = {};
  for (const o of c.offices) {
    const l = o.last;
    if (!l || !g.company.offices.some((x) => x.id === o.id)) continue;
    offices[o.id] = { demand: l.demand, capacity: l.capacity, sold: l.sold, revenue: l.revenue, contribution: l.contribution, bind: l.bind, lost: l.lost };
  }
  return { turn: g.turn, offices, revenue: q.pnl.revenue, ebitda: q.ebitda, ni: q.ni, cash: c.books.cash, cfo: q.cf.cfo };
}
