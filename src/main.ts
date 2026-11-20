import './styles.css';
import * as engine from '@engine';
import { initEvents, render, setView, ui } from './ui/store';
import { shell } from './ui/shell';
import { registerServiceWorker } from './ui/update';
import { title, wizard } from './ui/screens/title';
import './ui/screens/hq';
import './ui/screens/map';
import './ui/screens/ops';
import './ui/screens/regions';
import './ui/screens/corp';
import './ui/screens/capital';
import './ui/screens/team';
import './ui/screens/invest';
import './ui/screens/policies';
import './ui/screens/intel';
import './ui/screens/events';
import './ui/screens/rivals';
import './ui/screens/learn';
import './ui/screens/files';
import './ui/screens/modes';
import './ui/screens/tutorial';
import './ui/screens/modals';
import './ui/soundtrack';

setView(() => (ui.screen === 'game' && ui.g ? shell(ui.g) : ui.screen === 'new' && ui.wizard ? wizard() : title()));
initEvents();
render(false);

// Offline support: the service worker precaches the whole game on first visit, and offers a reload
// when a new build has been downloaded.
if (import.meta.env.PROD) registerServiceWorker();
// Expose state for automated checks and curious players.
(window as any).__gc = { ui, render, engine };
