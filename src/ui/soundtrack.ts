// What music the screen calls for: the title theme before a game, the desk track during one (its
// arrangement following moodOf), ducked under event cards, and silence once a game has ended.
import { afterRender, on, render, ui } from './store';
import { musicOn, musicSync, setMusic } from '../music';
import { moodOf } from '../music/mood';

afterRender(() => {
  const g = ui.g;
  const playing = !!g && (g.status === 'playing' || g.continued);
  musicSync({
    part: ui.screen === 'game' ? (playing ? 'desk' : null) : 'title',
    mood: ui.screen === 'game' && g ? moodOf(g) : 'calm',
    focus: ui.modal?.kind === 'event',
  });
});

on('music', () => {
  setMusic(!musicOn());
  render();
});

export const musicButton = (cls = 'btn') => `<button class="${cls}" data-a="music">${musicOn() ? 'Turn music off' : 'Turn music on'}</button>`;
