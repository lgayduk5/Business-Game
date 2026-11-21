// Every sound in the game, synthesised from code. Each recipe writes oscillators, filtered noise and
// envelopes straight into a sample buffer: there are no recordings, sample packs or third-party audio
// anywhere in the project, so there is nothing to license. Pure functions with no DOM, so the tests can
// render every sound and measure it.
//
// The palette follows the game's look, "the desk and the board": paper, pencil, rubber stamp, coins, a
// dot-matrix printer, a desk bell and a soft wooden mallet. Pitched sounds use one scale (C major
// pentatonic), so two that overlap never clash. The tunes are short arpeggios written for this game, and
// none imitates a well-known jingle.

export type Rand = () => number;

/** A small seeded random generator (mulberry32): noise is reproducible in tests, varied in play. */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Out { buf: Float32Array; sr: number; rnd: Rand }

const TAU = Math.PI * 2;
/** Natural log of 1000: an envelope that falls by this much in `decay` seconds ends 60 dB down. */
const K = Math.log(1000);
const TAIL = 0.004;

/**
 * The shape of every note and burst: a smooth attack (no click), an exponential decay, and a short taper
 * so a sound cut off at its length never clicks either. Stepped one sample at a time with a single
 * multiply, so even the longest sound renders in a few milliseconds on a phone.
 */
class Env {
  private i = 0;
  private e = 1;
  private readonly na: number;
  private readonly nt: number;
  private readonly r: number;
  constructor(private readonly n: number, sr: number, attack: number, decay: number) {
    this.na = Math.max(1, Math.round(attack * sr));
    this.nt = Math.round(TAIL * sr);
    this.r = Math.exp(-K / (decay * sr));
  }
  next(): number {
    const i = this.i++;
    let a: number;
    if (i < this.na) a = Math.sin((Math.PI / 2) * (i / this.na)) ** 2;
    else {
      a = this.e;
      this.e *= this.r;
    }
    const left = this.n - i;
    return left < this.nt ? a * Math.max(0, left / this.nt) : a;
  }
}

interface ToneOpts { at: number; f: number; dur: number; gain: number; to?: number; glide?: number; attack?: number; decay?: number; wave?: 'sine' | 'tri' }
/** One oscillator note, optionally gliding (exponentially) to another pitch. */
function tone(o: Out, p: ToneOpts) {
  const { buf, sr } = o;
  const i0 = Math.round(p.at * sr), n = Math.min(Math.round(p.dur * sr), buf.length - i0);
  const env = new Env(Math.round(p.dur * sr), sr, p.attack ?? 0.004, p.decay ?? p.dur);
  if (!p.to && p.wave !== 'tri') {
    // a steady sine: rotate a unit vector instead of calling sin for every sample
    const w = (TAU * p.f) / sr, cw = Math.cos(w), sw = Math.sin(w);
    let sn = 0, cs = 1;
    for (let i = 0; i < n; i++) {
      buf[i0 + i] += p.gain * env.next() * sn;
      [sn, cs] = [sn * cw + cs * sw, cs * cw - sn * sw];
    }
    return;
  }
  const ng = Math.max(1, Math.round((p.glide ?? p.dur) * sr)), step = p.to ? Math.pow(p.to / p.f, 1 / ng) : 1;
  let f = p.f, ph = 0;
  for (let i = 0; i < n; i++) {
    const s = p.wave === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(TAU * ph);
    buf[i0 + i] += p.gain * env.next() * s;
    if (i < ng) f *= step;
    ph += f / sr;
    ph -= Math.floor(ph);
  }
}

/** Partials as [frequency ratio, level, decay scale]. */
type Partials = [number, number, number][];
/** A tuned bar struck with a soft mallet: warm, round, almost no overtones. */
const WOOD: Partials = [[1, 1, 1], [3.99, 0.12, 0.3], [9.1, 0.03, 0.12]];
/** A small desk bell: bright, ringing, inharmonic. */
const BELL: Partials = [[1, 1, 1], [2.0, 0.22, 0.7], [2.76, 0.28, 0.5], [5.4, 0.07, 0.25]];
/** A coin or a cash-drawer bell: close, beating partials that read as metal. */
const COIN: Partials = [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.24, 0.45], [6.63, 0.11, 0.3]];

function strike(o: Out, at: number, f: number, gain: number, decay: number, partials: Partials, attack = 0.002) {
  for (const [r, a, d] of partials) {
    if (f * r > o.sr * 0.45) continue;
    tone(o, { at, f: f * r, dur: decay * d, gain: gain * a, attack, decay: decay * d });
  }
}

