// Regression tests from the audit of the market, the macro economy, modifiers and per-quarter mechanics.
import { describe, expect, it } from 'vitest';
import { endTurn, grantOptions, lockInputs, newGame, setGuidance, setOptionPay, turnLabel, type GameState } from '../engine/src/index';
import { opts, play } from './helpers';

const pool = (g: GameState) => g.company.cap.holders.find((h) => h.round === 'Options')?.shares ?? 0;
const held = (g: GameState) => g.company.cap.founder + g.company.cap.holders.reduce((s, h) => s + h.shares, 0);

describe('audit: option grants', () => {
  it('are priced at the company’s value in the normal case', () => {
    const g = newGame(opts({ seed: 'options' }));
    const shares = g.company.cap.shares;
    grantOptions(g, g.company.valuation * 0.01);
    expect(g.company.cap.shares / shares).toBeCloseTo(1.01, 9);
    expect(pool(g)).toBeCloseTo(shares * 0.01, 3);
  });

  it('do not hand employees the company many times over as its value nears zero, and still issue shares at zero', () => {
    for (const valuation of [50_000, 1_000, 1, 0]) {
      const g = newGame(opts({ seed: 'options' }));
      expect(setOptionPay(g, 0.2).ok).toBe(true);
      g.company.valuation = valuation; // options this quarter are priced at the last valuation
      const shares = g.company.cap.shares;
      endTurn(g);
      const issued = g.company.cap.shares - shares;
      expect(issued, `valuation ${valuation}`).toBeGreaterThan(0); // the pay was booked as options, so options were granted
      expect(issued / shares, `valuation ${valuation}`).toBeLessThanOrEqual(0.25 + 1e-9); // before: up to 98x the shares in a quarter
      expect(pool(g)).toBeCloseTo(issued, 3);
      expect(held(g)).toBeCloseTo(g.company.cap.shares, 0);
    }
  });
});

describe('audit: guidance and input locks', () => {
  it('guidance cannot be replaced in the quarter it is judged, so a miss cannot be dodged', () => {
    const g = play(newGame(opts({ seed: 'guide' })), 8);
    g.company.cap.isPublic = true;
    expect(setGuidance(g, 'stretch').ok).toBe(true);
    g.company.guidance!.target = 1e15; // certain to be missed
    while (g.turn < g.company.guidance!.due) endTurn(g);
    expect(setGuidance(g, 'cautious').ok).toBe(false); // before: accepted, and the stretch promise was never judged
    const due = g.turn;
    endTurn(g);
    expect(g.news.some((n) => n.turn === due && n.text.includes('missed its revenue guidance'))).toBe(true);
    expect(setGuidance(g, 'cautious').ok).toBe(true);
  });

  it('asking to lock inputs again says when the current lock ends', () => {
    const g = newGame(opts({ industry: 'mfg', seed: 'hedge' }));
    expect(lockInputs(g, 4).ok).toBe(true);
    const again = lockInputs(g, 8);
    expect(again.ok).toBe(false);
    expect(again.msg).toContain(turnLabel(g.turn + 4)); // before: "locked until 8 quarters from when you signed"
  });
});
