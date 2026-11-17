# Changelog

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
