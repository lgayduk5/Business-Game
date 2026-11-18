// Ways to play (review wave 3): Sprint and Ironman, the daily challenge and its score code, rewinding the
// last year from the end screen, scenario medals with Brutal versions, and the five-chapter Learner campaign.
import {
  CHALLENGES, CHAPTERS, CITY, FOUNDERS, INDUSTRIES, REWIND_QUARTERS, bonusText, canRewind, dailyOpts, dailySetup, founderStake, localDate, money,
  newGame, readScoreCode, rewindTo, scenarioDef, scenarioStars, scoreCode, startScenario, turnLabel, type GameState, type ScenarioDef,
} from '@engine';
import { esc } from '../kit';
import { on, render, toast, ui, type Tab } from '../store';
import { modals, tabGate } from '../shell';
import { afterTurn, overExtras } from './modals';
import { recapExtras, setupExtras, startHooks, titleExtras } from './title';
import { hqExtras } from './hq';
import { enter } from './files';
import { loadFrom, snapshot, snapshots } from '../../storage/saves';
import { sfx } from '../../audio';

// ── new-game options: length and Ironman

setupExtras.push(() => {
  const w = ui.wizard!;
  return `<h3>Length</h3><div class="choices">
      <button class="choice" data-a="wzFlag" data-k="sprint" data-v="0" aria-pressed="${!w.sprint}"><b>Full game</b><span class="muted">Twenty-five years. Win by one of six victories, or by your grade at the end.</span></button>
      <button class="choice" data-a="wzFlag" data-k="sprint" data-v="1" aria-pressed="${!!w.sprint}"><b>Sprint</b><span class="muted">Ten years, then a grade from A to F. The victory bars are lower, but ten years is short: in testing a good plan earns a winning grade in a little under half of Sprints on Normal.</span></button></div>
    ${w.mode === 'standard' ? `<h3>Ironman</h3><div class="choices">
      <button class="choice" data-a="wzFlag" data-k="ironman" data-v="0" aria-pressed="${!w.ironman}"><b>Off</b><span class="muted">Save slots, save files, and replaying the last year from the final review.</span></button>
      <button class="choice" data-a="wzFlag" data-k="ironman" data-v="1" aria-pressed="${!!w.ironman}"><b>Ironman</b><span class="muted">One life. The game saves itself and nothing else: no slots, no save files, no rewinds. Your result carries the badge.</span></button></div>` : ''}`;
});
recapExtras.push(() => {
  const w = ui.wizard!;
  return [['Length', w.sprint ? 'Sprint — ten years, graded at the end' : 'Full game — twenty-five years'], ...(w.mode === 'standard' && w.ironman ? [['Ironman', 'One life, no rewinds'] as [string, string]] : [])];
});
on('wzFlag', (d) => {
  (ui.wizard as unknown as Record<string, boolean>)[d.k!] = d.v === '1';
  sfx.tick();
  render();
});

function begin(g: GameState) {
  enter(g);
  for (const h of startHooks) h();
  sfx.good();
}

// ── the daily challenge

