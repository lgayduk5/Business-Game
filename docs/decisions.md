# Decision log

Design decisions made while building, newest milestone last. Each entry: what, and why.

## Before M1

1. **Name: "Going Concern".** The accounting term for a business expected to keep
   operating — which is the whole game.
2. **Engine as a separate package (`/engine`) with no DOM types.** Enforced by its own
   `tsconfig`, so UI code cannot leak in and the engine can run in a worker, in tests,
   and later inside Tauri/Capacitor unchanged.
3. **State is plain JSON; actions mutate it.** Simpler and faster than immutable
   updates for a state this size, and it makes saves and worker transfer trivial.
4. **One seeded PRNG (mulberry32) with its state stored in the save.** Guarantees
   replayable games and makes the balance harness reproducible.
5. **Money in dollars, quantity in "units" of $1,000 at reference price.** Lets one
   market model serve seven industries with different parameters.
6. **Double-entry ledger rather than computing statements from formulas.** Tie-out is
   true by construction and any bug shows up as a non-zero check value in tests.
7. **Real cities, stylised positions.** Real wage/rent/tax differences are part of the
   lesson. Positions are spread out so every city is a comfortable tap target on a phone.
8. **Content in JSON, authored compactly.** Event effects are short tuples such as
   `["cost", 0.05, "ga"]`. Money effects scale with company size (`S` ≈ one quarter of
   revenue, with a floor) so the same event matters at $1M and at $1B.
9. **No UI framework.** Plain DOM with template strings and event delegation keeps the
   bundle tiny and offline-friendly, and avoids any CDN or runtime dependency.
10. **Dev dependencies only (Vite, TypeScript, Vitest, tsx).** Nothing ships to the
    player except our own code.
11. **Milestone data gating.** The engine is written generally from the start, but
    `/data` only contains what each milestone promises (M1: SaaS and one region), so
    every milestone is tested against exactly what it ships.

## M1 — engine core and first playable

12. **Visual identity: "the desk and the board".** Financial screens are green-bar ledger
    paper (alternating pale bands are the row structure, not decoration); the world is a
    board with tokens. Ink navy for type, ledger red for losses (with accounting
    parentheses in statements), and one loud colour — highlighter yellow — reserved for
    the thing you should look at next. The quarterly report arrives as a continuous-form
    printout with sprocket holes; that is the one flourish, everything else stays quiet.
13. **System fonts only**, chosen deliberately: an old-style serif stack (Iowan Old
    Style / Palatino / Noto Serif) for headings and figures, the platform sans for
    labels. Nothing to download, renders instantly offline.
14. **Technology converges to what your R&D effort sustains** (`target = floor +
    slope × log10(1 + research points)`) instead of accumulating forever. Each tenfold
    increase in R&D buys roughly the same step, which gives the Red Queen effect:
    stop investing and you drift back.
15. **Acquisitions are asset purchases** (property + goodwill, no acquired working
    capital). Keeps the indirect cash-flow statement exact; the acquired business then
    has to fund its own receivables, which is realistic.
16. **Prices are relative to a market reference that inflates automatically.** The
    player sets a position (90%, 110%…), not a dollar price, so inflation never forces
    busywork but still squeezes margins through wages and inputs.
17. **`endTurn` runs in a web worker from M1**, with a main-thread fallback, so the
    architecture does not change when rival AI arrives.

## M2 — world, tiers, people

18. **19 cities in 6 regions**, home region visible at the start, everything else under
    fog. A market study costs money and a quarter; it is the "scout" of this game.
19. **The map scrolls sideways on phones** rather than shrinking. Tokens stay large
    enough to tap, and the view centres on the selected city.
20. **Price, marketing and supply chain live at the region level** and are also shown
    on each office page, because that is where the player notices they need changing.
21. **Hiring is a pipeline, not a purchase.** You open requisitions; how fast they fill
    depends on the city's talent depth, your pay policy, your reputation, the labour
    market and how many rivals are fishing in the same pool.
22. **Layoff cost scales with local regulation** (0.5 to 2 quarters of pay) and leaves a
    morale "scar" that decays over about a year, so cutting and rehiring is expensive.
