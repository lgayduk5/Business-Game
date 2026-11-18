// Rivals and goals: who you are up against, what they are doing to you, and how close you are to winning.
import {
  CITY, INDUSTRIES, PERSONALITY, bidForRival, bidOdds, bidPrice, improveRelations, lobbyAgainst, money, officeDetail, officeVisible, pct, poachTalent,
  proposeAlliance, proposeTruce, rivalById, rivalKnown, sueRival, truceOdds, turnLabel, victoryStatus,
  type CityDef, type GameState, type Rival,
  nemesis,
} from '@engine';
import { $, N, esc, logo, meter, tip, explain } from '../kit';
import { act, on, render, ui } from '../store';
import { modals, tabDots } from '../shell';
import { intelTabs, intelViews } from './intel';
import { mapOverlays, cityExtras } from './map';
import { hqExtras } from './hq';
import { sfx } from '../../audio';

const odds = (p: number) => (p >= 0.7 ? 'likely' : p >= 0.45 ? 'a coin flip' : p >= 0.2 ? 'unlikely' : 'a long shot');
const mood = (r: Rival) => (r.pact ? (r.pact === 'alliance' ? 'Allied' : 'Truce') : r.hostility >= 6 ? 'At war' : r.hostility >= 3 ? 'Hostile' : r.relation >= 25 ? 'Friendly' : r.relation <= -25 ? 'Cold' : 'Neutral');
const moodCls = (r: Rival) => (r.pact ? 'good' : r.hostility >= 3 ? 'bad' : '');

function rivalRow(g: GameState, r: Rival): string {
  const intel = g.company.intel >= 1 || r.isPublic;
  const shared = r.offices.filter((ro) => g.company.offices.some((o) => o.city === ro.city && o.ind === ro.ind)).length;
  return `<tr class="tap" data-a="rival" data-id="${r.id}"><td><span style="display:flex;gap:8px;align-items:center">${logo(r.name, r.color)}<span><b>${esc(r.name)}</b><br><span class="small muted">${esc(PERSONALITY[r.personality].label)}</span></span></span></td>
    <td class="num">${r.offices.filter((ro) => officeVisible(g, ro)).length}${r.offices.some((ro) => !officeVisible(g, ro)) ? '+' : ''}</td>
    <td class="num">${intel ? money(r.rev * 4) : '?'}</td><td class="num">${shared || '–'}</td><td><span class="chip ${moodCls(r)}">${mood(r)}</span></td></tr>`;
}

function rivals(g: GameState): string {
  const known = g.rivals.filter((r) => r.alive && rivalKnown(g, r));
  const hidden = g.rivals.filter((r) => r.alive && !rivalKnown(g, r)).length;
  const gone = g.rivals.filter((r) => !r.alive);
  const sel = rivalById(g, ui.sel.rival) ?? known[0];
  return `<h1>Rivals</h1><p class="muted">They run on the same economics you do. Each has a temperament, a memory, and a sense of how much you are hurting them.</p>
    <div class="grid2"><div class="sheet"><div class="scrollx"><table class="ledger"><thead><tr><th>Company</th><th class="num">Offices</th><th class="num">Revenue a year</th><th class="num">Shared</th><th>Stance</th></tr></thead>
    <tbody>${known.map((r) => rivalRow(g, r)).join('')}</tbody></table></div>
    ${hidden ? `<p class="small muted">${hidden} more compan${hidden > 1 ? 'ies operate' : 'y operates'} in markets you have not explored.</p>` : ''}
    ${gone.length ? `<p class="small muted">Gone: ${gone.map((r) => `${esc(r.name)} (${esc(r.fate ?? '')})`).join(', ')}.</p>` : ''}
    ${g.company.intel < 1 ? '<p class="small muted">Revenue and technology figures need a competitive intelligence unit (Corporate → Invest) unless the rival is listed.</p>' : ''}</div>
    ${sel ? detail(g, sel) : '<div class="sheet"><p class="muted">You have not met any rivals yet. Explore more markets.</p></div>'}</div>`;
}

