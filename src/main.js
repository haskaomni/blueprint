import './style.css';
import { Viewer } from './viewer.js';
import { VEHICLES } from './config.js';
import { initUI, bindViewerHooks } from './ui.js';

const vehicle = VEHICLES[0];
const canvas = document.getElementById('viewport');
const viewer = new Viewer(canvas, vehicle);

const ui = initUI(viewer, vehicle);
bindViewerHooks(viewer, ui);

viewer
  .load()
  .then(() => viewer.start())
  .catch((err) => {
    console.error('Failed to load vehicle model:', err);
    const el = document.getElementById('loading');
    el.textContent = 'MODEL LOAD FAILED — SEE CONSOLE';
  });

// expose for headless testing / debugging
window.__viewer = viewer;