interface NoiseOpts { at: number; dur: number; gain: number; f: number; to?: number; q?: number; type?: 'bp' | 'lp' | 'hp'; attack?: number; decay?: number }
/** A burst of white noise through a resonant filter (RBJ biquad), optionally sweeping. */
function noise(o: Out, p: NoiseOpts) {
  const { buf, sr, rnd } = o;
  const i0 = Math.round(p.at * sr), n = Math.round(p.dur * sr);
  const q = p.q ?? 1, type = p.type ?? 'bp', attack = p.attack ?? 0.002, decay = p.decay ?? p.dur;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (fc: number) => {
    const w = (TAU * Math.min(fc, sr * 0.45)) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (type === 'bp') [b0, b1, b2] = [al, 0, -al];
    else if (type === 'lp') [b0, b1, b2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
    else [b0, b1, b2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    [b0, b1, b2, a1, a2] = [b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - al) / a0];
  };
  const env = new Env(n, sr, attack, decay);
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    if (i % 16 === 0) set(p.to ? p.f * Math.pow(p.to / p.f, i / n) : p.f);
    const x = rnd() * 2 - 1;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i0 + i] += p.gain * env.next() * y;
  }
}

/** A soft knock: a low sine that drops in pitch, with a little filtered noise for the contact. */
function knock(o: Out, at: number, f: number, gain: number, dur = 0.08) {
  tone(o, { at, f, to: f * 0.55, glide: dur * 0.6, dur, gain, attack: 0.0015, decay: dur * 0.8 });
  noise(o, { at, dur: dur * 0.5, gain: gain * 0.9, f: f * 5, type: 'lp', q: 0.7, decay: dur * 0.35 });
}

// Note frequencies, C major pentatonic (C D E G A).
const G3 = 196, A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440;
const C5 = 523.25, D5 = 587.33, E5 = 659.26, G5 = 783.99, A5 = 880, C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760, C7 = 2093;
/** The notches a slider plays as it moves, low to high. */
export const DETENT_NOTES = [G4, A4, C5, D5, E5, G5, A5, C6, D6, E6, G6, A6];

/**
 * How often a sound can occur sets how loud and long it may be: what happens every few seconds stays
 * at the edge of hearing, and only the rare moments are allowed to be heard across a room.
 */
export type Tier = 'touch' | 'control' | 'action' | 'moment' | 'finale';
export const TIERS: Record<Tier, { label: string; peak: number; maxLen: number; about: string }> = {
  touch: { label: 'Touch', peak: 0.1, maxLen: 0.12, about: 'Moving around: many times a minute, so barely there.' },
  control: { label: 'Controls', peak: 0.17, maxLen: 0.3, about: 'Adjusting a setting: a small tactile click.' },
  action: { label: 'Actions', peak: 0.23, maxLen: 0.9, about: 'Doing something with money, plant or people: a short sound that says what kind of thing it was.' },
  moment: { label: 'Moments', peak: 0.27, maxLen: 1.6, about: 'Something that needs you, or a new chapter for the company.' },
  finale: { label: 'Endings', peak: 0.32, maxLen: 2.6, about: 'Once a game.' },
};

/**
 * The player's volume setting (Menu → Sound), applied on top of each sound's own level. Soft is about
 * 7 dB under Normal: for playing in a quiet room or next to someone.
 */
export const LEVELS = { off: 0, soft: 0.35, normal: 0.8 } as const;
export type Level = keyof typeof LEVELS;

export interface SoundDef {
  label: string;
  /** Where it plays, in the player's words. */
  where: string;
  tier: Tier;
  /** Loudest sample, before the player's volume setting. */
  peak: number;
  len: number;
  /** Takes made with different noise, chosen at random so repeated sounds do not turn mechanical. */
  takes?: number;
  /** Random playback-rate spread (±) for the same reason. Only on unpitched or tiny sounds, to keep the scale in tune. */
  vary?: number;
  /** Minimum time between two plays, in ms: a double tap or a fast drag never stacks up. */
  gap?: number;
  draw: (o: Out, param: number) => void;
}

