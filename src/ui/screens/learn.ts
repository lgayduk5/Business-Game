// The learning layer in the UI: advisory board, glossary, post-mortem, scenario progress.
import { GLOSSARY, TERM, money, pct, postMortem, scenarioDef, scenarioStatus, turnLabel, type GameState } from '@engine';
import { esc, lineChart, meter } from '../kit';
import { on, render, ui } from '../store';
import { modals } from '../shell';
import { intelTabs, intelViews } from './intel';
import { hqExtras } from './hq';

const WHO: Record<string, string> = { CFO: 'Chief financial officer', COO: 'Chief operating officer', CMO: 'Head of marketing', CHRO: 'Head of people', CTO: 'Chief technology officer', Chair: 'Chair of the board' };
const termLinks = (ids?: string[]) => (ids ?? []).filter((t) => TERM[t]).map((t) => `<button class="linkish small" data-a="term" data-id="${t}">${esc(TERM[t].term)}</button>`).join(', ');

function attributionBar(sh: { market: number; strategy: number; luck: number; execution: number }): string {
  const parts: [keyof typeof sh, string, string][] = [['market', 'Market', 'var(--ink3)'], ['strategy', 'Strategy', 'var(--ink)'], ['execution', 'Execution', 'var(--green)'], ['luck', 'Luck', 'var(--hi)']];
  const tot = parts.reduce((s, [k]) => s + Math.abs(sh[k]), 0) || 1;
  return `<div style="display:flex;height:26px;border:1.5px solid var(--ink);border-radius:3px;overflow:hidden;margin:6px 0">${parts.map(([k, , c]) => `<i style="width:${(Math.abs(sh[k]) / tot) * 100}%;background:${c}${sh[k] < 0 ? ';background-image:repeating-linear-gradient(45deg,transparent 0 5px,rgba(179,38,30,.55) 5px 8px)' : ''}"></i>`).join('')}</div>
    <div class="legend">${parts.map(([k, l, c]) => `<span><i style="background:${c};height:10px;width:10px;border:1px solid var(--ink)"></i>${l} ${sh[k] < 0 ? '(negative)' : ''} ${pct(Math.abs(sh[k]) / tot)}</span>`).join('')}</div>`;
}

