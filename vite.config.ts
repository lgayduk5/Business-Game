import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Emits dist/sw.js after the bundle is written. The worker precaches every
 * file in dist (hashed bundle + manifest + icons) so the game runs fully
 * offline once it has been opened a single time.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  return {
    name: 'going-concern-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha1');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = `// Generated at build time — do not edit.
const VERSION = 'gc-${version}';
const ASSETS = ${JSON.stringify(['./', ...files.map((f) => './' + f)])};
// Straight from the server, not the browser's HTTP cache: GitHub Pages lets browsers keep files for ten minutes,
// and a page kept from the last build would point at files this cache does not hold (the game would not open offline).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gc-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
// The page itself comes from the network first, so a new build is noticed as soon as you are online;
// everything else (content-hashed files) comes from the cache first. Offline, the cached page is used.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).catch(() =>
        caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || caches.match('./index.html', { ignoreVary: true })),
      ),
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).catch(() => Response.error())),
  );
});
`;
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages project sites).
  base: './',
  resolve: { alias: { '@engine': resolve(root, 'engine/src/index.ts') } },
  worker: { format: 'es' },
  plugins: [serviceWorker()],
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
