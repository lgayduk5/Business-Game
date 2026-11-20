// Stinger pack for Going Concern: short one-shot cues, synthesised live (no samples).
// Palette: felt piano, soft FM bells, warm filtered pad / horn swell, timpani-like drum,
// one generated room reverb per cue. Home key C major / A minor, like the existing SFX.
// Each cue: (ctx, out, at) => length in seconds; it builds and schedules its own nodes.

export const meta = {
  id: 'stingers',
  name: 'Ledger Cues',
  part: 'stingers',
  blurb: 'Soft felt-piano and bell cues for closing the books, event cards, and the end of the game.',
};

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Seeded PRNG (mulberry32) so every render is identical.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Buffers and waves are built once per AudioContext and reused by every cue.
const cache = new WeakMap();
function shared(ctx) {
  let s = cache.get(ctx);
  if (s) return s;
  const sr = ctx.sampleRate, rnd = prng(1234);
  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < sr; i++) nd[i] = rnd() * 2 - 1;
  // Felt piano: fundamental-heavy, quickly falling harmonics.
  const fh = [0, 1, 0.42, 0.2, 0.11, 0.06, 0.035, 0.02, 0.012];
  const felt = ctx.createPeriodicWave(new Float32Array(fh.length), new Float32Array(fh));
  // Soft-knee curve for the cue output: linear up to -10 dBFS, approaching (never passing) -6 dBFS.
  const knee = new Float32Array(2049), k = 0.32, r = 0.5 - k;
  for (let i = 0; i < knee.length; i++) {
    const x = i / 1024 - 1, a = Math.abs(x);
    knee[i] = Math.sign(x) * (a <= k ? a : k + r * Math.tanh((a - k) / r));
  }
  s = { noise, felt, knee, ir: {} };
  cache.set(ctx, s);
  return s;
}

// Stereo reverb impulse: decaying noise that gets darker as it fades.
function impulse(ctx, secs) {
  const s = shared(ctx);
  if (s.ir[secs]) return s.ir[secs];
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), pre = Math.floor(sr * 0.012);
  const b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = prng(99 + ch), d = b.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const x = i / n, a = 0.5 - 0.38 * x;
      y += a * (rnd() * 2 - 1 - y);
      d[i] = y * Math.exp(-6.9 * x) * Math.min(1, (i - pre) / (sr * 0.006));
    }
  }
  return (s.ir[secs] = b);
}

