import * as THREE from 'three';

export const INK = new THREE.Color('#c6e3fe');
export const ACCENT = new THREE.Color('#eef8ff');
export const FILL = new THREE.Color('#1556a2');
export const SHADE = new THREE.Color('#063477');

/**
 * Surface: blueprint two-tone gradient + fixed half-lambert key light +
 * screen-space cross-hatching (gl_FragCoord diagonals, density follows shading)
 * + uEmphasis blend toward accent for hover / select.
 */
export function makeSurfaceMaterial(pixelRatio = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFill: { value: FILL.clone() },
      uShade: { value: SHADE.clone() },
      uAccent: { value: ACCENT.clone() },
      uEmphasis: { value: 0 },
      uLight: { value: new THREE.Vector3(0.45, 0.75, 0.55).normalize() },
      uPx: { value: pixelRatio },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFill;
      uniform vec3 uShade;
      uniform vec3 uAccent;
      uniform float uEmphasis;
      uniform vec3 uLight;
      uniform float uPx;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal);
        // half-lambert key light, gently quantized -> halftone steps
        float d = dot(n, uLight) * 0.5 + 0.5;
        d = floor(d * 4.0 + 0.5) / 4.0 * 0.75 + d * 0.25;
        vec3 col = mix(uShade, uFill, d);

        // screen-space cross-hatching, line density follows darkness
        float dark = 1.0 - d;
        vec2 fc = gl_FragCoord.xy / uPx;
        float period = 7.0;
        float lw = 0.055; // half-width of a hatch line (fraction of period)
        float d1 = abs(fract((fc.x + fc.y) / period) - 0.5);
        float d2 = abs(fract((fc.x - fc.y) / period) - 0.5);
        float hatch = 0.0;
        if (dark > 0.28) hatch += 1.0 - smoothstep(lw, lw + 0.07, d1);
        if (dark > 0.52) hatch += 1.0 - smoothstep(lw, lw + 0.07, d2);
        col = mix(col, uShade * 0.5, clamp(hatch, 0.0, 1.0) * 0.5);

        col = mix(col, uAccent, uEmphasis * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Inverted-hull outline: geometry pushed along normals, back faces only. */
export function makeHullMaterial(width = 0.025) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uWidth: { value: width },
      uColor: { value: INK.clone() },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec3 p = position + normalize(normal) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Edge lines (EdgesGeometry). */
export function makeEdgeMaterial() {
  return new THREE.LineBasicMaterial({
    color: INK.clone(),
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
}

/**
 * Ground shadow disc: elliptical radial falloff + faint diagonal striping,
 * deep translucent blue, drawn over the grid.
 */
export function makeGroundMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#042c66') },
      uStripe: { value: new THREE.Color('#0a4aa8') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uStripe;
      varying vec2 vUv;
      void main() {
        float r = length(vUv * vec2(1.0, 0.62));
        float fall = smoothstep(1.0, 0.12, r);
        float stripe = step(0.5, fract((vUv.x + vUv.y) * 14.0)) * 0.35 + 0.65;
        vec3 col = mix(uColor, uStripe, stripe * 0.35);
        float a = fall * 0.34 * stripe;
        if (a < 0.003) discard;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }
    `,
  });
}
