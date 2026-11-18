// Invariant playtest: the honest bots and a "chaos" player who takes random actions with random arguments, across
// every industry, difficulty and mode (full game, Sprint, sandbox, Ironman, daily, every scenario and its Brutal
// version). After every action, card and quarter it checks that the books balance, numbers are finite, the cap table
// adds up, shares and staff are in range, cards point at things that still exist, saves replay identically, the forecast
// changes nothing, and no text shows "undefined", "NaN" or an unfilled {placeholder}. Prints each kind of problem once,
// with an example, and fails if there is any.
//   npm run playtest                 two seeds of everything (about 1,000 games, a few minutes)
//   npm run playtest -- --quick      one seed
//   npm run playtest -- --out x.json also write the endings, every card's text and every action message seen
import * as E from '../engine/src/index';
import * as A from '../engine/src/actions';
import * as R from '../engine/src/rivals';
import * as I from '../engine/src/invest';
import * as M from '../engine/src/mna';
import * as X from '../engine/src/mechanics';
import * as F from '../engine/src/finance';
import { BOTS, botTurn } from '../engine/src/bots';
import type { GameState, Role, RegionId } from '../engine/src/types';
import { writeFileSync } from 'node:fs';

const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : '';
const QUICK = process.argv.includes('--quick');

type Issue = { count: number; example: string; games: Set<string> };
const issues = new Map<string, Issue>();
const notes = new Map<string, Issue>(); // worth a look, but not a failure
function note(kind: string, detail: string, where: string) {
  const it = notes.get(kind) ?? { count: 0, example: '', games: new Set<string>() };
  it.count++;
  if (!it.example) it.example = `${where}: ${detail}`;
  it.games.add(where.split('@')[0]);
  notes.set(kind, it);
}
function flag(kind: string, detail: string, where: string) {
  const it = issues.get(kind) ?? { count: 0, example: '', games: new Set<string>() };
  it.count++;
  if (!it.example) it.example = `${where}: ${detail}`;
  it.games.add(where.split('@')[0]);
  issues.set(kind, it);
}

