import { useRef, useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { Locale } from '../types';

interface LinguisticPortalProps {
  onLanguageSelect: (locale: Locale) => void;
}

const LinguisticPortal = ({ onLanguageSelect }: LinguisticPortalProps) => {
  const { playEnvironmentalSound } = useAudio();
  const [hovered, setHovered] = useState<Locale | null>(null);
  const [selected, setSelected] = useState<Locale | null>(null);
  const [, setShattering] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const languages: { locale: Locale; label: string; frequency: number }[] = [
    { locale: 'en', label: 'ENGLISH', frequency: 440 },
    { locale: 'es', label: 'ESPAÑOL', frequency: 528 },
    { locale: 'fr', label: 'FRANÇAIS', frequency: 396 },
    { locale: 'zh', label: '中文', frequency: 639 },
    { locale: 'ja', label: '日本語', frequency: 741 },
    { locale: 'ko', label: '한국어', frequency: 852 },
  ];

  const handleMouseEnter = (lang: typeof languages[0]) => {
    setHovered(lang.locale);
    // Micro-tone hover ping: 50ms fade-in, max volume 0.08
    playEnvironmentalSound(lang.frequency, 150, 0.08);
  };

  const handleSelect = (locale: Locale) => {
    if (selected) return;
    setSelected(locale);
    setShattering(true);

    // High-fidelity environmental select sound (Click Thud: 80Hz low thud)
    playEnvironmentalSound(80, 400, 0.15);

    // Phase 1 (0-200ms) & Phase 2 (200-600ms) trigger canvas shatter
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

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

        const isMobile = window.innerWidth < 768;
        const count = isMobile ? 24 : 48;

        // Generate triangular fragments exploding from center
        for (let i = 0; i < count; i++) {
          const cx = width / 2;
          const cy = height / 2;
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
          const length = 50 + Math.random() * 150;

          fragments.push({
            x1: cx,
            y1: cy,
            x2: cx + Math.cos(angle) * length,
            y2: cy + Math.sin(angle) * length,
            x3: cx + Math.cos(angle + 0.3) * length,
            y3: cy + Math.sin(angle + 0.3) * length,
            vx: Math.cos(angle) * (5 + Math.random() * 15),
            vy: Math.sin(angle) * (5 + Math.random() * 15),
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.1,
            scale: 1,
            opacity: 1,
          });
        }

        let animationFrameId: number;
        let startTime = Date.now();

        const animate = () => {
          const elapsed = Date.now() - startTime;
          ctx.clearRect(0, 0, width, height);

          // Dark overlay fading in
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, elapsed / 800)})`;
          ctx.fillRect(0, 0, width, height);

          // Draw and update shards
          fragments.forEach((f) => {
            f.x1 += f.vx; f.y1 += f.vy;
            f.x2 += f.vx; f.y2 += f.vy;
            f.x3 += f.vx; f.y3 += f.vy;
            f.rotation += f.rotSpeed;
            f.opacity = Math.max(0, 1 - (elapsed - 200) / 400); // fade after 200ms
            f.scale = Math.max(0, 1 - (elapsed - 200) / 600);

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
          }
        };

        animate();

        return () => {
          cancelAnimationFrame(animationFrameId);
        };
      }
    }

    // Phase 3 (600-900ms): Execute selection callback
    setTimeout(() => {
      onLanguageSelect(locale);
    }, 900);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col justify-center items-center overflow-hidden select-none z-50 transition-all duration-900 ease-in-out"
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />

      {/* Cinematic Starfield Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
      </div>

      <div className="relative flex flex-col items-center max-w-4xl w-full px-4 z-20">
        {/* Monogram/Logo Header */}
        <div className="text-accent font-mono text-sm tracking-[0.25em] mb-12 animate-pulse">
          ACE-2026
        </div>

        {/* 6 language vertical floating pillars arrangement */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-12 w-full justify-items-center mb-16">
          {languages.map((lang) => {
            const isHovered = hovered === lang.locale;
            const isSelected = selected === lang.locale;
            const isAnySelected = selected !== null;

            return (
              <button
                key={lang.locale}
                onClick={() => handleSelect(lang.locale)}
                onMouseEnter={() => handleMouseEnter(lang)}
                onMouseLeave={() => setHovered(null)}
                style={{ minWidth: '150px', minHeight: '52px' }}
                className={`text-center font-display text-2xl md:text-3xl transition-all duration-600 transform outline-none border-b border-transparent ${
                  isSelected
                    ? 'text-accent border-accent tracking-[0.45em] scale-150 opacity-100'
                    : isAnySelected
                    ? 'opacity-0 scale-50 translate-y-[-20px]'
                    : isHovered
                    ? 'text-accent border-accent tracking-[0.3em] scale-110 opacity-100'
                    : 'text-text opacity-40 hover:opacity-100 tracking-wide'
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>

        {/* Center line element */}
        <div className="w-2/3 h-[1px] bg-accent/20 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/60 to-transparent animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default LinguisticPortal;
