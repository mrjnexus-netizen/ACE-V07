import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useIdentity } from '../context/IdentityContext';

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'ENGLISH' },
  { code: 'es', label: 'ESPAÑOL' },
  { code: 'fr', label: 'FRANÇAIS' },
  { code: 'zh', label: '\u4e2d\u6587' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e' },
  { code: 'ko', label: '\ud55c\uad6d\uc5b4' },
] as const;

const MICRO_TONES: Record<string, number> = {
  en: 440,
  es: 528,
  fr: 396,
  zh: 639,
  ja: 741,
  ko: 852,
};

const SHATTER_DURATION = 900;
const SHATTER_DESKTOP_FRAGMENTS = 48;
const SHATTER_MOBILE_FRAGMENTS = 24;

const Starfield = () => {
  const meshRef = useRef<THREE.Points>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 5);
  }, [camera]);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.00008;
    }
  });

  const geometry = useMemo(() => {
    const count = 15000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={`
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 1.5;
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          void main() {
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, (1.0 - d * 2.0) * 0.8);
          }
        `}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const StarfieldCanvas = () => (
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
    <Starfield />
  </Canvas>
);

export const LinguisticPortal = () => {
  const { setLocale } = useIdentity();
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shatterCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameId = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const lowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 4;

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

  const handleLanguageSelect = useCallback((langCode: string) => {
    if (selectedLang) return;
    setSelectedLang(langCode);
    playMicroTone(langCode);

    const rect = containerRef.current?.getBoundingClientRect();
    const originX = rect ? rect.width / 2 : window.innerWidth / 2;
    const originY = rect ? rect.height / 2 : window.innerHeight / 2;

    if (lowEnd) {
      setTimeout(() => {
        setLocale(langCode as any);
        localStorage.setItem('ace-locale', langCode);
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
        localStorage.setItem('ace-locale', langCode);
        document.documentElement.setAttribute('lang', langCode);
        window.location.hash = '/app';
      }
    };

    animFrameId.current = requestAnimationFrame(animate);
  }, [selectedLang, setLocale, isMobile, lowEnd, playMicroTone]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black overflow-hidden">
      <StarfieldCanvas />

      <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-center">
        <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-6'} gap-6 md:gap-12 p-8`}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className={`
                font-display text-white/40 hover:text-white/100
                transition-all duration-300 ease-out
                ${isMobile ? 'text-6xl' : 'text-[3.5vw]'}
                tracking-[0.15em] hover:tracking-[0.45em]
                min-h-[52px] min-w-[52px] flex items-center justify-center
                ${selectedLang === lang.code ? 'scale-200 opacity-100' : ''}
                ${selectedLang && selectedLang !== lang.code ? 'opacity-0 translate-y-[-20px]' : ''}
              `}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[32px] font-mono tracking-[0.15em] text-white/50">ACE</div>
        <div className="w-3/5 h-px bg-white/20 mt-2 animate-pulse" style={{ animationDuration: '3s' }} />
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