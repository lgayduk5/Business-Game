// Intel: the economy now; rivals, advisor and glossary register themselves here in later milestones.
import { REGIONS, REGION_LIST, type GameState } from '@engine';
import { N, esc, lineChart } from '../kit';
import { ui } from '../store';
import { screens } from '../shell';
import { macroLine } from './hq';

export const intelTabs: [string, string][] = [['economy', 'Economy']];
export const intelViews: Record<string, (g: GameState) => string> = {};

const PHASE_ADVICE: Record<string, string> = {
  expansion: 'Steady growth. A good time to build capacity and lock in financing while lenders are relaxed.',
  boom: 'Demand is strong, but so are wages and inflation — and rate rises usually follow. Booms are when the over-extended set themselves up to fail.',
  slowdown: 'Growth is fading. Check your runway and your covenant headroom now, while you still have choices.',
  recession: 'Demand is falling, customers pay late, lenders say no. Cash is everything. Those who have it can buy talent, share and competitors cheaply.',
  recovery: 'The worst is over. People and capacity take quarters to add, so those who move first are ready when demand returns.',
};

function economy(g: GameState): string {
  const m = g.macro;
  const h = m.hist;
  const turns = h.map((_, i) => g.turn - h.length + i);
  const idx = (v: number, title: string, text: string) => N((v / m.cpi).toFixed(2) + '×', title, text, [['Nominal index', v.toFixed(2)], ['General price level', m.cpi.toFixed(2)]]);
  return `<h1>The economy</h1><div class="note"><b>${{ expansion: 'Steady expansion', boom: 'Boom', slowdown: 'Slowdown', recession: 'Recession', recovery: 'Recovery' }[m.phase]}.</b><p>${PHASE_ADVICE[m.phase]}</p></div>
    <div class="grid2">
      <div class="sheet"><h2>Now</h2>${macroLine(g)}</div>
      <div class="sheet"><h2>Rates and inflation</h2>${lineChart([{ name: 'Central-bank rate', color: 'var(--ink)', data: h.map((x) => x.rate) }, { name: 'Inflation', color: 'var(--red)', data: h.map((x) => x.infl) }], { fmt: (x) => x.toFixed(1) + '%', turns, id: 'rates' })}</div>
      <div class="sheet"><h2>The cycle</h2>${lineChart([{ name: 'Output gap (above zero = overheating)', color: 'var(--green)', data: h.map((x) => x.gap) }], { fmt: (x) => x.toFixed(1) + '%', turns })}
        <p class="small muted">Demand in cyclical industries follows this line. When it runs hot, inflation rises and the central bank leans against it.</p></div>
      <div class="sheet"><h2>Investor mood</h2>${lineChart([{ name: 'Sentiment (1.0 = normal)', color: 'var(--ink)', data: h.map((x) => x.sentiment) }], { zero: false, fmt: (x) => x.toFixed(2) + '×', turns })}</div>
      <div class="sheet"><h2>Input prices <span class="muted small">relative to general prices</span></h2><div class="kv">
        <div>Wages</div><div>${idx(m.wageIdx, 'Wages', 'Pay tends to rise a little faster than prices, and faster still when the labour market is tight.')}</div>
        <div>Commodities</div><div>${idx(m.commodity, 'Commodities', 'Materials for manufacturing and food for restaurants. Volatile, and they rise in booms.')}</div>
        <div>Energy</div><div>${idx(m.energy, 'Energy', 'Fuel for logistics and power for everyone. The most volatile input.')}</div>
        <div>Computing</div><div>${idx(m.cloud, 'Computing', 'Hosting costs for software. The one input that reliably gets cheaper.')}</div>
        <div>Labour market</div><div>${N(m.labor.toFixed(2), 'Labour-market tightness', 'Above 1, candidates are scarce: hiring pools shrink and attrition rises. Below 1, talent is available.')}</div>
        <div>Credit spreads</div><div>${N('+' + m.spread.toFixed(1) + ' pts', 'Credit spread', 'What lenders add on top of your own rating-based spread. It widens sharply in recessions.', undefined, ['creditRating'])}</div></div></div>
      <div class="sheet"><h2>Regions</h2><table class="ledger"><thead><tr><th>Region</th><th class="num">Local cycle</th><th class="num">Currency</th></tr></thead><tbody>
        ${REGION_LIST.map((r) => `<tr><td>${esc(REGIONS[r].name)}</td><td class="num">${N((m.regionGap[r] >= 0 ? '+' : '−') + Math.abs(m.regionGap[r]).toFixed(1), 'Regional cycle', 'How this region is doing relative to the world economy. Added to the global output gap for demand in its cities.')}</td>
        <td class="num">${N(m.fx[r].toFixed(2), 'Exchange rate', 'Value of the local currency against yours, 1.00 at the start.', undefined, ['fxRisk'])}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}
intelViews.economy = economy;

screens.intel = (g) => {
  const cur = ui.sub.intel && intelViews[ui.sub.intel] ? ui.sub.intel : intelTabs[0][0];
  const tabs = intelTabs.length > 1 ? `<div class="subtabs">${intelTabs.map(([k, l]) => `<button data-a="sub" data-k="intel" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>` : '';
  return tabs + intelViews[cur](g);
};
