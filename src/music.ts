// Background music and musical cues. The pieces are synthesised live (src/music/*.js, no audio files);
// this module chooses what plays, follows the game's mood and schedules the notes.
import { ac, audioContext, holdAwake, isMuted, musicOut } from './audio';
import * as desk from './music/paper-minimalism.js';
import * as titleTheme from './music/opening-bell.js';
import { stingers } from './music/stingers.js';
import type { Cue, Mood, Track } from './music/types';

export type Part = 'title' | 'desk' | null;
export interface MusicState {
  part: Part;
  mood: Mood;
  /** An event card is open: the music ducks and goes muffled under it. */
  focus: boolean;
}

let enabled = true;
try {
  enabled = localStorage.getItem('gc-music') !== '0';
} catch {
  /* storage unavailable */
}
/** Browsers let a page make sound only after the player's first tap or key press. */
let unlocked = false;
let want: MusicState = { part: null, mood: 'calm', focus: false };
let cur: { part: 'title' | 'desk'; tr: Track; gain: GainNode } | null = null;
let mood: Mood = 'calm';
let focused = false;
let timer = 0;
let bus: { input: GainNode; lp: BiquadFilterNode; duck: GainNode } | null = null;

/** Seconds of notes kept scheduled ahead of the clock. */
const AHEAD = 0.6;

function graph(a: AudioContext) {
  if (bus) return bus;
  // Pieces are mixed around -24 dBFS RMS, so they sit under the sound effects; both go through the
  // player's volume (Off, Soft, Normal) and the limiter.
  const input = a.createGain();
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 18000;
  lp.Q.value = 0.6;
  const duck = a.createGain();
  input.connect(lp).connect(duck).connect(musicOut() ?? a.destination);
  return (bus = { input, lp, duck });
}

function tick() {
  if (cur) cur.tr.schedule(cur.gain.context.currentTime + AHEAD);
}

function stopCurrent(fade: number) {
  if (!cur) return;
  const { tr, gain } = cur;
  cur = null;
  tr.stop(gain.context.currentTime, fade);
  window.setTimeout(() => gain.disconnect(), (fade + 1) * 1000);
  window.clearInterval(timer);
  timer = 0;
  holdAwake(false);
}

function apply() {
  const a = enabled && unlocked && !isMuted() ? ac() : null;
  const part = a ? want.part : null;
  if (cur && cur.part !== part) stopCurrent(a ? 2.5 : 0.3);
  if (!a) return;
  const b = graph(a);
  const t = a.currentTime;
  if (part && !cur) {
    const gain = a.createGain();
    gain.connect(b.input);
    const tr = (part === 'desk' ? desk : titleTheme).create(a, gain);
    tr.start(t + 0.1);
    mood = 'calm';
    tr.schedule(t + AHEAD);
    cur = { part, tr, gain };
    timer = window.setInterval(tick, 100);
    holdAwake(true);
  }
  if (cur && want.mood !== mood) {
    mood = want.mood;
    cur.tr.setMood(mood, t);
  }
  if (want.focus !== focused) {
    focused = want.focus;
    b.lp.frequency.cancelScheduledValues(t);
    b.duck.gain.cancelScheduledValues(t);
    b.lp.frequency.setTargetAtTime(focused ? 750 : 18000, t, focused ? 0.12 : 0.3);
    b.duck.gain.setTargetAtTime(focused ? 0.55 : 1, t, focused ? 0.12 : 0.3);
  }
}

/** Called after every render with what the screen calls for; it acts only on changes. */
export function musicSync(next: MusicState) {
  want = next;
  apply();
}

/** Plays a cue over the music. Returns false when music is off, so the caller can use its sound effect. */
export function cue(name: Cue, delay = 0): boolean {
  // like the sound effects, nothing is queued while the game is hidden (it would play on return)
  if (!enabled || isMuted() || document.hidden) return false;
  const a = ac();
  if (!a) return false;
  stingers[name](a, musicOut() ?? a.destination, a.currentTime + 0.02 + delay);
  return true;
}

export const musicOn = () => enabled;
export function setMusic(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('gc-music', on ? '1' : '0');
  } catch {
    /* ignore */
  }
  apply();
}

const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'];
function unlock() {
  unlocked = true;
  apply();
  if (audioContext()?.state === 'running') for (const e of GESTURES) window.removeEventListener(e, unlock, true);
}

/** Waits for the first tap and follows the game in and out of the background. Called once, at startup. */
export function initMusic() {
  for (const e of GESTURES) window.addEventListener(e, unlock, true);
  // Nothing plays while the game is in the background (src/audio.ts suspends the context); the music picks
  // up where it left off. Without music the context stays asleep until the next sound.
  document.addEventListener('visibilitychange', () => {
    const a = audioContext();
    if (a && !document.hidden && cur && !isMuted()) void a.resume().catch(() => undefined);
  });
}
