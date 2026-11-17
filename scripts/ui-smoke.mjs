// Browser smoke test: plays the first turns at phone and desktop sizes, saves screenshots,
// fails on any console error. Needs Playwright and Chrome on the machine (not a project dependency):
//   npm run build && node scripts/ui-smoke.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/npm-tools/node_modules/playwright')); }

const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('shots', { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const only = process.argv[2];
try {
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
    if (only && only !== name) continue;
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: name === 'phone', isMobile: name === 'phone' });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    const shot = (n) => page.screenshot({ path: `shots/${name}-${n}.png`, fullPage: false });
    const tap = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(120); };
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector('.title');
    await shot('01-title');
    await tap('[data-a=newGame]');
    if (await page.locator('[data-k=industry]').count()) { await tap('[data-k=industry]'); await shot('02-industry'); await tap('[data-a=wzNext]'); }
    await tap('[data-k=city]'); await shot('03-city'); await tap('[data-a=wzNext]');
    await tap('[data-k=founder]'); await tap('[data-a=wzNext]');
    await shot('04-setup'); await tap('[data-a=wzNext]');
    await page.waitForSelector('.shell');
    await shot('05-hq-start');
    for (let i = 0; i < 3; i++) {
      await tap('[data-a=endTurn]');
      await page.waitForSelector('.modal', { timeout: 15000 });
      if (i === 0) await shot('06-report');
      // work through whatever modals come up (report, then any events)
      for (let k = 0; k < 8 && (await page.locator('.modal').count()); k++) {
        const btn = page.locator('.modal [data-a=reportDone], .modal [data-a=choose], .modal [data-a=eventDone], .modal [data-a=close]').first();
        if (!(await btn.count())) break;
        await btn.click(); await page.waitForTimeout(150);
      }
    }
    await shot('07-hq');
    // an event card, start to finish
    const queued = await page.evaluate(() => { const { ui, render, engine } = window.__gc; const ok = engine.EVENT.data_breach && engine.queueEvent(ui.g, 'data_breach', {}); render(); return !!ok; });
    if (queued) {
      await tap('[data-a=endTurn]'); await page.waitForSelector('.modal'); await shot('07a-event');
      await tap('.modal [data-a=choose]'); await shot('07b-event-result'); await tap('.modal [data-a=eventDone]');
    }
    await page.locator('.n').first().click(); await page.waitForTimeout(150); await shot('08-tooltip');
    await page.mouse.click(5, 300);
    for (const t of ['map', 'ops', 'corp', 'intel']) {
      if (!(await page.locator(`.tabs [data-v=${t}]`).count())) continue;
      await tap(`.tabs [data-v=${t}]`); await shot(`09-${t}`);
      const subs = await page.locator('.subtabs button').count();
      for (let s = 1; s < subs; s++) { await page.locator('.subtabs button').nth(s).click(); await page.waitForTimeout(120); await shot(`09-${t}-${s}`); }
    }
    await page.evaluate(() => window.scrollTo(0, 600)); await shot('10-scrolled');
    // saves: reload the page and continue from the autosave
    await page.reload(); await page.waitForSelector('.title');
    if (!(await page.locator('[data-a=loadSlot]').count())) errors.push(`${name}: no Continue button after reload (autosave missing)`);
    else { await tap('[data-a=loadSlot]'); await page.waitForSelector('.shell'); await shot('11-continued'); }
    // the review and the scenario picker
    await tap('.tabs [data-v=intel]'); await tap('[data-a=sub][data-v=advisor]'); await shot('12-advisor');
    await tap('[data-a=postmortem]'); await shot('13-review'); await page.keyboard.press('Escape');
    await tap('[data-a=menu]'); await tap('[data-a=askQuit]'); await tap('.modal [data-a=quit]');
    await tap('[data-a=scenarios]'); await shot('14-scenarios'); await tap('[data-a=scenario]'); await tap('[data-a=startScenario]');
    await page.waitForSelector('.shell'); await shot('15-scenario-hq');
    await ctx.close();
  }
  // ── PWA: manifest is installable, every path is relative, and the game runs with the network off
  if (!only || only === 'offline') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`offline: ${e.message}`));
    await page.goto(`http://localhost:${PORT}/`);
    const html = await page.content();
    if (/(src|href)="\/(?!\/)/.test(html)) errors.push('offline: index.html contains an absolute path');
    const man = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    const sizes = (man.icons ?? []).map((i) => i.sizes);
    if (man.display !== 'standalone' || !man.start_url?.startsWith('.') || !sizes.includes('192x192') || !sizes.includes('512x512') || !(man.icons ?? []).some((i) => i.purpose === 'maskable'))
      errors.push('offline: manifest is missing installability fields');
    for (const ic of man.icons) if ((await page.evaluate(async (u) => (await fetch(u)).status, ic.src)) !== 200) errors.push(`offline: icon ${ic.src} missing`);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('.title', { timeout: 10000 });
    await page.locator('[data-a=newGame]').click();
    for (let i = 0; i < 4; i++) { const b = page.locator('.choice').first(); if (await b.count()) await b.click(); await page.locator('[data-a=wzNext]').click(); }
    await page.waitForSelector('.shell');
    await page.locator('[data-a=endTurn]').click();
    await page.waitForSelector('.modal .printout', { timeout: 15000 });
    await page.screenshot({ path: 'shots/offline-turn.png' });
    console.log('Offline check passed: installed service worker served the game and a quarter ran with the network off.');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('UI smoke test passed; screenshots in ./shots');
