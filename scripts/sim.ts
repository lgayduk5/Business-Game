// Headless AI-vs-AI balance harness.
//   npm run sim                         default grid, writes docs/balance.md
//   npm run sim -- --seeds 4 --turns 60 --bots steady,blitz --diff normal,brutal --no-write
// Each game pits one scripted player bot against the rival AIs on a given difficulty,
// industry and seed, then reports win rates, outcomes and red flags.
import { writeFileSync } from 'node:fs';
import { BOTS, botTurn } from '../engine/src/bots';
import { CITIES, FOUNDERS, IND_LIST, endTurn, founderStake, globalShare, money, newGame, ttm, type Difficulty, type GameState, type IndustryId } from '../engine/src/index';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const TURNS = Number(opt('turns', '100'));
const SEEDS = Number(opt('seeds', '6'));
const BOT_IDS = opt('bots', Object.keys(BOTS).join(',')).split(',');
const DIFFS = opt('diff', 'easy,normal,hard,brutal').split(',') as Difficulty[];
const INDS = opt('ind', IND_LIST.map((i) => i.id).join(',')).split(',') as IndustryId[];
const WRITE = !args.includes('--no-write');

interface Result { bot: string; diff: Difficulty; ind: IndustryId; seed: string; status: string; how: string; turn: number; valuation: number; stake: number; peakRev: number; share: number; rivalsLeft: number; raised: number }

function cityFor(ind: IndustryId, k: number): string {
  const good = CITIES.filter((c) => c.ind[ind] >= 1).sort((a, b) => a.id.localeCompare(b.id));
  return good[k % good.length].id;
}

