# Bug audit — Going Concern

Branch: `claude/game-bug-audit-l3nfom` · Started 2026-11-19

## Method

- One system at a time, each reviewed in isolation by a subagent that reads the relevant code
  (targeted ranges, not whole files), runs tests/lint/typecheck and probe scripts, and fixes code
  **only for confirmed bugs**, adding a regression test where practical. Design/balance questions
  are flagged, not changed.
- After each system: findings appended below, box ticked, one commit per system.
- Balance reports (`docs/balance*.md`, `data/winrates.json`) are fingerprinted against `engine/src`
  and `data/`, so `npm run sim:check` goes stale after any engine fix. They are regenerated once,
  at the end, after all fixes.

## Baseline (before any change)

- `npm run lint` — clean
- `npm run typecheck` — clean (app + engine)
- `npm test` — 17 files, 176 tests, all passing
- `npm run sim:ci` — passes, no red flags (~20 s on 4 cores)
- `npm run sim:check` — passes (reports match the committed engine/content)

## Systems checklist

- [x] 1. Core turn loop & determinism — `engine/src/turn.ts`, `util.ts` (RNG), `forecast.ts`, `history.ts` (`types.ts` as reference)
- [x] 2. Accounting & finance — `books.ts`, `finance.ts` (loans, covenants, rating, equity, IPO), `exit.ts`
- [x] 3. Market, macro & modifiers — `market.ts`, `macro.ts`, `mechanics.ts`, `mods.ts`, `policyData.ts`
- [x] 4. People / HR — `people.ts`
- [x] 5. Player actions & new-game setup — `actions.ts`, `newgame.ts`, `difficulty.ts`
- [ ] 6. Investments & M&A — `invest.ts`, `mna.ts`
- [ ] 7. Events — `events.ts`, `data/events/*.json`
- [ ] 8. Rival AI & competitors — `rivals.ts`, `competitors.ts`, `feud.ts`
- [ ] 9. Victory, modes, scenarios & advisor — `victory.ts`, `modes.ts`, `scenarios.ts`, `winrates.ts`, `advisor.ts`
- [ ] 10. Save / load & persistence — `engine/src/save.ts`, `src/storage/saves.ts`, `src/worker.ts`
- [ ] 11. Content data & schemas — `content.ts`, `data/*.json`, `data/schemas/*`
- [ ] 12. UI core — `src/main.ts`, `src/ui/store.ts`, `shell.ts`, `kit.ts`, `tips.ts`, `update.ts`, `src/audio.ts`, `styles.css`
- [ ] 13. UI gameplay screens — `src/ui/screens/{hq,ops,regions,map,corp,capital,invest,team,policies,intel,rivals,events}.ts`
- [ ] 14. UI meta screens — `src/ui/screens/{title,modes,tutorial,learn,files,modals}.ts`
- [ ] 15. Tooling, build & PWA — `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `scripts/*`, `engine/src/bots.ts`, CI
- [ ] Final: regenerate balance reports, full verification (lint, typecheck, test, sim:ci, sim:check, build)

## Findings

<!-- one section per system, appended as each is audited -->

### 1. Core turn loop & determinism — done

**Fixed** (regression tests: `tests/audit-turn.test.ts`, 12 tests)
- `turn.ts:319`, `events.ts:659` — after *Keep playing*, bankruptcy, a sale or an ouster did not end the game
  (`continued` stayed true): quarters kept running, no game-over screen, fast-forward never stopped. `continued` is
  now cleared when the game ends. (Checked: `keepPlaying` resets `status` to `'playing'`, so live continued games are unaffected.)
- `turn.ts:241` — `stepFranchises`/`stepHedge` ran after tax and the negative-cash check: franchise royalties were
  never taxed, the input-lock fee wasn't deductible and could push cash negative without counting toward insolvency.
  Moved before tax.
- `actions.ts:248`, `rivals.ts:694` — a new or acquired division's markets were set up lazily on first read with an
  RNG draw, so just opening the map changed the rest of the game (determinism break). Markets are now set up when
  the division is added.
- `util.ts:39` — `weighted()` could pick a zero-weight item when the draw was exactly 0.
- `history.ts:68,95` — off-by-one in seeded starting history: the latest office entry was about 5% under the last
  quarter, and seeded valuation/share/rival values were a quarter stale (affected plant value, revenue bridge, first
  quarter's attribution).

**Flags (not fixed)**
- [Med] `exit.ts`/`modals.ts` — a take-private sale with a winning grade offers *Keep playing* on a company you sold. → system 9/14
- [Low] `victory.ts` — a continued scenario game still checks scenario win/lose conditions. → system 9
- [Low] `events.ts:648` — outcome draw has the same zero-weight edge case as `weighted()`. → system 7
- [Low] `turn.ts` — IPO proceeds and covenant fees land after the books close, so `report.cashDelta` (not displayed) double-counts them.
- [Low] `forecast.ts` — after the game ends the forecast just repeats the last quarter.
- [Low] `g.history` grows without bound in continued games (save size).

Checks: lint clean · typecheck clean · 188/188 tests · `sim:ci` passes, no red flags.

### 2. Accounting & finance — done

**Fixed** (regression tests: `tests/audit-finance.test.ts`)
- `books.ts:42` `writeOffAR` — when receivables were negative (refunds owed for prepaid service that stopped), a
  recession's bad-debt write-off cleared the negative balance and booked it as **profit**. In the probe a $540K
  refund was never paid and showed up as a $540K net-income gain. Negative amounts are no longer written off.
- `finance.ts:536,571` `followOn`/`buyBack` — with a listed share price of $0 (seen in 25 quarters across 315 bot
  games), a buyback retired half the float for $0, raising the founder's stake for free, and a follow-on sold 10%
  of new shares for $0. Both are now refused at $0.
- `finance.ts:521` `stepIPO` — the IPO didn't start the cooldown between offerings, so a follow-on could run the
  quarter after listing, against the game's own rule ("Investors need a couple of quarters between offerings").
- `victory.ts:282` (+ `modals.ts:90`) — a winning take-private sale offered *Keep playing* on a sold company. Added
  `canKeepPlaying()`; `keepPlaying` refuses when `outcome.how === 'exit'` and the button is hidden. (Closes system 1 flag.)
- `turn.ts:121` — `report.cashDelta` counted IPO proceeds and waiver fees twice (569 times in 315 games). It now
  measures from the previous report's cash. Not displayed anywhere; the statements themselves always tied out.

**Flags (not fixed)**
- [Med] `rivals.ts:748` — buying a rival while your share price is $0 issues the stock part at $0.01/share; in the probe the founder went from 83% to 0.3%. → system 8
- [Med] `mechanics.ts:100` — option grants dilute without limit as valuation nears 0 (379% of shares in one quarter), and grant nothing at exactly $0. → system 3
- [Low] `events.ts:360` `buyback10` — the event retires shares for $0 when the price is $0. → system 7
- [Low] In every IPO quarter the report's "Cash at quarter end" differs from that quarter's balance sheet and history chart (the proceeds are booked after the close).
- [Low] Design: the $1.5M IPO filing fee and loan, waiver and covenant fees count against EBITDA, lowering the IPO price and covenant headroom.
- [Low] An IPO or take-private at zero value would go through at $0 (not seen in play). `takeLoan`/`drawRevolver`/`repayLoan`/`raiseEquity` accept NaN amounts (the UI never sends one).

Checks: lint clean · typecheck clean · 193/193 tests · `playtest --quick` 528 games, no problems · `sim:ci` passes, no red flags.

### 3. Market, macro & modifiers — done

**Fixed** (regression tests: `tests/audit-market.test.ts`)
- `mechanics.ts:102` `grantOptions` — options were priced at the last valuation with no floor. Near zero value,
  employees got the company many times over: up to 98× the shares in one quarter (mfg, valuation $1,211); 464%
  in a quarter in consulting. At exactly $0, nothing was issued for pay already booked as stock comp (321 of 18,768 probe
  grants). The price is now `max(valuation, $400K×CPI, 4×grant)`, so one grant is at most a fifth of the company.
  Normal grants are unchanged (median dilution about 0.55%). (Closes system 2 flag.)
- `mechanics.ts:73` `setGuidance` — new guidance could replace the old one in the very quarter it was due, so a
  missed promise was never judged (the UI hides the button; the engine API allowed it). `>` → `>=`.
- `mechanics.ts:121` `lockInputs` — the refusal said "locked until N quarters from when you signed", using the
  *new* term asked for; it now names the real end quarter.

**Flags (not fixed)**
- [Low] `turn.ts:285` — `stepGuidance` runs after `revalue`: the news says "the shares rose/fell" but the price
  doesn't move that quarter, and the next revalue undoes 30% of the effect.
- [Low] `actions.ts` `openOffice` — you can open your own store in a city that already has your franchise and both
  run (`canFranchise` blocks the reverse order). → system 5
- [Low] `market.ts:181,193` — in grid industries, attraction targets aren't scaled by `room`, so shares could
  in theory sum above 1. Never seen: the max sum was 0.85.
- [Low] Valuations under $1M are still diluted heavily (up to 25% a quarter, compounding), with no warning on the policies screen.
- Checked and sound: share sums ≤ 1 (max 0.73 seen), demand never ≤ 0 or NaN, elasticity signs, price clamps,
  macro stays in bounds over 2,000 quarters, modifier expiry, all six policies match their text, each per-quarter step runs once.

Checks: lint clean · typecheck clean · 197/197 tests · `sim:ci` passes, no red flags · `playtest --quick` 528 games, no problems.

### 4. People / HR — done

**Fixed** (regression tests: `tests/audit-people.test.ts`, including an invariant test under random HR decisions)
- `actions.ts:292` `hireExec` — the search fee was `1.2 × salary` in base-year money, while pay, severance,
  retention and the on-screen salary all multiply by `macro.wageIdx`. Late in a game (wage index about 1.6–1.9) a hire cost
  about 0.65 of a quarter's displayed pay instead of 1.2×. Now scaled like the rest.
- `actions.ts:279,318` `fireExec` — *Replace* on an executive left the seat with no candidates until the yearly
  refresh (`turn % 4`), so up to 3 quarters without e.g. a CFO, which can block an IPO. Two candidates are now
  shortlisted at once. `refreshCandidates` makes the same RNG draws in the same order (new `shortlist()` helper).
- `team.ts:78` — the text said retention costs "six months of salary"; the engine charges 1.5 quarters. Text fixed
  (not the cost, to avoid a balance change).
- Probes: 350 bot games plus 70 random-action games. Headcount always whole and never negative, skill and morale in
  range, one GM per office, no duplicate executives, staffing hints non-negative, no NaN.

**Flags (not fixed)**
- [Med] `actions.ts` `staffingHint` — divides by last quarter's productivity, which includes the temporary
  new-hire slowdown, so after a hiring wave it overstates ops needed by up to about 1.5× (151 of 4,950 office-quarters more than 25% over).
- [Low] `turn.ts:334` — a seat left by an executive who *resigned* still waits for the yearly candidate refresh.
- [Low] `people.ts:186` — when two key people leave in one quarter, the second leaves without the event card and
  the GM productivity hit lasts 1 quarter, not the 2 the team screen promises.
- [Low] `people.ts:183` — a successor GM inherits the predecessor's salary and trait despite about 12 points less skill.
- [Low] `actions.ts:327`/`events.ts:329` — retention protects 9 quarterly resignation checks; the text says "two years" (8).
- [Low] `rivals.ts:870` `boardCuts` — adds an ops/admin person where there were none, cuts nobody in roles of 5 or fewer, and pays no severance. → system 8
- [Low] `setReqs`/`setPay`/`fire` accept NaN (the UI never sends it). → system 5

Checks: lint clean · typecheck clean · 202/202 tests · `sim:ci` passes, no red flags.

### 5. Player actions & new-game setup — done

**Fixed** (regression tests: `tests/audit-actions.test.ts`)
- `actions.ts:18` (all actions) — only `openOffice` refused after the game had ended. The grade and the daily score code
  are recomputed from live state, and enterprise value = frozen valuation − cash, so spending leftover cash after
  a Daily ended (new divisions, plant) *raised* the score code: B65 → A70 in a real daily (2026-11-08). All actions in
  `actions.ts` now refuse with "The game is over."; continued games are unaffected.
- `actions.ts:20` (10 actions) + `finance.ts:166,185,197,446,542` — NaN/±Infinity amounts poisoned state
  (`setMarketing`/`setRdBudget`/`setDividend` took Infinity; `expandCapacity`, `sellCapacity`, `fire`, `takeLoan`,
  `drawRevolver`, `repayLoan`, `raiseEquity`, `followOn` took NaN). They now refuse. (Closes system 2 and 4 flags.)
- `actions.ts:222` `openOffice` — you could open your own stores in a city where your franchisee already ran,
  and both sold to the same customers. Now refused. (Closes system 3 flag.)
- Probes: 12,768 new-game combinations plus 80 fuzzed games with no NaN, throws or unbalanced books; the same seed
  gives the same game; difficulty is ordered.

**Flags (not fixed)**
- [High] `victory.ts:151,192` (root in `newgame.ts`) — energy in Lagos sometimes starts worth $0 (debt above
  enterprise value; 1 in 60 seeds on Normal). The baseline floors at $1, so the grade reads "Your stake grew
  2,580,891×": a free growth pass worth about 35 points. Needs a baseline design choice. → system 9
- [High] The grade is still not frozen at game end: actions in other files still run afterwards and move it
  (`buyBack` C39 → C46 with a simulated listing; `takeLoan`, `drawRevolver`, `raiseEquity`, `invest.ts`, `mna.ts`,
  `rivals.ts`, `mechanics.ts`). Freeze the grade/score in `outcome`, or guard those too. → systems 6, 8, 9
- [Med] `staffingHint` — **confirmed** bug, *not* fixed: it divides by last quarter's productivity, including a
  new-hire slowdown that is already over (mfg asks for 16 ops when 12 are needed). The fix (divide out
  `prodParts['New-hire ramp']`) makes `sim:ci` fail: retail's honest win rate goes from 85% to 96% (a "tough"
  industry made too easy). Needs a rebalance with it, so it was reverted.
- [Low] The 1% asset-loan fee is left out of `openOffice`/`expandCapacity` affordability checks and the "of your own" button.
- [Low] `sellCapacity` leaves the plant's ramp cost in valuation for 4 quarters; closing a plant part-owned by a fund pays the fund nothing.
- [Low] `ops.ts:199` — the close-office confirm says "two quarters of rent", but the engine also charges 2× facility costs. → system 13
- [Low] Unknown region, role or industry ids throw instead of refusing; `newgame.ts:60` doesn't validate difficulty.

Checks: lint clean · typecheck clean · 209/209 tests · `sim:ci` passes, no red flags · `playtest --quick` 528 games, no problems.
