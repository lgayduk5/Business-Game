// Renders every game sound to a WAV file, so they can be auditioned (or checked in an audio editor)
// without playing the game, and prints how loud and long each one is.
//   npm run sounds              → shots/sounds/<name>.wav, plus all.wav: every sound in turn, quietest first
// Levels are as heard at the game's Normal volume.
import { mkdirSync, writeFileSync } from 'node:fs';
import { LEVELS, SOUNDS, SOUND_IDS, TIERS, renderSound, type SoundId, type Tier } from '../src/sounds';

const SR = 48_000;
const DIR = 'shots/sounds';
const gain = LEVELS.normal;

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return b;
}
const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');

mkdirSync(DIR, { recursive: true });
const order = (Object.keys(TIERS) as Tier[]).flatMap((t) => SOUND_IDS.filter((id) => SOUNDS[id].tier === t));
const reel: Float32Array[] = [];
const gapSamples = new Float32Array(Math.round(0.6 * SR));
console.log('sound        tier      length  peak dBFS  loudness dBFS');
for (const id of order) {
  const takes: Float32Array[] = id === 'detent'
    ? [0, 3, 6, 9, 11].map((n) => renderSound(id, SR, 1, n))
    : [renderSound(id as SoundId, SR, 1)];
  const one = takes[0].map((s) => s * gain);
  writeFileSync(`${DIR}/${id}.wav`, wav(one));
  // loudness: RMS over the part of the sound that is above -40 dB of its peak
  const peak = one.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  const loud = one.filter((s) => Math.abs(s) > peak * 0.01);
  const rms = Math.sqrt(loud.reduce((a, s) => a + s * s, 0) / Math.max(1, loud.length));
  console.log(`${id.padEnd(12)} ${SOUNDS[id].tier.padEnd(9)} ${(one.length / SR).toFixed(2).padStart(5)}s ${db(peak).padStart(9)} ${db(rms).padStart(13)}`);
  for (const t of takes) {
    reel.push(t.map((s) => s * gain));
    reel.push(id === 'detent' ? new Float32Array(Math.round(0.07 * SR)) : gapSamples);
  }
  if (id === 'detent') reel.push(gapSamples);
}
const total = reel.reduce((n, a) => n + a.length, 0);
const all = new Float32Array(total);
let at = 0;
for (const a of reel) { all.set(a, at); at += a.length; }
writeFileSync(`${DIR}/all.wav`, wav(all));
console.log(`\nWrote ${order.length} sounds and all.wav (${(total / SR).toFixed(0)} s, quietest first) to ${DIR}/`);
