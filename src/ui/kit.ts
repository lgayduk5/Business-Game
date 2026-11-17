// Small view helpers: escaping, tappable numbers with explanations, ledgers, charts, icons.
import { TERM, money, pct } from '@engine';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ── tooltips: every number in the UI goes through tip() so it can explain itself.
let TIPS: string[] = [];
export const resetTips = () => (TIPS = []);
export const getTip = (i: number) => TIPS[i] ?? '';
export type Row = [label: string, value: string, total?: boolean];
/** Body of an explanation: title, a sentence, an optional breakdown table, optional glossary links. */
export function explain(title: string, text: string, rows?: Row[], terms?: string[]): string {
  const t = rows?.length ? `<table>${rows.map((r) => `<tr class="${r[2] ? 'tot' : ''}"><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>` : '';
  const links = (terms ?? []).filter((id) => TERM[id]).map((id) => `<button class="term" data-a="term" data-id="${id}">${esc(TERM[id].term)}</button>`).join(', ');
  return `<h4>${esc(title)}</h4><p>${esc(text)}</p>${t}${links ? `<p>More: ${links}</p>` : ''}`;
}
export function tip(shown: string, body: string, cls = ''): string {
  TIPS.push(body);
  return `<button type="button" class="n ${cls}" data-tip="${TIPS.length - 1}">${shown}</button>`;
}
/** Money with an explanation. Negative values print in ledger red. */
export const $ = (x: number, title: string, text: string, rows?: Row[], terms?: string[]) => tip(esc(money(x)), explain(title, text, rows, terms), x < 0 ? 'neg' : '');
export const P = (x: number, title: string, text: string, rows?: Row[], digits = 0, terms?: string[]) => tip(esc(pct(x, digits)), explain(title, text, rows, terms));
export const N = (shown: string | number, title: string, text: string, rows?: Row[], terms?: string[]) => tip(esc(shown), explain(title, text, rows, terms));

/** Accountant's format for statements: thousands, negatives in parentheses. */
export function acct(x: number): string {
  const v = Math.round(x / 1000);
  if (v === 0) return '–';
  const s = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `(${s})` : s;
}
export const x2 = (x: number, d = 2) => (isFinite(x) ? x.toFixed(d) : '—');
export const delta = (now: number, before: number) => {
  if (!before) return '';
  const d = now / before - 1;
  return `<span class="${d < 0 ? 'neg' : 'pos'} small nowrap">${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}%</span>`;
};

// ── controls
export const stepper = (value: number, act: string, attrs: string) =>
  `<span class="stepper"><button data-a="${act}" ${attrs} data-d="-1" aria-label="Fewer">−</button><span>${value}</span><button data-a="${act}" ${attrs} data-d="1" aria-label="More">+</button></span>`;

export function slider(o: { label: string; act: string; attrs?: string; min: number; max: number; step: number; value: number; fmt: 'pct' | 'money' | 'x'; help?: string; tipBody?: string }): string {
  const shown = fmtLive(o.fmt, o.value);
  const lab = o.tipBody ? tip(esc(o.label), o.tipBody, 'plain') : esc(o.label);
  return `<div class="field"><div class="lab"><span>${lab}</span><output>${shown}</output></div>
    <input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" data-c="${o.act}" ${o.attrs ?? ''} data-fmt="${o.fmt}" aria-label="${esc(o.label)}">
    ${o.help ? `<div class="help">${o.help}</div>` : ''}</div>`;
}
export const fmtLive = (fmt: string, v: number) => (fmt === 'pct' ? `${Math.round(v * 100)}%` : fmt === 'money' ? money(v) : String(v));
export const seg = (act: string, options: [value: string, label: string][], current: string, attrs = '') =>
  `<span class="seg">${options.map(([v, l]) => `<button data-a="${act}" data-v="${v}" ${attrs} aria-pressed="${v === current}">${esc(l)}</button>`).join('')}</span>`;
export const meter = (frac: number, warn = false) => `<div class="meter ${warn ? 'warn' : ''}"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>`;

// ── charts (inline SVG, drawn from data — no image assets)
export function lineChart(series: { name: string; color: string; data: number[]; dash?: boolean }[], opts: { h?: number; zero?: boolean; fmt?: (x: number) => string } = {}): string {
  const W = 320, H = opts.h ?? 120, L = 6, R = 6, T = 8, Bm = 16;
  const all = series.flatMap((s) => s.data).filter((v) => isFinite(v));
  if (all.length < 2) return '<p class="muted small">Not enough history yet — check back after a couple of quarters.</p>';
  let lo = Math.min(...all), hi = Math.max(...all);
  if (opts.zero !== false) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) hi = lo + 1;
  const n = Math.max(...series.map((s) => s.data.length));
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(1, n - 1);
  const Y = (v: number) => T + (H - T - Bm) * (1 - (v - lo) / (hi - lo));
  const f = opts.fmt ?? money;
  const paths = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="4 3"' : ''} stroke-linejoin="round" points="${s.data.map((v, i) => `${X(i + n - s.data.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`).join('');
  const zero = lo < 0 && hi > 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="2 3"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} over time">
    <rect x="0" y="0" width="${W}" height="${H - Bm + 2}" fill="var(--bar)" opacity=".55"/>${zero}${paths}
    <text x="${L}" y="${H - 3}">${esc(f(lo))}</text><text x="${W - R}" y="${H - 3}" text-anchor="end">high ${esc(f(hi))}</text></svg>
    <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
export function spark(data: number[], color = 'var(--ink)'): string {
  if (data.length < 2) return '';
  const lo = Math.min(...data), hi = Math.max(...data);
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * 60).toFixed(1)},${(16 - ((v - lo) / (hi - lo || 1)) * 14).toFixed(1)}`).join(' ');
  return `<svg width="62" height="18" viewBox="0 0 62 18" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}"/></svg>`;
}

// ── icons: hand-drawn 24px strokes
const I = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  hq: I('<path d="M4 20V8l8-5 8 5v12"/><path d="M9 20v-6h6v6M4 20h16"/>'),
  map: I('<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/>'),
  ops: I('<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M8 9V5h8v4M3 14h18"/>'),
  corp: I('<path d="M3 9 12 4l9 5M5 9v8M10 9v8M14 9v8M19 9v8M3 20h18"/>'),
  intel: I('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v3l2 1.5"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: I('<path d="m6 6 12 12M18 6 6 18"/>'),
  fwd: I('<path d="m5 5 7 7-7 7M13 5l7 7-7 7"/>'),
};

// ── procedural logos: a shape and a monogram derived from the name, in the house style
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function logo(name: string, color: string, size = 28): string {
  const h = hash(name);
  const words = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  const mono = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  const shapes = [
    '<circle cx="20" cy="20" r="17"/>',
    '<rect x="4" y="4" width="32" height="32" rx="3"/>',
    '<path d="M20 2 38 20 20 38 2 20Z"/>',
    '<path d="M20 3 35 11.5V28.5L20 37 5 28.5V11.5Z"/>',
    '<path d="M6 5h28v16c0 9-7 14-14 16C13 35 6 30 6 21Z"/>',
  ];
  const shape = shapes[h % shapes.length];
  const rule = (h >> 4) % 3 === 0 ? '<path d="M10 31h20M10 34h20" stroke="var(--ink)" stroke-width="1.6"/>' : '';
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><g fill="${color}" stroke="var(--ink)" stroke-width="2.2">${shape}</g>${rule}<text x="20" y="${rule ? 25 : 26}" text-anchor="middle" font-family="var(--serif)" font-weight="700" font-size="${mono.length > 1 ? 15 : 18}" fill="var(--ink)">${esc(mono)}</text></svg>`;
}
