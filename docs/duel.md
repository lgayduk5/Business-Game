# Head-to-Head (duel) — design memory

Two humans, pass-and-play, run rival companies in the **same industry** in one world with 3–5 AI rivals. Every move
of one reaches the other through shared markets, the AI rivals and direct moves. Solo play must not change.

## Architecture
- `g.duel?: DuelState` = `{ seats: [SeatState, SeatState]; active; phase; sealed; agendas; auctions; worldCards }`.
- `withSeat(g, i, fn, { worldRng? })` (engine/src/seats.ts) parks the top-level per-seat fields, puts seat i's in,
  runs fn, writes them back to the seat, restores (try/finally). Nesting the same seat is a no-op; a different seat
  throws. `worldRng` keeps the world rng at `g.rng` (AI rivals, shared events). Engine and UI run unchanged inside.
- At rest in a duel the seats hold the truth; `g.rng` is the world rng.
- endTurn stages (turn.ts), solo calls them in today's order: `seatOpen` (prev values + completeBuilds) →
  `worldStart` (stepMacro, rivalsForDivisions, maybeEntrant, rivalsDecide) → `markets` → `companyClose`
  (offices..stepGuidance) → `worldEnd` (rivalsFinancials, rivalLifeEvents) → `companyWrap` (covenants..advise,
  checkEnd) → `g.turn++` → `rollOver` (mods, offers, candidates, drawEvents, COO).
  *Refinement of the brief:* completeBuilds is per seat and worldEnd sits inside today's companyClose, so close is
  split in two around worldEnd. duelQuarter: seatOpen×2, worldStart, markets(both), companyClose×2, worldEnd,
  companyWrap×2, turn++, rollOver×2.
- Markets: `resolveMarkets(g, seats: MarketSeat[])`; each seat's attract/price/tech is read inside its own `run`
  (withSeat). One pass over all competitors, so shares are zero-sum. Solo = one seat, identical floats.
- AI rivals: each quarter each rival picks a focus seat (threat to its markets + grudge + leader bonus, world rng);
  its decide step runs in withSeat(focus, worldRng). Per-seat rival fields live in `r.vs[i]`, swapped with the seat.
- Randomness: world rng = macro, AI rivals, shared events; each seat's rng = its private events and actions.
- Saves: g.duel rides in the normal save; SAVE_VERSION bump with a no-op migration for solo saves (Phase 2).

## Field classification (GameState)
| | fields |
|---|---|
| shared | v, id, seed, uid (world id counter), turn, maxTurns, mode, scenario (unused in duel), difficulty, rules, replay (solo only), settings (except `delegate`), mk, cityIdx, macro, rivals, created, `rng` at rest = world rng |
| per seat | rng (private), company, discovered, scouting, queue, scheduled, fired, eventLog, flags, mods, news, advisor, history, attribution, targets, candidates, loanOffers, equityOffer, status, outcome, continued, streaks, report, counters, settings.delegate |
| per seat on each Rival (`r.vs[i]`) | relation, hostility, pactUntil, pact, lastMove, grievances, known, feud |

## Rules
- Setup: same industry. Snake draft: coin flip; P1 city, P2 city, P2 founder, P1 founder. Difficulty sets the AI
  field. Lengths: Showdown 20 q, Sprint 40, Full 100.
- Turn: P1 answers cards + plans → seal → cover screen (hold to reveal) → P2 same → duelQuarter → private reports +
  public scoreboard.
- Endings, first match wins: (a) insolvent → other wins; (b) a standard victory (victory.ts) → wins, both same
  quarter → higher score; (c) an AI rival meets Titan or Category king (player thresholds and streaks) → both lose;
  (d) time → higher score. Score = gameGrade(g).score per seat + agenda bonus.
- Interaction: shared markets; city wage pressure from both hiring; tech race (churn vs best tech). Direct moves =
  rival actions (poachTalent, sueRival, lobbyAgainst, price war, smear) as sealed orders, paid by sender, landing as
  the matching rival_* card with the human as {rival}. Truce/alliance offers via inbox; cartel_probe can hit both.
  Distress: negative cash → opponent and AI can bid for offices (absorbIntoPlayer).
- Variety: data/duel-worlds.json (12–16 cards of mods/macro shocks; 2 open + 1 hidden flipping at half time);
  data/duel-agendas.json (~15, check fn in engine; deal 3 keep 1, +8 if met); sealed-bid deals every 3–4 q
  (distressed rival's offices, city contract, star exec, patent; ties → less cash; AI bid = fair value × appetite);
  AI field varies by seed; 3-line "who's in this world" briefing; shareable duel seed.

## Working rules
One phase per session; read only this file, then grep. Solo guard every phase: tests/duel-solo-replay.test.ts
(fixtures from scripts/solo-fixtures.ts) and sim:check. The sim fingerprint skips engine/src/duel*.ts and
data/duel-*.json (decision 100): put duel-only code there. If shared engine files change, re-run `npm run sim` and
`npm run sim -- --sprint` (~2.5 min), restore the "Took N s" lines, and commit only if the diff is the fingerprint.

## Phases
- [x] 0. Baseline fixtures: 3 full solo games (saas/blitz normal, mfg/leveraged hard, retail/raider brutal).
- [x] 1. Seats refactor, no behaviour change: types.ts (SEAT_KEYS, SeatState, DuelState, RivalSeatRel, Rival.vs),
  seats.ts (withSeat, pickRel), turn.ts stages, market.ts `MarketSeat` + `marketSeat()`. tests/duel-seats.test.ts.
  Full and sprint grids re-ran identical.
- [ ] 2. Headless duel: newDuel, duelQuarter, focus seat + r.vs, endings incl. AI wins, saves, scripts/duel-sim.ts.
  Tests: determinism; named shares ≤ 1; same macro; books balance per seat; private rng isolation.
- [ ] 3. Interaction + variety: direct moves, inbox, distress sales, world cards, agendas, auctions (+ schemas).
- [ ] 4. UI: title, draft, seal/cover, inbox, auction, scoreboard, cards/agenda panels, opponent in Intel > Rivals,
  worker runs duelQuarter; audit-ui tests, smoke, phone width.
- [ ] 5. Balance + docs: 300+ bot duels, seats swapped; seat A 45–55%, AI 10–25%, no card/agenda > 10 pts, lead
  changes ≥ 2 in median game; decisions, CHANGELOG, README.
