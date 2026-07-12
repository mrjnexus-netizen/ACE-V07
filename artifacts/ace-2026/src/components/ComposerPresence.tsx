import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';
import EditableText from './EditableText';
import type { AudioTrack } from '../types';
import { useBalancedText } from '../hooks/useBalancedText';

// Short, editable blurbs per genre (lowercased key).
const GENRE_BLURBS: Record<string, string> = {
  orchestral: 'Sweeping strings and brass — the grammar of the symphony, rebuilt for the modern screen.',
  cinematic: 'Themes written to live beneath the image, shaping what the eye believes it feels.',
  gaming: 'Adaptive, interactive scores that respond and evolve with the player in real time.',
  animation: 'Bright, characterful music that gives motion its heartbeat and worlds their wonder.',
  ambient: 'Slow, weightless texture — sound designed to surround rather than to lead.',
  electronic: 'Synthesised pulse and grain, where circuitry learns to breathe.',
  'electronic-orchestral': 'Where live orchestra and electronics meet — organic and synthetic in one breath.',
  synthwave: 'Neon-lit nostalgia: analog warmth wrapped around a driving retro pulse.',
  choral: 'The human voice, massed and luminous — the oldest instrument, reimagined.',
  other: 'Work that resists category — experiments and one-of-a-kind scores.',
};

function blurbFor(genre: string): string {
  return GENRE_BLURBS[genre.toLowerCase()] || GENRE_BLURBS.other!;
}

interface GenreGroup {
  genre: string;
  tracks: AudioTrack[];
  cover: string;
}

function coverOf(t: AudioTrack): string {
  return t.coverArt?.url || (t as unknown as { coverUrl?: string }).coverUrl || '';
}

const ROTATE_MS = 3000;

// Reza (2026-07-11): the band no longer plays a track directly. Clicking it
// now starts a slow, guided scroll journey down to that genre's STARRED
// track over in the "Selected Works" orbital section (SpatialScrollEngine),
// briefly taking scroll control away from the visitor and handing it back
// once arrived (or the instant they scroll/click themselves — never fought).
// A fixed headphone glyph on the right of each banner is the visual anchor;
// a light, neon spray of tiny notes drifts out from it continuously.
const JOURNEY_MS = 4200; // "kheyli arum" — slow and deliberate, not snappy

const PRESENCE_STYLES = `
@keyframes cpHeadphoneBeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.09); } }
.cp-headphone-beat { animation: cpHeadphoneBeat 0.62s ease-in-out infinite alternate; transform-origin: center; }
@keyframes cpEqBar { 0% { transform: scaleY(0.3); opacity: 0.55; } 100% { transform: scaleY(1); opacity: 1; } }
.cp-eq-bar {
  display: inline-block;
  width: 3px;
  height: clamp(14px, 1.8vw, 22px);
  border-radius: 2px;
  background: var(--accent-color);
  transform-origin: bottom;
  animation: cpEqBar 0.5s ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .cp-headphone-beat { animation: none !important; }
  .cp-eq-bar { animation: none !important; transform: scaleY(0.6) !important; opacity: 0.8 !important; }
}
`;

