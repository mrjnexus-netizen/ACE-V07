import { useEffect, useRef } from 'react';

/**
 * ComposerDust — a living field of fine luxury light motes flowing in soft
 * vertical "currents" over the composer image, suspended in faint warm glow
 * ribbons that give depth. Reads as golden dust caught in stage light, NOT a
 * flat haze and NOT scattered cheap dots. Canvas 2D + additive blending,
 * masked to the image so it never bleeds onto the starfield.
 */

const COLORS = [
  { r: 242, g: 214, b: 140 },
  { r: 255, g: 253, b: 246 },
  { r: 210, g: 220, b: 236 },
];

const CURRENTS = 4;
const COUNT = 300;

interface Mote {
  bx: number; by: number; r: number; drift: number;
  amp: number; freq: number; phase: number;
  twPhase: number; twSpeed: number; kind: number; cur: number;
}

const ComposerDust = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const motes: Mote[] = [];
    for (let i = 0; i < COUNT; i++) {
      const seed = i * 12.9898 + 3.3;
      const rnd = (n: number) => {
        const s = Math.sin(seed * n) * 43758.5453;
        return s - Math.floor(s);
      };
      const cur = i % CURRENTS;
      const curCenter = 0.18 + cur * 0.21;
      const bx = curCenter + (rnd(2.2) - 0.5) * 0.07;
      const k = rnd(3.1);
      const kind = k > 0.90 ? 2 : k > 0.58 ? 1 : 0;
      motes.push({
        bx, by: rnd(2.3),
        r: 0.3 + Math.pow(rnd(4.4), 2) * 1.3,
        drift: 0.010 + rnd(5.5) * 0.020,
        amp: 0.012 + rnd(6.6) * 0.03,
        freq: 0.4 + rnd(7.7) * 0.9,
        phase: rnd(8.8) * Math.PI * 2,
        twPhase: rnd(9.9) * Math.PI * 2,
        twSpeed: 0.6 + rnd(10.1) * 1.8,
        kind, cur,
      });
    }

    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      for (let cur = 0; cur < CURRENTS; cur++) {
        const cxn = 0.18 + cur * 0.21;
        const sway = Math.sin(t * 0.12 + cur) * 0.02;
        const cx = (cxn + sway) * W;
        const bandW = W * 0.16;
        const wave = 0.6 + 0.4 * Math.sin(t * 0.3 + cur);
        const g = ctx.createLinearGradient(cx - bandW, 0, cx + bandW, 0);
        g.addColorStop(0, 'rgba(242,214,140,0)');
        g.addColorStop(0.5, `rgba(242,214,140,${0.05 * wave})`);
        g.addColorStop(1, 'rgba(242,214,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - bandW, 0, bandW * 2, H);
      }

      for (const m of motes) {
        const yN = ((m.by - t * m.drift) % 1 + 1) % 1;
        const x = (m.bx + Math.sin(yN * Math.PI * 2 * m.freq + m.phase) * m.amp) * W;
        const y = yN * H;
        const tw = 0.5 + 0.5 * Math.sin(t * m.twSpeed + m.twPhase);
        const alpha = (0.22 + 0.40 * tw) * (m.kind === 2 ? 0.6 : 1);
        const r = Math.max(1.1, m.r * 2.4);
        const c = COLORS[m.kind];
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
        grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${alpha})`);
        grad.addColorStop(0.45, `rgba(${c.r},${c.g},${c.b},${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
};

export default ComposerDust;
