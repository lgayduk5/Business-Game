# Going Concern

A single-player, turn-based business strategy game.
Each turn is one quarter. Found a company in one of nineteen cities and one of seven
industries, grow it across the world against AI-run rivals, and try not to run out of
cash. The simulation is built to teach real finance, economics and management: every
number on screen explains where it came from.

## How to play

1. **Found a company.** Pick an industry, a city, a founder background, a length and a
   difficulty (or press *Surprise me*). Industries play very differently: software burns
   cash to grow, restaurants live on thin margins, energy is a leveraged bond you have to
   build, biotech is a series of expensive coin flips. Each difficulty card shows how often
   good plans won in testing for the industry you picked. A first company starts as a
   ten-year *Sprint*: a whole game in an evening or two.
2. **Each quarter, decide, then press End quarter.**
   - **Offices** — hire by role, set pay and training, build capacity.
   - **Regions** — price position, marketing, supply chain, local partners.
   - **Corporate** — *Money* (the statements; loans, covenants and the credit rating, equity
     rounds and the IPO), *Growth* (investments, acquisitions, R&D) and *Organisation*
     (executives, company policies).
   - **Intel** — rivals and diplomacy, your goals, the economy, the advisory board and
     the glossary.
3. **Read the quarterly report and answer events.** Most quarters bring a decision with
   real trade-offs; some chain into consequences later.
4. **Win** by becoming the most valuable company in your industry (Titan), leading the
   sales of named companies (Category king), staying a profitable public company (Blue
   chip), leading on technology with a completed moonshot (Pioneer), building an admired
   company (Good company), or outlasting every established rival (Last one standing).
   If none happens, the game ends after 25 years with a grade (A, B, C, D or F); A or B is
   a win. In energy, where rivals start as established utilities, the grade ranks you by
   how much you grew rather than by size. Two quarters of negative cash is insolvency.

Tap any dotted number to see the arithmetic behind it. *Fast-forward* runs quiet quarters
and stops when something needs you. The game saves itself every quarter.

New to it? A short checklist on HQ walks you through your first quarters. When the game
ends, *Read the review* shows how much of your result came from the market, your
strategy, your execution and luck — and what to try next time.

Small decisions can be left to your COO (on by default; change it in the menu), and
each office shows a forecast of next quarter if nothing changes.

**Other ways to play:** *Learn the ropes* (five short chapters, each opening one layer of
the game), *Scenario challenges* (seven prepared situations with one goal and a
deadline, each with bronze, silver and gold medals and a Brutal version), the *Daily
challenge* (the same world for everyone on a given day, with a score code to share),
*Sprint* (ten years, ranked by growth and graded for ten years; Category king can end it
early, the long-haul victories are left out), *Ironman* (one life, no rewinds), *Sandbox* (no
bankruptcy, the whole map visible) and *Surprise me* (a random industry, city and
founder from a seed you can share). When a game ends you can replay any of its last
four quarters.

## Run, test, build

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # headless engine tests (Vitest)
npm run sim        # AI-vs-AI balance harness → docs/balance.md and data/winrates.json (add -- --sprint for Sprint)
npm run sim:check  # fails if those are stale or list a red flag (CI runs this)
npm run build      # static production build in dist/ (relative paths, works from any sub-path)
npm run preview    # serve the production build locally
```

`npm run smoke` drives the built game in Chrome at phone and desktop sizes and saves
screenshots to `shots/` (needs Playwright and Chrome installed on the machine).
`npm run playtest` plays about a thousand games in every industry, difficulty and mode — the
bots and a player who takes random actions — and fails if the books stop balancing, a number
goes bad, a card points at something that is gone, or any text shows a blank or "undefined".

## Install it as an app

The game is a Progressive Web App and works fully offline once it has been opened once.

- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app* (or *Add to Home screen*).
- **Mac (Chrome or Edge):** the install icon in the address bar, or menu → *Install Going Concern*. It then lives in the Dock and Launchpad.
- **Mac (Safari 17+):** File → *Add to Dock*.

Saves live in the browser's storage on each device. Use *Menu → Export save file* to move
a game between devices, and *Import save file* to open it.

## Deploying

Every push to `main` runs the tests and deploys `dist/` to GitHub Pages
(`.github/workflows/ci.yml`). Enable it once under **Settings → Pages → Source: GitHub
Actions**. All paths are relative, so the game works at `https://<user>.github.io/<repo>/`.

## Project layout

| Path | What lives there |
| --- | --- |
| `engine/` | Deterministic, seeded simulation engine. Pure TypeScript, no DOM, its own package. |
| `data/` | All content as JSON — industries, cities, events, investments, scenarios, glossary — with schemas in `data/schemas/`. |
| `src/` | The UI (plain DOM), Web Audio sound, IndexedDB saves, and the web worker that runs turns. |
| `tests/` | Headless tests: statements tie out, determinism, content schemas, every event option, scenarios, saves. |
| `scripts/` | Icon generator, balance harness, invariant playtest, browser smoke test, JSON formatter. |
| `docs/` | [Design](docs/design.md), [decision log](docs/decisions.md), [balance report](docs/balance.md), [content guide](docs/content-guide.md), [native-wrapper notes](docs/native-wrappers.md). |

To add events, investments or industries, edit the JSON in `data/` — see
[docs/content-guide.md](docs/content-guide.md).
