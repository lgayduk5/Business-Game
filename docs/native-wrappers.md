# Wrapping Going Concern as a native app

The game is a static web app with no backend, so it can be wrapped for the Mac with
**Tauri** and for iOS and Android with **Capacitor** without touching game code. The
wrappers are not built yet; this note is the plan.

## Why no game code needs to change

- **The engine is pure TypeScript** (`/engine`, no DOM types allowed by its tsconfig),
  so it runs the same in a WebView as in a browser.
- **Everything is relative** (`base: './'` in `vite.config.ts`). The build loads from
  `file://`, `tauri://` or `capacitor://` exactly as it does from a GitHub Pages sub-path.
- **No network access at all.** No CDN, fonts or analytics; nothing to allow-list.
- **Storage is IndexedDB**, available in WKWebView (iOS and macOS) and Android WebView.
  `src/storage/saves.ts` is the only storage module; if you ever want native files
  (for example iCloud-synced saves), replace it with a version calling the Tauri `fs`
  or Capacitor `Filesystem` plugin. The engine's `toSaveFile` / `fromSaveFile` stay the same.
- **Turns run in a module Web Worker.** WKWebView and Android WebView support module
  workers; `src/ui/store.ts` already falls back to the main thread if a worker cannot start.
- **Sound uses the Web Audio API**, which works in both, after the first tap.
- **The service worker is optional inside a wrapper** (the files are already local).
  It registers only in production builds and failure is ignored, so nothing breaks
  if a WebView does not support it.
- **Safe areas** (`env(safe-area-inset-*)`, `viewport-fit=cover`) are already handled
  for notches and home indicators.

## macOS with Tauri 2

```bash
npm install -D @tauri-apps/cli
npx tauri init        # app name "Going Concern"; web assets: ../dist; dev URL: http://localhost:5173;
                      # dev command: npm run dev; build command: npm run build
npx tauri icon public/icons/icon-512.png
npx tauri build       # produces a .app and .dmg in src-tauri/target/release/bundle/
```

In `src-tauri/tauri.conf.json`, set a window size of about 1280×860 with a minimum of
390×700, and a Content Security Policy of `default-src 'self'; style-src 'self' 'unsafe-inline';
worker-src 'self' blob:` (the UI uses inline style attributes; nothing else needs relaxing).
Signing and notarisation for distribution need an Apple Developer ID.

## iOS and Android with Capacitor 6

```bash
npm install @capacitor/core
npm install -D @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Going Concern" com.example.goingconcern --web-dir dist
npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios      # build and run from Xcode
npx cap open android  # build and run from Android Studio
```

- Generate app icons and splash screens from `public/icons/icon-512.png` and
  `maskable-512.png` with `@capacitor/assets`.
- Lock nothing: the layout adapts to portrait and landscape.
- Optional plugins that fit the game: `@capacitor/haptics` for a light tap on End
  quarter, `@capacitor/share` to share a save file or a seed.
- Re-run `npm run build && npx cap sync` after every web change.

## What to test in each wrapper

`npm run smoke` covers the browser. In a wrapper, check by hand: start a game, end a
quarter (exercises the worker), quit and continue (IndexedDB), export and import a
save (file download and file picker behave differently in WebViews — on iOS the
export should go through the share sheet, which is a small change in `exportSave`).
