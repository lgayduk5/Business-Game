// Core state types. Everything in GameState is plain JSON so saves are trivial.

export type IndustryId = 'saas' | 'retail' | 'mfg' | 'logistics' | 'energy' | 'consulting' | 'biotech';
export type Role = 'ops' | 'sales' | 'rnd' | 'admin';
export type RegionId = 'nae' | 'naw' | 'latam' | 'europe' | 'mea' | 'apac';
export type ExpCat = 'cogs' | 'sm' | 'rd' | 'ga' | 'other';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';
export type VictoryId = 'marketCap' | 'dominance' | 'ipo' | 'innovation' | 'reputation' | 'lastStanding';
export type Personality = 'expander' | 'costcutter' | 'innovator' | 'predator' | 'conservative' | 'disruptor' | 'dynasty' | 'state' | 'bigtech' | 'pe' | 'coop';
export type FounderId = 'engineer' | 'sales' | 'finance' | 'operator' | 'serial' | 'scientist' | 'heir' | 'consultant';
export type SupplyMode = 'lean' | 'balanced' | 'resilient';
export type ExecRole = 'GM' | 'CFO' | 'CTO' | 'COO' | 'CMO' | 'CHRO';
export type InputKey = 'commodity' | 'energy' | 'cloud' | 'none';

export const ROLES: Role[] = ['ops', 'sales', 'rnd', 'admin'];
export const INDUSTRY_IDS: IndustryId[] = ['saas', 'retail', 'mfg', 'logistics', 'energy', 'consulting', 'biotech'];
export const REGION_IDS: RegionId[] = ['nae', 'naw', 'latam', 'europe', 'mea', 'apac'];

// ───────────────────────── static definitions ─────────────────────────

/** A currency: one per region, plus the Canadian dollar (Toronto shares a region with the US but not a currency). */
export type FxZone = RegionId | 'cad';

export interface CityDef {
  id: string;
  name: string;
  region: RegionId;
  x: number; // map position, 0..1000
  y: number; // 0..520
  pop: number; // metro population, millions
  income: number; // income per head relative to reference (1.0)
  wage: number; // wage index
  rent: number; // rent index
  reg: number; // regulatory burden 0..1
  tax: number; // corporate tax rate
  country: string; // tax jurisdiction: profits and losses are pooled per country
  fx?: FxZone; // own currency, when it is not the region's
  talent: number; // talent pool depth 0..100
  talentQ: number; // average skill of the pool
  growth: number; // annual real growth %
  risk: number; // instability 0..1
  ind: Record<IndustryId, number>; // demand multiplier per industry
  tal: Partial<Record<IndustryId, number>>; // talent specialisation multiplier
  blurb: string;
}

export interface IndustryDef {
  id: IndustryId;
  name: string;
  short: string;
  icon: string;
  blurb: string;
  economics: string;
  failure: string;
  tier: 'gentle' | 'tough' | 'expert'; // how hard it is to win, from the balance harness
  firstGame?: boolean; // recommended for a first game
  grid?: boolean; // output is sold into a wholesale market: a working plant sells most of what it makes at the going price
  /** the end-of-game grade ranks companies by how much they grew rather than by size (rivals start as established utilities) */
  rankByGrowth?: boolean;
  /** share of customers lost each quarter, at most, by an office whose product trails the best in its market (software) */
  productChurn?: number;
  marketBase: number; // units ($K of sales at reference price) per quarter in a reference city
  trend: number; // annual real growth of the market
  cyc: number; // sensitivity to the business cycle
  elast: number; // firm-level price elasticity
  mktElast: number; // market-level price elasticity
  wq: number; // weight of quality in customer choice
  wb: number; // weight of brand
  stick: number; // share of the gap to target closed each quarter (low = sticky customers)
  fringe: number; // strength of local incumbents, in "average competitor" units
  organic: number; // demand you get just by being present
  wages: Record<Role, number>; // $K per quarter at wage index 1
  opsOut: number; // units one operations employee delivers per quarter
  varCost: number; // variable (materials/hosting/fuel) cost as a fraction of reference price
  inputKey: InputKey;
  capPerUnit: number; // capex $K per unit of quarterly capacity (0 = asset-light)
  buildQ: number; // quarters to build capacity
  deprQ: number; // depreciation life, quarters
  fixedPerCap: number; // facility running cost per capacity unit per quarter, $K
  seatRent: number; // office rent per employee per quarter, $K at rent index 1
  dso: number; // days sales outstanding
  dio: number; // days of inventory
  dpo: number; // days payables outstanding
  deferred: number; // deferred revenue as a multiple of quarterly revenue
  spoil: number; // share of unsold inventory lost each quarter
  salesCover: number; // market units one sales person can fully cover
  mktEff: number; // efficiency of marketing dollars vs sales people
  baseAttr: number; // baseline quarterly staff attrition
  rdCost: number; // $K of program spend per research point
  techGain: number;
  techDecay: number; // tech points lost per quarter to obsolescence
  revMult: number; // enterprise value / revenue multiple at reference growth & margin
  targetMargin: number; // EBITDA margin a mature operator earns
  regSens: number; // sensitivity to regulation
  scale: number; // max unit-cost saving from economies of scale
  startTech: number;
  capTarget: number; // scale of the industry's valuations: Blue chip bar and listing revenue
  titanScale?: number; // Titan bar multiplier, set to what the industry's leaders are worth (falls back to capTarget)
  local: number; // how strongly prices follow local wages (haircuts vs software)
  techW: number; // weight of technology (vs people and process) in perceived quality
  start: { cash: number; ops: number; sales: number; rnd: number; admin: number; cap: number; debt: number };
  roles: Record<Role, string>;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  def: string;
  why: string; // why it matters in the game
}