export const SOUNDS = {
  // ── touch
  page: {
    label: 'Page turn', where: 'Switching between HQ, Map, Offices, Corporate and Intel; the steps of the new-company form; leaving or entering a game.',
    tier: 'touch', peak: 0.085, len: 0.11, takes: 4, vary: 0.04,
    draw: (o) => {
      noise(o, { at: 0, dur: 0.075, gain: 1, f: 1300, to: 2900, q: 1.2, attack: 0.014, decay: 0.06 });
      noise(o, { at: 0.05, dur: 0.055, gain: 0.55, f: 2200, to: 1100, q: 1.2, attack: 0.004, decay: 0.04 });
    },
  },
  tap: {
    label: 'Pencil tap', where: 'Opening a dialog or the menu, a sub-tab, picking a city or a statement, tapping a dotted number for its arithmetic.',
    tier: 'touch', peak: 0.065, len: 0.045, takes: 3, vary: 0.05, gap: 30,
    draw: (o) => {
      tone(o, { at: 0, f: 1300, to: 1050, dur: 0.035, gain: 1, attack: 0.001, decay: 0.022 });
      noise(o, { at: 0, dur: 0.012, gain: 0.9, f: 3200, q: 1.4, attack: 0.0005, decay: 0.008 });
    },
  },
  detent: {
    label: 'Slider notch', where: 'Dragging a slider (price, marketing, pay, R&D, loan size…): a soft notch each time it crosses a step of the scale, higher as the value rises.',
    tier: 'touch', peak: 0.05, len: 0.04, gap: 35,
    draw: (o, note) => {
      tone(o, { at: 0, f: DETENT_NOTES[Math.max(0, Math.min(DETENT_NOTES.length - 1, note))], dur: 0.035, gain: 1, attack: 0.001, decay: 0.026, wave: 'tri' });
    },
  },
  // ── controls
  toggleOn: {
    label: 'Switch on', where: 'Choosing an option in a row of buttons (training, supply chain, guidance…), turning a setting on, picking a card in the new-company form.',
    tier: 'control', peak: 0.1, len: 0.06, takes: 2, vary: 0.02,
    draw: (o) => {
      noise(o, { at: 0, dur: 0.008, gain: 0.8, f: 3400, q: 1.3, attack: 0.0005, decay: 0.006 });
      tone(o, { at: 0.003, f: E5, to: E5 * 0.94, dur: 0.05, gain: 0.85, attack: 0.001, decay: 0.035 });
    },
  },
  toggleOff: {
    label: 'Switch off', where: 'Turning a setting off, hiding a chart line, dropping a policy, deleting a save slot.',
    tier: 'control', peak: 0.09, len: 0.06, takes: 2, vary: 0.02,
    draw: (o) => {
      noise(o, { at: 0, dur: 0.008, gain: 0.8, f: 2600, q: 1.3, attack: 0.0005, decay: 0.006 });
      tone(o, { at: 0.003, f: C5, to: C5 * 0.94, dur: 0.05, gain: 0.85, attack: 0.001, decay: 0.035 });
    },
  },
  stepUp: {
    label: 'Count up', where: 'The + on a role in an office (opening positions) and on the layoff count.',
    tier: 'control', peak: 0.1, len: 0.07, gap: 25,
    draw: (o) => {
      tone(o, { at: 0, f: G5 * 0.97, to: G5, glide: 0.015, dur: 0.06, gain: 1, attack: 0.001, decay: 0.045, wave: 'tri' });
      noise(o, { at: 0, dur: 0.006, gain: 0.5, f: 4000, q: 1.5, attack: 0.0005, decay: 0.004 });
    },
  },
  stepDown: {
    label: 'Count down', where: 'The − on a role in an office and on the layoff count.',
    tier: 'control', peak: 0.095, len: 0.07, gap: 25,
    draw: (o) => {
      tone(o, { at: 0, f: D5 * 1.03, to: D5, glide: 0.015, dur: 0.06, gain: 1, attack: 0.001, decay: 0.045, wave: 'tri' });
      noise(o, { at: 0, dur: 0.006, gain: 0.5, f: 3000, q: 1.5, attack: 0.0005, decay: 0.004 });
    },
  },
  deny: {
    label: 'Muffled knock', where: 'Something did not go through (the red message): not enough cash, a rival said no, a save would not load.',
    tier: 'control', peak: 0.15, len: 0.2, takes: 2, gap: 250,
    draw: (o) => {
      knock(o, 0, 210, 1, 0.075);
      knock(o, 0.095, 180, 0.8, 0.09);
    },
  },
  research: {
    label: 'Pencil notes', where: 'Studying a city on the map, and due diligence on an investment or a company to buy.',
    tier: 'control', peak: 0.08, len: 0.23, takes: 3, vary: 0.03,
    draw: (o) => {
      noise(o, { at: 0, dur: 0.06, gain: 1, f: 2600, to: 3400, q: 2.5, attack: 0.012, decay: 0.05 });
      noise(o, { at: 0.075, dur: 0.06, gain: 0.8, f: 3400, to: 2500, q: 2.5, attack: 0.01, decay: 0.05 });
      noise(o, { at: 0.155, dur: 0.07, gain: 0.9, f: 2800, to: 3600, q: 2.5, attack: 0.012, decay: 0.055 });
    },
  },
  check: {
    label: 'Tick', where: 'A step of the first-game checklist on HQ is done.',
    tier: 'control', peak: 0.11, len: 0.3,
    draw: (o) => {
      strike(o, 0, A5, 0.8, 0.16, WOOD);
      strike(o, 0.07, E6, 1, 0.22, WOOD);
    },
  },
  dice: {
    label: 'Dice', where: '"Surprise me" in the new-company form: a random industry, city and founder.',
    tier: 'control', peak: 0.12, len: 0.3, takes: 3,
    draw: (o) => {
      for (const at of [0, 0.05, 0.115, 0.2]) {
        const f = 850 + o.rnd() * 650;
        const t = at + (o.rnd() - 0.5) * 0.012;
        tone(o, { at: Math.max(0, t), f, to: f * 0.8, dur: 0.03, gain: 0.7 + o.rnd() * 0.3, attack: 0.001, decay: 0.018 });
        noise(o, { at: Math.max(0, t), dur: 0.008, gain: 0.6, f: 2500, q: 2, attack: 0.0005, decay: 0.006 });
      }
    },
  },
  // ── actions
  cash: {
    label: 'Cash drawer', where: 'Money comes in: a loan, a draw on the credit line, an equity raise or follow-on offering, a licence fee, selling capacity or a plant stake.',
    tier: 'action', peak: 0.2, len: 0.6, takes: 2,
    draw: (o) => {
      noise(o, { at: 0, dur: 0.025, gain: 0.45, f: 2200, q: 1, attack: 0.001, decay: 0.018 });
      knock(o, 0, 320, 0.35, 0.035);
      strike(o, 0.03, E6, 0.85, 0.5, COIN);
      strike(o, 0.055, A6, 0.7, 0.42, COIN);
    },
  },
  spend: {
    label: 'Coins counted out', where: 'Money goes out by choice: repaying a loan, a share buyback, a retention bonus.',
    tier: 'action', peak: 0.14, len: 0.4, takes: 2,
    draw: (o) => {
      [A6, G6, E6].forEach((f, i) => {
        strike(o, i * 0.08, f, 0.9 - i * 0.07, 0.17, COIN, 0.001);
        noise(o, { at: i * 0.08, dur: 0.006, gain: 0.35, f: 4200, q: 1.5, attack: 0.0005, decay: 0.004 });
      });
    },
  },
  build: {
    label: 'Mallet', where: 'Committing money to build: more capacity in an office, or starting an investment programme.',
    tier: 'action', peak: 0.21, len: 0.32, takes: 2,
    draw: (o) => {
      knock(o, 0, 170, 1, 0.09);
      tone(o, { at: 0.005, f: G3, dur: 0.18, gain: 0.3, attack: 0.004, decay: 0.15 });
      tone(o, { at: 0.005, f: G3 * 2, dur: 0.1, gain: 0.08, attack: 0.004, decay: 0.08 });
      knock(o, 0.13, 190, 0.75, 0.09);
    },
  },
  stamp: {
    label: 'Rubber stamp', where: 'A decision is filed: answering an event card, adopting a policy, filing a lawsuit or lobbying, saving or exporting a game.',
    tier: 'action', peak: 0.19, len: 0.18, takes: 3, vary: 0.03,
    draw: (o) => {
      knock(o, 0, 130, 1, 0.08);
      noise(o, { at: 0.008, dur: 0.03, gain: 0.4, f: 1800, q: 0.8, attack: 0.001, decay: 0.02 });
    },
  },
  deal: {
    label: 'Handshake', where: 'Someone says yes: a local partner signs, a rival agrees to talks, a truce or an alliance, an executive joins, talent comes across, a franchise opens.',
    tier: 'action', peak: 0.2, len: 0.75,
    draw: (o) => {
      strike(o, 0, C5, 0.85, 0.5, WOOD, 0.003);
      strike(o, 0.11, G5, 1, 0.6, WOOD, 0.003);
      strike(o, 0.11, G6, 0.1, 0.4, BELL);
    },
  },
  somber: {
    label: 'Low tones', where: 'Giving something up on purpose: layoffs, closing an office, replacing an executive, ending a partnership, cancelling a programme.',
    tier: 'action', peak: 0.17, len: 0.85,
    draw: (o) => {
      for (const [at, f, d, g] of [[0, C4, 0.45, 0.9], [0.22, A3, 0.6, 1]] as const) {
        tone(o, { at, f, dur: d, gain: g, attack: 0.03, decay: d });
        tone(o, { at, f: f * 2, dur: d * 0.7, gain: g * 0.15, attack: 0.03, decay: d * 0.6 });
      }
    },
  },
  report: {
    label: 'Printer', where: 'The quarter closes and the report prints out (once for a whole fast-forward).',
    tier: 'action', peak: 0.12, len: 0.66, takes: 2,
    draw: (o) => {
      for (let line = 0; line < 2; line++) {
        const s = line * 0.24;
        for (let k = 0; k < 8; k++) noise(o, { at: s + k * 0.019, dur: 0.009, gain: 0.85 + o.rnd() * 0.15, f: 2300 + (k % 3) * 350, q: 3, attack: 0.0005, decay: 0.007 });
        tone(o, { at: s, f: 110, dur: 0.17, gain: 0.05, attack: 0.02, decay: 0.2, wave: 'tri' });
        noise(o, { at: s + 0.165, dur: 0.06, gain: 0.35, f: 700, to: 1000, q: 1.2, attack: 0.01, decay: 0.05 });
      }
      noise(o, { at: 0.52, dur: 0.12, gain: 0.55, f: 1500, to: 4200, q: 0.7, attack: 0.025, decay: 0.09 });
    },
  },
  lucky: {
    label: 'Sparkle', where: 'After you answer an event card, if it went better than the odds suggested.',
    tier: 'action', peak: 0.12, len: 0.55,
    draw: (o) => {
      strike(o, 0, E6, 0.8, 0.3, BELL);
      strike(o, 0.06, G6, 0.85, 0.3, BELL);
      strike(o, 0.12, C7, 1, 0.42, BELL);
    },
  },
  unlucky: {
    label: 'Falling notes', where: 'After you answer an event card, if it went worse than the odds suggested.',
    tier: 'action', peak: 0.14, len: 0.6,
    draw: (o) => {
      strike(o, 0, E4, 1, 0.2, WOOD, 0.004);
      strike(o, 0.09, D4, 0.9, 0.22, WOOD, 0.004);
      strike(o, 0.18, A3, 0.9, 0.4, WOOD, 0.004);
    },
  },
  rewind: {
    label: 'Tape rewind', where: 'Going back to the start of an earlier quarter from the end screen.',
    tier: 'action', peak: 0.11, len: 0.4,
    draw: (o) => {
      let t = 0;
      for (let k = 0; k < 12; k++) {
        const f = 2000 * Math.pow(700 / 2000, k / 11);
        tone(o, { at: t, f, dur: 0.012, gain: 0.8, attack: 0.001, decay: 0.009, wave: 'tri' });
        t += 0.04 - k * 0.0022;
      }
      noise(o, { at: 0, dur: 0.33, gain: 0.25, f: 3000, to: 900, q: 1.2, attack: 0.03, decay: 0.3 });
    },
  },
  // ── moments
  event: {
    label: 'Desk bell', where: 'A decision card arrives. With music on, a music cue plays instead.',
    tier: 'moment', peak: 0.18, len: 0.8, gap: 300,
    draw: (o) => {
      strike(o, 0, A5, 1, 0.75, BELL, 0.001);
      noise(o, { at: 0, dur: 0.004, gain: 0.12, f: 5000, q: 1, attack: 0.0005, decay: 0.003 });
    },
  },
  crisis: {
    label: 'Two bells', where: 'A crisis card arrives.',
    tier: 'moment', peak: 0.21, len: 1.0, gap: 300,
    draw: (o) => {
      strike(o, 0, E5, 0.9, 0.6, BELL, 0.001);
      strike(o, 0.16, C5, 1, 0.8, BELL, 0.001);
      tone(o, { at: 0.16, f: C4, dur: 0.7, gain: 0.25, attack: 0.01, decay: 0.6 });
    },
  },
  warning: {
    label: 'Heartbeat', where: 'Just after the report, when the quarter ended with negative cash: two such quarters in a row and the company is insolvent.',
    tier: 'moment', peak: 0.19, len: 0.7,
    draw: (o) => {
      for (const [at, g, d] of [[0, 1, 0.24], [0.2, 0.85, 0.42]] as const) {
        tone(o, { at, f: A3, dur: d, gain: g, attack: 0.012, decay: d });
        tone(o, { at, f: A3 * 2, dur: d * 0.6, gain: g * 0.3, attack: 0.012, decay: d * 0.5 });
      }
    },
  },
  milestone: {
    label: 'Rising chime', where: 'A new chapter: founding a company, starting a challenge or chapter, opening an office, launching a division, finishing the first-game checklist.',
    tier: 'moment', peak: 0.22, len: 1.1,
    draw: (o) => {
      [C5, E5, G5, C6].forEach((f, i) => strike(o, i * 0.09, f, 0.8 + i * 0.065, i === 3 ? 0.8 : 0.5, WOOD, 0.003));
      strike(o, 0.27, C7, 0.07, 0.5, BELL);
    },
  },
  ipo: {
    label: 'Opening bell', where: 'Your company lists on the stock market.',
    tier: 'moment', peak: 0.25, len: 1.5,
    draw: (o) => {
      for (let k = 0; k < 6; k++) strike(o, k * 0.065, D6, 1 - k * 0.1, k === 5 ? 0.7 : 0.25, BELL, 0.001);
      for (const [f, g] of [[C5, 0.5], [G5, 0.5], [C6, 0.45]] as const) strike(o, 0.42, f, g, 0.95, WOOD, 0.006);
    },
  },
  acquire: {
    label: 'Signed and sealed', where: 'You buy a company: a deal target or a rival.',
    tier: 'moment', peak: 0.24, len: 1.1,
    draw: (o) => {
      knock(o, 0, 130, 0.7, 0.08);
      strike(o, 0.03, C5, 0.8, 0.5, WOOD, 0.003);
      strike(o, 0.13, G5, 0.9, 0.55, WOOD, 0.003);
      strike(o, 0.24, C6, 1, 0.8, WOOD, 0.003);
      strike(o, 0.24, C7, 0.08, 0.5, BELL);
    },
  },
  // ── endings
  win: {
    label: 'Victory', where: 'The game ends in a win. With music on, a music cue plays instead.',
    tier: 'finale', peak: 0.3, len: 2.3,
    draw: (o) => {
      [C5, E5, G5, C6].forEach((f, i) => strike(o, i * 0.1, f, 0.7 + i * 0.05, 0.5, WOOD, 0.003));
      for (const f of [C5, E5, G5, C6]) {
        tone(o, { at: 0.42, f, dur: 1.85, gain: 0.3, attack: 0.07, decay: 1.7 });
        tone(o, { at: 0.42, f: f * 1.003, dur: 1.85, gain: 0.12, attack: 0.09, decay: 1.6 });
      }
      strike(o, 0.42, C7, 0.12, 0.8, BELL);
    },
  },
  lose: {
    label: 'Last notes', where: 'The game ends in a loss. With music on, a music cue plays instead.',
    tier: 'finale', peak: 0.25, len: 2.1,
    draw: (o) => {
      [[A4, 0.5, 0.8], [E4, 0.5, 0.8], [C4, 0.5, 0.85], [A3, 1.2, 1]].forEach(([f, d, g], i) => {
        tone(o, { at: i * 0.28, f, dur: d, gain: g, attack: 0.03, decay: d });
        tone(o, { at: i * 0.28, f: f / 2, dur: d, gain: i === 3 ? g * 0.35 : g * 0.1, attack: 0.04, decay: d });
      });
    },
  },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/**
 * Renders one take of a sound: draws it, then scales it so its loudest sample is exactly the level
 * the catalogue gives it. Loudness is a design decision written down above, not an accident of mixing.
 */
export function renderSound(id: SoundId, sr: number, seed = 1, param = 0): Float32Array {
  const def: SoundDef = SOUNDS[id];
  const buf = new Float32Array(Math.ceil(def.len * sr));
  def.draw({ buf, sr, rnd: rng(seed) }, param);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const k = peak > 0 ? def.peak / peak : 0;
  // a final 5 ms fade, so a sound that rings past its length never ends with a click
  const fade = Math.round(0.005 * sr);
  for (let i = 0; i < buf.length; i++) buf[i] *= k * Math.min(1, (buf.length - 1 - i) / fade);
  return buf;
}