function playOne(bot: string, diff: Difficulty, ind: IndustryId, k: number): Result {
  const seed = `bal-${ind}-${k}`;
  const g: GameState = newGame({ name: bot, industry: ind, city: cityFor(ind, k), founder: FOUNDERS[k % FOUNDERS.length].id, difficulty: diff, seed, mode: 'standard' });
  g.maxTurns = TURNS;
  let peakRev = 0;
  while (g.status === 'playing' && g.turn < TURNS) {
    botTurn(g, BOTS[bot]);
    if (g.status !== 'playing') break;
    endTurn(g);
    peakRev = Math.max(peakRev, ttm(g.company, (q) => q.pnl.revenue));
  }
  const c = g.company;
  return {
    bot, diff, ind, seed, status: g.status, how: g.outcome?.how ?? 'unfinished', turn: g.turn, valuation: c.valuation, stake: founderStake(c) * c.valuation, peakRev,
    share: globalShare(g, ind), rivalsLeft: g.rivals.filter((r) => r.alive).length, raised: g.counters.equityRaised ?? 0,
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

const t0 = Date.now();
const results: Result[] = [];
for (const diff of DIFFS) for (const bot of BOT_IDS) for (const ind of INDS) for (let k = 0; k < SEEDS; k++) results.push(playOne(bot, diff, ind, k));
const secs = (Date.now() - t0) / 1000;

const LOSS = ['bankrupt', 'sold', 'takeover', 'ousted', 'outlasted'];
interface Row { bot: string; diff: Difficulty; n: number; win: number; bankrupt: number; otherLoss: number; medVal: number; medStake: number; medTurn: number; wins: Record<string, number>; losses: Record<string, number> }
const rows: Row[] = [];
for (const diff of DIFFS) for (const bot of BOT_IDS) {
  const rs = results.filter((r) => r.bot === bot && r.diff === diff);
  const wins: Record<string, number> = {}, losses: Record<string, number> = {};
  for (const r of rs) {
    if (r.status === 'won') wins[r.how] = (wins[r.how] ?? 0) + 1;
    else if (LOSS.includes(r.how)) losses[r.how] = (losses[r.how] ?? 0) + 1;
  }
  rows.push({
    bot, diff, n: rs.length, win: rs.filter((r) => r.status === 'won').length / rs.length, bankrupt: rs.filter((r) => r.how === 'bankrupt').length / rs.length,
    otherLoss: rs.filter((r) => r.status === 'lost' && r.how !== 'bankrupt').length / rs.length, medVal: median(rs.map((r) => r.valuation)), medStake: median(rs.map((r) => r.stake)),
    medTurn: median(rs.filter((r) => r.status === 'won').map((r) => r.turn)), wins, losses,
  });
}

// Red flags: things that would make the game degenerate or broken.
const flags: string[] = [];
const row = (bot: string, diff: Difficulty) => rows.find((r) => r.bot === bot && r.diff === diff);
for (const diff of DIFFS) {
  const best = Math.max(...['steady', 'blitz', 'premium', 'leveraged'].map((b) => row(b, diff)?.win ?? 0));
  const p = row('passive', diff);
  if (p && p.win > 0) flags.push(`Passive bot won ${pct(p.win)} on ${diff}: doing nothing should never win.`);
  for (const probe of ['gouge', 'flipper', 'warmonger', 'raider', 'empire']) {
    const r = row(probe, diff);
    if (r && r.win > best + 0.15 && r.win > 0.3) flags.push(`Probe "${probe}" wins ${pct(r.win)} on ${diff}, well above the best honest strategy (${pct(best)}).`);
  }
  if (diff === 'brutal' && best > 0.8) flags.push(`Brutal is too easy: best strategy wins ${pct(best)}.`);
  if (diff === 'easy' && best < 0.2 && TURNS >= 80) flags.push(`Easy is too hard: best strategy wins only ${pct(best)}.`);
}
const order = DIFFS.map((d) => Math.max(...['steady', 'blitz', 'premium', 'leveraged'].map((b) => row(b, d)?.win ?? 0)));
for (let i = 1; i < order.length; i++) if (order[i] > order[i - 1] + 0.2) flags.push(`${DIFFS[i]} is easier than ${DIFFS[i - 1]} for the best strategy.`);

const fmtMap = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
const table = [
  '| Difficulty | Bot | Win | Bankrupt | Other loss | Median value | Median founder stake | Median win turn | Wins by | Losses by |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.diff} | ${BOTS[r.bot].name} | ${pct(r.win)} | ${pct(r.bankrupt)} | ${pct(r.otherLoss)} | ${money(r.medVal)} | ${money(r.medStake)} | ${r.medTurn ? 'Y' + (1 + Math.floor(r.medTurn / 4)) : '—'} | ${fmtMap(r.wins)} | ${fmtMap(r.losses)} |`),
].join('\n');
const byInd = INDS.length > 1 ? ['\n## By industry (honest strategies, all difficulties)\n', '| Industry | Win | Bankrupt | Median peak revenue |', '| --- | --- | --- | --- |',
  ...INDS.map((ind) => {
    const rs = results.filter((r) => r.ind === ind && ['steady', 'blitz', 'premium', 'leveraged'].includes(r.bot));
    return `| ${ind} | ${pct(rs.filter((r) => r.status === 'won').length / rs.length)} | ${pct(rs.filter((r) => r.how === 'bankrupt').length / rs.length)} | ${money(median(rs.map((r) => r.peakRev)))} |`;
  })].join('\n') : '';

const report = `# Balance report

Generated by \`npm run sim\` (scripts/sim.ts): ${results.length} games, ${TURNS} quarters each, ${SEEDS} seeds per cell,
industries: ${INDS.join(', ')}. Took ${secs.toFixed(0)} s.

Each game is one scripted player against the rival AIs. Bots use only the actions a human has.
${Object.entries(BOTS).filter(([k]) => BOT_IDS.includes(k)).map(([, b]) => `- **${b.name}**: ${b.blurb}`).join('\n')}

## Results

${table}
${byInd}

## Red flags

${flags.length ? flags.map((f) => '- ' + f).join('\n') : 'None. No probe strategy beats honest play, doing nothing never wins, and difficulty levels are ordered.'}
`;
console.log(report);
if (WRITE) writeFileSync(new URL('../docs/balance.md', import.meta.url), report);
process.exitCode = flags.length ? 1 : 0;
