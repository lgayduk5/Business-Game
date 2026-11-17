// App updates. The service worker installs a new build in the background and waits; this offers a
// reload, saves the game, tells the waiting worker to take over, and reloads once it has.
import { persist, ui } from './store';

let requested = false;

function offer(worker: ServiceWorker) {
  if (document.querySelector('.update')) return;
  const el = document.createElement('div');
  el.className = 'update';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span>A new version of Going Concern is ready.</span><button class="btn sm go" type="button">Reload</button><button class="btn sm" type="button" aria-label="Later">Later</button>';
  const [reload, later] = el.querySelectorAll('button');
  reload.addEventListener('click', async () => {
    reload.disabled = true;
    await persist.now();
    try {
      if (ui.g && ui.screen === 'game') sessionStorage.setItem('gc:resume', 'auto:' + ui.g.id);
    } catch {
      /* private mode: the player continues from the title screen instead */
    }
    requested = true;
    worker.postMessage('skipWaiting');
    // If the worker has already taken over (or never will), reload anyway.
    window.setTimeout(() => location.reload(), 4000);
  });
  later.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also changes the controller; only reload when the player asked for it.
    if (requested) location.reload();
  });
  window.addEventListener('load', async () => {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register('./sw.js');
    } catch {
      return;
    }
    const ready = (w: ServiceWorker | null) => {
      if (w && navigator.serviceWorker.controller) offer(w);
    };
    ready(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => w.state === 'installed' && ready(w));
    });
    // Phones keep an installed app alive for days: look for a new build whenever it comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  });
}
