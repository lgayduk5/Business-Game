// Title screen and the new-company wizard.
import { CITIES, CITY, DIFF, DIFFICULTIES, FOUNDERS, IND_LIST, INDUSTRIES, REGIONS, diffChanges, expectLine, money, newGame, victoryBars, type Difficulty, type FounderId, type IndustryId } from '@engine';
import { esc } from '../kit';
import { on, render, toast, ui, type Wizard } from '../store';
import { modalHost } from '../shell';
import { isMuted, sfx } from '../../audio';
import { musicButton } from '../soundtrack';

export const titleExtras: (() => string)[] = [];

export function title(): string {
  return `<div class="title">
    <div><span class="mark big">Going Concern</span></div>
    <p class="lede">Found a company. Grow it across the world, one quarter at a time. Try not to run out of cash.</p>
    <div class="stack">
      <button class="btn go" data-a="newGame">Found a new company</button>
      ${ui.saves.length ? '' : `<p class="small muted firsttime">First time? <button class="linkish" data-a="campaign">Learn the ropes</button> in five short chapters, one layer of the game at a time, or found a company: your first one starts as a ten-year Sprint.</p>`}
      ${titleExtras.map((f) => f()).join('')}
      <button class="btn" data-a="howTo">How to play</button>
    </div>
    <p class="small muted" style="margin-top:26px">A strategy game about finance, economics and management. Works offline; your saves stay on this device.${isMuted() ? '' : ` ${musicButton('linkish')}.`}</p>
  </div>${modalHost(null)}`;
}

const STEPS = ['Industry', 'City', 'Founder', 'Setup', 'Ready'];
const TIER: Record<string, [string, string]> = {
  gentle: ['Gentle', 'Forgiving economics: cash arrives early and mistakes are recoverable.'],
  tough: ['Tough', 'Thin margins or cash tied up in working capital. Growth has to be financed with care.'],
  expert: ['Expert', 'Slow, lumpy or high-stakes. Rewarding once you know the game.'],
};
/** Choices shown before the difficulty cards (game length: the cards' win rates depend on it). */
export const lengthExtras: (() => string)[] = [];
/** Extra choices on the setup step (ironman…), registered by other screens. */
export const setupExtras: (() => string)[] = [];
/** Extra lines on the recap step. */
export const recapExtras: (() => [string, string][])[] = [];

function industryDetail(id: IndustryId, cls: string): string {
  const d = INDUSTRIES[id];
  const s = d.start;
  return `<div class="sheet ind-detail ${cls}"><h3>How the money works</h3><p>${esc(d.economics)}</p><h3>How it usually ends</h3><p>${esc(d.failure)}</p>
    <p class="small muted">${esc(TIER[d.tier][0])}: ${esc(TIER[d.tier][1])} You start with ${money(s.cash * 1000)} in cash${s.debt ? `, ${money(s.debt * 1000)} of debt` : ''} and ${s.ops + s.sales + s.rnd + s.admin} people.</p></div>`;
}

function difficultyCard(d: Difficulty, w: Wizard): string {
  const D = DIFF[d];
  const ind = w.industry ? (w.industry as IndustryId) : undefined;
  const bars = ind && w.bars ? victoryBars(ind, d, !!w.sprint).slice(0, 5) : [];
  // one grid cell holds every bar, so they stack in the right-hand column under "To win"
  return `<button class="choice diff" data-a="wz" data-k="difficulty" data-v="${d}" aria-pressed="${w.difficulty === d}"><b>${D.label}</b>
    <span class="dl"><i>For</i>${esc(D.who)}</span>
    <span class="dl"><i>Changes</i>${diffChanges(d).map(esc).join('. ')}.</span>
    <span class="dl"><i>Expect</i>${esc(ind ? expectLine(ind, d, !!w.sprint) : D.expect)}</span>
    ${bars.length ? `<span class="dl small"><i>To win</i><span class="bars">${bars.map(([n, b]) => `<span><b class="inl">${esc(n)}</b> ${esc(b)}</span>`).join('')}</span></span>` : ''}</button>`;
}