export interface FounderDef {
  id: FounderId;
  name: string;
  blurb: string;
  perks: string[];
  cash: number; // multiplier on starting cash
  equity: number; // founder ownership at start (rest held by early backers)
  tech: number;
  culture: number;
  brand: number;
  opsProd: number; // multiplier
  salesEff: number;
  rdEff: number;
  loanSpread: number; // percentage points added to loan spreads
  valuation: number; // multiplier on private valuations
  ind?: Partial<Record<IndustryId, number>>; // extra tech in specific industries
}

export interface RivalPersonalityDef {
  id: Personality;
  label: string;
  blurb: string;
  price: number; // preferred price index
  sales: number; // sales and marketing spend as a share of revenue
  rd: number; // R&D as share of revenue
  expand: number; // probability weight of opening new offices
  leverage: number; // target debt / annual revenue
  aggression: number; // 0..1 likelihood of hostile moves
  quality: number; // operational quality 0..100
  eff: number; // cost multiplier (lower is leaner)
  acquisitive: number; // appetite for takeovers
  grudge: number; // how strongly it retaliates
  /** Weights of its hostile moves: price wars, poaching, lawsuits, lobbying. */
  moves: { war: number; poach: number; lawsuit: number; lobby: number };
  /** Cannot be bought, by you or anyone (a family firm, a co-op, a giant). */
  neverSells?: boolean;
  /** How fast its hostility cools, against 1 for most (a dynasty remembers for years). */
  grudgeDecay?: number;
  /** Owned privately, by a family, a state, a fund or its members: never lists its shares. */
  privately?: boolean;
  /** The state tops up its cash when it runs out (three times at most). */
  subsidised?: boolean;
  /** Regulators in its home country will not act against it. */
  homeShield?: boolean;
  /** Appears only as a late entrant, never at the start. */
  late?: boolean;
  /** Enters by attacking the player's best market. */
  targetsBest?: boolean;
  /** Sells offices to pay down debt when interest rates rise. */
  ratesSell?: boolean;
  /** Members stay loyal: its brand never falls below a floor. */
  community?: boolean;
}

export type Curve = 'steady' | 'backloaded' | 'decaying' | 'risky';
export type InvCat = 'office' | 'rd' | 'automation' | 'brand' | 'training' | 'systems' | 'esg' | 'financial' | 'people' | 'supply';

export interface InvFx {
  prod?: number; // ops productivity, %
  demand?: number; // attractiveness, %
  quality?: number; // quality points
  inputCost?: number; // % (negative = saving)
  wageCost?: number; // %
  salesEff?: number; // %
  capacity?: number; // %
  attrition?: number; // % change in attrition rate
  hirePool?: number; // %
  rdEff?: number; // %
  brand?: number; // points per quarter
  regionBrand?: number;
  culture?: number; // points per quarter
  morale?: number; // level shift
  skill?: number; // points per quarter
  rep?: number; // points per quarter
  esg?: number; // points per quarter
  tech?: number; // one-off tech points, granted along the payoff curve
  income?: number; // quarterly income as a fraction of upfront cost
  intel?: number; // intelligence on rivals 0..1
  loyalty?: number; // key-person loyalty per quarter
  tax?: number; // % change in the tax bill
  rent?: number; // % change in office rent
  overhead?: number; // % change in head-office costs
  capexCost?: number; // % change in what plant costs to build
}

