# Adding content

Everything the player reads or chooses lives in `/data` as JSON. Edit a file, run
`npm test` (which checks every file against its schema and cross-checks ids), reload.

| File | What |
| --- | --- |
| `industries.json` | One entry per industry: every economic parameter |
| `cities.json` | Regions and cities |
| `investments.json` | The investment catalogue |
| `events/*.json` | The event deck, one file per category |
| `founders.json`, `rivals.json`, `scenarios.json`, `glossary.json`, `names.json` | Supporting content |

`node scripts/fmt-json.mjs data/events/*.json` reformats files in the house style.
To add a new events *file*, also add one import line in `engine/src/content.ts`.

## Events

```json
{ "id": "bad_review", "cat": "market", "title": "A scathing review",
  "text": "An influential reviewer has taken your {city} operation apart.",
  "bind": ["office"], "cond": { "minTurn": 4 }, "cool": 12,
  "opts": [
    { "label": "Respond and fix it", "hint": "Admit the problems and spend to fix them.",
      "out": [
        { "w": 0.7, "text": "They actually listened.", "fx": [["cost", 0.02], ["rep", 2]], "boost": ["culture", 60, 1.5] },
        { "w": 0.3, "text": "The fix is slow.", "fx": [["cost", 0.02], ["rep", -2]] } ] },
    { "label": "Ignore it", "hint": "It will blow over.",
      "out": [{ "text": "It costs you customers.", "fx": [["brand", -3], ["demand", -5, 3, "office"]] }] } ],
  "lesson": "Criticism you answer well can raise your reputation." }
```

- `w` on the event is its draw weight (default 1). `w: 0` means it only appears via a chain or the engine.
- `bind` picks what the event is about: `office`, `region`, `rival`, `person`, `loan`. Templates
  `{city} {office} {region} {rival} {rivalCeo} {person} {role} {ind} {loan} {amount} {company}` are filled in from it.
- `cond` (and an option's `req`) gate the event; all fields must hold. See `Cond` in `engine/src/types.ts`:
  `minTurn maxTurn ind notInd minRev maxRev minHead maxHead minOffices minRegions isPublic hasDebt noDebt
  minCashQ maxCashQ flag notFlag macro notMacro minCulture maxCulture minRep maxRep minEsg maxMorale exec noExec
  hasRival hostile friendly inventory capital minShare founderBelow profit loss minTech minBrand investors invest minAR keyLeftWithin`,
  plus `cashS` on options (cash of at least that many × S).
- `out` lists weighted outcomes. `boost: [stat, threshold, multiplier]` multiplies an outcome's weight when the
  company passes a check (`culture rep brand esg tech morale intel relation`, or `["flag", name, m]`, `["exec", "CFO", m]`).
- `chain: [[id, delayQuarters, probability?]]` schedules follow-ups.
- `once`, `cool` (cooldown in quarters, default 12).

### Effects

Money is expressed as a fraction of **S**: one quarter of the player's revenue (with a floor of $250K),
so events scale with the company.

| Tuple | Meaning |
| --- | --- |
| `["cash", x]` `["cost", x, line?]` `["flat", kUSD, line?]` `["capex", x]` `["tax", x]` `["nol", x]` | Money in / expense (line: `cogs sm rd ga other`) / fixed-dollar expense / capitalised spend / tax bill / tax losses to carry forward |
| `["morale", n, scope?]` `["skill", n, scope?]` `["staff", pct, role?, scope?]` | People. Scope: `office`, `region`, `ind`, `all` |
| `["culture", n]` `["brand", n]` `["rbrand", n]` `["rep", n]` `["esg", n]` `["tech", n]` `["loyalty", n]` | Company stats |
| `["demand", pct, quarters, scope?]` | Your pull with customers |
| `["market", pct, quarters, scope?]` | The whole market, rivals included |
| `["wages" \| "inputs" \| "attrition", pct, quarters]` `["capacity" \| "prod", pct, quarters, scope?]` | Temporary cost and output modifiers |
| `["share", pct, scope?]` | Immediate relative change in market share |
| `["valuation", pct, quarters]` | Temporary valuation modifier |
| `["gap", n]` `["rate", n]` `["infl", n]` `["commodity", pct]` `["energyIdx", pct]` `["sentiment", pct]` `["spread", n]` `["fx", pct]` `["regionGap", n]` | Macro shocks |
| `["equity", dilutionPct, valuationMultiple]` `["loan", x, ratePct, quarters]` `["dilute", pct]` | Forced financing |
| `["debtCall", frac]` `["rateUp", pts]` `["waive"]` | Act on the bound loan |
| `["writeoff", frac]` `["invLoss", frac]` `["ppeLoss", frac]` | Balance-sheet losses |
| `["hostility", n]` `["relation", n]` `["rivalTech", n]` `["rivalBrand", n]` `["rivalShare", pct]` `["rivalCash", x]` | Act on the bound rival |
| `["flag", name, quarters?]` `["unflag", name]` | Set a flag other content can test |
| `["personLeave"]` `["mnaTarget"]` `["discover"]` | The bound person leaves / a deal appears / a city is revealed |
| `["special", name, arg?]` | Engine routines; the list is `SPECIALS` in `engine/src/events.ts` |

## Investments

```json
{ "id": "regional_campaign", "name": "Regional brand campaign", "cat": "brand", "scope": "region",
  "desc": "Six quarters of advertising.", "pitch": "Awareness now, fading over a year and a half.",
  "base": 100, "perRev": 0.04, "capex": 0, "cat2": "sm", "ongoing": 0, "ramp": 0, "life": 6, "curve": "decaying",
  "fx": { "regionBrand": 6, "demand": 8 }, "lesson": "Advertising is an asset with a short life." }
```

- Cost is the larger of `base` ($K) and `perRev` × annual revenue in scope. `capex` is the share capitalised.
- `ramp` quarters of nothing, then the `curve` (`steady`, `backloaded`, `decaying`, `risky`) over `life` quarters (0 = permanent).
- `stages` makes it a gated project: each stage has a cost multiple, a duration and a pass probability.
- `risk` is a per-quarter failure chance. For a **trap**, set `trap: true`, a rosy `pitch`, the real story in `truth`,
  and `risk.shownP` lower than `risk.p`; due diligence reveals the difference.
- `flag` is set while the investment is active, so events can reward preparation (`"boost": ["flag", "cyber", 2.5]`).

## Industries

Copy an existing entry and change the numbers. Every field is described in `data/schemas/industries.schema.json`.
Then run the balance harness (`npm run sim`) to see how a new industry plays.
