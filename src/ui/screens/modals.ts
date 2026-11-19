// Turn flow and the modals around it: quarterly report, menu, glossary term, game over.
import { TERM, canKeepPlaying, finalGrade, gradeRule, keepPlaying, money, needsAttention, pct, turnLabel, type GameState } from '@engine';
import { esc } from '../kit';
import { on, render, runTurns, toast, ui } from '../store';
import { modals } from '../shell';
import { isMuted, setMuted, sfx } from '../../audio';

export const afterTurn: ((g: GameState) => void | Promise<void>)[] = [];
export const menuExtras: ((g: GameState | null) => string)[] = [];
/** Extra blocks on the game-over screen (score code, stars, rewind…). */
export const overExtras: ((g: GameState) => string)[] = [];
/** Opens the next thing the player must look at after a turn (events arrive at M3). */
export const nextPrompt = { open: (_g: GameState): boolean => false };

async function advance(turns: number) {
  const g = ui.g!;
  if (g.queue.length) {
    if (!nextPrompt.open(g)) toast('A decision is waiting.');
    return render();
  }
  ui.busy = turns > 1 ? 'Fast-forwarding…' : 'Closing the books…';
  render();
  const r = await runTurns(g, turns);
  ui.g = r.state;
  ui.busy = '';
  for (const h of afterTurn) await h(ui.g);
  const st = ui.g.status;
  if (st !== 'playing' && !ui.g.continued) {
    st === 'won' ? sfx.win() : sfx.lose();
    ui.modal = { kind: 'over', data: { sticky: true } };
  } else {
    sfx.print();
    ui.modal = { kind: 'report', data: { n: r.n, reason: turns > 1 ? r.reason : '' } };
  }
  render();
}
on('endTurn', () => advance(1));
on('fastForward', () => {
  ui.modal = null;
  return advance(8);
});
on('reportDone', () => {
  ui.modal = null;
  if (!nextPrompt.open(ui.g!)) render();
});
on('showOver', () => {
  ui.modal = { kind: 'over', data: { sticky: true } };
  render();
});

modals.report = (g, m) => {
  const r = g!.report!;
  const c = g!.company;
  const q = c.quarters[c.quarters.length - 1];
  const chg = (a: number, b: number) => (b ? ` <span class="${a < b ? 'neg' : 'pos'} small">${a >= b ? '▲' : '▼'} ${Math.abs((a / b - 1) * 100).toFixed(0)}%</span>` : '');
  const notes = g!.advisor.slice(0, 4).map((n) => `<div class="note ${n.tone}"><b>${esc(n.who)}: ${esc(n.title)}</b><p>${esc(n.text)}</p></div>`).join('');
  const quiet = !g!.queue.length && !needsAttention(g!);
  return `<div class="printout">
      <h2>${m.n > 1 ? `${m.n} quarters to ${turnLabel(r.turn)}` : turnLabel(r.turn) + ' results'}</h2>
      <div class="line"><span>Revenue</span><b>${money(r.revenue)}${chg(r.revenue, r.prevRevenue)}</b></div>
      <div class="line"><span>EBITDA</span><b class="${q.ebitda < 0 ? 'neg' : ''}">${money(q.ebitda)}</b></div>
      <div class="line"><span>Net income</span><b class="${r.ni < 0 ? 'neg' : ''}">${money(r.ni)}</b></div>
      <div class="line"><span>Cash from operations</span><b class="${q.cf.cfo < 0 ? 'neg' : ''}">${money(q.cf.cfo)}</b></div>
      <div class="line"><span>Cash at quarter end</span><b class="${r.cash < 0 ? 'neg' : ''}"><span class="hi">${money(r.cash)}</span></b></div>
      <div class="line"><span>${c.cap.isPublic ? 'Market cap' : 'Valuation'}</span><b>${money(r.valuation)}${chg(r.valuation, r.prevValuation)}</b></div>
      <div class="line"><span>People</span><b>${q.headcount}</b></div>
    </div>
    ${m.reason ? `<div class="note warn" style="margin-top:12px"><b>Fast-forward stopped.</b><p>${esc(m.reason)}</p></div>` : ''}
    ${Math.abs(q.ni - q.cf.cfo) > Math.max(20_000, Math.abs(q.ni) * 0.5) && !notes ? `<div class="note" style="margin-top:12px"><b>Profit and cash went different ways.</b><p>Net income was ${money(q.ni)} but operations ${q.cf.cfo >= 0 ? 'produced' : 'consumed'} ${money(Math.abs(q.cf.cfo))} of cash. The cash-flow statement shows where the difference went.</p></div>` : ''}
    ${r.delegated?.length ? `<div class="note" style="margin-top:12px"><b>Your COO handled ${r.delegated.length === 1 ? 'a small matter' : `${r.delegated.length} small matters`}</b>
      ${r.delegated.map((x) => `<p class="small"><b>${esc(x.title)}:</b> ${esc(x.choice)}. ${esc(x.text)}</p>`).join('')}
      <p class="small muted">Small cards go to your COO while this is on. Change it in the menu.</p></div>` : ''}
    <div style="margin-top:12px">${notes}</div>
    <div class="row end" style="margin-top:14px">
      ${quiet ? `<button class="btn" data-a="fastForward" title="Run up to eight quarters, stopping when something needs you">Fast-forward</button>` : ''}
      <button class="btn go" data-a="reportDone">${g!.queue.length ? 'See what happened next' : 'Continue'}</button></div>`;
};

