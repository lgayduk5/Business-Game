# Changelog

## M6 — Polish, balance, tutorial, offline

- Balance pass with the harness across all seven industries and four difficulties
  (`docs/balance.md`): economy-wide productivity growth so labour-heavy industries no
  longer erode for ever; smarter, industry-aware bots; energy given a path to victory
  and a lower IPO bar; a scale requirement for the 25-year finish.
- First-game tutorial: a self-completing checklist on HQ.
- Generated logos for your company and every rival.
- Offline verified end to end in the browser test (install, cut the network, play a
  quarter); fixed a service-worker cache-matching bug it uncovered.
- Manifest, icons and relative paths checked automatically.
- Notes for wrapping as a native app with Tauri (macOS) and Capacitor (iOS, Android).

## M5 — All industries, 150+ events, advisor, post-mortem, saves

- All seven industries playable, each with distinct economics: SaaS, restaurants and
  retail, manufacturing, logistics, clean energy, consulting, biotech. Calibrated with
  the harness so each can be won and each can go broke in its own way.
- Project and equipment finance for plant builds; borrowing-base credit lines.
- Event deck expanded to 162 (119 in the random deck, the rest arriving as
  consequences or rival moves), including six or more events specific to each industry.
- Advisory board: quarterly notes from your executives explaining revenue moves, cash
  versus profit, covenant headroom, capacity limits, morale, technology, rivals and
  the cycle, with glossary links.
- Glossary of 64 terms.
- End-of-game review: attribution of value to market, strategy, execution and luck,
  the moments that mattered, and lessons drawn from what happened in your game.
- Six scenario challenges: Profitable and broke, The rate shock, Blitzscale, The
  turnaround, Phase III, Build the network.
- Seeded random start ("Surprise me").
- Saves: IndexedDB autosave every quarter, three manual slots, export and import of
  save files, continue from the title screen.

## M4 — Rivals, interactions, victory, difficulty

- Four to six rival companies per game with distinct personalities: aggressive
  expander, cost-cutter, innovator, predatory acquirer, cautious conservative,
  venture-backed disruptor. They price, hire, invest in R&D, expand, borrow, buy each
  other and go bankrupt on the same economics as you.
- Interactions as decisions: price wars, talent poaching, lawsuits, lobbying, smears,
  supplier lock-ups, copying, takeover offers and hostile bids, truces, alliances,
  cartels (and dawn raids), mergers. Hostility escalates and rivals retaliate.
- Your moves: build relations, propose truces and alliances, poach, sue, lobby, and
  bid for rivals (friendly or hostile).
- Six competitive victory conditions with progress on the new Goals screen and HQ.
  You can keep playing after a win.
- Difficulty levels (Easy, Normal, Hard, Brutal) change rival size, competence,
  aggression and market defence, starting cash, borrowing costs and investor appetite.
- Board pressure: lose majority control while losing money and the board may remove you.
- Headless AI-vs-AI balance harness (`npm run sim`) with ten scripted strategies,
  including probes for degenerate play; results in `docs/balance.md`.

## M3 — Investments, events, macro

- Investment system: upfront and ongoing cost, ramp-up, four payoff curves (steady,
  back-loaded, decaying, risky), staged projects with gates, and traps whose real risk
  only due diligence reveals. 42 investments in the catalogue (industry-specific ones
  appear as their industries arrive).
- Acquisitions: businesses come up for sale; due diligence, goodwill, integration,
  culture clash, hidden liabilities.
- Event engine and a first deck of 60+ events across macro, market, operational,
  regulatory, opportunity and crisis categories, with multi-option responses, weighted
  outcomes, stat checks and chains.
- Macro layer: shocks (recession, rate moves, inflation, credit crunch, currency
  crises, energy and trade shocks) and an Economy screen with history charts.
- All content validated against JSON schemas in tests. `docs/content-guide.md`
  explains how to add events and investments.

## M2 — World, three tiers, people

- Full world: 19 cities in 6 regions, each with its own wages, rent, tax, regulation,
  talent pool, growth and demand by industry.
- Map screen drawn in SVG with fog of war: unexplored cities need a market study
  before you can open an office.
- Office tier: open and close offices, hiring pipelines, pay policy, training, layoffs.
- Region tier: price position, marketing, supply-chain mode, local distribution partners.
- Corporate tier: loans with covenants, credit rating, revolver, equity rounds with
  dilution, IPO checklist, dividends and buybacks; R&D budgets and new divisions.
- People system: named general managers and executives with skill, loyalty and
  flight risk; retention packages; culture and reputation as company-wide stats.

## M1 — Engine core and first playable

- Deterministic, seeded simulation engine in its own package (`/engine`), no DOM.
- One industry (SaaS) in one region (Chicago, Austin, San Francisco).
- Market model: demand, competitive attractiveness, sticky market share, capacity limits.
- Double-entry ledger; income statement, balance sheet and cash-flow statement that tie
  out every quarter (asserted in tests).
- People basics: hiring pipeline, pay policy, skill, morale, attrition, layoffs with severance.
- Macro basics: business cycle, inflation, policy rate, wage and input indices.
- Minimal playable UI: new-company wizard, HQ dashboard, office management, the three
  statements, quarterly report. Every number explains itself on tap.
- Turns resolve in a web worker. Installable PWA shell with generated icons and a
  build-time service worker.
