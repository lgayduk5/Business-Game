// The contract every synthesised piece in this folder follows (see docs/music.md).

/** The desk track's arrangement, chosen from the game state by moodOf(). */
export type Mood = 'calm' | 'boom' | 'downturn' | 'crisis';

export interface TrackMeta {
  id: string;
  name: string;
  part: 'desk' | 'title' | 'stingers';
  bpm?: number;
  blurb: string;
}

/** A looping piece. It never uses timers: the host calls schedule() a few times a second. */
export interface Track {
  /** Musical time zero, in AudioContext seconds. Called once. */
  start(at: number): void;
  /** Schedule every note that begins before `until` and is not yet scheduled. */
  schedule(until: number): void;
  /** Change arrangement on the next bar, crossfading over a few seconds. Title themes ignore it. */
  setMood(mood: Mood, at: number): void;
  /** Fade out over `fade` seconds; schedule() becomes a no-op. */
  stop(at: number, fade: number): void;
}

export type Cue = 'quarter' | 'goodQuarter' | 'badQuarter' | 'decision' | 'win' | 'lose';

/** Plays one cue into `out` from `at` and returns its length in seconds. */
export type Stinger = (ctx: BaseAudioContext, out: AudioNode, at: number) => number;
