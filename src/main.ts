import './styles.css';
import { initEvents, render, setView, ui } from './ui/store';
import { shell } from './ui/shell';
import { title, wizard } from './ui/screens/title';
import './ui/screens/hq';
import './ui/screens/map';
import './ui/screens/ops';
import './ui/screens/regions';
import './ui/screens/corp';
import './ui/screens/capital';
import './ui/screens/team';
import './ui/screens/modals';

setView(() => (ui.screen === 'game' && ui.g ? shell(ui.g) : ui.screen === 'new' && ui.wizard ? wizard() : title()));
initEvents();
render(false);

// Offline support: the service worker precaches the whole game on first visit.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
// Expose state for automated checks and curious players.
(window as any).__gc = ui;
