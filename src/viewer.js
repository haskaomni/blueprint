import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeSurfaceMaterial,
  makeHullMaterial,
  makeEdgeMaterial,
  makeGroundMaterial,
  INK,
  ACCENT,
} from './shaders.js';

const TARGET_LENGTH = 10.8; // longest normalized model edge
const CAMERA_DIST = 42;
const EDGE_ANGLE = 27; // deg threshold for EdgesGeometry
const HULL_WIDTH = 0.025; // world-space outline width

const VIEWS = {
  iso: { label: 'ISO', dir: [-1.15, 0.82, 1.35], up: [0, 1, 0], zoom: 1.0 },
  frontq: { label: 'F-QTR', dir: [-1, 0.48, 1], up: [0, 1, 0], zoom: 1.0 },
  rearq: { label: 'R-QTR', dir: [1, 0.48, -1], up: [0, 1, 0], zoom: 1.0 },
  side: { label: 'SIDE', dir: [1, 0.015, 0], up: [0, 1, 0], zoom: 1.05 },
  front: { label: 'FRONT', dir: [0, 0.015, 1], up: [0, 1, 0], zoom: 1.05 },
  plan: { label: 'PLAN', dir: [0, 1, 0], up: [1, 0, 0], zoom: 0.92 },
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutSmooth = (t) => t * t * (3 - 2 * t);

export class Viewer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config  vehicle config entry
   * @param {object} hooks   { onTelemetry, onViewState, onHoverPart, onPartAnchor, onReady }
   */
  constructor(canvas, config, hooks = {}) {
    this.canvas = canvas;
    this.config = config;
    this.hooks = hooks;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.parts = [];
    this.plumes = [];
    this.hoverPart = null;
    this.selectedPart = null;
    this.state = {
      explode: { t: 0, target: 0 },
      scan: { t: 0, target: 0 },
      drive: { t: 0, target: 0 },
    };
    this.fire = { active: false, t: 0, burst: 0 };
    this.tween = null;
    this.time = 0;
    this.fps = 60;
    this.lastTelemetry = 0;

    this._initRenderer();
    this._initScene();
    this._initCameraControls();
    this._initPointer();
    this._lastNow = performance.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._lastNow = performance.now();
    });
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // stage: scan rotation / hover float / recoil / explode pull-back
    this.stage = new THREE.Group();
    // inner: normalization scale + grounding offset
    this.inner = new THREE.Group();
    // orient: raw-model axis fix from config
    this.orient = new THREE.Group();
    this.stage.add(this.inner);
    this.inner.add(this.orient);
    this.scene.add(this.stage);

    this._applyOrientation();

    // dual blueprint grid
    const gridFine = new THREE.GridHelper(72, 72, 0xc6e3fe, 0xc6e3fe);
    gridFine.material.transparent = true;
    gridFine.material.opacity = 0.035;
    gridFine.material.depthWrite = false;
    const gridCoarse = new THREE.GridHelper(72, 18, 0xc6e3fe, 0xc6e3fe);
    gridCoarse.material.transparent = true;
    gridCoarse.material.opacity = 0.085;
    gridCoarse.material.depthWrite = false;
    gridCoarse.position.y = 0.003;
    this.scene.add(gridFine, gridCoarse);

    // ground shadow disc
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), makeGroundMaterial());
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.006;
    this.ground.renderOrder = 0;
    this.scene.add(this.ground);
  }

  _initCameraControls() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);
    this.camera.up.set(0, 1, 0);
    this.cameraTarget = new THREE.Vector3(0, 4.6, 0);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minZoom = 0.62;
    this.controls.maxZoom = 2.8;
    this.controls.minPolarAngle = 0.025;
    this.controls.maxPolarAngle = 0.495 * Math.PI;
    this.controls.rotateSpeed = 0.56;
    this.controls.target.copy(this.cameraTarget);

    // user drag -> view state becomes ORBIT (wheel zoom keeps the label)
    this.controls.addEventListener('start', () => {
      this._orbitProbe = this._sphericalOf(this.camera.position);
    });
    this.controls.addEventListener('end', () => {
      if (!this._orbitProbe || this.tween) return;
      const now = this._sphericalOf(this.camera.position);
      const dTheta = Math.abs(now.theta - this._orbitProbe.theta);
      const dPhi = Math.abs(now.phi - this._orbitProbe.phi);
      if (dTheta > 0.01 || dPhi > 0.01) this._setViewState('ORBIT');
      this._orbitProbe = null;
    });

    this._onResize();
    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    let frustum = 18.5;
    if (aspect < 0.8) frustum = 25;
    else if (aspect < 1.15) frustum = 21.5;
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const px = Math.min(window.devicePixelRatio, 2);
    for (const p of this.parts) {
      for (const m of p.surfaceMats) m.uniforms.uPx.value = px;
    }
  }

  _sphericalOf(pos) {
    return new THREE.Spherical().setFromVector3(
      pos.clone().sub(this.controls.target)
    );
  }

  _setViewState(label) {
    this.viewState = label;
    this.hooks.onViewState?.(label);
  }

  // ------------------------------------------------------------- model load

  _applyOrientation() {
    const o = this.config.orientation || { rotX: 0, rotY: 0, rotZ: 0 };
    this.orient.rotation.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0);
    this._orientQuat = new THREE.Quaternion().setFromEuler(this.orient.rotation);
    this._orientQuatInv = this._orientQuat.clone().invert();
  }

  /** Drop the current vehicle (geometry, materials, plumes) and load a new one. */
  async loadVehicle(config) {
    // dispose previous model
    const disposedGeo = new Set();
    const disposedMat = new Set();
    this.orient.traverse((obj) => {
      if (obj.geometry && !disposedGeo.has(obj.geometry)) {
        disposedGeo.add(obj.geometry);
        obj.geometry.dispose();
      }
      if (obj.material && !disposedMat.has(obj.material)) {
        disposedMat.add(obj.material);
        obj.material.dispose();
      }
    });
    this.orient.clear();
    for (const pl of this.plumes || []) {
      this.stage.remove(pl.group);
      pl.flash.geometry.dispose();
      pl.cone.geometry.dispose();
      pl.flashMat.dispose();
      pl.coneMat.dispose();
    }
    this.plumes = [];

    // reset interaction / action state
    this.config = config;
    this.parts = [];
    this.hoverPart = null;
    this.selectedPart = null;
    this.state.explode = { t: 0, target: 0 };
    this.state.scan = { t: 0, target: 0 };
    this.state.drive = { t: 0, target: 0 };
    this.fire = { active: false, t: 0, burst: 0 };
    this.tween = null;
    this.controls.enabled = true;
    this.stage.scale.setScalar(1);
    this.stage.position.set(0, 0, 0);
    this.stage.rotation.set(0, 0, 0);
    this.hooks.onHoverPart?.(null);

    this._applyOrientation();
    return this.load();
  }

  async load() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(this.config.src);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    // collect meshes; record each mesh's ancestor path so part rules can
    // match semantic group names (e.g. "Superheavy Block 3 V4_30>Raptor")
    const meshes = [];
    const walk = (obj, path) => {
      const p = path ? `${path}>${obj.name || '?'}` : obj.name || '?';
      if (obj.isMesh) {
        obj.userData.path = p;
        meshes.push(obj);
      } else if (obj.isLineSegments) {
        obj.material = makeEdgeMaterial();
      }
      for (const c of obj.children) walk(c, p);
    };
    walk(root, '');

    this._buildParts(meshes);
    this._normalize();
    this._computeExplodeOffsets();
    this._buildPlumes();

    this.setView('iso', true);
    this.hooks.onReady?.(this.parts);
    return this;
  }

  /** Wrap one geometry into the 3-layer blueprint stack (surface/hull/edges). */
  _wrapGeometry(geo, name) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const group = new THREE.Group();
    group.name = name;

    const surfaceMat = makeSurfaceMaterial(Math.min(window.devicePixelRatio, 2));
    const surface = new THREE.Mesh(geo, surfaceMat);

    const hullMat = makeHullMaterial(HULL_WIDTH);
    const hull = new THREE.Mesh(geo, hullMat);
    hull.renderOrder = 1;

    const edgeMat = makeEdgeMaterial(this.config.edgeOpacity ?? 0.78);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, EDGE_ANGLE), edgeMat);
    edges.renderOrder = 2;

    group.add(surface, hull, edges);
    return { group, surface, surfaceMat, edgeMat, hullMat };
  }

  _buildParts(meshes) {
    const defs = this.config.parts || [];
    const useRegions = defs.some((d) => d.region);
    const buckets = defs.map(() => []); // wrapped entries per part

    if (useRegions) {
      // split triangle soup by raw-space slab regions (single-mesh models).
      // Weld first: CFD exports split the hull into strips, and EdgesGeometry
      // would treat every strip boundary as an open edge.
      const axisIdx = { x: 0, y: 1, z: 2 }[defs.find((d) => d.region).region.axis];
      const ranges = defs.map((d) => d.region);
      for (const mesh of meshes) {
        const weldedSrc = mergeVertices(mesh.geometry, 1e-3);
        const split = splitGeometryByRanges(weldedSrc, axisIdx, ranges);
        split.forEach((geo, i) => {
          if (!geo) return;
          // clipped geometry is non-indexed soup: weld for smooth normals
          const welded = mergeVertices(geo, 1e-3);
          welded.computeVertexNormals();
          const w = this._wrapGeometry(welded, `${mesh.name}#${defs[i].code}`);
          w.group.applyMatrix4(mesh.matrixWorld);
          w.box = indexedBoundingBox(welded).applyMatrix4(mesh.matrixWorld);
          buckets[i].push(w);
        });
      }
    } else if (defs.length) {
      // match mode: assign whole meshes to parts by ancestor-path substring,
      // first match wins; unmatched meshes go to the part with fallback:true.
      // The source node's world matrix is baked onto the wrapper group —
      // quantized/compressed GLBs carry dequantization + placement there.
      const fallback = Math.max(0, defs.findIndex((d) => d.fallback));
      for (const mesh of meshes) {
        const path = mesh.userData.path || mesh.name;
        let i = defs.findIndex((d) => d.match && path.includes(d.match));
        if (i < 0) i = fallback;
        const w = this._wrapGeometry(mesh.geometry, mesh.name);
        w.group.applyMatrix4(mesh.matrixWorld);
        w.box = indexedBoundingBox(mesh.geometry).applyMatrix4(mesh.matrixWorld);
        buckets[i].push(w);
      }
    } else {
      // no part defs: one part per mesh
      meshes.forEach((mesh, i) => {
        defs.push({ code: `P-${String(i + 1).padStart(2, '0')}`, title: mesh.name || `PART ${i + 1}`, description: '' });
        const w = this._wrapGeometry(mesh.geometry, mesh.name);
        w.group.applyMatrix4(mesh.matrixWorld);
        w.box = indexedBoundingBox(mesh.geometry).applyMatrix4(mesh.matrixWorld);
        buckets.push([w]);
      });
    }

    defs.forEach((def, i) => {
      if (!buckets[i].length) return;
      const group = new THREE.Group();
      group.name = `part:${def.code}`;
      const surfaceMats = [];
      const edgeMats = [];
      const hullMats = [];
      const surfaces = [];
      const box = new THREE.Box3();
      for (const w of buckets[i]) {
        group.add(w.group);
        surfaceMats.push(w.surfaceMat);
        edgeMats.push(w.edgeMat);
        hullMats.push({ mat: w.hullMat, scale: w.group.scale.x });
        w.surface.userData.partIndex = i;
        surfaces.push(w.surface);
        box.union(w.box);
      }
      this.orient.add(group);
      this.parts.push({
        def,
        group,
        surfaceMats,
        edgeMats,
        hullMats,
        surfaces,
        rawBox: box,
        rawCenter: box.getCenter(new THREE.Vector3()),
        emph: 0,
        emphTarget: 0,
        basePos: new THREE.Vector3(),
        explodeOffset: new THREE.Vector3(),
      });
    });
  }

  _normalize() {
    // measure in raw space: inner may still carry the previous vehicle's
    // scale after a vehicle switch, so reset it first; then force a full
    // matrix refresh — setFromObject would otherwise read stale matrixWorld
    this.inner.scale.setScalar(1);
    this.inner.position.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.orient);
    const size = box.getSize(new THREE.Vector3());
    const s = TARGET_LENGTH / Math.max(size.x, size.y, size.z);
    this.modelScale = s;
    this.inner.scale.setScalar(s);
    const center = box.getCenter(new THREE.Vector3());
    this.inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);

    // outline width is in geometry-local units and each wrapper group carries
    // the source node's baked scale — compensate both to hit world width
    for (const p of this.parts) {
      for (const h of p.hullMats) {
        h.mat.uniforms.uWidth.value = HULL_WIDTH / (s * h.scale);
      }
    }

    // ground shadow disc sized from horizontal footprint
    this.ground.scale.set(Math.max(size.x, size.z) * s * 2.4, Math.max(size.x, size.z) * s * 2.4, 1);

    this.modelHeight = size.y * s;
    this.cameraTarget.set(0, this.modelHeight * 0.45, 0);
    this.controls.target.copy(this.cameraTarget);
  }

  _computeExplodeOffsets() {
    // overall center in oriented+normalized space
    const M = new THREE.Matrix4()
      .makeRotationFromQuaternion(this._orientQuat)
      .multiply(new THREE.Matrix4().makeScale(this.modelScale, this.modelScale, this.modelScale));
    const overall = new THREE.Box3();
    const partBoxes = [];
    for (const p of this.parts) {
      const b = p.rawBox.clone().applyMatrix4(M);
      overall.union(b);
      partBoxes.push(b);
    }
    const C = overall.getCenter(new THREE.Vector3());

    const order = this.parts
      .map((p, i) => ({ p, i, r: partBoxes[i].getCenter(new THREE.Vector3()).distanceTo(C) }))
      .sort((a, b) => a.r - b.r);

    const placed = [];
    const margin = 0.2;
    const maxD = 3.0; // keep the exploded stack inside the frustum
    for (const { p, i } of order) {
      const c = partBoxes[i].getCenter(new THREE.Vector3());
      const dir = c.clone().sub(C);
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize();
      const step = Math.max(partBoxes[i].getSize(new THREE.Vector3()).length() * 0.35, 0.5);
      let d = step;
      let candidate;
      for (let tries = 0; tries < 40 && d <= maxD; tries++) {
        candidate = partBoxes[i].clone().translate(dir.clone().multiplyScalar(d));
        candidate.expandByScalar(margin);
        if (!placed.some((b) => b.intersectsBox(candidate))) break;
        d += step;
      }
      d = Math.min(d, maxD);
      candidate = partBoxes[i].clone().translate(dir.clone().multiplyScalar(d));
      placed.push(candidate.clone());
      // world-space offset -> orient-local (raw) offset
      const world = dir.clone().multiplyScalar(d);
      p.explodeOffset.copy(world.applyQuaternion(this._orientQuatInv).divideScalar(this.modelScale));
    }
  }

  _buildPlumes() {
    this.plumes = [];
    const w = this.config.weapon;
    if (!w || !w.muzzles?.length) return;
    const dir = new THREE.Vector3(...w.direction).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const len = (w.range || 6) * 0.55;

    for (const m of w.muzzles) {
      const g = new THREE.Group();
      g.position.set(m[0], m[1], m[2]);
      g.quaternion.copy(quat);

      const flashMat = new THREE.MeshBasicMaterial({
        color: ACCENT.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const flashGeo = new THREE.RingGeometry(0.1, 0.52, 28);
      flashGeo.rotateX(-Math.PI / 2);
      const flash = new THREE.Mesh(flashGeo, flashMat);

      const coneMat = new THREE.MeshBasicMaterial({
        color: INK.clone().lerp(ACCENT, 0.4),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const coneGeo = new THREE.CylinderGeometry(0.15, 0.44, 1, 22, 1, true);
      coneGeo.translate(0, -0.5, 0);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.scale.set(1, len, 1);

      g.add(flash, cone);
      this.stage.add(g);
      this.plumes.push({ group: g, flash, flashMat, cone, coneMat, len });
    }
  }

  // ------------------------------------------------------------------ views

  setView(name, immediate = false) {
    const v = VIEWS[name];
    if (!v) return;
    const dir = new THREE.Vector3(...v.dir).normalize();
    const up = new THREE.Vector3(...v.up).normalize();
    const endPos = this.cameraTarget.clone().add(dir.multiplyScalar(CAMERA_DIST));
    const endSph = this._sphericalOf(endPos);
    endSph.phi = Math.max(endSph.phi, 1e-4);

    if (immediate) {
      this.camera.position.copy(endPos);
      this.camera.up.copy(up);
      this.camera.zoom = v.zoom;
      this.camera.lookAt(this.cameraTarget);
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this._setViewState(v.label);
      return;
    }

    // shortest-path theta
    const startSph = this._sphericalOf(this.camera.position);
    let dTheta = endSph.theta - startSph.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    this.tween = {
      t: 0,
      dur: (this.reducedMotion ? 140 : 920) / 1000,
      startSph,
      endSph,
      dTheta,
      startUp: this.camera.up.clone(),
      endUp: up,
      startZoom: this.camera.zoom,
      endZoom: v.zoom,
      label: v.label,
    };
    this.controls.enabled = false;
  }

  _updateTween(dt) {
    const tw = this.tween;
    if (!tw) return;
    tw.t = Math.min(tw.t + dt / tw.dur, 1);
    const k = easeInOutCubic(tw.t);
    const sph = new THREE.Spherical(
      THREE.MathUtils.lerp(tw.startSph.radius, tw.endSph.radius, k),
      THREE.MathUtils.lerp(tw.startSph.phi, tw.endSph.phi, k),
      tw.startSph.theta + tw.dTheta * k
    );
    this.camera.position.copy(
      new THREE.Vector3().setFromSpherical(sph).add(this.cameraTarget)
    );
    this.camera.up.copy(tw.startUp.clone().lerp(tw.endUp, k).normalize());
    this.camera.zoom = THREE.MathUtils.lerp(tw.startZoom, tw.endZoom, k);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
    if (tw.t >= 1) {
      // snap to exact terminal state
      const dir = new THREE.Vector3().setFromSpherical(tw.endSph);
      this.camera.position.copy(this.cameraTarget).add(dir);
      this.camera.up.copy(tw.endUp);
      this.camera.zoom = tw.endZoom;
      this.camera.lookAt(this.cameraTarget);
      this.camera.updateProjectionMatrix();
      this.tween = null;
      this.controls.enabled = true;
      this.controls.update();
      this._setViewState(tw.label);
    }
  }

  // ---------------------------------------------------------------- actions

  toggleExplode() {
    const on = this.state.explode.target < 0.5;
    if (on && this.fire.active) return false;
    this.state.explode.target = on ? 1 : 0;
    if (on) {
      this.state.scan.target = 0;
      this.state.drive.target = 0;
    }
    return on;
  }

  toggleScan() {
    const on = this.state.scan.target < 0.5;
    if (on) this.state.explode.target = 0;
    this.state.scan.target = on ? 1 : 0;
    return on;
  }

  toggleDrive() {
    const on = this.state.drive.target < 0.5;
    if (on) this.state.explode.target = 0;
    this.state.drive.target = on ? 1 : 0;
    return on;
  }

  canFire() {
    return (
      !this.fire.active &&
      this.state.explode.target < 0.5 &&
      this.state.explode.t < 0.02
    );
  }

  fireWeapon() {
    if (!this.canFire() || !this.plumes.length) return false;
    this.fire = { active: true, t: 0, burst: 0 };
    return true;
  }

  // ---------------------------------------------------------------- pointer

  _initPointer() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let downAt = null;

    this.canvas.addEventListener('pointermove', (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this._pickHover();
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      downAt = [e.clientX, e.clientY];
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 5) return;
      this.selectedPart = this.hoverPart === this.selectedPart ? null : this.hoverPart;
    });
  }

  _pickHover() {
    const surfaces = [];
    for (const p of this.parts) surfaces.push(...p.surfaces);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(surfaces, false);
    const part = hits.length ? this.parts[hits[0].object.userData.partIndex] : null;
    if (part !== this.hoverPart) {
      this.hoverPart = part;
      this.hooks.onHoverPart?.(part || this.selectedPart);
    }
  }

  // ------------------------------------------------------------------- loop

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const now = performance.now();
      const dt = Math.min((now - this._lastNow) / 1000, 0.05);
      this._lastNow = now;
      this._tick(dt);
    };
    loop();
  }

  _damp(cur, target, lambda, dt) {
    if (this.reducedMotion) return target;
    return THREE.MathUtils.damp(cur, target, lambda, dt);
  }

  _tick(dt) {
    this.time += dt;
    if (dt > 0) this.fps = THREE.MathUtils.lerp(this.fps, 1 / dt, 0.06);

    this._updateTween(dt);
    if (!this.tween) this.controls.update();

    // state machine: damped 0/1 targets
    const ex = this.state.explode;
    ex.t = this._damp(ex.t, ex.target, 4.5, dt);
    const sc = this.state.scan;
    sc.t = this._damp(sc.t, sc.target, 4.5, dt);
    const dr = this.state.drive;
    dr.t = this._damp(dr.t, dr.target, 4.5, dt);

    // parts explosion
    const e = easeOutSmooth(THREE.MathUtils.clamp(ex.t, 0, 1));
    for (const p of this.parts) {
      p.group.position.copy(p.basePos).addScaledVector(p.explodeOffset, e);
      // hover/select emphasis
      const target =
        p === this.selectedPart ? 1 : p === this.hoverPart ? 0.55 : 0;
      p.emph = this._damp(p.emph, target, 10, dt);
      for (const m of p.surfaceMats) m.uniforms.uEmphasis.value = p.emph;
      const c = INK.clone().lerp(ACCENT, p.emph * 0.85);
      for (const m of p.edgeMats) m.color.copy(c);
    }

    // explode pull-back (shrink stage = ortho zoom-out without fighting controls)
    this.stage.scale.setScalar(1 - 0.35 * e);

    // scan: turntable swing
    this.stage.rotation.y = sc.t * Math.sin(this.time * 0.72) * (Math.PI / 12);

    // fire envelope
    let fireEnv = 0;
    const w = this.config.weapon;
    if (this.fire.active) {
      this.fire.t += dt / (w?.duration || 0.9);
      if (this.fire.t >= 1) {
        this.fire.burst++;
        if (this.fire.burst >= (w?.bursts || 1)) {
          this.fire = { active: false, t: 0, burst: 0 };
        } else {
          this.fire.t = 0;
        }
      }
      fireEnv = Math.sin(Math.PI * THREE.MathUtils.clamp(this.fire.t, 0, 1));
    }

    // hover float + recoil
    const dir = new THREE.Vector3(...(w?.direction || [0, -1, 0])).normalize();
    const hoverY = dr.t * (0.22 + 0.16 * Math.sin(this.time * 1.25));
    const recoil = fireEnv * (w?.recoil || 0.08);
    this.stage.position.copy(dir.clone().multiplyScalar(-recoil));
    this.stage.position.y += hoverY;

    // plumes
    this.plumes.forEach((pl, i) => {
      const flicker = dr.t * (0.1 + 0.06 * Math.sin(this.time * 9 + i * 1.7));
      const env = Math.max(fireEnv, flicker);
      const s = 0.7 + env * 0.5;
      pl.flashMat.opacity = env * 0.65;
      pl.flash.scale.setScalar(0.6 + env * 0.9);
      pl.coneMat.opacity = env * 0.85;
      pl.cone.scale.set(s, pl.len * (0.28 + env * 0.85), s);
    });

    this.renderer.render(this.scene, this.camera);

    // part label anchor
    const shown = this.hoverPart || this.selectedPart;
    if (shown) {
      const world = shown.group.localToWorld(shown.rawCenter.clone());
      const ndc = world.project(this.camera);
      const visible = ndc.z < 1;
      this.hooks.onPartAnchor?.(
        (ndc.x * 0.5 + 0.5) * window.innerWidth,
        (-ndc.y * 0.5 + 0.5) * window.innerHeight,
        visible
      );
    }

    // throttled telemetry
    if (this.time - this.lastTelemetry > 0.22) {
      this.lastTelemetry = this.time;
      const sph = this._sphericalOf(this.camera.position);
      this.hooks.onTelemetry?.({
        azimuth: THREE.MathUtils.radToDeg(sph.theta),
        elevation: 90 - THREE.MathUtils.radToDeg(sph.phi),
        zoom: this.camera.zoom * this.stage.scale.x,
        explode: e,
        fps: this.fps,
      });
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.renderer.dispose();
  }
}

