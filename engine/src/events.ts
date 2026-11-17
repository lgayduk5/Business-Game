// Event engine (filled in at M3).
import type { EventCtx, GameState } from './types';
export function queueEvent(_g: GameState, _id: string, _ctx: EventCtx = {}): boolean {
  return false;
}
export function drawEvents(_g: GameState) {}
