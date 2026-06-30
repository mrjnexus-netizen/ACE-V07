// ============================================================
// ACE-2026 — LivingScore (S5.5 · Reactive Orb)
// A single global, fixed 3D layer behind all content. A calm sphere
// of fine particles that BREATHES with the music's beat (bass pulse),
// is drawn toward the cursor (particles lean toward the mouse), and
// sits inside a slow golden ring. The camera does a subtle parallax
// drift toward the cursor for depth. Genre sets the colour.
//
// Design philosophy taken from the client's reference: calm, cinematic,
// mouse-aware — NOT a turbulent flow. Motion is gentle; the music adds
// a pulse on the beat rather than constant agitation.
//
// Architecture:
//   - Fixed, pointer-events:none layer behind content.
//   - Audio via useAudioReactive, applied in useFrame through refs.
//   - Particles keep a base sphere position; each frame they're displaced
//     by (a) a slow wavy noise, (b) a beat pulse (bass), (c) a pull toward
//     the cursor's projected position. Cheap, smooth, never "locks".
//   - Camera parallax eases toward the cursor; the ring counter-rotates.
//   - Genre → colour. Honors reduced motion + perf guard.
// ============================================================

import { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useWebGLRecovery } from '../three/core/useWebGLRecovery';
import * as THREE from 'three';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { usePerformanceGuard } from '../lib/performanceGuard';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  attribute float aScale;
  varying float vGlow;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = aScale * (1.0 + uPulse * 1.2) * 70.0 / -mv.z;
    gl_PointSize = clamp(size, 0.6, 5.0);
    vGlow = uPulse;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vGlow;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.14, d);
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    float intensity = core * 1.0 + halo * 0.55;
    vec3 col = mix(uColor, vec3(1.0), core * (0.2 + clamp(vGlow, 0.0, 1.0) * 0.5));
    gl_FragColor = vec4(col, intensity * uOpacity);
  }
