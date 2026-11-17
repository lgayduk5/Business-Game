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
