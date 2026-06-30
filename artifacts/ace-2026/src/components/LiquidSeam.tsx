import { useEffect, useRef } from 'react';

/**
 * LiquidSeam — the woven SILK STRINGS of the language portal.
 *
 * Six luminous strands, ONE PER LANGUAGE, each in that language's soul color.
 * Each strand is TIED to its crystal peg at the top, converges through the
 * guitar NUT, then flows straight down the page as a dancing silk column —
 * its horizontal sway CONSTRAINED to the width of the wooden neck, like a real
 * string between the nut walls. Hovering a language gently brightens its
 * matching strand. Fine luminous dust drifts up along the strands.
 *
 * Pin / nut geometry is passed in (in *screen pixels*) by the portal, so the
 * strands sit exactly on the photo's crystal knobs and neck.
 */
export interface SeamPin {
  x: number; // screen px — where the string ties on (post)
  y: number; // screen px — vertical center of the crystal knob
  lang: string;
}
interface LiquidSeamProps {
  pins?: SeamPin[];        // 6 pins in screen px (top→bottom = en..ko)
  nutX?: number;           // screen px — neck center X (string weave center below)
  nutY?: number;           // screen px — vertical position of the nut (transition)
  neckHalfW?: number;      // screen px — half the wooden-neck width (reference)
  weaveFrac?: number;      // 0..1 of viewport height where parallel→weave transition happens
  weaveAmp?: number;       // px — silk weave amplitude below the nut
  bandHalfW?: number;      // px — half-width the weave is allowed to fill (clamp)
  laneShift?: number;      // px — extra horizontal nudge of the lower run (− = left)
  hoveredLang?: string | null;
}

type RGB = [number, number, number];
interface Pal { glow: RGB; mid: RGB; core: RGB }
interface Thread {
  lang: string; amp: number; freq: number; phase: number;
  speed: number; lane: number; lineW: number; bright: number; pal: Pal;
}

const PAL: Record<string, Pal> = {
  en: { glow: [243, 215, 126], mid: [247, 227, 162], core: [252, 244, 212] },
  es: { glow: [255, 154, 63], mid: [255, 182, 120], core: [255, 221, 190] },
  fr: { glow: [216, 194, 144], mid: [231, 217, 181], core: [245, 237, 214] },
  zh: { glow: [255, 90, 77], mid: [255, 140, 130], core: [255, 201, 194] },
  ja: { glow: [77, 139, 255], mid: [140, 180, 255], core: [200, 218, 255] },
  ko: { glow: [255, 111, 224], mid: [255, 160, 236], core: [255, 210, 246] },
};

// Warm gold & cool silver for the separate right-hand ribbon.
const GOLD: RGB = [243, 215, 126];

// Per-thread motion — EXACT values & feel of the original silk column.
// `lane` = resting offset from the neck center, as a fraction of neckHalfW.
// Lanes stay well inside ±1 so the wave dances freely without hitting the wall.
const THREAD_DEF: Omit<Thread, 'pal'>[] = [
  { lang: 'en', amp: 0.135, freq: 0.0040, phase: 0.0, speed: 0.030,  lane: -0.42, lineW: 2.15, bright: 0.95 },
  { lang: 'es', amp: 0.150, freq: 0.0038, phase: 0.9, speed: 0.0285, lane: -0.25, lineW: 1.65, bright: 0.81 },
  { lang: 'fr', amp: 0.120, freq: 0.0043, phase: 1.7, speed: 0.033,  lane: -0.08, lineW: 1.35, bright: 0.70 },
  { lang: 'zh', amp: 0.155, freq: 0.0036, phase: 2.5, speed: 0.027,  lane:  0.08, lineW: 1.85, bright: 0.89 },
  { lang: 'ja', amp: 0.135, freq: 0.0041, phase: 3.3, speed: 0.031,  lane:  0.25, lineW: 1.45, bright: 0.76 },
  { lang: 'ko', amp: 0.115, freq: 0.0037, phase: 4.1, speed: 0.029,  lane:  0.15, lineW: 1.18, bright: 0.67 },
];

