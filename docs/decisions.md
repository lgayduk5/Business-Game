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