function detail(g: GameState, r: Rival): string {
  const c = g.company;
  const p = PERSONALITY[r.personality];
  const intel = c.intel >= 1 || r.isPublic;
  const ind = c.primary;
  const markets = r.offices.filter((ro) => officeVisible(g, ro)).map((ro) => {
    const mine = c.offices.find((o) => o.city === ro.city && o.ind === ro.ind);
    return `<tr><td>${esc(CITY[ro.city].name)}${ro.war > 0 ? ' <span class="chip bad">price war</span>' : ''}</td><td class="num">${officeDetail(g, ro) ? pct(ro.share, 1) : '?'}</td><td class="num">${mine ? pct(mine.share, 1) : '–'}</td><td class="num">${officeDetail(g, ro) ? `${Math.round(ro.price * 100)}%` : '?'}</td></tr>`;
  }).join('');
  const hpBar = `<div class="row" style="gap:8px;align-items:center">${meter(r.hostility / 10, r.hostility >= 3)}<span class="small">${r.hostility.toFixed(1)} / 10</span></div>`;
  const bidF = bidPrice(g, r, false), bidH = bidPrice(g, r, true);
  return `<div class="sheet"><div class="spread"><h2 style="margin:0;display:flex;gap:10px;align-items:center">${logo(r.name, r.color, 36)}${esc(r.name)}</h2><span class="chip ${moodCls(r)}">${mood(r)}</span></div>
    <p class="small muted" style="margin:4px 0 8px">Run by ${esc(r.ceo)} from ${esc(CITY[r.hq].name)}${r.since !== undefined && r.since > 0 ? `, in the industry since ${turnLabel(r.since)}` : ''}. ${esc(p.label)}: ${esc(p.blurb)}</p>
    <div class="kv">
      <div>Revenue a year</div><div>${intel ? $(r.rev * 4, 'Rival revenue', 'Last quarter, annualised. Rivals pay the same kinds of costs you do: staff, rent, marketing, head office, R&D, interest and tax in each country.', [['EBITDA margin last quarter', r.rev > 0 ? pct(r.ebitda / r.rev) : '—'], ['Profit last quarter', money(r.profit)], ['Cash', money(r.cash)], ['Debt', money(r.debt)], ['Credit rating', r.rating], ['Raised from investors since you started', money(r.raised)]]) : N('?', 'Unknown', 'Their accounts are private. A competitive intelligence unit would tell you.')}</div>
      <div>Valuation</div><div>${intel ? $(r.valuation, 'Rival valuation', `Worked out with exactly the formula used for yours: revenue or profits times an industry multiple, adjusted for growth, margin, technology, brand, market mood and interest rates${r.isPublic ? '' : ', less the 20% private-company discount'}.`) : '?'}</div>
      <div>Technology</div><div>${intel ? N((r.tech[ind] ?? 0).toFixed(0), 'Rival technology', `Their ${INDUSTRIES[ind].short} technology level, against your ${(c.tech[ind] ?? 0).toFixed(0)}.`) : '?'}</div>
      <div>Relations</div><div>${N((r.relation >= 0 ? '+' : '−') + Math.abs(r.relation).toFixed(0), 'Relations', 'How they feel about you, −100 to +100. Dinners help; lawsuits, poaching and price cuts in their markets do not. Friendly rivals propose truces and alliances.')}</div>
      <div>Hostility</div><div>${tip(hpBar, explain('Hostility', 'How close they are to open warfare. It rises when you compete hard in their markets or attack them, and when they are aggressive by nature; it cools slowly on its own. Hostile rivals start price wars, poach, sue and lobby against you.', [['Grievances not yet answered', String(r.grievances)], ['Aggression of their style', pct(p.aggression)], ['Holds a grudge', pct(p.grudge)]]), 'plain')}</div>
      ${r.pact ? `<div>Agreement</div><div><b class="serif">${r.pact === 'alliance' ? 'Alliance' : 'Truce'} until ${turnLabel(r.pactUntil)}</b></div>` : ''}
    </div>
    ${feudList(r)}
    ${markets ? `<h3>Where you meet</h3><div class="scrollx"><table class="ledger"><thead><tr><th>City</th><th class="num">Their share</th><th class="num">Yours</th><th class="num">Their price</th></tr></thead><tbody>${markets}</tbody></table></div>` : ''}
    <h3>Moves</h3>
    <div class="choices" style="grid-template-columns:1fr">
      <button class="choice" data-a="dip" data-k="relations" data-id="${r.id}"><b>Build the relationship</b><span class="muted">Dinners and back-channels. Relations +8, hostility down a little. ${money(0.01 * Math.max(250_000, c.quarters[c.quarters.length - 1]?.pnl.revenue ?? 0))}.</span></button>
      ${r.pact ? '' : `<button class="choice" data-a="dip" data-k="truce" data-id="${r.id}"><b>Propose a truce</b><span class="muted">Two years without hostile moves on either side. They are ${odds(truceOdds(g, r))} to agree.</span></button>`}
      ${r.pact === 'alliance' ? '' : `<button class="choice" data-a="dip" data-k="alliance" data-id="${r.id}" ${r.relation < 20 ? 'disabled' : ''}><b>Propose an alliance</b><span class="muted">Three years of joint marketing (+3% pull everywhere). Needs relations of +20. Other rivals will not like it.</span></button>`}
      <button class="choice" data-a="dip" data-k="poach" data-id="${r.id}" ${r.pact ? 'disabled' : ''}><b>Poach their engineers</b><span class="muted">Signing bonuses for a few of their best. Often works; always remembered.</span></button>
      <button class="choice" data-a="dip" data-k="sue" data-id="${r.id}" ${r.pact ? 'disabled' : ''}><b>Sue them</b><span class="muted">An expensive case with a verdict in about three quarters. Better odds with a patent portfolio.</span></button>
      <button class="choice" data-a="dip" data-k="lobby" data-id="${r.id}"><b>Lobby against them</b><span class="muted">Needs a government affairs office. Raises their costs if it works; costs you reputation if it does not.</span></button>
      <button class="choice" data-a="askBid" data-id="${r.id}" data-h="0"><b>Offer to buy them</b><span class="muted">About ${money(bidF)}. They are ${odds(bidOdds(g, r, false))} to accept.</span></button>
      <button class="choice" data-a="askBid" data-id="${r.id}" data-h="1"><b>Hostile bid</b><span class="muted">About ${money(bidH)}, over the board's head. ${odds(bidOdds(g, r, true))} to succeed, and makes every rival warier.</span></button>
    </div></div>`;
}