export function wizard(): string {
  const w = ui.wizard!;
  let body = '';
  if (w.step === 0) {
    body = `<div class="spread"><h1>What will you build?</h1><button class="btn sm" data-a="surprise">Surprise me</button></div><p class="muted">Each industry makes money — and goes broke — in its own way. Or let a random seed choose industry, city and founder for you.</p><div class="choices">${IND_LIST.map((d) => `
      <button class="choice" data-a="wz" data-k="industry" data-v="${d.id}" aria-pressed="${w.industry === d.id}"><span class="glyph">${d.icon}</span><b>${d.name}</b>
        <span class="chips"><span class="chip tier-${d.tier}">${TIER[d.tier][0]}</span>${d.firstGame ? '<span class="chip warn">Recommended for a first game</span>' : ''}</span>
        <span class="muted">${esc(d.blurb)}</span></button>${w.industry === d.id ? industryDetail(d.id, 'inline') : ''}`).join('')}</div>
      ${w.industry ? industryDetail(w.industry as IndustryId, 'below') : ''}`;
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
  } else if (w.step === 3) {
    body = `<h1>Last details</h1>
      <div class="field"><label for="coname">Company name</label><input id="coname" type="text" maxlength="28" value="${esc(w.name)}" data-c="wzName" autocomplete="off"></div>
      ${lengthExtras.map((f) => f()).join('')}
      <div class="spread"><h3>Difficulty</h3><button class="btn sm" data-a="wzBars" aria-expanded="${!!w.bars}">${w.bars ? 'Hide victory bars' : 'Show victory bars'}</button></div>
      <p class="small muted">${w.industry ? `Win rates are from test games of ${esc(INDUSTRIES[w.industry as IndustryId].name)}${w.sprint ? ' as a Sprint' : ''}.` : ''}${w.bars ? ` Victory bars are in today's money.` : ''}</p>
      <div class="choices">${DIFFICULTIES.map((d) => difficultyCard(d, w)).join('')}</div>
      <h3>Mode</h3><div class="choices">
        <button class="choice" data-a="wz" data-k="mode" data-v="standard" aria-pressed="${w.mode === 'standard'}"><b>Standard</b><span class="muted">Play to win. Bankruptcy ends the game, though you can replay the last year from the final review.</span></button>
        <button class="choice" data-a="wz" data-k="mode" data-v="sandbox" aria-pressed="${w.mode === 'sandbox'}"><b>Sandbox</b><span class="muted">The whole map is visible and you cannot go bankrupt. For learning how things work.</span></button></div>
      ${setupExtras.map((f) => f()).join('')}
      <div class="field" style="margin-top:16px"><label for="seed">World seed</label><input id="seed" type="text" maxlength="24" value="${esc(w.seed)}" data-c="wzSeed" autocomplete="off">
        <div class="help">The same seed always produces the same world and the same luck. Share one with a friend to play the same game.</div></div>`;
  } else {
    const ind = INDUSTRIES[w.industry as IndustryId];
    const f = FOUNDERS.find((x) => x.id === w.founder)!;
    const D = DIFF[w.difficulty];
    const rows: [string, string, number][] = [
      ['Company', esc(w.name.trim()), 3],
      ['Industry', `${ind.icon} ${esc(ind.name)} <span class="chip tier-${ind.tier}">${TIER[ind.tier][0]}</span>`, 0],
      ['Starting city', esc(CITY[w.city].name), 1],
      ['Founder', `${esc(f.name)} <span class="small muted">${f.perks.map(esc).join('. ')}.</span>`, 2],
      ['Difficulty', `${D.label} <span class="small muted">${esc(expectLine(w.industry as IndustryId, w.difficulty, !!w.sprint))}</span>`, 3],
      ['Mode', w.mode === 'sandbox' ? 'Sandbox — no bankruptcy, map revealed' : 'Standard', 3],
      ...recapExtras.flatMap((x) => x()).map(([k, v]): [string, string, number] => [k, v, 3]),
      ['World seed', esc(w.seed), 3],
    ];
    const cash = ind.start.cash * 1000 * f.cash * D.cash;
    body = `<h1>Ready?</h1><p class="muted">Check the details. Tap a line to change it.</p>
      <div class="sheet"><div class="kv recap">${rows.map(([k, v, step]) => `<div><button class="linkish" data-a="wzGo" data-v="${step}">${esc(k)}</button></div><div>${v}</div>`).join('')}</div></div>
      <div class="note"><b>You start with ${money(cash)} in cash</b><p>${ind.start.ops + ind.start.sales + ind.start.rnd + ind.start.admin} people in ${esc(CITY[w.city].name)}${ind.start.debt ? `, ${money(ind.start.debt * 1000)} of debt` : ''}, an established customer base, and ${D.rivals} rivals.</p></div>`;
  }
  const ready = [!!w.industry, !!w.city, !!w.founder, w.name.trim().length > 0, true][w.step];
  return `<div class="wizard"><div class="steps">${STEPS.map((_, i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>${body}
    <div class="bar"><button class="btn" data-a="wzBack">${w.step === 0 ? 'Cancel' : 'Back'}</button>
    <button class="btn go" data-a="wzNext" ${ready ? '' : 'disabled'}>${w.step === STEPS.length - 1 ? 'Start the company' : 'Next'}</button></div></div>`;
}

const COMPANY_NAMES = ['Halden & Co', 'Brightwater', 'Northgate', 'Larch Street', 'Fourth Meridian', 'Copperline', 'Greyfriars', 'Wexford'];
on('newGame', () => {
  // a first company (no saves on this device) starts as a ten-year Sprint: a whole game in an evening or two
  ui.wizard = { step: 0, industry: IND_LIST.length === 1 ? IND_LIST[0].id : '', city: '', founder: 'engineer', difficulty: 'normal', name: COMPANY_NAMES[Math.floor(Math.random() * COMPANY_NAMES.length)], seed: Math.random().toString(36).slice(2, 8), mode: 'standard', sprint: !ui.saves.length };
  ui.screen = 'new';
  render(false);
});
on('wz', (d) => {
  (ui.wizard as any)[d.k!] = d.v;
  sfx.tick();
  render();
});
on('wzBars', () => {
  ui.wizard!.bars = !ui.wizard!.bars;
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
on('wzGo', (d) => {
  ui.wizard!.step = Number(d.v);
  render(false);
});
on('wzNext', () => {
  const w = ui.wizard!;
  if (w.step < STEPS.length - 1) {
    w.step++;
    return render(false);
  }
  try {
    ui.g = newGame({ name: w.name.trim(), industry: w.industry as IndustryId, city: w.city, founder: w.founder as FounderId, difficulty: w.difficulty, seed: w.seed, mode: w.mode, scenario: w.scenario, sprint: w.sprint, ironman: w.mode === 'standard' && w.ironman });
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