export interface InvStage {
  name: string;
  q: number; // quarters
  cost: number; // multiple of the investment's base cost, paid per stage (spread over its quarters)
  p: number; // probability of passing the gate
}

export interface InvestmentDef {
  id: string;
  name: string;
  cat: InvCat;
  scope: 'corp' | 'office' | 'region';
  desc: string;
  pitch: string; // what the salesperson tells you
  truth?: string; // what due diligence reveals (traps)
  trap?: boolean;
  inds?: IndustryId[]; // restrict to industries
  base: number; // minimum upfront cost, $K (inflation adjusted)
  perRev: number; // upfront cost as a fraction of annual revenue (scope-adjusted); the larger of base/perRev applies
  capex: number; // share of upfront that is capitalised (rest expensed)
  cat2: ExpCat; // P&L line for the expensed part and ongoing cost
  ongoing: number; // quarterly cost as a fraction of upfront
  ramp: number; // quarters before any payoff
  life: number; // quarters of payoff (0 = permanent while maintained)
  curve: Curve;
  fx: InvFx;
  stages?: InvStage[];
  start?: Fx[]; // effects applied once when the investment is made
  risk?: { p: number; shownP: number; event?: string; text: string; fx?: Fx[] }; // per-quarter failure chance once active
  hit?: { p: number; mult: number; text: string }; // risky curve: per-quarter chance of a payoff worth mult × upfront
  flag?: string; // flag set while active (events check these)
  minRev?: number; // $K annual revenue required
  unique?: boolean; // only one at a time per scope
  lesson: string;
  moonshot?: boolean;
}

export interface ScenarioDef {
  id: string;
  name: string;
  blurb: string;
  brief: string;
  industry: IndustryId;
  city: string;
  founder: FounderId;
  difficulty: Difficulty;
  turns: number;
  seed: string;
  /** `relative`: value is a multiple of the starting revenue or valuation; the text's {target} is filled in. */
  goal: { kind: 'valuation' | 'survive' | 'revenue' | 'share' | 'cash' | 'ipo' | 'offices' | 'profit'; value: number; text: string; maxDilution?: number; noEquity?: boolean; relative?: boolean };
  setup: string; // key into scenario setup functions
  /** Learner campaign chapter (1–5); absent for the challenges. */
  chapter?: number;
  /** The layer of the game a chapter opens up. */
  layer?: string;
  /** Campaign chapters: what the chapter teaches, and pointers shown on HQ while it is played. */
  lesson?: string;
  tips?: string[];
  /** What earns the second star. */
  bonus?: string;
}

// ───────────────────────── events ─────────────────────────

export type EventCat = 'macro' | 'market' | 'operational' | 'regulatory' | 'opportunity' | 'stress' | 'rival';
export type Scope = 'office' | 'region' | 'all' | 'ind';