`;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const readDynamicAccent = (): string | null => {
  const dyn = getComputedStyle(document.documentElement)
    .getPropertyValue('--dynamic-accent')
    .trim();
  return dyn || null;
};

// The orb's primary colour follows the ACTIVE LANGUAGE accent (per-language
// world), read live each frame so switching language recolours the sphere.
const readAccentColor = (): string | null => {
  const a = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-color')
    .trim();
  return a || null;
};

const isLightSurface = (): boolean => {
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface-color')
    .trim();
  if (!surface) return false;
  try {
    const c = new THREE.Color(surface);
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.5;
  } catch {
    return false;
  }
};

const genreToIndex = (g: string | null): number => {
  if (!g) return 0;
  const s = g.toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  if (has('ambient', 'choral', 'piano', 'calm', 'meditat', 'drone', 'peace')) return 3;
  if (has('synth', 'electronic', 'game', 'gaming', '8-bit', '8 bit', 'arcade', 'edm', 'pixel', 'chip')) return 1;
  if (has('animation', 'cartoon', 'playful', 'comedy', 'quirky', 'uplifting', 'whimsical', 'fun')) return 2;
  return 0;
};

const PALETTE = ['#F3D77E', '#3DF0FF', '#FF49A3', '#6FA8FF']; // cinematic / gaming / animation / ambient
const paletteFor = (i: number) => PALETTE[i] ?? '#F3D77E';

// shared cursor (normalized -1..1), updated globally
const cursor = { x: 0, y: 0, tx: 0, ty: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener(
    'mousemove',
    (e) => {
      cursor.tx = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true },
  );
}

const Orb = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const { bassLevel, midLevel, highLevel } = useAudioReactive();
  const { audioState } = useAudio();
  const { themeId } = useChromatic();
  const { particleCount } = usePerformanceGuard();

  const audioRef = useRef({ bass: 0, mid: 0, high: 0 });
  audioRef.current.bass = bassLevel;
  audioRef.current.mid = midLevel;
  audioRef.current.high = highLevel;

  const playingRef = useRef(false);
  playingRef.current = audioState.isPlaying;

  const genre: string | null = audioState.currentTrack?.genre ?? null;
  const genreRef = useRef<string | null>(genre);
  useEffect(() => {
    genreRef.current = genre;
  }, [genre]);

  const reduced = useMemo(() => prefersReducedMotion(), []);
  const light = useMemo(() => isLightSurface(), [themeId]);

  const COUNT = useMemo(() => Math.round(Math.min(particleCount || 5000, 9000) * 0.5 * 0.7), [particleCount]);
  const R = 3.4;

  const { base, scales, sens } = useMemo(() => {
    const b = new Float32Array(COUNT * 3);
    const sc = new Float32Array(COUNT);
    const se = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      b[i * 3] = R * Math.sin(ph) * Math.cos(th);
      b[i * 3 + 1] = R * Math.sin(ph) * Math.sin(th);
      b[i * 3 + 2] = R * Math.cos(ph);
      sc[i] = 0.5 + Math.random() * 0.8;
      // 7 smooth sensitivity tiers → richer, softer, more cinematic layering
      const tier = Math.floor(Math.random() * 7); // 0..6
      se[i] = 0.2 + (tier / 6) * 0.9; // 0.2 .. 1.1 across seven steps
    }
    return { base: b, scales: sc, sens: se };
  }, [COUNT]);

  // live positions (mutated each frame)
  const live = useMemo(() => new Float32Array(base), [base]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColor: { value: new THREE.Color(readAccentColor() || paletteFor(genreToIndex(genreRef.current))) },
      uOpacity: { value: 0.6 },
    }),
    [],
  );

  const ringColor = useMemo(() => new THREE.Color(readAccentColor() || paletteFor(genreToIndex(genreRef.current))), []);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const env = useRef({ pulse: 0, avg: 0, mx: 0, my: 0 });

  useFrame((three, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const geo = pts.geometry;
    const mat = pts.material as THREE.ShaderMaterial;
    const u = mat.uniforms;
    const t = three.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    u.uTime.value = t;

    const playing = playingRef.current;
    const a = audioRef.current;
    // Instantaneous loudness across the whole spectrum.
    const loud = playing ? a.bass * 0.5 + a.mid * 1.0 + a.high * 0.9 : 0;
    const mid = playing ? Math.min(1, a.mid * 1.6) : 0;
    const motion = reduced ? 0.25 : 1;

    const e = env.current;
    // Keep a slow running average. The PULSE is how far the instantaneous
    // loudness rises ABOVE that average — so every note pops and it falls back
    // to ~0 between notes even when the overall level stays high.
    e.avg += (loud - e.avg) * 0.12;
    const over = loud - e.avg;
    // Strong, sensitive response to every note; both rises AND dips drive it.
    const target = Math.min(1, Math.abs(over) * 9.0 + loud * 0.25);
    // Responsive attack so it dances, eased release so it's not jittery.
    e.pulse += (target - e.pulse) * (target > e.pulse ? 0.6 : 0.18);
    u.uPulse.value = e.pulse;

    // ease cursor
    cursor.x += (cursor.tx - cursor.x) * 0.06;
    cursor.y += (cursor.ty - cursor.y) * 0.06;

    // Cursor target in world-ish space (where particles lean toward).
    const cxWorld = cursor.x * 3.2;
    const cyWorld = cursor.y * 2.2;

    const arr = live;
    const pulseScale = 1 + e.pulse * 0.16; // swell stays inside the rings
    const waveAmt = (reduced ? 0.02 : 0.06) + e.pulse * 0.14;
    const wob = t * (reduced ? 0.3 : 1.1); // lively

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      const bx = base[ix]!;
      const by = base[ix + 1]!;
      const bz = base[ix + 2]!;
      const sv = sens[i]!; // this particle's audio sensitivity (0.3 / 0.5 / 1.0)

      // radial breathing (whole-orb swell), scaled by this particle's sensitivity
      const wv =
        Math.sin(wob + bx * 1.4 + by * 1.1) *
        Math.cos(wob * 0.8 + bz * 1.2) *
        waveAmt * sv;
      const s = 1 + (pulseScale - 1) * sv + wv;

      let x = bx * s;
      let y = by * s;
      let z = bz * s;

      // per-particle dance, also scaled by sensitivity → layered, cinematic motion
      const danceAmt = (0.03 + e.pulse * 0.32 * sv) * motion;
      x += Math.sin(wob * 0.8 + bx * 2.0 + by * 1.3) * danceAmt;
      y += Math.cos(wob * 0.7 + by * 2.0 + bz * 1.3) * danceAmt;
      z += Math.sin(wob * 0.9 + bz * 2.0 + bx * 1.3) * danceAmt;

      // particles lean toward the cursor (stronger near the front, z>0)
      const lean = (0.18 + mid * 0.25) * motion * (0.5 + (bz + R) / (2 * R) * 0.5);
      x += (cxWorld - x) * lean * dt * 2.0;
      y += (cyWorld - y) * lean * dt * 2.0;

      arr[ix] = x;
      arr[ix + 1] = y;
      arr[ix + 2] = z;
    }
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;

    // colour: saturated genre hue, cover art nudges ~25%
    const dyn = readDynamicAccent();
    targetColor.set(readAccentColor() || paletteFor(genreToIndex(genreRef.current)));
    if (dyn) {
      try {
        targetColor.lerp(new THREE.Color(dyn), 0.25);
      } catch {
        /* keep hue */
      }
    }
    u.uColor.value.lerp(targetColor, 0.08);
    ringColor.lerp(targetColor, 0.08);
    u.uOpacity.value = (light ? 0.62 : 0.55) + e.pulse * 0.4;

    // group: very slow living orientation (no fast spin)
    const g = groupRef.current;
    if (g) {
      g.rotation.y = Math.sin(t * 0.06) * 0.35 + cursor.x * 0.25;
      g.rotation.x = Math.sin(t * 0.045) * 0.15 - cursor.y * 0.2;
    }

    // rings: slow rotation + cursor-driven tilt ONLY (not audio-reactive),
    // steady opacity so they read as a calm frame around the beating orb.
    const ring = ringRef.current;
    if (ring) {
      ring.rotation.z += dt * 0.15;
      ring.rotation.x += (Math.PI / 2.2 + cursor.y * 0.6 - ring.rotation.x) * 0.05;
      ring.rotation.y += (cursor.x * 0.6 - ring.rotation.y) * 0.05;
      const rm = ring.material as THREE.MeshBasicMaterial;
      rm.color.copy(ringColor);
      rm.opacity = 0.3;
    }
    const ring2 = ring2Ref.current;
    if (ring2) {
      ring2.rotation.z -= dt * 0.22;
      ring2.rotation.x += (Math.PI / 1.7 - cursor.y * 0.7 - ring2.rotation.x) * 0.05;
      ring2.rotation.y += (0.5 - cursor.x * 0.7 - ring2.rotation.y) * 0.05;
      const rm2 = ring2.material as THREE.MeshBasicMaterial;
      rm2.color.copy(ringColor);
      rm2.opacity = 0.18;
    }

    // CAMERA: gentle parallax toward the cursor only. Fixed depth — the orb is
    // a heartbeat glowing inside a steady frame, the camera never pushes in/out.
    const camTargetX = cursor.x * 0.8;
    const camTargetY = cursor.y * 0.5;
    camera.position.x += (camTargetX - camera.position.x) * 0.04;
    camera.position.y += (camTargetY - camera.position.y) * 0.04;
    camera.position.z += (9.2 - camera.position.z) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[live, 3]} />
          <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
        />
      </points>

      {/* slow golden rings for depth (two, crossed, counter-rotating) */}
      <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[5.2, 0.009, 8, 220]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.3} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 1.7, 0.5, 0]}>
        <torusGeometry args={[4.9, 0.006, 8, 200]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.18} />
      </mesh>
    </group>
  );
};

const LivingScore = () => {
  const { canvasKey, onCreated } = useWebGLRecovery();
  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      <Suspense fallback={null}>
        <Canvas
          key={canvasKey}
          onCreated={onCreated}
          camera={{ position: [0, 0, 9.2], fov: 60 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent' }}
        >
          <Orb />
        </Canvas>
      </Suspense>
    </div>
  );
};

export default LivingScore;
