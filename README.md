# Going Concern

A single-player, turn-based business strategy game — Civilization for running a company.
Each turn is one quarter. Found a company in one of nineteen cities and one of seven
industries, grow it across the world against AI-run rivals, and try not to run out of
cash. The simulation is built to teach real finance, economics and management: every
number on screen explains where it came from.

## How to play

1. **Found a company.** Pick an industry, a city, a founder background and a difficulty
   (or press *Surprise me*). Industries play very differently: software burns cash to
   grow, restaurants live on thin margins, energy is a leveraged bond you have to build,
   biotech is a series of expensive coin flips.
2. **Each quarter, decide, then press End quarter.**
   - **Offices** — hire by role, set pay and training, build capacity.
   - **Regions** — price position, marketing, supply chain, local partners.
   - **Corporate** — loans and covenants, equity rounds and the IPO, R&D, investments,
     acquisitions, executives.
   - **Intel** — rivals and diplomacy, your goals, the economy, the advisory board and
     the glossary.
3. **Read the quarterly report and answer events.** Most quarters bring a decision with
   real trade-offs; some chain into consequences later.
4. **Win** by becoming the most valuable company in your industry (Titan), dominating
   world market share (Category king), staying a profitable public company (Blue chip),
   leading on technology with a completed moonshot (Pioneer), building an admired
   company (Good company), or outlasting every rival (Last one standing). Two quarters
   of negative cash is insolvency.

Tap any dotted number to see the arithmetic behind it. *Fast-forward* runs quiet quarters
and stops when something needs you. The game saves itself every quarter.

## Run, test, build

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # headless engine tests (Vitest)
npm run sim        # AI-vs-AI balance harness → docs/balance.md
npm run build      # static production build in dist/ (relative paths, works from any sub-path)
npm run preview    # serve the production build locally
```

`npm run smoke` drives the built game in Chrome at phone and desktop sizes and saves
screenshots to `shots/` (needs Playwright and Chrome installed on the machine).

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
| `scripts/` | Icon generator, balance harness, browser smoke test, JSON formatter. |
| `docs/` | Design, decision log, balance report, content guide, native-wrapper notes. |

To add events, investments or industries, edit the JSON in `data/` — see
[docs/content-guide.md](docs/content-guide.md).