23. **Key people are named and can resign.** Loyalty drifts with culture and office
    morale. A retention package buys a two-year lock-in.
24. **Executives are optional and expensive.** A startup cannot afford a full C-suite;
    hiring one is a scale decision (and a CFO is a hard requirement for an IPO).

## M3 — investments, events, macro

25. **Event money scales with the company** through `S` (about one quarter of revenue,
    floor $250K). A fine of `0.08` stings equally at seed stage and at IPO.
26. **About half of all quarters are quiet** (events arrive at roughly 0.75 a quarter,
    capped at two). That keeps decisions meaningful and makes fast-forward useful.
27. **Options show their trade-off, not their odds.** Uncertain options are labelled
    as such; the exact probabilities stay hidden, as they are in life. Preparation
    (a cybersecurity program, a CFO, a strong culture) visibly tilts them.
28. **Luck is measured.** For every uncertain outcome the engine records realised value
    minus expected value; the post-mortem uses the total to separate luck from judgement.
29. **Traps are honest about being investable.** A trap has a rosy pitch, a real risk
    several times the stated one, and a truth that due diligence reveals for about 1.5%
    of the cost. The lesson is the habit of checking, not memorising which ones are bad.
30. **Staged projects are options.** You pay stage by stage and can stop at any gate;
    the advisor text makes the sunk-cost point explicitly.
31. **Financial investments sit on the balance sheet as securities**, capitalised
    project spend as property depreciated over five years; write-offs go through the
    P&L as non-cash losses so the cash-flow statement still ties.

## M4 — rivals, victory, difficulty

32. **Rivals run on the same market model as the player** (same demand, attractiveness
    and share equations) with a simplified cost model. They differ by personality
    (price, sales and R&D intensity, expansion appetite, leverage, aggression,
    acquisitiveness, grudge) and are tuned per difficulty.
33. **Rivals start "established but within reach":** each office is one to a few times
    the size of the player's starting operation, not a share of the city. Early
    versions sized them by market share and they began 30–60× the player's size.
34. **Escalation is stateful.** Each rival tracks relation (−100…100), hostility (0–10)
    and unanswered grievances. Your attacks (poaching, lawsuits, escalation choices in
    events) create grievances; rivals with a grudge retaliate, usually in your home
    market. Truces and alliances suspend hostile moves for 2–3 years.
35. **One rival action per quarter at most**, delivered as an event card with options,
    so interactions are decisions rather than background noise.
36. **Victory conditions are competitive, not just absolute.** The first harness run
    showed every honest strategy winning on every difficulty because absolute
    thresholds are eventually passed through industry growth and inflation. Now: Titan
    = most valuable company in the industry *and* above a bar; Category king = largest
    world share *and* above a bar; Blue chip = listed, profitable, above the IPO price
    and worth more than half your rivals for two years; Pioneer = technology leader at
    a high bar plus a completed moonshot; Good company = reputation 85, ESG 80,
    profitable, above a revenue bar for two years; Last one standing. Bars scale with
    difficulty and inflation.
37. **Investors price the business, not the cash.** The harness found a money machine:
    raising every round offered compounded the valuation because cash was valued at a
    premium. Pre-money now values operations at the offered multiple and cash at par;
    investors need a growth story or a pipeline and decline companies with more than
    two to three years of runway. The private-company discount applies only to the
    operating business.
38. **Difficulty changes how well rivals are run, not just their size**: sales and R&D
    intensity, operational quality, how many cities they will enter, and how hard they
    defend markets where you are taking share (price cuts and extra sales effort).
    Brutal also charges you a point more on loans and makes investors warier.
39. **Rival operational quality improves over time**, as the player's does through
    skill and training. Without it, a player who invested in quality ended up three
    times as attractive as any rival by year 15.
40. **The balance harness (`npm run sim`) is part of the toolchain.** Scripted bots use
    only player actions. Targets for the best honest strategy: Easy ≈ always, Normal
    ≈ 80–90%, Hard ≈ 60–80%, Brutal ≈ 20–30%. The bots act on exact numbers every
    quarter, so they are stronger than a typical first-time player. Probe bots look for
    degenerate strategies; the report flags any that beat honest play.

