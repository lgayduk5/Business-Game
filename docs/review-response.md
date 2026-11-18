# Response to the Going Concern panel review

Status of every recommendation in the panel review, as of the end of the third wave of work.
**Done** means implemented and tested; **partial** says what is missing; **not yet** says why.
Balance figures are from `docs/balance.md` (full game) and `docs/balance-sprint.md` (Sprint),
which `npm run sim` regenerates.

## Wave 1: bugs, honesty and tooling

| Recommendation | Status | Notes |
| --- | --- | --- |
| Buybacks retire shares nobody held | Done | Capped at the public float; holders always sum to the share count (test). |
| Sliders lose keyboard focus | Done | Focus is restored to the same control after each render. |
| Capital tab overflows on phones | Done | Wrapping fixed; the browser test fails on any sideways scroll. |
| Mid-quarter decisions not saved | Done | Saves shortly after every action, and on `visibilitychange` / `pagehide`. |
| Installed app may never update | Done | "New version — reload" prompt; the page itself is fetched network-first. |
| Balance report out of date | Done | Reduced harness in CI fails on red flags or a stale report (fingerprint check). |
| Red-flag check misses goal shortcuts | Done | Flags any victory a probe reaches more often than honest play, and any victory nobody reaches. |
| Fragile scenario turn handling | Done | `checkScenario` takes the turn number. |
| Honest difficulty cards | Done | Real settings and measured win rates on each card. |
| Show industry difficulty, recommend SaaS first | Done | Gentle / Tough / Expert chips; SaaS marked for a first game. |
| Fix Category king | Done | Measured among named companies, needs a year, profit and doubled revenue. |
| Pioneer needed one qualifying quarter | Done | Four quarters. |
| Event cost text | Done | Every option shows what it costs, generated from its effects (content test). |
| Per-founder and per-victory tables | Done | In the balance report. |

## Wave 2: rivals, realism, balance

| Recommendation | Status | Notes |
| --- | --- | --- |
| Rivals on the player's cost model | Done | Same cost lines, working capital, head office, executives; margins checked against industry targets (test). |
| One valuation function | Done | Player and rivals share `valueCompany` (test: same company, same value). |
| Rivals face the same lenders and investors | Done | Credit rating, debt capacity and equity appetite as for the player. |
| EBITDA multiple as growth slows; rates in the multiple | Done | Blend moves from revenue to EBITDA multiple below 25% growth; rate factor. |
| Tax by country | Done | Country by country, with losses carried forward per country (80% cap). |
| Canadian dollar | Done | Toronto trades in CAD. |
| IPO day-one pop | Done | Drawn from a distribution that depends on market mood. |
| Seeded history | Done | Four quarters of accounts before turn 0; no valuation jump after the first quarter. |
| Easy best strategy at 80%+ | Done | 86%. |
| Every industry within ~20 points of SaaS | **Partial** | SaaS is still far ahead. Every industry now plays to its label (gentle / tough / expert), which the harness enforces; energy remains the hardest (about 13% honest wins over all difficulties). Closing the gap fully needs industry-specific mechanics rather than more tuning. |
| Consulting fixes (credit line, retainers, factoring) | Done | Plus a consulting scenario and a tender card. |
| Energy capital recycling and PPAs | Done | Sell 49% plant stakes to funds; project finance tied to the plant; a yearly PPA auction card. |
| No probe beating honest play | Done | No red flags at 12 seeds per cell. |

## Wave 3: pacing, endings, competitors, content

| Recommendation | Status | Notes |
| --- | --- | --- |
| Fewer than half of quarters with a card | Done | 48% in the harness: lower deck rate, cards already waiting count against it, rival cards at most every fourth quarter. |
| "Let the COO handle it" | Done | Small cards go to the COO (on by default, menu toggle); a button on each small card. |
| Forecast panel | Done | "Next quarter, if nothing changes" on each office, from a dry run. |
| Trend chart axis and toggles | Done | Year marks and legend toggles on every chart. |
| Phone office table as cards | Done | Under 500px. |
| Tutorial retires after two years | Done | |
| Graded ending | Done | A–F from rank, wealth against the industry, and goal progress. |
| Sprint (40 quarters) | Done | Lower bars, ranked by growth. Harder than the full game; the option says so (best honest strategy on Normal about 43%). |
| Ironman | Done | One autosave, no slots or files, no rewinds; badge on the end screen. |
| Daily seed and score code | Done | Same world for everyone on a date; code carries grade, score and founder value, with check letters. |
| Rewind | Done | From the end screen, replay from the start of any of the last four quarters; the result is compared with the first run. |
| Learner campaign | Done | Five chapters: Office, Region, Capital, Rivals, Public company; each opens one layer of the game. |
| Scenario medals, Brutal versions, consulting scenario | Done | Bronze / silver / gold; Brutal version of every challenge; "The client walks". |
| New entrants mid-game | Done | At the difficulty's rate (per decade), more in booms; a late Big Tech entrant. |
| Rivals in every division | Done | Two or three incumbents per new industry. |
| Rival life events | Done | New CEO (may change personality), listings, spin-offs, scandals, state aid, PE sell-offs. |
| Five new personalities | Done | Family dynasty, State champion, Big Tech entrant, Private-equity roll-up, Co-operative. |
| Nemesis on HQ | Done | With the history of the feud. |
| Ten new events | Done | Bank failure, AI changes the work, tariff war, biggest customer bust, short seller, union contract, old colleague at a rival, take-private offer (a graded exit), activist stake, proxy fight. The data-centre PPA and heatwave already existed. |
| Company policies | Done | Six policies, slots by stage, one change a year. |
| Earnings guidance | Done | |
| Employee option pool | Done | Non-cash pay, dilution, retention. |
| Capital recycling | Done | (Wave 2.) |
| Bid pipeline (consulting) | **Partial** | A yearly tender card with fixed-fee or time-and-materials bids; not a standing pipeline of bids. |
| Franchising (retail) | Done | From the map. |
| Hedging | Done | Lock input prices for 4 or 8 quarters (the existing hedging programme still halves shocks). |
| Activist investors | Done | As cards after year ten. |
| Industry tech trees | **Not yet** | Needs per-industry research nodes and UI; a larger piece of work. |
| Named key customers | **Not yet** | Needs a customer model inside office demand. |
| Five new industries | **Not yet** | Insurance, fintech, airlines, media and real estate each need their own signature mechanic (float, fraud and capital rules, load factor, a slate of hits, cap rates). The review asks for one at a time with a harness pass each; none has been started. |