/** Cubic ease-in-out — the whole journey (and the skip-back) uses this,
 * never a linear crawl or an abrupt snap. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function ComposerPresence() {
  const { identity, tracks, locale } = useIdentity();
  const { t } = useT();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.5 });
  // Spray starts the instant the section is even slightly on-screen — no
  // waiting for the 50% threshold above (that's for banner auto-rotate
  // timing) and never gated behind hover or any other interaction.
  const spraySectionInView = useInView(sectionRef, { amount: 0 });

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // ----- Guided scroll journey (2026-07-11) -----
  const [journeyActive, setJourneyActive] = useState(false);
  const journeyRafRef = useRef<number | null>(null);
  const iconBoxRef = useRef<HTMLDivElement>(null); // headphone+eq box — spray origin
  const getLenis = () => (window as unknown as { __lenis?: { stop?: () => void; start?: () => void } | null }).__lenis;

  const stopJourneyTween = useCallback(() => {
    if (journeyRafRef.current) {
      cancelAnimationFrame(journeyRafRef.current);
      journeyRafRef.current = null;
    }
  }, []);

  /** Smoothly tweens window scroll from wherever it is now to `targetY`
   * over `ms`, then runs `onDone`. Cancellable at any point via
   * stopJourneyTween() — used both by manual-interrupt and by Skip. */
  const tweenScrollTo = useCallback((targetY: number, ms: number, onDone?: () => void) => {
    stopJourneyTween();
    const startY = window.scrollY;
    const delta = targetY - startY;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, startY + delta * easeInOutCubic(p));
      if (p < 1) {
        journeyRafRef.current = requestAnimationFrame(step);
      } else {
        journeyRafRef.current = null;
        onDone?.();
      }
    };
    journeyRafRef.current = requestAnimationFrame(step);
  }, [stopJourneyTween]);

  const endJourney = useCallback(() => {
    stopJourneyTween();
    getLenis()?.start?.();
    setJourneyActive(false);
  }, [stopJourneyTween]);

  // While a journey is underway, any manual scroll/touch/key from the
  // visitor hands control straight back — instantly, right where they are,
  // never fighting or snapping anywhere. (Reza 2026-07-12: removed the
  // explicit Skip button — this passive hand-back is the only way out now.)
  useEffect(() => {
    if (!journeyActive) return;
    const interrupt = () => endJourney();
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    return () => {
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('keydown', interrupt);
    };
  }, [journeyActive, endJourney]);

  useEffect(() => () => stopJourneyTween(), [stopJourneyTween]);

  /** Starts the journey to the very START of the Selected Works cascading
   * section — nothing more precise. Reza (2026-07-12): the earlier version
   * tried to land exactly on the matching card (per-index scroll-band
   * math), which kept producing jitter no fix fully settled. Simplified:
   * just get the visitor to the top of that section; from there they
   * scroll the rest of the way themselves. No CONCEPT_ORDER index, no
   * per-card target math, no more fragile precision to fight. */
  const startJourneyToSection = useCallback(() => {
    if (journeyActive) return;
    const sectionEl = document.getElementById('selected-works-orbit');
    if (!sectionEl) return;
    const targetY = sectionEl.getBoundingClientRect().top + window.scrollY;

    getLenis()?.stop?.();
    setJourneyActive(true);
    tweenScrollTo(targetY, JOURNEY_MS, endJourney);
  }, [journeyActive, tweenScrollTo, endJourney]);

  // Curtain-peel reveal on the "The Composer" heading (reference:
  // codepen.io/shahidshaikhs/pen/JjGoaOz, adapted) — stacked dark panels
  // sit over the heading and peel away once when it first scrolls into
  // view. Lives directly on the existing heading (no separate section, no
  // extra scroll stop) — plain CSS transitions driven by one state flip,
  // no new dependency.
  const headingRef = useRef<HTMLDivElement>(null);
  const revealedOnceRef = useRef(false);
  const revealTimeoutRef = useRef<number | null>(null);
  const [peeled, setPeeled] = useState(reduce);

  useEffect(() => {
    if (reduce) return;
    const el = headingRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !revealedOnceRef.current) {
          revealedOnceRef.current = true;
          revealTimeoutRef.current = window.setTimeout(() => setPeeled(true), 150);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (revealTimeoutRef.current) window.clearTimeout(revealTimeoutRef.current);
    };
  }, [reduce]);

  // Group tracks by genre automatically.
  const groups = useMemo<GenreGroup[]>(() => {
    const map = new Map<string, AudioTrack[]>();
    (tracks ?? []).forEach((t) => {
      const g = (t.genre || 'other').trim();
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    });
    return Array.from(map.entries()).map(([genre, list]) => ({
      genre,
      tracks: list,
      cover: coverOf(list[0]!),
    }));
  }, [tracks]);

  // Auto-advance every ROTATE_MS while the section is in view and not paused.
  useEffect(() => {
    if (!inView || paused || reduce || groups.length <= 1) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % groups.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [inView, paused, reduce, groups.length]);

  const nameMap = (identity?.name ?? null) as unknown as Record<string, string> | null;
  const composerName =
    (nameMap && nameMap[locale ?? 'en']) || (nameMap && nameMap.en) || t('ACE Composer');

  if (groups.length === 0) {
    return (
      <section ref={sectionRef} className="relative w-full min-h-[70vh] flex flex-col items-center justify-center overflow-hidden living-veil" aria-label={t('The composer')}>
        <span className="font-mono uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.34em', color: 'var(--accent-color)' }}>{t('The Composer')}</span>
        <h2 className="font-display text-center mt-6" style={{ fontSize: 'clamp(2.5rem, 9vw, 8rem)', lineHeight: 0.95, color: 'var(--text-dim-color)' }}>{composerName}</h2>
      </section>
    );
  }

  const current = groups[active]!;

  // G5: force even wrap + no widow last-word on the rotating genre blurb,
  // cross-browser. Re-balance whenever the active genre (and its text)
  // changes.
  const blurbRef = useBalancedText<HTMLParagraphElement>();

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden living-veil"
      style={{ padding: 'clamp(1.5rem, 3vh, 2.5rem) 0 clamp(0.5rem, 1.5vh, 1rem)' }}
      aria-label={t('The composer')}
    >
      <style>{PRESENCE_STYLES}</style>
      {/* Heading — centred, generous breathing room above the band */}
      <div
        ref={headingRef}
        className="relative flex flex-col items-center text-center overflow-hidden"
        style={{ padding: '0 clamp(1.5rem, 8vw, 9rem)', marginBottom: 'clamp(1rem, 3vh, 2rem)' }}
      >
        <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.45em', color: 'var(--accent-color)' }}>
          {t('The Composer')}
        </span>
        <EditableText
          contentKey="composer.tagline"
          defaultValue={t('The worlds {name} scores for.').replace('{name}', composerName.split(' ')[0] ?? '')}
          as="h2"
          className="font-display font-light mt-6"
          style={{ fontSize: 'clamp(1.4rem, 2.8vw, 2.4rem)', lineHeight: 1.3, color: 'var(--text-color)', maxWidth: '24ch' }}
        />

        {/* stacked cover panels — peel away once, staggered, revealing the heading above */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: `rgba(8,8,10,${1 - i * 0.1})`,
              zIndex: 5 - i,
              transform: peeled ? 'translateX(-100%)' : 'translateX(0)',
              transition: `transform 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      {/* The rotating band — curved like a strap around a cylinder */}
      <div
        className="relative w-full"
        style={{ perspective: '1400px', height: 'clamp(160px, 28vh, 300px)' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Neon note spray — a STABLE sibling of the rotating slides, never
            unmounted by AnimatePresence, so the stream is continuous and
            never restarts when the banner changes (Reza 2026-07-12).
            Re-measures its origin (the headphone icon's position) on every
            slide swap via remeasureKey, since that icon's own DOM node IS
            remounted each time — but the canvas/particles themselves live
            on undisturbed underneath. */}
        {/* Neon note spray lives AFTER the slides below (see the closing
            </AnimatePresence> a few lines down) so it stacks on top of
            them — it's a stable sibling either way (never remounted by
            slide changes), this is purely about paint order. Placing it
            BEFORE the slides put it underneath their opaque background
            image + darkening gradient, which is why it was only ever
            glimpsed during the brief cross-fade moment between slides. */}

        <AnimatePresence mode="popLayout">
          <motion.button
            key={current.genre}
            type="button"
            onClick={() => startJourneyToSection()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: '60%', rotateY: -28, filter: 'blur(8px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: '0%', rotateY: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: '-60%', rotateY: 28, filter: 'blur(8px)' }}
            transition={{ duration: 1, ease: [0.5, 0, 0.2, 1] }}
            className="absolute inset-0 w-full flex items-center focus:outline-none"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* full-bleed background image with side curvature via mask + gradients */}
            <div className="absolute inset-0 overflow-hidden">
              {current.cover && (
                <img
                  src={current.cover}
                  alt=""
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
                    maskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
                  }}
                />
              )}
              {/* darkening for legibility */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #000 2%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.45) 70%, #000 98%), linear-gradient(to top, rgba(0,0,0,0.6), transparent 60%)' }} />
              {/* top + bottom hairlines to read as a 'band' */}
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)' }} />
              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)' }} />
            </div>

            {/* content */}
            <div className="relative z-10 w-full flex items-center justify-between" style={{ padding: '0 clamp(2rem, 9vw, 10rem)' }}>
              <div className="max-w-2xl text-left">
                <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--accent-color)' }}>
                  {String(active + 1).padStart(2, '0')} / {String(groups.length).padStart(2, '0')}
                </span>
                <h3
                  className="font-display font-light mt-3 text-white capitalize"
                  style={{ fontSize: 'clamp(2rem, 5.5vw, 4.5rem)', lineHeight: 1 }}
                >
                  {t(current.genre)}
                </h3>
                <p ref={blurbRef} className="font-light mt-4 text-white/75" style={{ fontSize: 'clamp(0.85rem, 1.2vw, 1.05rem)', lineHeight: 1.55, maxWidth: '46ch' }}>
                  {t(blurbFor(current.genre))}
                </p>
              </div>

              {/* Right-side zone: spray canvas + headphone glyph share one
                  exact box, so the notes spawn precisely beside the icon
                  and are guaranteed to clear it before fading — in the old
                  full-width layout they spawned right under the opaque
                  icon and never visibly escaped it. */}
              <div ref={iconBoxRef} className="relative flex-shrink-0" style={{ width: 'clamp(78px, 9vw, 130px)', alignSelf: 'stretch' }}>
                <div
                  className="absolute flex items-center justify-center"
                  aria-hidden
                  style={{ right: 0, top: '50%', transform: 'translateY(-50%)', gap: 'clamp(6px, 0.8vw, 10px)' }}
                >
                  {/* left equalizer bars */}
                  <div className="flex items-center" style={{ gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="cp-eq-bar" style={{ animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>

                  {/* headphone glyph — beats continuously, note glyph
                      resting on the headband between the earcups */}
                  <div className="cp-headphone-beat relative" style={{ filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.55))' }}>
                    <svg style={{ width: 'clamp(34px, 4vw, 52px)', height: 'clamp(34px, 4vw, 52px)' }} viewBox="0 0 48 48" fill="none">
                      <path d="M8 26v-2a16 16 0 0 1 32 0v2" stroke="var(--accent-color)" strokeWidth="2.4" strokeLinecap="round" />
                      <rect x="5" y="24" width="8" height="14" rx="4" fill="var(--accent-color)" opacity="0.9" />
                      <rect x="35" y="24" width="8" height="14" rx="4" fill="var(--accent-color)" opacity="0.9" />
                      <text x="24" y="15" textAnchor="middle" fontSize="11" fill="var(--accent-color)">♪</text>
                    </svg>
                  </div>

                  {/* right equalizer bars (mirrored delays) */}
                  <div className="flex items-center" style={{ gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="cp-eq-bar" style={{ animationDelay: `${(2 - i) * 0.12}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.button>
        </AnimatePresence>

        {/* Neon note spray — stacks ABOVE the slide backgrounds now (was
            underneath them before, which is why it barely showed). Explicit
            zIndex because the slide button above forms its own stacking
            context (framer-motion's transform/filter animations trigger
            that), so this needs a real z-index to win against it, not just
            DOM order. */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
          <HeadphoneSpray active={spraySectionInView && !reduce} originRef={iconBoxRef} remeasureKey={current.genre} />
        </div>
      </div>

      {/* progress dots */}
      <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
        {groups.map((g, i) => (
          <button
            key={g.genre}
            type="button"
            aria-label={`${t('Show')} ${g.genre}`}
            onClick={() => setActive(i)}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === active ? 26 : 7,
              height: 7,
              backgroundColor: i === active ? 'var(--accent-color)' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>
    </section>
  );
}

interface SprayParticle {
  x: number; y: number; baseY: number; vx: number;
  originX: number;
  wavePhase: number; waveSpeed: number; waveAmp: number; // slow, big wander
  jitterPhase: number; jitterSpeed: number; jitterAmp: number; // fast, small wobble — breaks up the clean sine curve
  xDrift: number; // slow random walk applied to horizontal speed — never a perfectly straight line
  travel: number; // 0 at spawn -> 1 at full nominal crossing distance
  size: number;
}

const SPRAY_GROW_END = 0.55; // travel fraction where notes finish growing
const SPRAY_FADE_END = 0.7; // Reza: fully gone by ~30% of the banner remaining
const SPRAY_SIZE_START = 4;
const SPRAY_SIZE_MAX = 15;

/** A slow, magical drift of tiny neon notes spraying out from the LEFT edge
 * of the headphone glyph. Reza (2026-07-12), two rounds of feedback:
 *  1. The stream must be CONTINUOUS across banner rotations — this
 *     component is now a stable sibling of the AnimatePresence slides (see
 *     ComposerPresence's JSX), never unmounted, so its particles/canvas are
 *     untouched by slide changes. `remeasureKey` only re-reads the icon's
 *     on-screen position (its own DOM node IS remounted each slide) — it
 *     does not reset the animation.
 *  2. Notes spawn tiny, grow to a comfortable size as they drift, THEN
 *     gently fade — fully gone by ~70% of the way across (never lingering
 *     into the last 30% of the banner). Movement is slow with a soft sine
 *     wander, not a fast straight line — "arum va jaduyi". */
function HeadphoneSpray({
  active,
  originRef,
  remeasureKey,
}: {
  active: boolean;
  originRef: RefObject<HTMLDivElement>;
  remeasureKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1, originX: 0 });
  const particlesRef = useRef<SprayParticle[]>([]);
  // Same fix as LivingScore.tsx (2026-07-12 profiling): don't call
  // getComputedStyle inside the per-frame loop — cache it and only
  // refresh via a MutationObserver when the theme/language actually
  // changes.
  const accentRgbRef = useRef('212,175,55');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const refresh = () => {
      accentRgbRef.current = getComputedStyle(canvas).getPropertyValue('--accent-rgb').trim() || '212,175,55';
    };
    refresh();
    const mo = new MutationObserver(refresh);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // Origin = the headphone box's LEFT edge, measured relative to this
      // canvas's own wrapper — real geometry, not an assumed offset.
      const iconRect = originRef.current?.getBoundingClientRect();
      const originX = iconRect ? iconRect.left - rect.left : rect.width * 0.88;
      dimsRef.current = { w: rect.width, h: rect.height, dpr, originX };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    if (originRef.current) ro.observe(originRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originRef, remeasureKey]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let spawnAcc = 0;
    let last = performance.now();
    // A slow, unhurried crossing — magical, not a dart across the frame.
    const crossMs = 16000;

    // Reza (2026-07-12): "at frame zero they should already be mid-dance"
    // — pre-seed a batch of particles spread across the whole travel range
    // (not just freshly spawned at the origin) so there's no empty-then-
    // filling-up moment on first paint.
    if (particlesRef.current.length === 0) {
      const { originX, h } = dimsRef.current;
      const seedCount = 16;
      for (let i = 0; i < seedCount; i++) {
        const travel = (i / seedCount) * SPRAY_FADE_END * (0.85 + Math.random() * 0.3);
        particlesRef.current.push({
          x: originX * (1 - Math.min(0.98, travel)),
          baseY: h / 2 + (Math.random() - 0.5) * h * 0.5,
          y: 0,
          vx: -(originX / crossMs) * (0.7 + Math.random() * 0.6),
          originX,
          wavePhase: Math.random() * Math.PI * 2,
          waveSpeed: 0.0011 + Math.random() * 0.0014,
          waveAmp: h * (0.035 + Math.random() * 0.05),
          jitterPhase: Math.random() * Math.PI * 2,
          jitterSpeed: 0.0016 + Math.random() * 0.0022,
          jitterAmp: h * (0.006 + Math.random() * 0.012),
          xDrift: 0,
          travel: 0,
          size: SPRAY_SIZE_START,
        });
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(48, now - last);
      last = now;
      const { w, h, dpr, originX } = dimsRef.current;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Denser stream — more notes in the air at once.
      spawnAcc += dt;
      if (spawnAcc > 160) {
        spawnAcc = 0;
        particlesRef.current.push({
          x: originX,
          baseY: h / 2 + (Math.random() - 0.5) * h * 0.5,
          y: 0,
          vx: -(originX / crossMs) * (0.7 + Math.random() * 0.6),
          originX,
          wavePhase: Math.random() * Math.PI * 2,
          waveSpeed: 0.0011 + Math.random() * 0.0014,
          waveAmp: h * (0.035 + Math.random() * 0.05),
          jitterPhase: Math.random() * Math.PI * 2,
          jitterSpeed: 0.0016 + Math.random() * 0.0022, // slow, gentle wobble — not frantic
          jitterAmp: h * (0.006 + Math.random() * 0.012),
          xDrift: 0,
          travel: 0,
          size: SPRAY_SIZE_START,
        });
      }

      const accent = accentRgbRef.current;
      const arr = particlesRef.current;
      ctx.textAlign = 'center';
      let lastFontPx = -1; // ctx.font is expensive to reassign — only touch it when the size actually changes
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]!;
        // Non-linear dance: a slow random walk nudges horizontal speed
        // (never a perfectly steady drift), plus two overlapping wave
        // frequencies vertically instead of one clean sine — the
        // combination reads as an irregular, unpredictable dance rather
        // than a neat, orderly stream.
        p.xDrift += (Math.random() - 0.5) * 0.00008 * dt;
        p.xDrift = Math.max(-0.4, Math.min(0.4, p.xDrift));
        p.x += p.vx * (1 + p.xDrift) * dt;
        p.wavePhase += p.waveSpeed * dt;
        p.jitterPhase += p.jitterSpeed * dt;
        p.y = p.baseY + Math.sin(p.wavePhase) * p.waveAmp + Math.sin(p.jitterPhase) * p.jitterAmp;
        p.travel = p.originX > 0 ? (p.originX - p.x) / p.originX : 1;

        if (p.travel >= SPRAY_FADE_END) { arr.splice(i, 1); continue; }

        // grow tiny -> comfortable size across the first part of the trip
        const growT = Math.min(1, p.travel / SPRAY_GROW_END);
        p.size = SPRAY_SIZE_START + (SPRAY_SIZE_MAX - SPRAY_SIZE_START) * growT;

        // stay fully visible while growing, THEN gently fade to nothing by
        // SPRAY_FADE_END — never lingering into the banner's last 30%.
        const opacity = p.travel <= SPRAY_GROW_END
          ? 1
          : 1 - (p.travel - SPRAY_GROW_END) / (SPRAY_FADE_END - SPRAY_GROW_END);

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity)) * 0.9;
        ctx.fillStyle = `rgb(${accent})`;
        const fontPx = Math.round(p.size);
        if (fontPx !== lastFontPx) {
          ctx.font = `${fontPx}px serif`;
          lastFontPx = fontPx;
        }
        ctx.fillText('♪', p.x, p.y);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" aria-hidden />;
}

