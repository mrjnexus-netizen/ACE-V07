import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { useContent } from '../context/ContentContext';
import PortalCursor from './PortalCursor';
import PortalComposer from './PortalComposer';
import PromoScreen from './PromoScreen';
import LiquidSeam, { type SeamPin } from './LiquidSeam';
import WelcomeGate from './WelcomeGate';
import ScaleStage from './ScaleStage';

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'ENGLISH' },
  { code: 'es', label: 'ESPA\u00d1OL' },
  { code: 'fr', label: 'FRAN\u00c7AIS' },
  { code: 'zh', label: '\u4e2d\u6587' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e' },
  { code: 'ko', label: '\ud55c\uad6d\uc5b4' },
] as const;

const MICRO_TONES: Record<string, number> = {
  en: 440, es: 528, fr: 396, zh: 639, ja: 741, ko: 852,
};

const LANGUAGE_MESH: Record<string, string> = {
  en: '#F3D77E', es: '#FF9A3F', fr: '#D8C290', zh: '#FF5A4D', ja: '#4D8BFF', ko: '#FF6FE0',
};
// 2026-07-14 (per Reza — light-harmony pass): same exact RGB triples as
// LANGUAGE_MESH above (and LiquidSeam's PAL.glow — all three already agreed
// perfectly on color, confirmed while auditing) exposed with an alpha
// channel. Every glow in this file now builds its falloff from THESE
// triples so brightness curves share one family instead of each effect
// picking its own opacity in isolation.
const LANGUAGE_MESH_RGB: Record<string, [number, number, number]> = {
  en: [243, 215, 126], es: [255, 154, 63], fr: [216, 194, 144],
  zh: [255, 90, 77], ja: [77, 139, 255], ko: [255, 111, 224],
};
function meshRgba(code: string, alpha: number): string {
  const [r, g, b] = LANGUAGE_MESH_RGB[code] || [255, 255, 255];
  return `rgba(${r},${g},${b},${alpha})`;
}
const LANGUAGE_PASTEL: Record<string, string> = {
  en: '#F7E6B0', es: '#FFCB94', fr: '#EAD9B5', zh: '#FFA79E', ja: '#A9C7FF', ko: '#FFB3F0',
};

// 2026-07-13 (per Reza — minimal theme support): pure white was correct
// for onyx/cyber (dark surfaces) but made the star swarm invisible against
// minimal's ivory background. --text-color is already tuned per-theme for
// exactly this kind of "reads clearly against --surface-color" contrast —
// reusing it means no separate per-theme star-color table to keep in sync.
function getDefaultStarColor(): string {
  if (typeof document === 'undefined') return '#FFFFFF';
  return getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#FFFFFF';
}

const SELECT_TRANSITION_MS = 2560; // cover -> light rake -> melt into site tone, then cross over
const PROMO_EXIT_TRANSITION_MS = 1100; // 2026-07-14 (per Reza): shorter than the entry transition

// ─────────────────────────────────────────────────────────────────────────
// Image-based headstock (luxury crystal headstock PNG). SVG viewBox 0 0 160 90.
// EASY-TUNE BLOCK: nudge these few numbers to align the photo + pins precisely.
// ─────────────────────────────────────────────────────────────────────────
const IMG_X = 108.0;  // left edge of the headstock image in viewBox units
const IMG_Y = 5.0;    // top edge (a touch lower)
const IMG_H = 30.0;   // image height — smaller, more elegant (was 42)
const IMG_W = IMG_H * 0.5711;

// Two measured point-sets from the real photo (normalized 0..1 within the
// headstock image). Order top → bottom = en,es,fr,zh,ja,ko.
//   CRYSTAL = the crystal knob centers (hover glow + label anchor)
//   POST    = the metal tuner pegs where the silk strings actually tie on
//             (user-marked white dots).
const CRYSTAL_NORM: [number, number][] = [
  [0.616, 0.098], [0.682, 0.194], [0.748, 0.297],
  [0.814, 0.401], [0.884, 0.509], [0.948, 0.613],
];
const POST_NORM: [number, number][] = [
  [0.405, 0.135], [0.455, 0.235], [0.525, 0.335],
  [0.585, 0.440], [0.665, 0.555], [0.720, 0.655],
];

// Weave center: the X the freed strands gently lean toward below the nut.
// Sits near the mean of the pegs, on the neck centerline.
const NUT_X = 117.0;
const NUT_Y = 31.4;

// Half-width of the wooden neck (viewBox units): the silk weave stays within
// this band so the strings never spill outside the fretboard.
const NECK_HALF_W = 9.0;

// ── WHOLE-ASSEMBLY transform (headstock + neck + strings + labels TOGETHER).
//    Scales the entire instrument and slides it down the Y axis as one unit,
//    pivoting on the neck centerline (NUT_X) so it stays horizontally put.
//    The strings auto-follow because they tie to the (now transformed) pegs.
//    EASY-TUNE: ASM_SCALE = overall size (1.0 = original);
//               ASM_TOP_Y = where the headstock top sits (raise → everything DOWN).
const ASM_SCALE = 0.75;                    // overall length/size → 75%
const ASM_TOP_Y = 22.0;                    // new headstock-top Y (bigger = lower)
const ASM_TX = NUT_X * (1 - ASM_SCALE);    // keep nut X fixed while scaling
const ASM_TY = ASM_TOP_Y - 5 * ASM_SCALE;  // map the old top (y=5) to ASM_TOP_Y

// ── NECK STRIP (the long ornate fretboard continuing BELOW the headstock to
//    fill the space down toward the galaxy). Image: /neck.png — only the
//    straight neck, its black background baked transparent so it melts into
//    space; sides & bottom feather out. It sits BEHIND the silk strings and
//    its top tucks UNDER the headstock so the join is invisible (not pasted).
//    EASY-TUNE: nudge these few numbers to seat it cleanly under the headstock.
const NECK_SRC_ASPECT = 0.1943;          // neck.png width / height (do not change)
// base neck geometry (in the headstock's ORIGINAL coordinate space)…
const NECK_BASE_CX = 116.3;              // center X — the headstock neck centerline
const NECK_BASE_W = 13.0;                // neck width (match headstock base)
const NECK_BASE_TOP_Y = 30.0;            // top edge — tucked just under the nut
const NECK_BASE_FADE_TOP = 70.0;         // where the bottom melt-into-galaxy begins
const NECK_BASE_FADE_BOT = 90.0;         // where the neck has fully dissolved
// …carried through the SAME assembly transform so the neck scales + drops WITH
// the headstock and the join stays seamless.
const NECK_CX = NECK_BASE_CX * ASM_SCALE + ASM_TX;
const NECK_W = NECK_BASE_W * ASM_SCALE;
const NECK_TOP_Y = NECK_BASE_TOP_Y * ASM_SCALE + ASM_TY;
const NECK_FADE_TOP = NECK_BASE_FADE_TOP * ASM_SCALE + ASM_TY;
const NECK_FADE_BOT = NECK_BASE_FADE_BOT * ASM_SCALE + ASM_TY;
const NECK_H = NECK_W / NECK_SRC_ASPECT; // derived height — keeps the photo's aspect
const NECK_TOPIN_OFF = 4 / NECK_H;                       // soft tuck-in at the very top
const NECK_FADE_OFF0 = (NECK_FADE_TOP - NECK_TOP_Y) / NECK_H;
const NECK_FADE_OFF1 = (NECK_FADE_BOT - NECK_TOP_Y) / NECK_H;

