import { useEffect, useRef, useState } from 'react';
import { useT } from '../context/TranslationContext';

/**
 * "Music Time" interlude (blueprint M1-M6) — v5.
 *
 * Changes per Reza's review 2026-07-07 (session 2):
 * - Guitar removed entirely — felt cheap, dropped. Strings are now the
 *   whole composition, no decorative instrument.
 * - Pluck SOUND removed — the vibration + flying-note visual is enough on
 *   its own (magnetic hover means many strings can trigger in quick
 *   succession; audio for each felt like noise, not signal).
 * - Denser + wider spread on the X axis: STRINGS_PER_LETTER raised, and
 *   the word rendered wider — same canvas box size, more/wider strings
 *   within it.
 * - Baseline line brightness raised (strings read as luminous even at
 *   rest, not just when plucked); line weight stays delicate (thin).
 *
 * Carried from v4:
 * - MAGNETIC HOVER interaction: strings within a capture radius of the
 *   pointer are pulled toward it continuously (no click required); moving
 *   the pointer past the release radius lets the string go — it springs
 *   back and releases a flying note.
 * - Plain canvas2D + rAF spring physics (no paper.js/TWEEN dependency).
 * - LETTER-SHAPED STRINGS via glyph-pixel sampling (render word offscreen,
 *   sample each candidate column's ink span) — zero external glyph data.
 * - IntersectionObserver-gated rAF loop (WorkSphere performance lesson);
 *   pointer position tracked via a ref, never React state, so the loop
 *   never triggers a re-render (sphere/carousel performance lesson).
 * - Accent-themed (--accent-rgb) — recolours with the language world.
 *
 * Word spelled: "AMIR" (blueprint M6 explicitly delegates this choice;
 * happy to change to "MUSIC TIME" or anything else on request).
 */

const WORD = 'AMIR';
const STRINGS_PER_LETTER = 8; // sampled columns across each letter's width — denser, more spread across X

const CAPTURE_RADIUS = 85; // px — start pulling a string toward the pointer
const RELEASE_RADIUS = 115; // px — let go (hysteresis prevents flicker at the edge)
const ATTRACT_LERP = 0.22; // how quickly displacement chases the pointer while captured

interface StringState {
  x: number;
  topY: number;
  botY: number;
  displacement: number;
  velocity: number;
  ringing: boolean;
  flash: number;
  attracted: boolean;
}

interface NoteParticle {
  x: number;
  y: number;
  vy: number;
  life: number;
}

/** Renders WORD offscreen, then samples each column's ink span. */
function buildGlyphStrings(canvasW: number, canvasH: number): StringState[] {
  const off = document.createElement('canvas');
  const scale = 2; // supersample for cleaner column sampling
  off.width = canvasW * scale;
  off.height = canvasH * scale;
  const octx = off.getContext('2d');
  if (!octx) return [];

  const fontSize = Math.min(canvasH * 0.72, canvasW / (WORD.length * 0.5)) * scale;
  octx.font = `900 ${fontSize}px Arial, sans-serif`;
  octx.textBaseline = 'middle';
  octx.fillStyle = '#fff';
  const textWidth = octx.measureText(WORD).width;
  const startX = (off.width - textWidth) / 2;
  octx.fillText(WORD, startX, off.height / 2);

  const img = octx.getImageData(0, 0, off.width, off.height).data;
  const colHasInk = (col: number): [number, number] | null => {
    let top = -1;
    let bot = -1;
    for (let y = 0; y < off.height; y++) {
      const alpha = img[(y * off.width + col) * 4 + 3]!;
      if (alpha > 40) {
        if (top === -1) top = y;
        bot = y;
      }
    }
    if (top === -1) return null;
    return [top / scale, bot / scale];
  };

  // Sample a handful of columns per letter's occupied width, evenly spaced
  // across the ink's actual horizontal extent (not the whole canvas).
  let inkStart = -1;
  let inkEnd = -1;
  for (let x = 0; x < off.width; x++) {
    if (colHasInk(x)) { if (inkStart === -1) inkStart = x; inkEnd = x; }
  }
  if (inkStart === -1) return [];

  const totalStrings = STRINGS_PER_LETTER * WORD.replace(/\s/g, '').length;
  const strings: StringState[] = [];
  for (let i = 0; i < totalStrings; i++) {
    const col = Math.round(inkStart + ((inkEnd - inkStart) * (i + 0.5)) / totalStrings);
    const span = colHasInk(col);
    if (!span) continue;
    const x = col / scale;
    strings.push({ x, topY: span[0], botY: span[1], displacement: 0, velocity: 0, ringing: false, flash: 0, attracted: false });
  }
  return strings;
}

interface MusicTimeProps {
  /** True/undefined = standalone (own IntersectionObserver decides).
   * False = this slide is not the active one inside a pinned journey — the
   * animation loop stays fully suspended regardless of the section's own
   * on-screen visibility. */
  pinnedActive?: boolean;
  /** True when mounted inside a pinned sequence: fills its slide slot
   * (height:100%) instead of its own 100vh. */
  pinned?: boolean;
}

