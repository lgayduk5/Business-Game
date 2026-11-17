// Title screen and the new-company wizard.
import { CITIES, CITY, DIFF, FOUNDERS, IND_LIST, INDUSTRIES, REGIONS, money, newGame, type Difficulty, type FounderId, type IndustryId } from '@engine';
import { esc } from '../kit';
import { on, render, toast, ui } from '../store';
import { modalHost } from '../shell';
import { sfx } from '../../audio';

export const titleExtras: (() => string)[] = [];

export function title(): string {
  return `<div class="title">
    <div><span class="mark big">Going Concern</span></div>
    <p class="lede">Found a company. Grow it across the world, one quarter at a time. Try not to run out of cash.</p>
    <div class="stack">
      ${titleExtras.map((f) => f()).join('')}
      <button class="btn go" data-a="newGame">Found a new company</button>
      <button class="btn" data-a="howTo">How to play</button>
    </div>
    <p class="small muted" style="margin-top:26px">A strategy game about finance, economics and management. Works offline; your saves stay on this device.</p>
  </div>${modalHost(null)}`;
}

const STEPS = ['Industry', 'City', 'Founder', 'Setup'];
export function wizard(): string {
  const w = ui.wizard!;
  let body = '';
  if (w.step === 0) {
    body = `<h1>What will you build?</h1><p class="muted">Each industry makes money — and goes broke — in its own way.</p><div class="choices">${IND_LIST.map((d) => `
      <button class="choice" data-a="wz" data-k="industry" data-v="${d.id}" aria-pressed="${w.industry === d.id}"><span class="glyph">${d.icon}</span><b>${d.name}</b><span class="muted">${esc(d.blurb)}</span></button>`).join('')}</div>
      ${w.industry ? `<div class="sheet" style="margin-top:14px"><h3>How the money works</h3><p>${esc(INDUSTRIES[w.industry].economics)}</p><h3>How it usually ends</h3><p>${esc(INDUSTRIES[w.industry].failure)}</p>
        <p class="small muted">You start with ${money(INDUSTRIES[w.industry].start.cash * 1000)} in cash${INDUSTRIES[w.industry].start.debt ? `, ${money(INDUSTRIES[w.industry].start.debt * 1000)} of debt` : ''} and ${INDUSTRIES[w.industry].start.ops + INDUSTRIES[w.industry].start.sales + INDUSTRIES[w.industry].start.rnd + INDUSTRIES[w.industry].start.admin} people.</p></div>` : ''}`;
  } else if (w.step === 1) {
    const ind = w.industry as IndustryId;
    const fit = (x: number) => (x >= 1.5 ? 'Excellent market' : x >= 1.1 ? 'Good market' : x >= 0.8 ? 'Average market' : 'Thin market');
    body = `<h1>Where do you start?</h1><p class="muted">Big rich cities have the customers and the talent, at a price. Cheap cities stretch your cash further.</p>
      ${Object.entries(REGIONS).filter(([r]) => CITIES.some((c) => c.region === r)).map(([r, reg]) => `<h3>${esc(reg.name)}</h3><div class="choices">${CITIES.filter((c) => c.region === r).map((c) => `
      <button class="choice" data-a="wz" data-k="city" data-v="${c.id}" aria-pressed="${w.city === c.id}"><b>${esc(c.name)}</b>
        <span class="muted">${fit(c.ind[ind])} for ${INDUSTRIES[ind].short}. Wages ${Math.round(c.wage * 100)}%, rent ${Math.round(c.rent * 100)}%, tax ${Math.round(c.tax * 100)}%.</span></button>`).join('')}</div>`).join('')}
      ${w.city ? `<div class="sheet" style="margin-top:14px"><h3>${esc(CITY[w.city].name)}</h3><p>${esc(CITY[w.city].blurb)}</p></div>` : ''}`;
  } else if (w.step === 2) {
    body = `<h1>Who are you?</h1><p class="muted">Your background shapes the company for the whole game.</p><div class="choices">${FOUNDERS.map((f) => `
      <button class="choice" data-a="wz" data-k="founder" data-v="${f.id}" aria-pressed="${w.founder === f.id}"><b>${esc(f.name)}</b><span class="muted">${esc(f.blurb)}</span><br><span class="small">${f.perks.map(esc).join('. ')}.</span></button>`).join('')}</div>`;
  } else {
    body = `<h1>Last details</h1>
      <div class="field"><label for="coname">Company name</label><input id="coname" type="text" maxlength="28" value="${esc(w.name)}" data-c="wzName" autocomplete="off"></div>
      <h3>Difficulty</h3><div class="choices">${(Object.keys(DIFF) as Difficulty[]).map((d) => `<button class="choice" data-a="wz" data-k="difficulty" data-v="${d}" aria-pressed="${w.difficulty === d}"><b>${DIFF[d].label}</b><span class="muted">${DIFF[d].blurb}</span></button>`).join('')}</div>
      <h3>Mode</h3><div class="choices">
        <button class="choice" data-a="wz" data-k="mode" data-v="standard" aria-pressed="${w.mode === 'standard'}"><b>Standard</b><span class="muted">Play to win. Bankruptcy is permanent.</span></button>
        <button class="choice" data-a="wz" data-k="mode" data-v="sandbox" aria-pressed="${w.mode === 'sandbox'}"><b>Sandbox</b><span class="muted">The whole map is visible and you cannot go bankrupt. For learning how things work.</span></button></div>
      <div class="field" style="margin-top:16px"><label for="seed">World seed</label><input id="seed" type="text" maxlength="24" value="${esc(w.seed)}" data-c="wzSeed" autocomplete="off">
        <div class="help">The same seed always produces the same world and the same luck. Share one with a friend to play the same game.</div></div>`;
  }
  const ready = [!!w.industry, !!w.city, !!w.founder, w.name.trim().length > 0][w.step];
  return `<div class="wizard"><div class="steps">${STEPS.map((_, i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>${body}
    <div class="bar"><button class="btn" data-a="wzBack">${w.step === 0 ? 'Cancel' : 'Back'}</button>
    <button class="btn go" data-a="wzNext" ${ready ? '' : 'disabled'}>${w.step === 3 ? 'Start the company' : 'Next'}</button></div></div>`;
}

