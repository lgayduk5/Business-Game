// Regression tests from the audit of the UI core (store, shell, kit, tips). The keyboard checks (nothing pressed
// behind a dialog or while a quarter resolves) need a browser and live in scripts/ui-smoke.mjs.
import { describe, expect, it } from 'vitest';
import { endTurn, newGame } from '../engine/src/index';
import { $, N, getTip, logo, resetTips } from '../src/ui/kit';
import { cashTip, runway } from '../src/ui/tips';
import { opts } from './helpers';

describe('UI core', () => {
  it('an overdrawn company has no runway left, not a negative one', () => {
    const g = newGame(opts());
    endTurn(g);
    const q = g.company.quarters[g.company.quarters.length - 1];
    q.cf.cfo = -300_000;
    q.cf.capex = 0;
    g.company.books.cash = -280_000; // below zero for one quarter: still playing, and HQ shows the runway warning
    expect(runway(g).quarters).toBe(0);
    resetTips();
    cashTip(g);
    expect(getTip(0)).toContain('0.0 quarters');
    expect(getTip(0)).not.toContain('-0.');
  });

  it('numbers with explanations escape the text shown and the breakdown', () => {
    resetTips();
    const evil = '<img src=x onerror=alert(1)>';
    const html = N(evil, evil, evil, [[evil, evil]]) + $(1000, evil, evil, [[evil, evil, true]]);
    expect(html).not.toContain('<img');
    expect(getTip(0) + getTip(1)).not.toContain('<img');
  });

  it('a company logo keeps an emoji at the start of the name whole', () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const name of ['😀 Robotics', '🚀🌙', 'Ünïcode Co']) expect(logo(name, 'red')).not.toMatch(lone);
    expect(logo('😀 Robotics', 'red')).toContain('>😀R</text>');
  });
});
