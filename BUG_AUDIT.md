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
- [x] 6. Investments & M&A — `invest.ts`, `mna.ts`
- [x] 7. Events — `events.ts`, `data/events/*.json`
- [x] 8. Rival AI & competitors — `rivals.ts`, `competitors.ts`, `feud.ts`
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

### 6. Investments & M&A — done

**Fixed** (regression tests: `tests/audit-invest.test.ts`)
- `invest.ts:12,57,98,124,146`, `mna.ts:14,61,75` — start, cancel, diligence, license, target diligence and
  acquire still ran after the game ended. They now refuse like `actions.ts` (continued games allowed).
- `invest.ts:138` `licenseValue` — a staged project costs nothing to start, so you could start a drug and license it
  out in the same click, repeatedly: 50 loops took cash from $2.7M to $82.6M in one quarter via the biotech UI button.
  Licensing now needs one funded quarter first.
- `invest.ts:258` — the history trim kept the last 80 entries even if older ones were still running, so **running
  investments silently vanished**, along with their effect and any securities or plant behind them. Running entries are now always kept.
- `mna.ts:78` — an acquisition could put your own stores beside a franchisee (the bypass of the system 5 fix). Now refused.
- `mna.ts:82,105` — buying a business into a plant part-owned by a fund gave the fund 49% of it for nothing
  (probe: a $49M wind farm took the fund's stake from $6M to $28M and quadrupled its payouts). The fund now pays its
  share, as in `expandCapacity`.

**Flags (not fixed)**
- [High] Licensing is still a money machine: start 3 drugs, license them next quarter. Probe: $41M cash in 12 quarters
  against $193K revenue a quarter. The license value ignores how little has been spent. Design decision.
- [High] `finance.ts:241` `pipelineValue` — starting staged projects costs almost nothing but adds p × 40 × sizing cost
  to valuation at once. Starting them in the final quarter pumped valuation $72M → $147M (saas) and $51M → $191M
  (consulting) for about $0.5M. An end-of-game grade/victory exploit. → system 9
- [Med] Bought revenue counts as growth in the valuation: it spikes 2–3× within 3–4 quarters after a deal (saas $223M → $469M)
  and drops by the price just after it, with no at-cost carry like new plant gets. The spike can be timed for the end of the game. → `finance.ts`
- [Low] The engine licenses any staged project but the UI only offers it for biotech. `venture_fund` `unique:false` is ignored.
  A staged start while overdrawn says "That needs $0". Unknown office or region ids are charged and then wasted.
- [Low] Goodwill impairment runs after the books close, so it lands in the next quarter. Acquired plant is valued without
  inflation. The $15K target-diligence floor isn't inflation-adjusted.
- (mna.ts has no divestiture code; rival sales live in `rivals.ts`, system 8.)

Checks: lint clean · typecheck clean · 216/216 tests · `sim:ci` passes, no red flags · `playtest --quick` 528 games, no problems.

### 7. Events — done

(Commits `f1694cd` WIP — the run was interrupted by an API limit and resumed — plus the follow-up commit.)

**Fixed** (regression tests: `tests/audit-events.test.ts`, 13 tests)
- `events.ts:660` — the outcome draw could pick a zero-weight outcome on a draw of exactly 0 (now mirrors `weighted()`). (Closes system 1 flag.)
- `events.ts:368` `buyback10` — at a $0 share price it retired up to 30% of outside shares for $0 while the card said
  "Pays out ~$8.5M". Now refused, and the card shows no amount. (Closes system 2 flag.)
- `events.ts:331`, `actions.ts:374` — retention covered 9 resignation checks, not "two years". The setters were off by one (all three readers count inclusively). (Closes system 4 flag.)
- `mods.ts:64` `setFlag` — the same off-by-one: the "two-year" currency hedge lasted 9 quarters.
- `events.ts:~690` — resolving one card could leave a stale one: let a resigning person go and the rival's poaching card
  for them stayed, still charging its cost and handing loyalty to everyone. Cards are now pruned after each resolve.
- `events.ts:91` — walkout, union and antitrust cards named a random office (wrong 75% of the time with 4 offices, e.g.
  "Walkout in Toronto" at morale 80). The office pool now respects `maxMorale`/`minShare`.
- `events.ts:98` — regional energy and port cards picked regions with no office in their industry (about 50%), so they did nothing.
- `events.ts:96` — `cons_partner_exit` named an office other than the partner's own (153 of 187 binds).
- `events.ts:447` — `rivalShare` did nothing without a bound rival (`mfg_breakdown`, `log_big_contract`).
- `macro.json` `currency_crisis` — "Raise local prices" raised prices in *every* region (`priceUp` 8 → −8, the engine's
  existing "this region only" convention; verified in the handler).
- `events.ts:404` — in multi-division companies, wage, input, attrition, regional-market and `payUp` effects leaked into other
  divisions (cloud credits cut a factory's input costs by 40%).
- `events.ts:~640` `chainCtx` — follow-ups inherited the parent card's office or person, so closing an office cancelled
  the bribery probe and the cloud-credit renewal. `cartel_probe` (`rival.json`) now binds its rival.
- `tests/events.test.ts` — one existing test now sets the low morale the union card requires (test setup fix, not weakened).

**Flags (not fixed)**
- [Med] 12 event flags are set but never read (e.g. `lockin`, `cartel`): the "lock customers in" options carry only their downside.
- [Low] `log_port_strike` is in the macro category, which skips North American regions, so it never fires for a company only there.
- [Low] A follow-up is silently dropped if a card with the same id is already queued.
- [Low] Text and effect disagree: walkout says "a third resign" (15% do), the order squeeze says "a third of your volume"
  (20%), and "Emergency investors" labels the holder of every equity raise. Staff cuts from events pay no severance.
- [Low] `rivals.ts` `buyRivalOffice` buys a different city when the rival has none in the named one. → system 8

Checks: lint clean · typecheck clean · 229/229 tests · `sim:ci` passes, no red flags · 56-game probe: no text leaks, NaN, unbalanced books or leftover cards.

### 8. Rival AI & competitors — done

**Fixed** (regression tests: `tests/audit-rivals.test.ts`)
- `rivals.ts:703,759` `bidForRival` (+ `src/ui/screens/rivals.ts:148`) — at a $0 share price the stock half of a bid
  was issued at $0.01 a share (probe: founder 100% → 0.6%). The whole price is now paid in cash (new `bidCash`), and the bid
  dialog shows the same split. (Closes system 2 flag.)
- `rivals.ts:631,659,760` — poaching, suing and bidding started their 2/8/4-quarter cooldowns even when refused
  for lack of cash, so retrying with cash got "They rejected an approach recently". The cash check now comes first.
- `rivals.ts:583,467` — truces covered 9 quarters ("two years") and alliances 13 against their own 12-quarter
  demand bonus. They now cover 8 and 12 and lapse at the close of their last quarter.
- `rivals.ts:243,851` + `events.ts:574` — the distress card named your city even where the rival had no office, then
  bought an office of theirs in another city ("Go after their customers" did nothing). It now names a city the rival is in, with no silent fallback. (Closes system 7 flag.)
- `rivals.ts:901` + new `people.ts:153 cutPlan` + `events.ts:586` — `boardCuts` added staff to empty roles, spared every
  team of 5 or fewer and paid no severance. It now cuts one job in ten across the company and pays severance, which the card shows. (Closes system 4 flag.)
- `rivals.ts:393` — a rival bought earlier in the same quarter's loop kept trading, could queue cards that used up the
  rival-card slot, and could buy another rival into a dead company.
- `rivals.ts:482` — a retail rival retaliated by opening a free *software* office in your home city, an industry it doesn't run, which also got around its office limit.
- The 7 player diplomacy and bid actions now refuse after the game ends.

**Flags (not fixed)**
- [Med] `rivals.ts:~720` `absorbIntoPlayer` — buying into a plant part-owned by a fund gives the fund 49% of the bought plant for
  nothing (probe: fund payouts $0.82M → $1.06M over 8 quarters after a $0.69M purchase). Same bug fixed in `mna.ts`; the card's money text needs changing too.
- [Low] Rival buyouts can put your own stores beside a franchisee (the bypass `mna.ts` closed). Buying a rival's last office leaves a rival with no offices until it goes bankrupt.
- [Low] The bid's cash check ignores the 1% adviser fee, so a bid can leave you overdrawn. `improveRelations` and `lobbyAgainst` have no cash check.
- [Low] Design: a bid pays for the rival's cash, but its cash, receivables and stock vanish. `mergeRival` takes on no debt or cash.
  `endPact` leaves the alliance's +3% demand running.
- [Low] The rival AI cheats a little: its retaliation office is free, and rivals read your exact share history, tech and negative-cash count without intel.
- [Low] `data/events/rival.json` `rival_retaliation` says "your home market", but it may now name another city. → system 11

Checks: lint clean · typecheck clean · 238/238 tests · `sim:ci` passes, no red flags (re-run by coordinator) · `playtest --quick` 528 games, no problems · about 140 probe games: no NaN, duplicate ids, shares over 1, unbalanced books, or offices left on dead rivals.