// seeded chaos RNG independent of the game's
function mkRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAD_TEXT = /undefined|NaN|Infinity|\{\w+\}|\bnull\b|\[object|\$-|−\$0(?![.\d])|\$0\.0|  +\S|\s[,.](?!\d)|\.\.(?!\.)/;
const ROLES: Role[] = ['ops', 'sales', 'rnd', 'admin'];
const eventTexts = new Map<string, { ind: string; title: string; text: string }>();
const ends = new Map<string, Map<string, number>>();
const actionMsgs = new Map<string, string>();

function checkText(s: string, kind: string, where: string) {
  if (typeof s !== 'string') return flag(`${kind}: not a string`, String(s), where);
  if (BAD_TEXT.test(s)) flag(`${kind}: suspicious text`, s.slice(0, 220), where);
}

function equityCheck(g: GameState) {
  const c = g.company;
  return E.totalAssets(c.books) - E.totalLiabilities(c.books) - E.equityOf(c.books) - E.netIncome(c.pnl);
}

function checkState(g: GameState, where: string, prevVal?: number) {
  const c = g.company;
  const nf = findBad(g);
  if (nf.length) flag('non-finite number in state', nf.slice(0, 5).join(', '), where);
  const q = c.quarters[c.quarters.length - 1];
  const tol = (x: number) => Math.max(5, Math.abs(x) * 1e-7);
  if (q) {
    if (Math.abs(q.check.bs) > tol(E.totalAssets(q.bs))) flag('balance sheet does not tie', String(q.check.bs), where);
    if (Math.abs(q.check.cash) > tol(q.bs.cash)) flag('cash flow does not tie', String(q.check.cash), where);
    if (Math.abs(q.cf.cfo - q.cf.directOp) > tol(q.pnl.revenue)) flag('CFO indirect != direct', `${q.cf.cfo} vs ${q.cf.directOp}`, where);
  }
  const holders = c.cap.holders.reduce((s, h) => s + h.shares, 0);
  if (Math.abs(c.cap.founder + holders - c.cap.shares) > 1) flag('cap table does not add up', `${c.cap.founder}+${holders} vs ${c.cap.shares}`, where);
  if (c.cap.holders.some((h) => h.shares < -1)) flag('negative holder shares', '', where);
  if (c.cap.founder > c.cap.shares + 1) flag('founder owns >100%', '', where);
  const invSum = c.offices.reduce((s, o) => s + o.invValue, 0);
  if (Math.abs(invSum - c.books.inventory) > tol(c.books.inventory) + 10) flag('inventory ledger != offices', `${c.books.inventory} vs ${invSum}`, where);
  for (const o of c.offices) {
    for (const r of ROLES) {
      const s = o.staff[r];
      if (s.n < 0 || !Number.isInteger(s.n)) flag('staff count not a non-negative integer', `${o.name} ${r} ${s.n}`, where);
      if (s.reqs < 0) flag('negative requisitions', `${o.name} ${r} ${s.reqs}`, where);
      if (s.skill < 15 - 1e-9 || s.skill > 95 + 1e-9) flag('skill out of range', `${s.skill}`, where);
      if (s.fresh > s.n) flag('fresh > staff', `${o.name} ${r} fresh ${s.fresh} n ${s.n}`, where);
    }
    if (o.morale < 0 || o.morale > 100) flag('morale out of range', `${o.morale}`, where);
    if (o.share < 0 || o.share > 0.95 + 1e-9) flag('office share out of range', `${o.share}`, where);
    if (o.inventory < -1e-6 || o.invValue < -1) flag('negative inventory', `${o.inventory} ${o.invValue}`, where);
    if (o.accDep > o.ppe + 1) flag('office accumulated depreciation > gross PPE', `${o.name} ${o.accDep} > ${o.ppe}`, where);
    if (o.cap < 0) flag('negative capacity', `${o.cap}`, where);
    if (o.last && o.last.sold > o.last.demand + 1e-6) flag('sold more than demand', `${o.last.sold} > ${o.last.demand}`, where);
  }
  if (c.books.accDep > c.books.ppe + 1) flag('books accDep > ppe', `${c.books.accDep} > ${c.books.ppe}`, where);
  for (const k of ['ar', 'inventory', 'ppe', 'goodwill', 'securities', 'ap', 'deferred', 'debt'] as const) if (c.books[k] < -5) flag(`negative ${k} on books`, String(c.books[k]), where);
  const loanSum = c.loans.reduce((s, l) => s + l.principal, 0);
  if (Math.abs(loanSum - c.books.debt) > Math.max(5, c.books.debt * 1e-6)) flag('loans != books.debt', `${loanSum} vs ${c.books.debt}`, where);
  for (const l of c.loans) {
    if (l.principal < -1) flag('negative loan principal', `${l.name} ${l.principal}`, where);
    if (l.kind === 'revolver' && l.principal > l.limit + 1) flag('revolver over limit', `${l.principal} > ${l.limit}`, where);
  }
  // markets: named shares sum
  const sums = new Map<string, number>();
  for (const o of c.offices) sums.set(`${o.city}:${o.ind}`, (sums.get(`${o.city}:${o.ind}`) ?? 0) + o.share);
  for (const r of g.rivals) {
    if (!r.alive) continue;
    if (!Number.isFinite(r.cash) || !Number.isFinite(r.valuation)) flag('rival non-finite', r.name, where);
    for (const ro of r.offices) {
      sums.set(`${ro.city}:${ro.ind}`, (sums.get(`${ro.city}:${ro.ind}`) ?? 0) + ro.share);
      if (ro.share < 0 || ro.share > 0.95) flag('rival share out of range', `${ro.share}`, where);
    }
    if (r.valuation < 0) flag('rival negative valuation', r.name, where);
  }
  for (const [k, v] of sums) if (v > 1.0001) flag('named shares in one market exceed 100%', `${k} ${v.toFixed(3)}`, where);
  // duplicate player offices same city+ind
  const seen = new Set<string>();
  for (const o of c.offices) {
    const k = `${o.city}:${o.ind}`;
    if (seen.has(k)) flag('two player offices in one market', k, where);
    seen.add(k);
  }
  if (c.valuation < 0) flag('negative valuation', String(c.valuation), where);
  if (prevVal && prevVal > 1e6 && c.valuation > 0 && (c.valuation / prevVal > 4 || prevVal / c.valuation > 4)) note(`valuation moved more than 4x in one quarter (${where.split('/')[2]})`, `${E.money(prevVal)} -> ${E.money(c.valuation)} T${g.turn}`, where);
  for (const n of g.news.filter((n) => n.turn >= g.turn - 1)) checkText(n.text, 'news', where);
  for (const a of g.advisor) { checkText(a.title, 'advisor title', where); checkText(a.text, 'advisor text', where); }
  for (const b of g.report?.bullets ?? []) checkText(b, 'report bullet', where);
  if (g.report) checkText(g.report.headline, 'report headline', where);
  for (const pe of g.queue) {
    const v = E.viewEvent(g, pe);
    checkText(v.title, 'event title', where);
    checkText(v.text, 'event text', where);
    for (const o of v.options) { checkText(o.label, 'event option', where); checkText(o.hint, 'event hint', where); if (o.money) checkText(o.money, 'event money', where); }
    eventTexts.set(`${pe.id}|${g.company.primary}`, { ind: g.company.primary, title: v.title, text: v.text });
    if (!E.EVENT[pe.id].opts.some((o) => E.evalCond(g, o.req, pe.ctx))) flag('event with no enabled option', pe.id, where);
    // event bound to an office that no longer exists
    if (pe.ctx.office && !c.offices.some((o) => o.id === pe.ctx.office)) flag('event bound to closed office', pe.id, where);
    if (pe.ctx.rival !== undefined && !g.rivals.find((r) => r.id === pe.ctx.rival)?.alive) flag('event bound to dead rival', pe.id, where);
    if (pe.ctx.person && !c.people.some((p) => p.id === pe.ctx.person)) flag('event bound to departed person', pe.id, where);
    if (pe.ctx.loan && !c.loans.some((l) => l.id === pe.ctx.loan)) flag('event bound to repaid loan', pe.id, where);
  }
  // people
  for (const p of c.people) {
    if (p.office && !c.offices.some((o) => o.id === p.office)) flag('GM of a closed office still employed', p.name, where);
  }
  for (const o of c.offices) if (o.gm && !c.people.some((p) => p.id === o.gm)) flag('office GM id dangling', o.name, where);
  const roles = new Map<string, number>();
  for (const p of c.people) if (!p.office) roles.set(p.role, (roles.get(p.role) ?? 0) + 1);
  for (const [r, n] of roles) if (n > 1) flag('two executives in one seat', r, where);
  if (c.divisions.length !== new Set(c.divisions).size) flag('duplicate divisions', c.divisions.join(','), where);
}

function findBad(x: unknown, path = 'g', out: string[] = [], depth = 0): string[] {
  if (out.length > 5 || depth > 12) return out;
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(path); }
  else if (Array.isArray(x)) x.forEach((v, i) => findBad(v, `${path}[${i}]`, out, depth + 1));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) findBad(v, `${path}.${k}`, out, depth + 1);
  return out;
}

