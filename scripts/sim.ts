// Headless AI-vs-AI balance harness.
//   npm run sim                         full grid, writes docs/balance.md
//   npm run sim:ci                      reduced grid for CI: fails on red flags, writes nothing
//   npm run sim -- --seeds 4 --turns 60 --bots steady,blitz --diff normal,brutal --ind saas,mfg --no-write
// Each game pits one scripted player bot against the rival AIs on a given difficulty, industry, founder
// and seed. Games run in parallel on every core. The report covers win rates, how games end, which
// victories are reached and by whom, pacing, and red flags that would make the game degenerate.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { BOTS, botTurn } from '../engine/src/bots';
import { CITIES, DIFF, FOUNDERS, IND_LIST, INDUSTRIES, endTurn, founderStake, globalShare, money, newGame, ttm, type Difficulty, type GameState, type IndustryId } from '../engine/src/index';

interface Job { bot: string; diff: Difficulty; ind: IndustryId; k: number; turns: number }
interface Result {
  bot: string; diff: Difficulty; ind: IndustryId; founder: string; seed: string; status: string; how: string; turn: number; valuation: number; stake: number; peakRev: number;
  share: number; rivalsLeft: number; raised: number; quarters: number; decisionQuarters: number; grade: string;
}

const HONEST = ['steady', 'blitz', 'premium', 'leveraged'];
const PROBES = ['gouge', 'flipper', 'warmonger', 'raider', 'empire'];

function cityFor(ind: IndustryId, k: number): string {
  const good = CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id));
  return good[k % good.length].id;
}