/** Compact effect tuples. Money effects are fractions of S (≈ one quarter of revenue, with a floor). */
export type Fx =
  | ['cash', number] // gain (+) booked as other income
  | ['cost', number, ExpCat?] // expense, fraction of S
  | ['flat', number, ExpCat?] // expense in $K (inflation adjusted)
  | ['capex', number] // capitalised spend, fraction of S
  | ['morale', number, Scope?]
  | ['culture', number]
  | ['brand', number]
  | ['rbrand', number] // regional brand in context region
  | ['rep', number]
  | ['esg', number]
  | ['tech', number]
  | ['skill', number, Scope?]
  | ['loyalty', number]
  | ['demand', number, number, Scope?] // %, quarters — your own pull with customers
  | ['market', number, number, Scope?] // %, quarters — the whole market, rivals included
  | ['wages', number, number] // %, quarters
  | ['inputs', number, number] // %, quarters
  | ['capacity', number, number, Scope?] // %, quarters
  | ['prod', number, number, Scope?] // %, quarters
  | ['attrition', number, number] // %, quarters
  | ['staff', number, Role?, Scope?] // % change in headcount (negative = people leave)
  | ['share', number, Scope?] // relative % change in market share
  | ['hostility', number]
  | ['relation', number]
  | ['rivalCash', number] // fraction of rival annual revenue
  | ['rivalTech', number]
  | ['rivalBrand', number]
  | ['rivalShare', number] // relative % in context city
  | ['gap', number]
  | ['rate', number]
  | ['infl', number]
  | ['commodity', number] // %
  | ['energyIdx', number] // %
  | ['sentiment', number] // %
  | ['spread', number]
  | ['fx', number] // % move of region currency
  | ['regionGap', number]
  | ['flag', string, number?] // name, optional duration in quarters
  | ['unflag', string]
  | ['personLeave']
  | ['debtCall', number] // fraction of the context loan that must be repaid now
  | ['rateUp', number] // percentage points on the context loan
  | ['waive']
  | ['equity', number, number] // dilution %, valuation multiple (forced raise)
  | ['loan', number, number, number] // fraction of S, annual rate %, quarters
  | ['dilute', number] // % new shares issued for no cash (grants, warrants)
  | ['valuation', number, number] // %, quarters
  | ['writeoff', number] // fraction of receivables written off
  | ['invLoss', number] // fraction of inventory lost
  | ['ppeLoss', number] // fraction of PP&E impaired in context office
  | ['tax', number] // one-off tax bill, fraction of S
  | ['nol', number] // adds to tax loss carryforward, fraction of S
  | ['mnaTarget'] // spawn an acquisition target
  | ['discover'] // reveal a city
  | ['special', string, number?];

export interface Cond {
  minTurn?: number;
  maxTurn?: number;
  ind?: IndustryId[];
  notInd?: IndustryId[];
  minRev?: number; // $K per quarter
  maxRev?: number;
  minHead?: number;
  maxHead?: number;
  minOffices?: number;
  minRegions?: number;
  isPublic?: boolean;
  hasDebt?: boolean;
  noDebt?: boolean;
  minCashQ?: number; // cash as multiple of quarterly costs (runway)
  maxCashQ?: number;
  flag?: string;
  notFlag?: string;
  macro?: 'recession' | 'boom' | 'highRates' | 'lowRates' | 'highInfl' | 'bear' | 'bull';
  notMacro?: 'recession' | 'boom';
  minCulture?: number;
  maxCulture?: number;
  minRep?: number;
  maxRep?: number;
  minEsg?: number;
  maxMorale?: number;
  exec?: ExecRole;
  noExec?: ExecRole;
  hasRival?: boolean; // context rival exists
  hostile?: number; // min hostility of context rival
  friendly?: number; // min relation of context rival
  inventory?: boolean; // industry carries inventory
  capital?: boolean; // industry is asset-heavy
  minShare?: number; // best office share
  founderBelow?: number; // founder ownership below
  profit?: boolean;
  loss?: boolean;
  minTech?: number;
  minBrand?: number;
  investors?: boolean; // has outside shareholders
  invest?: string; // has active investment with id
  minAR?: number; // receivables at least this many quarters of revenue
  keyLeftWithin?: number; // a key person left in the last N quarters
}

export interface Outcome {
  w?: number; // weight
  text: string;
  fx?: Fx[];
  chain?: [id: string, delay: number, p?: number][];
  /** weight multiplier if a stat test passes, e.g. ['culture', 60, 2.5] or ['flag', 'cyber', 3] */
  boost?: [stat: string, threshold: number | string, mult: number];
  /** How the news feed colours this outcome; by default, by luck (better or worse than the odds). */
  tone?: 'good' | 'bad' | 'info';
}

export interface EventOption {
  label: string;
  hint: string; // the trade-off, shown before choosing
  req?: Cond & { cashS?: number }; // requires cash of at least cashS × S
  out: Outcome[];
}

export interface EventDef {
  id: string;
  cat: EventCat;
  title: string;
  text: string;
  w?: number; // draw weight (0 = only via chain / AI)
  cond?: Cond;
  bind?: ('office' | 'rival' | 'person' | 'loan' | 'region')[];
  once?: boolean;
  cool?: number; // cooldown in quarters
  opts: EventOption[];
  lesson: string;
  terms?: string[]; // glossary ids
}