const DAILY_NAMES = ['Daybreak & Co', 'First Light', 'Morning Star', 'Sunrise Holdings', 'Dawn Patrol', 'Early Bird', 'New Day Group'];
let codeIn = '';
titleExtras.push(() => `<button class="btn" data-a="daily">Daily challenge</button><button class="btn" data-a="campaign">Learn the ropes: five chapters</button><button class="btn" data-a="scenarios">Scenario challenges</button>`);
modals.daily = () => {
  const date = localDate();
  const d = dailySetup(date);
  const f = FOUNDERS.find((x) => x.id === d.founder)!;
  const read = codeIn ? readScoreCode(codeIn) : null;
  return `<div class="spread"><h2>Daily challenge</h2><button class="btn sm" data-a="close">Close</button></div>
    <p class="muted">${esc(date)}. Everyone who plays today gets the same world and the same luck. Ten years on Normal, Ironman: one go, then a grade and a score code to share.</p>
    <div class="kv" style="margin:12px 0"><div>Industry</div><div><b>${INDUSTRIES[d.industry].icon} ${esc(INDUSTRIES[d.industry].name)}</b></div>
      <div>Starting city</div><div><b>${esc(CITY[d.city].name)}</b></div><div>Founder</div><div><b>${esc(f.name)}</b></div></div>
    <div class="row end"><button class="btn go" data-a="dailyStart">Start today's company</button></div>
    <div class="field" style="margin-top:18px"><label for="codein">Check a friend's score code</label><input id="codein" type="text" maxlength="40" value="${esc(codeIn)}" data-c="codeIn" autocomplete="off" placeholder="GC-…">
      <div class="help">${!codeIn ? 'Codes look like GC-261118-B72-12.4M-K3QX.' : !read ? 'That is not a score code.' : read.ok ? `${esc(read.date)}: grade <b>${read.grade}</b>, ${read.score} of 100, founder's stake worth ${esc(read.founderValue)}.` : 'The check letters do not match: the code was mistyped or changed.'}</div></div>`;
};
on('daily', () => { codeIn = ''; ui.modal = { kind: 'daily' }; render(); });
on('codeIn', (d) => { codeIn = d.value ?? ''; render(); });
on('dailyStart', () => {
  const date = localDate();
  try {
    begin(newGame(dailyOpts(date, DAILY_NAMES[Number(date.slice(-2)) % DAILY_NAMES.length])));
  } catch (e) {
    toast(String((e as Error).message), true);
  }
});
on('copyCode', (d) => {
  const code = d.v ?? '';
  const done = () => toast('Score code copied.');
  try {
    void navigator.clipboard.writeText(code).then(done, () => toast('Select the code and copy it by hand.'));
  } catch {
    toast('Select the code and copy it by hand.');
  }
});

// ── rewind: the start of each of the last four quarters is kept, and the end screen can go back to one

let points: { slot: string; turn: number }[] = [];
let pointsFor = '';
async function refreshPoints(g: GameState) {
  points = canRewind(g) ? (await snapshots(g.id)).slice(0, REWIND_QUARTERS) : [];
  pointsFor = g.id;
}
afterTurn.push(async (g) => {
  if (canRewind(g)) await snapshot(g, REWIND_QUARTERS);
  await refreshPoints(g);
});
startHooks.push(() => {
  const g = ui.g;
  if (g && canRewind(g)) void snapshot(g, REWIND_QUARTERS).then(() => refreshPoints(g));
});
on('rewind', async (d) => {
  const g = ui.g!;
  const snap = await loadFrom(d.slot!);
  if (!snap) return toast('That moment could not be read.', true);
  try {
    const back = rewindTo(g, snap);
    ui.g = back;
    ui.modal = null;
    await snapshot(back, REWIND_QUARTERS);
    await refreshPoints(back);
    sfx.tick();
    render(false);
    toast(`Back to the start of ${turnLabel(back.turn)}. The dice fall the same way unless you choose differently.`);
  } catch (e) {
    toast((e as Error).message, true);
  }
});

// ── medals for scenarios and chapters: bronze for finishing, silver for the bonus, gold for Brutal

