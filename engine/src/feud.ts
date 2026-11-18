// What has passed between the player and each rival, for the nemesis panel on HQ (review wave 3).
import { PERSONALITY } from './content';
import type { GameState, Rival } from './types';

const KEEP = 12;

/** Record a moment in the feud with a rival: something you did to them, or they to you. */
export function feud(g: GameState, r: Rival, who: 'you' | 'them', text: string) {
  r.feud ??= [];
  r.feud.push({ turn: g.turn, who, text });
  if (r.feud.length > KEEP) r.feud.shift();
}

/** How bitter the rivalry is: hostility, a long history, and bad blood. */
export const feudScore = (r: Rival) => r.hostility + 0.5 * (r.feud?.length ?? 0) - r.relation / 20 + ((PERSONALITY[r.personality].grudgeDecay ?? 1) < 1 ? 1 : 0);

/** The rival with the deepest grudge against you, once there is a real feud. */
export function nemesis(g: GameState): Rival | undefined {
  const cands = g.rivals.filter((r) => r.alive && r.known && (r.hostility >= 3 || (r.feud?.length ?? 0) >= 2));
  return cands.sort((a, b) => feudScore(b) - feudScore(a))[0];
}
