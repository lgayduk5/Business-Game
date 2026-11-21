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
85. **New plant is valued at cost until a year of its sales is in the accounts.** Valuation works from the
    last twelve months, and took the greater of the operating value and the asset value, so a plant built
    on borrowed money counted for nothing while its loan counted in full: an energy company's valuation sat
    at zero for most of a year after every expansion. Plant under construction, and the part of new plant
    the trailing year does not yet reflect (tapering over four quarters), now count at cost — for rivals
    exactly as for the player.
86. **Rivals that find no market do not enter.** A newcomer that could not open anywhere (every market it
    wanted already crowded) used to stay in the game with its funding and no business, counted in the
    end-of-game ranking.
87. **A finished game takes no more decisions.** Cards still waiting are cleared when the game ends (a
    takeover offer could otherwise turn a win into a sale), and cards about a rival that is gone, an office
    that closed, a person who left or a loan that was repaid are dropped.
88. **Energy is Tough, not Expert.** With new plant valued at cost (85), investing no longer costs you at the end
    of a game, and energy plays like the other tough industries: honest strategies win about three games in four
    (Sprint: about seven in ten), above the Expert band. The label follows the measurement, as the harness requires;
    the Expert tier stays defined for a future industry. The same change lifted retail, which had sat on the Tough
    ceiling since the second review, a point over it; local independents are a little stronger (fringe 14 → 15),
    which brings it back inside.
89. **New plant does not move the valuation by itself.** The playtest noted honest Easy energy games losing four
    fifths of their value the quarter they opened a plant ($9.8M → $2.0M, then $0.5M), quadrupling a year later
    ($26M) and falling back ($5.7M). No cash event explains it: the bot sold part of its first plant to a fund and
    opened a second, 70% financed against it. Valuation read the trailing year three ways it should not have,
    each now fixed for rivals exactly as for you:
    - *Opening costs* (an office's setup, the project-finance fee, and what the office costs to run before its
      first sale) sat in the trailing year's EBITDA. Through the margin factor a one-off $0.4M cut the multiple on
      the whole business by 40% for a year, then lifted it again when it dropped out. Valuation now looks through
      them, as analysts do with pre-opening costs (the fee would be capitalised with the plant). They are still
      costs in the accounts and still leave the bank. Rivals pay theirs out of cash and sell from their first
      quarter, so theirs never reached EBITDA.
    - *The year at cost started a quarter early.* A new office cannot sell until its first staff arrive, the
      quarter after it opens, yet its plant was already carried at three quarters of its cost. The year now runs
      from the first quarter of sales (the quarter it opens for a rival, whose office trades at once).
    - *A new grid plant's sales read as growth.* A grid plant sells its whole output from its first quarter, so a
      second plant doubles sales at a stroke, and the growth factor re-rated the whole company (2.6× the multiple)
      while the same plant was already carried at cost, then wore off over the next year. Growth is now
      like-for-like, as retailers report it: a new office in a grid industry joins once both years compared
      include its sales (two full years). Elsewhere a new office wins its customers over time, which is growth.
      An expansion still counts too: its sales cannot be told from the rest of the office's (attributing them by
      share of capacity overstated them while the crew lagged the plant, and made matters worse).
    In `npm run playtest` the honest strategies' quarters where the value moved 4× or more fell from 106 to 51
    (energy 85 → 32; Easy energy 24 → 3). The reported game now moves at most 1.5× in a quarter ($9.8M → $7.6M →
    $4.9M …). Balance barely moves: energy wins 74% (was 76%; Sprint 70%, was 72%), every other industry within two
    points.
