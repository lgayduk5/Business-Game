// Plays the game's sounds (designed in src/sounds.ts) through the Web Audio API.
//
// Each sound is rendered once from code into a buffer and replayed from there. Everything goes through
// the player's volume (Menu → Sound: Off, Soft or Normal) and a soft limiter. The context is woken on the
// first tap and suspended when the game is hidden or has been quiet for a while, to save battery on a phone.
import { DETENT_NOTES, LEVELS, SOUNDS, renderSound, type Level, type SoundDef, type SoundId } from './sounds';

const KEY = 'gc-sound';
function readLevel(): Level {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'off' || v === 'soft' || v === 'normal') return v;
    if (localStorage.getItem('gc-muted') === '1') return 'off'; // the earlier on/off switch
  } catch {
    /* storage unavailable */
  }
  return 'normal';
}
let level: Level = readLevel();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastPlayed = new Map<SoundId, number>();
const MAX_VOICES = 8;
const IDLE_MS = 20_000;
let voices = 0;
let idleTimer = 0;
/** The most recent sounds, newest last (exposed to automated checks as __gc.heard). */
export const heard: SoundId[] = [];

/** Transparent below half scale, then rounds off: stacked sounds can never clip harshly. */
function softLimit(a: AudioContext): WaveShaperNode {
  const n = 2049, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, m = Math.abs(x);
    curve[i] = m <= 0.5 ? x : Math.sign(x) * (0.5 + 0.5 * Math.tanh((m - 0.5) / 0.5));
  }
  const ws = a.createWaveShaper();
  ws.curve = curve;
  return ws;
}

function context(): AudioContext | null {
  if (level === 'off' || typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      // Safari: an ambient session mixes with the player's own music or podcast instead of stopping it,
      // and the ringer switch silences it, as it does other games' sound effects.
      const session = (navigator as any).audioSession;
      if (session && 'type' in session) session.type = 'ambient';
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = LEVELS[level];
      master.connect(softLimit(ctx)).connect(ctx.destination);
    } catch {
      ctx = master = null;
      return null;
    }
  }
  return ctx;
}

function wake() {
  window.clearTimeout(idleTimer);
  if (ctx?.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => undefined);
}
function sleepWhenIdle() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (ctx?.state === 'running' && voices === 0) void ctx.suspend().catch(() => undefined);
  }, IDLE_MS);
}

function buffer(a: AudioContext, id: SoundId, take: number, param: number): AudioBuffer {
  const key = `${id}:${take}:${param}`;
  let b = buffers.get(key);
  if (!b) {
    const data = renderSound(id, a.sampleRate, 1 + take * 7919, param);
    b = a.createBuffer(1, data.length, a.sampleRate);
    b.getChannelData(0).set(data);
    buffers.set(key, b);
  }
  return b;
}

interface PlayOpts { delay?: number; param?: number; force?: boolean }
function play(id: SoundId, o: PlayOpts = {}) {
  const a = context();
  if (!a || !master || document.hidden) return;
  const def: SoundDef = SOUNDS[id];
  const now = performance.now();
  if (!o.force && now - (lastPlayed.get(id) ?? -Infinity) < (def.gap ?? 45)) return;
  if (voices >= MAX_VOICES) return;
  lastPlayed.set(id, now);
  wake();
  const src = a.createBufferSource();
  src.buffer = buffer(a, id, Math.floor(Math.random() * (def.takes ?? 1)), o.param ?? 0);
  if (def.vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.vary;
  src.connect(master);
  voices++;
  src.onended = () => {
    voices--;
    src.disconnect();
    sleepWhenIdle();
  };
  const delay = typeof o.delay === 'number' && o.delay > 0 ? o.delay : 0;
  src.start(a.currentTime + delay);
  heard.push(id);
  if (heard.length > 40) heard.shift();
}

// Sliders: a notch each time the value crosses a step of the scale, starting from where it was drawn.
const notch = new WeakMap<HTMLInputElement, number>();
function notchOf(el: HTMLInputElement, v: number): number {
  const lo = Number(el.min || 0), hi = Number(el.max || 100);
  const f = hi > lo ? (v - lo) / (hi - lo) : 0;
  return Math.round(Math.max(0, Math.min(1, f)) * (DETENT_NOTES.length - 1));
}

const say = (id: SoundId) => (delay?: number) => play(id, { delay });
/**
 * What the game plays, by meaning rather than by sound. Which action plays which, and why, is listed
 * with each sound in src/sounds.ts and in the game under Menu → Sound → Hear every sound.
 */
export const sfx = {
  page: say('page'),
  tap: say('tap'),
  research: say('research'),
  check: say('check'),
  dice: say('dice'),
  deny: say('deny'),
  cash: say('cash'),
  spend: say('spend'),
  build: say('build'),
  stamp: say('stamp'),
  deal: say('deal'),
  somber: say('somber'),
  report: say('report'),
  lucky: say('lucky'),
  unlucky: say('unlucky'),
  rewind: say('rewind'),
  event: say('event'),
  crisis: say('crisis'),
  warning: say('warning'),
  milestone: say('milestone'),
  ipo: say('ipo'),
  acquire: say('acquire'),
  win: say('win'),
  lose: say('lose'),
  /** A switch or a choice in a row of buttons; `on` false for turning something off. */
  toggle: (on = true) => play(on ? 'toggleOn' : 'toggleOff'),
  /** A + or − stepper. */
  step: (up: boolean) => play(up ? 'stepUp' : 'stepDown'),
  /** Called as a slider moves. */
  slide: (el: HTMLInputElement) => {
    const before = notch.get(el) ?? notchOf(el, Number(el.defaultValue));
    const now = notchOf(el, Number(el.value));
    notch.set(el, now);
    if (now !== before) play('detent', { param: now });
  },
};

/** Plays a sound on request (the sound test), ignoring the repeat guard. */
export function preview(id: SoundId, param = 0, delay = 0) {
  play(id, { param, delay, force: true });
}

export const soundLevel = (): Level => level;
export function setSoundLevel(l: Level) {
  level = l;
  try {
    localStorage.setItem(KEY, l);
    localStorage.removeItem('gc-muted');
  } catch {
    /* ignore */
  }
  if (ctx && master) {
    master.gain.setTargetAtTime(LEVELS[l], ctx.currentTime, 0.02);
    if (l === 'off') sleepWhenIdle();
  }
}

/**
 * Browsers start audio only from a tap or a key. Waking the context on every press means a sound that
 * comes a moment later (the report, after the quarter is worked out) still plays, on iOS too.
 */
export function initAudio() {
  const unlock = () => {
    if (level === 'off' || !context()) return;
    wake();
    if (voices === 0) sleepWhenIdle();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
  });
}