export interface EventCtx {
  office?: string;
  city?: string;
  region?: RegionId;
  rival?: number;
  person?: string;
  loan?: string;
  ind?: IndustryId;
  amount?: number;
  note?: string;
  /** The event is about `ind` alone (the company also has other industries): its company-wide effects stay there. */
  scoped?: boolean;
}

export interface PendingEvent {
  uid: number;
  id: string;
  ctx: EventCtx;
  turn: number;
}

export interface EventLogEntry {
  turn: number;
  id: string;
  title: string;
  choice: string;
  result: string;
  luck: number; // realised minus expected value, $
  cat: EventCat;
}

// ───────────────────────── dynamic state ─────────────────────────

export interface StaffGroup {
  n: number;
  skill: number;
  reqs: number; // open requisitions
  fresh: number; // joined last quarter, still ramping
}

export interface AttractBreakdown {
  quality: number;
  q: number;
  b: number;
  m: number;
  p: number;
  pres: number;
  mods: number;
  A: number;
  total: number; // sum of all competitors + fringe
  effort: number;
  need: number;
}

export interface OfficeResult {
  market: number; // total market units
  demand: number;
  target: number; // target share
  churn?: number; // share lost this quarter to a better product in the market
  capShare: number;
  sold: number;
  produced: number;
  capacity: number;
  laborCap: number;
  util: number;
  price: number; // $ per unit
  revenue: number;
  materials: number;
  wages: Record<Role, number>;
  rent: number;
  facility: number;
  marketing: number;
  hiring: number;
  training: number;
  contribution: number;
  lost: number; // revenue lost to capacity limits
  bind: 'demand' | 'capacity' | 'staff' | 'facility' | 'inventory';
  attract: AttractBreakdown;
  attrRate: number;
  quits: number;
  hires: number;
  moraleTarget: number;
  moraleParts: Record<string, number>;
  prodMult: number;
  prodParts: Record<string, number>;
  unitCost: number;
}

export interface Office {
  id: string;
  city: string;
  ind: IndustryId;
  name: string;
  opened: number;
  staff: Record<Role, StaffGroup>;
  pay: number; // pay policy vs market, 1.0 = market
  morale: number;
  autoBackfill: boolean;
  training: number; // 0..3
  cap: number; // facility capacity, units/quarter
  building: { units: number; ready: number; cost: number }[];
  /** Plant finished in the last year: valued partly at cost until a full year of its sales is in the accounts. */
  ramp?: { cost: number; done: number }[];
  ppe: number; // gross
  accDep: number;
  share: number;
  inventory: number; // units
  invValue: number; // $
  lastDemand: number;
  scar: number; // lingering morale damage from layoffs
  gm?: string;
  integration: number; // quarters of acquisition integration left
  minority?: number; // share of this plant sold to an infrastructure fund (capital recycling)
  last?: OfficeResult;
  hist: { rev: number; contrib: number; share: number; mkt?: number; px?: number }[]; // mkt: market value at reference price; px: price position
}

export interface Person {
  id: string;
  name: string;
  role: ExecRole;
  skill: number;
  loyalty: number;
  salary: number; // $ per quarter at hire, grows with wage index
  trait: string;
  office?: string;
  hired: number;
  retained?: number; // turn until which a retention package holds
}

export interface RegionPolicy {
  price: Partial<Record<IndustryId, number>>;
  marketing: number; // $ per quarter
  supply: SupplyMode;
  partner?: { name: string; boost: number; fee: number; until: number; rival?: number };
}

export interface Loan {
  id: string;
  kind: 'revolver' | 'term' | 'bond' | 'venture' | 'equipment' | 'distressed' | 'project';
  name: string;
  principal: number;
  limit: number; // revolver only
  spread: number; // over policy rate if floating
  fixedRate: number; // used if !floating
  floating: boolean;
  start: number;
  maturity: number; // turn
  amort: number; // $ per quarter
  maxLeverage?: number;
  minCoverage?: number;
  minCash?: number;
  breaches: number;
  waivedUntil: number;
  office?: string; // project or equipment finance secured on this office's plant
}

export interface LoanOffer {
  id: string;
  kind: Loan['kind'];
  name: string;
  max: number;
  spread: number;
  fixedRate: number;
  floating: boolean;
  term: number;
  amortizing: boolean;
  maxLeverage?: number;
  minCoverage?: number;
  minCash?: number;
  note: string;
  warrants?: number; // dilution %
}