90. **What still moves 4× in a quarter is real.** In biotech it is trial results: a failed phase takes the
    pipeline's value with it. In consulting on Hard and Brutal it is losses, as EBITDA turns negative under debt.
    In energy it is leverage: the project loans and the funds' stakes in the plants are 60–90% of what the
    business is worth, so the shares are a thin slice, and an ordinary 10–20% move in the business moves them
    fourfold. In 29 of the 35 remaining cases outside biotech and consulting the business itself moved by less
    than 1.5×, and the moves are its own: margins falling as costs grow, early growth wearing off once a plant is
    full (no longer hidden by the new plant's sales), an expansion's growth, and a new plant that, valued on its
    sales, is worth less than it cost (a $13M plant in Tokyo sells $2.7M a year). The carry at cost also runs off a
    quarter at a time while a new office's first quarter of sales is only part of one (its crew is still arriving),
    which deepens the dip a little. The playtest keeps the note, which is what it is for. One more source is a
    scenario quirk: the rate shock seeds its year of history with the founding office's two operators running a
    2,600-unit portfolio, so its first quarters read as doubling sales. Staffing the portfolio makes the scenario
    trivial (a player who does nothing survives it), so that waits for a rebalance of the scenario.

## Sound

91. **Every sound is synthesised from code; the project ships no audio files.** `src/sounds.ts` writes
    oscillators, filtered noise and envelopes straight into sample buffers. Nothing is recorded, sampled
    or taken from a sound library, so there is nothing to license or attribute, the build stays small,
    and the sounds work offline like everything else. A test fails if an audio file is ever added. The
    tunes are short arpeggios on one scale written for this game; the old cash sound (a short-then-long
    square-wave rise of a fourth) was close to a famous platformer's coin and was replaced.
92. **One palette, from the desk.** Paper, a pencil, a rubber stamp, a cash drawer, coins, a mallet, a
    desk bell and a dot-matrix printer: the same "desk and board" the screens are drawn as. Pitched sounds
    share C major pentatonic, so two that overlap never clash. No square or sawtooth waves: sines,
    triangles and soft partials only.
93. **How often a sound can happen sets how loud and long it may be.** Five tiers — touch (navigation),
    controls (settings), actions (money, plant, people), moments (cards, milestones) and endings — each
    with a ceiling on peak level and length. Each sound's loudness is written in its definition and the
    render is scaled to it, so mixing is a decision rather than an accident; a test checks that each tier
    is louder than the one before. Navigation sits about 25 dB under full scale, the end of a game about 12.
94. **A sound says what kind of thing happened, not just that something did.** Money in rings the
    drawer; money out by choice is counted out; building knocks; a filed decision is stamped; a yes is a
    handshake; giving something up is two low tones; anything refused (every red message) is a muffled
    knock, so a failed tap is noticed without reading. Answering a card stamps it, then a sparkle or
    falling notes say whether the dice beat the odds — matching the sentence the card shows. The printer
    plays once per report (once for a whole fast-forward). A heartbeat follows it when the quarter closed in
    the red, because one more such quarter is insolvency (never in a sandbox, where it is not).
95. **Some things are deliberately silent:** closing a dialog, typing, scrolling, the rivals' moves, news,
    autosaves and the update banner. Sliders notch as they move (one notch per twelfth of their range,
    rising in pitch) and stay quiet on release. Opening any dialog is a pencil tap unless it brings its own
    sound. A sound never repeats on itself within its guard time (a double tap plays once), and no more
    than eight play at once.
96. **Good manners on phones.** Safari's audio session is set to ambient, so the game mixes with the
    player's music or podcast instead of stopping it and follows the ringer switch. The audio context
    wakes on any tap (so a sound after the quarter is worked out still plays on iOS), is suspended when the
    game is hidden, and after twenty quiet seconds, to save battery. Sounds are rendered on first use and
    kept: the longest takes about 10 ms.
97. **Off, Soft or Normal**, in the menu and on the title screen, replacing the on/off switch (which it
    honours). Soft is about 7 dB under Normal. Menu → Sound → *Hear every sound* plays each one and says
    where it is used; `npm run sounds` writes them all to WAV files for listening outside the game.
