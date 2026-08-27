# Starship Blueprint — Engineering Blueprint 3D Vehicle Viewer

An interactive "engineering blueprint" 3D vehicle viewer. A WebGL (Three.js)
viewport renders the vehicle as blueprint linework — deep-blue paper, ink
outlines, screen-space cross-hatching — composited over a CSS drawing sheet
with dual-scale grids, frame ticks and telemetry readouts.

**Live demo:** https://haskaomni.github.io/blueprint/

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build -> dist/
npm run preview  # serve the production build
```

Open the printed local URL. No environment variables or keys required.

## Controls

- **Drag** to orbit (view state flips to `ORBIT`), **wheel** to zoom (0.62–2.8×).
- **CAMERA VIEW** (top right): ISO / F-QTR / R-QTR / SIDE / FRONT / PLAN,
  animated ~920 ms easeInOutCubic transitions (140 ms under
  `prefers-reduced-motion`).
- **SYSTEM ACTION** (bottom right, or keys `1–4`):
  - `PARTS` — exploded view: the vehicle separates into its configured
    sections along radial directions (AABB-tested so parts never overlap),
    camera pulls back automatically.
  - `HOVER` — semantic "drive": gentle vertical float + low engine flicker.
  - `SCAN` — turntable scan: ±15° sinusoidal yaw swing.
  - `FIRE` — engine ignition: per-muzzle flash ring + additive plume cone,
    `sin(πt)` envelope, optional bursts, slight recoil. Disabled while
    exploded; explode is disabled while firing.
- **Hover / click** a part to highlight it (`uEmphasis` blend + edge tint)
  and pin its annotation label.
- `PARTS` is mutually exclusive with `HOVER`/`SCAN`.

## Project layout

```
index.html        DOM skeleton: masthead, vehicle index, panels, frame
src/main.js       bootstrap: create Viewer, wire UI, start loop
src/viewer.js     engine: renderer/scene/ortho camera, GLB load + normalize,
                  3-layer part build, view tweens, OrbitControls, action
                  state machine (MathUtils.damp), raycast hover/select,
                  telemetry, plume effects
src/shaders.js    ShaderMaterials: blueprint surface (two-tone + halftone +
                  cross-hatch + emphasis), inverted-hull outline, ground disc
src/config.js     data-driven vehicle definitions (see below)
src/ui.js         DOM wiring: buttons, telemetry, view state, part labels
src/style.css     blueprint theme: grid paper, noise, drawing frame, panels
public/models/    vehicle GLBs
shots/            headless-render verification screenshots
```

## Adding a new vehicle

1. Drop `my-vehicle.glb` into `public/models/`.
2. Append an entry to `VEHICLES` in `src/config.js`:

```js
{
  id: 'my-vehicle', code: 'MV', title: 'MY VEHICLE', drawing: 'MV-001',
  faction: '...', role: '...', description: '...',
  src: `${import.meta.env.BASE_URL}models/my-vehicle.glb`,
  orientation: { rotX: 0, rotY: 0, rotZ: 0 },   // fix the raw axis first
  weapon: { kind: 'plume', muzzles: [[x,y,z], ...], direction: [0,-1,0],
            duration: 0.9, bursts: 1, recoil: 0.08, range: 6 },
  parts: [ /* ... see below ... */ ],
}
```

The model is normalized automatically: `orientation` is applied first, then
the longest edge is scaled to ~10.8 units, centered on X/Z, grounded at y=0.
`weapon.muzzles` are given in that **normalized** space (vehicle upright,
~10.8 units tall).

Parts can be defined two ways:

- `match: "substring"` — assign whole meshes whose name contains the
  substring (multi-mesh GLBs).
- `region: { axis: 'z', min, max }` — split a single-mesh GLB into parts by
  **clipping** triangles against axis-aligned slab planes in **raw** model
  coordinates (inspect the GLB first, e.g. with a gltf-transform script, to
  find sensible cut planes). Clipped parts are welded and re-normaled
  automatically.

## Model analysis notes (starship.glb)

The bundled GLB is a single mesh / single node / single material
(40,705 verts, 68,848 tris), raw bounds X −8.6..44.5, Y 61.4..88.8,
Z −68.2..82.0: the vehicle lies along **Z** in raw space, so
`orientation.rotX = -π/2` stands it upright. Part regions are raw-Z slabs:
aft section (z < −30, dense aft flaps + engine bay), propellant barrel
(−30..30, extremely low-poly skin — which is why parts are clipped, not
centroid-assigned), forward section (z > 30, nosecone + forward flaps).
Muzzles sit at the skirt bottom center (normalized y ≈ 0.12, radius 0.55
ring + center).

## Model source & license

- Model: SpaceX Starship, by AllThingsSpace / Sketchfab user
  [@sunnychen753](https://sketchfab.com/sunnychen753), obtained via
  fetchcfd (project 4329), distributed under a **CC Attribution** license.
- If you redistribute or build on this project, keep the attribution above.
- All viewer code in this repository is original; the blueprint styling is a
  clean-room reimplementation of the engineering-drawing aesthetic.

## License

The original viewer code is available under the [MIT License](LICENSE). The
bundled model remains subject to the CC Attribution license described above.