/** What has passed between you, newest first. */
function feudList(r: Rival, max = 12): string {
  const f = (r.feud ?? []).slice(-max).reverse();
  return f.length ? `<h3>Between you</h3><ul class="feed">${f.map((x) => `<li class="${x.who === 'you' ? 'info' : 'bad'}"><span>${turnLabel(x.turn)}</span><span><b>${x.who === 'you' ? 'You' : esc(r.name)}:</b> ${esc(x.text)}</span></li>`).join('')}</ul>` : '';
}

// The nemesis: the rival with the deepest grudge, on HQ with the history of the feud.
hqExtras.push((g) => {
  const r = nemesis(g);
  if (!r) return '';
  const p = PERSONALITY[r.personality];
  return `<div class="sheet"><div class="spread"><h2 style="margin:0;display:flex;gap:10px;align-items:center">${logo(r.name, r.color, 30)}Your nemesis</h2><button class="btn sm" data-a="rival" data-id="${r.id}">Deal with them</button></div>
    <p class="small" style="margin:6px 0"><b>${esc(r.name)}</b>, ${esc(p.label.toLowerCase())}, run by ${esc(r.ceo)}. Hostility ${r.hostility.toFixed(1)} of 10${(p.grudgeDecay ?? 1) < 1 ? '; this one never forgets' : ''}.</p>
    ${meter(r.hostility / 10, r.hostility >= 3)}
    ${feudList(r, 5) || '<p class="small muted">No open clashes yet, but they are spoiling for one.</p>'}</div>`;
});

function goals(g: GameState): string {
  const vs = victoryStatus(g);
  return `<h1>Paths to victory</h1><p class="muted">The first goal you reach wins the game. After ${g.maxTurns / 4} years, the game ends with a grade from A to F.</p>
    <div class="grid2">${vs.map((v) => `<div class="sheet"><div class="spread"><h3 style="margin:0">${esc(v.name)}</h3>${v.met ? `<span class="chip good">${v.need > 1 ? `held ${v.streak} of ${v.need} quarters` : 'met'}</span>` : `<span class="small muted">${pct(v.progress)}</span>`}</div>
      <p class="small" style="margin:6px 0">${esc(v.desc)}</p>${meter(v.progress)}<p class="small muted" style="margin:6px 0 0">${esc(v.detail)}${v.enabled ? '' : ' — switched off in this game'}</p></div>`).join('')}</div>`;
}

intelTabs.unshift(['rivals', 'Rivals'], ['goals', 'Goals']);
intelViews.rivals = rivals;
intelViews.goals = goals;
tabDots.intel = (g) => g.rivals.some((r) => r.alive && r.offices.some((ro) => ro.war > 0 && g.company.offices.some((o) => o.city === ro.city && o.ind === ro.ind)));

