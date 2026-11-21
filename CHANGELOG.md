# Changelog

## After the merge

Design choice in decision 99.

**Balance**
- **Retail is Tough again.** The bug audit's rival fixes had lifted it just over the Tough band's 80% ceiling. Its local
  independents are now twice as strong (fringe 15 → 30): honest strategies win about three retail games in four (76%;
  Sprint 55%, was 61%). A new company's first year plays the same; growing is what gets harder. Other industries are
  unchanged.

## Music

Design choice in decision 98; how it works in [docs/music.md](docs/music.md).

- **A soundtrack,** synthesised live like the sound effects: no audio files, nothing extra to download, works offline.
  - **Title theme** (*Opening Bell*): felt piano and strings, a struck bell at the top of each phrase.
  - **At the desk** (*Paper Minimalism*): interlocking marimba lines over a bowed drone. It changes arrangement with the
    game: brighter in a boom, sparser and minor in a slowdown or recession, a low ostinato and a ticking clock when
    there are under two quarters of cash left.
  - **Cues** for the quarter close (neutral, a record quarter, a loss), event cards, victory and insolvency.
- **Event cards duck the music** and muffle it until the card is closed.
- **A music switch** in the menu and on the title screen. Music follows the sound setting: *Soft* plays it
  quieter and *Off* silences it too. Music starts at the first tap and pauses while the game is in the background.

## Sound

Design choices in decisions 91–97.

- **A new set of light sound effects**, all synthesised from code as you play (no audio files, nothing to
  license), in one palette taken from the desk: paper, pencil, rubber stamp, cash drawer, coins, mallet, desk
  bell and dot-matrix printer. Pitched sounds share one scale, so overlapping sounds never clash.
- **Quiet where it is frequent.** Moving around is a page turn or a pencil tap at the edge of hearing;
  settings click; money, building, decisions and people each have their own short sound; only cards,
  milestones and the end of a game are louder. No buzzy square or sawtooth waves any more.
- **New places with sound:** sliders notch as they move, + and − count up and down, switches click on and
  off, sub-tabs and dialogs tap, repaying debt and buybacks count coins out, policies are stamped, research
  is pencilled, "Surprise me" rolls dice, rewinding winds back, each checklist step on HQ ticks, and a
  heartbeat follows the report when the quarter closed in the red. Anything refused (every red message) is a
  soft muffled knock. After you answer a card, a sparkle or falling notes say how the dice fell.
- **Sound: Off, Soft or Normal** in the menu and on the title screen, with *Hear every sound*: every sound,
  what it is and where it plays. Your earlier on/off choice is kept.
- **Kinder on phones:** on iPhone and iPad the game no longer pauses your music or podcast, and follows the
  ringer switch; audio sleeps while the game is hidden or quiet.
- `npm run sounds` writes every sound to `shots/sounds/` as WAV files. Tests check each sound's level,
  length, clean start and end, and the order of loudness; the browser smoke test checks that interactions
  play their sounds and that Off is silent.

## Third review: playtest across every mode and industry

Design choices in decisions 80–90. Found by a new invariant playtest (`npm run playtest`): about 1,000 games of the
bots and a random-action player in every industry, difficulty and mode, checked after every action and quarter.

**Bugs**
- **Negative receivables** in software (and anything with prepaid revenue) when revenue fell sharply: deferred
  revenue unwound with nothing earned against it. Customers who paid in advance are now refunded.
- **Negative goodwill** after buying a rival or a deal target for less than its plant was worth (common in energy).
  The plant is booked at the price paid.
- **"Buy their office" charged more than the card said** (the plant's value when that was higher than the price shown,
  even beyond the 80%-of-cash cap). It now charges the price on the card.
- **Takeover offers read "an offer for the whole company: , cash"** when the company was valued at nothing. Offers now
  name a price (never under about $290K in today's money), and a blank amount can no longer appear.
- **Ghost rivals:** a newcomer that found every market crowded entered with its funding and no offices ("has entered
  Software in ."), and counted in the end-of-game ranking. It now does not enter.
- **Grade A, result "lost":** the growth test sat outside the letter. A high score without the growth now stops at C
  and says why; the end screen's rule was also wrong for a Sprint (it showed the full game's bands and growth test).
- **Cards for a company with several industries** applied to the wrong one: a software "renewals are slipping" card
  cut share in a retailer's stores, a biotech card's technology gain went to the primary industry. Industry cards now
  stay in their industry (single-industry games are unchanged).
- **Cards that no longer apply** (a rival bought or bankrupt, an office closed, a person gone, a loan repaid) stayed in
  the queue; a lawsuit against a rival that no longer exists now lapses with a note.
- **After the game ended,** decisions still waiting could be taken (a takeover offer could turn a win into a sale), and
  the header showed the quarter after the last one.
- **Valuation fell to zero for most of a year** after an energy company built a plant on borrowed money: the loan
  counted at once, the plant only once a year of its sales was in the accounts, so investing near the end of a game
  lowered your grade. New plant now counts at cost until then, for rivals as for you.
- **Valuation fell 80% the quarter a plant opened, then quadrupled a year later** (honest energy games, Easy
  included): what it cost to open sat in the trailing year and cut the multiple on the whole business, its year at
  cost began before it could sell, and a new grid plant's sales were read as growth. Valuation now looks through
  opening costs, carries new plant at full cost until its first sale, and measures growth like-for-like, for rivals
  as for you (decision 89). What still moves 4× in a quarter is real: trial results, losses under debt, and the thin
  equity of a heavily borrowed energy company (decision 90).

**Balance**
- **Energy is now labelled Tough** (it was Expert): without the end-game penalty on investing, honest strategies win
  about three energy games in four. Retail's local independents are a little stronger, keeping it inside the Tough band.
  With growth measured like-for-like energy wins 74% (Sprint 70%); nothing else moves more than two points.

**Teaching text**
- The CFO's "cash against profit" note described every driver in one direction ("+$36K from more inventory on the
  shelves" when stock had fallen). Each driver is now worded the way it moved.
- "About $10.5M of sales went unserved" (on $595K of revenue) described demand the office could win over time, not
  sales lost that quarter; it now says "customers would buy about $X a quarter more than you can deliver".
- "Profitable" no longer promises losses carried forward when there are none; the AI-tools card no longer says
  software customers "pay for hours".

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
