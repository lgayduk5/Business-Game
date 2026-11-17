# Going Concern

A single-player, turn-based business strategy game — Civilization for running a company.
Each turn is one quarter. Found a company, grow it across a world of cities, and compete
with AI-run rivals, while the game teaches real finance, economics and management.

This is milestone 1 of 6. See [docs/design.md](docs/design.md) for the full plan and
[CHANGELOG.md](CHANGELOG.md) for what each milestone added.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # headless engine tests
npm run build      # production build in dist/ (static files, relative paths)
```

## Layout

| Path | What lives there |
| --- | --- |
| `engine/` | Deterministic simulation engine. Pure TypeScript, no DOM. |
| `data/` | All game content as JSON, with schemas in `data/schemas/`. |
| `src/` | The UI, audio, and the web worker that runs turns. |
| `tests/` | Headless tests. |
| `docs/` | Design, decision log. |
