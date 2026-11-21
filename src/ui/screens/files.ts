// Saving, loading, importing and exporting games; title-screen entries for scenarios and saves.
import { INDUSTRIES, CITIES, FOUNDERS, IND_LIST, hashSeed, turnLabel, type GameState } from '@engine';
import { esc } from '../kit';
import { act, on, persist, render, toast, ui } from '../store';
import { modals } from '../shell';
import { afterTurn, menuExtras } from './modals';
import { startHooks, titleExtras } from './title';
import { autosave, deleteSave, exportSave, importSave, listSaves, loadFrom, saveTo } from '../../storage/saves';
import { sfx } from '../../audio';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export async function refreshSaves() {
  ui.saves = await listSaves();
}

// The browser can refuse a save (storage full, or turned off in private browsing): say so, once, rather than
// let the player find the game gone when the page next opens.
const UNSAVED = 'This game could not be saved: the browser\'s storage is full or turned off. It will be lost when this page closes.';
let warned = false;
function kept(ok: boolean) {
  if (!ok && !warned) toast(UNSAVED, true);
  warned = !ok;
}

// autosave every quarter, when a game starts, shortly after every decision, and when the app is hidden
afterTurn.push(async (g) => {
  kept(await autosave(g));
});
let saveTimer = 0;
async function saveNow() {
  const g = ui.g;
  if (!g || ui.busy || ui.screen !== 'game') return;
  kept(await autosave(g));
}
persist.soon = () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 700);
};
// also lists the saves again, so the title screen shown after leaving a game offers it at its latest quarter
persist.now = () => {
  clearTimeout(saveTimer);
  return saveNow().then(refreshSaves);
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void persist.now();
});
window.addEventListener('pagehide', () => void persist.now());
startHooks.push(() => {
  if (ui.g) void autosave(ui.g).then(kept).then(refreshSaves);
});

titleExtras.push(() => {
  const last = ui.saves[0];
  return `${last ? `<button class="btn" data-a="loadSlot" data-slot="${esc(last.slot)}">Continue ${esc(last.name)}, ${esc(last.label)}</button>` : ''}
    ${ui.saves.length ? `<button class="btn" data-a="loadMenu">Load a game</button>` : ''}`;
});
// Ironman games keep one autosave and nothing else: no slots and no save files to restore from.
menuExtras.push((g) => (g && !g.rules.ironman ? `<button class="btn" data-a="saveMenu">Save to a slot</button><button class="btn" data-a="export">Export save file</button>` : '')
  + (g?.rules.ironman ? '<p class="small muted" style="margin:0">Ironman: this game saves itself, and only once.</p>' : '')
  + `<button class="btn" data-a="loadMenu">Load a game</button><label class="btn" style="cursor:pointer">Import save file<input type="file" accept=".json,application/json" data-c="import" hidden></label>`);

modals.load = () => `<div class="spread"><h2>Load a game</h2><button class="btn sm" data-a="close">Close</button></div>
  ${ui.saves.length ? `<div class="choices" style="grid-template-columns:1fr">${ui.saves.map((s) => `<div class="choice" style="display:flex;gap:10px;align-items:center;justify-content:space-between">
    <button class="linkish" style="text-align:left;text-decoration:none;flex:1" data-a="loadSlot" data-slot="${esc(s.slot)}"><b>${esc(s.name)}</b><span class="muted">${INDUSTRIES[s.industry as keyof typeof INDUSTRIES]?.name ?? ''}, ${esc(s.label)}. ${s.slot.startsWith('auto:') ? 'Autosave' : `Slot ${esc(s.slot.replace('slot', ''))}`}, ${ago(s.when)}.</span></button>
    <button class="btn sm danger" data-a="delSlot" data-slot="${esc(s.slot)}" aria-label="Delete ${esc(s.name)}">Delete</button></div>`).join('')}</div>` : '<p class="muted">No saved games yet. Games save themselves at the end of every quarter.</p>'}
  <p class="small muted" style="margin-top:12px">Saves live in this browser on this device. Export a save file to move a game to another device.</p>
  <label class="btn" style="cursor:pointer">Import save file<input type="file" accept=".json,application/json" data-c="import" hidden></label>`;

