# Response to the Going Concern panel review

Status of every recommendation in the panel review, as of the end of the third wave of work, and of the
second review's notes (last section).
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

## Second review

Figures are honest strategies (Steady, Blitz, Premium, Leveraged) from the regenerated reports: 12 seeds of every
industry, difficulty and strategy, plus 2,688 paired founder games. "Best" is the best honest strategy.

| Note | Status | What changed, and the result |
| --- | --- | --- |
| 2. Energy close to unwinnable (46 / 4 / 0 / 0%) | Done | Both suggestions: grid rivals start about your size (a rival plant could never start smaller than your whole company, so every energy rival opened with two to four times your capacity), and energy ranks by growth at the end, on enterprise value so a project loan does not hide growth. The bots now fund the next plant before programmes (a probe that skipped programmes was out-building them). Energy wins **100 / 77 / 48 / 23%** (62% overall, was 13%); of the energy games that run to the end, 34% finish A or B (was none) and 51% D or F (was 94% D, E or F). |
| 2. Harness should fail unwinnable cells; the Expert label excuses it | Done | Every industry on every difficulty: the best honest strategy must win at least 50 / 30 / 20 / 15% (Easy to Brutal) whatever the label, or the report lists a red flag. `npm run sim:check` (run in CI) now fails if either report lists any red flag, and the Expert band tightened from 5–50% to 25–65%. Both reports: no red flags. |
| 3. SaaS ignores difficulty (92% on Brutal) | Done | Customers leave a product that trails the best in their market: up to 5% a quarter at 25 technology points behind, × 0 / 0.25 / 0.6 / 0.75 by difficulty; rivals churn by the same rule. SaaS wins **100 / 98 / 85 / 33%** (was 100 / 100 / 98 / 92%). |
| 4. "Expect" line wrong for most industries | Done | The harness writes `data/winrates.json`; each card shows the measured rate for the industry and length picked ("In Clean Energy, good plans won about 8 games in 10 in testing (77%)"), with the bankruptcy rate where it is 10% or more. The general text is now a fallback and matches the averages. |
| 5. Stray ";" on the difficulty cards | Done | The join is gone; the bars sit in one cell of the grid. The browser test checks every card row has exactly two cells. |
| 6. Cards too long on a phone | Done | Victory bars fold behind "Show victory bars"; the browser test checks they are closed until asked for. |
| 7. Small companies get top credit ratings | Done | No better than BB below $50M of revenue a year, BBB below $250M (today's money), shown in the rating breakdown; no debt earns 4 of the 12 interest-cover points; leverage is net of cash. Startups now open at BB (the cap, for the asset-light ones) or B, depending on their debt and city; CCC is left for starts whose earnings do not cover their debt service and for loss-making biotech (tests). |
| 8. Founders 51–71% | Done | The old table tied each founder to a seed number, so it measured cities and luck too (the Financier's 51% was mostly its seeds). Founders now rotate across seeds, and a paired run plays all eight on the same 336 games, with a red flag above a 12-point gap. Scientist, Heir, Financier and Engineer strengthened, Operator trimmed: **67–72%** on identical games (was 58–75%). |
| 9. Titan and Pioneer barely happen | Done | New check: some honest strategy must end at least 10% of its games with each victory on some difficulty. Titan's bar had been set as if every industry were worth what software is; each industry now has its own Titan scale, Titan compares enterprise values (raising cash and sitting on it no longer counts), and Blue chip keeps its own bar. Pioneer's technology bar came down, the moonshot is cheaper and can be retried. Titan **6%** of honest games (19% for Leveraged on Normal), Pioneer **5%** (23% for Premium on Normal); were 3% each. |
| 10. Games long; Sprint harder than the full game | Done | Sprint is graded for ten years (bands about eight points lower, growth-rank places five points apart, full wealth marks at 3×), newcomers count in the growth rank only once bigger than you, development runs at twice the pace, and the victories that need decades are left out (Category king can still end a Sprint early). Best honest strategy **87 / 76 / 54 / 36%** in a Sprint against **95 / 86 / 70 / 35%** in the full game (Sprint was 70 / 38 / 37 / 31%). Sprint is suggested, and the default, for a first company, and the title screen says so. |
| 11. Corporate has seven sub-tabs | Done | Grouped into Money (statements, capital), Growth (invest, deals, R&D) and Organisation (people, policies). |
| 11. Grades use "E" | Done | A, B, C, D and F; D starts at 25. |
| 11. "Found a new company" is 4th of 5 | Done | First, with a pointer to the five chapters for a player with no saves. |

The full game still runs long (median Y24, 44% of games go the distance); Sprint is the answer the note suggests,
and new players now start there. Manufacturing remains the hardest industry (53% overall, more than 20 points
behind SaaS), as the report notes.

## Third review: playtest across every mode and industry

A step-by-step review of the engine, the interface and the content, then about 1,000 games played by the bots and by a
player who takes random actions with random arguments — in every industry, difficulty and mode (full game, Sprint,
sandbox, Ironman, four daily challenges, every scenario and its Brutal version) — with invariant checks after every
action, card and quarter (`npm run playtest`, decision 80), and a browser pass over every tab, sub-tab and modal at
phone and desktop widths. Design choices in decisions 80–88.

| Finding | Status | Notes |
| --- | --- | --- |
| Negative receivables when prepaid revenue unwound faster than it was earned (software) | Done | Refunded to customers, with a news line (decision 81). |
| Negative goodwill after buying plant below its value (energy rivals, deal targets) | Done | Plant booked at the price paid (decision 82). |
| "Buy their office" card charged more than it showed | Done | Charges the price on the card. |
| Takeover offer with a blank price ("offer: , cash") | Done | Offers have a floor; a blank amount can no longer render. |
| Newcomers entering with no offices, counted in the ranking | Done | They do not enter (decision 86). |
| Grade A or B on a game recorded as lost; Sprint rule text wrong | Done | Letter capped at C without the growth, with a row saying why; rule text from the engine (decision 83). |
| Industry cards applied to the wrong industry in a multi-industry company | Done | Bound to their industry, effects scoped to it (decision 84). |
| Cards about rivals, offices, people or loans that are gone | Done | Dropped at the start of each quarter and after every action; a lapsed lawsuit says so. |
| Decisions still possible after the game ended; header one quarter ahead | Done | Queue cleared at the end (decision 87); header shows the last quarter played. |
| CFO's cash-against-profit note worded one way only | Done | Each driver worded the way it moved (test). |
| "$10.5M of sales went unserved" on $595K of revenue | Done | Reworded: what customers would buy beyond what you can deliver. |
| "Profitable" note promised tax losses that did not exist; AI card said software customers "pay for hours" | Done | |
| Valuation at zero for most of a year after building a plant on borrowed money | Done | Plant under construction, and new plant not yet a year in the accounts, count at cost — for rivals as for the player (decision 85). It removed an end-game penalty on investing, so energy now plays as Tough (decision 88); retail's independents are a little stronger to keep it in its band. |
| Valuation swings of 4× or more in a quarter | Done | Opening costs no longer cut the multiple for a year, new plant is carried at full cost until its first sale, and growth is like-for-like for a new grid plant (decision 89): honest strategies' 4× quarters in the playtest 106 → 51, Easy energy 24 → 3. The rest are real (trial results, losses under debt, thin equity under project loans; decision 90). |
