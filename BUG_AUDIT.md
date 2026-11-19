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
- [ ] 2. Accounting & finance — `books.ts`, `finance.ts` (loans, covenants, rating, equity, IPO), `exit.ts`
- [ ] 3. Market, macro & modifiers — `market.ts`, `macro.ts`, `mechanics.ts`, `mods.ts`, `policyData.ts`
- [ ] 4. People / HR — `people.ts`
- [ ] 5. Player actions & new-game setup — `actions.ts`, `newgame.ts`, `difficulty.ts`
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
