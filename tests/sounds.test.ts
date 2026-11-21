import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DETENT_NOTES, LEVELS, SOUNDS, SOUND_IDS, TIERS, renderSound, type SoundDef, type Tier } from '../src/sounds';

const SR = 48_000;
const peakOf = (b: Float32Array) => b.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
const energyOf = (b: Float32Array, sr = SR) => b.reduce((a, s) => a + s * s, 0) / sr;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

describe('the sound catalogue', () => {
  it('describes every sound and keeps it inside its tier', () => {
    for (const id of SOUND_IDS) {
      const d: SoundDef = SOUNDS[id];
      expect(d.label.length, id).toBeGreaterThan(2);
      expect(d.where.length, id).toBeGreaterThan(10);
      expect(d.peak, id).toBeLessThanOrEqual(TIERS[d.tier].peak);
      expect(d.len, id).toBeLessThanOrEqual(TIERS[d.tier].maxLen);
    }
  });
  it('renders every sound cleanly at the common sample rates', () => {
    for (const sr of [44_100, 48_000]) {
      for (const id of SOUND_IDS) {
        const b = renderSound(id, sr);
        expect(b.length, id).toBe(Math.ceil(SOUNDS[id].len * sr));
        expect(b.every(Number.isFinite), id).toBe(true);
        // exactly as loud as the catalogue says
        expect(peakOf(b), id).toBeCloseTo(SOUNDS[id].peak, 6);
        // starts and ends in silence: no click on either side
        expect(Math.abs(b[0]), id).toBeLessThan(1e-3);
        expect(b[b.length - 1], id).toBe(0);
        const tail = b.subarray(b.length - Math.round(0.002 * sr));
        expect(peakOf(tail), id).toBeLessThan(SOUNDS[id].peak * 0.05);
        // centred on zero: no thump from a DC offset
        expect(Math.abs(b.reduce((a, s) => a + s, 0) / b.length), id).toBeLessThan(0.01);
      }
    }
  });
  it('is reproducible, and the takes of a noisy sound differ', () => {
    for (const id of SOUND_IDS) expect(renderSound(id, SR, 5)).toEqual(renderSound(id, SR, 5));
    for (const id of SOUND_IDS.filter((x) => (SOUNDS[x] as SoundDef).takes)) expect(renderSound(id, SR, 1), id).not.toEqual(renderSound(id, SR, 2));
  });
  it('puts the frequent sounds at the bottom: each tier is louder and longer than the one before', () => {
    const tiers = Object.keys(TIERS) as Tier[];
    const med = tiers.map((t) => median(SOUND_IDS.filter((id) => SOUNDS[id].tier === t).map((id) => energyOf(renderSound(id, SR)))));
    for (let i = 1; i < med.length; i++) expect(med[i], `${tiers[i]} vs ${tiers[i - 1]}`).toBeGreaterThan(med[i - 1] * 1.5);
    // everything you hear while moving around is quieter than any sound for doing something
    const touch = Math.max(...SOUND_IDS.filter((id) => SOUNDS[id].tier === 'touch').map((id) => SOUNDS[id].peak));
    const action = Math.min(...SOUND_IDS.filter((id) => SOUNDS[id].tier === 'action').map((id) => SOUNDS[id].peak));
    expect(touch).toBeLessThan(action);
  });
  it('keeps the slider notches on the pentatonic scale, rising', () => {
    const PENT = new Set([0, 2, 4, 7, 9]); // C D E G A
    for (const f of DETENT_NOTES) expect(PENT.has(((Math.round(12 * Math.log2(f / 261.63)) % 12) + 12) % 12), String(f)).toBe(true);
    expect([...DETENT_NOTES].sort((a, b) => a - b)).toEqual(DETENT_NOTES);
    const pitch = (n: number) => {
      const b = renderSound('detent', SR, 1, n);
      let z = 0;
      for (let i = 1; i < b.length; i++) if (b[i - 1] < 0 && b[i] >= 0) z++;
      return z / SOUNDS.detent.len;
    };
    expect(pitch(DETENT_NOTES.length - 1)).toBeGreaterThan(pitch(0) * 3);
  });
  it('stays quieter than full scale even at Normal, and Soft is well under Normal', () => {
    const loudest = Math.max(...SOUND_IDS.map((id) => SOUNDS[id].peak));
    expect(loudest * LEVELS.normal).toBeLessThan(0.3); // about -10 dBFS
    expect(LEVELS.soft / LEVELS.normal).toBeLessThan(0.5);
    expect(LEVELS.off).toBe(0);
  });
  it('ships no audio files: every sound comes from code', () => {
    const AUDIO = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm|aiff?|caf|mid|midi)$/i;
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    expect(['src', 'public', 'data', 'engine'].flatMap(walk).filter((f) => AUDIO.test(f))).toEqual([]);
  });
});

