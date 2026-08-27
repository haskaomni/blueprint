/**
 * Vehicle configuration — data-driven so new vehicles can be added by
 * dropping a GLB into public/models and appending an entry here.
 *
 * Coordinate notes:
 *  - `orientation` (radians) is applied to the raw model first; the result is
 *    then normalized: longest edge -> ~10.8 units, centered on X/Z, grounded
 *    at y = 0. All coordinates below (muzzles, part regions) are in RAW model
 *    space unless stated otherwise — the viewer transforms them for you.
 *  - `parts[].match`    : substring tested against mesh names (multi-mesh GLBs)
 *  - `parts[].region`   : raw-space AABB slab { axis, min, max } used to split
 *                         a single-mesh GLB into parts by triangle centroid
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
];

export const PALETTE = {
  bg: '#064295',
  ink: '#c6e3fe',
  accent: '#eef8ff',
};
