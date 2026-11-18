// App state, render loop, event delegation and the bridge to the engine worker.
import { endTurn, needsAttention, type ActionResult, type Difficulty, type FounderId, type GameState, type IndustryId, type RegionId } from '@engine';
import { fmtLive, getTip, resetTips } from './kit';

export type Tab = 'hq' | 'map' | 'ops' | 'corp' | 'intel';
export interface Modal { kind: string; data?: any }
export interface Wizard { step: number; industry: IndustryId | ''; city: string; founder: FounderId; difficulty: Difficulty; name: string; seed: string; mode: 'standard' | 'sandbox' | 'scenario'; scenario?: string; sprint?: boolean; ironman?: boolean }

export const ui = {
  g: null as GameState | null,
  screen: 'title' as 'title' | 'new' | 'game',
  tab: 'hq' as Tab,
  sub: {} as Record<string, string>,
  sel: {} as { office?: string; city?: string; region?: RegionId; rival?: number; stmt?: string },
  modal: null as Modal | null,
  wizard: null as Wizard | null,
  busy: '' as string,
  saves: [] as { slot: string; name: string; turn: number; when: number; label: string; industry: string; gameId: string }[],
};

type Handler = (d: DOMStringMap, el: HTMLElement) => void | Promise<void>;
/** Record that the player has done something (drives the tutorial checklist; saved with the game). */
export function mark(key: string) {
  if (ui.g && !ui.g.counters['tut:' + key]) ui.g.counters['tut:' + key] = 1;
}
const handlers: Record<string, Handler> = {};
/**
 * Persistence hooks, wired up by the saves screen. Anything the player does in a game is saved shortly
 * afterwards (soon) and at once when the app is hidden or closed (now), so a phone that kills the tab
 * mid-quarter loses nothing.
 */
export const persist = { soon: (): void => undefined, now: (): Promise<void> => Promise.resolve() };
function afterHandler(r: void | Promise<void>) {
  void Promise.resolve(r).finally(() => {
    if (ui.g && ui.screen === 'game') persist.soon();
  });
}
export const on = (name: string, fn: Handler) => (handlers[name] = fn);

let view: () => string = () => '';
export const setView = (v: () => string) => (view = v);
const hooks: (() => void)[] = [];
export const afterRender = (f: () => void) => hooks.push(f);

/**
 * A selector that finds "the same" control after a re-render: its tag plus every data-* attribute and
 * id, and its position among elements that match. Rendering replaces the whole app's HTML, so without
 * this a slider moved with the keyboard would lose focus after every step.
 */
function focusKey(el: HTMLElement, root: HTMLElement): { sel: string; idx: number } | null {
  if (el === document.body || !root.contains(el)) return null;
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'id' || a.name === 'type');
  if (!attrs.length) return null;
  const sel = el.tagName.toLowerCase() + attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  const idx = [...root.querySelectorAll(sel)].indexOf(el);
  return idx < 0 ? null : { sel, idx };
}

export function render(keepScroll = true) {
  const root = document.getElementById('app')!;
  const y = window.scrollY;
  const modalEl = root.querySelector('.modal');
  const my = modalEl?.scrollTop ?? 0;
  const active = document.activeElement as HTMLElement | null;
  const fk = active ? focusKey(active, root) : null;
  const sel = active instanceof HTMLInputElement && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
  resetTips();
  hideTip();
  root.innerHTML = view();
  document.body.style.overflow = ui.modal ? 'hidden' : '';
  window.scrollTo(0, keepScroll ? y : 0);
  const m2 = root.querySelector('.modal');
  if (m2 && keepScroll) m2.scrollTop = my;
  if (fk) {
    const el = root.querySelectorAll<HTMLElement>(fk.sel)[fk.idx];
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && el instanceof HTMLInputElement) el.setSelectionRange(sel[0], sel[1]);
    }
  }
  for (const h of hooks) h();
}

// ── toast
let toastTimer = 0;
export function toast(msg: string, bad = false) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), bad ? 4200 : 2800);
}
/** Run an engine action, tell the player what happened, re-render. */
export function act(r: ActionResult, sound?: () => void) {
  toast(r.msg, !r.ok);
  if (r.ok) sound?.();
  render();
  return r.ok;
}

// ── tooltip popover (tap to open, tap anywhere to close)
let tipEl: HTMLElement | null = null;
export function hideTip() {
  tipEl?.remove();
  tipEl = null;
}
function showTip(target: HTMLElement) {
  hideTip();
  const el = document.createElement('div');
  el.className = 'tipbox';
  el.setAttribute('role', 'tooltip');
  el.innerHTML = getTip(Number(target.dataset.tip));
  document.body.appendChild(el);
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(10, Math.min(window.innerWidth - w - 10, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 8;
  el.style.left = left + 'px';
  el.style.top = (above > 8 ? above : Math.min(window.innerHeight - h - 8, r.bottom + 8)) + 'px';
  tipEl = el;
}

export function initEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const inTip = t.closest('.tipbox');
    const a = t.closest<HTMLElement>('[data-a]');
    if (inTip && !a) return;
    const tp = t.closest<HTMLElement>('[data-tip]');
    if (tp) {
      e.preventDefault();
      showTip(tp);
      mark('tip');
      return;
    }
    hideTip();
    if (a && !(a as HTMLButtonElement).disabled) {
      const fn = handlers[a.dataset.a!];
      mark('act:' + a.dataset.a);
      if (a.dataset.a === 'tab') mark('tab:' + a.dataset.v);
      if (a.dataset.a === 'sub') mark(`sub:${a.dataset.k}:${a.dataset.v}`);
      if (fn) afterHandler(fn(a.dataset, a));
      return;
    }
    if (t.classList.contains('scrim') && ui.modal && !ui.modal.data?.sticky) {
      ui.modal = null;
      render();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const name = t.dataset?.c;
    if (name) mark('act:' + name);
    if (name && handlers[name]) afterHandler(handlers[name]({ ...t.dataset, value: t.value } as DOMStringMap, t));
  });
  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type === 'range' && t.dataset.fmt) {
      const out = t.parentElement?.querySelector('output');
      if (out) out.textContent = fmtLive(t.dataset.fmt, Number(t.value));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideTip();
      if (ui.modal && !ui.modal.data?.sticky) {
        ui.modal = null;
        render();
      }
    }
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}

// ── engine worker: turns resolve off the main thread so the UI never stalls on a phone.
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: { state: GameState; n: number; reason: string }) => void>();
function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      worker = null;
      for (const [, res] of pending) res({ state: ui.g!, n: -1, reason: 'error' });
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}
export function runTurns(g: GameState, turns: number): Promise<{ state: GameState; n: number; reason: string }> {
  const w = getWorker();
  const local = () => {
    let n = 0, reason = '';
    while (n < turns) {
      endTurn(g);
      n++;
      reason = needsAttention(g);
      if (reason) break;
    }
    return { state: g, n, reason };
  };
  if (!w) return Promise.resolve(local());
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, (r) => resolve(r.n < 0 ? local() : r));
    w.postMessage({ id, state: g, turns });
  });
}
