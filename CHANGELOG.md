# Changelog

## Second review

Status per item in `docs/review-response.md` (second review section); design choices in decisions 69–79.

- **Energy is winnable.** Grid rivals start about your size (they opened with two to four times your plant),
  the end-of-game grade ranks energy by growth, and the bots fund the next plant before programmes.
  Honest strategies now win 100 / 77 / 48 / 23% of energy games (Easy to Brutal), up from 46 / 4 / 0 / 0%.
- **The harness fails unwinnable cells.** Every industry on every difficulty: the best honest strategy must
  win at least 50% / 30% / 20% / 15% (Easy to Brutal), whatever the label. Every victory must be a realistic
  plan (some honest strategy ends 10% of its games with it on some difficulty). Founders are compared on
  identical games and must stay within 12 points. `npm run sim:check` fails on a stale report or any red flag.
- **SaaS respects difficulty.** Customers leave a product that falls behind the best in its market, more on
  harder levels; rivals churn by the same rule. SaaS: 100 / 98 / 85 / 33%, down from 100 / 100 / 98 / 92%.
- **Difficulty cards** show the measured win rate for the industry (and length) you picked, from
  `data/winrates.json`; the victory bars fold behind "Show victory bars"; the stray ";" is gone.
- **Credit ratings:** size caps the rating (BB below $50M of revenue, BBB below $250M), leverage is net of cash,
  and no debt earns only part of the interest-cover points. Startups borrow at B–BB; CCC is for companies that
  cannot cover their debt service.
- **Founders:** the Scientist, Heir, Financier and Engineer are stronger and the Operator a little weaker;
  on identical games every founder now wins 67–72% (was 58–75%).
- **Titan and Pioneer** are realistic plans: Titan's bar follows what each industry's leaders are worth and
  compares enterprise values (Blue chip has its own bar), the Pioneer technology bar is lower, and the moonshot
  is cheaper, open from $10M of revenue, and can be retried.
- **Sprint is in line with the full game** (best honest strategy 87 / 76 / 54 / 36%, against 95 / 86 / 70 / 35% in the full
  game) and suggested, and the default, for a first company: ranked by growth against the companies you
  started with, graded for ten years, development at twice the pace, and Category king the one early victory.
- **Polish:** Corporate's seven sub-tabs are grouped into Money, Growth and Organisation; grades are A, B, C,
  D and F; "Found a new company" is the first button on the title screen, with a pointer to the five chapters.

## Review response — three waves

Everything the panel review recommended, with status per item in `docs/review-response.md`.

- **Fixes:** buyback cap table, slider focus, phone overflow, saving mid-quarter and on
  close, an update prompt for the installed app, scenario turn handling.
- **Honesty:** difficulty cards with the real settings and measured win rates; industry
  difficulty chips; every event option shows what it costs.
- **Rivals on your rules:** the same cost lines, valuation function, lenders and
  investors as the player; valuations blend revenue and EBITDA multiples and respond to
  interest rates; tax by country; the Canadian dollar; a variable IPO pop.
- **A year of history** before the game starts, so turn 0 shows a trading business.
- **Balance:** Easy, Normal, Hard and Brutal on their targets; consulting gets credit
  lines, retainers and factoring; energy gets plant-level project finance and capital
  recycling. The harness runs 12 seeds per cell and flags any probe that reaches a
  victory more often than honest play.
- **Pacing:** fewer than half of quarters open with a card; small cards can go to the
  COO; rival moves arrive at most every fourth quarter.
- **Information:** a next-quarter forecast on each office, year marks and toggles on
  charts, office cards on phones, a tutorial that retires after two years.
- **Endings and modes:** a graded A–F ending; Sprint (ten years); Ironman; a daily
  challenge with a shareable score code; rewind the last year from the end screen; a
  five-chapter Learner campaign; scenario medals, Brutal versions and a consulting
  scenario.
- **Competitors:** startups and a late Big Tech giant enter mid-game; every new division
  has incumbents; rivals change CEOs, list, spin off, suffer scandals; five new
  personalities; your nemesis on HQ with the history of the feud.
- **Content:** ten new event cards including a take-private exit and activist
  investors; company policies, earnings guidance, stock options, input-price locks,
  franchising, consulting tenders and yearly PPA auctions.

Not yet done: industry tech trees, named key customers, and the five new industries.

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
