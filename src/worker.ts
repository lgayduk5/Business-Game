// Engine worker: resolves one or more quarters off the main thread.
import { endTurn, needsAttention, type GameState } from '@engine';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void };
ctx.onmessage = (e: MessageEvent<{ id: number; state: GameState; turns: number }>) => {
  const { id, state, turns } = e.data;
  let n = 0;
  let reason = '';
  while (n < turns) {
    endTurn(state);
    n++;
    reason = needsAttention(state);
    if (reason) break;
  }
  ctx.postMessage({ id, state, n, reason });
};
