import { useEffect, useRef } from 'react';

/**
 * LiquidSeam — the central woven SILK COLUMN of the language portal.
 * Six luminous strands, ONE PER LANGUAGE, in that language's soul color,
 * flowing down and dancing on a transparent canvas. Hovering a language
 * gently brightens its matching strand. Fine luminous dust drifts along them.
 */
interface LiquidSeamProps {
  rightPx?: number;
  width?: number;
  hoveredLang?: string | null;
}

type RGB = [number, number, number];
interface Pal { glow: RGB; mid: RGB; core: RGB }
interface Thread {
  lang: string; amp: number; freq: number; phase: number;
  speed: number; offset: number; lineW: number; bright: number; pal: Pal;
}

const PAL: Record<string, Pal> = {
  en: { glow: [243, 215, 126], mid: [247, 227, 162], core: [252, 244, 212] },
  es: { glow: [255, 154, 63], mid: [255, 182, 120], core: [255, 221, 190] },
  fr: { glow: [216, 194, 144], mid: [231, 217, 181], core: [245, 237, 214] },
  zh: { glow: [255, 90, 77], mid: [255, 140, 130], core: [255, 201, 194] },
  ja: { glow: [77, 139, 255], mid: [140, 180, 255], core: [200, 218, 255] },
  ko: { glow: [255, 111, 224], mid: [255, 160, 236], core: [255, 210, 246] },
};

const LiquidSeam = ({ rightPx = 375, width = 140, hoveredLang = null }: LiquidSeamProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const hoverRef = useRef<string | null>(hoveredLang);
  useEffect(() => { hoverRef.current = hoveredLang; }, [hoveredLang]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const threads: Thread[] = [
      { lang: 'en', amp: 0.090, freq: 0.0040, phase: 0.0, speed: 0.030,  offset: 0.39,  lineW: 1.8,  bright: 0.85, pal: PAL.en },
      { lang: 'es', amp: 0.100, freq: 0.0038, phase: 0.9, speed: 0.0285, offset: 0.435, lineW: 1.3,  bright: 0.70, pal: PAL.es },
      { lang: 'fr', amp: 0.085, freq: 0.0043, phase: 1.7, speed: 0.033,  offset: 0.48,  lineW: 1.0,  bright: 0.58, pal: PAL.fr },
      { lang: 'zh', amp: 0.105, freq: 0.0036, phase: 2.5, speed: 0.027,  offset: 0.525, lineW: 1.5,  bright: 0.78, pal: PAL.zh },
      { lang: 'ja', amp: 0.095, freq: 0.0041, phase: 3.3, speed: 0.031,  offset: 0.57,  lineW: 1.1,  bright: 0.64, pal: PAL.ja },
      { lang: 'ko', amp: 0.080, freq: 0.0037, phase: 4.1, speed: 0.029,  offset: 0.615, lineW: 0.85, bright: 0.54, pal: PAL.ko },
    ];

    const boosts = new Array(threads.length).fill(0);
    const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    const xAt = (th: Thread, y: number, t: number) => {
      const spread = Math.min(1, Math.max(0, y) / (H * 0.7));
      const off = 0.5 + (th.offset - 0.5) * spread;
      return (
        W * off +
        Math.sin(y * th.freq + t * th.speed + th.phase) * (W * th.amp) +
        Math.sin(y * th.freq * 0.4 - t * th.speed * 0.5 + th.phase) * (W * th.amp * 0.4)
      );
    };

    const strokeThread = (th: Thread, t: number, lineW: number, alpha: number, blur: number, col: RGB) => {
      ctx.beginPath();
      for (let y = -20; y <= H + 20; y += 5) {
        const x = xAt(th, y, t);
        if (y === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(col, alpha);
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.shadowColor = rgba(col, 0.9);
      ctx.shadowBlur = blur;
      ctx.stroke();
    };

    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      const hov = hoverRef.current;
      for (let i = 0; i < threads.length; i++) {
        const th = threads[i];
        const targetBoost = hov === th.lang ? 1 : 0;
        boosts[i] += (targetBoost - boosts[i]) * 0.08;
        const boost = boosts[i];
        const k = 1 + boost * 1.2;
        const b = th.bright;
        const pal = th.pal;
        strokeThread(th, t, th.lineW * 1.8 * (1 + boost * 0.3), 0.035 * b * k, 6 + boost * 4, pal.glow);
        strokeThread(th, t, th.lineW * 0.9, 0.15 * b * k, 4, pal.mid);
        strokeThread(th, t, th.lineW * 0.45 * (1 + boost * 0.2), Math.min(0.8, 0.40 * b * k), 2.5, pal.core);
      }

      for (let i = 0; i < 240; i++) {
        const seed = i * 53.13;
        const prog = (t * (0.0045 + (i % 5) * 0.0015) + (seed % 1)) % 1;
        const y = (1 - prog) * (H + 80) - 40;
        const th2 = threads[i % threads.length];
        const jitter = Math.sin(seed) * W * 0.09;
        const x = xAt(th2, y, t) + jitter;
        const r = 0.3 + 0.5 * Math.abs(Math.sin(seed * 1.7));
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
        const pal = th2.pal;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, rgba(pal.core, 0.5 * tw));
        g.addColorStop(0.4, rgba(pal.mid, 0.18 * tw));
        g.addColorStop(1, rgba(pal.glow, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{ right: `${rightPx}px`, width: `${width}px`, zIndex: 5 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default LiquidSeam;