/**
 * Bounding box over only the vertices referenced by the index — split
 * geometries share the full position attribute, so Box3.setFromObject /
 * geometry.computeBoundingBox would return the whole model's bounds.
 */
function indexedBoundingBox(geo) {
  const box = new THREE.Box3();
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  if (geo.index) {
    for (let i = 0; i < geo.index.count; i++) {
      box.expandByPoint(v.fromBufferAttribute(pos, geo.index.getX(i)));
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      box.expandByPoint(v.fromBufferAttribute(pos, i));
    }
  }
  return box;
}

/**
 * Split a triangle-soup geometry into one geometry per axis slab by actually
 * CLIPPING triangles against the slab planes (Sutherland–Hodgman). Centroid
 * assignment is not enough for this model: the mid-body skin is made of huge
 * low-poly triangles spanning tens of units, which would tear across parts.
 * Output geometries are non-indexed position-only; callers should weld and
 * recompute normals afterwards.
 */
function splitGeometryByRanges(geo, axisIdx, ranges) {
  const pos = geo.attributes.position;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = (k) => (index ? index.getX(k) : k);
  const buckets = ranges.map(() => []);

  // clip polygon (array of [x,y,z]) against plane axis=value, keeping the
  // side where (value - coord) * side >= 0  (side=+1 keeps >=, -1 keeps <=)
  const clipPlane = (poly, value, side) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = (value - a[axisIdx]) * side;
      const db = (value - b[axisIdx]) * side;
      const ina = da >= 0;
      const inb = db >= 0;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = da / (da - db);
        out.push([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ]);
      }
    }
    return out;
  };

  const v0 = [0, 0, 0];
  const v1 = [0, 0, 0];
  const v2 = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    [v0, v1, v2].forEach((v, k) => {
      const idx = vi(t * 3 + k);
      v[0] = pos.getX(idx);
      v[1] = pos.getY(idx);
      v[2] = pos.getZ(idx);
    });
    const z0 = v0[axisIdx];
    const z1 = v1[axisIdx];
    const z2 = v2[axisIdx];
    const lo = Math.min(z0, z1, z2);
    const hi = Math.max(z0, z1, z2);
    for (let r = 0; r < ranges.length; r++) {
      const range = ranges[r];
      if (hi < range.min || lo >= range.max) continue;
      let poly = [
        [...v0],
        [...v1],
        [...v2],
      ];
      if (lo < range.min) poly = clipPlane(poly, range.min, -1);
      if (poly.length >= 3 && hi >= range.max) poly = clipPlane(poly, range.max, +1);
      if (poly.length < 3) continue;
      for (let k = 1; k + 1 < poly.length; k++) {
        buckets[r].push(...poly[0], ...poly[k], ...poly[k + 1]);
      }
    }
  }

  return buckets.map((verts) => {
    if (!verts.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    return g;
  });
}

export { VIEWS };