## M5 — all industries, 150+ events, advisor, saves

41. **The founding company starts with an established customer base** that fills about
    85% of its capacity. Without enough sales effort to hold it, share drifts down
    towards what the team can sustain, at the industry's stickiness. Doing nothing is a
    slow decline, not instant death. An earlier version bought the starting base with a
    large up-front sales team, which thin-margin industries could not carry.
42. **Head-office cost scales with the organisation** (20–100% of a fixed amount, plus
    a share of revenue). A 15-person restaurant does not carry a corporate HQ.
43. **Firm-level price elasticity is at least 1.25 everywhere.** Below 1, raising
    prices increases revenue as well as margin, so the best price is always the
    maximum. Consulting is 1.8 and biotech 1.25, so the profit-maximising price lands
    near the market rate.
44. **Plant can be financed against itself.** Project finance (70%, 18 years, energy)
    and equipment finance (50%, 7 years, other plant) are offered at the moment of
    building, because ordinary loans sized on EBITDA cannot fund an asset that costs
    five years of revenue. This is how renewables are actually built.
45. **The revolver is a borrowing-base facility.** Its limit follows receivables and
    inventory each quarter, so working-capital-heavy businesses can grow without a
    cash crunch from a stale credit line.
46. **Drug pipelines are valued like real ones**: probability of reaching approval ×
    programme cost × 40, and investors treat a pipeline as a growth story. Licensing a
    programme out pays about a third of its risk-adjusted value.
47. **Industry calibration target:** a starting company roughly breaks even with no
    decisions, and growth is the way to profit. Each industry was tuned with the
    harness until a competent bot can win in all seven, while Passive cannot.
