// Victory and defeat (extended at M4).
import type { GameState } from './types';
import { news } from './mods';

export function checkEnd(g: GameState) {
  if (g.status !== 'playing') return;
  const c = g.company;
  if (c.negCashTurns >= 2 && !g.settings.sandbox.noBankruptcy) {
    g.status = 'lost';
    g.outcome = { kind: 'lost', how: 'bankrupt', title: 'Insolvent', turn: g.turn,
      text: `${c.name} ran out of cash and could not meet its obligations. The administrators have taken the keys.` };
    news(g, `${c.name} has filed for bankruptcy.`, 'bad');
    return;
  }
  if (g.turn + 1 >= g.maxTurns) {
    g.status = 'won';
    g.outcome = { kind: 'won', how: 'time', title: 'The final bell', turn: g.turn, text: `${c.name} is still a going concern after ${g.maxTurns / 4} years.` };
  }
}
