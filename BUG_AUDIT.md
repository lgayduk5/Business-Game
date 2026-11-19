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
- [x] 9. Victory, modes, scenarios & advisor — `victory.ts`, `modes.ts`, `scenarios.ts`, `winrates.ts`, `advisor.ts`
- [x] 10. Save / load & persistence — `engine/src/save.ts`, `src/storage/saves.ts`, `src/worker.ts`
- [x] 11. Content data & schemas — `content.ts`, `data/*.json`, `data/schemas/*`
- [x] 12. UI core — `src/main.ts`, `src/ui/store.ts`, `shell.ts`, `kit.ts`, `tips.ts`, `update.ts`, `src/audio.ts`, `styles.css`
- [x] 13. UI gameplay screens — `src/ui/screens/{hq,ops,regions,map,corp,capital,invest,team,policies,intel,rivals,events}.ts`
- [x] 14. UI meta screens — `src/ui/screens/{title,modes,tutorial,learn,files,modals}.ts`
- [x] 15. Tooling, build & PWA — `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `scripts/*`, `engine/src/bots.ts`, CI
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

### 9. Victory, modes, scenarios & advisor — done

**Fixed** (regression tests: `tests/audit-victory.test.ts`, 10 tests)
- `victory.ts:~234,253`, `types.ts:892`, `modes.ts:62`, `exit.ts:18`, `events.ts:680`, `modals.ts:82` — **the grade and
  Daily score code were recomputed from live state after the game ended.** The full `FinalGrade` is now stored in
  `outcome.final` at every ending (`checkEnd`, take-private, event endings), and the end screen and `scoreCode` read it
  via `gameGrade()`. Older saves fall back to computing it. (Coordinator grep: no UI path still computes it live.)
- `finance.ts` (7 actions), `mechanics.ts` (6, including `openFranchise`, which put $124K in cash) — still ran after the
  end (a buyback moved C39 → C46). They now refuse; continued games are unaffected. With systems 5, 6 and 8, every player action is now guarded.
- `newgame.ts:56` `startStakeValue` (also `scenarios.ts:209`) — energy in Lagos could start with a stake worth $0 to a few
  hundred thousand dollars, giving growth multiples like ×18,000,000 and turning a B64 into a win (should be about C46). The
  baseline now has a floor of ⅓ of book equity. Across 57,120 starts the floor applies **only** to energy in Lagos (402
  starts); ⅓ was chosen so no other start changes. (Closes system 5 flag.)
- `victory.ts:269` — a scenario the player kept going after was judged on the challenge again: it ended a quarter later and could flip to "Challenge failed". (Closes system 1 flag.)

**Flags (not fixed)**
- [High] `finance.ts:241` `pipelineValue` — every staged project is valued at chance × 40 × cost (a platform is worth about 23× its
  whole cost, a moonshot about 7×). Starting 6 in the last quarter of a Sprint: consulting C48 (a loss) → A70, retail
  C57 → A84, for about $0.2–1.4M. Mid-game this can trigger **Titan** (consulting $238M → $940M). The value also vanishes
  when the project succeeds. `docs/decisions.md` #46 covers drugs only. **Design decision needed** (raised by systems 6 and 9).
- [Low] Medal text says "gold for the Brutal version", but gold needs Brutal *plus* the bonus; Brutal without the bonus gives silver (`modes.ts:101` vs `src/ui/screens/modes.ts`). → system 14
- [Low] `victory.ts:213` — the comment says 4× the typical rival is full marks; the code needs about 5.7×.
- [Low] Keeping a Daily going hides its score code until the game ends again.
- [Low] `rivals.ts` `sellCompany` — the Daily code values the stake at valuation, not at the sale price.
- [Low] Phase III shows "$50M" while the bar is inflation-adjusted; the `rate_shock` deadline branch is dead code.

Checks: lint clean · typecheck clean · 248/248 tests · `sim:ci` passes, no red flags · `playtest --quick` 528 games, no problems · 44-game fuzz of advisor/grade/scenario text: no NaN or crashes.

### 10. Save / load & persistence — done

The save/load round trip itself is sound. 42 bot games reloaded every quarter, plus 24 more across every mode with
mid-quarter reloads, never diverged from twins that were never saved. 17 saves written by the pre-audit engine
(`d81b8d2`) load and play on, so no `SAVE_VERSION` bump or migration is needed (`outcome.final` is optional, with a
fallback). No prototype pollution from crafted `__proto__` keys.

**Fixed** (regression tests: `tests/audit-save.test.ts`, 7 tests)
- `src/storage/saves.ts:90` `loadFrom` — without IndexedDB (the in-memory store) loading returned the stored object itself,
  so playing on silently rewrote the save: slot 1 saved at Q3 reloaded at Q6 while the list still said Q3. Now returns a copy.
- `engine/src/save.ts:73` — saves loaded from browser storage skipped the newer-version check, so an older build in another tab
  would play a newer save and write it back. `loadFrom` threw on a damaged record instead of returning null.
- `saves.ts:37,51`, `files.ts:23` (+ slot and import handlers) — a save counted as done when its request succeeded, before the
  transaction committed; a full disk fails at commit. Failures were ignored, so **the game was silently lost on reload**.
  `saveTo`/`autosave` now report whether the save was kept, and the player is warned once.
- `engine/src/modes.ts:103` new `runQuarters` (used by `worker.ts`, `store.ts`; snapshot hook in `src/ui/screens/modes.ts:93`) —
  fast-forward kept only its last quarter as a rewind point. Fast-forwarding into the end left the end screen with 4 replay
  buttons that all failed with "too far back".
- `store.ts:203`, `modals.ts:27` — an engine exception during a turn **hung the UI forever** behind "Closing the books…". It now
  rejects, shows a toast, and leaves the game unchanged.
- `modals.ts:147` (quit), `files.ts:43` — decisions made within 0.7 s of quitting were never autosaved, and *Continue* on the title
  showed a stale quarter or game. (Fixed from reading the code; covered by the smoke test below.)

**Flags (not fixed)**
- [Med] No coordination between two tabs: a stale tab overwrites the autosave when hidden or closed, and **Ironman can be rewound** by keeping a second tab open.
- [Med] **Ironman save-scumming**: an event's outcome shows before the 700 ms autosave, so closing the tab and choosing again works.
- [Low] Loading an older slot replaces that game's autosave. A 7th game deletes the oldest game's autosave, including an Ironman game's only save.
- [Low] Rewind points aren't offered after a page reload or a load; `dropSnapshots` is never called.
- [Low] `fromSaveFile` validates very little: damaged files show raw TypeError text, or load and then fail on the first quarter.
- [Low] `listAll` reads every full save just to list them, several times per turn.
- [Low] Save size grows about 0.75 KB per quarter (302 KB at 400 quarters, 130 KB of it `g.history`). Not a practical problem.
- [Low] The Daily challenge's "one go" isn't enforced. → system 14

Checks: lint clean · typecheck clean · 255/255 tests · `npm run build` passes · `npm run smoke` passes, including the offline service-worker check (run by coordinator; Playwright is preinstalled here).

### 11. Content data & schemas — done

**Fixed** (regression tests: `tests/audit-content.test.ts`, 24 tests. All data edits are text only: the coordinator checked that every number outside strings is unchanged.)
- Schemas — 5 content files had none: added `data/schemas/{founders,rivals,glossary,names,scenarios}.schema.json`. The
  industries schema required only 7 of its ~48 fields, and cities didn't require `tal`/`blurb`; both now require everything the engine
  reads. Investment `fx` keys, event `cond`/`req` keys and boost stats are now checked. **A misspelt condition used to be ignored,
  so the card fired for everyone.** `tests/schema.ts` gained local `$ref` support.
- Text that contradicted its effect, fixed: walkout "a third resign" → one in seven (15%); "you hire replacements" → three in ten
  fired (−30%); order squeeze "a third" → a fifth; bio_short "a fifth" → 15%; market_crash "a fifth" → a quarter; cons_bench
  "20% off" → 5%; big_customer/saas_enterprise "three years" → two; rival_distress "a dozen" → eight; drug pitch "one in sixteen" →
  one in eleven (the UI shows 9%); Lagos "faster than anywhere" → "almost anywhere" (Bangalore grows faster).
- `rival.json` — `rival_retaliation` no longer says "your home market" (it can bind another city; closes system 8 flag).
  `rival_price_war` "Hit their home market" actually cuts their share in the shared city; relabelled.
- `scenarios.json` phase3 — the goal now says "$50M valuation, in today's money" (the bar was $53.8M by quarter 14). (Closes system 9 flag.)
- `events.ts` `equity` — raises at or above the valuation are labelled "New investors / Placement"; only rescues say "Emergency investors / Bridge". (Closes system 7 flag.)
- `docs/content-guide.md` — the condition list was missing hasRival, minAR and keyLeftWithin; the effects table was missing nol.

**Flags (not fixed)**
- [Med] **13 event flags are set but never read**, so these options carry only their downside: lockin (big_customer,
  new_entrant, rival_enters), localised (trade_war "immune later"), lean (recession_warning), controls (fraud), modern
  (legacy_systems), resilient (bio_cmo), privacy (privacy_law, privacy_fine), bribed (bribe), certified (saas_cert, which
  can re-offer certification while you hold it), cloudLock (saas_cloud_credits), ppa (energy_ppa), university (university), cartel
  (rival_cartel). Five investment flags are also unread but harmless: green, intel, offshore, taxScheme, succession.
- [Med] The `dual_sourcing` investment ("Disruptions pass you by") does nothing except add 1.5% to input costs: its `resilient` flag is never read.
- [Low] `events.ts` boardPatience flags (4/6/8 quarters) last no longer than the card's 8-quarter cooldown, so they do nothing, and "four more quarters" sets 6.
- [Low] `customer_bust` recovery (0.05 × S) isn't tied to the write-off: at retail's 2-day DSO the "third" recovered is many times the loss.
- [Low] `exhire_ceo` says "out of your markets for a year", but the effect is a one-off −15% to the rival's share, hitting all its offices if you share no city.

Checks: lint clean · typecheck clean · 279/279 tests · `sim:ci` passes, no red flags.

### 12. UI core — done

(The run was interrupted by a usage limit and resumed.)

**Fixed** (regression tests: `tests/audit-ui-core.test.ts`; a browser check was added to `scripts/ui-smoke.mjs`)
- `src/ui/store.ts:145` — **keyboard controls behind a dialog stayed live.** When the quarterly report opened, focus stayed on
  *End quarter*, so pressing Enter or Space played another quarter underneath the report. Two quick Enters ran the turn twice,
  doubling the autosave, rewind snapshots and sounds. Controls are now inert while a quarter resolves or behind an open
  `.modal` (tooltip glossary links still work). Confirmed in Playwright (turn 1 → 2 with 2 worker posts before the fix; stays at 1 after). The new smoke check fails on the old code.
- `store.ts:161` — moving a slider while a quarter was resolving showed "Price set to 106%…" toasts, then the change was lost when the result arrived. Input is now ignored while busy.
- `src/ui/tips.ts:14` `runway` — with cash below zero, HQ said "-0.9 quarters of cash left." Clamped at 0.
- `src/ui/kit.ts:135` `logo` — the monogram cut an emoji in half (broken glyph in the header for a name starting with an emoji).
- Browser sweep: 3 industries plus a crafted save with an XSS payload in every name-like field, 36 screens, about 1,100 tooltips. **No
  injection**, no NaN/undefined, no console errors. After game over, browsing shows no "The game is over." toasts. No `eval`/`new Function` anywhere.

**Flags (not fixed)**
- [Low] `hq.ts:62` — the seed is escaped twice, so a seed containing `&` or `'` shows as `&amp;`. → system 13
- [Low] `files.ts` `saveNow` skips saving while busy, so reloading for an update or closing mid-quarter loses decisions made in the 0.7 s before *End quarter*.
- [Low] Dialogs don't take keyboard focus (accessibility).
- [Low] `kit.ts` `delta` points the wrong way for a negative base (only used for revenue today); `lineChart`/`spark` would write NaN into the SVG if the data had NaN (not seen).
- [Low] `engine/src/util.ts` `money` shows "−$0" for tiny negatives and "$1000K" at rounding edges.
- [Low] `update.ts` — the HTML is fetched network-first, so the "new version" prompt can appear after the page already loaded the new build.

Checks: lint clean · typecheck clean · 282/282 tests · build OK · smoke passes (phone, desktop, offline), re-run by coordinator.

### 13. UI gameplay screens — done

**Fixed** (regression tests: `tests/audit-ui-screens.test.ts`, 10 tests, all failing on the old code)
- `hq.ts:62` — the world seed was escaped twice (`x&y'z` showed as `x&amp;y&#39;z`). (Closes system 12 flag.)
- `ops.ts:199` — the close-office confirm said "two quarters of rent". The engine also charges 2× facility costs ($110K of a $522K
  exit cost in the repro), writes off stock, and cuts reputation and culture. The dialog now says all of it. (Closes system 5 flag.)
- `rivals.ts:68` — the "Build the relationship" price ignored inflation: it showed $2.5K and charged $3.75K. Now uses `scaleS`.
- `rivals.ts:33` — after buying a rival (or its bankruptcy), its page stayed open with Buy/Sue buttons, and every click said "No such rival."
- `map.ts:89`, `invest.ts:92` — "Open"/"Buy" were offered in a city where a franchisee runs your stores (the engine refuses both).
- `invest.ts:84` — "Offer open for 0 more quarters." in a deal's last quarter.
- `invest.ts:57` — an investment still starting up showed an ongoing cost the engine doesn't charge yet, and said "1 quarters".
- `ops.ts:131` — a plant in its last quarter of building showed "(ready in 0 qtr)".
- `regions.ts:40` — a partner showed "until 8 quarters from now" when its last quarter is 7 away; it now shows the quarter label, like truces do.
- `hq.ts:92`, `rivals.ts:98` — in a scenario, or a game kept going after a win, HQ showed "Closest goal" and Goals said "the first goal you
  reach wins", which the engine never awards there.
- Text only, checked against the engine: the asset-finance tooltip and the map's finance button now mention the 1% loan fee, the plant-sale
  tooltip shows 98% after fees, the exec hiring fee (1.2× salary) is stated, and the layoff dialog says open positions are closed.

**Flags (not fixed)**
- [Low, design] Licensing is offered only for biotech though the engine licenses any staged project; the policies screen doesn't warn that option pay at a low valuation dilutes up to 20% a quarter.
- [Low] `actions.ts` `scout` — results arrive 2 end-quarters later, not 1 as "Takes one quarter" says.
- [Low] `mechanics.ts` `lockInputs` — before the first quarter closes, the fee is $0.
- [Low] Poach, sue and lobby costs aren't shown, and `lobbyAgainst` has no cash check.
- [Low] Action buttons stay visible after game over; clicking one just shows "The game is over."

Checks: lint clean · typecheck clean · 292/292 tests · build OK · smoke passes (re-run by coordinator) · Playwright sweep of 19 states and about 13,000 tooltips: no NaN, undefined, double escapes or console errors.

### 14. UI meta screens — done

**Fixed** (regression tests: `tests/audit-ui-meta.test.ts`, 8 tests, all failing on the old code; plus a smoke check)
- `title.ts:131,148` — after typing a company name, **the first click on Next did nothing** (the form re-rendered under the pointer),
  and with the name cleared, Next stayed greyed out while typing. Name edits no longer re-render, and a blank name shows a toast. A new smoke check fails on the old code.
- `modes.ts:80` — a Daily dialog left open past midnight (tested in Auckland) showed one company but started the next day's. Start now uses the date on screen.
- `modes.ts:51,72` — the Daily card promises "Ironman: one go", but starting again made a fresh copy. The day's game is now remembered on the
  device and the button becomes "Open today's company". (Closes system 10 flag.)
- `engine/src/modes.ts:63`, `modes.ts:107` — after *Keep playing*, a Daily's score code was hidden for good. It now keeps the frozen code and shows it in the menu. (Closes system 9 flag.)
- `modes.ts:192,218,224` — medal text claimed Brutal alone gives gold. It now matches the engine: Brutal or the bonus gives silver, both give gold. (Closes system 9 flag.)
- `modes.ts:196` — a finished game reopened from a save lost its "Replay the last year" buttons.
- `files.ts:102` — Delete removed a save in one tap; it now asks first.
- `engine/src/save.ts:32-50` — damaged imports showed raw TypeError text, or opened a blank screen and **wrote a broken autosave**
  (9 cases tried in the browser). Key fields are now checked, with a plain-language error. (Closes system 10 flag.)

**Flags (not fixed)**
- [Low] `advisor.ts:192` — the review can say "Weaker operations: EBITDA margin up from 3% to 9%" (contradictory wording).
- [Low] `storage/saves.ts` `meta` — slot labels for finished games are a quarter late ("Y1 Q3" for a game that ended at Y1 Q2).
- [Low] A continued Daily that later goes bankrupt replaces its code with F0 (engine).
- [Low] Design: a Surprise-me seed can't be typed back in; a friend has to copy the recap.
- [Low] Tutorial steps tick when an action is *tried*, even if refused; "−" on hiring counts.
- [Low] The Daily code box and glossary search re-render on change, so the next click is lost (same pattern as the title fix).
- [Low] Medals and the one-go record are lost if browser storage is off.

Checks: lint clean · typecheck clean · 300/300 tests · build OK · smoke passes (phone, desktop, offline), re-run by coordinator.

### 15. Tooling, build & PWA — done

**Fixed** (regression tests: `tests/audit-tooling.test.ts`; plus checks inside the scripts)
- `vite.config.ts:40` — the service worker's install step filled the new cache from the browser's HTTP cache. GitHub Pages lets browsers keep
  files for 10 minutes, so an update found inside that window cached the *previous* build's page, which points at JS files deleted along with
  the old cache: **the installed app would not start offline after an update.** Confirmed with a Playwright deploy simulation (max-age=600
  server); it now fetches with `cache: 'reload'`.
- `scripts/sim.ts:95` — results came back in worker order, so report row order depended on the core count (3 vs 4 workers gave different
  docs; the numbers were identical). Results are now restored to job order.
- `sim.ts:102,156` — a flag given last with no value crashed or gave NaN, and `--seeds 0`/`abc` ran zero games and *passed* with no red flags. Both now fail clearly.
- `sim.ts:159,374` — any reduced run (fewer seeds, bots or founders, `--turns 60`) overwrote the committed reports and `winrates.json`
  with the current fingerprint, so `sim:check` passed on a reduced grid. Only the full default grid writes now. (Coordinator checked: it still
  requires every difficulty and industry, and the defaults, 12 seeds and 100 turns or a Sprint, qualify.)
- `sim.ts:68` — the fingerprint hashed paths with the OS separator, so on Windows `sim:check` would always report stale. Paths are normalised; the Linux hash is unchanged.
- `scripts/ui-smoke.mjs:17-20` — `server.kill()` killed npx but left `vite preview` running, so the next run was refused the port and
  **tested the stale server**. It now runs vite directly, kills it on exit, and fails if the server didn't start.
- `ui-smoke.mjs:98,111` — the event-card and price-slider checks could be skipped silently; they now fail instead.
- `scripts/fmt-json.mjs:9` — long objects wrote undefined members as `null`, unlike `JSON.stringify`. Data files re-format identically.
- `.github/workflows/ci.yml` — `pages: write`/`id-token: write` moved from the workflow to the deploy job only (the test job runs third-party packages).
- Housekeeping (coordinator): two orphaned `vite preview` servers left by the subagents' probe scripts were stopped.

**Flags (not fixed)**
- [Low] Playtest's random-action player never takes the company public, so `buyBack`/`followOn`/`setGuidance` are never exercised there.
- [Low] `index.html` — the `black-translucent` status bar puts white status text on the light background on iOS.
- [Low] `sim.ts` — a worker that exits without sending results hangs the run; `playtest --out` given last silently writes nothing.
- [Low] CI cancels in-progress runs on `main`, which can cancel a Pages deploy mid-way; `package.json` has no `engines` field.

Checks: lint clean · typecheck clean · 305/305 tests · build clean, no warnings · smoke passes, including offline · `sim:ci` passes, no red flags (re-run by coordinator) · `playtest --quick` 528 games, no problems.