function playOne({ bot, diff, ind, k, turns }: Job): Result {
  const seed = `bal-${ind}-${k}`;
  const founder = FOUNDERS[k % FOUNDERS.length].id;
  const g: GameState = newGame({ name: bot, industry: ind, city: cityFor(ind, k), founder, difficulty: diff, seed, mode: 'standard' });
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
    bot, diff, ind, founder, seed, status: g.status, how: g.outcome?.how ?? 'unfinished', turn: g.turn, valuation: c.valuation, stake: founderStake(c) * c.valuation, peakRev,
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
  const files = [...walk(join(root, 'engine/src')), ...walk(join(root, 'data')).filter((f) => f.endsWith('.json') && !f.includes('schemas')), join(root, 'scripts/sim.ts')].sort();
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
    const report = readFileSync(new URL('../docs/balance.md', import.meta.url), 'utf8');
    const recorded = /fingerprint: ([0-9a-f]+)/.exec(report)?.[1];
    const now = fingerprint();
    if (recorded !== now) {
      console.error(`docs/balance.md is out of date (recorded ${recorded ?? 'none'}, now ${now}). The engine, content or harness changed: run \`npm run sim\` and commit the report.`);
      process.exitCode = 1;
    } else console.log(`docs/balance.md is up to date (${now}).`);
    return;
  }
  const CI = args.includes('--ci');
  const TURNS = Number(opt('turns', '100'));
  const SEEDS = Number(opt('seeds', CI ? '3' : '6'));
  const BOT_IDS = opt('bots', Object.keys(BOTS).join(',')).split(',');
  const DIFFS = opt('diff', 'easy,normal,hard,brutal').split(',') as Difficulty[];
  const INDS = opt('ind', IND_LIST.map((i) => i.id).join(',')).split(',') as IndustryId[];
  const WRITE = !args.includes('--no-write') && !CI;

  const t0 = Date.now();
  const jobs: Job[] = [];
  for (const diff of DIFFS) for (const bot of BOT_IDS) for (const ind of INDS) for (let k = 0; k < SEEDS; k++) jobs.push({ bot, diff, ind, k, turns: TURNS });
  const results = await runAll(jobs);
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
  const VICTORIES = ['marketCap', 'dominance', 'ipo', 'innovation', 'reputation', 'lastStanding', 'time'];
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
  const TIER_BAND: Record<string, [number, number]> = { gentle: [0.75, 1], tough: [0.35, 0.8], expert: [0.05, 0.5] };
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

  // ── tables
  const fmtMap = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${VNAME[k] ?? k} ${v}`).join(', ') || '—';
  const table = [
    '| Difficulty | Bot | Win | Bankrupt | Other loss | Median value | Median founder stake | Median win | Wins by | Losses by |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.diff} | ${BOTS[r.bot].name} | ${pct(r.win)} | ${pct(r.bankrupt)} | ${pct(r.otherLoss)} | ${money(r.medVal)} | ${money(r.medStake)} | ${year(r.medTurn)} | ${fmtMap(r.wins)} | ${fmtMap(r.losses)} |`),
  ].join('\n');

  const byInd = INDS.length > 1 ? ['\n## By industry (honest strategies)\n', `| Industry | Label | ${DIFFS.join(' | ')} | All: win | All: bankrupt | Median peak revenue |`, `| --- | --- | ${DIFFS.map(() => '---').join(' | ')} | --- | --- | --- |`,
    ...INDS.map((ind) => {
      const rs = honestRs.filter((r) => r.ind === ind);
      return `| ${ind} | ${INDUSTRIES[ind].tier} | ${DIFFS.map((d) => pct(rate(rs.filter((r) => r.diff === d), won))).join(' | ')} | ${pct(rate(rs, won))} | ${pct(rate(rs, (r) => r.how === 'bankrupt'))} | ${money(median(rs.map((r) => r.peakRev)))} |`;
    }),
    gaps.length ? `\nMore than 20 points behind SaaS (the review's target for later work): ${gaps.map((i) => `${i} ${pct(indWin(i))}`).join(', ')}.` : ''].join('\n') : '';

  const founders = [...new Set(results.map((r) => r.founder))];
  const byFounder = ['\n## By founder (honest strategies, all difficulties)\n', '| Founder | Games | Win | Bankrupt | Median founder stake |', '| --- | --- | --- | --- | --- |',
    ...founders.map((f) => {
      const rs = honestRs.filter((r) => r.founder === f);
      return `| ${FOUNDERS.find((x) => x.id === f)?.name ?? f} | ${rs.length} | ${pct(rate(rs, won))} | ${pct(rate(rs, (r) => r.how === 'bankrupt'))} | ${money(median(rs.map((r) => r.stake)))} |`;
    })].join('\n');

  const byVictory = ['\n## By victory\n', 'Share of games that ended with each victory. A probe reaching a victory more often than honest play is a shortcut.\n',
    `| Victory | Honest | ${PROBES.filter((b) => BOT_IDS.includes(b)).map((b) => BOTS[b].name).join(' | ')} | Median year (honest) |`, `| --- | --- | ${PROBES.filter((b) => BOT_IDS.includes(b)).map(() => '---').join(' | ')} | --- |`,
    ...VICTORIES.map((v) => `| ${VNAME[v]} | ${pct(vRate(honestRs, v))} | ${PROBES.filter((b) => BOT_IDS.includes(b)).map((b) => pct(vRate(results.filter((r) => r.bot === b), v))).join(' | ')} | ${year(median(honestRs.filter((r) => won(r) && r.how === v).map((r) => r.turn)))} |`)].join('\n');

  const grades = honestRs.filter((r) => r.grade);
  const byGrade = grades.length ? ['\n## Grades at the end (honest strategies)\n', '| Grade | Share |', '| --- | --- |',
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((gr) => `| ${gr} | ${pct(grades.filter((r) => r.grade === gr).length / grades.length)} |`)].join('\n') : '';

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

Generated by \`npm run sim\` (scripts/sim.ts): ${results.length} games, ${TURNS} quarters each, ${SEEDS} seeds per cell,
industries: ${INDS.join(', ')}. Took ${secs.toFixed(0)} s.
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
${byGrade}
${pacing}

## Red flags

${flags.length ? flags.map((f) => '- ' + f).join('\n') : 'None. No probe strategy beats honest play overall or on any single victory, doing nothing never wins, every victory is reachable, every industry is as hard as its label says, and difficulty levels are ordered.'}
`;
  console.log(report);
  if (WRITE) writeFileSync(new URL('../docs/balance.md', import.meta.url), report);
  process.exitCode = flags.length ? 1 : 0;
}
