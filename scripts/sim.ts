// Headless AI-vs-AI balance harness.
//   npm run sim                         full grid, writes docs/balance.md
//   npm run sim -- --sprint             the same for ten-year Sprint games, writes docs/balance-sprint.md
//   npm run sim:ci                      reduced grid for CI: fails on red flags, writes nothing
//   npm run sim:check                   fails if the committed reports are stale or list any red flag
//   npm run sim -- --seeds 4 --turns 60 --bots steady,blitz --diff normal,brutal --ind saas,mfg --no-write
// Each game pits one scripted player bot against the rival AIs on a given difficulty, industry, founder
// and seed. Games run in parallel on every core. The report covers win rates, how games end, which
// victories are reached and by whom, pacing, and red flags that would make the game degenerate. The full runs also
// write data/winrates.json: honest win rates by industry and difficulty, which the difficulty cards show.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { BOTS, botTurn } from '../engine/src/bots';
import { fmt } from './fmt-json.mjs';
import { CITIES, DIFF, FOUNDERS, IND_LIST, INDUSTRIES, SPRINT_OFF, endTurn, founderStake, globalShare, money, newGame, ttm, type Difficulty, type GameState, type IndustryId } from '../engine/src/index';

interface Job { bot: string; diff: Difficulty; ind: IndustryId; k: number; f: number; turns: number; sprint?: boolean; paired?: boolean }
interface Result {
  bot: string; diff: Difficulty; ind: IndustryId; founder: string; seed: string; paired?: boolean; status: string; how: string; turn: number; valuation: number; stake: number; peakRev: number;
  share: number; rivalsLeft: number; raised: number; quarters: number; decisionQuarters: number; grade: string;
}

const HONEST = ['steady', 'blitz', 'premium', 'leveraged'];
const PROBES = ['gouge', 'flipper', 'warmonger', 'raider', 'empire'];
/** The most the strongest founder may out-win the weakest, on identical games. */
const FOUNDER_RANGE = 0.12;

function cityFor(ind: IndustryId, k: number): string {
  const good = CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id));
  return good[k % good.length].id;
}

function playOne({ bot, diff, ind, k, f, turns, sprint, paired }: Job): Result {
  const seed = `bal-${ind}-${k}`;
  const founder = FOUNDERS[f].id;
  const g: GameState = newGame({ name: bot, industry: ind, city: cityFor(ind, k), founder, difficulty: diff, seed, mode: 'standard', sprint });
  g.maxTurns = Math.min(g.maxTurns, turns);
  let peakRev = 0, quarters = 0, decisionQuarters = 0;
  while (g.status === 'playing' && g.turn < turns) {
    quarters++;
    if (g.queue.length) decisionQuarters++;
    botTurn(g, BOTS[bot]);
    if (g.status !== 'playing') break;
    endTurn(g);
    peakRev = Math.max(peakRev, ttm(g.company, (q) => q.pnl.revenue));
  }
  const c = g.company;
  return {
    bot, diff, ind, founder, seed, paired, status: g.status, how: g.outcome?.how ?? 'unfinished', turn: g.turn, valuation: c.valuation, stake: founderStake(c) * c.valuation, peakRev,
    share: globalShare(g, ind), rivalsLeft: g.rivals.filter((r) => r.alive).length, raised: g.counters.equityRaised ?? 0, quarters, decisionQuarters,
    grade: g.outcome?.grade ?? '',
  };
}

/**
 * A hash of everything that can change balance: the engine, the content and this harness. The report
 * records it, and `npm run sim -- --check` fails when it no longer matches, so a pull request that
 * changes balance has to regenerate docs/balance.md.
 */
function fingerprint(): string {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  // data/winrates.json is written by this harness, so it cannot be part of what the harness measures
  const files = [...walk(join(root, 'engine/src')), ...walk(join(root, 'data')).filter((f) => f.endsWith('.json') && !f.includes('schemas') && !f.endsWith('winrates.json')), join(root, 'scripts/sim.ts')].sort();
  const h = createHash('sha1');
  for (const f of files) h.update(f.slice(root.length)).update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  return h.digest('hex').slice(0, 16);
}

