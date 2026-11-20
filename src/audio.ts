// Sound effects synthesised with the Web Audio API — no audio files.
let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('gc-muted') === '1';
} catch {
  /* storage unavailable */
}

/** The shared context, created on first use (after a tap); null while sound is off. Music uses it too. */
export function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator note. */
function note(freq: number, start: number, dur: number, type: OscillatorType = 'triangle', gain = 0.12, slide = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
/** A short burst of filtered noise: paper, clicks, printer. */
function noise(start: number, dur: number, freq: number, gain = 0.08) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export const sfx = {
  tick: () => note(880, 0, 0.05, 'square', 0.04),
  tab: () => noise(0, 0.05, 2400, 0.05),
  /** Dot-matrix printer: the quarterly report feeding out. */
  print: () => {
    for (let i = 0; i < 9; i++) noise(i * 0.045, 0.035, 1800 + (i % 3) * 500, 0.06);
  },
  /** Cash register: money in. */
  cash: () => {
    note(1318, 0, 0.09, 'square', 0.05);
    note(1760, 0.08, 0.22, 'triangle', 0.1);
  },
  good: () => {
    note(523, 0, 0.12);
    note(659, 0.1, 0.12);
    note(784, 0.2, 0.22);
  },
  bad: () => {
    note(330, 0, 0.18, 'sawtooth', 0.07, 0.7);
    note(220, 0.16, 0.3, 'sawtooth', 0.07, 0.7);
  },
  alert: () => {
    note(740, 0, 0.1, 'square', 0.05);
    note(740, 0.16, 0.1, 'square', 0.05);
  },
  build: () => {
    noise(0, 0.08, 500, 0.12);
    note(196, 0.02, 0.2, 'triangle', 0.1);
  },
  event: () => {
    note(587, 0, 0.14, 'triangle', 0.09);
    note(440, 0.13, 0.2, 'triangle', 0.09);
  },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, i * 0.13, i === 4 ? 0.7 : 0.16, 'triangle', 0.11)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => note(f, i * 0.22, 0.4, 'sawtooth', 0.06, 0.9)),
};

/** The context if one exists, without creating it or checking the mute. */
export const audioContext = () => ctx;
export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('gc-muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}
