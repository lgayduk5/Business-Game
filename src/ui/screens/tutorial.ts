// First-game tutorial: a checklist on HQ that ticks itself off as the player does each thing.
import type { GameState } from '@engine';
import { esc } from '../kit';
import { afterRender, markHooks, on, render, ui } from '../store';
import { hqExtras } from './hq';
import { sfx } from '../../audio';
import { musicOn } from '../../music';

interface Step { title: string; text: string; done: (g: GameState) => boolean; go?: [action: string, label: string, attrs?: string] }
const c = (g: GameState, k: string) => !!g.counters['tut:' + k];
/** The checklist shows for the first two years only. */
export const TUTORIAL_QUARTERS = 8;
export const STEPS: Step[] = [
  { title: 'Ask a number where it came from', text: 'Every dotted number explains itself. Tap Cash at the top, or any figure below.', done: (g) => c(g, 'tip') },
  { title: 'Visit your office', text: 'It is limited by one thing — demand, people or plant. The yellow note tells you which.', done: (g) => c(g, 'act:office') || c(g, 'tab:ops'), go: ['tab', 'Open Offices', 'data-v="ops"'] },
  { title: 'Hire', text: 'Use + on a role to open positions. They fill over the quarter from the local talent pool.', done: (g) => c(g, 'act:reqs') },
  { title: 'Set your price or marketing', text: 'A small premium is often worth it when you are short of capacity; a small discount fills idle capacity.', done: (g) => c(g, 'act:price') || c(g, 'act:marketing') },
  { title: 'End the quarter', text: 'The books close, customers decide, and a report prints out.', done: (g) => g.turn >= 1 },
  { title: 'Read the statements', text: 'Corporate → Money → Statements: profit, the balance sheet, and where the cash actually went.', done: (g) => c(g, 'tab:corp'), go: ['tab', 'Open Corporate', 'data-v="corp"'] },
  { title: 'Ask the advisors', text: 'Intel → Advisor explains what moved this quarter and what to watch.', done: (g) => c(g, 'sub:intel:advisor'), go: ['sub', 'Open the advisor', 'data-k="intel" data-v="advisor"'] },
  { title: 'Look beyond your city', text: 'On the map, study an unexplored city or open a second office when you can afford one.', done: (g) => c(g, 'act:scout') || c(g, 'act:openOffice') || g.company.offices.length > 1, go: ['tab', 'Open the map', 'data-v="map"'] },
];

hqExtras.unshift((g) => {
  // Retires on its own after two years (review wave 3): by then it is clutter, finished or not.
  if (!g.settings.tutorial || g.mode === 'scenario' || g.turn >= TUTORIAL_QUARTERS) return '';
  const done = STEPS.filter((s) => s.done(g)).length;
  if (done === STEPS.length) {
    return `<div class="sheet wide"><div class="spread"><h2 style="margin-top:0">You know the basics</h2><button class="btn sm" data-a="tutOff">Dismiss</button></div>
      <p style="margin:0">From here it is strategy: which markets, how fast, and how to pay for it. The glossary (Intel → Glossary) is there when a term is unfamiliar.</p></div>`;
  }
  const next = STEPS.findIndex((s) => !s.done(g));
  const st = STEPS[next];
  return `<div class="sheet wide"><div class="spread"><h2 style="margin-top:0">First quarters</h2><span class="small muted">${done} of ${STEPS.length} · <button class="linkish small" data-a="tutOff">Skip</button></span></div>
    <div class="meter" style="margin-bottom:10px"><i style="width:${(done / STEPS.length) * 100}%"></i></div>
    <p style="margin:0"><b class="hi">${esc(st.title)}</b></p><p class="small" style="margin:4px 0 0">${esc(st.text)}</p>
    ${st.go ? `<button class="btn sm" style="margin-top:8px" data-a="${st.go[0]}" ${st.go[2] ?? ''}>${esc(st.go[1])}</button>` : ''}
    <p class="small muted" style="margin:10px 0 0">Still to do: ${STEPS.filter((s, i) => i !== next && !s.done(g)).map((s) => esc(s.title.toLowerCase())).join(', ') || 'nothing else'}.</p></div>`;
});
on('tutOff', () => {
  ui.g!.settings.tutorial = false;
  sfx.toggle(false);
  render();
});

// A tick as each step is done, and a chime for the last one. Steps done before this session (a loaded
// game) count silently; a step done by ending a quarter ticks after the report has printed, and with music
// on after the quarter's cue too (it starts at 0.62 s and resolves at about 1 s; see advance in modals.ts).
let seen: { id: string; done: number } | null = null;
function progress() {
  const g = ui.g;
  if (!g || ui.screen !== 'game') return;
  const done = STEPS.filter((s) => s.done(g)).length;
  const active = g.settings.tutorial && g.mode !== 'scenario' && g.turn < TUTORIAL_QUARTERS;
  if (active && seen?.id === g.id && done > seen.done) {
    const delay = ui.modal?.kind === 'report' ? (musicOn() ? 1.2 : 0.75) : 0.09;
    if (done === STEPS.length) sfx.milestone(delay);
    else sfx.check(delay);
  }
  seen = { id: g.id, done };
}
markHooks.push(() => queueMicrotask(progress));
afterRender(progress);
