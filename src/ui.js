import { VIEWS } from './viewer.js';
import { VEHICLES, PALETTE } from './config.js';

const $ = (id) => document.getElementById(id);

const ACTION_DEFS = [
  { id: 'explode', key: '1', label: 'PARTS' },
  { id: 'drive', key: '2', label: 'HOVER' },
  { id: 'scan', key: '3', label: 'SCAN' },
  { id: 'fire', key: '4', label: 'FIRE' },
];

export function initUI(viewer, vehicle) {
  // ---- masthead ----
  $('mast-drawing').textContent = `DWG ${vehicle.drawing}`;
  $('mast-title').textContent = vehicle.title;
  $('mast-code').textContent = vehicle.code;
  $('mast-faction').textContent = vehicle.faction;
  $('mast-role').textContent = vehicle.role;
  $('mast-desc').textContent = vehicle.description;

  // ---- vehicle index ----
  const list = $('vehicle-list');
  for (const v of VEHICLES) {
    const li = document.createElement('li');
    if (v.id === vehicle.id) li.classList.add('active');
    li.innerHTML = `<span class="v-title">${v.title}</span><span class="v-code">${v.code}</span>`;
    list.appendChild(li);
  }

  // ---- camera view buttons ----
  const viewBox = $('view-buttons');
  const viewBtns = {};
  for (const [name, v] of Object.entries(VIEWS)) {
    const btn = document.createElement('button');
    btn.textContent = v.label;
    btn.addEventListener('click', () => viewer.setView(name));
    viewBox.appendChild(btn);
    viewBtns[v.label] = btn;
  }

  // ---- system action buttons ----
  const actionBox = $('action-buttons');
  const actionBtns = {};
  for (const a of ACTION_DEFS) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="k">${a.key}</span>${a.label}`;
    actionBox.appendChild(btn);
    actionBtns[a.id] = btn;
  }

  const refreshActions = () => {
    actionBtns.explode.classList.toggle('active', viewer.state.explode.target > 0.5);
    actionBtns.scan.classList.toggle('active', viewer.state.scan.target > 0.5);
    actionBtns.drive.classList.toggle('active', viewer.state.drive.target > 0.5);
    actionBtns.fire.disabled = !viewer.canFire();
    actionBtns.explode.disabled = viewer.fire.active;
  };

  const run = {
    explode: () => viewer.toggleExplode(),
    drive: () => viewer.toggleDrive(),
    scan: () => viewer.toggleScan(),
    fire: () => viewer.fireWeapon(),
  };
  for (const a of ACTION_DEFS) {
    actionBtns[a.id].addEventListener('click', () => {
      run[a.id]();
      refreshActions();
    });
  }
  window.addEventListener('keydown', (e) => {
    const a = ACTION_DEFS.find((x) => x.key === e.key);
    if (a && !e.repeat) {
      run[a.id]();
      refreshActions();
    }
  });

  return { viewBtns, refreshActions };
}

export function bindViewerHooks(viewer, ui) {
  const label = $('part-label');

  viewer.hooks.onViewState = (state) => {
    $('view-state').textContent = state;
    for (const [lbl, btn] of Object.entries(ui.viewBtns)) {
      btn.classList.toggle('active', lbl === state);
    }
  };

  viewer.hooks.onTelemetry = (t) => {
    $('tele-az').textContent = `${t.azimuth.toFixed(1)}°`;
    $('tele-el').textContent = `${t.elevation.toFixed(1)}°`;
    $('tele-zoom').textContent = `${t.zoom.toFixed(2)}×`;
    $('tele-explode').textContent = `${Math.round(t.explode * 100)}%`;
    $('tele-fps').textContent = `${Math.round(t.fps)}`;
    ui.refreshActions();
  };

  viewer.hooks.onHoverPart = (part) => {
    if (!part) {
      label.hidden = true;
      return;
    }
    label.querySelector('.pl-code').textContent = part.def.code;
    label.querySelector('.pl-title').textContent = part.def.title;
    label.querySelector('.pl-desc').textContent = part.def.description || '';
    label.hidden = false;
  };

  viewer.hooks.onPartAnchor = (x, y, visible) => {
    if (!visible) {
      label.hidden = true;
      return;
    }
    if (!label.hidden) {
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
    }
  };

  viewer.hooks.onReady = () => {
    $('loading').classList.add('done');
  };
}

export { PALETTE };
