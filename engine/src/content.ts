// Typed access to the JSON content in /data. To add content, edit those files;
// to add a new events file, add one import line below.
import type {
  CityDef, EventDef, FounderDef, GlossaryEntry, IndustryDef, IndustryId, InvestmentDef, Personality, RegionId,
  RivalPersonalityDef, ScenarioDef,
} from './types';
import industriesJson from '../../data/industries.json';
import worldJson from '../../data/cities.json';
import foundersJson from '../../data/founders.json';
import rivalsJson from '../../data/rivals.json';
import investmentsJson from '../../data/investments.json';
import glossaryJson from '../../data/glossary.json';
import scenariosJson from '../../data/scenarios.json';
import namesJson from '../../data/names.json';
import evMacro from '../../data/events/macro.json';
import evMarket from '../../data/events/market.json';
import evOperational from '../../data/events/operational.json';
import evRegulatory from '../../data/events/regulatory.json';
import evOpportunity from '../../data/events/opportunity.json';
import evStress from '../../data/events/stress.json';
import evRival from '../../data/events/rival.json';

const as = <T>(x: unknown) => x as T;

export const IND_LIST = as<IndustryDef[]>(industriesJson);
export const INDUSTRIES = Object.fromEntries(IND_LIST.map((i) => [i.id, i])) as Record<IndustryId, IndustryDef>;
export const hasInd = (k: string): k is IndustryId => k in INDUSTRIES;

const world = as<{ regions: Record<RegionId, { name: string; short: string; blurb: string }>; cities: CityDef[] }>(worldJson);
export const CITIES = world.cities;
export const CITY: Record<string, CityDef> = Object.fromEntries(CITIES.map((c) => [c.id, c]));
export const REGIONS = world.regions;
/** Regions that actually contain cities in the loaded data. */
export const REGION_LIST = (Object.keys(REGIONS) as RegionId[]).filter((r) => CITIES.some((c) => c.region === r));
export const citiesIn = (r: RegionId) => CITIES.filter((c) => c.region === r);

export const FOUNDERS = as<FounderDef[]>(foundersJson);
export const FOUNDER = Object.fromEntries(FOUNDERS.map((f) => [f.id, f])) as Record<string, FounderDef>;

const rivals = as<{ personalities: RivalPersonalityDef[]; names: string[]; ceos: string[]; colors: string[] }>(rivalsJson);
export const PERSONALITIES = rivals.personalities;
export const PERSONALITY = Object.fromEntries(PERSONALITIES.map((p) => [p.id, p])) as Record<Personality, RivalPersonalityDef>;
export const RIVAL_NAMES = rivals.names;
export const RIVAL_CEOS = rivals.ceos;
export const RIVAL_COLORS = rivals.colors;

export const INVESTMENTS = as<InvestmentDef[]>(investmentsJson);
export const INV: Record<string, InvestmentDef> = Object.fromEntries(INVESTMENTS.map((i) => [i.id, i]));

export const EVENTS: EventDef[] = [evMacro, evMarket, evOperational, evRegulatory, evOpportunity, evStress, evRival].flatMap((f) => as<EventDef[]>(f));
export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export const GLOSSARY = as<GlossaryEntry[]>(glossaryJson);
export const TERM: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((t) => [t.id, t]));
export const SCENARIOS = as<ScenarioDef[]>(scenariosJson);
export const NAMES = as<{ first: string[]; last: string[]; traits: string[]; targets: string[]; investors: string[]; banks: string[] }>(namesJson);

export const hasInventory = (k: IndustryId) => INDUSTRIES[k].dio > 0;
export const isCapital = (k: IndustryId) => INDUSTRIES[k].capPerUnit > 0;
