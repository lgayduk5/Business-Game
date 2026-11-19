// Selling the company as a way to finish (review wave 3): a take-private offer ends the game with a grade,
// judged on the price the buyer paid.
import { SPECIALS } from './events';
import { founderStake } from './finance';
import { news } from './mods';
import type { EventCtx, GameState } from './types';
import { money } from './util';
import { finalGrade } from './victory';

Object.assign(SPECIALS, {
  takePrivate: (g: GameState, _ctx: EventCtx, premium: number) => {
    const c = g.company;
    const price = c.valuation * (premium || 1.3);
    c.valuation = price; // the price paid is what the company turned out to be worth
    const fg = finalGrade(g);
    g.status = fg.won ? 'won' : 'lost';
    g.outcome = {
      kind: fg.won ? 'won' : 'lost', how: 'exit', title: `Exit, grade ${fg.grade}: ${fg.label}`, turn: g.turn, grade: fg.grade, final: fg,
      text: `A buyout fund has bought ${c.name} for ${money(price)}. Your ${Math.round(founderStake(c) * 100)}% came to ${money(price * founderStake(c))}. Selling is a fine way to finish; the grade says how good a finish it was.`,
    };
    news(g, `${c.name} has agreed to be taken private for ${money(price)}.`, 'good');
    return 'The company is sold';
  },
});