export default function MusicTime({ pinnedActive, pinned }: MusicTimeProps = {}) {
  const sectionRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stringsRef = useRef<StringState[]>([]);
  const particlesRef = useRef<NoteParticle[]>([]);
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const inViewRef = useRef(false);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const { t } = useT();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const h = rect.height;
      dimsRef.current = { w: rect.width, h, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${h}px`;
      stringsRef.current = buildGlyphStrings(rect.width, h);
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { inViewRef.current = !!entry?.isIntersecting; },
      { rootMargin: '30% 0px 30% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Pointer tracking lives entirely in a ref — never React state — so the
  // rAF loop below never causes a re-render (WorkSphere/carousel lesson).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onLeave = () => {
      pointerRef.current.active = false;
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointercancel', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onLeave);
    };
  }, []);

  const pluck = (s: StringState) => {
    const rawIntensity = Math.min(1, Math.abs(s.displacement) / 40);
    if (rawIntensity > 0.005) {
      s.ringing = true;
      s.flash = 1;
      particlesRef.current.push({
        x: s.x + s.displacement,
        y: (s.topY + s.botY) / 2,
        vy: -0.9 - Math.random() * 0.6,
        life: 1,
      });
      if (!started) setStarted(true);
    }
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!inViewRef.current) return;
      if (pinnedActive === false) return;
      const canvas = canvasRef.current;
      const ctx2d = canvas?.getContext('2d');
      if (!canvas || !ctx2d) return;
      const { w, h, dpr } = dimsRef.current;
      if (!w || !h) return;

      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);

      const accent = getComputedStyle(canvas).getPropertyValue('--accent-rgb').trim() || '212,175,55';
      const pointer = pointerRef.current;

      for (const s of stringsRef.current) {
        // --- Magnetic hover: no click needed. ---
        let dist = Infinity;
        if (pointer.active && pointer.y >= s.topY - 14 && pointer.y <= s.botY + 14) {
          dist = Math.abs(pointer.x - s.x);
        }

        if (s.attracted) {
          if (dist > RELEASE_RADIUS) {
            s.attracted = false;
            s.ringing = true;
            pluck(s);
          } else {
            const target = Math.max(-40, Math.min(40, pointer.x - s.x));
            s.displacement += (target - s.displacement) * ATTRACT_LERP;
            s.velocity = 0;
          }
        } else if (dist < CAPTURE_RADIUS) {
          s.attracted = true;
          s.ringing = false;
        }

        if (s.ringing && !s.attracted) {
          const k = 90;
          const damping = 6.5;
          const accel = -k * s.displacement - damping * s.velocity;
          s.velocity += accel * (1 / 60);
          s.displacement += s.velocity * (1 / 60);
          if (Math.abs(s.displacement) < 0.15 && Math.abs(s.velocity) < 0.15) {
            s.displacement = 0;
            s.velocity = 0;
            s.ringing = false;
          }
        }
        s.flash = Math.max(0, s.flash - 0.018);

        const midY = (s.topY + s.botY) / 2;
        const alpha = 0.5 + s.flash * 0.5;
        const glow = s.flash;

        ctx2d.save();
        ctx2d.strokeStyle = `rgba(${accent},${alpha})`;
        ctx2d.lineWidth = 1 + glow * 1.1;
        ctx2d.lineCap = 'round';
        ctx2d.shadowColor = `rgba(${accent},${Math.min(1, 0.35 + glow * 0.65)})`;
        ctx2d.shadowBlur = 3 + glow * 14;
        ctx2d.beginPath();
        ctx2d.moveTo(s.x, s.topY);
        ctx2d.quadraticCurveTo(s.x + s.displacement, midY, s.x, s.botY);
        ctx2d.stroke();
        ctx2d.restore();
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.y += p.vy;
        p.life -= 0.012;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx2d.save();
        ctx2d.globalAlpha = Math.max(0, p.life);
        ctx2d.fillStyle = `rgb(${accent})`;
        ctx2d.font = `${14 + (1 - p.life) * 6}px serif`;
        ctx2d.textAlign = 'center';
        ctx2d.fillText('♪', p.x, p.y);
        ctx2d.restore();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={pinned ? { height: '100%' } : { padding: 'clamp(0.25rem, 1vh, 0.75rem) 0 clamp(1rem, 3vh, 2rem)' }}
      aria-label={t('Music Time')}
    >
      <div className={pinned ? 'absolute inset-0 flex flex-col items-center justify-center' : 'flex flex-col items-center'}>
        <div className="text-center mb-2" style={{ opacity: started ? 0.3 : 0.8, transition: 'opacity 1.2s ease' }}>
          <span className="font-mono uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.35em', color: 'var(--text-dim-color)' }}>
            {t('Pluck a string')}
          </span>
        </div>
        <div
          ref={wrapRef}
          className="relative w-full flex items-center justify-center"
          style={{ height: pinned ? '62vh' : 'clamp(180px, 30vh, 340px)', maxWidth: '1100px' }}
        >
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none', cursor: 'default' }}
          />
        </div>
      </div>
    </section>
  );
}
