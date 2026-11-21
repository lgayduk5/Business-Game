// App frame: top strip, navigation, modal host.
import { quarterOf, yearOf, type GameState } from '@engine';
import { ICON, esc, logo, toggleLine } from './kit';
import { on, render, ui, type Tab } from './store';
import { cashTip } from './tips';
import { sfx } from '../audio';

/** The quarter on the clock: once a game is over, the last one played (the turn counter has already moved on). */
const shownTurn = (g: GameState) => (g.status !== 'playing' && !g.continued && g.outcome ? g.outcome.turn : g.turn);

const TABS: [Tab, string, string][] = [
  ['hq', 'HQ', ICON.hq],
  ['map', 'Map', ICON.map],
  ['ops', 'Offices', ICON.ops],
  ['corp', 'Corporate', ICON.corp],
  ['intel', 'Intel', ICON.intel],
];
/** Tabs that exist in this build (later milestones register more). */
export const screens: Partial<Record<Tab, (g: GameState) => string>> = {};
export const modals: Record<string, (g: GameState | null, data: any) => string> = {};
export const tabDots: Partial<Record<Tab, (g: GameState) => boolean>> = {};
/** Which tabs a game shows (a campaign chapter opens one layer at a time). */
export const tabGate = { allow: (_g: GameState, _t: Tab): boolean => true };

export function shell(g: GameState): string {
  const c = g.company;
  if (!tabGate.allow(g, ui.tab)) ui.tab = 'hq';
  const body = (screens[ui.tab] ?? screens.hq!)(g);
  const over = g.status !== 'playing' && !g.continued;
  return `<div class="shell">
    <nav class="tabs" aria-label="Sections">
      <div class="rail-brand"><span class="mark">Going Concern</span></div>
      ${TABS.filter(([t]) => screens[t] && tabGate.allow(g, t)).map(([t, label, icon]) => `<button data-a="tab" data-v="${t}" aria-current="${ui.tab === t}">${icon}<span>${label}</span>${tabDots[t]?.(g) ? '<i class="dot"></i>' : ''}</button>`).join('')}
    </nav>
    <header class="top">
      <span style="flex:0 0 auto">${logo(c.name, 'var(--hi)', 34)}</span>
      <button class="who linkish" data-a="menu" style="text-align:left;text-decoration:none" aria-label="Menu">
        <div class="name">${esc(c.name)}</div><div class="when">Year ${yearOf(shownTurn(g))}, quarter ${quarterOf(shownTurn(g))}</div>
      </button>
      <div class="cash"><div class="when">Cash</div>${cashTip(g)}</div>
      ${over ? `<button class="btn go sm" data-a="showOver">Results</button>` : `<button class="btn go" data-a="endTurn">${g.queue.length ? 'Decide' : 'End quarter'}</button>`}
    </header>
    <main class="main">${body}</main>
  </div>${modalHost(g)}${ui.busy ? `<div class="busy" role="status">${esc(ui.busy)}</div>` : ''}`;
}

export function modalHost(g: GameState | null): string {
  const m = ui.modal;
  if (!m || !modals[m.kind]) return '';
  return `<div class="scrim"><div class="modal" role="dialog" aria-modal="true">${modals[m.kind](g, m.data)}</div></div>`;
}

on('tab', (d) => {
  ui.tab = d.v as Tab;
  sfx.page();
  render(false);
});
on('close', () => {
  ui.modal = null;
  render();
});
on('sub', (d) => {
  ui.sub[d.k!] = d.v!;
  const tab = d.k as Tab;
  if (ui.tab !== tab && ['hq', 'map', 'ops', 'corp', 'intel'].includes(tab)) {
    ui.tab = tab;
    sfx.page();
    return render(false);
  }
  sfx.tap();
  render();
});

on('chartLine', (d) => {
  sfx.toggle(toggleLine(d.k!));
  render();
});
