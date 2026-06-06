import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useAudio } from '../context/AudioContext';
import { Locale, ThemeId } from '../types';

interface LinguisticPortalProps {
  onLanguageSelect: (locale: Locale) => void;
  onTransitionComplete: () => void; // New prop for transition completion
  themeId?: ThemeId; // Optional themeId passed down or from context
}

const LinguisticPortal = ({ onLanguageSelect, onTransitionComplete, themeId = 'minimal' }: LinguisticPortalProps) => {
  const { playEnvironmentalSound } = useAudio();
  const [hovered, setHovered] = useState<Locale | null>(null);
  const [selected, setSelected] = useState<Locale | null>(null);
  const [isShattering, setShattering] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const shatterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetLightPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 15));
  const lastClickPosition = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Phase 3 (600-900ms): black void fills screen. MainApp fades in from opacity 0.
    if (isShattering) {
      const container = containerRef.current;
      if (container) {
        container.style.transition = "opacity 300ms ease-in 600ms";
        container.style.opacity = "0";
        setTimeout(() => {
          onTransitionComplete();
        }, 900);
      }
    }
  }, [isShattering, onTransitionComplete]);

  const languages: { locale: Locale; label: string; frequency: number }[] = [
    { locale: 'en', label: 'EN', frequency: 440 },
    { locale: 'es', label: 'ES', frequency: 528 },
    { locale: 'fr', label: 'FR', frequency: 396 },
    { locale: 'zh', label: 'ZH', frequency: 639 },
    { locale: 'ja', label: 'JA', frequency: 741 },
    { locale: 'ko', label: 'KO', frequency: 852 },
  ];

  // Three.js Starfield Background setup
  useEffect(() => {
    const canvas = threeCanvasRef.current;
    if (!canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#000000', 0.0008);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Ambient light: intensity 0.1
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);

    // Directional light: intensity 0.3, position [5, 3, 5]
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    // Point Light: Repositions toward hovered element (400ms lerp)
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
    pointLight.position.set(0, 0, 15);
    scene.add(pointLight);

    // Mouse tracker for particle physics drift
    const mouse = { x: 0, y: 0 };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 15,000 star particles via BufferGeometry Points
    const starsCount = 15000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      const radius = 500;
      positions[i] = (Math.random() - 0.5) * radius * 2;
      positions[i + 1] = (Math.random() - 0.5) * radius * 2;
      positions[i + 2] = (Math.random() - 0.5) * radius * 2;
    }

    const initialPositions = positions.slice();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
    });

    const starField = new THREE.Points(geometry, material);
    scene.add(starField);

    let animationFrameId: number;

    const animate = () => {
      // Slow Y-axis rotation: 0.00008 radians per frame
      starField.rotation.y += 0.00008;

      // Point light repositions toward target position (approx 400ms lerp at 60fps)
      pointLight.position.lerp(targetLightPosRef.current, 0.1);

      // Nearby particles drift toward cursor (physics-based)
      const mouse3D = new THREE.Vector3(mouse.x * 40, mouse.y * 20, 0);
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < starsCount; i++) {
        const idx = i * 3;
        const px = posArray[idx]!;
        const py = posArray[idx + 1]!;
        const pz = posArray[idx + 2]!;

        const dx = mouse3D.x - px;
        const dy = mouse3D.y - py;
        const dz = mouse3D.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < 400) {
          const dist = Math.sqrt(distSq);
          // Attraction force
          const force = (1.0 - dist / 20.0) * 0.12;
          posArray[idx] += dx * force;
          posArray[idx + 1] += dy * force;
          posArray[idx + 2] += dz * force;
        } else {
          // Slow recovery back to initial position
          const origX = initialPositions[idx]!;
          const origY = initialPositions[idx + 1]!;
          const origZ = initialPositions[idx + 2]!;
          posArray[idx] += (origX - px) * 0.02;
          posArray[idx + 1] += (origY - py) * 0.02;
          posArray[idx + 2] += (origZ - pz) * 0.02;
        }
      }
      posAttr.needsUpdate = true;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  const handleMouseEnter = (lang: typeof languages[0], i: number) => {
    setHovered(lang.locale);
    // Micro-tone hover ping: 50ms fade-in, max volume 0.08
    playEnvironmentalSound(lang.frequency, 150, 0.08);

    // Point light repositions toward hovered element (400ms lerp target)
    const centerOffset = i - 2.5;
    const x = centerOffset * 10;
    const y = -(centerOffset * centerOffset * 0.5);
    targetLightPosRef.current.set(x, y, 15);
  };

  const handleMouseLeave = () => {
    setHovered(null);
    // Return point light to center (400ms lerp target)
    targetLightPosRef.current.set(0, 0, 15);
  };

  const handlePillarClick = (lang: typeof languages[0]) => {
    if (selected) return;
    if (isMobile) {
      setHovered(lang.locale);
      // Mobile: tap activates hover state for 400ms then triggers selection
      setTimeout(() => {
        handleSelect(lang.locale);
      }, 400);
    } else {
      handleSelect(lang.locale);
    }
  };

  const handleSelect = (locale: Locale) => {
    if (selected) return;
    setSelected(locale);
    setShattering(true);
    onLanguageSelect(locale); // Immediately set locale in context

    // High-fidelity environmental select sound (Click Thud: 80Hz low thud)
    playEnvironmentalSound(80, 400, 0.15);

    const useLowEndFallback = navigator.hardwareConcurrency < 4; // Low-end fallback condition
    if (useLowEndFallback) {
      // Low-end fallback: CSS clip-path dissolve, canvas fades to black (600ms) with scale(1.05) push.
      const container = containerRef.current;
      if (container) {
        container.style.transition = "opacity 600ms ease-in, transform 600ms ease-out";
        container.style.opacity = "0";
        container.style.transform = "scale(1.05)";
        setTimeout(() => {
          onTransitionComplete();
        }, 600);
      }
      return;
    }

    // Phase 1 (0-200ms) & Phase 2 (200-600ms) trigger canvas shatter
    const canvas = shatterCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const width = (canvas.width = window.innerWidth);
        const height = (canvas.height = window.innerHeight);

        const fragments: {
          x1: number; y1: number;
          x2: number; y2: number;
          x3: number; y3: number;
          vx: number; vy: number;
          rotation: number;
          rotSpeed: number;
          scale: number;
          opacity: number;
        }[] = [];

        const count = isMobile ? 24 : 48;

        // Capture click position for explosion origin
        const clickX = lastClickPosition.current?.x ?? width / 2;
        const clickY = lastClickPosition.current?.y ?? height / 2;

        // Generate triangular fragments exploding from click/tap point
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
          const length = 50 + Math.random() * 150;

          fragments.push({
            x1: clickX,
            y1: clickY,
            x2: clickX + Math.cos(angle) * length,
            y2: clickY + Math.sin(angle) * length,
            x3: clickX + Math.cos(angle + 0.3) * length,
            y3: clickY + Math.sin(angle + 0.3) * length,
            vx: Math.cos(angle) * (5 + Math.random() * 15),
            vy: Math.sin(angle) * (5 + Math.random() * 15),
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.1,
            scale: 1,
            opacity: 1,
          });
        }

        let animationFrameId: number;
        const startTime = Date.now();

        const animate = () => {
          const elapsed = Date.now() - startTime;
          ctx.clearRect(0, 0, width, height);

          // Dark overlay fading in (Phase 3 visual)
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, (elapsed - 600) / 300)})`; // Fades in from 600ms to 900ms
          ctx.fillRect(0, 0, width, height);

          // Draw and update shards (Phase 2)
          fragments.forEach((f) => {
            f.x1 += f.vx; f.y1 += f.vy;
            f.x2 += f.vx; f.y2 += f.vy;
            f.x3 += f.vx; f.y3 += f.vy;
            f.rotation += f.rotSpeed;
            // Scale from 1 to 0 and fade from 1 to 0 after 200ms, complete by 600ms
            f.opacity = Math.max(0, 1 - (elapsed - 200) / 400); 
            f.scale = Math.max(0, 1 - (elapsed - 200) / 400);

            if (f.opacity > 0) {
              ctx.save();
              ctx.translate((f.x1 + f.x2 + f.x3) / 3, (f.y1 + f.y2 + f.y3) / 3);
              ctx.rotate(f.rotation);
              ctx.scale(f.scale, f.scale);

              ctx.beginPath();
              ctx.moveTo(f.x1 - (f.x1 + f.x2 + f.x3) / 3, f.y1 - (f.y1 + f.y2 + f.y3) / 3);
              ctx.lineTo(f.x2 - (f.x1 + f.x2 + f.x3) / 3, f.y2 - (f.y1 + f.y2 + f.y3) / 3);
              ctx.lineTo(f.x3 - (f.x1 + f.x2 + f.x3) / 3, f.y3 - (f.y1 + f.y2 + f.y3) / 3);
              ctx.closePath();

              ctx.strokeStyle = `rgba(212, 175, 55, ${f.opacity * 0.4})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();

              ctx.fillStyle = `rgba(212, 175, 55, ${f.opacity * 0.1})`;
              ctx.fill();

              ctx.restore();
            }
          });

          if (elapsed < 900) {
            animationFrameId = requestAnimationFrame(animate);
          } else {
            onTransitionComplete(); // Notify parent component when shatter is complete
          }
        };

        animate();

        return () => {
          cancelAnimationFrame(animationFrameId);
        };
      }
    }
  };

  const getLanguageButtonStyle = (tId: ThemeId): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      minWidth: isMobile ? '120px' : '150px',
      minHeight: '52px',
      letterSpacing: '0.15em',
      transition: 'all 200ms ease-out',
    };
    if (tId === 'minimal') {
      // MINIMAL: use semi‑transparent dark text (no opacity on element)
      return { ...baseStyle, color: 'rgba(10, 10, 8, 0.7)' };
    }
    // ONYX and CYBER: use opacity 0.4 as blueprint
    return { ...baseStyle, opacity: 0.4 };
  };

  const getHoverStyle = (tId: ThemeId): React.CSSProperties => {
    if (tId === 'minimal') {
      return { color: '#0A0A08', letterSpacing: '0.45em' };
    }
    return { opacity: 1, letterSpacing: '0.45em' };
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col justify-center items-center overflow-hidden select-none z-50 transition-all duration-900 ease-in-out"
      style={{ margin: 0, padding: 0, overflow: 'hidden' }}
    >
      <style>{`
        .linguistic-pillar {
          font-size: 9vw;
        }
        @media (min-width: 768px) {
          .linguistic-pillar {
            font-size: 6vw;
          }
        }
        @media (min-width: 1024px) {
          .linguistic-pillar {
            font-size: 3.5vw;
          }
        }
        @keyframes custom-pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.6; }
        }
        .center-pulsing-rule {
          animation: custom-pulse 3s ease-in-out infinite;
        }
      `}</style>

      {/* Cinematic Starfield Background using Three.js */}
      <canvas
        ref={threeCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: '100vw', height: '100vh', display: 'block', overflow: 'hidden' }}
      />

      <canvas ref={shatterCanvasRef} className="absolute inset-0 pointer-events-none z-10" />

      <div className="relative flex flex-col items-center max-w-5xl w-full px-4 z-20">
        {/* 6 language vertical floating pillars arrangement */}
        <div 
          className="grid grid-cols-2 md:grid-cols-6 gap-6 md:gap-12 w-full justify-items-center mb-16"
          style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
        >
          {languages.map((lang, i) => {
            const isHovered = hovered === lang.locale;
            const isSelected = selected === lang.locale;
            const isAnySelected = selected !== null;
            const isAnyHovered = hovered !== null;

            // Slight arc arrangement, staggered Z-axis depth
            const centerOffset = i - 2.5; // -2.5 to 2.5
            const translateY = centerOffset * centerOffset * 12; // curves outer down
            const translateZ = -Math.abs(centerOffset) * 20; // pushes outer back

            const baseStyle = getLanguageButtonStyle(themeId);
            const hoverStyle = getHoverStyle(themeId);

            let calculatedStyle: React.CSSProperties = { ...baseStyle };

            if (isSelected || isHovered) {
              calculatedStyle = { ...calculatedStyle, ...hoverStyle };
            } else if (isAnySelected) {
              calculatedStyle = { ...calculatedStyle, opacity: 0 };
            } else if (isAnyHovered) {
              calculatedStyle = { ...calculatedStyle, opacity: 0.15 };
            }

            const currentTransform = !isMobile 
              ? `translateY(${translateY}px) translateZ(${translateZ}px) ${isSelected ? "scale(2)" : isHovered ? "scale(1.1)" : ""}`
              : `${isSelected ? "scale(1.25)" : isHovered ? "scale(1.1)" : ""}`;

            calculatedStyle.transform = currentTransform;

            return (
              <button
                key={lang.locale}
                onClick={(e) => {
                  lastClickPosition.current = { x: e.clientX, y: e.clientY };
                  handlePillarClick(lang);
                }}
                onMouseEnter={() => !isMobile && handleMouseEnter(lang, i)}
                onMouseLeave={() => !isMobile && handleMouseLeave()}
                style={calculatedStyle}
                className={`linguistic-pillar text-center font-display transform outline-none border-b border-transparent ${
                  isSelected || isHovered ? "text-accent border-accent" : "text-text"
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>

        {/* Center element with ACE monogram and horizontal rule */}
        <div className="flex flex-col items-center justify-center w-full mt-12 z-20">
          {/* ACE monogram: 32px, wide tracking, above center rule */}
          <div 
            className="text-accent font-display font-semibold mb-3 tracking-[0.3em] text-center"
            style={{ fontSize: '32px' }}
          >
            ACE
          </div>
          {/* Center line element: thin 1px horizontal rule, 60% width, pulsing opacity (0.2 to 0.6, 3s ease-in-out infinite) */}
          <div 
            className="h-[1px] bg-accent center-pulsing-rule" 
            style={{ width: '60%' }} 
          />
        </div>
      </div>
    </div>
  );
};

export default LinguisticPortal;