48. **The advisor explains, it does not decide.** Notes come from the CFO, COO, CMO,
    CHRO, CTO and Chair, each tied to a cause (revenue bridge, cash versus profit,
    covenant headroom, the office's binding constraint, rivals, the cycle) and linked
    to glossary terms. It never tells you the right answer to an event.
49. **Attribution splits value created into four buckets each quarter.** Market:
    market growth and investor mood. Strategy: new offices, deals, price positioning
    and the ramp-up of markets entered in the last two years. Luck: event and
    investment outcomes minus their expected value. Execution: the remainder (share,
    costs, margins). It is an approximation and the review says so.
50. **Saves are versioned JSON** (`format`, `v`, `state`) with a migration step that
    fills fields missing from older saves. One autosave per game, kept for the six most
    recent games, plus three manual slots. Export and import move games between devices.
51. **Scenarios are prepared states plus one goal and a deadline.** Each was tuned
    with the bots so that doing nothing fails and good play can succeed. Scenario
    rules (for example "no equity") are hard constraints that end the game if broken.
52. **"Surprise me"** draws industry, city and founder from a random seed. The seed
    also drives the world, so a surprise start can be shared and replayed.

## M6 — polish, balance, tutorial, offline

53. **Productivity grows 0.8% a year across the economy**, matching real wage growth.
    Without it, labour-heavy industries saw costs creep from 58% to 81% of revenue over
    fifteen years whatever the player did. Rivals get the same productivity growth.
54. **Bots know what each industry rewards** (R&D and sales intensity by industry),
    keep a cash reserve sized to their burn, expand only from a profitable base, and
    obey scenario rules. They are a measuring instrument, so they must not lose
    through obviously bad play that a person would not make.
55. **Energy is the slowest industry to win and the safest to survive.** Its growth is
    capital-bound by design; it gets a stronger long-run demand tailwind, a
    utility-sized valuation bar, a lower IPO revenue bar, and a natural ESG edge that
    makes "Good company" its natural route to victory.
56. **The tutorial is a self-completing checklist**, not a modal script: eight steps
    that tick off when the player actually does each thing, with a button to go there
    and a skip link. It never blocks play and is off in scenarios.
57. **Logos are generated**: a shape and a monogram from the company's name, filled
    with the rival's colour (yours in highlighter yellow). No image assets anywhere.
58. **Offline is verified, not assumed.** The browser test installs the service worker,
    cuts the network, reloads and plays a quarter. That test found a real bug: some
    servers mark files `Vary: Origin`, and module scripts are requested with an Origin
    header, so cached copies did not match. The worker now ignores `Vary` when
    serving its own cache.
59. **Native wrappers are documented, not built** (see `docs/native-wrappers.md`). Game
    code needs no changes for Tauri or Capacitor; only the storage module would change
    if native file saves are wanted later.

## Review response (three waves)

60. **Rivals run on the player's economics.** One valuation function, one cost model,
    one set of lenders and investors. Titan is a race against rivals' value, so a
    different formula for them was a hidden thumb on the scale.
61. **A company starts with a year of history**, played on a throwaway copy with no
    events and a calm economy, so the first quarter does not jump the valuation and
    every office has results to read at turn 0.
62. **The game ends in a grade, not a draw.** Rank (40), founder wealth against the
    industry (35) and progress towards a victory (25). A or B wins if the founder's stake
    tripled and revenue doubled in real terms; Sprint ranks by growth and needs the
    stake to grow by half.
63. **Pacing has a measured target: under half of quarters with a card.** Cards
    already waiting count against the draw, rival cards come at most every fourth
    quarter, and small cards (no crisis, rival, financing or ownership change, nothing
    over 4% of a quarter's revenue) can go to the COO, who picks the option with the best
    worst case — a sensible default, never the hidden best answer.
64. **Rewind is a learning tool, not a save-scum.** It is offered from the end screen,
    goes back at most four quarters, is counted, and is off in Ironman and daily games.
    Because the engine is deterministic, only what the player changes changes.
65. **The field never empties.** Entrants arrive at the difficulty's per-decade rate;
    "Last one standing" counts rivals that have lasted three years, so a newcomer does
    not block it.
66. **Personalities are data.** Each personality's hostile-move weights and behaviour
    flags live in `data/rivals.json`, so a new personality needs no code unless it brings
    a new behaviour.
67. **Policies use the investment modifiers.** A policy is a standing set of `InvFx`
    effects, so every system that reads investment effects reads policies too.
68. **The full harness runs 12 seeds per cell.** At 6, several red-flag checks sat on
    their thresholds and flipped with sampling noise.


## Second review

69. **No label excuses an unwinnable cell.** The harness fails any industry on any difficulty where
    the best honest strategy wins less than a floor for that difficulty (Easy 50%, Normal 30%,
    Hard 20%, Brutal 15%). The tier labels (Gentle, Tough, Expert) still have to stay true, but they
    describe how an industry plays; they no longer make a never-won cell acceptable.
70. **Energy ranks by growth, and its rivals start about your size.** In a grid industry every
    unit a plant makes is sold, so capacity is size, and a rival office could not start smaller
    than a whole plant: every energy rival opened with two to four times the player's capacity
    and a fraction of its debt. Grid rivals are now sized to the player (0.7–1.5× its capacity on
    Easy and Normal, 1.5–3× on Brutal), and the end-of-game rank is by growth, as in a Sprint.
71. **Growth is measured on the whole business.** Ranking by growth uses enterprise value
    (equity plus net debt plus the funds' plant stakes), so a project loan does not hide growth
    and raised cash cannot fake it; and against the starting value plus what was paid for
    acquisitions, so buying growth is not making it. Newcomers count against you only once they
    are worth more than you: judged on growth from a seed round, a startup outgrows anyone.
72. **Bots fund the next plant before programmes in a grid industry.** The probe that ignores
    investments was winning energy by building faster, which showed the honest strategies were
    spending energy's scarce capital on sales academies and ERP systems.
73. **Software customers leave a product that falls behind.** Each quarter an office loses up to
    5% of its customers (× 0, 0.25, 0.6, 0.75 by difficulty) to a better product in its market,
    scaled by how far behind it is (all of it at 25 technology points). Rivals churn by the same
    rule. SaaS had ignored difficulty because it was won by riding market growth, not by beating
    rivals.
74. **Size caps the credit rating.** No better than BB below $50M of revenue a year, BBB below
    $250M (in today's money); leverage is measured net of cash; a company with no debt gets 4 of
    the 12 interest-cover points, not all of them. Startups now borrow at B to BB spreads, and
    CCC is left for companies whose earnings do not cover their debt service.
75. **Every victory must be a realistic plan.** Some honest strategy must end at least 10% of its
    games with it on some difficulty. Titan's bar was set as if every industry were worth what
    software is: $1–2B on Normal for retail, logistics, energy and biotech, whose leaders are worth
    $50M–$1B. Each industry now has its own Titan scale, set to what its leaders are worth, and
    Titan compares enterprise values, so raising cash and sitting on it does not make you the
    biggest (the Flipper probe found that at once). Blue chip got its own bar so it did not move
    with Titan; the Pioneer technology bar came down five points, the moonshot costs 8% of revenue
    from $10M of revenue, and a failed moonshot can be tried again.
76. **Founders are compared on identical games.** The old founder table tied each founder to a
    seed number, crediting the founder with that seed's city and luck (the Financier's 51% was
    mostly its seeds). The main grid now rotates founders, and a paired run plays every founder
    on the same 336 games; the gap must stay within 12 points.
77. **A Sprint is graded for ten years.** The same letters for the same standing, but bands about
    eight points lower, growth-rank places five points apart, full wealth marks at 3× in real
    terms, and a winning grade needing the stake up 1.25× (or twice what the typical rival's
    owners got, where the industry went backwards) and revenue up half. Development projects
    run at twice the pace. Victories that need decades or a size lead over bigger rivals —
    Titan, Blue chip, Good company, Pioneer, Last one standing — are not offered; Category king
    can still end a Sprint early. It is now suggested, and the default, for a first company.
78. **Difficulty cards show measured win rates.** The harness writes `data/winrates.json` (honest
    strategies by industry and difficulty, for the full game and for Sprints); the cards read it.
    `npm run sim:check` fails if it, or either report, is stale or lists a red flag.
79. **Grades are A, B, C, D and F.** E is gone; D now starts at 25.

## Third review (playtest across every mode and industry)

80. **An invariant playtest.** `npm run playtest` plays about 1,000 games — the honest bots and a "chaos"
    player who takes random actions with random arguments, in every industry, difficulty and mode,
    every scenario and its Brutal version — and checks after every action, card and quarter that the
    books balance, numbers are finite, the cap table adds up, cards point at things that still exist,
    a save replays identically, the forecast changes nothing, and no text shows "undefined" or an
    unfilled placeholder. It found the bugs below; it runs by hand rather than in CI (a few minutes).
81. **Deferred revenue is refunded, not left as negative receivables.** It can only shrink by being
    earned; when service is cut faster than that, the customers who paid in advance get their money back.
82. **Goodwill is never negative.** Buying plant for less than 60% of what it would cost to build (common in
    energy, where plants are big and valuations small) books the plant at the price paid. The card for
    buying a rival's office charges the price it shows (it charged the plant's value when that was higher).
83. **An A or B means a win.** The growth test (stake ×3 and revenue ×2 in real terms; ×1.25 and ×1.5 in a
    Sprint) used to sit outside the letter, so a game could end "lost" with an A. A high score without the
    growth now stops at C, with a line saying why, and the end screen's rule comes from the engine.
84. **Events about one industry stay in it.** In a company with several industries, a card gated on some of
    them binds to one, and its company-wide effects (share, demand, capacity, prices) apply only there. A
    single-industry company is unaffected.
85. **Rivals that find no market do not enter.** A newcomer that could not open anywhere (every market it
    wanted already crowded) used to stay in the game with its funding and no business, counted in the
    end-of-game ranking.
86. **A finished game takes no more decisions.** Cards still waiting are cleared when the game ends (a
    takeover offer could otherwise turn a win into a sale), and cards about a rival that is gone, an office
    that closed, a person who left or a loan that was repaid are dropped.
