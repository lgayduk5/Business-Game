# Music

The soundtrack is synthesised live with the Web Audio API, like the sound effects: no audio files, nothing extra
to download, and it works offline. Three pieces were chosen from seven auditioned options (decision 89).

| Part of the game | When | What plays |
| --- | --- | --- |
| Title | Title screen and the new-company wizard | *Opening Bell* (`src/music/opening-bell.js`): felt piano and strings, a struck bell at the top of each phrase. A three-minute loop that builds and settles. |
| At the desk | Every tab during a game | *Paper Minimalism* (`src/music/paper-minimalism.js`): interlocking marimba lines over a bowed drone, 96 BPM. Changes arrangement with the game (below). |
| Event card | While a card is open | The music bus ducks (−5 dB) and goes muffled (low-pass at 750 Hz); the *decision* cue plays. Crisis cards keep their alarm instead. |
| Quarter close | The report prints | *quarter*, *goodQuarter* after a profitable quarter with record revenue, *badQuarter* after a loss. |
| Game end | Victory or insolvency | *win* or *lose* while the desk track fades out; silence on the end screen. *Keep playing* brings the desk track back. |

The cues are in `src/music/stingers.js`. With music off they fall back to the original sound effects.

## The desk track's mood

`moodOf()` in `src/music/mood.ts`, checked after every render. The track changes on its next bar and crossfades.

- **crisis** — cash is negative, or under two quarters of runway at last quarter's burn (the CFO's "Under two
  quarters of cash" rule). A low ostinato on a tritone, a held drone, a soft clock. Cash beats the economy.
- **downturn** — the economy is in a slowdown or recession. Fewer, softer, lower mallets in a minor mode.
- **boom** — the economy is booming. A second marimba line fills the gaps; brighter harmony, higher bells.
- **calm** — everything else (expansion, recovery).

## How the pieces work

`src/music.ts` is the host. It owns one music bus (into which the duck and muffle are applied) on the same
`AudioContext` as the sound effects, starts and stops pieces, and calls each piece's `schedule()` ten times a
second to keep 0.6 s of notes queued. Music starts at the player's first tap or key press (browsers require one),
pauses while the game is in the background, and has its own switch in the menu and on the title screen. *Turn
sound off* silences it as well.

Each piece is one self-contained ES module. The contract is in `src/music/types.ts`; `tests/music.test.ts` checks
the rules that can be checked statically.

- A loop exports `meta` and `create(ctx, out)` returning `start`, `schedule`, `setMood` and `stop`. The cue pack
  exports `stingers`: functions `(ctx, out, at) => seconds`.
- No timers (the host drives time), no `Math.random` (a seeded generator, so a render is repeatable), no
  imports, no files, no network.
- Loudness: loops around −24 dBFS RMS with peaks at or under −6 dBFS, so they sit under the sound effects; cues
  around −22 dBFS. Bass carries a harmonic above 80 Hz so phone speakers can play it.
- Phones: at most about 40 voices at once and one reverb. The desk and title loops render at 55–70× realtime
  on a desktop. The victory cue is the heaviest piece (about 10×); worth checking on a slow phone if it is
  changed.

## Changing a piece

Write a module that follows the contract, add a `.d.ts` beside it (copy one of the existing ones), import it in
`src/music.ts` and update the list in `tests/music.test.ts`. Listen in the browser with `npm run dev`, and try each
mood from the console: `__gc.ui.g.macro.phase = 'recession'; __gc.render()`.
