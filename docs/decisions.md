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
