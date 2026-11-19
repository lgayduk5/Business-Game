// Regression tests for the tooling audit (system 15): BUG_AUDIT.md → "15. Tooling, build & PWA".
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../vite.config';
import { fmt } from '../scripts/fmt-json.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Builds the service worker for a small fake dist folder and runs it against stand-ins for the browser's APIs. */
function serviceWorker() {
  const out = mkdtempSync(join(tmpdir(), 'gc-sw-'));
  try {
    for (const f of ['index.html', 'manifest.webmanifest', 'assets/index-abc.js', 'assets/index-abc.js.map', 'icons/icon-192.png']) {
      mkdirSync(join(out, f, '..'), { recursive: true });
      writeFileSync(join(out, f), f);
    }
    const plugin = (config as any).plugins.find((p: any) => p.name === 'going-concern-sw');
    plugin.configResolved({ build: { outDir: out } });
    plugin.closeBundle();
    const code = readFileSync(join(out, 'sw.js'), 'utf8');
    const on: Record<string, (e: unknown) => void> = {};
    const added: { url: string; init?: RequestInit }[] = [];
    const deleted: string[] = [];
    const version = /const VERSION = '([^']+)'/.exec(code)![1];
    const self = { addEventListener: (t: string, f: (e: unknown) => void) => (on[t] = f), location: { origin: 'https://example.test' }, clients: { claim: async () => undefined } };
    const caches = {
      open: async () => ({ addAll: async (rs: { url: string; init?: RequestInit }[]) => void added.push(...rs) }),
      keys: async () => ['gc-0123456789ab', 'someone-else', version],
      delete: async (k: string) => void deleted.push(k),
    };
    class Request { constructor(public url: string, public init?: RequestInit) {} }
    new Function('self', 'caches', 'Request', code)(self, caches, Request);
    const fire = async (type: string) => {
      let wait: Promise<unknown> | undefined;
      on[type]({ waitUntil: (p: Promise<unknown>) => (wait = p) });
      await wait;
    };
    return { fire, added, deleted };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe('service worker', () => {
  it('precaches every built file, straight from the server (a page left in the HTTP cache would point at the last build)', async () => {
    const sw = serviceWorker();
    await sw.fire('install');
    expect(sw.added.map((r) => r.url)).toEqual(['./', './assets/index-abc.js', './icons/icon-192.png', './index.html', './manifest.webmanifest']);
    expect(sw.added.every((r) => r.init?.cache === 'reload')).toBe(true);
  });

  it('a new build deletes the old build’s cache and nothing else', async () => {
    const sw = serviceWorker();
    await sw.fire('activate');
    expect(sw.deleted).toEqual(['gc-0123456789ab']);
  });
});

describe('balance harness (scripts/sim.ts)', () => {
  const sim = (...args: string[]) =>
    spawnSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/sim.ts', ...args], { cwd: root, encoding: 'utf8' });
  const tiny = ['--seeds', '1', '--turns', '4', '--bots', 'steady,blitz', '--diff', 'normal', '--ind', 'saas,mfg', '--no-write'];

  it('the report reads the same whatever the number of workers', () => {
    const run = (w: string) => sim(...tiny, '--workers', w).stdout.replace(/Took \d+ s\./, '');
    const one = run('1');
    expect(one).toContain('## By founder');
    expect(run('2')).toBe(one);
  }, 60_000);

  it('a flag without a value, or an empty grid, is refused rather than passing with no games', () => {
    const missing = sim('--ci', '--seeds');
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('--seeds needs a value');
    const empty = sim('--ci', '--seeds', '0');
    expect(empty.status).not.toBe(0);
    expect(empty.stderr).toContain('Nothing to play');
  }, 60_000);
});

describe('house JSON style (scripts/fmt-json.mjs)', () => {
  it('leaves out an undefined member however long the object is, as JSON.stringify does', () => {
    const v = { gone: undefined, long: 'x'.repeat(160), inner: { gone: undefined, kept: 1 } };
    expect(JSON.parse(fmt(v))).toEqual(JSON.parse(JSON.stringify(v)));
    expect(fmt(v)).not.toContain('null');
  });
});
