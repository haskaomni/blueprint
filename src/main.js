import './style.css';
import { Viewer } from './viewer.js';
import { VEHICLES } from './config.js';
import { initUI, bindViewerHooks, setMasthead, setLoading } from './ui.js';

const canvas = document.getElementById('viewport');
const viewer = new Viewer(canvas, VEHICLES[0]);

let switching = false;
async function selectVehicle(vehicle) {
  if (switching || viewer.config.id === vehicle.id) return;
  switching = true;
  setLoading(true, `LOADING ${vehicle.title}…`);
  try {
    await viewer.loadVehicle(vehicle);
    setMasthead(vehicle);
    ui.setActiveVehicle(vehicle.id);
    ui.refreshActions();
  } catch (err) {
    console.error('Failed to load vehicle model:', err);
    setLoading(true, 'MODEL LOAD FAILED — SEE CONSOLE');
  } finally {
    switching = false;
  }
}

const ui = initUI(viewer, VEHICLES[0], { onSelectVehicle: selectVehicle });
bindViewerHooks(viewer, ui);

setLoading(true);
viewer
  .load()
  .then(() => viewer.start())
  .catch((err) => {
    console.error('Failed to load vehicle model:', err);
    setLoading(true, 'MODEL LOAD FAILED — SEE CONSOLE');
  });

// expose for headless testing / debugging
window.__viewer = viewer;
window.__selectVehicle = (id) => {
  const v = VEHICLES.find((x) => x.id === id);
  if (v) return selectVehicle(v);
};