modals.saveSlots = (g) => `<div class="spread"><h2>Save to a slot</h2><button class="btn sm" data-a="close">Close</button></div>
  <p class="muted">The game also saves itself every quarter. Slots are for keeping a moment you might want to come back to.</p>
  <div class="choices" style="grid-template-columns:1fr">${[1, 2, 3].map((n) => {
    const s = ui.saves.find((x) => x.slot === 'slot' + n);
    return `<button class="choice" data-a="saveSlot" data-slot="slot${n}"><b>Slot ${n}</b><span class="muted">${s ? `${esc(s.name)}, ${esc(s.label)} — will be replaced` : 'Empty'}</span></button>`;
  }).join('')}</div>${g ? `<p class="small muted">Saving ${esc(g.company.name)} at ${turnLabel(g.turn)}.</p>` : ''}`;

/** Open a game: the HQ of a fresh or loaded company. */
export function enter(g: GameState) {
  ui.g = g;
  ui.screen = 'game';
  ui.tab = 'hq';
  ui.sub = {};
  ui.sel = {};
  ui.modal = null;
  render(false);
}
on('loadMenu', async () => {
  await refreshSaves();
  ui.modal = { kind: 'load' };
  render();
});
on('loadSlot', async (d) => {
  const g = await loadFrom(d.slot!);
  if (!g) return toast('That save could not be read.', true);
  sfx.page();
  enter(g);
  toast(`Loaded ${g.company.name}, ${turnLabel(g.turn)}.`);
});
// one tap deleted a game for good, without asking (an Ironman game's only save among them)
on('delSlot', (d) => {
  const s = ui.saves.find((x) => x.slot === d.slot);
  ui.modal = { kind: 'confirm', data: { title: `Delete ${s ? s.name : 'this save'}?`, text: `${s ? `The ${s.slot.startsWith('auto:') ? 'autosave' : 'save'} at ${s.label}` : 'It'} is removed from this device for good.`, yes: 'Delete', act: 'doDelSlot', arg: d.slot } };
  render();
});
on('doDelSlot', async (d) => {
  await deleteSave(d.arg!);
  await refreshSaves();
  sfx.toggle(false);
  ui.modal = { kind: 'load' };
  render();
});
on('saveMenu', async () => {
  await refreshSaves();
  ui.modal = { kind: 'saveSlots' };
  render();
});
on('saveSlot', async (d) => {
  if (ui.g!.rules.ironman) return;
  const ok = await saveTo(d.slot!, ui.g!);
  await refreshSaves();
  ui.modal = null;
  act(ok ? { ok, msg: `Saved to slot ${d.slot!.replace('slot', '')}.` } : { ok, msg: UNSAVED }, sfx.stamp);
});
on('export', () => {
  if (ui.g!.rules.ironman) return;
  exportSave(ui.g!);
  sfx.stamp();
  toast('Save file downloaded.');
});
on('import', async (_d, el) => {
  const file = (el as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const g = await importSave(file);
    const ok = await saveTo('auto:' + g.id, g);
    await refreshSaves();
    sfx.page();
    enter(g);
    toast(ok ? `Imported ${g.company.name}, ${turnLabel(g.turn)}.` : UNSAVED, !ok);
  } catch (e) {
    toast((e as Error).message, true);
  }
});
// Seeded random start: industry, city and founder drawn from the seed.
on('surprise', () => {
  const w = ui.wizard!;
  const seed = Math.random().toString(36).slice(2, 8);
  let h = hashSeed(seed);
  const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0), h / 4294967296);
  const ind = IND_LIST[Math.floor(next() * IND_LIST.length)];
  const cities = CITIES.filter((c) => c.ind[ind.id] >= 0.9);
  Object.assign(w, { industry: ind.id, city: cities[Math.floor(next() * cities.length)].id, founder: FOUNDERS[Math.floor(next() * FOUNDERS.length)].id, seed, step: 4 });
  sfx.dice();
  render(false);
});
// After an app update the page reloads; carry on with the game that was open.
void refreshSaves().then(async () => {
  let resume: string | null = null;
  try {
    resume = sessionStorage.getItem('gc:resume');
    sessionStorage.removeItem('gc:resume');
  } catch {
    resume = null;
  }
  const g = resume ? await loadFrom(resume) : null;
  if (g) {
    enter(g);
    toast('Updated to the latest version.');
  } else if (ui.screen === 'title') render(false);
});