function advisor(g: GameState): string {
  const notes = g.advisor;
  const a = g.attribution;
  const pm = postMortem(g);
  return `<h1>Advisory board</h1><p class="muted">Your executives read the quarter's numbers so you do not have to guess why they moved.</p>
    ${notes.length ? notes.map((n) => `<div class="note ${n.tone}"><b>${esc(n.title)}</b> <span class="small muted">${esc(WHO[n.who] ?? n.who)}</span><p>${esc(n.text)}</p>${n.terms?.length ? `<p class="small">Learn more: ${termLinks(n.terms)}</p>` : ''}</div>`).join('') : '<div class="note"><b>Nothing to report.</b><p>The board will comment once there is a quarter to discuss.</p></div>'}
    <div class="grid2" style="margin-top:14px">
      <div class="sheet"><h2>Where your value came from so far</h2>${g.history.length > 1 ? attributionBar(pm.shares) : '<p class="muted">After a few quarters this shows how much of your result came from the market, your strategy, your execution and luck.</p>'}
        <p class="small muted"><b>Market</b>: industry growth, the cycle and investor mood. <b>Strategy</b>: which markets you entered, deals, and price positioning. <b>Execution</b>: share, costs and margins in the markets you chose. <b>Luck</b>: how events and bets turned out against their odds.</p>
        <button class="btn sm" data-a="postmortem">Read the full review</button></div>
      <div class="sheet"><h2>Value over time</h2>${lineChart([{ name: 'Your valuation', color: 'var(--ink)', data: g.history.map((h) => h.valuation) }, { name: 'Most valuable rival', color: 'var(--red)', data: g.history.map((h) => Math.max(0, ...h.rivals)), dash: true }])}</div>
      <div class="sheet wide"><h2>Decisions you have taken</h2>${g.eventLog.length ? `<ul class="feed">${g.eventLog.slice(-12).reverse().map((e) => `<li><span>${turnLabel(e.turn)}</span><span><b>${esc(e.title)}.</b> ${esc(e.choice)} — ${esc(e.result)}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <p class="small muted">Luck so far: ${money(a.luck)} ${a.luck >= 0 ? 'better' : 'worse'} than the odds you faced.</p></div>
    </div>`;
}

function glossary(): string {
  const q = (ui.sub.gq ?? '').toLowerCase();
  const list = GLOSSARY.filter((t) => !q || t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q)).sort((a, b) => a.term.localeCompare(b.term));
  return `<h1>Glossary</h1><div class="field"><input type="text" placeholder="Search ${GLOSSARY.length} terms" value="${esc(ui.sub.gq ?? '')}" data-c="gq" aria-label="Search the glossary"></div>
    <div class="grid2">${list.map((t) => `<div class="sheet"><h3 style="margin-top:0">${esc(t.term)}</h3><p>${esc(t.def)}</p><p class="small muted">${esc(t.why)}</p></div>`).join('') || '<p class="muted">No matching terms.</p>'}</div>`;
}

intelTabs.push(['advisor', 'Advisor'], ['glossary', 'Glossary']);
intelViews.advisor = advisor;
intelViews.glossary = glossary;
on('gq', (d) => {
  ui.sub.gq = d.value ?? '';
  render();
});

modals.postmortem = (g) => {
  const pm = postMortem(g!);
  return `<div class="spread"><h2>${esc(pm.headline)}: the review</h2><button class="btn sm" data-a="${g!.status !== 'playing' && !g!.continued ? 'showOver' : 'close'}">Close</button></div>
    <p class="serif" style="font-size:1.08rem">${esc(pm.verdict)}</p>
    ${attributionBar(pm.shares)}
    <h3>The numbers</h3><div class="kv">${pm.stats.map(([k, v]) => `<div>${esc(k)}</div><div><b class="serif">${esc(v)}</b></div>`).join('')}</div>
    ${pm.moments.length ? `<h3>Moments that mattered</h3><ul class="feed">${pm.moments.map((m) => `<li><span>${turnLabel(m.turn)}</span><span><span class="chip ${m.value < 0 ? 'bad' : 'good'}">${m.kind}</span> ${esc(m.text)} <span class="${m.value < 0 ? 'neg' : 'pos'} nowrap">${m.value < 0 ? '−' : '+'}${money(Math.abs(m.value))}</span></span></li>`).join('')}</ul>` : ''}
    <h3>Lessons</h3>${pm.lessons.map((l) => `<div class="note"><b>${esc(l.title)}</b><p>${esc(l.text)}</p>${l.terms?.length ? `<p class="small">${termLinks(l.terms)}</p>` : ''}</div>`).join('')}
    <p class="small muted">How this is measured: each quarter, the change in your company's value (net of money raised or returned) is split. Revenue changes from market growth and investor mood count as market; new offices, deals and price positioning as strategy; event and investment outcomes against their odds as luck; and the rest — share, costs, margins — as execution.</p>`;
};
on('postmortem', () => {
  ui.modal = { kind: 'postmortem', data: { sticky: false } };
  render(false);
});

// Scenario goal on HQ
hqExtras.unshift((g: GameState) => {
  const s = scenarioDef(g);
  const st = scenarioStatus(g);
  if (!s || !st) return '';
  return `<div class="sheet wide" style="border-width:2.5px"><div class="spread"><h2 style="margin-top:0">${esc(s.name)}</h2><span class="chip ${st.left <= 2 ? 'warn' : ''}">${st.left} quarter${st.left === 1 ? '' : 's'} left</span></div>
    <p style="margin-top:0">${esc(s.goal.text)}</p>${meter(st.progress)}<p class="small muted">${esc(st.detail)}</p></div>`;
});
