// Paper Minimalism — desk loop, ~96 BPM.
// Chamber minimalism for mallets: a marimba ostinato that grows note by note, a second
// pattern of a different length phasing against it, sparse celesta figures, pencil-tap
// percussion, a bowed low drone and, now and then, a felt piano doubling the marimba.
// Moods swap harmonic areas and orchestration on the next bar; layer buses crossfade.
export const meta = {
  id: 'paper-minimalism',
  name: 'Paper Minimalism',
  part: 'desk',
  bpm: 96,
  blurb: 'Patient marimba patterns over a soft bowed drone, like pencils working through a ledger.',
};

const SPB = 60 / meta.bpm, E8 = SPB / 2, S16 = SPB / 4, BAR = SPB * 4;
const _ = null;

// Modes as semitones above the tonic ('hun' = minor with a raised 4th: the crisis tritone).
const MODE = {
  ion: [0, 2, 4, 5, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10], mix: [0, 2, 4, 5, 7, 9, 10],
  lyd: [0, 2, 4, 6, 7, 9, 11], aeo: [0, 2, 3, 5, 7, 8, 10], hun: [0, 2, 3, 6, 7, 8, 11],
};
// Section = harmonic area (tonic pitch class + mode) and [scale degree, bars] chords (8 bars).
// Chord roots avoid the phrygian degrees, so the 2nd/9th in the patterns is never a minor 9th.
const sec = (tonic, mode, prog, pedal = false) => ({ tonic, md: MODE[mode], prog, pedal });
const FORMS = {
  calm: [
    sec(2, 'dor', [[0, 2], [6, 2], [3, 2], [0, 2]]), // D dorian: Dm C G Dm
    sec(7, 'mix', [[0, 2], [6, 2], [3, 2], [1, 2]]), // G mixolydian: G F C Am
    sec(5, 'ion', [[0, 2], [3, 2], [5, 2], [4, 2]]), // F ionian: F Bb Dm C
    sec(2, 'dor', [[0, 2], [2, 2], [6, 2], [4, 2]]), // D dorian: Dm F C Am
  ],
  boom: [
    sec(2, 'ion', [[0, 2], [3, 2], [5, 2], [4, 2]]), // D ionian: D G Bm A
    sec(7, 'lyd', [[0, 2], [1, 2], [5, 2], [1, 2]]), // G lydian: G A Em A
    sec(2, 'lyd', [[0, 2], [1, 2], [5, 2], [4, 2]]), // D lydian: D E Bm A
    sec(7, 'ion', [[0, 2], [5, 2], [3, 2], [4, 2]]), // G ionian: G Em C D
  ],
  downturn: [ // slower harmonic rhythm
    sec(2, 'aeo', [[0, 4], [5, 4]]), // Dm Bb
    sec(2, 'aeo', [[3, 4], [6, 4]]), // Gm C
    sec(2, 'aeo', [[5, 4], [2, 4]]), // Bb F
    sec(2, 'aeo', [[0, 4], [3, 4]]), // Dm Gm
  ],
  crisis: [ // D pedal under i / VI
    sec(2, 'hun', [[0, 4], [5, 2], [0, 2]], true),
    sec(2, 'hun', [[0, 6], [5, 2]], true),
  ],
};

// Ostinatos as scale steps above the current chord root (0 root, 2 third, 4 fifth, 7 octave).
const PAT_A = [ // main line, 8 eighths aligned to the bar
  [0, 4, 7, 4, 3, 4, 2, 4],
  [7, 4, 2, 4, 0, 4, 2, 1],
  [2, 4, 7, 4, 8, 4, 7, 4],
  [0, 2, 4, 7, 4, 2, 4, 3],
];
const PAT_C = [ // low counter-line; lengths 6/10/5/12 phase against the 8-step bar
  [0, _, _, 4, _, _],
  [0, _, 4, _, _, 7, _, 4, _, _],
  [0, _, 4, _, 2],
  [0, _, _, 4, _, 3, _, _, 4, _, 2, _],
];
const PAT_B = [ // boom: high line on the off-16ths, interlocking with the main line
  [4, _, 7, 8, _, 7],
  [7, 4, _, 8, 7, _, 4],
  [9, 7, _, 4, 7, _],
];
const PAT_L = [ // crisis: low minor line leaning on the tritone (step 3)
  [0, 2, 3, 2, 0, 2, 4, 3],
  [0, _, 3, 2, 0, _, 4, 3],
  [0, 3, 2, 3, 0, 4, 3, 2],
];
const CT = [0, 2, 4, 7, 8, 9]; // bell figure pool: chord tones plus the 9th (steps above the root)