export interface EquityOffer {
  round: string;
  investor: string;
  pre: number; // pre-money valuation
  maxPct: number; // max stake offered to buy
  note: string;
}

export interface CapTable {
  shares: number;
  founder: number;
  holders: { name: string; shares: number; round: string; price: number }[];
  isPublic: boolean;
  ipoTurn: number; // -1 if none
  ipoStage: number; // 0 none, 1 filed, 2 roadshow
  price: number; // per share
  premium: number; // market price relative to intrinsic value
  lastRoundTurn: number;
  lastPost: number; // last post-money valuation
  rounds: number;
  expectedEps: number;
  dividend: number; // $ per quarter
  boardPressure: number; // 0..10
}

export interface Books {
  cash: number;
  ar: number;
  inventory: number;
  ppe: number;
  accDep: number;
  goodwill: number;
  securities: number; // financial investments
  ap: number;
  deferred: number;
  debt: number;
  paidIn: number;
  retained: number;
}

export interface PnL {
  revenue: number;
  cogs: number;
  sm: number;
  rd: number;
  ga: number;
  other: number;
  da: number;
  interest: number;
  gains: number; // non-operating gains (+) / losses (−)
  tax: number;
}

export interface CashFlow {
  ni: number;
  da: number;
  noncash: number; // impairments, write-offs and losses added back
  dAR: number;
  dInv: number;
  dAP: number;
  dDef: number;
  cfo: number;
  capex: number;
  acquisitions: number;
  disposals: number;
  securities: number;
  cfi: number;
  debtIn: number;
  debtOut: number;
  equityIn: number;
  buybacks: number;
  dividends: number;
  cff: number;
  net: number;
  directOp: number; // sum of op-tagged cash movements (must equal cfo)
}

export interface Quarter {
  turn: number;
  pnl: PnL;
  bs: Books;
  cf: CashFlow;
  ebitda: number;
  ni: number;
  headcount: number;
  byInd: Partial<Record<IndustryId, { rev: number; contrib: number }>>;
  check: { bs: number; cash: number }; // tie-out differences (should be ~0)
}

export interface ActiveInvestment {
  uid: number;
  def: string;
  scope?: string; // office id or region id
  start: number;
  upfront: number;
  stage: number; // index into stages, if staged
  stageLeft: number;
  state: 'ramp' | 'active' | 'done' | 'failed' | 'cancelled';
  age: number; // quarters active
  granted: number; // tech already granted
  diligenced: boolean;
  bookValue: number; // capitalised amount still on the balance sheet
  label?: string;
}

export interface Company {
  name: string;
  founder: FounderId;
  home: string;
  primary: IndustryId;
  divisions: IndustryId[];
  offices: Office[];
  tech: Partial<Record<IndustryId, number>>;
  rdBudget: Partial<Record<IndustryId, number>>;
  brand: number;
  reputation: number;
  esg: number;
  culture: number;
  regionBrand: Record<RegionId, number>;
  policy: Record<RegionId, RegionPolicy>;
  books: Books;
  open: Books; // balance sheet at the start of the current quarter
  techInfo: Partial<Record<IndustryId, { rp: number; target: number }>>;
  loans: Loan[];
  cap: CapTable;
  people: Person[];
  investments: ActiveInvestment[];
  nol: number; // tax losses carried forward, all countries
  nolBy: Record<string, number>; // …by country
  taxBy?: Record<string, { pre: number; tax: number }>; // last quarter's taxable profit and tax by country
  intel: number;
  quarters: Quarter[]; // most recent last, capped
  pnl: PnL; // accumulating for the current quarter
  cfTags: { op: number; inv: number; fin: number; capex: number; acq: number; disp: number; sec: number; debtIn: number; debtOut: number; eqIn: number; buyback: number; div: number; noncash: number };
  valuation: number;
  valParts: Record<string, number>;
  rating: string;
  ratingScore: number;
  autoRevolver: boolean;
  factoring?: boolean; // invoices are sold to a factor as they are billed
  /** Company policies in force (review wave 3), by id. */
  policies?: string[];
  /** Turn of the last change of policy (one swap a year). */
  policyChanged?: number;
  /** Published guidance for the coming year's revenue (listed companies). */
  guidance?: { level: 'cautious' | 'base' | 'stretch'; from: number; target: number; due: number };
  /** Share of payroll paid in stock options (0, 0.1 or 0.2). */
  optionPay?: number;
  /** Input prices locked by forward contracts until a turn. */
  hedge?: { commodity: number; energy: number; cloud: number; until: number; fee: number };
  /** Franchised units: a partner runs the store; you earn a royalty on its sales. */
  franchises?: { city: string; ind: IndustryId; share: number; opened: number; sales: number }[];
  negCashTurns: number;
  moonshots: number;
  diligence: Record<string, boolean>;
}