// ── chaos bot
function chaos(g: GameState, rnd: () => number, where: string) {
  const c = g.company;
  const pick = <T,>(a: readonly T[]): T | undefined => (a.length ? a[Math.floor(rnd() * a.length)] : undefined);
  const regions = [...new Set(c.offices.map((o) => E.CITY[o.city].region))] as RegionId[];
  const office = () => pick(c.offices);
  const acts: [string, () => E.ActionResult | void | '' | undefined][] = [
    ['setReqs', () => { const o = office(); return o && A.setReqs(g, o.id, pick(ROLES)!, Math.floor(rnd() * 15)); }],
    ['fire', () => { const o = office(); return o && A.fire(g, o.id, pick(ROLES)!, Math.floor(rnd() * 5)); }],
    ['setPay', () => { const o = office(); return o && A.setPay(g, o.id, 0.7 + rnd() * 0.8); }],
    ['setTraining', () => { const o = office(); return o && A.setTraining(g, o.id, Math.floor(rnd() * 4)); }],
    ['setBackfill', () => { const o = office(); return o && A.setBackfill(g, o.id, rnd() < 0.7); }],
    ['expandCapacity', () => { const o = office(); return o && A.expandCapacity(g, o.id, Math.round(o.cap * (0.1 + rnd() * 0.5)) + 100, rnd() < 0.5); }],
    ['sellCapacity', () => { const o = office(); return o && A.sellCapacity(g, o.id, Math.round(o.cap * rnd() * 0.3)); }],
    ['sellPlantStake', () => { const o = office(); return o && A.sellPlantStake(g, o.id); }],
    ['setFactoring', () => A.setFactoring(g, rnd() < 0.5)],
    ['setPrice', () => { const o = office(); return o && A.setPrice(g, E.CITY[o.city].region, o.ind, 0.6 + rnd() * 1.2); }],
    ['setMarketing', () => { const r = pick(regions); const q = c.quarters[c.quarters.length - 1]; return r && A.setMarketing(g, r, (q?.pnl.revenue ?? 100000) * rnd() * 0.1); }],
    ['setSupply', () => { const r = pick(regions); return r && A.setSupply(g, r, pick(['lean', 'balanced', 'resilient'] as const)!); }],
    ['scout', () => { const city = pick(E.CITIES.filter((x) => (g.discovered[x.id] ?? 0) === 0)); return city && A.scout(g, city.id); }],
    ['openOffice', () => { const city = pick(E.CITIES.filter((x) => (g.discovered[x.id] ?? 0) >= 1)); const ind = pick(c.divisions); return city && ind && A.openOffice(g, city.id, ind, rnd() < 0.5); }],
    ['closeOffice', () => { if (c.offices.length < 2 || rnd() < 0.7) return; const o = office(); return o && A.closeOffice(g, o.id); }],
    ['launchDivision', () => { if (rnd() < 0.7) return; const ind = pick(E.INDUSTRY_IDS.filter((k) => !c.divisions.includes(k))); return ind && A.launchDivision(g, ind); }],
    ['setRdBudget', () => { const ind = pick(c.divisions)!; const q = c.quarters[c.quarters.length - 1]; return A.setRdBudget(g, ind, (q?.pnl.revenue ?? 100000) * rnd() * 0.15); }],
    ['setDividend', () => { const q = c.quarters[c.quarters.length - 1]; return A.setDividend(g, rnd() < 0.7 ? 0 : Math.max(0, (q?.ni ?? 0) * 0.3)); }],
    ['setAutoRevolver', () => A.setAutoRevolver(g, rnd() < 0.8)],
    ['hireExec', () => { const p = pick(g.candidates); return p && A.hireExec(g, p.id); }],
    ['fireExec', () => { if (rnd() < 0.8) return; const p = pick(c.people.filter((x) => !x.office)); return p && A.fireExec(g, p.id); }],
    ['retain', () => { const p = pick(c.people); return p && A.retain(g, p.id); }],
    ['signPartner', () => { const r = pick(regions); return r && A.signPartner(g, r); }],
    ['endPartner', () => { const r = pick(regions); return r && A.endPartner(g, r); }],
    ['startInvestment', () => {
      const scope = pick(['corp', 'office', 'region'] as const)!;
      const def = pick(I.catalog(g, scope));
      if (!def) return;
      const sc = scope === 'office' ? office()?.id : scope === 'region' ? pick(regions) : undefined;
      return I.startInvestment(g, def.id, sc);
    }],
    ['diligence', () => { const def = pick(I.catalog(g, 'corp')); return def && I.diligence(g, def.id); }],
    ['cancelInvestment', () => { if (rnd() < 0.7) return; const inv = pick(c.investments.filter((i) => i.state === 'ramp' || i.state === 'active')); return inv && I.cancelInvestment(g, inv.uid); }],
    ['licenseOut', () => { const inv = pick(c.investments); return inv && I.licenseOut(g, inv.uid); }],
    ['diligenceTarget', () => { const t = pick(g.targets); return t && M.diligenceTarget(g, t.id); }],
    ['acquireTarget', () => { const t = pick(g.targets); return t && M.acquireTarget(g, t.id); }],
    ['adoptPolicy', () => { const p = pick(Object.keys(E.POLICY)); const rep = pick(c.policies ?? []); return p && X.adoptPolicy(g, p, rnd() < 0.5 ? rep : undefined); }],
    ['dropPolicy', () => { const p = pick(c.policies ?? []); return p && X.dropPolicy(g, p); }],
    ['setGuidance', () => X.setGuidance(g, pick(Object.keys(X.GUIDANCE) as (keyof typeof X.GUIDANCE)[])!)],
    ['setOptionPay', () => X.setOptionPay(g, pick(X.OPTION_LEVELS)!)],
    ['lockInputs', () => X.lockInputs(g, rnd() < 0.5 ? 4 : 8)],
    ['openFranchise', () => { const city = pick(E.CITIES.filter((x) => (g.discovered[x.id] ?? 0) >= 1)); return city && X.openFranchise(g, city.id); }],
    ['takeLoan', () => { const o = pick(g.loanOffers); return o && F.takeLoan(g, o.id, o.max * (0.2 + rnd() * 0.8)); }],
    ['drawRevolver', () => F.drawRevolver(g, 100_000 + rnd() * 1e6)],
    ['repayLoan', () => { const l = pick(c.loans); return l && F.repayLoan(g, l.id, l.principal * rnd()); }],
    ['raiseEquity', () => (g.equityOffer && rnd() < 0.5 ? F.raiseEquity(g, 0.05 + rnd() * 0.25) : undefined)],
    ['startIPO', () => F.startIPO(g)],
    ['followOn', () => (rnd() < 0.2 ? F.followOn(g, 0.05 + rnd() * 0.1) : undefined)],
    ['buyBack', () => (rnd() < 0.3 ? F.buyBack(g, Math.max(0, c.books.cash) * rnd() * 0.3) : undefined)],
    ['improveRelations', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.improveRelations(g, r.id); }],
    ['proposeTruce', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.proposeTruce(g, r.id); }],
    ['proposeAlliance', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.proposeAlliance(g, r.id); }],
    ['poachTalent', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.poachTalent(g, r.id); }],
    ['sueRival', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.sueRival(g, r.id); }],
    ['lobbyAgainst', () => { const r = pick(g.rivals.filter((x) => x.alive)); return r && R.lobbyAgainst(g, r.id); }],
    ['bidForRival', () => { if (rnd() < 0.7) return; const r = pick(g.rivals.filter((x) => x.alive)); return r && R.bidForRival(g, r.id, rnd() < 0.5); }],
  ];
  const n = 2 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const [name, fn] = pick(acts)!;
    const before = JSON.stringify(c.books);
    const beforeFull = equityCheck(g);
    let res: E.ActionResult | void | '' | undefined;
    try {
      res = fn();
    } catch (e) {
      flag(`action threw: ${name}`, String((e as Error).stack).slice(0, 400), where);
      continue;
    }
    if (res) {
      checkText(res.msg, `action msg ${name}`, where);
      actionMsgs.set(`${name}|${res.ok}|${res.msg.replace(/[\d.,$KMB%−-]+/g, '#')}`, res.msg);
      if (!res.ok && !['poachTalent', 'bidForRival', 'sueRival', 'lobbyAgainst'].includes(name) && JSON.stringify(c.books) !== before) flag(`failed action changed the books: ${name}`, res.msg, where);
    }
    const after = equityCheck(g);
    if (Math.abs(after - beforeFull) > Math.max(5, Math.abs(E.totalAssets(c.books)) * 1e-7)) flag(`action unbalanced books: ${name}`, `${beforeFull} -> ${after}`, where);
    const nf = findBad(g);
    if (nf.length) flag(`non-finite after action ${name}`, nf.slice(0, 3).join(','), where);
  }
}

