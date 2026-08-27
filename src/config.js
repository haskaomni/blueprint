/**
 * Vehicle configuration — data-driven so new vehicles can be added by
 * dropping a GLB into public/models and appending an entry here.
 *
 * Coordinate notes:
 *  - `orientation` (radians) is applied to the raw model first; the result is
 *    then normalized: longest edge -> ~10.8 units, centered on X/Z, grounded
 *    at y = 0. All coordinates below (muzzles, part regions) are in RAW model
 *    space unless stated otherwise — the viewer transforms them for you.
 *  - `parts[].match`    : substring tested against the mesh's ancestor path
 *                         ("Group>SubGroup>MeshName"), first match wins
 *  - `parts[].region`   : raw-space AABB slab { axis, min, max } used to split
 *                         a single-mesh GLB into parts by clipping triangles
 *                         against the slab planes
 */
export const VEHICLES = [
  {
    id: 'starship',
    code: 'SS',
    title: 'STARSHIP',
    drawing: 'SPX-SS-001',
    faction: 'SPACEX',
    role: 'FULLY REUSABLE LAUNCH VEHICLE',
    description:
      'Two-stage super heavy-lift launch vehicle. Stainless-steel primary ' +
      'structure, methane/oxygen Raptor propulsion, designed for full and ' +
      'rapid reuse. Sheet SPX-SS-001, general arrangement.',
    src: `${import.meta.env.BASE_URL}models/starship.glb`,

    // Raw GLB: single mesh, long axis along Z (see README "Model analysis").
    // Stand the vehicle upright: raw +Z (nose) -> +Y.
    orientation: { rotX: -Math.PI / 2, rotY: 0, rotZ: 0 },

    weapon: {
      kind: 'plume',
      // Muzzle positions are in NORMALIZED model space (vehicle upright,
      // grounded at y=0, ~10.8 units tall). Tuned against the rendered model.
      muzzles: [
        [0, 0.12, 0],
        [0.55, 0.12, 0],
        [-0.55, 0.12, 0],
        [0, 0.12, 0.55],
        [0, 0.12, -0.55],
      ],
      direction: [0, -1, 0],
      duration: 0.9,
      bursts: 1,
      recoil: 0.08,
      range: 6,
    },

    parts: [
      {
        code: 'SS-01',
        title: 'AFT SECTION',
        description: 'Thrust structure, Raptor engine bay and aft flap actuators.',
        region: { axis: 'z', min: -70, max: -30 },
      },
      {
        code: 'SS-02',
        title: 'PROPELLANT SECTION',
        description: 'CH4 / LOX tank barrel, common dome and longitudinal stringers.',
        region: { axis: 'z', min: -30, max: 30 },
      },
      {
        code: 'SS-03',
        title: 'FORWARD SECTION',
        description: 'Payload bay, forward flaps and nosecone assembly.',
        region: { axis: 'z', min: 30, max: 85 },
      },
    ],
  },
  {
    id: 'starship-block3',
    code: 'SB3',
    title: 'STARSHIP BLOCK 3',
    drawing: 'SPX-SB3-002',
    faction: 'SPACEX',
    role: 'FULL STACK: SUPERHEAVY + SHIP',
    description:
      'Block 3 full stack: Superheavy booster with thirteen Raptor 3 engines ' +
      'and three grid fins, integrated hot-staging ring, and the Block 3 ship ' +
      'with 3 sea-level + 3 vacuum Raptors, aft flaps and cargo door. ' +
      'Sheet SPX-SB3-002, general arrangement.',
    src: `${import.meta.env.BASE_URL}models/starship-block3.glb`,

    // Raw GLB: already upright along +Y, base at y=0 (full stack ~25.1 raw
    // units tall). Ship group "Starship Block 3 V4_13" sits on booster group
    // "Superheavy Block 3 V4_30"; semantic names live on GROUP nodes, so
    // parts match against the mesh's full ancestor path.
    orientation: { rotX: 0, rotY: 0, rotZ: 0 },

    // this model's barrel is densely ribbed — full-strength edge lines wash
    // the surface out, so draw them fainter
    edgeOpacity: 0.3,

    weapon: {
      kind: 'plume',
      // 13 booster Raptor 3s, NORMALIZED space (stack ~10.8 tall, grounded,
      // X/Z centered). Outer ring of ten at r≈0.28 plus the inner trio.
      muzzles: [
        [0.157, 0.08, -0.202],
        [0.269, 0.08, -0.159],
        [0.346, 0.08, -0.069],
        [0.346, 0.08, 0.064],
        [0.273, 0.08, 0.159],
        [0.157, 0.08, 0.202],
        [0.045, 0.08, 0.159],
        [-0.028, 0.08, 0.069],
        [-0.028, 0.08, -0.064],
        [0.045, 0.08, -0.159],
        [0.187, 0.08, 0.056],
        [0.088, 0.08, 0.0],
        [0.187, 0.08, -0.06],
      ],
      direction: [0, -1, 0],
      duration: 0.9,
      bursts: 1,
      recoil: 0.08,
      range: 6,
    },

    // First match wins; `match` is tested against the mesh's ancestor path.
    // NOTE: GLTFLoader sanitizes node names (spaces -> "_", dots stripped),
    // so raw "Aft Flaps.002_2" becomes "Aft_Flaps002_2" — match accordingly:
    // "Starship_Block_3_V4_13>Raptor_3_7>Object_38" etc.
    parts: [
      {
        code: 'SB3-01',
        title: 'FORWARD FLAPS',
        description: 'Pair of forward flaps, windward nose control surfaces.',
        match: 'Foward_Flap', // [sic] author spelling inside the GLB
      },
      {
        code: 'SB3-02',
        title: 'AFT FLAPS',
        description: 'Pair of aft flaps for reentry attitude control.',
        match: 'Aft_Flaps',
      },
      {
        code: 'SB3-03',
        title: 'CARGO DOOR',
        description: 'Payload bay door on the nose section.',
        match: 'Cargo_Door',
      },
      {
        code: 'SB3-04',
        title: 'SHIP ENGINES',
        description: 'Three sea-level + three vacuum Raptor 3 engines.',
        match: 'V4_13>Raptor',
      },
      {
        code: 'SB3-05',
        title: 'GRID FINS',
        description: 'Three aerodynamic grid fins on the booster forward dome.',
        match: 'Grid_Fin',
      },
      {
        code: 'SB3-06',
        title: 'BOOSTER ENGINES',
        description: 'Thirteen Raptor 3 engines: outer ring of ten, inner trio.',
        match: 'V4_30>Raptor',
      },
      {
        code: 'SB3-07',
        title: 'SUPERHEAVY BOOSTER',
        description: 'Booster primary structure with integrated hot-staging ring.',
        match: 'Superheavy',
      },
      {
        code: 'SB3-08',
        title: 'STARSHIP UPPER STAGE',
        description: 'Ship primary structure, heatshield tiles and cryo sections.',
        match: 'Starship_Block_3',
        fallback: true,
      },
    ],
  },
];

export const PALETTE = {
  bg: '#064295',
  ink: '#c6e3fe',
  accent: '#eef8ff',
};