export interface RivalOffice {
  city: string;
  ind: IndustryId;
  share: number;
  price: number;
  sales: number; // effort ratio
  cap: number;
  opened: number;
  war: number; // quarters of active price war remaining
  built?: number; // turn the last capacity expansion was started (plant takes time to build)
}

export interface Rival {
  id: number;
  name: string;
  ceo: string;
  personality: Personality;
  color: string;
  hq: string;
  industries: IndustryId[];
  offices: RivalOffice[];
  cash: number;
  debt: number;
  tech: Partial<Record<IndustryId, number>>;
  brand: number;
  eff: number;
  alive: boolean;
  fate?: string;
  isPublic: boolean;
  relation: number; // attitude to the player, −100..100
  hostility: number; // 0..10 escalation level
  pactUntil: number;
  pact?: 'truce' | 'alliance';
  lastMove: number;
  grievances: number; // player aggressions not yet answered
  rev: number; // last quarter
  profit: number;
  ebitda: number; // last quarter
  revTTM: number[]; // last eight quarters
  ebitdaTTM: number[]; // last eight quarters
  ar: number; // receivables
  inv: number; // inventory
  wc: number; // working capital tied up: receivables + stock − payables − deferred revenue
  nolBy: Record<string, number>; // tax losses carried forward, by country
  spread: number; // what lenders charge over the policy rate
  rating: string;
  raised: number; // equity raised from investors since the game began
  lastRaise: number; // turn of the last raise
  valuation: number;
  distress: number;
  known: boolean; // discovered by player
  /** When it came into the game (absent for the founding field). */
  since?: number;
  /** Turn of its last change of chief executive. */
  ceoSince?: number;
  /** State aid received (state champions only). */
  aid?: number;
  /** What has passed between it and you, newest last. */
  feud?: { turn: number; who: 'you' | 'them'; text: string }[];
  /** Plant bought in the last year, valued partly at cost until its sales are in the accounts (as for the player). */
  ramp?: { cost: number; done: number }[];
}

export interface Macro {
  gap: number;
  growth: number;
  infl: number;
  rate: number;
  spread: number;
  sentiment: number;
  cpi: number;
  wageIdx: number;
  commodity: number;
  energy: number;
  cloud: number;
  labor: number;
  prodIdx: number; // economy-wide labour productivity; real wages grow with it
  phase: 'expansion' | 'boom' | 'slowdown' | 'recession' | 'recovery';
  recessionLeft: number;
  shock: { gap: number; infl: number; rate: number }; // one-off shocks queued by events
  indIdx: Record<IndustryId, number>;
  regionGap: Record<RegionId, number>;
  fx: Record<FxZone, number>; // value of each currency against the reporting currency
  hist: { gap: number; infl: number; rate: number; sentiment: number }[];
}

export interface TempMod {
  kind: 'demand' | 'market' | 'wages' | 'inputs' | 'capacity' | 'prod' | 'attrition' | 'valuation' | 'quality';
  pct: number;
  until: number; // last turn it applies
  office?: string;
  region?: RegionId;
  ind?: IndustryId;
  src: string;
}

export interface NewsItem {
  turn: number;
  text: string;
  tone: 'good' | 'bad' | 'info' | 'rival' | 'macro';
}

export interface AdvisorNote {
  tone: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  text: string;
  terms?: string[];
  who: 'CFO' | 'COO' | 'CMO' | 'Chair' | 'CHRO' | 'CTO';
}

export interface HistoryRow {
  turn: number;
  revenue: number;
  ebitda: number;
  ni: number;
  cash: number;
  debt: number;
  valuation: number;
  share: number; // global share in primary industry
  headcount: number;
  morale: number;
  gap: number;
  rate: number;
  rivals: number[]; // rival valuations
}

