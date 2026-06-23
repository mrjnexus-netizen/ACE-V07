import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import PortalCursor from './PortalCursor';
import PortalComposer from './PortalComposer';
import LiquidSeam from './LiquidSeam';
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

const SHATTER_DURATION = 900;
const SHATTER_DESKTOP_FRAGMENTS = 48;
const SHATTER_MOBILE_FRAGMENTS = 24;

// Refined 3D mirrored headstock geometry (SVG viewBox 0 0 160 90, anchored
// top-right). Tuning pegs + labels sit on the RIGHT; each colored string fans
// down to the nut and melts into the central 6-color silk column below.
const PEG_Y = [8, 12.5, 17, 21.5, 26, 30.5];
const STRING_D = [
  'M110,8 C109,20 107.4,31 106.96,37.44 L106.96,42.5',
  'M110,12.5 C109.3,22 107.9,31 107.61,37.27 L107.61,42.5',
  'M110,17 C109.7,25 108.5,32 108.26,37.09 L108.26,42.5',
  'M110,21.5 C110,28 109.1,33 108.92,36.92 L108.92,42.5',
  'M110,26 C110.1,30 109.9,34 109.7,36.71 L109.7,42.5',
  'M110,30.5 C110.4,33 110.5,35 110.35,36.53 L110.35,42.5',
];

// gentle silk-sway per string (pinned at the peg) — visibly dancing, like the column
const SWAY = [
  { dur: 13, begin: -2, ang: 1.7 },
  { dur: 15, begin: -6, ang: 1.9 },
  { dur: 12, begin: -1, ang: 2.1 },
  { dur: 16, begin: -8, ang: 2.3 },
  { dur: 14, begin: -4, ang: 2.0 },
  { dur: 17, begin: -7, ang: 2.2 },
];

// Tuners protrude at varied lengths (real-world staggered look).
const NECK_W = [3.4, 3.4, 3.4, 3.4, 3.4, 3.4];
const KNOB_CX = [113.4, 113.4, 113.4, 113.4, 113.4, 113.4];

const Starfield = ({ colorRef, hoverRef, audioRef }: { colorRef: React.MutableRefObject<string>; hoverRef: React.MutableRefObject<number>; audioRef: React.MutableRefObject<number> }) => {
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

const StarfieldCanvas = ({ colorRef, hoverRef, audioRef }: { colorRef: React.MutableRefObject<string>; hoverRef: React.MutableRefObject<number>; audioRef: React.MutableRefObject<number> }) => {
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
      <Starfield colorRef={colorRef} hoverRef={hoverRef} audioRef={audioRef} />
    </Canvas>
  );
};