function answerEvents(g: GameState, rnd: () => number, where: string) {
  for (const pe of g.queue.slice()) {
    if (g.status !== 'playing' && !g.continued) break; // a card ended the game
    const def = E.EVENT[pe.id];
    const ok = def.opts.map((o, i) => (E.evalCond(g, o.req, pe.ctx) ? i : -1)).filter((i) => i >= 0);
    if (!ok.length) continue;
    const before = equityCheck(g);
    try {
      const r = E.resolveEvent(g, pe.uid, ok[Math.floor(rnd() * ok.length)]);
      if (!r) flag('resolveEvent returned null for an enabled option', pe.id, where);
      else { checkText(r.text, 'event result', where); for (const e of r.effects) checkText(e, 'event effect', where); }
    } catch (e) {
      flag(`resolveEvent threw: ${pe.id}`, String((e as Error).stack).slice(0, 300), where);
    }
    const after = equityCheck(g);
    if (Math.abs(after - before) > Math.max(5, Math.abs(E.totalAssets(g.company.books)) * 1e-7)) flag(`event unbalanced books: ${pe.id}`, `${before} -> ${after}`, where);
  }
}

interface Job { id: string; make: () => GameState; bot: string; turns: number }
const jobs: Job[] = [];
const DIFFS = ['easy', 'normal', 'hard', 'brutal'] as const;
const inds = E.IND_LIST.map((i) => i.id);
const seeds = QUICK ? 1 : 2;
for (const ind of inds) {
  const cities = E.CITIES.filter((c) => c.ind[ind] >= 1);
  for (const d of DIFFS) for (let k = 0; k < seeds; k++) for (const bot of ['chaos', 'steady', 'blitz', 'premium', 'leveraged']) {
    const city = cities[(k * 3 + DIFFS.indexOf(d)) % cities.length].id;
    const founder = E.FOUNDERS[(k + DIFFS.indexOf(d) + bot.length) % E.FOUNDERS.length].id;
    for (const mode of ['full', 'sprint', 'sandbox', 'ironman'] as const) {
      if (bot !== 'chaos' && mode === 'ironman') continue;
      jobs.push({
        id: `${ind}/${d}/${bot}/${mode}/s${k}`, bot, turns: mode === 'sprint' ? 40 : 100,
        make: () => E.newGame({ name: 'Playtest Co', industry: ind, city, founder, difficulty: d, seed: `pt-${ind}-${d}-${k}-${mode}`, mode: mode === 'sandbox' ? 'sandbox' : 'standard', sprint: mode === 'sprint', ironman: mode === 'ironman' }),
      });
    }
  }
}
for (const date of ['2026-11-18', '2026-01-01', '2027-02-28', '2026-07-04']) for (const bot of ['chaos', 'steady']) jobs.push({ id: `daily/${date}/${bot}`, bot, turns: 40, make: () => E.newGame(E.dailyOpts(date, 'Daily Co')) });
for (const s of E.SCENARIOS) for (const brutal of [false, true]) for (const bot of ['chaos', 'steady', 'blitz']) jobs.push({ id: `scenario/${s.id}/${brutal ? 'brutal' : 'std'}/${bot}`, bot, turns: 200, make: () => E.startScenario(s.id, 'Scenario Co', { brutal }) });