export interface MnaTarget {
  id: string;
  name: string;
  city: string;
  ind: IndustryId;
  revenue: number; // quarterly
  margin: number;
  share: number;
  staff: number;
  cap: number;
  price: number; // asking price
  culture: number;
  hidden: number; // hidden liabilities as fraction of price (0 = clean)
  synergy: number; // true synergy potential
  diligenced: boolean;
  expires: number;
  blurb: string;
}

export interface Attribution {
  market: number;
  strategy: number;
  luck: number;
  execution: number;
  notes: { turn: number; kind: 'market' | 'strategy' | 'luck' | 'execution'; text: string; value: number }[];
}

export interface Outcome2 {
  kind: 'won' | 'lost';
  how: string;
  title: string;
  text: string;
  turn: number;
  grade?: string; // A, B, C, D or F, for games that run to the end
  /** The grade and score as they stood when the game ended, so nothing done afterwards can change them (absent in older saves). */
  final?: FinalGrade;
}

/** How a finished game is judged (victory.ts finalGrade). */
export interface FinalGrade { grade: string; label: string; score: number; won: boolean; rank: number; companies: number; multiple: number; market: number; goal: number; rows: [string, string, number][]; founderValue: number }

export interface Settings {
  victories: Record<VictoryId, boolean>;
  sandbox: { noBankruptcy: boolean; revealMap: boolean; noEvents: boolean; calmMacro: boolean };
  tutorial: boolean;
  /** Let the COO decide small cards (no crisis, no rival, nothing over 4% of a quarter's revenue) without asking. */
  delegate?: boolean;
}

export interface TurnReport {
  turn: number;
  headline: string;
  revenue: number;
  prevRevenue: number;
  ni: number;
  cashDelta: number;
  cash: number;
  valuation: number;
  prevValuation: number;
  bullets: string[];
  /** Small cards the COO decided at the start of the coming quarter. */
  delegated?: { title: string; choice: string; text: string }[];
}

export interface GameState {
  v: number;
  id: string;
  seed: string;
  rng: number;
  uid: number;
  turn: number;
  maxTurns: number;
  mode: 'standard' | 'sandbox' | 'scenario';
  scenario?: string;
  difficulty: Difficulty;
  /** How this game is played, fixed at the start (Sprint, Ironman, Daily, a Brutal scenario). */
  rules: GameRules;
  /** Set when the game was rewound: how the earlier run ended, for comparison. */
  replay?: { from: number; title: string; valuation: number; founderValue: number };
  settings: Settings;
  company: Company;
  discovered: Record<string, number>; // 0 unknown, 1 scouted, 2 present
  scouting: { city: string; ready: number }[];
  mk: Record<string, { f: number; s: number }>; // per market: fringe strength, demand shock multiplier
  cityIdx: Record<string, number>; // cumulative city growth index
  macro: Macro;
  rivals: Rival[];
  queue: PendingEvent[];
  scheduled: { id: string; turn: number; ctx: EventCtx }[];
  fired: Record<string, number>;
  eventLog: EventLogEntry[];
  flags: Record<string, number>; // name → expiry turn (Infinity-like 9999 = permanent)
  mods: TempMod[];
  news: NewsItem[];
  advisor: AdvisorNote[];
  history: HistoryRow[];
  attribution: Attribution;
  targets: MnaTarget[];
  candidates: Person[];
  loanOffers: LoanOffer[];
  equityOffer?: EquityOffer;
  status: 'playing' | 'won' | 'lost';
  outcome?: Outcome2;
  continued: boolean; // kept playing after a win
  streaks: Record<string, number>;
  report?: TurnReport;
  counters: Record<string, number>;
  created: number;
}

export interface GameRules {
  /** Ten years (40 quarters) instead of twenty-five, graded at the end. */
  sprint?: boolean;
  /** One life: no save slots, no rewinds, no save files. */
  ironman?: boolean;
  /** The daily challenge for this date (YYYY-MM-DD): everyone gets the same world. */
  daily?: string;
  /** A scenario played on Brutal for the third star. */
  brutal?: boolean;
}

export interface NewGameOpts {
  name: string;
  industry: IndustryId;
  city: string;
  founder: FounderId;
  difficulty: Difficulty;
  seed: string;
  mode: 'standard' | 'sandbox' | 'scenario';
  scenario?: string;
  rivals?: number;
  sprint?: boolean;
  ironman?: boolean;
  daily?: string;
}

export interface ActionResult {
  ok: boolean;
  msg: string;
}