const LiquidSeam = ({
  pins,
  nutX,
  weaveFrac = 0.45,
  weaveAmp = 42,
  bandHalfW = 60,
  laneShift = 0,
  hoveredLang = null,
}: LiquidSeamProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const hoverRef = useRef<string | null>(hoveredLang);
  useEffect(() => { hoverRef.current = hoveredLang; }, [hoveredLang]);

  // geometry refs (screen px) so the animation loop always reads fresh values
  const pinsRef = useRef<SeamPin[] | undefined>(pins);
  const nutXRef = useRef<number | undefined>(nutX);
  const weaveFracRef = useRef<number>(weaveFrac);
  const weaveAmpRef = useRef<number>(weaveAmp);
  const bandRef = useRef<number>(bandHalfW);
  const laneShiftRef = useRef<number>(laneShift);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { nutXRef.current = nutX; }, [nutX]);
  useEffect(() => { weaveFracRef.current = weaveFrac; }, [weaveFrac]);
  useEffect(() => { weaveAmpRef.current = weaveAmp; }, [weaveAmp]);
  useEffect(() => { bandRef.current = bandHalfW; }, [bandHalfW]);
  useEffect(() => { laneShiftRef.current = laneShift; }, [laneShift]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;

    // Offscreen cached "luminous column": a soft vertical cylinder of light
    // behind the strands. Its SHAPE is constant, so we render it once per
    // resize and just blit it each frame with a gently breathing alpha — cheap.
    const colCanvas = document.createElement('canvas');
    const colCtx = colCanvas.getContext('2d');

    const buildColumn = () => {
      if (!colCtx) return;
      colCanvas.width = Math.max(1, Math.floor(W * dpr));
      colCanvas.height = Math.max(1, Math.floor(H * dpr));
      colCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colCtx.clearRect(0, 0, W, H);

      const ps = pinsRef.current;
      const band = bandRef.current;
      // column center & width derived from the strand lanes
      let lo: number, hi: number, topY: number;
      if (ps && ps.length) {
        const lx = ps.map((p) => p.x);
        const ly = ps.map((p) => p.y);
        const minX = Math.min(...lx), maxX = Math.max(...lx);
        const sp = (maxX - minX) * 1.0;
        const meanX = lx.reduce((a, b) => a + b, 0) / lx.length;
        lo = meanX - sp / 2 - band * 0.6;
        hi = meanX + sp / 2 + band * 0.6;
        topY = Math.max(...ly);
      } else {
        lo = W * 0.6; hi = W * 0.74; topY = H * 0.18;
      }
      const colMid = (lo + hi) / 2 + W * 0.012; // nudge a touch right (trim left spill)
      const colW = (hi - lo) / 2; // half-width

      // Soft dreamy column of light. We draw simple vertical bands into the
      // offscreen and lean on a heavy gaussian blur to make them melt at every
      // edge — no hard rectangle edges, no blown-out blob. Two passes:
      //   1) a very WIDE, very faint warm wash so the empty lower screen never
      //      reads as cold black,
      //   2) a brighter, sustained CORE column right behind the strands.
      const gold: RGB = [240, 222, 175];

      // 1) wide ambient warm wash (fills the dark bottom gently). Kept very low
      //    alpha because it is blitted with 'lighter' (additive) — this glows
      //    softly over black without ever blowing out to white.
      const washW = Math.max(40, colW * 2.4);
      const wg = colCtx.createLinearGradient(0, topY, 0, H);
      wg.addColorStop(0.0, `rgba(${gold[0]},${gold[1]},${gold[2]},0)`);
      wg.addColorStop(0.10, `rgba(${gold[0]},${gold[1]},${gold[2]},0.07)`);
      wg.addColorStop(0.55, `rgba(${gold[0]},${gold[1]},${gold[2]},0.06)`);
      wg.addColorStop(0.85, `rgba(${gold[0]},${gold[1]},${gold[2]},0.03)`);
      wg.addColorStop(1.0, `rgba(${gold[0]},${gold[1]},${gold[2]},0)`);
      colCtx.save();
      colCtx.filter = 'blur(40px)';
      colCtx.fillStyle = wg;
      colCtx.fillRect(colMid - washW, topY, washW * 2, H - topY);
      colCtx.restore();

      // 2) brighter sustained core column behind the strands.
      const vg = colCtx.createLinearGradient(0, topY, 0, H);
      vg.addColorStop(0.0, `rgba(${gold[0]},${gold[1]},${gold[2]},0)`);
      vg.addColorStop(0.06, `rgba(${gold[0]},${gold[1]},${gold[2]},0.30)`);
      vg.addColorStop(0.32, `rgba(${gold[0]},${gold[1]},${gold[2]},0.28)`);
      vg.addColorStop(0.62, `rgba(${gold[0]},${gold[1]},${gold[2]},0.15)`);
      vg.addColorStop(0.86, `rgba(${gold[0]},${gold[1]},${gold[2]},0.06)`);
      vg.addColorStop(1.0, `rgba(${gold[0]},${gold[1]},${gold[2]},0)`);
      colCtx.save();
      colCtx.filter = 'blur(26px)'; // melt every edge → dreamy, no hard sides
      colCtx.fillStyle = vg;
      // a wider core band; the blur spreads it into a soft cylinder of light
      const coreHalf = Math.max(14, colW * 0.72);
      colCtx.fillRect(colMid - coreHalf, topY, coreHalf * 2, H - topY);
      colCtx.restore();
    };

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildColumn();
    };
    resize();
    window.addEventListener('resize', resize);

    const threads: Thread[] = THREAD_DEF.map((d) => ({ ...d, pal: PAL[d.lang] }));
    const boosts = new Array(threads.length).fill(0);
    const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    // Fallback geometry if the portal hasn't measured the pegs yet.
    const fallbackPinX = (i: number) => W * 0.70 + i * (W * 0.004);
    const fallbackPinY = (i: number) => H * (0.10 + i * 0.06);

    // Build evenly-spread parallel lanes for the lower run so the strands —
    // which start bunched together on the headstock — open out into clean,
    // evenly-spaced parallel lines as they fall. Lane spacing is derived from
    // the spread of the pegs themselves, then widened a touch.
    let laneTargets: number[] = threads.map((_, i) => W * 0.6 + i * 14);
    let clampCenter = 0;          // neck center (px) for the inside-the-neck wall
    let clampHalf = Infinity;     // half-width of that wall (px)
    const rebuildLanes = () => {
      const ps = pinsRef.current;
      const n = threads.length;
      if (!ps || ps.length < n) return;
      const xs = ps.map((p) => p.x);
      const mean = xs.reduce((a, b) => a + b, 0) / n;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const pinSpan = maxX - minX;
      const spread = pinSpan * 0.9; // narrower fan → strands sit well inside the neck
      const step = spread / (n - 1);
      // Center the lower run on the NECK center (the nut), not the right-skewed
      // peg cluster, so the strings fall straight down the middle of the neck
      // (the tops stay tied to the pegs via the ease). laneShift = fine nudge.
      const center = (nutXRef.current ?? mean) + laneShiftRef.current;
      const startX = center - spread / 2;
      laneTargets = threads.map((_, i) => startX + i * step);
      // Hard wall: no strand (lane + sway) may cross outside the neck edge.
      // 0.7×pinSpan sits just inside the engraved fretboard at its narrowest.
      clampCenter = center;
      clampHalf = pinSpan * 0.72;
    };
    rebuildLanes();

    // Strands open from their bunched pegs into evenly-spread PARALLEL lanes,
    // then drift down with a soft, dreamy silk sway — no convergence, no knot.
    const strandX = (i: number, th: Thread, y: number, t: number) => {
      const p = pinsRef.current?.[i];
      const px = p ? p.x : fallbackPinX(i);
      const py = p ? p.y : fallbackPinY(i);
      const nutY = weaveFracRef.current * H;
      const band = bandRef.current; // max sway each strand may travel from its lane

      if (y <= py) return px;

      // ease from the peg's X to its spread parallel lane over the upper run
      const ramp = Math.min(1, Math.max(0, (y - py) / Math.max(1, nutY - py)));
      const e = ramp * ramp * (3 - 2 * ramp);
      const lane = px + (laneTargets[i] - px) * e;
      const amp = weaveAmpRef.current;
      const sway =
        (Math.sin(y * th.freq + t * th.speed + th.phase) * amp +
          Math.sin(y * th.freq * 0.4 - t * th.speed * 0.5 + th.phase) * amp * 0.4) * e;
      const s = Math.max(-band, Math.min(band, sway));
      const x = lane + s;
      // Keep every strand inside the neck. The wall ramps in with `e`, so near
      // the pegs (e≈0) there is no clamp (the peg tie stays exact) and by the
      // time the strands are on the fretboard (e≈1) they can never spill out.
      const effHalf = clampHalf + (1 - e) * W;
      return Math.max(clampCenter - effHalf, Math.min(clampCenter + effHalf, x));
    };

    // the strands dissolve softly into the dark/galaxy over the lower part of
    // the screen, so they never look abruptly cut — a dreamy, endless fade.
    const fadeStartFrac = 0.62; // begin fading at 62% of viewport height
    const strokeThread = (i: number, th: Thread, t: number, lineW: number, alpha: number, blur: number, col: RGB) => {
      const p = pinsRef.current?.[i];
      const py = p ? p.y : fallbackPinY(i);
      // Cinematic entrance: the silk unfurls downward from the pegs — slow and
      // graceful (~2.8s), each strand cascading a touch after the last, easing
      // into place and glowing a little brighter as it materializes.
      const ent = Math.min(1, Math.max(0, (t - i * 0.14) / 2.8));
      const entE = 1 - Math.pow(1 - ent, 3); // ease-out cubic — flows then settles
      const revealY = py + entE * (H + 20 - py);
      const endY = Math.min(H + 20, revealY);
      const entA = Math.min(1, alpha * (1 + (1 - entE) * 0.45)); // glow while drawing
      ctx.beginPath();
      let first = true;
      // step 8 (was 5): fewer points per strand, still smooth — much cheaper
      for (let y = py; y <= endY; y += 8) {
        const x = strandX(i, th, y, t);
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      // vertical gradient: full color up top, melting to transparent at bottom
      const fadeStart = H * fadeStartFrac;
      const fadeAt = Math.max(0, Math.min(1, (fadeStart - py) / Math.max(1, H - py)));
      const fullGrad = ctx.createLinearGradient(0, py, 0, H);
      fullGrad.addColorStop(0, rgba(col, entA));
      if (fadeAt < 1) fullGrad.addColorStop(fadeAt, rgba(col, entA));
      fullGrad.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = fullGrad;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      if (blur > 0) { ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = blur; }
      else { ctx.shadowBlur = 0; }
      ctx.stroke();
    };

    const start = performance.now();
    let lastFrame = 0;
    let lastPinSig = '';
    const FRAME_MS = 1000 / 45; // cap ~45fps — plenty smooth, far lighter on CPU

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;

      // rebuild the cached column if the pin geometry changed (e.g. measured
      // after mount, or on resize/responsive reflow)
      const ps0 = pinsRef.current;
      const sig = ps0 ? ps0.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|') : '';
      if (sig !== lastPinSig) { lastPinSig = sig; rebuildLanes(); buildColumn(); }

      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // luminous column (cached): blit behind the strands with a soft breath
      if (colCtx) {
        const breath = 0.9 + 0.1 * Math.sin(t * 0.7);
        ctx.globalAlpha = breath;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // draw the offscreen 1:1 (already dpr-scaled)
        ctx.drawImage(colCanvas, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
      }

      // ── Living aurora: a big, soft, very slow colour-drifting glow behind the
      //    strands so the scene breathes with light instead of sitting on dead
      //    black. Tiny alpha → it never blows out under 'lighter'.
      {
        const ax = clampCenter || W * 0.5;
        const ay = H * 0.30;
        const ph = (Math.sin(t * 0.06) + 1) / 2; // 0..1, a very slow breath
        const cool: RGB = [120, 165, 255];
        const aur: RGB = [
          Math.round(GOLD[0] + (cool[0] - GOLD[0]) * ph * 0.6),
          Math.round(GOLD[1] + (cool[1] - GOLD[1]) * ph * 0.6),
          Math.round(GOLD[2] + (cool[2] - GOLD[2]) * ph * 0.6),
        ];
        const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(W, H) * 0.45);
        ag.addColorStop(0, rgba(aur, 0.055));
        ag.addColorStop(0.5, rgba(aur, 0.022));
        ag.addColorStop(1, rgba(aur, 0));
        ctx.fillStyle = ag;
        ctx.fillRect(0, 0, W, H);
      }

      const hov = hoverRef.current;
      for (let i = 0; i < threads.length; i++) {
        const th = threads[i];
        const targetBoost = hov === th.lang ? 1 : 0;
        boosts[i] += (targetBoost - boosts[i]) * 0.10;
        const boost = boosts[i];
        // when SOME language is hovered, dim the others a little so the active
        // strand clearly stands out; the hovered one brightens strongly.
        const dim = hov && hov !== th.lang ? 0.45 : 1;
        const k = (1 + boost * 2.2) * dim; // strong brighten on hover
        const b = th.bright;
        const pal = th.pal;
        // Balanced silk: between the old too-pale lines and the too-bright
        // version — clearly colored, present, but not glaring.
        strokeThread(i, th, t, th.lineW * 2.95 * (1 + boost * 0.5), Math.min(0.55, 0.0625 * b * k), 7 + boost * 6, pal.glow);
        strokeThread(i, th, t, th.lineW * 1.55 * (1 + boost * 0.3), Math.min(0.69, 0.235 * b * k), 0, pal.mid);
        strokeThread(i, th, t, th.lineW * 0.66 * (1 + boost * 0.3), Math.min(0.965, 0.495 * b * k), 0, pal.core);
      }
      ctx.shadowBlur = 0;

      // Many fine, slow, dreamy motes drifting up around all the strands.
      const dustJitter = weaveAmpRef.current * 0.7;
      for (let i = 0; i < 220; i++) {
        const seed = i * 53.13;
        const prog = (t * (0.012 + (i % 7) * 0.004) + (seed % 1)) % 1; // slow
        const y = (1 - prog) * (H + 80) - 40;
        const ti = i % threads.length;
        const th2 = threads[ti];
        const p = pinsRef.current?.[ti];
        const py = p ? p.y : fallbackPinY(ti);
        const yy = Math.max(y, py);
        const jitter = Math.sin(seed * 1.7) * dustJitter; // spread around strand
        const x = strandX(ti, th2, yy, t) + jitter;
        const r = 0.5 + 0.6 * Math.abs(Math.sin(seed * 2.3)); // all tiny
        const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + i * 0.7);
        // fade motes out over the lower screen, matching the strands' dissolve
        const fadeStart = H * fadeStartFrac;
        const fade = yy <= fadeStart ? 1 : Math.max(0, 1 - (yy - fadeStart) / (H - fadeStart));
        const pal = th2.pal;
        ctx.shadowBlur = 0;
        // mostly warm-white sparkles, some in the strand's own color
        const useWhite = (i % 3) !== 0;
        ctx.fillStyle = useWhite
          ? `rgba(255,247,225,${0.4 * fade * Math.max(0.18, tw)})`
          : rgba(pal.core, 0.4 * fade * Math.max(0.18, tw));
        ctx.beginPath();
        ctx.arc(x, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      ctx.shadowBlur = 0;

      ctx.globalCompositeOperation = 'source-over';
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default LiquidSeam;