// The board: coloured pegs around each city for every rival you can see there.
mapOverlays.push((g: GameState, ct: CityDef, rad: number) => {
  const here = g.rivals.filter((r) => r.alive && r.offices.some((ro) => ro.city === ct.id && officeVisible(g, ro)));
  return here.map((r, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / Math.max(here.length, 4)) * Math.PI * 2 + Math.PI / 4;
    return `<circle cx="${(Math.cos(a) * (rad + 7)).toFixed(1)}" cy="${(Math.sin(a) * (rad + 7)).toFixed(1)}" r="5.5" fill="${r.color}" stroke="var(--ink)" stroke-width="1.5"/>`;
  }).join('');
});
cityExtras.push((g: GameState, ct: CityDef) => {
  const rows = g.rivals.flatMap((r) => (r.alive ? r.offices.filter((ro) => ro.city === ct.id && officeVisible(g, ro)).map((ro) => [r, ro] as const) : []));
  if (!rows.length) return '<h3>Competitors</h3><p class="small muted">No named rivals here — only local businesses.</p>';
  return `<h3>Competitors</h3><table class="ledger"><thead><tr><th>Rival</th><th>Industry</th><th class="num">Share</th></tr></thead><tbody>${rows.map(([r, ro]) => `<tr class="tap" data-a="rival" data-id="${r.id}"><td><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.color};border:1.5px solid var(--ink);margin-right:6px"></i>${esc(r.name)}</td><td>${INDUSTRIES[ro.ind].short}</td><td class="num">${officeDetail(g, ro) ? pct(ro.share, 1) : '?'}</td></tr>`).join('')}</tbody></table>`;
});

on('rival', (d) => {
  ui.sel.rival = Number(d.id);
  ui.tab = 'intel';
  ui.sub.intel = 'rivals';
  render(false);
});
const DIP: Record<string, typeof improveRelations> = { relations: improveRelations, truce: proposeTruce, alliance: proposeAlliance, poach: poachTalent, sue: sueRival, lobby: lobbyAgainst };
on('dip', (d) => {
  const r = DIP[d.k!](ui.g!, Number(d.id));
  act(r, r.ok ? sfx.good : undefined);
  if (!r.ok) sfx.bad();
});
on('askBid', (d) => {
  ui.modal = { kind: 'bid', data: { id: Number(d.id), hostile: d.h === '1' } };
  render();
});
on('doBid', () => {
  const m = ui.modal!.data;
  ui.modal = null;
  const r = bidForRival(ui.g!, m.id, m.hostile);
  act(r, r.ok ? sfx.win : undefined);
  if (!r.ok) sfx.bad();
});
modals.bid = (g, m) => {
  const r = rivalById(g!, m.id)!;
  const price = bidPrice(g!, r, m.hostile);
  const c = g!.company;
  const cash = c.cap.isPublic ? price * 0.5 : price;
  return `<h2>${m.hostile ? 'Hostile bid for' : 'Offer to buy'} ${esc(r.name)}</h2>
    <p>${m.hostile ? 'You go straight to their shareholders with a premium they will find hard to refuse — if their board cannot stop it.' : `You make ${esc(r.ceo)} an offer. Distressed and friendly companies are far more likely to say yes.`}</p>
    <div class="kv" style="margin:12px 0"><div>Price</div><div><b class="serif">${money(price)}</b></div>
      <div>Paid in cash</div><div><b class="serif">${money(cash)}</b>${c.cap.isPublic ? ' <span class="small muted">(the rest in your shares)</span>' : ''}</div>
      <div>Debt you take on</div><div><b class="serif">${money(r.debt * 0.5)}</b></div>
      <div>Chance it goes through</div><div><b class="serif">${odds(bidOdds(g!, r, m.hostile))}</b></div>
      <div>Adviser fees, win or lose</div><div><b class="serif">${money(price * 0.01)}</b></div></div>
    <p class="small muted">If it works, you take over all ${r.offices.length} of their offices and their people. Integration takes a year, and merging two cultures always costs some of yours.</p>
    <div class="row end"><button class="btn" data-a="close">Not now</button><button class="btn primary" data-a="doBid" ${cash > c.books.cash ? 'disabled' : ''}>${cash > c.books.cash ? `Need ${money(cash)} in cash` : 'Make the offer'}</button></div>`;
};