const stats: Record<string, unknown>[] = [];
let done = 0;
const t0 = Date.now();
for (const job of jobs) {
  const rnd = mkRng(E.hashSeed(job.id));
  let g: GameState;
  try { g = job.make(); } catch (e) { flag('newGame threw', String(e), job.id); continue; }
  checkState(g, `${job.id}@T0`);
  let prevVal = g.company.valuation;
  let peakHead = 0, maxPrice = 0, minPrice = 9, eventsSeen = 0, delegated = 0, winsKept = 0;
  const startRev = E.ttm(g.company, (q) => q.pnl.revenue);
  let saveChecked = false;
  try {
    while (g.turn < job.turns && (g.status === 'playing' || g.continued)) {
      const where = `${job.id}@T${g.turn}`;
      eventsSeen += g.queue.length;
      delegated += g.report?.delegated?.length ?? 0;
      if (job.bot === 'chaos') { answerEvents(g, rnd, where); chaos(g, rnd, where); }
      else botTurn(g, BOTS[job.bot]);
      if (g.status !== 'playing' && !g.continued) break;
      // forecast must not mutate state
      if (g.turn % 7 === 3) {
        const snap = JSON.stringify(g);
        try { E.forecastQuarter(g); } catch (e) { flag('forecast threw', String(e), where); }
        if (JSON.stringify(g) !== snap) flag('forecast mutated state', '', where);
      }
      // save round trip determinism once per game
      if (!saveChecked && g.turn === 13) {
        saveChecked = true;
        const copy = E.fromSaveFile(JSON.stringify(E.toSaveFile(g)));
        const a = structuredClone(g);
        for (let i = 0; i < 3; i++) { E.endTurn(a); E.endTurn(copy); }
        const strip = (x: GameState) => JSON.stringify({ ...x, created: 0, id: '' });
        const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([p], [q]) => (p < q ? -1 : 1))) : v));
        if (canon(JSON.parse(strip(a))) !== canon(JSON.parse(strip(copy)))) flag('save/load round trip diverges', '', where);
      }
      E.endTurn(g);
      checkState(g, `${job.id}@T${g.turn}`, prevVal);
      prevVal = g.company.valuation;
      for (const o of g.company.offices) { const p = E.priceIndex(g, o); maxPrice = Math.max(maxPrice, p); minPrice = Math.min(minPrice, p); }
      peakHead = Math.max(peakHead, g.company.quarters[g.company.quarters.length - 1]?.headcount ?? 0);
      if (g.status === 'won' && !g.continued && job.bot === 'chaos' && rnd() < 0.5 && g.turn < job.turns - 4) { E.keepPlaying(g); winsKept++; }
      // grade sanity at end
    }
  } catch (e) {
    flag(`engine threw during play`, String((e as Error).stack).slice(0, 500), `${job.id}@T${g.turn}`);
  }
  const how = g.outcome?.how ?? (g.status === 'playing' ? 'unfinished' : g.status);
  const key = job.id.split('/').slice(0, 1).join('/') + '/' + (job.id.includes('sprint') ? 'sprint' : job.id.split('/')[0] === 'scenario' ? 'scen' : 'full');
  const m = ends.get(key) ?? new Map();
  m.set(`${g.status}:${how}${g.outcome?.grade ? ':' + g.outcome.grade : ''}`, (m.get(`${g.status}:${how}${g.outcome?.grade ? ':' + g.outcome.grade : ''}`) ?? 0) + 1);
  ends.set(key, m);
  if (g.outcome) { checkText(g.outcome.title, 'outcome title', job.id); checkText(g.outcome.text, 'outcome text', job.id); }
  try {
    const st = E.scenarioStatus(g);
    if (st) { for (const v of Object.values(st)) if (typeof v === 'string') checkText(v, 'scenario status', job.id); }
    const vs = E.victoryStatus(g);
    for (const v of vs) for (const val of Object.values(v)) if (typeof val === 'string') checkText(val, 'victory status', job.id);
    if (g.status !== 'playing' && g.rules.daily) { const code = E.scoreCode(g); const back = E.readScoreCode(code); if (!back) flag('score code does not read back', code, job.id); }
    const ad = E.advise(g); for (const a of ad) checkText(a.text, 'advisor (end)', job.id);
  } catch (e) { flag('end-of-game view threw', String((e as Error).stack).slice(0, 300), job.id); }
  stats.push({ id: job.id, status: g.status, how, grade: g.outcome?.grade, turn: g.turn, val: Math.round(g.company.valuation), startRev: Math.round(startRev), rev: Math.round(E.ttm(g.company, (q) => q.pnl.revenue)), offices: g.company.offices.length, peakHead, minPrice: +minPrice.toFixed(2), maxPrice: +maxPrice.toFixed(2), rivalsAlive: g.rivals.filter((r) => r.alive).length, rivals: g.rivals.length, eventsSeen, delegated, winsKept, divisions: g.company.divisions.length, isPublic: g.company.cap.isPublic, stake: +(g.company.cap.founder / g.company.cap.shares).toFixed(3) });
  done++;
  if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}

const out = {
  jobs: jobs.length,
  issues: [...issues.entries()].sort((a, b) => b[1].count - a[1].count).map(([k, v]) => ({ kind: k, count: v.count, games: v.games.size, example: v.example })),
  ends: Object.fromEntries([...ends.entries()].map(([k, v]) => [k, Object.fromEntries([...v.entries()].sort((a, b) => b[1] - a[1]))])),
  eventTexts: [...eventTexts.values()],
  actionMsgs: [...actionMsgs.values()],
  stats,
};
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
const list = (m: Map<string, Issue>) => [...m.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`${jobs.length} games in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${issues.size ? `${issues.size} kinds of problem` : 'no problems'}.`);
for (const [k, v] of list(issues)) console.log(`- [${v.count}×, ${v.games.size} games] ${k} :: ${v.example.slice(0, 300)}`);
if (notes.size) console.log('\nWorth a look (not failures):');
for (const [k, v] of list(notes)) console.log(`- [${v.count}×, ${v.games.size} games] ${k} :: ${v.example.slice(0, 200)}`);
if (issues.size) process.exit(1);
