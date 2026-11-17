import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { EVENTS, INVESTMENTS, validateEvents } from '../engine/src/index';
import { validate } from './schema';

const load = (f: string) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));

describe('content matches its schemas', () => {
  it('industries.json', () => expect(validate(load('industries.json'), load('schemas/industries.schema.json'))).toEqual([]));
  it('cities.json', () => expect(validate(load('cities.json'), load('schemas/cities.schema.json'))).toEqual([]));
  it('investments.json', () => expect(validate(load('investments.json'), load('schemas/investments.schema.json'))).toEqual([]));
  for (const f of readdirSync(new URL('../data/events/', import.meta.url))) {
    it(`events/${f}`, () => expect(validate(load('events/' + f), load('schemas/events.schema.json'))).toEqual([]));
  }
});

describe('event deck', () => {
  it('is internally consistent (ids unique, chains and effects resolve)', () => expect(validateEvents()).toEqual([]));
  it('has the events this milestone promises', () => expect(EVENTS.length).toBeGreaterThanOrEqual(60));
  it('every event offers a real choice or is a chained consequence', () => {
    for (const e of EVENTS) expect(e.opts.length >= 2 || e.w === 0, e.id).toBe(true);
  });
  it('every event and investment teaches something', () => {
    for (const e of EVENTS) expect(e.lesson.length, e.id).toBeGreaterThan(20);
    for (const i of INVESTMENTS) expect(i.lesson.length, i.id).toBeGreaterThan(20);
  });
});