// 2026-07-02 v3: instead of cropping via the wrapping DIV's aspect (which
// only crops the BOX, leaving the guitar hugging its right edge - not
// actually centered), the guitar's own SVG now uses a TIGHT custom viewBox
// ("95 0 65 90" - just the headstock+neck+labels region, not the full empty
// 160-wide canvas) with preserveAspectRatio="xMidYMid meet", which centers
// that region within whatever box it's given, by definition. The wrapping
// box can then just be centered normally like anything else.
const MOBILE_W = 900;
const MOBILE_GUITAR_VIEWBOX = '85 0 65 90'; // 2026-07-02 v2: my previous shift (95->109) moved minX the WRONG direction - INCREASING minX pushes content LEFT within the box, not right (the window moves toward the content, content ends up nearer the window's own left edge). Corrected: decreased minX (95->85) to shift the guitar rightward as actually requested.
const MOBILE_GUITAR_W = 520;
const MOBILE_GUITAR_H = Math.round((MOBILE_GUITAR_W * 90) / 65); // matches the 65x90 crop's own aspect
const MOBILE_H = 1150 + MOBILE_GUITAR_H + 40; // signature(420) + photo(730) + guitar + margin

// Derived absolute coords (viewBox units).
const PIN_CX = CRYSTAL_NORM.map(([nx]) => IMG_X + nx * IMG_W); // crystal centers
const PIN_CY = CRYSTAL_NORM.map(([, ny]) => IMG_Y + ny * IMG_H);
const POST_X = POST_NORM.map(([nx]) => IMG_X + nx * IMG_W);    // string tie points
const POST_Y = POST_NORM.map(([, ny]) => IMG_Y + ny * IMG_H);

const Starfield = ({ colorRef, hoverRef, audioRef, pointerRef }: { colorRef: React.MutableRefObject<string>; hoverRef: React.MutableRefObject<number>; audioRef: React.MutableRefObject<number>; pointerRef: React.MutableRefObject<{ x: number; y: number }> }) => {
  const meshRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const currentColor = useRef(new THREE.Color(getDefaultStarColor()));
  const target = useRef(new THREE.Color(getDefaultStarColor()));
  const hoverVal = useRef(0);
  const beatVal = useRef(0);
  const { camera } = useThree();

  useEffect(() => { camera.position.set(0, 0, 5); }, [camera]);

  useFrame((state) => {
    const tt = state.clock.getElapsedTime();
    // smooth the audio energy so the pulse breathes instead of jittering
    beatVal.current += ((audioRef.current || 0) - beatVal.current) * 0.20;
    const beat = beatVal.current;
    if (meshRef.current) {
      // base fluid drift, always alive; rotation speeds up gently with the music
      meshRef.current.rotation.y += 0.00008 + beat * 0.0014;
      meshRef.current.rotation.x = Math.sin(tt * 0.04) * 0.05 + Math.sin(tt * 0.018) * 0.02;
      meshRef.current.position.y = Math.sin(tt * 0.06) * 0.18;
      // a gentle swell of the whole field on the beat
      const s = 1 + beat * 0.10;
      meshRef.current.scale.set(s, s, s);
    }

    // Cursor depth-parallax: glide the camera a touch toward the pointer and
    // keep it aimed at the heart of the field. Because the stars sit at many
    // depths, the near ones sweep more than the far ones — real 3D parallax,
    // while the instrument (a separate DOM layer) stays perfectly anchored.
    const PAR = 0.85;
    camera.position.x += (pointerRef.current.x * PAR - camera.position.x) * 0.045;
    camera.position.y += (-pointerRef.current.y * PAR - camera.position.y) * 0.045;
    camera.lookAt(0, 0, 0);
    target.current.set(colorRef.current || getDefaultStarColor());
    currentColor.current.lerp(target.current, 0.18);
    hoverVal.current += ((hoverRef.current || 0) - hoverVal.current) * 0.12;
    if (matRef.current) {
      const u = matRef.current.uniforms.uColor;
      if (u) (u.value as THREE.Color).copy(currentColor.current);
      const ut = matRef.current.uniforms.uTime;
      if (ut) ut.value = tt;
      const uh = matRef.current.uniforms.uHover;
      if (uh) uh.value = hoverVal.current;
      const ub = matRef.current.uniforms.uBeat;
      if (ub) ub.value = beat;
    }
  });

  const geometry = useMemo(() => {
    const count = 32000;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const brights = new Float32Array(count);
    const twSpeeds = new Float32Array(count);

    // A few galaxy "clusters" so stars gather in drifts instead of an even
    // grid — the rest are scattered as faint background dust.
    const CLUSTERS = 7;
    const cx: number[] = [], cy: number[] = [], cz: number[] = [];
    for (let c = 0; c < CLUSTERS; c++) {
      cx.push((Math.random() - 0.5) * 16);
      cy.push((Math.random() - 0.5) * 16);
      cz.push((Math.random() - 0.5) * 8);
    }

    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.55) {
        // clustered star: pick a cluster and scatter around it
        const c = (Math.random() * CLUSTERS) | 0;
        const spread = 2.2 + Math.random() * 3.5;
        positions[i * 3]     = cx[c] + gauss() * spread;
        positions[i * 3 + 1] = cy[c] + gauss() * spread;
        positions[i * 3 + 2] = cz[c] + gauss() * (spread * 0.5);
      } else {
        // free-floating background dust
        positions[i * 3]     = (Math.random() - 0.5) * 22;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 11;
      }

      phases[i] = Math.random() * Math.PI * 2;

      // size: mostly tiny, a rare few large (power curve), so there are
      // sparkling "gem" stars among fine dust.
      const sr = Math.random();
      sizes[i] = 0.5 + Math.pow(sr, 6) * 2.6;

      // brightness: mostly dim, a few brilliant — independent of size.
      const br = Math.random();
      brights[i] = 0.25 + Math.pow(br, 2.2) * 1.4;

      // each star twinkles at its own pace
      twSpeeds[i] = 0.5 + Math.random() * 2.4;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('aBright', new THREE.BufferAttribute(brights, 1));
    geom.setAttribute('aTwSpeed', new THREE.BufferAttribute(twSpeeds, 1));
    return geom;
  }, []);

  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(getDefaultStarColor()) }, uTime: { value: 0 }, uHover: { value: 0 }, uBeat: { value: 0 } }), []);

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={`
          attribute float aPhase;
          attribute float aSize;
          attribute float aBright;
          attribute float aTwSpeed;
          uniform float uTime;
          uniform float uHover;
          uniform float uBeat;
          varying float vTw;
          varying float vBright;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // each star twinkles at its own speed and phase
            vTw = 0.45 + 0.55 * sin(uTime * aTwSpeed + aPhase);
            vBright = aBright;
            gl_PointSize = aSize * (1.0 + uHover * 0.35 + uBeat * 0.45 * (0.6 + 0.4 * vTw));
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uHover;
          uniform float uBeat;
          varying float vTw;
          varying float vBright;
          void main() {
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            float soft = pow(1.0 - d * 2.0, 1.4);
            gl_FragColor = vec4(uColor, soft * vBright * (0.7 + uHover * 0.6 + uBeat * 1.2) * vTw);
          }
        `}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const StarfieldCanvas = ({ colorRef, hoverRef, audioRef, pointerRef }: { colorRef: React.MutableRefObject<string>; hoverRef: React.MutableRefObject<number>; audioRef: React.MutableRefObject<number>; pointerRef: React.MutableRefObject<{ x: number; y: number }> }) => {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: -1 }}
      camera={{ fov: 75, near: 0.1, far: 100 }}
      onCreated={({ gl, scene }) => {
        // 2026-07-13 (per Reza — minimal/cyber theme support): this used
        // to hardcode '#000000', which is correct for onyx/cyber (both
        // near-black) but wrong for minimal (ivory, #F9F9F7) — the canvas
        // stayed black regardless of the live theme. Reading the actual
        // --surface-color CSS variable (which ChromaticContext already
        // keeps correct per-theme) means this needs no per-theme special
        // case of its own; it just follows whatever's live.
        const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface-color').trim() || '#000000';
        gl.setClearColor(new THREE.Color(surface));
        scene.fog = new THREE.FogExp2(surface, 0.0008);
      }}
    >
      <ambientLight intensity={0.1} />
      <directionalLight intensity={0.3} position={[5, 3, 5]} />
      <Starfield colorRef={colorRef} hoverRef={hoverRef} audioRef={audioRef} pointerRef={pointerRef} />
    </Canvas>
  );
};