// The refined 3D luxury mirrored headstock with the six languages on its pegs.
const HeadstockSelector = ({
  selectedLang, hoveredLang, onHover, onLeave, onSelect, onHandoffY,
}: {
  selectedLang: string | null;
  hoveredLang: string | null;
  onHover: (code: string) => void;
  onLeave: () => void;
  onSelect: (code: string) => void;
  onHandoffY: (y: number) => void;
}) => {
  const handoffRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    const measure = () => {
      const r = handoffRef.current?.getBoundingClientRect();
      if (r) onHandoffY(r.top + r.height / 2);
    };
    measure();
    const id = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', measure); };
  }, [onHandoffY]);
  const activeLang = hoveredLang || selectedLang;
  const vaporColor = activeLang ? LANGUAGE_MESH[activeLang] : '#ffffff';
  const vaporCore = activeLang ? (LANGUAGE_PASTEL[activeLang] || '#ffffff') : '#ffffff';
  const vaporIdx = activeLang ? SUPPORTED_LANGUAGES.findIndex((l) => l.code === activeLang) : -1;
  const vaporY = vaporIdx >= 0 ? PEG_Y[vaporIdx] : 20;
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMaxYMin slice"
      style={{ zIndex: 7, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="glass" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="rgba(88,102,128,0.30)" /><stop offset="0.45" stopColor="rgba(34,40,55,0.22)" /><stop offset="1" stopColor="rgba(12,15,22,0.16)" />
        </linearGradient>
        <radialGradient id="aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(126,146,186,0.16)" /><stop offset="0.6" stopColor="rgba(120,140,180,0.06)" /><stop offset="1" stopColor="rgba(120,140,180,0)" />
        </radialGradient>
        <linearGradient id="gknob" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(150,168,196,0.5)" /><stop offset="0.5" stopColor="rgba(70,82,104,0.42)" /><stop offset="1" stopColor="rgba(28,34,48,0.4)" />
        </linearGradient>
        <radialGradient id="gspot" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(255,255,255,0.5)" /><stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="met" cx="0.3" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#fffdf6" /><stop offset="0.5" stopColor="#cfd6e0" /><stop offset="1" stopColor="#6a7080" />
        </radialGradient>
        <radialGradient id="bush" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#eef2f8" /><stop offset="0.6" stopColor="#9aa3b2" /><stop offset="1" stopColor="#454b58" />
        </radialGradient>
        <filter id="pegGlow" x="-400%" y="-400%" width="900%" height="900%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <filter id="strGlow" x="-400%" y="-50%" width="900%" height="200%"><feGaussianBlur stdDeviation="0.7" /></filter>
        <filter id="glassBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.7" /></filter>
        <filter id="vapor" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <linearGradient id="strFadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="37.5" x2="0" y2="42.5">
          <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="strFade" maskUnits="userSpaceOnUse" x="90" y="0" width="40" height="48">
          <rect x="90" y="0" width="40" height="37.5" fill="#fff" />
          <rect x="90" y="37.5" width="40" height="5" fill="url(#strFadeGrad)" />
        </mask>
        <linearGradient id="botFadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="33" x2="0" y2="40">
          <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="bottomFade" maskUnits="userSpaceOnUse" x="90" y="0" width="40" height="48">
          <rect x="90" y="0" width="40" height="33" fill="#fff" />
          <rect x="90" y="33" width="40" height="7" fill="url(#botFadeGrad)" />
        </mask>
        <clipPath id="bladeClip">
          <path d="M100.6,5.0 C99.9,3.7 100.7,2.6 102.0,2.55 C102.8,2.52 103.3,3.0 103.5,3.8 C103.7,4.5 103.9,5.1 104.7,4.95 C105.8,4.6 107.0,4.7 108.2,5.7 C109.6,6.9 110.6,8.0 111.0,10.5 C111.3,13.5 111.2,16.5 111.0,19.5 C110.8,23.0 110.6,27.0 110.0,30.5 C109.5,32.8 108.7,34.6 107.8,36.4 C107.1,37.8 106.2,39.0 105.4,40.2 C105.1,40.6 104.2,40.6 103.9,40.2 C103.4,39.2 103.2,38.0 102.9,36.6 C102.5,34.8 102.6,33.4 102.1,30.8 C101.5,27.4 101.0,23.8 100.9,20.4 C100.8,16.9 101.0,13.8 101.6,11.4 C101.0,9.0 100.2,7.2 100.6,5.0 Z" />
        </clipPath>
      </defs>

      {/* tilt 15deg to the right + smaller, pivoting at the nut */}
      <g transform="translate(106 37) scale(0.74) rotate(15) translate(-106 -37)">

      {/* soft ambient halo — dissolves the headstock into the surrounding space */}
      <ellipse cx="107" cy="20" rx="21" ry="27" fill="url(#aura)" filter="url(#vapor)" />

      {/* glass guitar headstock silhouette (swept tip), thin minimal border */}
      <path
        d="M100.6,5.0 C99.9,3.7 100.7,2.6 102.0,2.55 C102.8,2.52 103.3,3.0 103.5,3.8 C103.7,4.5 103.9,5.1 104.7,4.95 C105.8,4.6 107.0,4.7 108.2,5.7 C109.6,6.9 110.6,8.0 111.0,10.5 C111.3,13.5 111.2,16.5 111.0,19.5 C110.8,23.0 110.6,27.0 110.0,30.5 C109.5,32.8 108.7,34.6 107.8,36.4 C107.1,37.8 106.2,39.0 105.4,40.2 C105.1,40.6 104.2,40.6 103.9,40.2 C103.4,39.2 103.2,38.0 102.9,36.6 C102.5,34.8 102.6,33.4 102.1,30.8 C101.5,27.4 101.0,23.8 100.9,20.4 C100.8,16.9 101.0,13.8 101.6,11.4 C101.0,9.0 100.2,7.2 100.6,5.0 Z"
        fill="url(#glass)" stroke="rgba(210,226,255,0.45)" strokeWidth={0.22} strokeLinejoin="round"
      />
      {/* living silk border — a gentle breathing glow */}
      <path
        d="M100.6,5.0 C99.9,3.7 100.7,2.6 102.0,2.55 C102.8,2.52 103.3,3.0 103.5,3.8 C103.7,4.5 103.9,5.1 104.7,4.95 C105.8,4.6 107.0,4.7 108.2,5.7 C109.6,6.9 110.6,8.0 111.0,10.5 C111.3,13.5 111.2,16.5 111.0,19.5 C110.8,23.0 110.6,27.0 110.0,30.5 C109.5,32.8 108.7,34.6 107.8,36.4 C107.1,37.8 106.2,39.0 105.4,40.2 C105.1,40.6 104.2,40.6 103.9,40.2 C103.4,39.2 103.2,38.0 102.9,36.6 C102.5,34.8 102.6,33.4 102.1,30.8 C101.5,27.4 101.0,23.8 100.9,20.4 C100.8,16.9 101.0,13.8 101.6,11.4 C101.0,9.0 100.2,7.2 100.6,5.0 Z"
        fill="none" stroke="rgba(205,222,255,0.5)" strokeWidth={0.42} strokeLinejoin="round" filter="url(#strGlow)"
      >
        <animate attributeName="opacity" values="0.28;0.6;0.28" dur="6.5s" repeatCount="indefinite"
          calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
      </path>
      {/* living silk border — a soft glint sliding slowly around */}
      <path
        d="M100.6,5.0 C99.9,3.7 100.7,2.6 102.0,2.55 C102.8,2.52 103.3,3.0 103.5,3.8 C103.7,4.5 103.9,5.1 104.7,4.95 C105.8,4.6 107.0,4.7 108.2,5.7 C109.6,6.9 110.6,8.0 111.0,10.5 C111.3,13.5 111.2,16.5 111.0,19.5 C110.8,23.0 110.6,27.0 110.0,30.5 C109.5,32.8 108.7,34.6 107.8,36.4 C107.1,37.8 106.2,39.0 105.4,40.2 C105.1,40.6 104.2,40.6 103.9,40.2 C103.4,39.2 103.2,38.0 102.9,36.6 C102.5,34.8 102.6,33.4 102.1,30.8 C101.5,27.4 101.0,23.8 100.9,20.4 C100.8,16.9 101.0,13.8 101.6,11.4 C101.0,9.0 100.2,7.2 100.6,5.0 Z"
        fill="none" pathLength={100} stroke="rgba(248,251,255,0.95)" strokeWidth={0.34} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="15 85" filter="url(#strGlow)" style={{ mixBlendMode: 'screen' }}
      >
        <animate attributeName="stroke-dashoffset" values="100;0" dur="10s" repeatCount="indefinite" />
      </path>
      {/* magical colored vapor inside the glass — soft, light, tinted to the hovered language */}
      <g clipPath="url(#bladeClip)">
        <ellipse cx="105.5" cy={vaporY} rx="11" ry="14" fill={vaporColor} opacity={activeLang ? 0.20 : 0} filter="url(#vapor)"
          style={{ transition: 'opacity 0.6s ease, fill 0.6s ease, cy 0.7s cubic-bezier(0.22,1,0.36,1)' }} />
        <ellipse cx="104" cy={vaporY - 4} rx="6.5" ry="9" fill={vaporColor} opacity={activeLang ? 0.13 : 0} filter="url(#vapor)"
          style={{ transition: 'opacity 0.75s ease, fill 0.75s ease, cy 0.85s cubic-bezier(0.22,1,0.36,1)' }} />
        <ellipse cx="105" cy={vaporY} rx="3" ry="4.5" fill={vaporCore} opacity={activeLang ? 0.28 : 0} filter="url(#glassBlur)"
          style={{ transition: 'opacity 0.55s ease, fill 0.55s ease, cy 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
      </g>
      {/* glass reflections, clipped inside the blade */}
      <g clipPath="url(#bladeClip)">
        <path d="M101.5,4 C100,9 99.6,18 100,26 L102.8,26 C102.4,18 102.8,9 104,4.5 Z" fill="rgba(255,255,255,0.16)" filter="url(#glassBlur)" />
        <path d="M104.5,3.5 C103.5,8 103.3,15 103.6,22 L104.6,22 C104.4,15 104.6,8 105.4,4 Z" fill="rgba(255,255,255,0.28)" />
        <ellipse cx="106" cy="11" rx="3.2" ry="5" fill="url(#gspot)" filter="url(#glassBlur)" />
        <path d="M112,30 C111,33 109,36 106,37 L114,37 C114,34 113.5,31 113,29 Z" fill="rgba(255,255,255,0.06)" filter="url(#glassBlur)" />
      </g>
      {/* very thin top-left edge catch */}
      <path d="M101,28 C99.9,23 99.9,15 100.9,10.5 C101.6,7.4 102.9,4.7 105,3.7"
        fill="none" stroke="rgba(235,244,255,0.55)" strokeWidth={0.16} strokeLinecap="round" />
      {/* frosted diamond etch */}
      <path d="M104,6.5 l0.8,1.2 -0.8,1.2 -0.8,-1.2 Z" fill="rgba(230,240,255,0.35)" />

      {/* invisible handoff marker (where strings meet the silk column) — measured live to pin the column */}
      <circle ref={handoffRef} cx="105" cy="40" r="0.01" fill="none" />

      {/* thin glowing strings to the pegs — captive in the frame, dancing, melting into the column at the border */}
      <g mask="url(#strFade)" strokeLinecap="round" fill="none">
        {SUPPORTED_LANGUAGES.map((l, i) => {
          const active = selectedLang === l.code || hoveredLang === l.code;
          return (
            <g key={l.code}>
              <animateTransform attributeName="transform" attributeType="XML" type="rotate"
                values={`${-SWAY[i].ang} 110 ${PEG_Y[i]}; ${SWAY[i].ang} 110 ${PEG_Y[i]}; ${-SWAY[i].ang} 110 ${PEG_Y[i]}`}
                dur={`${SWAY[i].dur}s`} begin={`${SWAY[i].begin}s`} repeatCount="indefinite"
                calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" />
              <path d={STRING_D[i]} stroke={LANGUAGE_MESH[l.code]} strokeWidth={active ? 0.75 : 0.34} opacity={active ? 0.55 : 0.22} filter="url(#strGlow)" />
              <path d={STRING_D[i]} stroke={active ? LANGUAGE_PASTEL[l.code] : LANGUAGE_MESH[l.code]} strokeWidth={active ? 0.26 : 0.16} opacity={active ? 1 : 0.72} />
            </g>
          );
        })}
      </g>

      {/* one interactive group per language / tuning peg (right side) */}
      {SUPPORTED_LANGUAGES.map((l, i) => {
        const active = selectedLang === l.code || hoveredLang === l.code;
        const dimmed = !!selectedLang && selectedLang !== l.code;
        const y = PEG_Y[i];
        const pastel = LANGUAGE_PASTEL[l.code];
        return (
          <g
            key={l.code}
            onMouseEnter={() => onHover(l.code)}
            onMouseLeave={onLeave}
            onClick={() => onSelect(l.code)}
            data-cursor="go"
            style={{ pointerEvents: 'auto', cursor: 'pointer', opacity: dimmed ? 0 : 1, transition: 'opacity 0.6s ease' }}
          >
            <g transform={`rotate(-15 110 ${y})`}>
              {active && <circle cx={KNOB_CX[i]} cy={y} r="3" fill={LANGUAGE_MESH[l.code]} opacity={0.4} filter="url(#pegGlow)" />}
              {/* horizontal glass machine-head: short slim rod + delicate smoked-glass button */}
              <rect x="110" y={y - 0.25} width={NECK_W[i]} height="0.5" rx="0.25" fill={active ? pastel : 'rgba(170,190,220,0.28)'} stroke="rgba(210,226,255,0.34)" strokeWidth={0.055} />
              <circle cx="109.6" cy={y} r={active ? 0.6 : 0.52} fill={active ? pastel : 'rgba(225,235,250,0.5)'} style={{ transition: 'all 0.4s ease' }} />
              <ellipse cx={KNOB_CX[i]} cy={y} rx={active ? 1.95 : 1.8} ry={active ? 0.82 : 0.74} fill={active ? pastel : 'url(#gknob)'} stroke="rgba(210,226,255,0.42)" strokeWidth={0.08} style={{ transition: 'all 0.4s ease' }} />
              <ellipse cx={KNOB_CX[i]} cy={y} rx={active ? 1.42 : 1.3} ry={active ? 0.5 : 0.45} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={0.045} />
              <ellipse cx={KNOB_CX[i] - 0.5} cy={y - 0.3} rx="0.6" ry="0.17" fill="rgba(255,255,255,0.55)" />
              <circle cx={KNOB_CX[i] + 0.82} cy={y + 0.16} r="0.11" fill="rgba(255,255,255,0.32)" />
              {/* label to the RIGHT, horizontal */}
              <text
                x="116" y={y + 0.85} textAnchor="start"
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
            </g>
            {/* invisible hit area covering tuner + label */}
            <rect x="108" y={y - 2.2} width="44" height="4.4" fill="transparent" style={{ pointerEvents: 'all' }} />
          </g>
        );
      })}
      </g>
    </svg>
  );
};

export const LinguisticPortal = () => {
  const { setLocale } = useIdentity();
  const { applyLanguageWorld } = useChromatic();
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);
  const [handoffY, setHandoffY] = useState<number>(0);
  const starColorRef = useRef<string>('#FFFFFF');
  const starHoverRef = useRef<number>(0);
  const audioLevelRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const shatterCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameId = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const lowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 4;

  const [entered, setEntered] = useState(false);
  const audioStarterRef = useRef<(() => void) | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);

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
    setSelectedLang(langCode);
    playMicroTone(langCode);
    applyLanguageWorld(langCode as any);

    const rect = containerRef.current?.getBoundingClientRect();
    const originX = rect ? rect.width / 2 : window.innerWidth / 2;
    const originY = rect ? rect.height / 2 : window.innerHeight / 2;

    if (lowEnd) {
      setTimeout(() => {
        setLocale(langCode as any);
        document.documentElement.setAttribute('lang', langCode);
        window.location.hash = '/app';
      }, SHATTER_DURATION * 0.7);
      return;
    }

    const canvas = shatterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const fragmentCount = isMobile ? SHATTER_MOBILE_FRAGMENTS : SHATTER_DESKTOP_FRAGMENTS;

    const fragments: { x: number; y: number; w: number; h: number; angle: number; tx: number; ty: number; scale: number; opacity: number }[] = [];
    for (let i = 0; i < fragmentCount; i++) {
      fragments.push({
        x: originX + (Math.random() - 0.5) * 200,
        y: originY + (Math.random() - 0.5) * 200,
        w: 30 + Math.random() * 50,
        h: 30 + Math.random() * 50,
        angle: Math.random() * Math.PI * 2,
        tx: (Math.random() - 0.5) * 800,
        ty: (Math.random() - 0.5) * 800,
        scale: 1,
        opacity: 1,
      });
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / SHATTER_DURATION, 1);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      fragments.forEach(f => {
        f.scale = 1 - progress * 0.8;
        f.opacity = 1 - progress;
        f.x += f.tx * 0.02;
        f.y += f.ty * 0.02;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.globalAlpha = f.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-f.w / 2 * f.scale, -f.h / 2 * f.scale, f.w * f.scale, f.h * f.scale);
        ctx.restore();
      });
      if (progress < 1) {
        animFrameId.current = requestAnimationFrame(animate);
      } else {
        setLocale(langCode as any);
        document.documentElement.setAttribute('lang', langCode);
        window.location.hash = '/app';
      }
    };
    animFrameId.current = requestAnimationFrame(animate);
  }, [selectedLang, setLocale, isMobile, lowEnd, playMicroTone, applyLanguageWorld]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');" }} />

      {/* The living starfield is always present — it backs both the welcome
          gate and the language portal so the transition feels continuous. */}
      <StarfieldCanvas colorRef={starColorRef} hoverRef={starHoverRef} audioRef={audioLevelRef} />
      <PortalCursor />

      {/* Cinematic entry curtain, shown on every load before the portal. */}
      {!entered && <WelcomeGate onEnter={handleEnter} />}

      {/* Language portal — fades in only after the user clicks Enter. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: entered ? 1 : 0,
          transition: 'opacity 1.2s ease',
          pointerEvents: entered ? 'auto' : 'none',
        }}
      >
      <PortalComposer />
      <LiquidSeam hoveredLang={hoveredLang} rightPx={375} width={140} handoffY={handoffY} downPct={20} />
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
          onHandoffY={setHandoffY}
        />
      )}
      </div>

      <canvas
        ref={shatterCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 100, opacity: selectedLang ? 1 : 0 }}
      />
    </div>
  );
};

export default LinguisticPortal;