modals.over = (g) => {
  const o = g!.outcome!;
  const c = g!.company;
  const fg = o.grade ? finalGrade(g!) : undefined;
  const grade = fg ? `<div class="sheet" style="margin:12px 0"><div class="spread"><h3 style="margin:0">How the grade was worked out</h3><b class="serif" style="font-size:1.6rem">${fg.grade}</b></div>
      <div class="kv">${fg.rows.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}<div><b>Score</b></div><div><b>${fg.score.toFixed(0)} of 100</b></div></div>
      <p class="small muted">${esc(gradeRule(!!g!.rules.sprint))}</p></div>` : '';
  return `<h2>${esc(o.title)}</h2><p class="serif" style="font-size:1.1rem">${esc(o.text)}</p>${grade}${overExtras.map((f) => f(g!)).join('')}
    <div class="kv" style="margin:12px 0"><div>Lasted</div><div><b class="serif">${turnLabel(o.turn)}</b></div>
    <div>Final valuation</div><div><b class="serif">${money(c.valuation)}</b></div>
    <div>Your stake</div><div><b class="serif">${pct(c.cap.founder / c.cap.shares, 1)}</b></div></div>
    <div class="row end"><button class="btn" data-a="postmortem">Read the review</button><button class="btn" data-a="close">Look around</button>${o.kind === 'won' && canKeepPlaying(g!) ? '<button class="btn" data-a="keepPlaying">Keep playing</button>' : ''}<button class="btn go" data-a="quit">Back to title</button></div>`;
};
on('keepPlaying', () => {
  keepPlaying(ui.g!);
  ui.modal = null;
  render();
});

modals.menu = (g) => `<div class="spread"><h2>Menu</h2><button class="btn sm" data-a="close">Close</button></div>
  <div class="title-stack" style="display:grid;gap:10px">
    ${menuExtras.map((f) => f(g)).join('')}
    ${g ? `<button class="btn" data-a="toggleDelegate" title="Small cards: no crisis, no rival, nothing worth more than 4% of a quarter's sales. Your COO picks the safest option.">${g.settings.delegate ? 'Small decisions: your COO handles them' : 'Small decisions: you decide every one'}</button>` : ''}
    <button class="btn" data-a="mute">${isMuted() ? 'Turn sound on' : 'Turn sound off'}</button>
    <button class="btn" data-a="howTo">How to play</button>
    <button class="btn danger" data-a="askQuit">Quit to title</button>
  </div>
  ${g ? `<p class="small muted" style="margin-top:14px">World seed <b>${esc(g.seed)}</b>, ${g.difficulty} difficulty, ${g.mode} mode.</p>` : ''}`;

modals.term = (_g, m) => {
  const t = TERM[m.id];
  return t ? `<h2>${esc(t.term)}</h2><p>${esc(t.def)}</p><p class="muted"><b>In the game:</b> ${esc(t.why)}</p><div class="row end"><button class="btn" data-a="close">Close</button></div>` : '';
};

modals.howTo = () => `<div class="spread"><h2>How to play</h2><button class="btn sm" data-a="close">Close</button></div>
  <p>Each turn is one quarter. Decide, then press <span class="hi">End quarter</span>; the books close and you see what happened.</p>
  <h3>Three levels</h3>
  <p><b>Offices</b> hire people and deliver the product. <b>Regions</b> set prices, marketing and supply chains. <b>Corporate</b> raises money, funds R&D and deals with rivals.</p>
  <h3>What to watch</h3>
  <p><b>Cash, not profit.</b> A growing company can be profitable and still run out of money, because customers pay late and inventory is bought early.</p>
  <p><b>The limit.</b> Every office is held back by one thing — demand, staff or plant. Fix that one; spending on the others is wasted.</p>
  <p><b>Every dotted number explains itself.</b> Tap it to see the arithmetic behind it.</p>
  <h3>How it ends</h3>
  <p>Run out of cash for two quarters in a row and the company is insolvent. Otherwise, build the most valuable company you can.</p>`;

on('menu', () => { ui.modal = { kind: 'menu' }; render(); });
on('howTo', () => { ui.modal = { kind: 'howTo' }; render(); });
on('term', (d) => { ui.modal = { kind: 'term', data: { id: d.id } }; render(); });
on('toggleDelegate', () => {
  const g = ui.g!;
  g.settings.delegate = !g.settings.delegate;
  toast(g.settings.delegate ? 'Your COO will handle small decisions from next quarter.' : 'You will see every decision card.');
  render();
});
on('mute', () => { setMuted(!isMuted()); sfx.tick(); render(); });
on('askQuit', () => {
  ui.modal = { kind: 'confirm', data: { title: 'Quit to the title screen?', text: 'Your game is saved automatically at the end of every quarter.', yes: 'Quit', act: 'quit' } };
  render();
});
on('quit', () => {
  ui.modal = null;
  ui.screen = 'title';
  render(false);
});