// The luxury crystal headstock photo with the six languages on its crystal pegs.
// The silk strings themselves are drawn by <LiquidSeam/> in screen-space; this
// component only draws the photo, the hover glow, the labels + hit areas, and
// reports the live pixel positions of the pins / nut so the strings tie on
// exactly to the crystal knobs.
// ── Delaunay triangulation (compact, typed; adapted from R. Rauwolf) ──
type Circ = { i: number; j: number; k: number; x: number; y: number; r: number };
const Delaunay = (() => {
  const EPSILON = 1.0 / 1048576.0;
  function supertriangle(v: number[][]): number[][] {
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (let i = v.length; i--; ) {
      if (v[i][0] < xmin) xmin = v[i][0];
      if (v[i][0] > xmax) xmax = v[i][0];
      if (v[i][1] < ymin) ymin = v[i][1];
      if (v[i][1] > ymax) ymax = v[i][1];
    }
    const dx = xmax - xmin, dy = ymax - ymin, dmax = Math.max(dx, dy);
    const xmid = xmin + dx * 0.5, ymid = ymin + dy * 0.5;
    return [[xmid - 20 * dmax, ymid - dmax], [xmid, ymid + 20 * dmax], [xmid + 20 * dmax, ymid - dmax]];
  }
  function circumcircle(v: number[][], i: number, j: number, k: number): Circ {
    const x1 = v[i][0], y1 = v[i][1], x2 = v[j][0], y2 = v[j][1], x3 = v[k][0], y3 = v[k][1];
    const fy12 = Math.abs(y1 - y2), fy23 = Math.abs(y2 - y3);
    let xc = 0, yc = 0, m1, m2, mx1, mx2, my1, my2;
    if (fy12 < EPSILON) {
      m2 = -((x3 - x2) / (y3 - y2)); mx2 = (x2 + x3) / 2; my2 = (y2 + y3) / 2;
      xc = (x2 + x1) / 2; yc = m2 * (xc - mx2) + my2;
    } else if (fy23 < EPSILON) {
      m1 = -((x2 - x1) / (y2 - y1)); mx1 = (x1 + x2) / 2; my1 = (y1 + y2) / 2;
      xc = (x3 + x2) / 2; yc = m1 * (xc - mx1) + my1;
    } else {
      m1 = -((x2 - x1) / (y2 - y1)); m2 = -((x3 - x2) / (y3 - y2));
      mx1 = (x1 + x2) / 2; mx2 = (x2 + x3) / 2; my1 = (y1 + y2) / 2; my2 = (y2 + y3) / 2;
      xc = (m1 * mx1 - m2 * mx2 + my2 - my1) / (m1 - m2);
      yc = fy12 > fy23 ? m1 * (xc - mx1) + my1 : m2 * (xc - mx2) + my2;
    }
    const dx = x2 - xc, dy = y2 - yc;
    return { i, j, k, x: xc, y: yc, r: dx * dx + dy * dy };
  }
  function dedup(edges: number[]) {
    for (let j = edges.length; j; ) {
      const b = edges[--j], a = edges[--j];
      for (let i = j; i; ) {
        const n = edges[--i], m = edges[--i];
        if ((a === m && b === n) || (a === n && b === m)) { edges.splice(j, 2); edges.splice(i, 2); break; }
      }
    }
  }
  return {
    triangulate(vertices: number[][]): number[] {
      const n = vertices.length;
      if (n < 3) return [];
      const verts = vertices.slice(0);
      const indices: number[] = new Array(n);
      for (let i = n; i--; ) indices[i] = i;
      indices.sort((a, b) => verts[b][0] - verts[a][0]);
      const st = supertriangle(verts);
      verts.push(st[0], st[1], st[2]);
      const open: Circ[] = [circumcircle(verts, n + 0, n + 1, n + 2)];
      let closed: Circ[] = [];
      const edges: number[] = [];
      for (let i = indices.length; i--; edges.length = 0) {
        const c = indices[i];
        for (let j = open.length; j--; ) {
          const dx = verts[c][0] - open[j].x;
          if (dx > 0 && dx * dx > open[j].r) { closed.push(open[j]); open.splice(j, 1); continue; }
          const dy = verts[c][1] - open[j].y;
          if (dx * dx + dy * dy - open[j].r > EPSILON) continue;
          edges.push(open[j].i, open[j].j, open[j].j, open[j].k, open[j].k, open[j].i);
          open.splice(j, 1);
        }
        dedup(edges);
        for (let j = edges.length; j; ) { const b = edges[--j], a = edges[--j]; open.push(circumcircle(verts, a, b, c)); }
      }
      for (let i = open.length; i--; ) closed.push(open[i]);
      const out: number[] = [];
      for (let i = closed.length; i--; )
        if (closed[i].i < n && closed[i].j < n && closed[i].k < n) out.push(closed[i].i, closed[i].j, closed[i].k);
      return out;
    },
  };
})();