// A per-cue rig: master gain (with a final fade so the returned length covers the tail),
// gentle high/low cut, one convolver, and the instruments, all timed relative to `at`.
function kit(ctx, out, at, { len, level = 1, verb = 1.6, wet = 0.3, tone = 6000, fade = 0.5, seed = 1 }) {
  const S = shared(ctx), rnd = prng(seed);
  const master = ctx.createGain();
  // closing fade: a cubic curve (gentle at first, silent at `len`) like a damper settling
  const fc = new Float32Array(64).map((_, i) => level * (1 - i / 63) ** 3);
  master.gain.setValueAtTime(level, at);
  master.gain.setValueCurveAtTime(fc, at + len - fade, fade);
  // Filters sweep slowly, so k-rate coefficients are plenty and much cheaper on phones.
  const filt = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    try { b.frequency.automationRate = 'k-rate'; } catch { /* older browsers */ }
    return b;
  };
  const hp = filt('highpass', 70, 0.6); // fundamentals below ~70 Hz only eat headroom on phones
  const lp = filt('lowpass', tone, 0.5);
  // Safety soft-knee (levels are set so it only grazes the loudest attacks).
  const sh = ctx.createWaveShaper();
  sh.curve = S.knee;
  sh.oversample = '2x';
  master.connect(hp).connect(lp).connect(sh).connect(out);
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, verb);
  conv.connect(master);
  const buses = {};
  const bus = (rev) => {
    if (buses[rev]) return buses[rev];
    const g = ctx.createGain(), send = ctx.createGain();
    send.gain.value = wet * rev;
    g.connect(master);
    g.connect(send).connect(conv);
    return (buses[rev] = g);
  };
  const pans = {}; // shared panners, one per (position, reverb send) pair
  const panTo = (p, rev) => {
    const q = Math.round(Math.max(-1, Math.min(1, p)) * 10), key = q + '|' + rev;
    if (pans[key]) return pans[key];
    const pn = ctx.createStereoPanner();
    pn.pan.value = q / 10;
    pn.connect(bus(rev));
    return (pans[key] = pn);
  };
  const T = (t) => at + t + rnd() * 0.004; // tiny human timing, never early

  // Felt piano / mallet pluck: soft attack, two-stage decay, closing low-pass.
  function felt(t, m, v, dur, pan = 0, bright = 1) {
    const t0 = T(t), f = hz(m), pn = panTo(pan, 1);
    v *= 0.94 + rnd() * 0.12;
    dur = Math.max(0.4, dur);
    const o = ctx.createOscillator();
    o.setPeriodicWave(S.felt);
    o.frequency.value = f;
    o.detune.value = (rnd() - 0.5) * 6;
    const c0 = Math.min(6000, 300 + f * (2.5 + 4 * bright)), c1 = Math.min(c0, 220 + f * 2);
    const lp = filt('lowpass', c0, 0.4);
    lp.frequency.setValueAtTime(c0, t0);
    lp.frequency.exponentialRampToValueAtTime(c1, t0 + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.55, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(v * 0.1, t0 + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp).connect(g).connect(pn);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    // felt hammer: a tiny noise thump through the note's own filter and envelope
    const n = ctx.createBufferSource(), ng = ctx.createGain();
    n.buffer = S.noise;
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.linearRampToValueAtTime(0.2, t0 + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    n.connect(ng).connect(lp);
    n.start(t0, rnd() * 0.8, 0.07);
  }

  // A strummed felt-piano chord (low to high); the lowest note is a little softer.
  function chord(t, ms, v, dur, { strum = 0.012, spread = 0.5, bright = 1 } = {}) {
    ms.forEach((m, i) => {
      const p = ms.length > 1 ? (i / (ms.length - 1) - 0.5) * 2 * spread : 0;
      felt(t + i * strum, m, i === 0 ? v * 0.8 : v, dur + (i === 0 ? 0.2 : 0), p, bright);
    });
  }

  // Soft bell: FM (1 : 3.5) with a fast-falling index, plus a slow-beating partner partial.
  function bell(t, m, v, dur, pan = 0, idx = 0.7) {
    const t0 = T(t), f = hz(m), pn = panTo(pan, 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t0 + Math.min(0.5, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(pn);
    const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain();
    c.frequency.value = f;
    mo.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(idx * f * 3.5, t0);
    mg.gain.exponentialRampToValueAtTime(idx * f * 0.05, t0 + 0.45);
    mo.connect(mg).connect(c.frequency);
    c.connect(g);
    const b = ctx.createOscillator(), bg = ctx.createGain();
    b.frequency.value = f + 1.2;
    bg.gain.value = 0.35;
    b.connect(bg).connect(g);
    for (const o of [c, mo, b]) {
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  // Warm pad / horn swell: detuned saws (or triangles) split left/right through low-passes.
  // Small chords get a detuned pair per note; bigger ones alternate notes between the sides.
  function pad(t, ms, dur, v, o = {}) {
    const { att = 0.4, rel = 0.8, cut = 900, cut2 = cut, type = 'sawtooth', spread = 0.45, det = 7, rev = 1.2 } = o;
    const t0 = at + t, pair = ms.length <= 3, peak = v / Math.sqrt(ms.length) * (pair ? 1 : Math.SQRT2);
    for (const side of [-1, 1]) {
      const lp = filt('lowpass', cut, 0.6);
      lp.frequency.setValueAtTime(cut, t0);
      lp.frequency.linearRampToValueAtTime(cut2, t0 + att * 1.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + att);
      g.gain.setValueAtTime(peak, t0 + Math.max(dur, att + 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, att + 0.01) + rel);
      lp.connect(g).connect(panTo(side * spread, rev));
      ms.forEach((m, i) => {
        if (!pair && (i % 2 ? 1 : -1) !== side) return;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = hz(m);
        osc.detune.value = side * det + (rnd() - 0.5) * 3;
        osc.connect(lp);
        osc.start(t0);
        osc.stop(t0 + Math.max(dur, att + 0.01) + rel + 0.05);
      });
    }
  }

  // Timpani-like hit: drum modes (1, 1.5, 1.98, 2.44) with a small pitch settle + a soft thump.
  function timp(t, m, v, dur = 1.8) {
    const t0 = T(t), f = hz(m), pn = panTo(0, 1.3);
    [[1, 1, 1], [1.5, 0.45, 0.6], [1.98, 0.22, 0.45], [2.44, 0.1, 0.3]].forEach(([r, a, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f * r * 1.025, t0);
      o.frequency.exponentialRampToValueAtTime(f * r, t0 + 0.12);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(v * a, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * d);
      o.connect(g).connect(pn);
      o.start(t0);
      o.stop(t0 + dur * d + 0.05);
    });
    const n = ctx.createBufferSource(), lp = filt('lowpass', 320), g = ctx.createGain();
    n.buffer = S.noise;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v * 0.8, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    n.connect(lp).connect(g).connect(pn);
    n.start(t0, rnd() * 0.8, 0.15);
  }

  // Soft timpani roll from t0 to t1, crescendo v0 -> v1: a sustained drum body + noise,
  // pulsed by ~16 strokes per second with seeded jitter. Cheap: 4 sources in total.
  function roll(ta, tb, m, v0, v1, rel = 0.35) {
    const t0 = at + ta, t1 = at + tb, f = hz(m), pn = panTo(0, 1.3);
    const se = ctx.createGain(), cg = ctx.createGain();
    se.gain.setValueAtTime(0.0001, t0);
    for (let ts = t0; ts < t1; ts += 0.056 + rnd() * 0.016) {
      const a = 0.75 + rnd() * 0.25;
      se.gain.setTargetAtTime(a, ts, 0.003);
      se.gain.setTargetAtTime(a * 0.45, ts + 0.012, 0.03);
    }
    cg.gain.setValueAtTime(v0, t0);
    cg.gain.exponentialRampToValueAtTime(v1, t1);
    cg.gain.exponentialRampToValueAtTime(0.0001, t1 + rel);
    se.connect(cg).connect(pn);
    [[1, 1], [1.5, 0.4], [1.98, 0.18]].forEach(([r, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * r;
      g.gain.value = a;
      o.connect(g).connect(se);
      o.start(t0);
      o.stop(t1 + rel + 0.05);
    });
    const n = ctx.createBufferSource(), lp = filt('lowpass', 420), g = ctx.createGain();
    n.buffer = S.noise;
    n.loop = true;
    g.gain.value = 0.9;
    n.connect(lp).connect(g).connect(se);
    n.start(t0);
    n.stop(t1 + rel + 0.05);
  }

  // Soft suspended-cymbal swell into a downbeat (band-passed noise, low level).
  function swell(ta, tb, v) {
    const t0 = at + ta, t1 = at + tb;
    const n = ctx.createBufferSource(), bp = filt('bandpass', 2200), g = ctx.createGain();
    n.buffer = S.noise;
    n.loop = true;
    bp.frequency.setValueAtTime(2200, t0);
    bp.frequency.exponentialRampToValueAtTime(4200, t1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t1);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.9);
    n.connect(bp).connect(g).connect(panTo(0, 1.5));
    n.start(t0);
    n.stop(t1 + 1);
  }

  return { felt, chord, bell, pad, timp, roll, swell };
}

// The three quarter-close cues share one shape: a pickup chord, then the resolution at 0.4 s.
// Only the harmony and brightness change, so they read as one family.
const CADENCE = {
  // Fadd9 -> C (plagal "amen"): top voice A4 -> G4, one bell.
  quarter: {
    a: [41, 60, 65, 67, 69], b: [36, 48, 55, 60, 64, 67],
    padA: [53, 57, 60], padB: [48, 55, 64],
    bells: [[0.4, 79, 1]], bright: 1, cut: 1000, seed: 11,
  },
  // Fadd9 -> (G passing) -> Cadd9 voiced higher: top voice rises A4 -> B4 -> C5, bells climb.
  goodQuarter: {
    a: [41, 60, 65, 67, 69], mid: [55, 62, 71], b: [36, 48, 55, 62, 64, 67, 72],
    padA: [53, 57, 60], padB: [48, 55, 64, 67, 72],
    bells: [[0.4, 76, 0.75], [0.5, 79, 0.85], [0.6, 84, 1], [0.95, 86, 0.35]], bright: 1.4, cut: 1700, seed: 12,
  },
  // Dm7 -> Am7: same falling top voice A4 -> G4 over a minor bass, bell sighs C5 -> B4 (left open).
  badQuarter: {
    a: [38, 57, 60, 65, 69], b: [33, 45, 52, 60, 64, 67],
    padA: [50, 57, 60, 65], padB: [45, 52, 60, 64],
    bells: [[0.4, 72, 0.9], [0.8, 71, 0.75]], bright: 0.6, cut: 650, seed: 13,
  },
};

function cadence(ctx, out, at, c) {
  const len = 2.4;
  const k = kit(ctx, out, at, { len, level: 1.7, verb: 1.2, wet: 0.34, fade: 0.6, seed: c.seed });
  const d2 = len - 0.5, fv = (ms) => 0.11 * Math.sqrt(5 / ms.length); // same loudness whatever the voicing
  k.chord(0, c.a, fv(c.a) * 0.85, 0.65, { strum: 0.016, bright: c.bright }); // damped as the resolution lands
  if (c.mid) k.chord(0.2, c.mid, fv(c.mid) * 0.45, 0.6, { strum: 0.01, bright: c.bright });
  k.chord(0.4, c.b, fv(c.b), d2, { strum: c.mid ? 0.014 : 0.02, bright: c.bright });
  k.pad(0, c.padA, 0.42, 0.045, { att: 0.15, rel: 0.25, cut: c.cut * 0.8, type: 'triangle' });
  k.pad(0.38, c.padB, 0.9, 0.055, { att: 0.3, rel: 0.85, cut: c.cut, type: 'sawtooth' });
  c.bells.forEach(([t, m, v], i) => k.bell(t + 0.04, m, 0.05 * v, len - t - 0.15, (i % 2 ? 0.35 : -0.25)));
  return len;
}

export const stingers = {
  quarter: (ctx, out, at) => cadence(ctx, out, at, CADENCE.quarter),
  goodQuarter: (ctx, out, at) => cadence(ctx, out, at, CADENCE.goodQuarter),
  badQuarter: (ctx, out, at) => cadence(ctx, out, at, CADENCE.badQuarter),

  // Event card: a rising stack of fourths (D G C D) over a low G pad, a bell adds A on top —
  // a quartal Gsus chord that asks a question and does not answer it.
  decision(ctx, out, at) {
    const len = 1.8;
    const k = kit(ctx, out, at, { len, level: 1.9, verb: 1.4, wet: 0.4, fade: 0.5, seed: 21 });
    k.timp(0, 43, 0.06, 1.2);
    k.timp(0.5, 43, 0.035, 1.0);
    k.pad(0, [43, 50, 60], 1.0, 0.06, { att: 0.55, rel: 0.6, cut: 450, cut2: 1100 });
    [62, 67, 72, 74].forEach((m, i) => k.felt(i * 0.11, m, 0.09 + i * 0.008, 1.5 - i * 0.1, -0.3 + i * 0.2));
    k.bell(0.33, 81, 0.04, 1.35, 0.3);
    return len;
  },

  // Victory: rising arpeggio (F then G, with a timpani roll) lands on a C major swell with bells;
  // a short Am7 - Fmaj7 - Gsus4/G phrase lifts the top line E5-G5-A5-C6/B5 to a final C chord.
  win(ctx, out, at) {
    const len = 11.5;
    const k = kit(ctx, out, at, { len, level: 1.4, verb: 2.0, wet: 0.42, fade: 1.2, seed: 41 });
    const arp = [53, 57, 60, 65, 69, 72, 55, 59, 62, 67, 71, 74];
    // each note rings until just past the next chord, so F and G don't smear into each other
    arp.forEach((m, i) => k.felt(i * 0.15, m, 0.075 + i * 0.005, (i < 6 ? 0.9 : 1.8) - i * 0.15 + 0.35, -0.5 + i * 0.09));
    k.felt(0, 41, 0.09, 1.0);
    k.felt(0.9, 43, 0.09, 1.0);
    k.pad(0, [53, 57, 60], 0.9, 0.03, { att: 0.6, rel: 0.25, cut: 600, cut2: 1100 });
    k.pad(0.9, [55, 59, 62, 67], 0.9, 0.04, { att: 0.6, rel: 0.25, cut: 800, cut2: 1500 });
    k.roll(0.9, 1.8, 43, 0.004, 0.06);
    k.swell(0.8, 1.8, 0.012);

    // Arrival on C.
    const A = 1.8;
    k.timp(A, 48, 0.13, 2.2);
    k.chord(A, [36, 48, 55, 60, 64, 67], 0.085, 1.6, { strum: 0.016 });
    k.felt(A + 0.03, 76, 0.085, 1.3, 0.2, 1.2);
    [76, 79, 84].forEach((m, i) => k.bell(A + i * 0.1, m, 0.045, 2.2, -0.4 + i * 0.4));

    // Horn swells under the phrase; felt melody doubled softly by bells.
    const phrase = [
      // [time, bass notes, horn chord, melody notes, chord length]
      [A, [], [48, 55, 60, 64, 67], [], 1],
      [2.8, [45, 57], [45, 52, 60, 64, 67], [79], 1],
      [3.8, [41, 53], [53, 57, 60, 64], [81], 1],
      [4.8, [43, 55], [55, 60, 62, 67], [84], 0.5], // Gsus4, resolves to G at 5.3
    ];
    phrase.forEach(([t, bass, horn, mel, d]) => {
      bass.forEach((m, i) => k.felt(t, m, i ? 0.06 : 0.08, 1.15, -0.2));
      k.pad(t, horn, d - 0.05, 0.07, { att: 0.25 * d, rel: 0.35 * d, cut: 500, cut2: 1700, det: 5, spread: 0.35 });
      mel.forEach((m) => {
        k.felt(t, m, 0.09, 1.2 * d, 0.25, 1.2);
        k.bell(t, m, 0.022, 1.4 * d, 0.4, 0.5);
      });
    });
    k.felt(4.8, 60, 0.05, 0.5, 0);
    k.felt(5.3, 83, 0.075, 0.6, 0.25, 1.2); // C6 -> B5 (sus resolves)
    k.felt(5.3, 59, 0.05, 0.7, 0);
    k.pad(5.3, [55, 59, 62, 67], 0.45, 0.06, { att: 0.08, rel: 0.15, cut: 1500, det: 5, spread: 0.35 });
    k.roll(4.8, 5.8, 43, 0.004, 0.07);
    k.swell(4.9, 5.8, 0.014);

    // Final C major: full chord, long horn + high pad swell, bell cascade and settling chimes.
    const F = 5.8;
    k.timp(F, 48, 0.15, 2.6);
    k.felt(F, 36, 0.09, 4.5, -0.1);
    k.chord(F, [48, 55, 60, 64, 67, 72], 0.1, 3.5, { strum: 0.012 });
    k.felt(F, 84, 0.09, 3, 0.25, 1.1);
    k.pad(F, [48, 55, 60, 64, 67], 3.6, 0.075, { att: 0.9, rel: 2.0, cut: 600, cut2: 1900, det: 5, spread: 0.4 });
    k.pad(F + 0.2, [72, 76, 79], 3.4, 0.022, { att: 1.4, rel: 2.0, cut: 1800, type: 'triangle', rev: 1.6 });
    [72, 76, 79, 84].forEach((m, i) => k.bell(F + i * 0.09, m, 0.04, 3.2, -0.45 + i * 0.3));
    [[7.0, 84, 0.025], [7.8, 79, 0.02], [8.7, 76, 0.016]].forEach(([t, m, v], i) => k.bell(t, m, v, 2.4, i % 2 ? -0.4 : 0.4, 0.5));
    return len;
  },

  // Defeat: a descending A-minor line (E5 D5 C5 B4 A4 . G#4 A4) over a lament bass
  // A-G-F-E, settling on a low A that hums and fades, with one soft distant bell.
  lose(ctx, out, at) {
    const len = 9.0, q = 0.62;
    const k = kit(ctx, out, at, { len, level: 1.95, verb: 2.0, wet: 0.4, fade: 1.2, tone: 5000, seed: 77 });
    const bars = [
      [0, 45, [57, 60, 64]],      // Am
      [2, 43, [55, 59, 62]],      // G
      [4, 41, [53, 57, 60, 64]],  // Fmaj7
      [6, 40, [52, 57, 59]],      // Esus4
      [7, null, [52, 56, 59]],    // E
    ];
    bars.forEach(([b, bass, ch], i) => {
      if (bass) k.felt(b * q, bass, 0.085, i === 3 ? 2.0 : 1.5, -0.15, 0.7);
      k.pad(b * q, ch, (i >= 3 ? 1 : 2) * q, 0.05, { att: 0.35, rel: 0.35, cut: 650, cut2: 800 });
    });
    const mel = [[0, 76, 0.9], [1, 74, 0.9], [2, 72, 0.9], [3, 71, 0.9], [4, 69, 1.5], [6, 69, 0.75], [7, 68, 0.75]];
    mel.forEach(([b, m, d], i) => k.felt(b * q, m, 0.1 - i * 0.004, d, 0.2, 0.8));
    // Inner voices so the line is harmonised, not bare.
    [[0, 64], [2, 62], [4, 60], [6, 64]].forEach(([b, m]) => k.felt(b * q + 0.02, m, 0.05, 1.2, -0.25, 0.6));

    // Home: low A sustained and fading, a soft drum, the last melody note and a far bell.
    const E = 8 * q;
    k.felt(E, 33, 0.05, 3.8, -0.1, 0.8);
    k.felt(E, 45, 0.08, 3.6, 0, 0.6);
    k.chord(E + 0.03, [52, 57, 60], 0.05, 2.6, { strum: 0.02, bright: 0.6 });
    k.felt(E + 0.05, 69, 0.075, 2.8, 0.2, 0.6);
    k.timp(E, 45, 0.05, 2.0);
    k.pad(E, [45, 57], 1.4, 0.05, { att: 0.5, rel: 2.4, cut: 500, type: 'triangle', spread: 0.2 });
    k.pad(E, [52, 57, 60], 0.9, 0.03, { att: 0.4, rel: 1.6, cut: 600 });
    k.bell(E + 0.6, 69, 0.018, 3.0, -0.35, 0.4);
    return len;
  },
};