// Per-mood settings: bus levels, darkness (low-passed share of the mix), drone level, registers, density.
const MOODS = {
  calm: {
    bus: { mA: 1, mC: 0.8, bell: 0.8, perc: 0.8, drone: 1, piano: 0.8 },
    dark: 0, drone: 1, aLo: 55, bellLo: 67, bright: 0.8, vel: 1,
    grow: 0.6, rate: 1, aMax: 8, cOn: 0.75, piano: 0.4, bellP: 0.35, shift: [0, 0, -4, 5], pEvery: 4, mut: [4], mutP: 0.5, sus: true,
    perc: ['....p.......p...', '..p...p...p...p.', 'w.......p.....p.', '....p..p....p..p'],
  },
  boom: {
    bus: { mA: 1, mC: 0.7, mB: 0.7, bell: 0.8, perc: 1, drone: 0.95, piano: 0.9 },
    dark: 0, drone: 1.1, aLo: 57, bellLo: 72, bright: 1, vel: 0.95,
    grow: 0.35, rate: 1, aMax: 8, cOn: 0.7, piano: 0.5, bellP: 0.6, shift: [0, 0, 5], pEvery: 4, mut: [4], mutP: 0.5, sus: false,
    perc: ['w.p...p.w.p...p.', 'w...p.p.w...p.pp', '..p.p.p...p.p.p.'],
  },
  downturn: {
    bus: { mA: 0.9, bell: 0.6, perc: 0.6, drone: 1, piano: 0.8 },
    dark: 0.85, drone: 1, aLo: 50, bellLo: 62, bright: 0.45, vel: 0.85,
    grow: 1, rate: 0.5, aMax: 5, cOn: 0, piano: 0.4, bellP: 0.15, shift: [0, 4], pEvery: 8, mut: [2, 4, 6], mutP: 0.9, sus: true,
    perc: ['................', '........p.......', 'w...............'],
  },
  crisis: {
    bus: { mL: 0.75, bell: 0.55, tick: 1, drone: 1 },
    dark: 0.6, drone: 0.7, aLo: 55, bellLo: 67, bright: 0.6, vel: 0.9,
    grow: 1, rate: 1, aMax: 8, cOn: 0, piano: 0, bellP: 0.3, shift: [0], pEvery: 8, mut: [4], mutP: 0.6, sus: false,
    perc: ['................'],
  },
};

