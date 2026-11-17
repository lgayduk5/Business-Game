import { CITIES, IND_LIST, endTurn, newGame, raiseEquity, setReqs, staffingHint, type GameState, type NewGameOpts } from '../engine/src/index';

export function opts(over: Partial<NewGameOpts> = {}): NewGameOpts {
  return { name: 'Testco', industry: IND_LIST[0].id, city: CITIES[0].id, founder: 'engineer', difficulty: 'normal', seed: 'test-seed', mode: 'standard', ...over };
}

/** A minimal sensible player: staff to demand, add sales people when affordable, raise money when short. */
export function simplePolicy(g: GameState) {
  const c = g.company;
  for (const o of c.offices) {
    const hint = staffingHint(g, o);
    setReqs(g, o.id, 'ops', Math.max(0, hint.ops - o.staff.ops.n));
    setReqs(g, o.id, 'admin', Math.max(0, hint.admin - o.staff.admin.n));
    const last = c.quarters[c.quarters.length - 1];
    if (last && c.books.cash > 6 * Math.max(1, last.pnl.revenue - last.ebitda) && o.last?.bind === 'demand') setReqs(g, o.id, 'sales', 1);
  }
  const burn = c.quarters.length ? -Math.min(0, c.quarters[c.quarters.length - 1].cf.cfo) : 0;
  if (g.equityOffer && burn > 0 && c.books.cash < burn * 4) raiseEquity(g, 0.18);
}

export function play(g: GameState, turns: number, policy: (g: GameState) => void = simplePolicy) {
  for (let i = 0; i < turns && g.status === 'playing'; i++) {
    policy(g);
    endTurn(g);
  }
  return g;
}

export function findBadNumbers(x: unknown, path = 'state', out: string[] = []): string[] {
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) out.push(path);
  } else if (Array.isArray(x)) x.forEach((v, i) => findBadNumbers(v, `${path}[${i}]`, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) findBadNumbers(v, `${path}.${k}`, out);
  return out;
}
