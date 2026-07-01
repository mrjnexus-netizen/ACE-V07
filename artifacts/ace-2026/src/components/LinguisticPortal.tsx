import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import PortalCursor from './PortalCursor';
import PortalComposer from './PortalComposer';
import LiquidSeam, { type SeamPin } from './LiquidSeam';
import WelcomeGate from './WelcomeGate';

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
const LANGUAGE_PASTEL: Record<string, string> = {
  en: '#F7E6B0', es: '#FFCB94', fr: '#EAD9B5', zh: '#FFA79E', ja: '#A9C7FF', ko: '#FFB3F0',
};

const DEFAULT_STAR_COLOR = '#FFFFFF';

const SELECT_TRANSITION_MS = 2560; // cover -> light rake -> melt into site tone, then cross over

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

// Derived absolute coords (viewBox units).
const PIN_CX = CRYSTAL_NORM.map(([nx]) => IMG_X + nx * IMG_W); // crystal centers
const PIN_CY = CRYSTAL_NORM.map(([, ny]) => IMG_Y + ny * IMG_H);
const POST_X = POST_NORM.map(([nx]) => IMG_X + nx * IMG_W);    // string tie points
const POST_Y = POST_NORM.map(([, ny]) => IMG_Y + ny * IMG_H);

const Starfield = ({ colorRef, hoverRef, audioRef, pointerRef }: { colorRef: React.MutableRefObject<string>; hoverRef: React.MutableRefObject<number>; audioRef: React.MutableRefObject<number>; pointerRef: React.MutableRefObject<{ x: number; y: number }> }) => {
  const meshRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const currentColor = useRef(new THREE.Color(DEFAULT_STAR_COLOR));
  const target = useRef(new THREE.Color(DEFAULT_STAR_COLOR));
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
    target.current.set(colorRef.current || DEFAULT_STAR_COLOR);
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

  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(DEFAULT_STAR_COLOR) }, uTime: { value: 0 }, uHover: { value: 0 }, uBeat: { value: 0 } }), []);

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
        gl.setClearColor(new THREE.Color('#000000'));
        scene.fog = new THREE.FogExp2('#000000', 0.0008);
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
}: {
  selectedLang: string | null;
  hoveredLang: string | null;
  onHover: (code: string) => void;
  onLeave: () => void;
  onSelect: (code: string) => void;
  onGeometry: (g: { pins: SeamPin[]; nutX: number; nutY: number; neckHalfW: number }) => void;
  entered: boolean;
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
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(id); window.clearTimeout(id2); window.removeEventListener('resize', measure); };
  }, [onGeometry]);

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMaxYMin slice"
      style={{ zIndex: 7, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {/* Feather mask: melts the photo's rectangular edges into the galaxy so
          it never looks like a hard cropped box pasted on space. The left and
          bottom edges (which meet empty space) fade most; the crystal pegs in
          the center/right stay fully crisp. */}
      <defs>
        <filter id="hsFeather" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" />
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
              fill={active ? pastel : 'rgba(255,255,255,0.62)'}
              style={{
                fontFamily: "'Cormorant Garamond', 'Didot', Georgia, serif",
                fontWeight: active ? 600 : 500,
                fontStyle: (l.code === 'zh' || l.code === 'ja' || l.code === 'ko') ? 'normal' : 'italic',
                textShadow: active ? `0 0 5px ${LANGUAGE_MESH[l.code]}` : 'none',
                transition: 'fill 0.4s ease, font-size 0.4s ease, letter-spacing 0.4s ease',
              }}
            >
              {l.label}
            </text>
            {/* invisible hit area covering the crystal knob + label */}
            <rect x={PIN_CX[i] - 3} y={y - 2.6} width={labelX + 18 - (PIN_CX[i] - 3)} height="5.2" fill="transparent" style={{ pointerEvents: 'all' }} />
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
const PortalSignature = ({ dimmed }: { dimmed: boolean }) => {
  return (
    <div
      aria-hidden="true"
      className="wg-sig-wrap"
      style={{
        zIndex: 5,
        paddingLeft: '54%',
        opacity: dimmed ? 0 : 1,
        transition: 'opacity 0.9s ease',
      }}
    >
      <div className="wg-sig-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1vh' }}>
        {/* top hairline */}
        <span className="wg-sig-rule" style={{ animationDelay: '0.2s' }} />
        {/* AMIR */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {'AMIR'.split('').map((ch, ci) => (
            <span key={`a-${ci}`} className="wg-sig-ch" style={{ animationDelay: `${1.2 + ci * 0.11}s` }}>{ch}</span>
          ))}
        </div>
        {/* centered diamond node between the two words */}
        <span className="wg-sig-diamond" style={{ animationDelay: '1.7s' }} />
        {/* MOSLEHI */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {'MOSLEHI'.split('').map((ch, ci) => (
            <span key={`m-${ci}`} className="wg-sig-ch" style={{ animationDelay: `${1.7 + ci * 0.11}s` }}>{ch}</span>
          ))}
        </div>
        {/* bottom hairline */}
        <span className="wg-sig-rule" style={{ animationDelay: '2.6s' }} />
        {/* subtitle */}
        <span className="wg-sig-sub" style={{ animationDelay: '2.9s' }}>THE COMPOSER</span>
      </div>
    </div>
  );
};

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
        audioEl = new Audio('/portal-ambient.mp3');
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
        srcNode.connect(analyser);
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
    audioCleanupRef.current = () => {
      if (raf) cancelAnimationFrame(raf);
      audioEl?.pause();
      actx?.close();
    };

    return () => { audioCleanupRef.current?.(); };
  }, []);

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

  const handleLanguageSelect = useCallback((langCode: string) => {
    if (selectedLang) return;
    setSelectedLang(langCode);          // drives the treble-clef transition overlay (CSS)
    playMicroTone(langCode);
    applyLanguageWorld(langCode as any);
    // navigate once the clef has written itself and we've dived into its spiral
    window.setTimeout(() => {
      setLocale(langCode as any);
      document.documentElement.setAttribute('lang', langCode);
      window.location.hash = '/app';
    }, SELECT_TRANSITION_MS);
  }, [selectedLang, setLocale, playMicroTone, applyLanguageWorld]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap'); @keyframes labelFadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes wgSigRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } } @keyframes wgSigRule { from { opacity: 0; transform: scaleX(0.2); } to { opacity: 0.6; transform: scaleX(1); } } @keyframes wgSigDot { from { opacity: 0; transform: rotate(45deg) scale(0.2); } to { opacity: 0.65; transform: rotate(45deg) scale(1); } } @keyframes wgSigShimmer { 0% { background-position: 0% 0%; } 100% { background-position: 0% 200%; } } .wg-sig-wrap { position: absolute; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: flex-start; } .wg-sig-ch { display: flex; align-items: center; justify-content: center; width: clamp(2.2rem, 6vh, 3.4rem); height: clamp(2.3rem, 6.4vh, 3.6rem); font-family: 'Cinzel','Cormorant Garamond',Didot,Georgia,serif; font-weight: 500; font-style: normal; font-size: clamp(1.7rem, 4.6vh, 2.9rem); line-height: 1; letter-spacing: 0; text-align: center; color: #F1DFA6; background: linear-gradient(180deg,#8A6A26 0%,#F6E9BE 22%,#E9C879 42%,#FBF0CC 58%,#D9B45E 78%,#8A6A26 100%); background-size: 100% 200%; background-position: 0% 0%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 22px rgba(233,200,121,0.5)) drop-shadow(0 0 40px rgba(217,180,94,0.28)) drop-shadow(0 1px 3px rgba(0,0,0,0.55)); opacity: 0; animation: wgSigRise 1.2s cubic-bezier(0.22,1,0.36,1) both, wgSigShimmer 6.5s ease-in-out infinite; } .wg-sig-rule { display: block; width: 1px; height: clamp(14px,2.4vh,26px); background: linear-gradient(180deg,rgba(217,180,94,0) 0%,rgba(246,233,190,0.95) 50%,rgba(217,180,94,0) 100%); opacity: 0; animation: wgSigRule 1.3s ease both; } .wg-sig-diamond { display: block; width: 6px; height: 6px; margin: 0.9vh 0; background: linear-gradient(135deg,#FBF0CC,#D9B45E); box-shadow: 0 0 10px rgba(233,200,121,0.6); opacity: 0; animation: wgSigDot 1s ease both; } .wg-sig-sub { margin-top: 1.1vh; font-family: 'Cinzel','Cormorant Garamond',Georgia,serif; font-weight: 400; font-size: clamp(0.5rem, 1.15vh, 0.72rem); letter-spacing: 0.42em; padding-left: 0.42em; color: #C9AC6A; text-shadow: 0 0 10px rgba(201,172,106,0.4); opacity: 0; animation: wgSigRise 1.2s ease both; } @media (max-width: 767px) { .wg-sig-wrap { display: none; } } @media (prefers-reduced-motion: reduce) { .wg-sig-ch, .wg-sig-rule, .wg-sig-diamond, .wg-sig-sub { animation: none; opacity: 1; } .wg-sig-rule { opacity: 0.6; } .wg-sig-diamond { opacity: 0.65; transform: rotate(45deg); } }" }} />

      {/* The living starfield is always present — it backs both the welcome
          gate and the language portal so the transition feels continuous. */}
      <StarfieldCanvas colorRef={starColorRef} hoverRef={starHoverRef} audioRef={audioLevelRef} pointerRef={pointerRef} />
      <PortalCursor />

      {/* Cinematic entry curtain, shown on every load before the portal. */}
      {!entered && <WelcomeGate onEnter={handleEnter} />}

      {/* Language portal — fades in only after the user clicks Enter. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: entered ? 1 : 0,
          transition: 'opacity 1.8s ease',
          pointerEvents: entered ? 'auto' : 'none',
        }}
      >
      <PortalComposer />

      {/* Vertical composer signature in the gap between photo and guitar. */}
      <PortalSignature dimmed={!!selectedLang} />

      {/* The ornate NECK continuing below the headstock — fills the space down
          toward the galaxy. Same viewBox + slice as the headstock so it tracks
          it under every viewport; sits behind the silk strings; its top tucks
          under the headstock and its bottom melts into the stars. */}
      {!isMobile && (
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
            <mask id="neckMask">
              <rect
                x={NECK_CX - NECK_W / 2 - 2} y={NECK_TOP_Y - 2}
                width={NECK_W + 4} height={NECK_H + 4}
                fill="url(#neckFade)"
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
      )}

      {/* The silk strings: tied to the crystal pegs and pulled TAUT straight
          down the page — only a faint living shimmer, clamped to the neck. */}
      {entered && !isMobile && seamGeom && (
        <LiquidSeam
          pins={seamGeom.pins}
          nutX={seamGeom.nutX}
          weaveFrac={0.45}
          weaveAmp={10}
          bandHalfW={16}
          laneShift={-10}
          hoveredLang={hoveredLang}
        />
      )}
      {/* hover glow — fully IN FRONT of the composer (zIndex 2: above the image,
          below the column/headstock), soft and luxurious */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background: hoveredLang
            ? `radial-gradient(ellipse 80% 70% at 68% 44%, ${LANGUAGE_MESH[hoveredLang]}, transparent 62%)`
            : 'transparent',
          opacity: hoveredLang ? 0.07 : 0,
          transition: 'opacity 1s ease',
          mixBlendMode: 'screen',
        }}
      />

      {isMobile ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid grid-cols-2 gap-6 p-8">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = selectedLang === lang.code || hoveredLang === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code)}
                  onMouseEnter={() => handleLanguageHover(lang.code)}
                  onMouseLeave={handleLanguageLeave}
                  data-cursor="go"
                  className={`
                    font-display transition-all duration-300 ease-out
                    text-6xl tracking-[0.15em]
                    min-h-[52px] min-w-[52px] flex items-center justify-center
                    ${selectedLang === lang.code ? 'scale-150 opacity-100' : ''}
                    ${selectedLang && selectedLang !== lang.code ? 'opacity-0 translate-y-[-20px]' : ''}
                    ${!selectedLang && hoveredLang && hoveredLang !== lang.code ? 'opacity-20' : ''}
                  `}
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: active ? LANGUAGE_PASTEL[lang.code] : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <HeadstockSelector
          selectedLang={selectedLang}
          hoveredLang={hoveredLang}
          onHover={handleLanguageHover}
          onLeave={handleLanguageLeave}
          onSelect={handleLanguageSelect}
          onGeometry={setSeamGeom}
          entered={entered}
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