// Small seeded PRNG (mulberry32).
function prng(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function create(ctx, out) {
  const rnd = prng(0x51ed96), hum = prng(0x7a11);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const sr = ctx.sampleRate;

  // --- Mix: layer buses -> pan -> dry + ambience send -> mood tone -> master -> out
  const MASTER = 3.4;
  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(out);
  // Mood "darkness": crossfade an open path and a low-passed path (no filter automation).
  const tone = ctx.createGain(), open = ctx.createGain(), dark = ctx.createGain();
  const hlp = ctx.createBiquadFilter(), dlp = ctx.createBiquadFilter();
  hlp.type = dlp.type = 'lowpass';
  hlp.frequency.value = 6000;
  dlp.frequency.value = 1900;
  hlp.Q.value = dlp.Q.value = 0.5;
  tone.connect(hlp).connect(open).connect(master);
  tone.connect(dlp).connect(dark).connect(master);

  // Cheap ambience (a convolver is too heavy for phones): two cross-fed, darkening delays, L and R.
  const send = ctx.createGain(), mrg = ctx.createChannelMerger(2), wet = ctx.createGain();
  send.channelCount = 1;
  send.channelCountMode = 'explicit';
  wet.gain.value = 0.55;
  const dls = [0.071, 0.097].map((d) => {
    const dl = ctx.createDelay(0.2), f = ctx.createBiquadFilter(), fb = ctx.createGain();
    dl.delayTime.value = d;
    f.type = 'lowpass';
    f.frequency.value = 2400;
    fb.gain.value = 0.5;
    send.connect(dl);
    dl.connect(f).connect(fb);
    return { dl, f, fb };
  });
  dls[0].fb.connect(dls[1].dl);
  dls[1].fb.connect(dls[0].dl);
  dls[0].f.connect(mrg, 0, 0);
  dls[1].f.connect(mrg, 0, 1);
  mrg.connect(wet).connect(tone);

  // name: [pan, ambience send, bus low-pass]
  const LAYERS = {
    mA: [-0.25, 0.3], mC: [0.2, 0.25], mB: [0.35, 0.35], mL: [-0.1, 0.25], bell: [0.3, 0.55, 5000],
    perc: [0.15, 0.2], tick: [-0.2, 0.15], drone: [0, 0.2], piano: [-0.05, 0.35, 1500],
  };
  const bus = {};
  for (const [k, [pan, amt, lpf]] of Object.entries(LAYERS)) {
    const g = ctx.createGain(), p = ctx.createStereoPanner(), s = ctx.createGain();
    g.gain.value = 0;
    p.pan.value = pan;
    s.gain.value = amt;
    if (lpf) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lpf;
      g.connect(f).connect(p);
    } else g.connect(p);
    p.connect(tone);
    p.connect(s).connect(send);
    bus[k] = g;
  }

  const noise = ctx.createBuffer(1, sr, sr);
  { const r = prng(5), d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  const pw = ctx.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, 0.42, 0.18, 0.08, 0.04, 0.02]));

  // --- Instruments (envelopes start from ~0, end with a short fade, never start in the past)
  const late = (t) => t < ctx.currentTime;
  function env(g, t, a, att, tau) { // soft attack, exponential decay to ~-48 dB, 10 ms fade; returns end
    const e = t + att + tau * 5.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + att);
    g.gain.exponentialRampToValueAtTime(a * 0.004, e);
    g.gain.linearRampToValueAtTime(0, e + 0.01);
    return e + 0.02;
  }
  function partial(dest, t, f, a, att, tau) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(env(g, t, a, att, tau));
  }
  // Marimba: sine bar + inharmonic partials (3.93x, 9.88x) that die quickly; softer mallet = slower attack.
  function marimba(dest, t, m, a, bright) {
    if (late(t)) return;
    const f = hz(m), tau = Math.min(0.38, Math.max(0.12, 0.3 * Math.sqrt(262 / f)));
    const att = 0.004 + (1 - bright) * 0.006;
    partial(dest, t, f, a, att, tau);
    partial(dest, t, f * 3.93, a * 0.25 * bright * Math.min(1, 600 / f), att * 0.7, tau * 0.2);
    if (f * 9.88 < 5000) partial(dest, t, f * 9.88, a * 0.06 * bright, att * 0.5, 0.022);
  }
  // Celesta / kalimba bell: pure tone with a quick inharmonic tine partial.
  function bell(t, m, a) {
    if (late(t)) return;
    const f = hz(m);
    partial(bus.bell, t, f, a, 0.003, 0.42);
    if (f < 1000) partial(bus.bell, t, f * 5.4, a * 0.06, 0.002, 0.03);
  }
  // Felt piano: soft harmonic wave, slow felt attack, two-stage decay; bus is low-passed.
  function piano(t, m, a) {
    if (late(t)) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(pw);
    o.frequency.value = hz(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + 0.012);
    g.gain.exponentialRampToValueAtTime(a * 0.35, t + 0.35);
    g.gain.exponentialRampToValueAtTime(a * 0.006, t + 3.2);
    g.gain.linearRampToValueAtTime(0, t + 3.22);
    o.connect(g).connect(bus.piano);
    o.start(t);
    o.stop(t + 3.25);
  }
  function pencil(t, a) {
    if (late(t)) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'bandpass';
    f.frequency.value = 1500 + hum() * 600;
    f.Q.value = 1.6;
    s.connect(f).connect(g).connect(bus.perc);
    s.start(t, hum() * 0.8);
    s.stop(env(g, t, a, 0.0015, 0.012));
  }
  function wood(dest, t, f, a, tau = 0.035) {
    if (late(t)) return;
    partial(dest, t, f, a, 0.0015, tau);
    partial(dest, t, f * 2.62, a * 0.25, 0.001, tau * 0.4);
  }

  // Bowed drone: four persistent detuned saws (root x2, fifth, octave) through a fixed low-pass.
  // A chord change is a bow change: the level dips, the pitches slide for 80 ms, then swell back.
  const dG = ctx.createGain(), dF = ctx.createBiquadFilter();
  dG.gain.value = 0;
  dF.type = 'lowpass';
  dF.frequency.value = 680;
  dF.Q.value = 0.7;
  const dH = ctx.createBiquadFilter(); // trim the sub fundamental: phones cannot play it anyway
  dH.type = 'highpass';
  dH.frequency.value = 100;
  dH.Q.value = 0.7;
  dF.connect(dH).connect(dG).connect(bus.drone);
  const dVox = [[-7, 1], [6, 0.9], [4, 0.6], [-3, 0.45]].map(([det, w]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.detune.value = det;
    g.gain.value = w;
    o.connect(g).connect(dF);
    return { o, f: 0 };
  });
  function bow(t, notes, dur, amp) {
    const g = dG.gain, now = ctx.currentTime;
    t = Math.max(t, now + 0.05);
    if (dVox[0].f) { // lift the bow (dropping any ease-off still pending from a cut-short chord)
      g.cancelScheduledValues(Math.max(t - 0.18, now));
      g.setTargetAtTime(amp * 0.3, Math.max(t - 0.18, now), 0.06);
    }
    dVox.forEach((v, i) => {
      const f = hz(notes[i]), p = v.o.frequency;
      if (!v.f) p.setValueAtTime(f, t);
      else if (v.f !== f) {
        p.setValueAtTime(v.f, Math.max(t - 0.03, now));
        p.exponentialRampToValueAtTime(f, t + 0.05);
      }
      v.f = f;
    });
    g.setTargetAtTime(amp, t, 0.45);
    g.setTargetAtTime(amp * 0.75, t + dur * 0.55, dur * 0.2); // bow eases off through the chord
  }

  // --- State
  let t0 = 0, step = 0, started = false, stopped = false;
  let mood = 'calm', prev = 'calm', pend = null, pendAt = 0, changeBar = -99;
  let gBar = 0, mBar = 0, bi = 0, S = null, chord = null, nA = 8, lastBell = -9;
  const live = {};

  // Pitch of scale step `st` above the current chord root, root placed in [lo, lo+11].
  function note(lo, st) {
    const { area, ci } = chord, md = area.md;
    const pc = (area.tonic + md[ci]) % 12, root = lo + ((((pc - lo) % 12) + 12) % 12);
    const k = ci + st, iv = md[((k % 7) + 7) % 7] + 12 * Math.floor(k / 7) - md[ci];
    return root + iv - (MOODS[mood].sus && iv % 12 === 6 ? 1 : 0); // calm/downturn: #4 becomes a sus4
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Seeded plan for one 8-bar section: which patterns, registers, entries and drop-outs.
  function plan(area, P, key) {
    return {
      key, area,
      a: pick(PAT_A), aLo: P.aLo + pick(P.shift),
      grow: rnd() < P.grow, k0: 2 + Math.floor(rnd() * 3),
      order: [0, 4, ...shuffle([2, 6]), ...shuffle([1, 3, 5, 7])],
      c: pick(PAT_C), cLo: 48 + pick([0, 0, 3]), cOn: rnd() < P.cOn, cFrom: pick([0, 1, 2, 4]), cTo: pick([8, 8, 7, 6]),
      b: pick(PAT_B), bFrom: pick([0, 1, 2, 4]),
      l: pick(PAT_L),
      piano: rnd() < P.piano, pFrom: pick([2, 4]),
      perc: pick(P.perc),
      bellLo: P.bellLo + pick([0, 0, -3]),
    };
  }

  function levels(t, tau) {
    const P = MOODS[mood];
    for (const k in bus) {
      if (tau) bus[k].gain.setTargetAtTime(P.bus[k] || 0, t, tau);
      else bus[k].gain.setValueAtTime(P.bus[k] || 0, t);
    }
    for (const [g, v] of [[open, 1 - P.dark], [dark, P.dark]]) {
      if (tau) g.gain.setTargetAtTime(v, t, tau * 1.3);
      else g.gain.setValueAtTime(v, t);
    }
  }

  function barStart(t) {
    if (pend && t >= pendAt - 0.01) {
      prev = mood;
      mood = pend;
      pend = null;
      mBar = 0;
      changeBar = gBar;
      levels(t, 0.9);
    }
    const P = MOODS[mood], form = FORMS[mood], sn = Math.floor(mBar / 8), key = changeBar + ':' + sn;
    bi = mBar % 8;
    if (!S || S.key !== key) {
      S = plan(form[sn % form.length], P, key);
      if (gBar === 0) { S.grow = true; S.k0 = 2; } // the very first phrase builds up from two notes
      else if (mBar === 0) { S.k0 = Math.max(S.k0, 4); S.grow = S.grow && mood !== 'boom'; } // keep the pulse through a mood change
    }
    for (const k in bus) live[k] = (P.bus[k] || 0) > 0 || (gBar - changeBar < 2 && (MOODS[prev].bus[k] || 0) > 0);

    // Chord for this bar; the drone re-bows on each chord (or holds a pedal per section).
    let acc = 0;
    for (const [deg, len] of S.area.prog) {
      if (bi < acc + len) {
        chord = { area: S.area, ci: S.area.pedal ? 0 : deg };
        const pedal = S.area.pedal;
        if (pedal ? bi === 0 : bi === acc) {
          const r = note(38, 0);
          bow(t, pedal ? [r, r, r + 12, r + 12] : [r, r, r + 7, r + 12], (pedal ? 8 : len) * BAR, 0.019 * P.drone);
        }
        chord.ci = deg;
        break;
      }
      acc += len;
    }

    // Additive process: the main line gains a note per bar (or drops some before a new section).
    nA = S.grow ? Math.min(8, Math.floor(S.k0 + bi * P.rate)) : bi === 7 ? 5 : 8;
    nA = Math.min(nA, P.aMax);
    if (P.mut.includes(bi) && rnd() < P.mutP) { // mutation: one sounding note of the main line changes
      S.a = S.a.slice();
      S.a[S.order[1 + Math.floor(rnd() * (nA - 1))]] = pick([1, 2, 3, 4, 7]);
      S.l = S.l.slice();
      S.l[S.order[1 + Math.floor(rnd() * (nA - 1))]] = pick([0, 2, 3, 4]);
    }

    // Occasional bell figure, walking over chord tones.
    if (live.bell && gBar - lastBell >= 2 && rnd() < P.bellP) {
      lastBell = gBar;
      if (mood === 'crisis') {
        bell(t + E8 * 2, note(S.bellLo, 7), 0.024);
        bell(t + E8 * 5, note(S.bellLo, 3), 0.02);
      } else {
        let i = Math.floor(rnd() * 4), o = pick([0, 2, 3, 4]);
        const n = 2 + Math.floor(rnd() * 3);
        for (let j = 0; j < n && o < 8; j++) {
          bell(t + o * E8, note(S.bellLo, CT[i]), 0.032 * (1 - j * 0.12));
          o += pick([1, 2, 2, 3]);
          i = Math.max(0, Math.min(CT.length - 1, i + pick([-1, 1, 1, -2, 2])));
        }
      }
    }
    mBar++;
    gBar++;
  }

  function stepNotes(t, s16) {
    const P = MOODS[mood], i8 = s16 >> 1, e8 = bi * 8 + i8;
    const swell = 0.88 + 0.12 * Math.sin((Math.PI * (bi + i8 / 8)) / 8);
    const acc = i8 === 0 ? 0.92 : i8 === 4 ? 0.86 : i8 & 1 ? 0.68 : 0.8;
    const h = 0.92 + 0.16 * hum();
    if ((s16 & 1) === 0) {
      const on = S.order.indexOf(i8) < nA;
      if (live.mA && on && S.a[i8] !== _) {
        const m = note(S.aLo, S.a[i8]);
        marimba(bus.mA, t, m, 0.07 * acc * swell * h * P.vel, P.bright);
        if (live.piano && S.piano && bi >= S.pFrom && i8 % P.pEvery === 0) piano(t + 0.014, m < 60 ? m + 12 : m, 0.04 * h); // a hair behind the mallet
      }
      if (live.mC && S.cOn && bi >= S.cFrom && bi < S.cTo) {
        const st = S.c[e8 % S.c.length];
        if (st !== _) marimba(bus.mC, t, note(S.cLo, st), 0.06 * h * P.vel, P.bright * 0.8);
      }
      if (live.mL && on && S.l[i8] !== _) marimba(bus.mL, t, note(45, S.l[i8]), 0.075 * acc * h, 0.75);
    } else if (live.mB && bi >= S.bFrom) {
      const st = S.b[e8 % S.b.length];
      if (st !== _) marimba(bus.mB, t, note(60, st), 0.05 * h * swell, P.bright);
    }
    const pc = S.perc[s16];
    if (live.perc && pc === 'p') pencil(t, 0.028 * h);
    if (live.perc && pc === 'w') wood(bus.perc, t, 760, 0.016 * h);
    if (live.tick && s16 % 4 === 0) wood(bus.tick, t, (s16 / 4) % 2 ? 1180 : 1420, s16 ? 0.012 : 0.015, 0.016);
  }

  return {
    start(at) {
      if (started || stopped) return;
      started = true;
      t0 = Math.max(at, ctx.currentTime);
      levels(t0, 0);
      dVox.forEach((v) => v.o.start(t0));
    },
    schedule(until) {
      if (!started || stopped) return;
      const now = ctx.currentTime;
      if (t0 + step * S16 < now - 0.1) { // host stalled: skip ahead to the next bar line
        const nb = Math.ceil((now - t0) / BAR), skipped = nb - Math.ceil(step / 16);
        gBar += skipped;
        mBar += skipped;
        step = nb * 16;
      }
      while (t0 + step * S16 < until) {
        const t = t0 + step * S16, s16 = step % 16;
        if (s16 === 0) barStart(t);
        stepNotes(t, s16);
        step++;
      }
    },
    setMood(m, at) {
      if (!MOODS[m]) return;
      if (!started) { mood = prev = m; return; }
      pend = m === mood ? null : m;
      pendAt = at ?? 0;
    },
    stop(at, fade = 2) {
      if (stopped) return;
      stopped = true;
      const t = Math.max(at ?? 0, ctx.currentTime);
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(MASTER, t);
      master.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
      master.gain.setValueAtTime(0, t + Math.max(0.05, fade) + 0.01);
      if (started) dVox.forEach((v) => v.o.stop(t + Math.max(0.05, fade) + 0.05));
    },
  };
}
