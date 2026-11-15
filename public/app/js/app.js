// Entry point: two ways to listen.
//   "Pick a country": the globe, then a category, then the country plays.
//   "Whole-planet record": the turntable (js/main.js).

import './main.js';
import { initExplore, explorePause, exploreState } from './explore.js';

const tabs = { explore: document.getElementById('tabExplore'), record: document.getElementById('tabRecord') };
const panels = { explore: document.getElementById('explore'), record: document.getElementById('recordMode') };
let booted = false;

export function setMode(mode, focus = false) {
  if (document.body.dataset.mode === mode) return;
  explorePause();
  window.blueRecord.pause();
  document.body.dataset.mode = mode;
  for (const m of Object.keys(tabs)) {
    tabs[m].setAttribute('aria-selected', String(m === mode));
    tabs[m].tabIndex = m === mode ? 0 : -1;
    panels[m].hidden = m !== mode;
  }
  if (mode === 'record' && !booted) { booted = true; window.blueRecord.boot(); }
  const url = new URL(location.href);
  if (mode === 'record') url.searchParams.set('mode', 'record'); else url.searchParams.delete('mode');
  history.replaceState(null, '', url);
  if (focus) tabs[mode].focus();
}

for (const [mode, el] of Object.entries(tabs)) {
  el.addEventListener('click', () => setMode(mode));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setMode(mode === 'explore' ? 'record' : 'explore', true);
    }
  });
}

document.body.dataset.mode = 'explore';
tabs.record.tabIndex = -1;
initExplore();
if (new URLSearchParams(location.search).get('mode') === 'record') setMode('record');

/** Stop all sound, whichever mode is playing. The website calls this when its own player starts. */
function pauseAll() { explorePause(); window.blueRecord.pause(); }

window.blueApp = { setMode, x: exploreState, pause: pauseAll };