// Luxury low-poly page wipe: faceted gold leaf, tinted by the chosen language's
// light, blooms outward FROM the instrument across the whole screen, then we
// cross into the site. Cheap (filled triangles, no glow) — smooth, no lag.
const MeshWipe = ({ color, fx, fy }: { color: string; fx?: number; fy?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);
    const cr = parseInt(color.slice(1, 3), 16) || 243;
    const cg = parseInt(color.slice(3, 5), 16) || 215;
    const cb = parseInt(color.slice(5, 7), 16) || 126;
    const ox = fx ?? W * 0.62, oy = fy ?? H * 0.4;

    const pw = Math.max(8, Math.round(W / 120)), ph = Math.max(6, Math.round(H / 120));
    const off = W / 55;
    const anchors: number[][] = [];
    for (let i = 0; i <= ph; i++) {
      for (let j = 0; j <= pw; j++) {
        let hx = (Math.random() > 0.5 ? -1 : 1) * Math.random() * off;
        let vy = (Math.random() > 0.5 ? -1 : 1) * Math.random() * off;
        if (j === 0) hx = -Math.abs(hx); else if (j === pw) hx = Math.abs(hx);
        if (i === 0) vy = -Math.abs(vy); else if (i === ph) vy = Math.abs(vy);
        anchors.push([(W / pw) * j + hx, (H / ph) * i + vy]);
      }
    }
    const idx = Delaunay.triangulate(anchors);
    const maxDist = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)) || 1;
    const SPAN = 950;
    type T = { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; mx: number; my: number; R: number; G: number; B: number; delay: number; dur: number };
    const tris: T[] = [];
    for (let k = 0; k < idx.length; k += 3) {
      const a = anchors[idx[k]], b = anchors[idx[k + 1]], c = anchors[idx[k + 2]];
      const cxT = (a[0] + b[0] + c[0]) / 3, cyT = (a[1] + b[1] + c[1]) / 3;
      const d = Math.min(1, Math.hypot(cxT - ox, cyT - oy) / maxDist);
      const lum = Math.pow(1 - d, 1.3);
      const baseR = 12 + (245 - 12) * lum, baseG = 11 + (222 - 11) * lum, baseB = 16 + (150 - 16) * lum;
      const ta = 0.2 + Math.random() * 0.35;
      const jit = 0.82 + Math.random() * 0.34;
      tris.push({
        ax: a[0], ay: a[1], bx: b[0], by: b[1], cx: c[0], cy: c[1], mx: cxT, my: cyT,
        R: Math.min(255, (baseR * (1 - ta) + cr * ta) * jit),
        G: Math.min(255, (baseG * (1 - ta) + cg * ta) * jit),
        B: Math.min(255, (baseB * (1 - ta) + cb * ta) * jit),
        delay: d * SPAN + Math.random() * 170,
        dur: 420 + Math.random() * 520,
      });
    }

    const start = performance.now();
    let raf = 0;
    const HOLD_END = 1950;          // facets covered + shimmered by here
    const DARK_DUR = 620;           // then melt the whole sheet into the site's tone
    const endR = 8 + cr * 0.1, endG = 8 + cg * 0.1, endB = 10 + cb * 0.1; // deep language tint
    const diag = 0.94, diagY = 0.34;
    const uMin = -0.35 * W, uMax = 1.35 * W + H * diagY;
    const sig = 0.17 * W;
    const draw = (now: number) => {
      const dt = now - start;
      ctx.clearRect(0, 0, W, H);
      // a single luxurious light rake travelling across the gold facets
      const sweepP = Math.min(1, dt / (HOLD_END + 250));
      const sweepU = uMin + (uMax - uMin) * (sweepP < 0.5 ? 4 * sweepP * sweepP * sweepP : 1 - Math.pow(-2 * sweepP + 2, 3) / 2);
      // global melt that blends the whole sheet into the site's tone before we cross over
      const melt = dt < HOLD_END ? 0 : Math.min(1, (dt - HOLD_END) / DARK_DUR);
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        if (dt <= t.delay) continue;
        const prog = (dt - t.delay) / t.dur;
        const lin = Math.min(1, prog);
        const op = 1 - Math.pow(1 - lin, 3);
        const sc = 0.9 + 0.1 * op;
        const u = t.mx * diag + t.my * diagY;
        const shine = Math.exp(-((u - sweepU) * (u - sweepU)) / (2 * sig * sig));
        const add = shine * 90 * op * (1 - melt);
        const fR = Math.min(255, t.R + add), fG = Math.min(255, t.G + add * 0.92), fB = Math.min(255, t.B + add * 0.7);
        const R = fR * (1 - melt) + endR * melt, G = fG * (1 - melt) + endG * melt, B = fB * (1 - melt) + endB * melt;
        ctx.beginPath();
        ctx.moveTo(t.mx + (t.ax - t.mx) * sc, t.my + (t.ay - t.my) * sc);
        ctx.lineTo(t.mx + (t.bx - t.mx) * sc, t.my + (t.by - t.my) * sc);
        ctx.lineTo(t.mx + (t.cx - t.mx) * sc, t.my + (t.cy - t.my) * sc);
        ctx.closePath();
        ctx.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},${op})`;
        ctx.fill();
        const eg = Math.max(0, 1 - Math.abs(prog - 1) / 0.35);
        const edge = (eg * 0.5 + shine * 0.4) * (1 - melt);
        ctx.strokeStyle = `rgba(${Math.min(255, R + 30 + eg * 70) | 0},${Math.min(255, G + 24 + eg * 60) | 0},${Math.min(255, B + 10 + eg * 40) | 0},${op * 0.4 + edge})`;
        ctx.lineWidth = 1 + (eg + shine) * 0.5; ctx.stroke();
      }
      if (dt < HOLD_END + DARK_DUR + 200) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color, fx, fy]);
  return <canvas ref={ref} className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }} />;
};

const HeadstockSelector = ({
  selectedLang, hoveredLang, onHover, onLeave, onSelect, onGeometry, entered,
  viewBox = '0 0 160 90', preserveAspectRatio = 'xMaxYMin slice',
}: {
  selectedLang: string | null;
  hoveredLang: string | null;
  onHover: (code: string) => void;
  onLeave: () => void;
  onSelect: (code: string) => void;
  onGeometry: (g: { pins: SeamPin[]; nutX: number; nutY: number; neckHalfW: number }) => void;
  entered: boolean;
  viewBox?: string;
  preserveAspectRatio?: string;
}) => {
  const pinRefs = useRef<(SVGCircleElement | null)[]>([]);
  const nutRef = useRef<SVGCircleElement | null>(null);
  const neckLRef = useRef<SVGCircleElement | null>(null);
  const neckRRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    const measure = () => {
      const pins: SeamPin[] = [];
      for (let i = 0; i < SUPPORTED_LANGUAGES.length; i++) {
        const r = pinRefs.current[i]?.getBoundingClientRect();
        if (!r) return;
        pins.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, lang: SUPPORTED_LANGUAGES[i].code });
      }
      const nr = nutRef.current?.getBoundingClientRect();
      const lr = neckLRef.current?.getBoundingClientRect();
      const rr = neckRRef.current?.getBoundingClientRect();
      if (!nr || !lr || !rr) return;
      const nutX = nr.left + nr.width / 2;
      const nutY = nr.top + nr.height / 2;
      const neckHalfW = Math.abs((rr.left + rr.width / 2) - (lr.left + lr.width / 2)) / 2;
      onGeometry({ pins, nutX, nutY, neckHalfW });
    };
    measure();
    const id = window.setTimeout(measure, 350);
    const id2 = window.setTimeout(measure, 900);
    // 2026-07-02: during a continuous drag-resize, the browser fires many
    // 'resize' events in a burst; measuring on every single one is fine for
    // the FINAL value, but a short settle-delay re-measure after the burst
    // stops catches the case where layout hasn't fully reflowed yet at the
    // instant a given resize event fires (silk strings lagging/detaching
    // from the guitar pegs while actively dragging the window edge).
    let settleId: number | null = null;
    const onResize = () => {
      measure();
      if (settleId !== null) window.clearTimeout(settleId);
      settleId = window.setTimeout(measure, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
      if (settleId !== null) window.clearTimeout(settleId);
      window.removeEventListener('resize', onResize);
    };
  }, [onGeometry]);

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      style={{ zIndex: 7, pointerEvents: 'auto' }}
      aria-hidden="true"
    >
      {/* Feather mask: melts the photo's rectangular edges into the galaxy so
          it never looks like a hard cropped box pasted on space. The left and
          bottom edges (which meet empty space) fade most; the crystal pegs in
          the center/right stay fully crisp. */}
      <defs>
        {/* P2: shared champagne-gold gradient for language labels in their
            neutral (non-hovered, non-selected) state — matches the vertical
            AMIR MOSLEHI signature's gradient stops exactly (§4.2-4). */}
        <linearGradient id="hsLabelGold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8A6A26" />
          <stop offset="22%" stopColor="#F6E9BE" />
          <stop offset="42%" stopColor="#E9C879" />
          <stop offset="58%" stopColor="#FBF0CC" />
          <stop offset="78%" stopColor="#D9B45E" />
          <stop offset="100%" stopColor="#8A6A26" />
        </linearGradient>
        {/* 2026-07-02: stdDeviation bumped 2.2->3.2. ScaleStage now crops this
            SVG against a FIXED 16:9 logical canvas instead of the real
            (variable-aspect) browser viewport, which can expose a sliver of
            this mask's edge that used to always sit safely off-frame. A
            slightly wider blur lets any such sliver dissolve completely
            rather than leaving a faint ring/edge visible. */}
        <filter id="hsFeather" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <mask id="hsMask" maskUnits="userSpaceOnUse"
              x={IMG_X - 8} y={IMG_Y - 8} width={IMG_W + 16} height={IMG_H + 16}>
          <rect
            x={IMG_X + 1.6} y={IMG_Y + 0.8}
            width={IMG_W - 1.6 - 0.4} height={IMG_H - 0.8 - 3.4}
            fill="#fff" filter="url(#hsFeather)"
          />
        </mask>
      </defs>

      {/* Whole assembly scaled + dropped as one unit. The pegs are measured
          AFTER this transform, so the silk strings tie to the new positions. */}
      <g transform={`translate(${ASM_TX} ${ASM_TY}) scale(${ASM_SCALE})`}>
      {/* The luxury crystal headstock photo, sitting where the silhouette was. */}
      <image
        href="/headstock.png"
        x={IMG_X} y={IMG_Y} width={IMG_W} height={IMG_H}
        preserveAspectRatio="xMidYMid meet"
        mask="url(#hsMask)"
        style={{ pointerEvents: 'none' }}
      />

      {/* invisible geometry markers — measured live (in screen px) and handed
          to <LiquidSeam/> so the silk strings tie exactly to these points. */}
      {SUPPORTED_LANGUAGES.map((l, i) => (
        <circle key={`pin-${l.code}`} ref={(el) => { pinRefs.current[i] = el; }} cx={POST_X[i]} cy={POST_Y[i]} r="0.01" fill="none" />
      ))}
      <circle ref={nutRef} cx={NUT_X} cy={NUT_Y} r="0.01" fill="none" />
      <circle ref={neckLRef} cx={NUT_X - NECK_HALF_W} cy={NUT_Y} r="0.01" fill="none" />
      <circle ref={neckRRef} cx={NUT_X + NECK_HALF_W} cy={NUT_Y} r="0.01" fill="none" />

      {/* one interactive hit-group + label per language. Labels are staggered
          to the RIGHT of each crystal knob with a CONSTANT offset, so they
          form a clean diagonal that mirrors the pegs' own slope — each label
          on the same Y as ITS crystal, not all on one vertical line. */}
      {SUPPORTED_LANGUAGES.map((l, i) => {
        const active = selectedLang === l.code || hoveredLang === l.code;
        const dimmed = !!selectedLang && selectedLang !== l.code;
        const y = PIN_CY[i];
        const labelX = PIN_CX[i] + 3.5; // constant offset → diagonal staircase
        const pastel = LANGUAGE_PASTEL[l.code];
        // 2026-07-10 fix (per Reza — imprecise clicks on the language
        // picker): the six PIN_CY values are only ~2.9-3.2 viewBox units
        // apart, but every hit-rect used a FIXED 8.4-unit height (±4.2
        // around its own center) regardless — adjacent languages'
        // invisible hit-rects overlapped by ~5.2-5.5 units, over 60% of
        // each rect's own height. Later-rendered languages paint (and
        // hit-test) on top in SVG, so clicking anywhere in that huge
        // shared zone silently selected the language BELOW the one you
        // were actually pointing at. Fixed by partitioning Y into
        // non-overlapping bands at the midpoints between neighbors —
        // every language now owns an exact, gap-free, overlap-free slice
        // of vertical space, however close together the crystals sit.
        const prevY = i > 0 ? PIN_CY[i - 1] : null;
        const nextY = i < PIN_CY.length - 1 ? PIN_CY[i + 1] : null;
        const topBound = prevY !== null ? (prevY + y) / 2 : y - (nextY !== null ? (nextY - y) / 2 : 4.2);
        const bottomBound = nextY !== null ? (y + nextY) / 2 : y + (prevY !== null ? (y - prevY) / 2 : 4.2);
        return (
          <g
            key={l.code}
            onMouseEnter={() => onHover(l.code)}
            onMouseLeave={onLeave}
            onClick={() => onSelect(l.code)}
            data-cursor="go"
            style={{
              pointerEvents: 'auto', cursor: 'pointer',
              opacity: dimmed ? 0 : 1, transition: 'opacity 0.6s ease',
              animationName: entered ? 'labelFadeIn' : 'none',
              animationDuration: '1.1s',
              animationTimingFunction: 'ease',
              animationFillMode: 'backwards',
              animationDelay: `${0.9 + i * 0.2}s`,
            }}
          >
            {/* label to the RIGHT of the crystal knob, on its own Y */}
            <text
              x={labelX} y={y + 0.85} textAnchor="start"
              fontSize={active ? 2.85 : 2.45} letterSpacing={active ? 0.62 : 0.46}
              fill={active ? pastel : 'url(#hsLabelGold)'}
              style={{
                fontFamily: "'Cinzel', 'Noto Serif SC', 'Noto Serif JP', 'Noto Serif KR', serif",
                fontWeight: active ? 600 : 500,
                fontStyle: 'normal',
                textShadow: active
                  ? `0 0 3px ${meshRgba(l.code, 0.85)}, 0 0 9px ${meshRgba(l.code, 0.55)}, 0 0 20px ${meshRgba(l.code, 0.22)}`
                  : 'none',
                transition: 'fill 0.4s ease, font-size 0.4s ease, letter-spacing 0.4s ease',
              }}
            >
              {l.label}
            </text>
            {/* invisible hit area covering the crystal knob + label — Y
                bounds are the midpoint partition computed above (no
                overlap with neighbors, no gaps); X still padded
                generously since compounding scale factors (ScaleStage +
                mobile's tighter crop) can make the effective on-screen
                target quite small otherwise. */}
            <rect x={PIN_CX[i] - 5} y={topBound} width={labelX + 22 - (PIN_CX[i] - 5)} height={bottomBound - topBound} fill="transparent" style={{ pointerEvents: 'all' }} />
          </g>
        );
      })}
      </g>
    </svg>
  );
};

// The vertical composer name, set in the calm gap between the composer photo
// (left) and the guitar neck (right). Champagne-gold serif, letter-by-letter
// rise-in, quiet hairline + diamond node. Fixed gold (language not chosen yet).
// 2026-07-02: LockedSignature replaces the old vh-based PortalSignature.
// vh/rem-clamp sizing doesn't respect a transform-scaled ancestor (the same
// class of bug fixed on PortalComposer's photo earlier) - that's why the
// signature drifted out of position/overlapped the photo once the rest of
// the composition was locked into ScaleStage. This version is sized entirely
// in fixed px relative to whatever logical canvas it's placed in, so it
// scales together with the photo/guitar as ONE unit, on both the desktop
// (wide) and mobile (stacked) scenes - no more independent drift.
// 2026-07-13 (per Reza — minimal theme support): this gradient's pale cream
// stops (#F6E9BE, #FBF0CC) read beautifully against a dark surface but
// blend almost invisibly into a light/ivory one — the whole point of
// Reza's report ("range font aslan moshakhas nist"). Rather than a single
// fixed gradient, pick a deeper-gold variant (no near-white stops at all)
// whenever the live surface itself is light. A simple luminance check on
// --surface-rgb (already correct per-theme) decides which — no separate
// per-theme table to keep in sync with ChromaticContext.
function isLightSurface(): boolean {
  if (typeof document === 'undefined') return false;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--surface-rgb').trim();
  const [r, g, b] = raw.split(',').map((n) => parseInt(n.trim(), 10) || 0);
  // standard relative-luminance approximation
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

function signatureGradient(): string {
  return isLightSurface()
    ? 'linear-gradient(180deg,#4A3610 0%,#8A6A26 22%,#6B4F14 42%,#8A6A26 58%,#4A3610 78%,#4A3610 100%)'
    : 'linear-gradient(180deg,#8A6A26 0%,#F6E9BE 22%,#E9C879 42%,#FBF0CC 58%,#D9B45E 78%,#8A6A26 100%)';
}

function LetterGlyph({ ch, size }: { ch: string; size: number }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size * 0.82, height: size * 0.86,
        fontFamily: "'Cinzel','Noto Serif SC','Noto Serif JP','Noto Serif KR',serif",
        fontWeight: 500, fontStyle: 'normal',
        fontSize: size * 0.64, lineHeight: 1,
        color: '#F1DFA6',
        background: signatureGradient(),
        backgroundSize: '100% 200%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
        animation: 'wgSigShimmer 6.5s ease-in-out infinite',
      }}
    >
      {ch}
    </div>
  );
}

function LockedSignature({ letterSize, dimmed }: { letterSize: number; dimmed: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        opacity: dimmed ? 0 : 1,
        transition: 'opacity 0.9s ease',
      }}
    >
      <div style={{ width: 1, height: letterSize * 0.55, background: 'linear-gradient(180deg,rgba(217,180,94,0) 0%,rgba(246,233,190,0.95) 50%,rgba(217,180,94,0) 100%)' }} />
      {'AMIR'.split('').map((ch, ci) => <LetterGlyph key={`a-${ci}`} ch={ch} size={letterSize} />)}
      <div style={{ width: 6, height: 6, margin: `${letterSize * 0.28}px 0`, background: 'linear-gradient(135deg,#FBF0CC,#D9B45E)', transform: 'rotate(45deg)' }} />
      {'MOSLEHI'.split('').map((ch, ci) => <LetterGlyph key={`m-${ci}`} ch={ch} size={letterSize} />)}
      <div style={{ width: 1, height: letterSize * 0.55, background: 'linear-gradient(180deg,rgba(217,180,94,0) 0%,rgba(246,233,190,0.95) 50%,rgba(217,180,94,0) 100%)' }} />
      <div style={{ marginTop: letterSize * 0.32, fontFamily: "'Cinzel',serif", fontWeight: 400, fontSize: letterSize * 0.24, letterSpacing: '0.42em', paddingLeft: '0.42em', color: '#C9AC6A' }}>
        THE COMPOSER
      </div>
    </div>
  );
}

export const LinguisticPortal = () => {
  const { setLocale } = useIdentity();
  const { applyLanguageWorld } = useChromatic();
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);
  const [seamGeom, setSeamGeom] = useState<{ pins: SeamPin[]; nutX: number; nutY: number; neckHalfW: number } | null>(null);
  const starColorRef = useRef<string>('#FFFFFF');
  const starHoverRef = useRef<number>(0);
  const audioLevelRef = useRef<number>(0);
  // Live cursor position (normalized −1..1) for the galaxy depth-parallax.
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameId = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Keep the mobile/desktop layout in sync when the window is resized or leaves
  // fullscreen, so the whole composition re-lays-out (and re-measures) cleanly
  // instead of staying frozen at the size it first loaded at.
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [entered, setEntered] = useState(false);
  const audioStarterRef = useRef<(() => void) | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  // P4: lets handleLanguageSelect fade the portal ambience OUT smoothly the
  // instant a language is chosen, instead of it being hard-cut by pause()
  // when the component unmounts on navigation to /app.
  const audioFadeOutRef = useRef<(() => void) | null>(null);
  // Global sound toggle (per Reza, 2026-07-08): this portal's ambient
  // track runs through its OWN separate AudioContext (not the shared
  // one), so it must independently respect the site-wide mute — a plain
  // .volume/.muted on the source element stops reliably muting anything
  // once createMediaElementSource has captured it (same issue fixed in
  // the shared AudioContext.tsx). A real GainNode is the fix here too.
  const { audioState: globalAudioState } = useAudio();
  // 2026-07-12 (per Reza — Ambient Tracks admin tab): this screen's own
  // ambient bed is now overridable too, same content_entries pattern as
  // BackgroundMusic.tsx's per-language beds (key: 'ambient-track-selector').
  // Read once, inside start() below, at the moment the visitor actually
  // clicks Enter — by then content data has had time to load, and start()
  // only ever runs once anyway (autoplay policy gates it on that click).
  const { resolve: resolveAmbientOverride } = useContent();
  const [promoConfig, setPromoConfig] = useState<{ mediaType: 'video' | 'image'; mediaUrl: string; durationMs?: number } | null>(null);
  const [exitingPromoToSite, setExitingPromoToSite] = useState(false);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientActxRef = useRef<AudioContext | null>(null);

  // Track the cursor (normalized −1..1) so the galaxy can drift in 3D behind
  // the anchored instrument — gentle depth-parallax, the "alive" feel.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Ambient background music + live audio analysis driving the starfield pulse.
  // The analyser feeds a smoothed 0..1 energy into audioLevelRef, read by the
  // Starfield's useFrame. Music is started by the WelcomeGate's Enter click
  // (that user gesture is what unlocks browser autoplay).
  useEffect(() => {
    let audioEl: HTMLAudioElement | null = null;
    let actx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;
    let started = false;
    let freqData: Uint8Array | null = null;

    const start = () => {
      if (started) return;
      started = true;
      try {
        audioEl = new Audio(resolveAmbientOverride('ambient-track-selector', 'en') || '/portal-ambient.mp3');
        audioEl.loop = true;
        audioEl.preload = 'auto';
        audioEl.crossOrigin = 'anonymous';
        audioEl.volume = 0.0;
        audioEl.addEventListener('timeupdate', () => {
          if (!audioEl) return;
          const d = audioEl.duration;
          if (d && audioEl.currentTime > d - 0.25) {
            audioEl.currentTime = 0.02;
          }
        });

        actx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const srcNode = actx.createMediaElementSource(audioEl);
        analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        const gainNode = actx.createGain();
        gainNode.gain.value = globalAudioState.isMuted ? 0 : 1;
        ambientGainRef.current = gainNode;
        ambientActxRef.current = actx;
        srcNode.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(actx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);

        audioEl.play().catch(() => {});
        const fadeStart = performance.now();
        const fade = () => {
          if (!audioEl) return;
          const p = Math.min((performance.now() - fadeStart) / 2500, 1);
          audioEl.volume = 0.55 * p;
          if (p < 1) requestAnimationFrame(fade);
        };
        fade();

        const tick = () => {
          if (analyser && freqData) {
            analyser.getByteFrequencyData(freqData);
            let bass = 0;
            const bassBins = 8;
            for (let i = 0; i < bassBins; i++) bass += freqData[i];
            bass /= bassBins * 255;
            let avg = 0;
            for (let i = 0; i < freqData.length; i++) avg += freqData[i];
            avg /= freqData.length * 255;
            const level = Math.min(1, (bass * 0.85 + avg * 0.5) * 1.8);
            audioLevelRef.current = level;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* silent */ }
    };

    audioStarterRef.current = start;
    audioFadeOutRef.current = () => {
      const el = audioEl;
      if (!el) return;
      const from = el.volume;
      if (from <= 0.001) { el.pause(); return; }
      const fadeStart = performance.now();
      const dur = 900;
      const step = () => {
        const p = Math.min((performance.now() - fadeStart) / dur, 1);
        el.volume = from * (1 - p);
        if (p < 1) requestAnimationFrame(step);
        else el.pause();
      };
      step();
    };
    audioCleanupRef.current = () => {
      if (raf) cancelAnimationFrame(raf);
      audioEl?.pause();
      actx?.close();
      ambientGainRef.current = null;
      ambientActxRef.current = null;
    };

    return () => { audioCleanupRef.current?.(); };
  }, []);

  // Reacts to the global mute toggle without restarting the whole ambient
  // audio setup — just updates the gain node already in place.
  useEffect(() => {
    if (ambientGainRef.current && ambientActxRef.current) {
      ambientGainRef.current.gain.setValueAtTime(
        globalAudioState.isMuted ? 0 : 1,
        ambientActxRef.current.currentTime
      );
    }
  }, [globalAudioState.isMuted]);

  const handleEnter = useCallback(() => {
    audioStarterRef.current?.();
    setEntered(true);
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      audioCtxRef.current?.close();
    };
  }, []);

  const playMicroTone = useCallback((langCode: string) => {
    const freq = MICRO_TONES[langCode];
    if (!freq) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch { /* silent */ }
  }, []);

  const handleLanguageHover = useCallback((langCode: string) => {
    if (selectedLang) return;
    setHoveredLang(langCode);
    starColorRef.current = LANGUAGE_MESH[langCode] || '#FFFFFF';
    starHoverRef.current = 1;
    playMicroTone(langCode);
  }, [selectedLang, playMicroTone]);

  const handleLanguageLeave = useCallback(() => {
    setHoveredLang(null);
    starColorRef.current = '#FFFFFF';
    starHoverRef.current = 0;
  }, []);

  const goToMainApp = useCallback((langCode: string) => {
    setLocale(langCode as any);
    document.documentElement.setAttribute('lang', langCode);
  }, [setLocale]);

  const handleLanguageSelect = useCallback((langCode: string) => {
    if (selectedLang) return;
    setSelectedLang(langCode);          // drives the treble-clef transition overlay (CSS)
    playMicroTone(langCode);
    audioFadeOutRef.current?.();        // P4: fade the portal ambience out smoothly
    applyLanguageWorld(langCode as any);
    // navigate once the clef has written itself and we've dived into its spiral
    window.setTimeout(() => {
      // 2026-07-14 (per Reza — optional promo screen, and the actual bug
      // fix for it): MainApp swaps away from LinguisticPortal the INSTANT
      // `locale` becomes non-null (see MainApp.tsx: `if (!locale) return
      // <LinguisticPortal/>`) — window.location.hash here was always
      // inert (AppRouter uses BrowserRouter, not hash routing; confirmed,
      // not guessed). So calling setLocale immediately was racing away
      // from this component before any promo screen could ever paint.
      // Fix: only call setLocale right away when there's no promo screen
      // to show; otherwise defer it to PromoScreen's onDone.
      const enabled = resolveAmbientOverride('promoScreen.enabled', 'en') === 'true';
      const mediaType = resolveAmbientOverride('promoScreen.mediaType', 'en');
      const mediaUrl = resolveAmbientOverride('promoScreen.mediaUrl', 'en');
      const durationSecondsRaw = resolveAmbientOverride('promoScreen.imageDurationSeconds', 'en');
      const durationMs = durationSecondsRaw ? Number(durationSecondsRaw) * 1000 : undefined;
      if (enabled && mediaUrl && (mediaType === 'video' || mediaType === 'image')) {
        setPromoConfig({ mediaType, mediaUrl, durationMs: Number.isFinite(durationMs) ? durationMs : undefined });
      } else {
        goToMainApp(langCode);
      }
    }, SELECT_TRANSITION_MS);
  }, [selectedLang, playMicroTone, applyLanguageWorld, resolveAmbientOverride, goToMainApp]);

  // Once the promo->site mesh-wipe starts, actually navigate after it's
  // had time to play (same duration as the language-pick transition).
  useEffect(() => {
    if (!exitingPromoToSite || !selectedLang) return;
    const id = window.setTimeout(() => goToMainApp(selectedLang), PROMO_EXIT_TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [exitingPromoToSite, selectedLang, goToMainApp]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 overflow-hidden" style={{ backgroundColor: 'var(--surface-color)' }}>
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap'); @keyframes labelFadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes wgSigRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } } @keyframes wgSigRule { from { opacity: 0; transform: scaleX(0.2); } to { opacity: 0.6; transform: scaleX(1); } } @keyframes wgSigDot { from { opacity: 0; transform: rotate(45deg) scale(0.2); } to { opacity: 0.65; transform: rotate(45deg) scale(1); } } @keyframes wgSigShimmer { 0% { background-position: 0% 0%; } 100% { background-position: 0% 200%; } } .wg-sig-wrap { position: absolute; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: flex-start; } .wg-sig-ch { display: flex; align-items: center; justify-content: center; width: clamp(2.2rem, 6vh, 3.4rem); height: clamp(2.3rem, 6.4vh, 3.6rem); font-family: 'Cinzel','Cormorant Garamond',Didot,Georgia,serif; font-weight: 500; font-style: normal; font-size: clamp(1.7rem, 4.6vh, 2.9rem); line-height: 1; letter-spacing: 0; text-align: center; color: #F1DFA6; background: linear-gradient(180deg,#8A6A26 0%,#F6E9BE 22%,#E9C879 42%,#FBF0CC 58%,#D9B45E 78%,#8A6A26 100%); background-size: 100% 200%; background-position: 0% 0%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.55)); opacity: 0; animation: wgSigRise 1.2s cubic-bezier(0.22,1,0.36,1) both, wgSigShimmer 6.5s ease-in-out infinite; } .wg-sig-rule { display: block; width: 1px; height: clamp(14px,2.4vh,26px); background: linear-gradient(180deg,rgba(217,180,94,0) 0%,rgba(246,233,190,0.95) 50%,rgba(217,180,94,0) 100%); opacity: 0; animation: wgSigRule 1.3s ease both; } .wg-sig-diamond { display: block; width: 6px; height: 6px; margin: 0.9vh 0; background: linear-gradient(135deg,#FBF0CC,#D9B45E);  opacity: 0; animation: wgSigDot 1s ease both; } .wg-sig-sub { margin-top: 1.1vh; font-family: 'Cinzel','Cormorant Garamond',Georgia,serif; font-weight: 400; font-size: clamp(0.5rem, 1.15vh, 0.72rem); letter-spacing: 0.42em; padding-left: 0.42em; color: #C9AC6A;  opacity: 0; animation: wgSigRise 1.2s ease both; } @media (max-width: 767px) { .wg-sig-wrap { display: none; } } @media (prefers-reduced-motion: reduce) { .wg-sig-ch, .wg-sig-rule, .wg-sig-diamond, .wg-sig-sub { animation: none; opacity: 1; } .wg-sig-rule { opacity: 0.6; } .wg-sig-diamond { opacity: 0.65; transform: rotate(45deg); } }" }} />

      {/* The living starfield is always present — it backs both the welcome
          gate and the language portal so the transition feels continuous. */}
      <StarfieldCanvas colorRef={starColorRef} hoverRef={starHoverRef} audioRef={audioLevelRef} pointerRef={pointerRef} />
      <PortalCursor />

      {/* Cinematic entry curtain, shown on every load before the portal. */}
      {!entered && <WelcomeGate onEnter={handleEnter} />}
      {promoConfig && !exitingPromoToSite && (
        <PromoScreen
          mediaType={promoConfig.mediaType}
          mediaUrl={promoConfig.mediaUrl}
          durationMs={promoConfig.durationMs}
          onDone={() => setExitingPromoToSite(true)}
        />
      )}
      {/* Promo -> site transition (2026-07-14, per Reza): a soft luxury
          color fade in the just-picked language's tint, not a reused
          MeshWipe — reusing that canvas/triangulation animation for a
          second, independently-triggered mount proved unreliable (its
          own canvas never actually got created on exit, confirmed via
          DevTools instrumentation, not guessed) after several attempts.
          A plain opacity fade can never get stuck mid-animation. */}
      {exitingPromoToSite && selectedLang && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: PROMO_EXIT_TRANSITION_MS / 1000, times: [0, 0.35, 0.65, 1], ease: 'easeInOut' }}
          className="fixed inset-0"
          style={{
            zIndex: 200,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, ${LANGUAGE_MESH[selectedLang] || '#F3D77E'}22 0%, #08080a 70%)`,
          }}
        />
      )}

      {/* Language portal — fades in only after the user clicks Enter. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: entered ? 1 : 0,
          transition: 'opacity 1.8s ease',
          pointerEvents: entered ? 'auto' : 'none',
        }}
      >
      {/* Vertical composer signature in the gap between photo and guitar.
          Stays OUTSIDE ScaleStage: its own vh-based clamp() sizing already
          locks it correctly at every viewport height (shipped + approved
          separately - see MEGA_MASTER §4.2-4), so it doesn't need or want
          the scale-transform treatment applied to the guitar/photo below. */}
      {/* DESKTOP (>=768px), 2026-07-02 FINAL: everything (photo, signature,
          neck, headstock/labels) inside ONE ScaleStage(1920,1080) - one
          rigid unit, zero deformation on manual resize. Wider 16:9 canvas
          + explicit px gives real breathing room: photo left (980px wide,
          right edge ~1020), signature centered in the gap at x=1180 (well
          clear of the photo), guitar hugs the right edge via its own slice svg. */}
      {!isMobile && (
        <ScaleStage width={1920} height={1080} clip={false}>
          <div style={{ position: 'absolute', top: '50%', left: 40, transform: 'translateY(-50%)', width: 980, height: 1080 }}>
            <PortalComposer widthCss="980px" marginLeftCss="0px" />
          </div>

          <div style={{ position: 'absolute', top: '50%', left: 1180, transform: 'translate(-50%, -50%)', zIndex: 5, pointerEvents: 'none' }}>
            <LockedSignature letterSize={50} dimmed={!!selectedLang} />
          </div>

          {/* The ornate NECK continuing below the headstock — fills the space down
              toward the galaxy. Same viewBox + slice as the headstock so it tracks
              it under every viewport; sits behind the silk strings; its top tucks
              under the headstock and its bottom melts into the stars. */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 160 90"
            preserveAspectRatio="xMaxYMin slice"
            style={{ zIndex: 3 }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="neckFade" gradientUnits="userSpaceOnUse"
                x1={NECK_CX} y1={NECK_TOP_Y} x2={NECK_CX} y2={NECK_TOP_Y + NECK_H}>
                <stop offset="0" stopColor="#000" />
                <stop offset={NECK_TOPIN_OFF} stopColor="#fff" />
                <stop offset={NECK_FADE_OFF0} stopColor="#fff" />
                <stop offset={NECK_FADE_OFF1} stopColor="#000" />
                <stop offset="1" stopColor="#000" />
              </linearGradient>
              <filter id="neckFeather" x="-60%" y="-10%" width="220%" height="120%">
                <feGaussianBlur stdDeviation="0.9" />
              </filter>
              <mask id="neckMask">
                <rect
                  x={NECK_CX - NECK_W / 2 - 2} y={NECK_TOP_Y - 2}
                  width={NECK_W + 4} height={NECK_H + 4}
                  fill="url(#neckFade)"
                  filter="url(#neckFeather)"
                />
              </mask>
            </defs>
            <image
              href="/neck.png"
              x={NECK_CX - NECK_W / 2} y={NECK_TOP_Y}
              width={NECK_W} height={NECK_H}
              preserveAspectRatio="none"
              mask="url(#neckMask)"
              style={{ pointerEvents: 'none' }}
            />
          </svg>

          <HeadstockSelector
            selectedLang={selectedLang}
            hoveredLang={hoveredLang}
            onHover={handleLanguageHover}
            onLeave={handleLanguageLeave}
            onSelect={handleLanguageSelect}
            onGeometry={setSeamGeom}
            entered={entered}
          />
        </ScaleStage>
      )}

      {/* MOBILE (<768px), 2026-07-02: same principle as desktop above - one
          ScaleStage, signature INCLUDED, so the whole stacked composition
          (signature top, photo middle, guitar bottom) scales as a single
          rigid unit with zero deformation risk, on any phone/tablet size. */}
      {isMobile && (
        <ScaleStage width={MOBILE_W} height={MOBILE_H} clip={false}>
          <div style={{ position: 'absolute', top: 55, left: '50%', transform: 'translateX(-50%)', zIndex: 6 }}>
            <LockedSignature letterSize={30} dimmed={!!selectedLang} />
          </div>

          <div style={{ position: 'absolute', top: 420, left: 0, width: MOBILE_W, height: 720 }}>
            <PortalComposer widthCss={`${MOBILE_W}px`} marginLeftCss="0px" />
          </div>

          {/* 2026-07-02 v3: the neck+headstock svgs now use a TIGHT custom
              viewBox covering just the guitar+labels region (not the full
              empty 160-wide canvas) with "xMidYMid meet" - that centers the
              guitar within this box BY DEFINITION, so the wrapping div just
              needs simple, ordinary centering below. Strings are measured
              from the same real elements, so they follow automatically. */}
          <div style={{ position: 'absolute', top: 1150, left: (MOBILE_W - MOBILE_GUITAR_W) / 2, width: MOBILE_GUITAR_W, height: MOBILE_GUITAR_H, overflow: 'hidden' }}>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={MOBILE_GUITAR_VIEWBOX}
              preserveAspectRatio="xMidYMid meet"
              style={{ zIndex: 3 }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="neckFadeM" gradientUnits="userSpaceOnUse"
                  x1={NECK_CX} y1={NECK_TOP_Y} x2={NECK_CX} y2={NECK_TOP_Y + NECK_H}>
                  <stop offset="0" stopColor="#000" />
                  <stop offset={NECK_TOPIN_OFF} stopColor="#fff" />
                  <stop offset={NECK_FADE_OFF0} stopColor="#fff" />
                  <stop offset={NECK_FADE_OFF1} stopColor="#000" />
                  <stop offset="1" stopColor="#000" />
                </linearGradient>
                <filter id="neckFeatherM" x="-60%" y="-10%" width="220%" height="120%">
                  <feGaussianBlur stdDeviation="0.9" />
                </filter>
                <mask id="neckMaskM">
                  <rect
                    x={NECK_CX - NECK_W / 2 - 2} y={NECK_TOP_Y - 2}
                    width={NECK_W + 4} height={NECK_H + 4}
                    fill="url(#neckFadeM)"
                    filter="url(#neckFeatherM)"
                  />
                </mask>
              </defs>
              <image
                href="/neck.png"
                x={NECK_CX - NECK_W / 2} y={NECK_TOP_Y}
                width={NECK_W} height={NECK_H}
                preserveAspectRatio="none"
                mask="url(#neckMaskM)"
                style={{ pointerEvents: 'none' }}
              />
            </svg>

            <HeadstockSelector
              selectedLang={selectedLang}
              hoveredLang={hoveredLang}
              onHover={handleLanguageHover}
              onLeave={handleLanguageLeave}
              onSelect={handleLanguageSelect}
              onGeometry={setSeamGeom}
              entered={entered}
              viewBox={MOBILE_GUITAR_VIEWBOX}
              preserveAspectRatio="xMidYMid meet"
            />
          </div>
        </ScaleStage>
      )}

      {/* hover glow: ambient lighting wash behind the guitar, at real
          viewport size. Its anchor point must match wherever the guitar
          actually sits - which is a totally different screen location on
          mobile (bottom, centered) vs desktop (right side) since they're
          different scenes/layouts. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background: hoveredLang
            ? `radial-gradient(ellipse 80% 70% at ${isMobile ? '50% 82%' : '68% 44%'}, ${meshRgba(hoveredLang, 0.9)} 0%, ${meshRgba(hoveredLang, 0.4)} 30%, transparent 62%)`
            : 'transparent',
          opacity: hoveredLang ? 0.13 : 0,
          transition: 'opacity 1s ease',
          mixBlendMode: 'screen',
        }}
      />

      {/* The silk strings render as a viewport-`fixed` overlay using REAL
          screen-pixel pin coordinates already measured post-scale by
          HeadstockSelector (getBoundingClientRect accounts for the
          ScaleStage transform automatically) - so LiquidSeam itself must
          stay OUTSIDE ScaleStage. Nesting a `position:fixed` element inside
          a `transform`-ed ancestor would make that ancestor its new
          containing block (a CSS gotcha), breaking both its size and
          position. Kept as a sibling, same as before. */}
      {/* 2026-07-02: re-enabled on mobile. Strings are measured from the
          same real guitar elements, which are now correctly centered (the
          earlier "poking out" issue was very likely a symptom of the guitar
          box being mis-positioned at the time, not a separate string bug).
          Worth testing again now that the guitar position is confirmed. */}
      {entered && seamGeom && (
        <LiquidSeam
          pins={seamGeom.pins}
          nutX={seamGeom.nutX}
          weaveFrac={0.45}
          // 2026-07-02: mobile gets a tighter weave (smaller guitar = less
          // visual room for wide swings) and a rightward nudge of the LOWER
          // run only - laneShift never touches the pin tie-point at the top,
          // exactly as requested.
          weaveAmp={isMobile ? 4 : 10}
          bandHalfW={isMobile ? 6 : 16}
          laneShift={isMobile ? 3 : -10}
          hoveredLang={hoveredLang}
        />
      )}

      </div>

      {/* Language-pick transition: golden sparks form the clef, then burst
          into a bloom of light + the chosen colour as we cross into the site. */}
      {selectedLang && (
        <MeshWipe
          color={LANGUAGE_MESH[selectedLang] || '#F3D77E'}
          fx={seamGeom ? seamGeom.pins.reduce((s, p) => s + p.x, 0) / Math.max(1, seamGeom.pins.length) : undefined}
          fy={seamGeom ? seamGeom.pins.reduce((s, p) => s + p.y, 0) / Math.max(1, seamGeom.pins.length) : undefined}
        />
      )}
    </div>
  );
};

export default LinguisticPortal;
