// Engine worker: resolves one or more quarters off the main thread.
import { runQuarters, type GameState } from '@engine';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void };
ctx.onmessage = (e: MessageEvent<{ id: number; state: GameState; turns: number }>) => {
  const { id, state, turns } = e.data;
  ctx.postMessage({ id, ...runQuarters(state, turns) });
};
