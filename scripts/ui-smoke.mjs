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
    await page.locator('.n').first().click(); await page.waitForTimeout(150); await shot('08-tooltip');
    await page.mouse.click(5, 300);
    for (const t of ['map', 'ops', 'corp', 'intel']) {
      if (!(await page.locator(`.tabs [data-v=${t}]`).count())) continue;
      await tap(`.tabs [data-v=${t}]`); await shot(`09-${t}`);
      const subs = await page.locator('.subtabs button').count();
      for (let s = 1; s < subs; s++) { await page.locator('.subtabs button').nth(s).click(); await page.waitForTimeout(120); await shot(`09-${t}-${s}`); }
    }
    await page.evaluate(() => window.scrollTo(0, 600)); await shot('10-scrolled');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('UI smoke test passed; screenshots in ./shots');
