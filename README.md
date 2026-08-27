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

- **VEHICLE INDEX** (left): click to switch vehicles. The current model is
  unloaded (geometry/materials disposed) and the new one is loaded with a
  loading overlay; view and action state reset to ISO / idle.
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

- `match: "substring"` — assign whole meshes whose **ancestor path**
  (`Group>SubGroup>MeshName`) contains the substring; first match wins, and
  one part may set `fallback: true` to catch the rest (multi-mesh GLBs).
  Note that GLTFLoader sanitizes node names (spaces become `_`, dots are
  stripped), so match against the sanitized form, e.g. `Aft_Flaps002_2`.
- `region: { axis: 'z', min, max }` — split a single-mesh GLB into parts by
  **clipping** triangles against axis-aligned slab planes in **raw** model
  coordinates (inspect the GLB first, e.g. with a gltf-transform script, to
  find sensible cut planes). Clipped parts are welded and re-normaled
  automatically.

Other optional knobs: `edgeOpacity` (default 0.78) tones down edge linework
for densely-ribbed models.

GLBs compressed with meshopt/quantization (e.g. via `gltf-transform meshopt`)
are supported — the loader wires three's `MeshoptDecoder`, and node
transforms (including the quantization compensation) are baked into each
part wrapper at load time.

## Model analysis notes (starship-block3.glb)

243 nodes / 211 meshes / 876k verts, organized in two subtrees:
`Starship Block 3 V4_13` (ship, y 14.5–25.1: body, 2 fwd flaps, 2 aft flaps,
cargo door, 3 sea-level + 3 vacuum Raptor 3s) stacked on
`Superheavy Block 3 V4_30` (booster, y 0–14.6: body, 3 grid fins, 13
Raptor 3s in a ring of 10 + inner trio). Already upright along +Y with the
base at y=0, so no `orientation` fix is needed. Muzzles follow the 13 booster
engine positions (normalized space, y ≈ 0.08). Optimized from the 40 MB
Sketchfab export with `gltf-transform resize 1024 + webp + meshopt` → 8.0 MB,
keeping the node hierarchy so parts group by real subassemblies.

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

- `starship.glb`: SpaceX Starship, by AllThingsSpace / Sketchfab user
  [@sunnychen753](https://sketchfab.com/sunnychen753), obtained via
  fetchcfd (project 4329), distributed under a **CC Attribution** license.
- `starship-block3.glb`: This work is based on "SpaceX Starship Block 3"
  (https://sketchfab.com/3d-models/spacex-starship-block-3-6f6c6f88a3eb4b4d822fdca66733fbb2)
  by Clarence365 (https://sketchfab.com/clarence365) licensed under
  [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
- If you redistribute or build on this project, keep the attributions above.
- All viewer code in this repository is original; the blueprint styling is a
  clean-room reimplementation of the engineering-drawing aesthetic.

## License

The original viewer code is available under the [MIT License](LICENSE). The
bundled models remain subject to the CC licenses described above.
