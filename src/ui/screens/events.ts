// Event cards: a situation, options with their trade-offs, then what happened and why it matters.
import { TERM, delegateEvent, lowStakes, resolveEvent, viewEvent, type EventResult, type GameState } from '@engine';
import { esc } from '../kit';
import { on, render, ui } from '../store';
import { modals, tabDots } from '../shell';
import { nextPrompt } from './modals';
import { sfx } from '../../audio';

const CAT: Record<string, string> = { macro: 'Economy', market: 'Market', operational: 'Operations', regulatory: 'Regulation', opportunity: 'Opportunity', stress: 'Crisis', rival: 'Rival' };

nextPrompt.open = (g: GameState) => {
  if (!g.queue.length) return false;
  ui.modal = { kind: 'event', data: { sticky: true } };
  const cat = viewEvent(g, g.queue[0]).def.cat;
  cat === 'stress' ? sfx.alert() : sfx.event();
  render();
  return true;
};
tabDots.hq = (g) => g.queue.length > 0;

modals.event = (g, m) => {
  const res: EventResult | undefined = m.result;
  if (res) {
    return `<span class="chip dark">${esc(m.cat)}</span><h2 style="margin-top:8px">${esc(res.title)}</h2>
      <p class="muted small">You chose: ${esc(res.choice)}</p>
      <p class="serif" style="font-size:1.12rem">${esc(res.text)}</p>
      ${res.effects.length ? `<ul class="feed">${res.effects.map((e) => `<li style="grid-template-columns:1fr"><span style="color:inherit;font-size:.95rem">${esc(e)}</span></li>`).join('')}</ul>` : ''}
      ${Math.abs(res.luck) > 1 ? `<p class="small muted">${res.luck > 0 ? 'The dice were kind: this went better than the odds suggested.' : 'The dice were unkind: this went worse than the odds suggested.'}</p>` : ''}
      <div class="note" style="margin-top:12px"><b>What this teaches</b><p>${esc(res.lesson)}</p>
        ${res.terms.filter((t) => TERM[t]).length ? `<p class="small">Look up: ${res.terms.filter((t) => TERM[t]).map((t) => `<button class="linkish" data-a="term" data-id="${t}">${esc(TERM[t].term)}</button>`).join(', ')}</p>` : ''}</div>
      <div class="row end"><button class="btn go" data-a="eventDone">${g!.queue.length ? 'Next' : 'Continue'}</button></div>`;
  }
  const pe = g!.queue[0];
  if (!pe) return '';
  const v = viewEvent(g!, pe);
  return `<div class="spread"><span class="chip ${v.def.cat === 'stress' ? 'warn' : 'dark'}">${CAT[v.def.cat]}</span>${g!.queue.length > 1 ? `<span class="small muted">${g!.queue.length - 1} more after this</span>` : ''}</div>
    <h2 style="margin-top:8px">${esc(v.title)}</h2><p class="serif" style="font-size:1.1rem;line-height:1.5">${esc(v.text)}</p>
    <div class="choices" style="grid-template-columns:1fr">${v.options.map((o, i) => `<button class="choice" data-a="choose" data-uid="${v.uid}" data-i="${i}" ${o.enabled ? '' : 'disabled'}>
      <b>${esc(o.label)}</b><span class="muted">${esc(o.hint)}</span>
      <span class="chips">${o.money ? `<span class="chip money">${esc(o.money)}</span>` : ''}${o.odds ? `<span class="chip">${o.odds}</span>` : ''}</span>${o.enabled ? '' : ' <span class="chip bad" style="margin-top:6px">Not available to you</span>'}</button>`).join('')}</div>
    ${lowStakes(g!, pe) ? `<div class="row spread" style="margin-top:12px"><span class="small muted">A small call: nothing here moves more than a few percent of a quarter's sales.</span>
      <button class="btn sm" data-a="delegate" data-uid="${v.uid}" title="Your COO picks the safest option. Turn this on for every small card in the menu.">Let the COO handle it</button></div>` : ''}`;
};

on('openEvent', () => void nextPrompt.open(ui.g!));
on('choose', (d) => {
  const g = ui.g!;
  const pe = g.queue.find((e) => e.uid === Number(d.uid));
  if (!pe) return;
  const cat = CAT[viewEvent(g, pe).def.cat];
  const res = resolveEvent(g, pe.uid, Number(d.i));
  if (!res) return;
  ui.modal = { kind: 'event', data: { sticky: true, result: res, cat } };
  res.luck < 0 ? sfx.bad() : sfx.tick();
  render(false);
});
on('delegate', (d) => {
  const g = ui.g!;
  const pe = g.queue.find((e) => e.uid === Number(d.uid));
  if (!pe) return;
  const cat = CAT[viewEvent(g, pe).def.cat];
  const res = delegateEvent(g, pe.uid);
  if (!res) return;
  ui.modal = { kind: 'event', data: { sticky: true, result: { ...res, choice: `${res.choice} (your COO's call)` }, cat } };
  sfx.tick();
  render(false);
});
on('eventDone', () => {
  ui.modal = null;
  const g = ui.g!;
  if (g.status !== 'playing' && !g.continued) {
    g.status === 'won' ? sfx.win() : sfx.lose();
    ui.modal = { kind: 'over', data: { sticky: true } };
    return render();
  }
  if (!nextPrompt.open(g)) render();
});