// ── playback, against a stand-in for the Web Audio API
class Param {
  value = 0;
  setTargetAtTime(v: number) { this.value = v; }
}
class Node_ {
  connect<T>(n: T) { return n; }
  disconnect() {}
}
let started: { buffer: { id: string }; at: number; rate: number }[] = [];
let contexts = 0;
class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = SR;
  destination = new Node_();
  constructor() { contexts++; }
  createGain() { return Object.assign(new Node_(), { gain: new Param() }); }
  createWaveShaper() { return Object.assign(new Node_(), { curve: null }); }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { id: String(len), getChannelData: () => d }; }
  createBufferSource() {
    const s = Object.assign(new Node_(), { buffer: null as any, playbackRate: new Param(), onended: null as null | (() => void), start: (at: number) => started.push({ buffer: s.buffer, at, rate: s.playbackRate.value }) });
    s.playbackRate.value = 1;
    return s;
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

describe('playback', () => {
  let store: Record<string, string>;
  let now = 1000;
  const load = async () => {
    vi.resetModules();
    return import('../src/audio');
  };
  beforeEach(() => {
    store = {};
    started = [];
    contexts = 0;
    now = 1000;
    vi.stubGlobal('window', { AudioContext: FakeContext, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
    vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is silent when sound is off: no audio context is even created', async () => {
    store['gc-sound'] = 'off';
    const a = await load();
    a.sfx.cash();
    a.sfx.win();
    a.preview('event');
    expect(contexts).toBe(0);
    expect(started).toHaveLength(0);
  });
  it('honours the earlier on/off switch, and remembers the new setting', async () => {
    store['gc-muted'] = '1';
    const a = await load();
    expect(a.soundLevel()).toBe('off');
    a.setSoundLevel('soft');
    expect(store['gc-sound']).toBe('soft');
    expect(store['gc-muted']).toBeUndefined();
    a.sfx.tap();
    expect(started).toHaveLength(1);
  });
  it('never stacks a sound on itself: a double tap plays once', async () => {
    const a = await load();
    a.sfx.tap();
    a.sfx.tap();
    expect(started).toHaveLength(1);
    now += 100;
    a.sfx.tap();
    expect(started).toHaveLength(2);
    // the sound test ignores the guard
    a.preview('tap');
    a.preview('tap');
    expect(started).toHaveLength(4);
  });
  it('plays nothing while the game is in the background', async () => {
    const a = await load();
    (document as any).hidden = true;
    a.sfx.event();
    expect(started).toHaveLength(0);
  });
  it('limits how many sounds play at once', async () => {
    const a = await load();
    for (let i = 0; i < 20; i++) a.preview('win');
    expect(started).toHaveLength(8);
  });
  it('delays a sound on the audio clock when asked (the warning after the printer)', async () => {
    const a = await load();
    a.sfx.warning(0.62);
    expect(started[0].at).toBeCloseTo(0.62);
  });
  it('notches a slider only when it crosses a step of the scale', async () => {
    const a = await load();
    const el = { min: '0', max: '1', defaultValue: '0.5', value: '0.5' } as unknown as HTMLInputElement;
    el.value = '0.52'; // same notch as where it started
    a.sfx.slide(el);
    expect(started).toHaveLength(0);
    el.value = '0.75';
    a.sfx.slide(el);
    expect(started).toHaveLength(1);
    now += 100;
    el.value = '0.76';
    a.sfx.slide(el);
    expect(started).toHaveLength(1);
    now += 100;
    el.value = '0';
    a.sfx.slide(el);
    expect(started).toHaveLength(2);
    expect(a.heard.slice(-2)).toEqual(['detent', 'detent']);
  });
  it('switches and steppers have an up and a down', async () => {
    const a = await load();
    a.sfx.toggle(true);
    a.sfx.toggle(false);
    a.sfx.step(true);
    a.sfx.step(false);
    expect(a.heard).toEqual(['toggleOn', 'toggleOff', 'stepUp', 'stepDown']);
  });
});