const MEDAL = ['', 'Bronze', 'Silver', 'Gold'];
function medals(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('gc:medals') ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function award(id: string, stars: number) {
  const m = medals();
  if (stars <= (m[id] ?? 0)) return;
  m[id] = stars;
  try {
    localStorage.setItem('gc:medals', JSON.stringify(m));
  } catch {
    /* private browsing: the medal shows on this screen only */
  }
}
const medalChip = (n: number) => (n ? `<span class="chip medal-${n}">${MEDAL[n]}</span>` : '');
afterTurn.push((g) => {
  const s = scenarioDef(g);
  if (s && g.status === 'won') award(s.id, scenarioStars(g));
});

overExtras.push((g) => {
  const out: string[] = [];
  if (g.rules.ironman) out.push(`<p><span class="chip dark">Ironman</span> <span class="small muted">One life, no rewinds${g.rules.daily ? `, daily challenge for ${esc(g.rules.daily)}` : ''}.</span></p>`);
  const code = scoreCode(g);
  if (code) {
    out.push(`<div class="note"><b>Your score code</b><p class="serif" style="font-size:1.25rem;user-select:all">${esc(code)}</p>
      <div class="row"><button class="btn sm" data-a="copyCode" data-v="${esc(code)}">Copy</button></div>
      <p class="small muted">Grade, score and what your stake is worth. A friend who played today's challenge can check it on the Daily challenge screen.</p></div>`);
  }
  if (g.replay) {
    const now = g.company.valuation * founderStake(g.company);
    out.push(`<div class="note"><b>Before you rewound to ${turnLabel(g.replay.from)}</b><p>${esc(g.replay.title)}: your stake was worth ${money(g.replay.founderValue)}. This time it is worth ${money(now)} — ${now >= g.replay.founderValue ? 'better' : 'worse'} by ${money(Math.abs(now - g.replay.founderValue))}.</p>
      <p class="small muted">Rewound ${g.counters.rewinds ?? 1} time${(g.counters.rewinds ?? 1) === 1 ? '' : 's'} in this game.</p></div>`);
  }
  const s = scenarioDef(g);
  if (s) {
    const stars = scenarioStars(g);
    const next = s.chapter ? CHAPTERS.find((x) => x.chapter === s.chapter! + 1) : undefined;
    out.push(`<div class="note"><b>${stars ? `${MEDAL[stars]} medal` : 'No medal this time'}</b>
      <p class="small">Bronze for finishing. Silver: ${esc(bonusText(s.goal.kind, s.turns))}${s.chapter ? '' : ' Gold: finish the Brutal version.'}</p>
      ${stars && next ? `<div class="row end"><button class="btn go sm" data-a="chapter" data-id="${next.id}">Next: chapter ${next.chapter}, ${esc(next.name)}</button></div>` : ''}</div>`);
  }
  if (g.status !== 'playing' && canRewind(g) && pointsFor === g.id && points.length) {
    out.push(`<div class="sheet" style="margin:12px 0"><h3 style="margin-top:0">Replay the last year</h3>
      <p class="small muted">Go back to the start of one of the last ${points.length} quarters and choose differently. The game is deterministic: only what you change will change.</p>
      <div class="row" style="flex-wrap:wrap">${points.map((p) => `<button class="btn sm" data-a="rewind" data-slot="${esc(p.slot)}">${turnLabel(p.turn)}</button>`).join('')}</div></div>`);
  }
  return out.join('');
});

// ── scenario challenges, with a Brutal version of each

const NAMES: Record<string, string> = {
  cash_crunch: 'Lakeshore Fabrication', rate_shock: 'Nordwind Energie', blitzscale: 'Rocketship Labs', turnaround: 'Bowery Dining Group', phase3: 'Charles River Therapeutics',
  network: 'Grachten Freight', bench: 'Fenwick Partners', ch1: 'Tidewater Software', ch2: 'Lakeview Stores', ch3: 'Hudson Advisory', ch4: 'Corner Market Co', ch5: 'Bayside Cloud',
};
const scenarioCard = (s: ScenarioDef, m: Record<string, number>, locked = false) => `<button class="choice" data-a="${s.chapter ? 'chapterBrief' : 'scenario'}" data-id="${s.id}" ${locked ? 'disabled' : ''}>
    <span class="glyph">${INDUSTRIES[s.industry].icon}</span><b>${s.chapter ? `${s.chapter}. ${esc(s.layer ?? '')}: ` : ''}${esc(s.name)}</b>
    <span class="chips">${medalChip(m[s.id] ?? 0)}${locked ? '<span class="chip">Finish the chapter before</span>' : ''}</span>
    <span class="muted">${esc(s.blurb)}</span></button>`;
modals.scenarios = () => {
  const m = medals();
  return `<div class="spread"><h2>Scenario challenges</h2><button class="btn sm" data-a="close">Close</button></div>
    <p class="muted">A prepared situation, one goal, and a deadline. Bronze for finishing, silver for the bonus, gold for the Brutal version.</p>
    <div class="choices" style="grid-template-columns:1fr">${CHALLENGES.map((s) => scenarioCard(s, m)).join('')}</div>`;
};
modals.scenarioBrief = (_g, d) => {
  const s = CHALLENGES.find((x) => x.id === d.id)!;
  return `<h2>${esc(s.name)}</h2><p class="serif" style="font-size:1.08rem;line-height:1.5">${esc(s.brief)}</p>
    <div class="note"><b>Goal</b><p>${esc(s.goal.text)}</p><p class="small muted">Silver: ${esc(bonusText(s.goal.kind, s.turns))} Gold: finish the Brutal version, where everything is harder.</p></div>
    <div class="row end"><button class="btn" data-a="scenarios">Back</button><button class="btn" data-a="startScenario" data-id="${s.id}" data-v="brutal">Brutal version</button><button class="btn go" data-a="startScenario" data-id="${s.id}">Take the challenge</button></div>`;
};
on('scenarios', () => { ui.modal = { kind: 'scenarios' }; render(); });
on('scenario', (d) => { ui.modal = { kind: 'scenarioBrief', data: { id: d.id } }; render(); });
on('startScenario', (d) => {
  const s = CHALLENGES.find((x) => x.id === d.id) ?? CHAPTERS.find((x) => x.id === d.id);
  if (!s) return;
  begin(startScenario(s.id, NAMES[s.id] ?? s.name, { brutal: d.v === 'brutal' }));
});

// ── the Learner campaign: five chapters, each opening one layer of the game

/** Tabs each chapter shows: Office → Region → Capital → Rivals → Public company. */
const CHAPTER_TABS: Record<number, Tab[]> = { 1: ['hq', 'ops'], 2: ['hq', 'ops', 'map'], 3: ['hq', 'ops', 'map', 'corp'], 4: ['hq', 'ops', 'map', 'corp', 'intel'], 5: ['hq', 'ops', 'map', 'corp', 'intel'] };
tabGate.allow = (g, t) => {
  const ch = scenarioDef(g)?.chapter;
  return !ch || (CHAPTER_TABS[ch] ?? []).includes(t);
};
const unlocked = (s: ScenarioDef, m: Record<string, number>) => s.chapter === 1 || (m[CHAPTERS.find((x) => x.chapter === s.chapter! - 1)?.id ?? ''] ?? 0) > 0;
modals.campaign = () => {
  const m = medals();
  return `<div class="spread"><h2>Learn the ropes</h2><button class="btn sm" data-a="close">Close</button></div>
    <p class="muted">Five short chapters. Each opens one more layer of the game — the office, the region, capital, rivals, the stock market — and asks for one thing.</p>
    <div class="choices" style="grid-template-columns:1fr">${CHAPTERS.map((s) => scenarioCard(s, m, !unlocked(s, m))).join('')}</div>`;
};
modals.chapterBrief = (_g, d) => {
  const s = CHAPTERS.find((x) => x.id === d.id)!;
  return `<span class="chip dark">Chapter ${s.chapter}: ${esc(s.layer ?? '')}</span><h2 style="margin-top:8px">${esc(s.name)}</h2>
    <p class="serif" style="font-size:1.08rem;line-height:1.5">${esc(s.brief)}</p>
    <div class="note"><b>Goal</b><p>${esc(s.goal.text.replace('{target}', 'the target shown on HQ').replace('{city}', CITY[s.city].name))}</p><p class="small muted">Silver: ${esc(bonusText(s.goal.kind, s.turns))}</p></div>
    <div class="row end"><button class="btn" data-a="campaign">Back</button><button class="btn go" data-a="startScenario" data-id="${s.id}">Start the chapter</button></div>`;
};
on('campaign', () => { ui.modal = { kind: 'campaign' }; render(); });
on('chapterBrief', (d) => { ui.modal = { kind: 'chapterBrief', data: { id: d.id } }; render(); });
on('chapter', (d) => {
  const s = CHAPTERS.find((x) => x.id === d.id);
  if (s) begin(startScenario(s.id, NAMES[s.id] ?? s.name));
});

// Chapter notes on HQ: what this chapter teaches and where to look.
hqExtras.unshift((g) => {
  const s = scenarioDef(g);
  if (!s?.chapter) return '';
  return `<div class="sheet wide"><h2 style="margin-top:0">Chapter ${s.chapter}: ${esc(s.layer ?? '')}</h2><p>${esc(s.lesson ?? '')}</p>
    <ul class="tips">${(s.tips ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
});
