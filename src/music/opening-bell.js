// Opening Bell — title theme for Going Concern.
// A felt-piano motif in D major over a slow string pad; a soft struck bell opens every 8-bar phrase.
// 64-bar form at 84 BPM (~183 s), then it loops: intro (piano alone) → pad joins → heartbeat pulse
// + bass → full statement with cello counter-line → second full phrase → breakdown (cello solo,
// piano arpeggios) → return (melody in octaves) → coda that thins out and leads back to the intro.
export const meta = {
  id: 'opening-bell',
  name: 'Opening Bell',
  part: 'title',
  bpm: 84,
  blurb: 'A hopeful piano theme over warm strings, with a soft bell at each new phrase: the morning a new venture opens.',
};

const SPB = 60 / meta.bpm, BAR = SPB * 4, FORM = 64;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function rng(a) { // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chords: [bass note, piano left hand (root, mid, top), pad voicing (4 voices, low→high)]
const CH = {
  D: [38, [50, 57, 64], [57, 62, 64, 66]],   // D(add9)
  DF: [42, [54, 57, 62], [57, 62, 66, 69]],  // D/F#
  Fm: [42, [54, 61, 64], [57, 64, 66, 69]],  // F#m7 (iii); pad leaves C# to the melody's D-C# sigh
  G: [43, [55, 62, 66], [59, 62, 66, 71]],   // Gmaj7 (no F#-G rub in the pad)
  Em: [40, [52, 59, 62], [59, 62, 64, 67]],  // Em7
  As: [45, [45, 52, 62], [57, 62, 64, 67]],  // A7sus4
  A: [45, [45, 52, 61], [57, 61, 64, 69]],   // A
  Bm: [47, [47, 54, 62], [57, 62, 66, 71]],  // Bm7
  C: [48, [48, 55, 62], [55, 60, 64, 67]],   // C(add9) — the bVII lift
  GA: [45, [45, 55, 59], [55, 59, 62, 69]],  // G/A (IV over V)
  AC: [49, [49, 57, 64], [57, 61, 64, 69]],  // A/C#
  BmA: [45, [45, 54, 62], [57, 62, 66, 71]], // Bm7/A
};
// "chord@beat" per bar, bars split by |
const prog = (s) => s.split('|').map((bar) => {
  const ch = bar.split(' ').map((tok) => { const [k, b] = tok.split('@'); return { c: CH[k], s: +(b || 0) }; });
  ch.forEach((x, i) => (x.e = i + 1 < ch.length ? ch[i + 1].s : 4));
  return ch;
});
const P1 = prog('D|Fm|G|Em As@2|DF|Bm|C|GA');
const P2 = prog('G|DF|Em|Fm|G|As A@2|Bm BmA@2|Em As@2 A@3');
const P2c = prog('G|DF|Em|Fm|G|As A@2|Bm BmA@2|Em As@2');
const P3 = prog('Bm|G|DF|AC|Bm|G|C|As A@2');

// Lines: per bar, flat triplets [beat, midi, beats]; null = nothing that bar.
const M1 = [ // main motif: antecedent + consequent
  [0, 66, 1.5, 1.5, 69, 0.5, 2, 76, 2], [0, 74, 1, 1, 73, 2, 3, 69, 1],
  [0, 71, 1.5, 1.5, 74, 0.5, 2, 78, 2], [0, 79, 1, 1, 78, 1, 2, 76, 2],
  [0, 66, 1.5, 1.5, 69, 0.5, 2, 78, 2], [0, 76, 1, 1, 74, 2, 3, 71, 1],
  [0, 67, 1, 1, 72, 0.5, 1.5, 74, 0.5, 2, 76, 2], [0, 74, 1.5, 1.5, 71, 0.5, 2, 69, 2],
];
const M1b = [...M1.slice(0, 4), // second answer reaches higher
  [0, 69, 1.5, 1.5, 74, 0.5, 2, 81, 2], [0, 79, 0.5, 0.5, 78, 1.5, 2, 74, 2],
  [0, 76, 1, 1, 79, 0.5, 1.5, 76, 0.5, 2, 74, 2], [0, 71, 1.5, 1.5, 74, 0.5, 2, 76, 2],
];
const M2 = [ // contrasting phrase, starts on IV, off the beat
  [1, 74, 0.5, 1.5, 76, 0.5, 2, 78, 2], [0, 76, 1, 1, 74, 1, 2, 69, 2],
  [1, 71, 0.5, 1.5, 74, 0.5, 2, 79, 2], [0, 78, 1, 1, 76, 1, 2, 73, 2],
  [1, 74, 0.5, 1.5, 78, 0.5, 2, 81, 2], [0, 79, 1, 1, 78, 1, 2, 76, 2],
  [0, 78, 1.5, 1.5, 76, 0.5, 2, 74, 2], [0, 76, 2, 2, 74, 1, 3, 73, 1],
];
const M2b = [...M2.slice(0, 4),
  [1, 74, 0.5, 1.5, 78, 0.5, 2, 83, 2], [0, 81, 1, 1, 79, 1, 2, 76, 2], M2[6], M2[7]];
const M2c = [...M2.slice(0, 4), // coda: settles, hands back to the intro
  [0, 71, 1, 1, 74, 1, 2, 78, 2], [0, 76, 2, 2, 73, 2], [0, 74, 2, 2, 71, 1, 3, 69, 1], [0, 67, 2, 2, 69, 2]];
const MB = [null, null, null, null, null, // breakdown: arpeggios, then the motif returns
  [0, 71, 1.5, 1.5, 74, 0.5, 2, 78, 2], [0, 67, 1, 1, 72, 0.5, 1.5, 74, 0.5, 2, 76, 2], [0, 74, 2, 2, 73, 2]];
const CM1 = [ // cello counter-line under M1
  [0, 50, 2, 2, 54, 1, 3, 57, 1], [0, 52, 2, 2, 54, 2], [0, 55, 2, 2, 59, 1, 3, 57, 1], [0, 55, 2, 2, 57, 1, 3, 55, 1],
  [0, 54, 2, 2, 57, 1, 3, 59, 1], [0, 62, 2, 2, 59, 2], [0, 60, 2, 2, 64, 2], [0, 62, 2, 2, 59, 1, 3, 57, 1],
];
const CM2 = [
  [0, 59, 2, 2, 62, 2], [0, 57, 2, 2, 54, 2], [0, 55, 2, 2, 59, 2], [0, 57, 2, 2, 61, 2],
  [0, 59, 2, 2, 62, 2], [0, 62, 2, 2, 61, 2], [0, 62, 1.5, 1.5, 61, 0.5, 2, 59, 2], [0, 55, 2, 2, 57, 2],
];
const CM2c = [...CM2.slice(0, 4), [0, 59, 4], [0, 62, 2, 2, 61, 2], null, null];
const CM3 = [ // breakdown cello solo: the motif's shape, turned toward B minor
  [0, 59, 1.5, 1.5, 62, 0.5, 2, 69, 2], [0, 67, 1, 1, 66, 2, 3, 62, 1],
  [0, 57, 1.5, 1.5, 62, 0.5, 2, 66, 2], [0, 64, 1, 1, 61, 2, 3, 57, 1],
  [0, 62, 4], [0, 62, 2, 2, 59, 2], [0, 60, 2, 2, 64, 2], [0, 64, 4],
];

// Sections (8 bars each). v/lhv/cv = melody/left-hand/counter velocity; bass/pulse may vary per bar.
// pad = pad level at the end of each bar; f = pad low-pass; m2 = melody on odd passes of the loop.
const SECS = [
  { p: P1, m: M1, v: 0.74, lhv: 1, bass: 0, pulse: 0, bell: 74, bv: 1, pad: [0, 0, 0, 0, 0, 0, 0, 0], f: 900 },
  { p: P1, m: M1b, v: 0.74, lhv: 0.95, bass: 0, pulse: 0, bell: 74, bv: 0.75, pad: [0.45, 0.7, 0.8, 0.8, 0.8, 0.8, 0.82, 0.85], f: 1250 },
  { p: P2, m: M2, v: 0.76, lhv: 0.85, bass: 1, pulse: 1, bell: 74, bv: 0.8, pad: [0.88, 0.9, 0.9, 0.92, 0.92, 0.94, 0.95, 0.96], f: 1500 },
  { p: P1, m: M1, c: CM1, cv: 0.85, v: 0.8, lhv: 0.7, bass: 2, pulse: 2, bell: 74, bv: 0.9, pad: [1, 1, 1, 1, 1, 1, 1, 1], f: 1900 },
  { p: P2, m: M2b, m2: M2, c: CM2, cv: 0.85, v: 0.82, lhv: 0.7, bass: 2, pulse: 2, bell: 74, bv: 0.8, pad: [1, 1, 1, 1, 1, 1, 1, 1], f: 2000 },
  { p: P3, m: MB, c: CM3, cv: 1, v: 0.66, lhv: 0.85, arp: true, bass: [0, 0, 0, 0, 1, 1, 1, 1], pulse: [0, 0, 0, 0, 0, 0, 1, 1], bell: 62, bv: 0.9, pad: [0.82, 0.78, 0.78, 0.78, 0.8, 0.84, 0.88, 0.94], f: 1050 },
  { p: P1, m: M1, m2: M1b, oct: true, c: CM1, cv: 0.85, v: 0.82, lhv: 0.7, bass: 2, pulse: 2, bell: 74, bv: 1, pad: [1, 1, 1, 1, 1, 1, 1, 1], f: 2200 },
  { p: P2c, m: M2c, c: CM2c, cv: 0.8, v: 0.74, lhv: 0.8, bass: [2, 2, 2, 2, 1, 1, 1, 0], pulse: [2, 2, 2, 2, 1, 1, 0, 0], bell: 74, bv: 0.75, pad: [1, 1, 1, 1, 0.8, 0.55, 0.3, 0], f: 1800 },
];
const at = (v, i) => (Array.isArray(v) ? v[i] : v);
const LHQ = [0, 1, 2, 1], LHV = [0.42, 0.3, 0.34, 0.28], ARP = [0, 1, 2, 3, 2, 1, 3, 2];
// Bell partials [ratio, amp, T60 s]: hum, doubled prime (slow beat), octave, major tenth, inharmonic top.
const BELL = [[0.5, 0.22, 7], [1, 1, 5.5], [1.0024, 0.45, 5], [2, 0.3, 3.4], [2.52, 0.2, 2.4], [3, 0.09, 1.7], [4.18, 0.05, 1], [5.43, 0.03, 0.6]];

// Mix levels
const VERB_G = 0.83; // FDN loop gain (~1.8 s tail)
const MASTER = 0.64, PIANO = 0.2, PADG = 0.031, CELLO = 0.085, BASS = 0.13, KICK = 0.22, TICK = 0.06, BELLG = 0.06;

export function create(ctx, out) {
  const sr = ctx.sampleRate, R = rng(20261119);
  const wave = (amps) => { const im = new Float32Array([0, ...amps]); return ctx.createPeriodicWave(new Float32Array(im.length), im); };
  const bodyWave = wave([1, 0.3, 0.1, 0.04, 0.015]); // felt piano: mostly fundamental
  const brightWave = wave([0, 0.5, 0.32, 0.2, 0.12, 0.07, 0.04]); // upper partials, decay fast
  const lhWave = wave([1, 0.38, 0.16, 0.07, 0.03]);
  const bassWave = wave([1, 0.55, 0.25, 0.1, 0.05]);
  const kickWave = wave([1, 0.5, 0.15]);
  const softSaw = wave(Array.from({ length: 20 }, (_, i) => 1 / (i + 1) ** 1.4)); // saw with a gentler top
  // Noise one-shots, pre-filtered once here so notes need no filter nodes.
  function noiseBuf(secs, filt) {
    const b = ctx.createBuffer(1, Math.floor(sr * secs), sr), d = b.getChannelData(0);
    let pk = 0;
    for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
    filt(d);
    d.forEach((x) => (pk = Math.max(pk, Math.abs(x))));
    d.forEach((x, i) => (d[i] = x / pk));
    return b;
  }
  const biquad = (d, f, q, type) => { // RBJ band-pass / low-pass, run in place
    const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
    const B = type === 'bp' ? [al, 0, -al] : [(1 - c) / 2, 1 - c, (1 - c) / 2];
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i], y = (B[0] * x + B[1] * x1 + B[2] * x2 + 2 * c * y1 - (1 - al) * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y;
    }
  };
  const thump = noiseBuf(0.4, (d) => { biquad(d, 900, 0.7, 'lp'); biquad(d, 500, 0.8, 'bp'); });
  const tickN = noiseBuf(0.4, (d) => biquad(d, 2800, 1.6, 'bp'));

  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(out);

  // Reverb: a small 4-line feedback-delay network (Householder mix, damped), far cheaper than a convolver.
  const verb = ctx.createGain(), vHP = ctx.createBiquadFilter(), vMix = ctx.createGain(), vOut = ctx.createChannelMerger(2), vWet = ctx.createGain();
  vHP.type = 'highpass'; vHP.frequency.value = 220;
  vMix.gain.value = -2 / 4;
  vWet.gain.value = 0.9;
  verb.channelCount = 1; verb.channelCountMode = 'explicit'; // mono network, stereo out
  verb.connect(vHP);
  const damp = Math.exp(-2 * Math.PI * 3000 / sr); // one-pole damping (~3 kHz) with the loop gain folded in
  [31.7, 41.3, 53.9, 67.1].forEach((ms, i) => {
    const d = ctx.createDelay(0.1), lpf = ctx.createIIRFilter([VERB_G * (1 - damp)], [1, -damp]);
    d.delayTime.value = ms / 1000;
    vHP.connect(d);
    d.connect(lpf).connect(d);
    lpf.connect(vMix);
    vMix.connect(d);
    lpf.connect(vOut, 0, i % 2);
  });
  vOut.connect(vWet).connect(master);
  function bus(send, pan) { // instrument bus: optional pan, optional reverb send
    const g = ctx.createGain();
    let p = g;
    if (pan) { p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); }
    p.connect(master);
    if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s).connect(verb); }
    return g;
  }
  const pianoBus = bus(0.24), celloBus = bus(0.3, -0.22), bellBus = bus(0.55, 0.25), padGain = bus(0.25);
  const bassBus = master, kickBus = master, tickBus = master;

  // Long-lived voices (pad, cello, bass) are tracked in `running` so stop() can end them.
  const running = new Set();
  const osc = (type, f, det = 0) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; o.detune.value = det; o.frequency.automationRate = o.detune.automationRate = 'k-rate'; running.add(o); return o; };
  const halt = (list, t) => list.forEach((o) => { o.stop(t); running.delete(o); });
  // Pad: 4 string voices that glide between voicings; outer voices are detuned saw pairs spread L/R.
  // Its oscillators exist only while the pad is audible (not during the piano-alone intro).
  const padL = ctx.createStereoPanner(), padR = ctx.createStereoPanner();
  padL.pan.value = -0.5; padR.pan.value = 0.5;
  const padLP = ctx.createBiquadFilter(), padExpr = ctx.createGain();
  padLP.type = 'lowpass';
  padLP.frequency.value = 900; padLP.Q.value = 0.6; padLP.frequency.automationRate = 'k-rate';
  padGain.gain.value = 0;
  padL.connect(padLP); padR.connect(padLP);
  padLP.connect(padExpr).connect(padGain);
  let pad = [];
  function padStart(t, voicing) {
    pad = voicing.map((m, i) => (i % 3 ? [i === 1 ? -4 : 4] : [-7, 7]).map((d) => { const o = osc(softSaw, hz(m), d); o.connect(d < 0 ? padL : padR); o.start(t); return o; }));
  }
  // Cello: one legato voice per phrase (2 saws + delayed vibrato) that slides between notes.
  let cel = null;
  function celloStart(t, m) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = osc('sine', 5.1), vg = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.6;
    g.gain.value = 0; vg.gain.value = 0;
    vib.connect(vg);
    const o = [-5, 6].map((d) => { const s = osc('sawtooth', hz(m), d); vg.connect(s.detune); s.connect(lp); return s; });
    lp.connect(g).connect(celloBus);
    cel = { o, g, vg, all: [vib, ...o] };
    cel.all.forEach((x) => x.start(t));
  }
  // Bass: one voice, soft finger-bass tone with harmonics for small speakers.
  const bassG = ctx.createGain(), bassO = osc(bassWave, 73);
  bassG.gain.value = 0;
  bassO.connect(bassG).connect(bassBus);

  // Per-note amp: starts at 0, so a sample source that begins mid-buffer cannot leak a click before its envelope.
  const vca = () => { const g = ctx.createGain(); g.gain.value = 0; return g; };
  let next = 0, n = 0, stopped = true, lastPad = 0, lastF = 900;
  const live = (t) => t >= ctx.currentTime;

  // Felt piano note: body (long two-stage decay) + bright partials (fast decay, a hair sharp) + felt thump.
  function piano(m, t, dur, vel, kind) {
    if (!live(t)) return;
    const f = hz(m), pk = vel * PIANO, rel = t + Math.max(dur, 0.4), end = rel + 0.6;
    const g = vca(), o = ctx.createOscillator();
    o.setPeriodicWave(kind === 'lh' ? lhWave : bodyWave); o.frequency.value = f; o.detune.value = (R() - 0.5) * 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.008); // soft hammer
    g.gain.setTargetAtTime(pk * 0.45, t + 0.008, 0.18);
    g.gain.setTargetAtTime(0.0001, t + 0.35, 2.6 * (262 / f) ** 0.45); // natural decay, longer when low
    g.gain.setTargetAtTime(0.0001, rel, 0.13); // damper
    o.connect(g).connect(pianoBus);
    o.start(t); o.stop(end);
    if (kind !== 'mel') return;
    const o2 = ctx.createOscillator(), g2 = vca();
    o2.setPeriodicWave(brightWave); o2.frequency.value = f; o2.detune.value = 3;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.2 + 0.4 * vel, t + 0.006); // relative to the body envelope it feeds
    g2.gain.setTargetAtTime(0.0001, t + 0.006, 0.12 + 0.2 * (262 / f));
    o2.connect(g2).connect(g);
    o2.start(t); o2.stop(Math.min(end, t + 0.05 + 4.5 * (0.12 + 0.2 * (262 / f))));
    const s = ctx.createBufferSource(), sg = vca();
    s.buffer = thump; s.playbackRate.value = 0.8 + 0.4 * Math.min(1, f / 800);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(pk * 0.12, t + 0.002);
    sg.gain.setTargetAtTime(0.0001, t + 0.002, 0.014);
    s.connect(sg).connect(pianoBus);
    s.start(t, R() * 0.25, 0.1);
  }

  function celloNote(m, t, dur, vel, legato) {
    if (!live(t) || !cel) return;
    const pk = vel * CELLO, rel = t + dur, { o, g, vg } = cel;
    o.forEach((x) => x.frequency.setTargetAtTime(hz(m), t, 0.025));
    g.gain.setTargetAtTime(pk * 0.85, t, 0.07); // bowed attack
    g.gain.setTargetAtTime(pk, t + 0.25, Math.max(0.1, dur * 0.3)); // swell
    vg.gain.setTargetAtTime(0, t, 0.02);
    vg.gain.setTargetAtTime(10, t + 0.25, 0.25); // delayed vibrato (cents)
    g.gain.setTargetAtTime(legato ? pk * 0.6 : 0.0001, rel - 0.06, legato ? 0.04 : 0.14);
  }

  function bassNote(m, t, dur, vel) {
    if (!live(t)) return;
    const pk = vel * BASS;
    bassO.frequency.setValueAtTime(hz(m), t);
    bassG.gain.setTargetAtTime(pk, t, 0.006);
    bassG.gain.setTargetAtTime(pk * 0.6, t + 0.04, 0.5);
    bassG.gain.setTargetAtTime(0.0001, t + dur, 0.05);
  }

  function oneShot(buf, bus, t, pk, tau, off) {
    const s = ctx.createBufferSource(), g = vca();
    s.buffer = buf;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.002);
    g.gain.setTargetAtTime(0.0001, t + 0.002, tau);
    s.connect(g).connect(bus);
    s.start(t, off, tau * 8);
  }

  function kick(t, vel) { // soft "heartbeat" thump; the 2nd harmonic carries on small speakers
    if (!live(t)) return;
    const o = ctx.createOscillator(), g = vca();
    o.setPeriodicWave(kickWave); o.frequency.automationRate = 'k-rate';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * KICK, t + 0.005);
    g.gain.setTargetAtTime(0.0001, t + 0.005, 0.09);
    o.connect(g).connect(kickBus); o.start(t); o.stop(t + 0.5);
  }

  function bell(m, t, vel) {
    if (!live(t)) return;
    const f0 = hz(m);
    for (const [r, a, T] of BELL) {
      const o = ctx.createOscillator(), g = vca();
      o.frequency.value = f0 * r;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * a * BELLG, t + 0.004);
      g.gain.setTargetAtTime(0.0001, t + 0.004, T / 6.9);
      o.connect(g).connect(bellBus); o.start(t); o.stop(t + T * 0.8);
    }
  }

  function padTo(voicing, t) {
    pad.forEach((pair, i) => pair.forEach((o) => o.frequency.setTargetAtTime(hz(voicing[i]), t, 0.05)));
    padExpr.gain.setTargetAtTime(0.84, t, 0.04); // bow change
    padExpr.gain.setTargetAtTime(1, t + 0.12, 0.5);
  }
  // Ramp a param over one bar only when its target changes (keeps automation idle otherwise).
  function rampBar(p, from, to, t) {
    if (from === to) return;
    p.setValueAtTime(from, t);
    p.linearRampToValueAtTime(to, t + BAR);
  }

  const sec = (k) => SECS[(k % FORM) >> 3];
  const lineOf = (k, key) => { const S = sec(k), L = key === 'm' && ((k / FORM) | 0) % 2 && S.m2 ? S.m2 : S[key]; return L ? L[k & 7] : null; };

  function bar(k, t) {
    const b = k % FORM, si = b >> 3, i = b & 7, S = SECS[si];
    const r = rng(k * 977 + 13), now = ctx.currentTime, T = Math.max(t, now);
    const segs = S.p[i];
    // pad: voicings, then level and brightness toward this bar's targets
    const pl = S.pad[i] * PADG, pf = si === 7 && i >= 4 ? 1800 - (i - 3) * 200 : S.f;
    if (!pl && !lastPad && pad.length) { halt(pad.flat(), T); pad = []; } // faded out: free the oscillators
    if (pl && !pad.length) padStart(T, segs[0].c[2]);
    for (const sg of segs) padTo(sg.c[2], Math.max(t + sg.s * SPB, now));
    rampBar(padGain.gain, lastPad, pl, T); lastPad = pl;
    rampBar(padLP.frequency, lastF, pf, T); lastF = pf;
    // the opening bell
    if (i === 0) bell(S.bell, t + 0.003, S.bv);
    // melody (felt piano), doubled at the octave in the return
    const mel = lineOf(k, 'm');
    if (mel) for (let j = 0; j < mel.length; j += 3) {
      const v = S.v * (mel[j] === 0 ? 1.05 : 1) * (0.93 + 0.1 * r()), nt = t + mel[j] * SPB + r() * 0.01;
      piano(mel[j + 1], nt, mel[j + 2] * SPB + 0.1, v, 'mel');
      if (S.oct) piano(mel[j + 1] + 12, nt + 0.004, mel[j + 2] * SPB + 0.1, v * 0.4, 'oct');
    }
    // left hand: quarter-note broken chords (half notes under the cello), or 8th-note arpeggios in the breakdown
    for (const { c, s, e } of segs) {
      if (S.arp && !mel) {
        piano(c[1][0], t + s * SPB, (e - s) * SPB + 0.15, 0.4 * S.lhv, 'lh');
        for (let q = s * 2; q < e * 2; q++) piano(c[2][ARP[q % 8]] + 12, t + q * SPB / 2 + r() * 0.008, 1.5 * SPB, (q % 2 ? 0.3 : 0.38) * (0.9 + 0.2 * r()), 'lh');
      } else {
        for (let q = s; q < e; q += S.c ? 2 : 1) piano(c[1][LHQ[q - s]], t + q * SPB + r() * 0.006, (e - q) * SPB + 0.15, LHV[q - s] * S.lhv * (0.9 + 0.2 * r()), 'lh');
      }
    }
    // cello counter-line (legato when the next note starts as this one ends)
    const cl = lineOf(k, 'c');
    if (cl && !cel) celloStart(T, cl[1]);
    if (cl) for (let j = 0; j < cl.length; j += 3) {
      const nx = j + 3 < cl.length ? cl[j + 3] : (lineOf(k + 1, 'c') ? lineOf(k + 1, 'c')[0] + 4 : -1);
      celloNote(cl[j + 1], t + cl[j] * SPB, cl[j + 2] * SPB, S.cv * (0.95 + 0.1 * r()), Math.abs(nx - cl[j] - cl[j + 2]) < 0.01);
    }
    if (cel && !lineOf(k + 1, 'c')) { halt(cel.all, t + BAR + 1.2); cel = null; } // phrase over
    // bass
    const bm = at(S.bass, i);
    for (const { c, s, e } of segs) {
      const L = e - s, pat = bm === 1 ? [[0, L, 0.75]] : bm === 2 ? (L >= 4 ? [[0, 1.5, 1], [1.5, 0.5, 0.6], [2, 2, 0.85]] : L >= 2 ? [[0, 1.5, 1], [1.5, 0.5, 0.6]] : [[0, L, 0.9]]) : [];
      for (const [o, d, v] of pat) bassNote(c[0], t + (s + o) * SPB, d * SPB * 0.94, v);
    }
    // pulse: a slow lub-dub heartbeat and soft ticks
    const pm = at(S.pulse, i);
    if (pm) {
      kick(t, 0.85); kick(t + SPB / 2, 0.42);
      const tk = (q, v) => live(t + q * SPB) && oneShot(tickN, tickBus, t + q * SPB, v * TICK, 0.014, r() * 0.3);
      if (pm === 2) {
        kick(t + 2 * SPB, 0.68); kick(t + 2.5 * SPB, 0.36);
        if (r() < 0.25) kick(t + 3.5 * SPB, 0.28);
        for (let q = 0; q < 4; q++) tk(q + 0.5, (q % 2 ? 0.6 : 0.4) * (0.85 + 0.3 * r()));
      } else {
        tk(1, 0.5); tk(3, 0.5);
      }
    }
  }

  return {
    start(t) {
      next = t; n = 0; stopped = false;
      bassO.start(t);
    },
    schedule(until) {
      if (stopped) return;
      while (next < until) {
        if (next + BAR > ctx.currentTime) bar(n, next); // skip bars that are already over
        n++; next += BAR;
      }
    },
    setMood() {}, // title theme: plays the same in every economic mood
    stop(t, fade = 2) {
      if (stopped) return;
      stopped = true;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(MASTER, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      running.forEach((o) => o.stop(t + fade + 0.1));
    },
  };
}
