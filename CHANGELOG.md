# Changelog

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