// ── worker side: play the jobs handed over and send the results back
if (!isMainThread) {
  const jobs = workerData as Job[];
  parentPort!.postMessage(jobs.map(playOne));
} else {
  await main();
}

async function runAll(jobs: Job[]): Promise<Result[]> {
  const n = Math.max(1, Math.min(availableParallelism(), Number(opt('workers', '0')) || availableParallelism(), jobs.length));
  if (n === 1) return jobs.map(playOne);
  const chunks: Job[][] = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => chunks[i % n].push(j)); // interleave so every worker gets a mix of slow and fast games
  const parts = await Promise.all(chunks.map((chunk) => new Promise<Result[]>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: chunk, execArgv: process.execArgv });
    w.once('message', resolve);
    w.once('error', reject);
  })));
  return parts.flat();
}

function opt(k: string, d: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    // the committed reports must match this engine and content, and must not list a red flag (the reduced CI run
    // is too small to judge every industry and difficulty, so the full reports are the ones held to account)
    const now = fingerprint();
    const problems: string[] = [];
    for (const [file, cmd] of [['balance.md', 'npm run sim'], ['balance-sprint.md', 'npm run sim -- --sprint']]) {
      const report = readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8');
      const recorded = /fingerprint: ([0-9a-f]+)/.exec(report)?.[1];
      if (recorded !== now) problems.push(`docs/${file} is out of date (recorded ${recorded ?? 'none'}, now ${now}). The engine, content or harness changed: run \`${cmd}\` and commit the report.`);
      const flags = report.slice(report.indexOf('## Red flags'));
      if (!/## Red flags\s+None\./.test(flags)) problems.push(`docs/${file} lists red flags: fix them, then regenerate the report.`);
    }
    const rates = JSON.parse(readFileSync(new URL('../data/winrates.json', import.meta.url), 'utf8')) as Record<string, { fingerprint?: string }>;
    for (const k of ['full', 'sprint']) if (rates[k]?.fingerprint !== now) problems.push(`data/winrates.json (${k}) is out of date: it is written by the same runs as the reports.`);
    if (problems.length) {
      for (const p of problems) console.error(p);
      process.exitCode = 1;
    } else console.log(`docs/balance.md, docs/balance-sprint.md and data/winrates.json are up to date (${now}), with no red flags.`);
    return;
  }
  const CI = args.includes('--ci');
  const SPRINT = args.includes('--sprint');
  const TURNS = SPRINT ? 40 : Number(opt('turns', '100'));
  const SEEDS = Number(opt('seeds', CI ? '3' : '12'));
  const BOT_IDS = opt('bots', Object.keys(BOTS).join(',')).split(',');
  const DIFFS = opt('diff', 'easy,normal,hard,brutal').split(',') as Difficulty[];
  const INDS = opt('ind', IND_LIST.map((i) => i.id).join(',')).split(',') as IndustryId[];
  const WRITE = !args.includes('--no-write') && !CI;

  const t0 = Date.now();
  const jobs: Job[] = [];
  // Founders rotate across seeds, industries and strategies, so each plays an even mix of cities and luck
  // (tying a founder to a seed number would credit the founder with that seed's city and luck).
  const allBots = Object.keys(BOTS), allInds = IND_LIST.map((i) => i.id);
  for (const diff of DIFFS) for (const bot of BOT_IDS) for (const ind of INDS) for (let k = 0; k < SEEDS; k++) {
    jobs.push({ bot, diff, ind, k, f: (k + 3 * allBots.indexOf(bot) + allInds.indexOf(ind)) % FOUNDERS.length, turns: TURNS, sprint: SPRINT });
  }
  // Founders, paired: every founder plays exactly the same games (seed, city, strategy, difficulty), so the
  // difference between them is the founder and nothing else. Full runs only; the main grid gives each founder an
  // even mix of seeds, but with about 170 games each its founder table carries several points of sampling noise.
  const FSEEDS = Number(opt('founder-seeds', '3'));
  const PAIRED = !CI && !args.includes('--no-founders') && DIFFS.length === 4 && INDS.length === IND_LIST.length && FSEEDS > 0;
  if (PAIRED) {
    for (const diff of DIFFS) for (const bot of HONEST) for (const ind of INDS) for (let k = 0; k < FSEEDS; k++) for (let f = 0; f < FOUNDERS.length; f++) {
      jobs.push({ bot, diff, ind, k: 100 + k, f, turns: TURNS, sprint: SPRINT, paired: true });
    }
  }
  const all = await runAll(jobs);
  const pairedRs = all.filter((r) => r.paired);
  const results = all.filter((r) => !r.paired);
  const secs = (Date.now() - t0) / 1000;

  const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const pct = (x: number) => (isFinite(x) ? `${Math.round(x * 100)}%` : '—');
  const rate = (rs: Result[], f: (r: Result) => boolean) => (rs.length ? rs.filter(f).length / rs.length : NaN);
  const won = (r: Result) => r.status === 'won';
  const year = (t: number) => (t ? 'Y' + (1 + Math.floor(t / 4)) : '—');
  // a Sprint does not offer every victory (SPRINT_OFF): those are left out of its checks and marked in its tables
  const offered = (v: string) => !SPRINT || !(SPRINT_OFF as readonly string[]).includes(v);
  const VICTORIES = ['marketCap', 'dominance', 'ipo', 'innovation', 'reputation', 'lastStanding', 'time'].filter(offered);
  const VNAME: Record<string, string> = { marketCap: 'Titan', dominance: 'Category king', ipo: 'Blue chip', innovation: 'Pioneer', reputation: 'Good company', lastStanding: 'Last one standing', time: 'Graded A or B at the end', outlasted: 'Graded C–F at the end' };

  // ── main table
  const LOSS = ['bankrupt', 'sold', 'takeover', 'ousted', 'outlasted'];
  interface Row { bot: string; diff: Difficulty; n: number; win: number; bankrupt: number; otherLoss: number; medVal: number; medStake: number; medTurn: number; wins: Record<string, number>; losses: Record<string, number> }
  const rows: Row[] = [];
  for (const diff of DIFFS) for (const bot of BOT_IDS) {
    const rs = results.filter((r) => r.bot === bot && r.diff === diff);
    const wins: Record<string, number> = {}, losses: Record<string, number> = {};
    for (const r of rs) {
      if (won(r)) wins[r.how] = (wins[r.how] ?? 0) + 1;
      else if (LOSS.includes(r.how)) losses[r.how] = (losses[r.how] ?? 0) + 1;
    }
    rows.push({
      bot, diff, n: rs.length, win: rate(rs, won), bankrupt: rate(rs, (r) => r.how === 'bankrupt'), otherLoss: rate(rs, (r) => r.status === 'lost' && r.how !== 'bankrupt'),
      medVal: median(rs.map((r) => r.valuation)), medStake: median(rs.map((r) => r.stake)), medTurn: median(rs.filter(won).map((r) => r.turn)),
      wins, losses,
    });
  }
  const row = (bot: string, diff: Difficulty) => rows.find((r) => r.bot === bot && r.diff === diff);
  const bestHonest = (diff: Difficulty) => Math.max(...HONEST.filter((b) => BOT_IDS.includes(b)).map((b) => row(b, diff)?.win ?? 0));

  // ── red flags
  const flags: string[] = [];
  for (const diff of DIFFS) {
    const best = bestHonest(diff);
    const p = row('passive', diff);
    if (p && p.win > 0) flags.push(`Passive bot won ${pct(p.win)} on ${diff}: doing nothing should never win.`);
    for (const probe of PROBES) {
      const r = row(probe, diff);
      if (r && r.win > best + 0.15 && r.win > 0.3) flags.push(`Probe "${probe}" wins ${pct(r.win)} on ${diff}, well above the best honest strategy (${pct(best)}).`);
    }
    if (diff === 'brutal' && best > 0.8) flags.push(`Brutal is too easy: best strategy wins ${pct(best)}.`);
    if (diff === 'easy' && best < (CI ? 0.65 : 0.8) && TURNS >= 80) flags.push(`Easy is too hard: the best strategy wins only ${pct(best)} (target: 80% or more).`);
  }
  const order = DIFFS.map(bestHonest);
  for (let i = 1; i < order.length; i++) if (order[i] > order[i - 1] + 0.2) flags.push(`${DIFFS[i]} is easier than ${DIFFS[i - 1]} for the best strategy.`);

  // goal shortcuts: a probe reaching a victory more often than honest play does, or a victory nobody reaches
  const honestRs = results.filter((r) => HONEST.includes(r.bot));
  const vRate = (rs: Result[], v: string) => rate(rs, (r) => won(r) && r.how === v);
  for (const v of VICTORIES) {
    const h = vRate(honestRs, v);
    for (const probe of PROBES.filter((b) => BOT_IDS.includes(b))) {
      const prs = results.filter((r) => r.bot === probe);
      const pv = vRate(prs, v);
      const count = prs.filter((r) => won(r) && r.how === v).length;
      // the CI run is a third the size of the full one, so it allows for sampling noise and catches only clear shortcuts
      if (count >= (CI ? 4 : 4) && pv > (CI ? h * 1.4 + 0.04 : h * 1.25 + 0.01)) flags.push(`Probe "${probe}" reaches ${VNAME[v]} in ${pct(pv)} of its games, more often than honest play (${pct(h)}).`);
    }
    if (!CI && v !== 'time' && honestRs.length >= 200 && !results.some((r) => won(r) && r.how === v)) flags.push(`Nobody ever wins ${VNAME[v]}: it is a dead goal.`);
  }
  // industries: an honest player should have a fair chance whatever they pick
  const indWin = (ind: IndustryId) => rate(honestRs.filter((r) => r.ind === ind), won);
  // each industry carries a difficulty label the player sees when choosing (Gentle, Tough, Expert); it must stay true
  const TIER_BAND: Record<string, [number, number]> = { gentle: [0.7, 1], tough: [0.35, 0.8], expert: [0.25, 0.65] };
  const slack = CI ? 0.15 : 0; // about 45 games per industry in the CI run: two standard errors
  if (DIFFS.length === 4) {
    for (const ind of INDS) {
      const tier = INDUSTRIES[ind].tier;
      const [lo, hi] = TIER_BAND[tier];
      const w = indWin(ind);
      if (w < lo - slack || w > hi + slack) flags.push(`${ind} is labelled ${tier} but honest strategies win ${pct(w)} of its games (a ${tier} industry should be ${pct(lo)}–${pct(hi)}).`);
    }
  }
  // the review's aim: every industry within about 20 points of SaaS. Reported, not yet enforced (see docs/review-response.md).
  const gaps = INDS.includes('saas') ? INDS.filter((ind) => ind !== 'saas' && indWin('saas') - indWin(ind) > 0.2) : [];

  // every industry on every difficulty: whatever the label says, a strong plan has to win sometimes. The best honest
  // strategy in each cell must reach the floor for its difficulty. (The CI run has three games per strategy per cell,
  // too few to judge that, so it only checks that honest play wins at all on Easy and Normal; \`sim:check\` holds the
  // full reports to the floors.)
  const CELL_FLOOR: Record<Difficulty, number> = { easy: 0.5, normal: 0.3, hard: 0.2, brutal: 0.15 };
  const cell = (ind: IndustryId, d: Difficulty) => honestRs.filter((r) => r.ind === ind && r.diff === d);
  const bestInCell = (ind: IndustryId, d: Difficulty) => Math.max(0, ...HONEST.filter((b) => BOT_IDS.includes(b)).map((b) => rate(cell(ind, d).filter((r) => r.bot === b), won) || 0));
  for (const ind of INDS) for (const d of DIFFS) {
    if (CI) {
      if ((d === 'easy' || d === 'normal') && cell(ind, d).length >= 8 && !cell(ind, d).some(won)) flags.push(`${ind} on ${d}: honest play never won.`);
    } else if (SEEDS >= 8 && bestInCell(ind, d) < CELL_FLOOR[d]) {
      flags.push(`${ind} on ${d}: the best honest strategy wins only ${pct(bestInCell(ind, d))} (a strong plan should win at least ${pct(CELL_FLOOR[d])} on ${d}, whatever the industry's label).`);
    }
  }

  // founders: a background changes how you play, not whether you can win (paired games, so this is the founder alone)
  if (PAIRED) {
    const ws = FOUNDERS.map((f) => [f.name, rate(pairedRs.filter((r) => r.founder === f.id), won)] as const).sort((a, b) => a[1] - b[1]);
    const [lo, hi] = [ws[0], ws[ws.length - 1]];
    if (hi[1] - lo[1] > FOUNDER_RANGE) flags.push(`Founders are unbalanced: ${hi[0]} wins ${pct(hi[1])} of identical games, ${lo[0]} ${pct(lo[1])} (the gap should stay within ${Math.round(FOUNDER_RANGE * 100)} points).`);
  }

  // every victory has to be a plan a player could follow, not a curiosity: on at least one difficulty, some honest
  // strategy must end a fair share of its games with it. (Victories compete, as the first one reached ends the game,
  // so a goal that is always beaten to the line by another is as dead as one nobody can reach.)
  const VICTORY_FLOOR = 0.1;
  const vByDiff = (v: string, d: Difficulty) => vRate(honestRs.filter((r) => r.diff === d), v);
  const vBest = (v: string) => {
    let best = { rate: 0, bot: '', diff: '' as Difficulty | '' };
    for (const d of DIFFS) for (const b of HONEST.filter((x) => BOT_IDS.includes(x))) {
      const r = vRate(honestRs.filter((x) => x.diff === d && x.bot === b), v) || 0;
      if (r > best.rate) best = { rate: r, bot: b, diff: d };
    }
    return best;
  };
  if (!CI && DIFFS.length === 4 && INDS.length >= 5) {
    for (const v of VICTORIES.filter((x) => x !== 'time')) {
      const best = vBest(v);
      if (best.rate < VICTORY_FLOOR) flags.push(`${VNAME[v]} is not a realistic plan: no honest strategy ends more than ${pct(best.rate)} of its games with it on any difficulty (needs ${pct(VICTORY_FLOOR)}).`);
    }
  }

  // ── tables
  const fmtMap = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${VNAME[k] ?? k} ${v}`).join(', ') || '—';
  const table = [
    '| Difficulty | Bot | Win | Bankrupt | Other loss | Median value | Median founder stake | Median win | Wins by | Losses by |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.diff} | ${BOTS[r.bot].name} | ${pct(r.win)} | ${pct(r.bankrupt)} | ${pct(r.otherLoss)} | ${money(r.medVal)} | ${money(r.medStake)} | ${year(r.medTurn)} | ${fmtMap(r.wins)} | ${fmtMap(r.losses)} |`),
  ].join('\n');

  const byInd = INDS.length > 1 ? ['\n## By industry (honest strategies)\n', 'Each difficulty shows the win rate of all honest strategies, then the best one in brackets. The best one must reach the floor for its difficulty: ' + DIFFS.map((d) => `${d} ${pct(CELL_FLOOR[d])}`).join(', ') + '.\n',
    `| Industry | Label | ${DIFFS.join(' | ')} | All: win | All: bankrupt | Median peak revenue |`, `| --- | --- | ${DIFFS.map(() => '---').join(' | ')} | --- | --- | --- |`,
    ...INDS.map((ind) => {
      const rs = honestRs.filter((r) => r.ind === ind);
      return `| ${ind} | ${INDUSTRIES[ind].tier} | ${DIFFS.map((d) => `${pct(rate(rs.filter((r) => r.diff === d), won))} (${pct(bestInCell(ind, d))})`).join(' | ')} | ${pct(rate(rs, won))} | ${pct(rate(rs, (r) => r.how === 'bankrupt'))} | ${money(median(rs.map((r) => r.peakRev)))} |`;
    }),
    gaps.length ? `\nMore than 20 points behind SaaS (the review's target for later work): ${gaps.map((i) => `${i} ${pct(indWin(i))}`).join(', ')}.` : ''].join('\n') : '';

  const founders = [...new Set(results.map((r) => r.founder))];
  const byFounder = ['\n## By founder (honest strategies, all difficulties)\n', '| Founder | Games | Win | Bankrupt | Median founder stake |', '| --- | --- | --- | --- | --- |',
    ...founders.map((f) => {
      const rs = honestRs.filter((r) => r.founder === f);
      return `| ${FOUNDERS.find((x) => x.id === f)?.name ?? f} | ${rs.length} | ${pct(rate(rs, won))} | ${pct(rate(rs, (r) => r.how === 'bankrupt'))} | ${money(median(rs.map((r) => r.stake)))} |`;
    })].join('\n');
  const pairedWin = (f: string) => rate(pairedRs.filter((r) => r.founder === f), won);
  const pairedAll = rate(pairedRs, won);
  const byFounderPaired = PAIRED ? ['\n### Founders on identical games\n', `Each founder plays the same ${pairedRs.length / FOUNDERS.length} games: ${FSEEDS} seeds of every industry, difficulty and honest strategy. The gap between the strongest and the weakest must stay within ${pct(FOUNDER_RANGE)}.\n`,
    '| Founder | Win | Against the average | Bankrupt | Median founder stake |', '| --- | --- | --- | --- | --- |',
    ...FOUNDERS.map((f) => {
      const rs = pairedRs.filter((r) => r.founder === f.id);
      const d = pairedWin(f.id) - pairedAll;
      return `| ${f.name} | ${pct(pairedWin(f.id))} | ${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))} pts | ${pct(rate(rs, (r) => r.how === 'bankrupt'))} | ${money(median(rs.map((r) => r.stake)))} |`;
    })].join('\n') : '';

  const byVictory = ['\n## By victory\n', 'Share of games that ended with each victory. A probe reaching a victory more often than honest play is a shortcut.' + (SPRINT ? ` A Sprint does not offer ${SPRINT_OFF.map((v) => VNAME[v]).join(', ')}.` : '') + '\n',
    `| Victory | Honest | ${PROBES.filter((b) => BOT_IDS.includes(b)).map((b) => BOTS[b].name).join(' | ')} | Median year (honest) |`, `| --- | --- | ${PROBES.filter((b) => BOT_IDS.includes(b)).map(() => '---').join(' | ')} | --- |`,
    ...VICTORIES.map((v) => `| ${VNAME[v]} | ${pct(vRate(honestRs, v))} | ${PROBES.filter((b) => BOT_IDS.includes(b)).map((b) => pct(vRate(results.filter((r) => r.bot === b), v))).join(' | ')} | ${year(median(honestRs.filter((r) => won(r) && r.how === v).map((r) => r.turn)))} |`),
    `\nHonest games by difficulty, and the strategy that reaches each victory most often. For every victory, some honest strategy must end at least ${pct(VICTORY_FLOOR)} of its games with it on some difficulty, so each is a plan a player could follow.\n`,
    `| Victory | ${DIFFS.join(' | ')} | Most often |`, `| --- | ${DIFFS.map(() => '---').join(' | ')} | --- |`,
    ...VICTORIES.map((v) => {
      const b = vBest(v);
      return `| ${VNAME[v]} | ${DIFFS.map((d) => pct(vByDiff(v, d))).join(' | ')} | ${b.bot ? `${BOTS[b.bot].name} on ${b.diff}, ${pct(b.rate)}` : '—'} |`;
    })].join('\n');

  const grades = honestRs.filter((r) => r.grade);
  const byGrade = grades.length ? ['\n## Grades at the end (honest strategies)\n', '| Grade | Share |', '| --- | --- |',
    ...['A', 'B', 'C', 'D', 'F'].map((gr) => `| ${gr} | ${pct(grades.filter((r) => r.grade === gr).length / grades.length)} |`)].join('\n') : '';

  const pace = honestRs.reduce((s, r) => s + r.decisionQuarters, 0) / Math.max(1, honestRs.reduce((s, r) => s + r.quarters, 0));
  const pacing = ['\n## Pacing (honest strategies)\n',
    `- Quarters that open with a decision card waiting: **${pct(pace)}** (target: under half, so fast-forward gets used).`,
    `- Median game length: **${year(median(honestRs.map((r) => r.turn)))}**; games that run the full ${TURNS / 4} years: **${pct(rate(honestRs, (r) => r.turn >= TURNS - 1))}**.`,
    `- Median winning year: **${year(median(honestRs.filter(won).map((r) => r.turn)))}**.`].join('\n');

  const targets = ['\n## Targets (decision 40)\n', '| Difficulty | Best honest strategy | Target | |', '| --- | --- | --- | --- |',
    ...DIFFS.map((d) => {
      const t = { easy: [0.8, 1], normal: [0.6, 0.9], hard: [0.4, 0.8], brutal: [0.15, 0.45] }[d];
      const b = bestHonest(d);
      return `| ${d} | ${pct(b)} | ${pct(t[0])}–${pct(t[1])} | ${b >= t[0] && b <= t[1] ? 'on target' : b < t[0] ? 'too hard' : 'too easy'} |`;
    })].join('\n');

  const report = `# Balance report

Generated by \`npm run sim${SPRINT ? ' -- --sprint' : ''}\` (scripts/sim.ts): ${results.length} ${SPRINT ? 'Sprint ' : ''}games, ${TURNS} quarters each, ${SEEDS} seeds per cell,
industries: ${INDS.join(', ')}${PAIRED ? `, plus ${pairedRs.length} paired founder games` : ''}. Took ${secs.toFixed(0)} s.
<!-- fingerprint: ${fingerprint()} -->

Each game is one scripted player against the rival AIs. Bots use only the actions a human has.
${Object.entries(BOTS).filter(([k]) => BOT_IDS.includes(k)).map(([, b]) => `- **${b.name}**: ${b.blurb}`).join('\n')}

Difficulty levels: ${DIFFS.map((d) => `${DIFF[d].label} — ${DIFF[d].expect}`).join(' ')}

## Results

${table}
${targets}
${byInd}
${byVictory}
${byFounder}
${byFounderPaired}
${byGrade}
${pacing}

## Red flags

${flags.length ? flags.map((f) => '- ' + f).join('\n') : 'None. No probe strategy beats honest play overall or on any single victory, doing nothing never wins, every victory is a realistic plan on some difficulty, every industry is as hard as its label says, a strong plan wins sometimes in every industry on every difficulty, and difficulty levels are ordered.'}
`;
  console.log(report);
  if (WRITE) writeFileSync(new URL(SPRINT ? '../docs/balance-sprint.md' : '../docs/balance.md', import.meta.url), report);
  // the difficulty cards show these: honest strategies by industry and difficulty, for the full game and for Sprints
  const fullGrid = DIFFS.length === 4 && INDS.length === IND_LIST.length && HONEST.every((b) => BOT_IDS.includes(b)) && SEEDS >= 8;
  if (WRITE && fullGrid) {
    const url = new URL('../data/winrates.json', import.meta.url);
    let all: Record<string, unknown> = {};
    try {
      all = JSON.parse(readFileSync(url, 'utf8'));
    } catch {
      /* first run */
    }
    const r2 = (x: number) => Math.round(x * 100) / 100;
    all[SPRINT ? 'sprint' : 'full'] = {
      fingerprint: fingerprint(), seeds: SEEDS,
      cells: Object.fromEntries(INDS.map((ind) => [ind, Object.fromEntries(DIFFS.map((d) => {
        const rs = cell(ind, d);
        return [d, { games: rs.length, win: r2(rate(rs, won)), bankrupt: r2(rate(rs, (r) => r.how === 'bankrupt')), best: r2(bestInCell(ind, d)) }];
      }))])),
    };
    writeFileSync(url, fmt({ full: all.full, sprint: all.sprint }) + '\n');
  }
  process.exitCode = flags.length ? 1 : 0;
}