const COMPANY_NAMES = ['Halden & Co', 'Brightwater', 'Northgate', 'Larch Street', 'Fourth Meridian', 'Copperline', 'Greyfriars', 'Wexford'];
on('newGame', () => {
  ui.wizard = { step: 0, industry: IND_LIST.length === 1 ? IND_LIST[0].id : '', city: '', founder: 'engineer', difficulty: 'normal', name: COMPANY_NAMES[Math.floor(Math.random() * COMPANY_NAMES.length)], seed: Math.random().toString(36).slice(2, 8), mode: 'standard' };
  ui.screen = 'new';
  render(false);
});
on('wz', (d) => {
  (ui.wizard as any)[d.k!] = d.v;
  sfx.tick();
  render();
});
on('wzName', (d) => { ui.wizard!.name = d.value ?? ''; render(); });
on('wzSeed', (d) => { ui.wizard!.seed = (d.value ?? '').trim() || 'seed'; });
on('wzBack', () => {
  const w = ui.wizard!;
  if (w.step === 0) ui.screen = 'title';
  else w.step--;
  render(false);
});
export const startHooks: (() => void)[] = [];
on('wzNext', () => {
  const w = ui.wizard!;
  if (w.step < 3) {
    w.step++;
    return render(false);
  }
  try {
    ui.g = newGame({ name: w.name.trim(), industry: w.industry as IndustryId, city: w.city, founder: w.founder as FounderId, difficulty: w.difficulty, seed: w.seed, mode: w.mode, scenario: w.scenario });
  } catch (e) {
    return toast(String(e), true);
  }
  ui.screen = 'game';
  ui.tab = 'hq';
  ui.sub = {};
  ui.sel = {};
  ui.modal = null;
  for (const h of startHooks) h();
  sfx.good();
  render(false);
});
