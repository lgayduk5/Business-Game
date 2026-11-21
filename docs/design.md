# Going Concern — design

A single-player, turn-based business strategy game: Civilization for running a company.
One turn is one quarter. You found a company in one city and one industry, grow it across
19 cities in 6 regions, and compete with AI-run rivals. The simulation is meant to be
realistic enough that playing it teaches finance, economics and management.

## Architecture

```
/engine   deterministic simulation. Pure TypeScript, no DOM, no I/O. Its own package.
/data     all content as JSON: industries, cities, investments, events, founders, rivals…
/src      the UI (plain DOM + CSS), sound synthesised from code, storage, and the web worker that runs turns
/tests    headless unit tests (Vitest) and data validation
/scripts  icon generator, JSON formatter, AI-vs-AI balance harness
/docs     this document, decision log, balance report, wrapper notes
```

- **State is one plain JSON object** (`GameState`). Saving is `JSON.stringify`.
- **Determinism**: every random draw goes through a seeded PRNG whose state lives in
  `GameState.rng`. Same seed + same actions = same game, on any device.
- **The engine never touches the DOM.** `engine/tsconfig.json` excludes DOM types so a
  stray `document` fails the type check. The UI calls engine *actions* (pure functions
  that mutate a state and return `{ok, msg}`) and sends the state to a **web worker**
  for `endTurn`, so rival AI and market resolution never block a phone's UI thread.
- **Content is data.** Adding an event, investment or industry means editing a JSON
  file in `/data`; schemas live in `/data/schemas` and are checked by the tests.

## The turn

1. *Plan.* The player answers pending events and adjusts offices, regions and
   corporate policy.
2. *End quarter* (in the worker): macro step → rival decisions → market resolution →
   people (attrition, hiring, morale) → costs and accounting → debt service, covenants,
   tax → investments and R&D → valuation → victory/defeat checks → advisor analysis →
   draw events for next quarter → autosave.
3. *Report.* A turn summary, the advisor's explanation of what moved, then any events.

## Three tiers

| Tier | Decisions |
| --- | --- |
| **Office** (city × industry) | hiring by role, pay policy, training, capacity, GM |
| **Region** | price position per industry, marketing budget, supply-chain mode, partners |
| **Corporate** | debt, equity, IPO, dividends, R&D, investments, M&A, executives, diplomacy |

## Market model

One *unit* is $1,000 of sales at the reference price, so industries are comparable.
For each city × industry market:

```
demand   = base × pop × income × city fit × city growth × industry trend × cycle
A_i      = (organic + effort^0.8) × (quality/ref)^wq × brand^wb × price^(−elasticity) × presence
target_i = A_i / (Σ A + local incumbents)
share_i += stickiness × (target_i − share_i)        // sticky customers move slowly
sold_i   = min(share_i × demand, capacity_i)        // capacity = people × productivity, or the plant
```

Every factor is stored with the result so the UI can explain any number.

## Accounting

A small double-entry ledger (`engine/src/books.ts`). Every transaction is a balanced
posting, cash movements are tagged operating / investing / financing, and each quarter
closes into a P&L, balance sheet and indirect cash-flow statement. Two identities are
asserted every turn in tests: `assets = liabilities + equity`, and
`indirect CFO = direct operating cash`. Working capital is explicit (receivables,
inventory, payables, deferred revenue), which is what makes it possible to go bankrupt
while profitable.

## Systems

- **People**: requisitions fill from a city talent pool that depends on pay, brand and
  the labour market; skill, morale, attrition, layoffs with severance and scars, named
  key people with flight risk, culture as a company-wide stat.
- **Finance**: revolver, term loans, bonds, venture and project debt with covenants;
  credit rating → spread; private rounds with dilution; IPO; share price vs. expectations.
- **Investments**: upfront/ongoing cost, ramp, payoff curve (steady, back-loaded,
  decaying, risky), staged R&D with gates, and traps whose real risk only due diligence reveals.
- **Macro**: output gap, inflation, policy rate (Taylor rule), credit spreads, market
  sentiment, commodity and energy indices, regional cycles and currencies, shocks.
- **Events**: a JSON deck with conditions, multi-option responses, weighted outcomes,
  stat checks and chains.
- **Rivals**: 4–6 companies run on the same economics with distinct personalities;
  hostility escalates and they retaliate.
- **Fog of war**: unexplored cities show only rumours; rival detail needs presence or intel.
- **Learning layer**: advisor attribution each turn, glossary, post-mortem that splits
  the result into market, strategy, execution and luck.

## Build plan

M1 engine core + minimal UI · M2 world, tiers, people · M3 investments, events, macro ·
M4 rivals, victory, difficulty · M5 all industries, 150+ events, advisor, saves ·
M6 polish, audio, balance, tutorial, offline QA.
