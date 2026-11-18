// Sound settings and the sound test: every sound the game makes, what it is and where it plays.
import { SOUNDS, SOUND_IDS, TIERS, type Level, type SoundId, type Tier } from '../../sounds';
import { preview, setSoundLevel, sfx, soundLevel } from '../../audio';
import { esc, seg } from '../kit';
import { afterRender, on, render, ui } from '../store';
import { modals } from '../shell';

const LEVEL_LABEL: Record<Level, string> = { off: 'Off', soft: 'Soft', normal: 'Normal' };
export const soundLabel = () => LEVEL_LABEL[soundLevel()];

/** Off, Soft or Normal, and (in the menu) the way to the sound test. */
export const soundRow = (link = true) =>
  `<div class="soundrow" role="group" aria-label="Sound"><span class="lab">Sound</span>${seg('soundLevel', (Object.keys(LEVEL_LABEL) as Level[]).map((l) => [l, LEVEL_LABEL[l]]), soundLevel())}${link ? '<button class="linkish small" data-a="sounds">Hear every sound</button>' : ''}</div>`;

const PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';

modals.sounds = () => {
  const groups = (Object.keys(TIERS) as Tier[]).map((t) => {
    const ids = SOUND_IDS.filter((id) => SOUNDS[id].tier === t);
    return `<h3>${esc(TIERS[t].label)}</h3><p class="small muted" style="margin-top:0">${esc(TIERS[t].about)}</p>
      <div class="choices sfx-list">${ids.map((id) => `<button class="choice" data-a="sfxTry" data-id="${id}" title="Play"><span class="glyph">${PLAY}</span><b>${esc(SOUNDS[id].label)}</b><span class="muted small">${esc(SOUNDS[id].where)}</span></button>`).join('')}</div>`;
  }).join('');
  return `<div class="spread"><h2>Sound</h2><button class="btn sm" data-a="close">Close</button></div>
    <p class="muted">Every sound is made by the game itself, from code, as you play. What you hear most often is the quietest; only the rare moments are louder. Tap one to hear it.</p>
    ${soundRow(false)}
    ${soundLevel() === 'off' ? '<div class="note"><b>Sound is off.</b><p>Choose Soft or Normal to hear these.</p></div>' : ''}
    ${groups}`;
};

on('sounds', () => {
  ui.modal = { kind: 'sounds' };
  render();
});
on('soundLevel', (d) => {
  setSoundLevel(d.v as Level);
  // a typical sound at the new level, so the choice can be judged by ear
  if (d.v !== 'off') preview('deal');
  render();
});
on('sfxTry', (d) => {
  const id = d.id as SoundId;
  if (!SOUNDS[id]) return;
  if (id === 'detent') [0, 3, 6, 9, 11].forEach((n, i) => preview('detent', n, i * 0.08));
  else preview(id);
});

// Opening a dialog is a soft pencil tap, unless it brings its own sound (a card, the report, the ending).
const OWN_SOUND = new Set(['event', 'report', 'over']);
let shownModal = '';
afterRender(() => {
  const kind = ui.modal?.kind ?? '';
  if (kind && kind !== shownModal && !OWN_SOUND.has(kind)) sfx.tap();
  shownModal = kind;
});
