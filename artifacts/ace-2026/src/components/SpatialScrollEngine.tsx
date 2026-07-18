import { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useT } from '../context/TranslationContext';
import { useBalancedText } from '../hooks/useBalancedText';
import EditableText from './EditableText';
import VinylCardFace, { VINYL_CARD_STYLES } from './VinylCardFace';
import type { AudioTrack, Locale } from '../types';
import { CONCEPT_ORDER } from '../constants/concepts';

/**
 * "Selected Works" — orbital card ring around a luminous core (blueprint S1–S5).
 *
 * ARCHITECTURE (v6 — whole-assembly rotation, not per-card flips):
 * The 12 concept cards sit at FIXED local positions on a ring, evenly spaced
 * EXACTLY 30 degrees apart (360/12) around the luminous core. Only ONE shared
 * value ever changes: the ring's global Y rotation. This guarantees, by pure
 * geometry, that every card gets an exactly equal share of "front and centre"
 * time — no approximation, no clustering, no card ever favoured.
 *
 * Two things can drive that single rotation value, smoothly eased toward
 * whichever is active (never an instant jump):
 *   - SCROLLING drives it directly: progress 0->1 across the section maps to
 *     exactly one full turn (0->360 deg), so the 12 fronts are met in eq
 *     ual, evenly-spaced scroll increments.
 *   - HOVERING a card (while NOT actively scrolling) becomes the target
 *     instead: the whole ring eases toward the angle that brings THAT card
 *     to the front slot — which sits naturally between the text panel and
 *     the sphere body, because that IS the front position, not a separate
 *     teleport target. Ending the hover (or resuming scroll) eases control
 *     back to the scroll-driven angle. One rotation state, one easing curve,
 *     both directions of every transition share the same smooth motion.
 *
 * This also removes the earlier bug where a single card flipping forward
 * from an arbitrary position produced an ugly rotation path and made clicks
 * land on the wrong card — there is now exactly one true front card by
 * construction, and nothing else ever moves independently.
 *
 * Manual pin (rAF + getBoundingClientRect) is kept because position:sticky
 * proved unreliable under this app's Lenis smooth-scroll.
 *
 * Data plumbing (starred-per-concept cards, playlist feed, click-to-play,
 * localisation) is preserved verbatim from the previous engine.
 */

const CONCEPT_BLURB: Record<string, string> = {
  Cinema: 'Original scores written to live beneath the image.',
  Television: 'Themes and cues that carry a series across seasons.',
  Games: 'Adaptive, interactive music that evolves with the player.',
  Animation: 'Bright, characterful writing that gives motion its heartbeat.',
  Documentary: 'Textural soundscapes that let the real world breathe.',
  Advertising: 'Precise, memorable music built to land in seconds.',
  Trailers: 'High-impact cues engineered to move an audience fast.',
  Theatre: 'Live score for the stage, written to breathe with performers.',
  Dance: 'Music composed for movement, tempo as choreography.',
  Concert: 'Works for the hall, orchestra and ensemble at full scale.',
  Immersive: 'Spatial audio for VR, XR and installation.',
  Albums: 'Long-form artist records under the composer\u2019s own name.',
};

const POETIC_LINES = [
  'I see music as colours, and I try to paint with sound.',
  'Music is the mediator between the spiritual and the sensual life.',
  'Music is the silence between the notes.',
  'The aim of music is to touch the heart and refresh the soul.',
  'Silence is also music, and the most important one.',
  'To listen is an effort, and just to hear is no merit.',
  'The music is not in the notes, but in the silence between.',
  'A great film score reaches the audience before they even know it.',
  'Simplicity is the final achievement, the crowning reward of art.',
  'The symphony must be like the world; it must embrace everything.',
  'Music can name the unnameable and communicate the unknowable.',
  'Music is the language of the soul, where words fall silent.',
];

const N = 12;
const STEP_DEG = 360 / N; // exactly 30 degrees — equal share, by construction
// CYLINDER HELIX: every card sits at the SAME ring radius on the cylinder
// wall (perfect equality — the earlier sphere-spiral gave pole cards a tiny
// orbit, an unequal presence), climbing a fixed vertical step per card (the
// approved "drill" character). Step height as a fraction of the ring radius:
const HELIX_FRAC = 0.21;

function trackCover(t: AudioTrack): string {
  return t.coverArt?.url || (t as unknown as { coverUrl?: string }).coverUrl || '';
}

interface ConceptCard {
  concept: string;
  blurb: string;
  track: AudioTrack | null;
  index: number;
}

/** Equivalent angle to `target` (mod 360) nearest to `current` — lerping
 * current -> that value always takes the shortest, smoothest path. */
function nearestEquivalent(current: number, target: number): number {
  const diff = (((target - current + 180) % 360) + 360) % 360 - 180;
  return current + diff;
}

function normalizeIndex(i: number): number {
  return ((i % N) + N) % N;
}

const SSE_STYLES = `
@keyframes sseFrameBreathe { 0%, 100% { opacity: 0.28; } 50% { opacity: 0.55; } }
@keyframes sseDiamondPulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes sseLineDrift { 0% { transform: translateX(-6%); opacity: 0.35; } 50% { opacity: 0.75; } 100% { transform: translateX(6%); opacity: 0.35; } }
@keyframes sseSheen { 0% { transform: translateX(-130%) skewX(-18deg); } 100% { transform: translateX(230%) skewX(-18deg); } }
@keyframes sseCoreBreathe { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sse-anim { animation: none !important; } }
` + VINYL_CARD_STYLES;

/**
 * Animated vector card face — no text, accent-var themed, razor-sharp at any
 * scale. PERFORMANCE: only the `active` card ever runs its keyframe
 * animations; every other card renders a fully STATIC version of the exact
 * same face. Previously all 12 cards animated six independent infinite CSS
 * animations each (72 running at once, permanently, even off-screen) — that
 * was the direct cause of the reported hang/heaviness. Now at most 6 run at
 * any moment, only for the one card that is actually front + hovered.
 */
function AnimatedFace({ seed, active }: { seed: number; active: boolean }) {
  const drift = 7 + (seed % 4) * 1.3;
  const anim = (name: string, dur: number) => (active ? { animation: `${name} ${dur}s ease-in-out infinite` } : {});
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #121118 0%, #0A0A0E 55%, #0E0C12 100%)' }}
    >
      <div className={active ? 'sse-anim' : undefined} style={{ position: 'absolute', inset: 9, borderRadius: 12, border: '1px solid rgba(var(--accent-rgb),0.5)', opacity: active ? undefined : 0.4, ...anim('sseFrameBreathe', 4.2 + (seed % 3) * 0.6) }} />
      <div style={{ position: 'absolute', inset: 14, borderRadius: 9, border: '1px solid rgba(var(--accent-rgb),0.12)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(128deg, rgba(255,255,255,0.06), transparent 44%)' }} />
      {[38, 50, 62].map((topPct, li) => (
        <div key={topPct} className={active ? 'sse-anim' : undefined} style={{ position: 'absolute', left: '18%', right: '18%', top: `${topPct}%`, height: 1, background: `linear-gradient(to right, transparent, rgba(var(--accent-rgb),${li === 1 ? 0.55 : 0.25}), transparent)`, opacity: active ? undefined : 0.5, ...anim('sseLineDrift', drift + li * 1.4) }} />
      ))}
      <div className={active ? 'sse-anim' : undefined} style={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 20, marginLeft: -7, marginTop: -10, background: 'rgba(var(--accent-rgb),0.95)', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.7))', ...anim('sseDiamondPulse', 3.4 + (seed % 5) * 0.4) }} />
      {active && (
        <div className="sse-anim" style={{ position: 'absolute', top: 0, bottom: 0, width: '34%', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent)', animation: `sseSheen ${7 + (seed % 4)}s linear infinite` }} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2026-07-17 (per Reza) — MOBILE-ONLY scroll-driven card fade.
//
// Reza's explicit scope: touch NOTHING about the cards themselves (their
// design, features, internal animations — VinylCardFace, the play state,
// the text block below) — ONLY change how they move/reveal as the person
// scrolls. Reference behaviour (codepen.io/JavaScriptJunkie/pen/BGNELL):
// each card fades and scales up as it approaches the center of the
// viewport while scrolling, then fades back down as it moves past —
// a continuous, reversible "focus" effect, not the one-time
// whileInView-and-done reveal this had before (which also never played
// again if you scrolled back up).
//
// Framer-motion's useScroll needs a real per-instance target ref, which
// means a real per-instance component (can't call hooks inside the
// .map() callback below — that would call hooks a variable number of
// times per render, which breaks React's rules of hooks). Everything
// inside the returned JSX — the button, VinylCardFace, the text block —
// is copied verbatim from the previous version; only the outer
// motion.article's animation source changed.
function MobileWorkCard({
  concept,
  title,
  desc,
  cover,
  track,
  isCurrent,
  isPlaying,
  seed,
  currentTime,
  duration,
  onActivate,
  t,
}: {
  concept: string;
  title: string;
  desc: string;
  cover: string;
  track: AudioTrack | null;
  isCurrent: boolean;
  isPlaying: boolean;
  seed: number;
  currentTime: number;
  duration: number;
  onActivate: (track: AudioTrack | null) => void;
  t: (s: string) => string;
}) {
  const reduce = useReducedMotion() ?? false;
  const cardRef = useRef<HTMLElement>(null);

  // Progress 0 -> the card's top edge is at the viewport's bottom edge
  // (just about to enter, from below). Progress 1 -> the card's bottom
  // edge is at the viewport's top edge (just about to leave, off the
  // top). 0.5 lands close to the card passing through the viewport's
  // center for typical card/viewport proportions — exactly the "focus"
  // point the fade should peak at.
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ['start end', 'end start'] });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], reduce ? [1, 1, 1] : [0.15, 1, 0.15]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], reduce ? [1, 1, 1] : [0.88, 1, 0.88]);

  return (
    <motion.article ref={cardRef} style={{ opacity, scale }}>
      <button
        type="button"
        data-cursor={track ? 'play' : undefined}
        onClick={() => onActivate(track)}
        className="block w-full text-left focus:outline-none"
        style={{ cursor: track ? 'pointer' : 'default' }}
        aria-label={track ? `${isPlaying ? t('Pause') : t('Play')} ${title}` : `${t(concept)} — ${t('coming soon')}`}
      >
        <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: '16 / 10' }}>
          <VinylCardFace
            cover={cover}
            fallback={<AnimatedFace seed={seed} active={false} />}
            title={title}
            isPlaying={isPlaying}
            isCurrent={isCurrent}
            currentTime={currentTime}
            duration={duration}
            dim={false}
          />
        </div>
        <div className="mt-4">
          <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">{t(concept)}</span>
          <h3 className="text-2xl font-display text-[var(--text-color)] leading-tight mt-1 mb-1">{title}</h3>
          {desc && <p className="text-sm text-[var(--text-muted-color)]">{desc}</p>}
        </div>
      </button>
    </motion.article>
  );
}

export default function SpatialScrollEngine() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null); // holds core + ring; recentred each frame
  const sceneRef = useRef<HTMLDivElement>(null); // the whole 3D scene wrapper; fades at scroll extremes
  const inViewRef = useRef(false); // gates the rAF loop — never runs while off-screen
  // 2026-07-12 (Reza — reported jitter/skipping while scrolling the cards,
  // confirmed reproducible even with ZERO interaction with the banner
  // journey feature): sec.getBoundingClientRect() was being read fresh
  // EVERY animation frame inside the loop below. That's two problems at
  // once: (1) it's a forced-reflow DOM read, expensive on its own, and
  // (2) — the actual cause of the jitter — this app's Lenis smooth-scroll
  // (useSmoothScroll.ts) runs its OWN independent rAF loop, interpolating
  // scroll position over a 1.2s eased duration. When the main thread stalls
  // for any reason, Lenis's interpolation can visibly "catch up" with a
  // jump on whichever frame it next gets to run. Reading raw DOM position
  // every frame from a SEPARATE, independently-scheduled rAF loop meant
  // this component had no guaranteed ordering relative to Lenis's own
  // updates — exactly the kind of two-independent-loops race that produces
  // visible stutter/skips. FIX: read window.scrollY instead (a plain,
  // non-reflow-forcing number — NOT a second competing measurement, just
  // the one true scroll position that both native scrolling and Lenis
  // alike are already writing to) combined with the section's own
  // page-absolute top, measured ONCE on mount and re-measured only on
  // resize/content-size changes — never every frame.
  const metricsRef = useRef({ top: 0, height: 0 });
  const { tracks, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const { audioState, playTrack, pauseTrack, setPlaylist } = useAudio();
  const { t } = useT();
  const [dims, setDims] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1600,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [frontIndex, setFrontIndex] = useState(0);
  const [started, setStarted] = useState(false);

  // Rotation is driven by SCROLL ONLY now — hovering never rotates the
  // sphere (accidental mouse passes over other cards were causing unwanted
  // spins). Hover can only ever "activate" (colour + highlight) whichever
  // card scroll has already brought to the front.
  const rotationRef = useRef(0); // the single eased rotation value (degrees)
  const [hoveredFront, setHoveredFront] = useState(false);

  useEffect(() => {
    const c = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, []);
  const isMobile = dims.w < 768;

  // ----- DATA PLUMBING (unchanged) -----
  const cards = useMemo<ConceptCard[]>(() => {
    const live = (tracks ?? []).filter((t) => t.isLive);
    return CONCEPT_ORDER.map((concept, index) => {
      const featured = live.find((t) => t.isFeatured && (t.concept ?? '') === concept) ?? null;
      return { concept, blurb: CONCEPT_BLURB[concept] ?? '', track: featured, index };
    });
  }, [tracks]);

  const featuredTracks = useMemo(() => cards.map((c) => c.track).filter((t): t is AudioTrack => !!t), [cards]);
  useEffect(() => {
    if (featuredTracks.length) setPlaylist(featuredTracks);
  }, [featuredTracks, setPlaylist]);

  const onCardClick = (track: AudioTrack | null) => {
    if (!track) return;
    const isThis = audioState.currentTrack?.id === track.id;
    if (isThis && audioState.isPlaying) pauseTrack();
    else void playTrack(track);
  };

  const localized = (m: { en?: string } | Record<string, string> | null | undefined): string => {
    if (!m) return '';
    const rec = m as Record<string, string>;
    return rec[safeLocale] || rec.en || '';
  };

  // ----- CACHED SECTION METRICS — measured on mount/resize only, never per
  // frame (see the note on metricsRef above for why this replaced a
  // per-frame getBoundingClientRect() call). -----
  useEffect(() => {
    if (isMobile || !sectionRef.current) return;
    const sec = sectionRef.current;
    const measure = () => {
      const r = sec.getBoundingClientRect();
      metricsRef.current = { top: r.top + window.scrollY, height: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    window.addEventListener('resize', measure);
    // Defensive re-sync (2026-07-12, still-reported jitter after the
    // window.scrollY fix above): the ResizeObserver only fires when THIS
    // section's own box changes size — it can't see the section's
    // ABSOLUTE PAGE POSITION drifting because something ABOVE it (e.g. the
    // rotating banner swapping to a differently-proportioned image) grew
    // or shrank. A cheap, infrequent (not per-frame) re-measure catches
    // that drift and self-corrects it before it can show up as a jump.
    const resync = window.setInterval(measure, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.clearInterval(resync);
    };
  }, [isMobile]);

  // ----- VISIBILITY GATE — never run the loop while off-screen -----
  // This is the fix for the reported hang on load: the rAF loop below does a
  // layout-forcing getBoundingClientRect() plus several style writes EVERY
  // FRAME. Previously it ran permanently from mount, even while this section
  // sat many viewports away (e.g. right after a fresh page load). Now it is
  // fully suspended until the section is actually near the viewport.
  useEffect(() => {
    if (isMobile || !sectionRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => { inViewRef.current = !!entry?.isIntersecting; },
      { rootMargin: '50% 0px 50% 0px' } // start slightly before it's fully on-screen
    );
    io.observe(sectionRef.current);
    return () => io.disconnect();
  }, [isMobile]);

  // ----- MANUAL PIN + EASED WHOLE-RING ROTATION (Lenis/sticky-proof) -----
  useEffect(() => {
    if (isMobile) return;
    let raf = 0;
    const EASE = 0.07; // one luxury easing for transit AND settle
    const FADE_ZONE = 0.1; // fraction of scroll range used for in/out fade

    const loop = () => {
      if (!inViewRef.current) {
        raf = requestAnimationFrame(loop);
        return; // section is off-screen — do nothing (fixes the load-time hang)
      }
      const sec = sectionRef.current;
      const stage = stageRef.current;
      const sph = sphereRef.current;
      const anchor = anchorRef.current;
      const scene = sceneRef.current;
      if (sec && stage && sph && anchor) {
        const { top: sectionTop, height: sectionHeight } = metricsRef.current;
        const vh = window.innerHeight;
        const total = Math.max(1, sectionHeight - vh);
        const y = Math.min(Math.max(window.scrollY - sectionTop, 0), total);
        stage.style.transform = `translate3d(0, ${y}px, 0)`;

        const p = y / total;

        // SNAP-STOP ROTATION: scroll is divided into exactly 12 bands, one
        // per card. Within a band the target angle is CONSTANT, so the
        // cylinder rotates in, then locks dead-on facing the viewer (X0/Y0,
        // face-on) and DWELLS there — the requested pause/settle — until
        // scroll crosses into the next band. The labelled card is therefore
        // always the one arriving at / seated in the front slot, never a
        // card on the far side.
        const targetIdx = Math.min(N - 1, Math.max(0, Math.floor(p * N)));
        const targetG = -targetIdx * STEP_DEG;

        const near = nearestEquivalent(rotationRef.current, targetG);
        rotationRef.current += (near - rotationRef.current) * EASE;
        sph.style.transform = `rotateX(8deg) rotateY(${rotationRef.current}deg)`;

        setFrontIndex((f) => (f === targetIdx ? f : targetIdx));
        if (p > 0.02) setStarted((s) => s || true);

        // Keep the front slot locked at screen (0,0): the helix climbs a
        // fixed step per card, so counter-shift the WHOLE assembly (core +
        // cylinder together) by the continuous virtual front height — during
        // the dwell this is exact, so the seated card's centre is precisely
        // X0/Y0 in its own frame.
        const ivirt = -rotationRef.current / STEP_DEG;
        const frontY = (ivirt + 0.5 - N / 2) * radiusRef.current * HELIX_FRAC;
        anchor.style.transform = `translate3d(0px, ${-frontY}px, 0px)`;

        // Fade the whole 3D scene in/out at the extremes of the pinned
        // journey, melting into the seam veils instead of an abrupt cut.
        if (scene) {
          const fadeIn = Math.min(1, p / FADE_ZONE);
          const fadeOut = Math.min(1, (1 - p) / FADE_ZONE);
          scene.style.opacity = String(Math.min(fadeIn, fadeOut));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isMobile]);

  // Ring geometry — evenly spaced, clamped to always fit the viewport.
  const radius = Math.min(360, Math.round(dims.h * 0.4), Math.round(dims.w * 0.26));
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const cardW = Math.round(radius * 0.5);
  const cardH = cardW;
  const coreSize = Math.round(radius * 1.35);

  const activeCard = cards[frontIndex] ?? cards[0]!;
  const activeTitle = activeCard.track ? (localized(activeCard.track.title) || t('Untitled')) : t(activeCard.concept);
  const activeDesc = activeCard.track ? localized(activeCard.track.narrative) : t(activeCard.blurb);
  const activeLine = POETIC_LINES[frontIndex % POETIC_LINES.length]!;
  const activeYear = activeCard.track ? new Date(activeCard.track.createdAt).getFullYear() : null;

  const descRef = useBalancedText<HTMLParagraphElement>();
  const lineRef = useBalancedText<HTMLParagraphElement>();

  // ----- MOBILE: reliable vertical reveal. -----
  if (isMobile) {
    return (
      <section id="selected-works-orbit" className="relative py-16 px-4">
        <style>{SSE_STYLES}</style>
        <header className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
            {t('The Score')}
          </span>
          <h2 className="text-3xl font-display text-[var(--text-color)] mt-2">{t('Selected Works')}</h2>
        </header>
        <div className="flex flex-col gap-14">
          {cards.map((card, ci) => {
            const { concept, blurb, track } = card;
            const title = track ? (localized(track.title) || t('Untitled')) : t(concept);
            const desc = track ? localized(track.narrative) : t(blurb);
            const cover = track ? trackCover(track) : '';
            const isCurrent = !!track && audioState.currentTrack?.id === track.id;
            const isPlaying = isCurrent && audioState.isPlaying;
            return (
              <MobileWorkCard
                key={concept}
                concept={concept}
                title={title}
                desc={desc}
                cover={cover}
                track={track}
                isCurrent={isCurrent}
                isPlaying={isPlaying}
                seed={ci}
                currentTime={audioState.currentTime}
                duration={audioState.duration}
                onActivate={onCardClick}
                t={t}
              />
            );
          })}
        </div>
      </section>
    );
  }

  // ----- DESKTOP: the orbital ring around the luminous core. -----
  return (
    <section ref={sectionRef} id="selected-works-orbit" className="relative" style={{ height: `${N * 90}vh`, marginTop: '16vh' }}>
      <style>{SSE_STYLES}</style>
      <div ref={stageRef} className="absolute left-0 right-0 top-0 h-screen overflow-hidden" style={{ willChange: 'transform' }}>
        <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ height: 140, background: 'linear-gradient(to bottom, var(--surface-color), transparent)', zIndex: 30 }} />
        <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 140, background: 'linear-gradient(to top, var(--surface-color), transparent)', zIndex: 30 }} />

        <div className="absolute z-20" style={{ top: '7%', left: '5%' }}>
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-[var(--accent-color)] font-mono">{t('The Score')}</span>
          <h2 className="font-display text-[var(--text-color)] mt-2" style={{ fontSize: 'clamp(1.6rem, 2.2vw, 2.2rem)', lineHeight: 1.05 }}>
            {t('Selected Works')}
          </h2>
          <div style={{ marginTop: 12, width: 60, height: 1, background: 'linear-gradient(to right, rgba(var(--accent-rgb),0.75), transparent)' }} />
        </div>

        {/* Editorial panel — always the true front card (exactly one, by construction). */}
        <div className="absolute z-20" style={{ top: '50%', left: '5%', transform: 'translateY(-50%)', width: 'min(21vw, 310px)' }}>
          <motion.div key={frontIndex} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-[0.66rem] uppercase tracking-[0.22em] text-[var(--accent-color)] font-mono">{t(activeCard.concept)}</span>
              {activeYear ? <span className="text-[0.66rem] text-[var(--text-muted-color)] font-mono">{activeYear}</span> : null}
            </div>
            <h3 className="font-display text-[var(--text-color)] leading-[1.04] mb-4" style={{ fontSize: 'clamp(1.7rem, 2.5vw, 2.5rem)' }}>
              {activeTitle}
            </h3>
            {activeDesc && (
              <p ref={descRef} className="text-[var(--text-muted-color)]" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
                {activeDesc}
              </p>
            )}
            {!activeCard.track && (
              <p className="text-[0.64rem] uppercase tracking-[0.26em] text-[var(--text-dim-color)] font-mono mt-4">{t('In composition')}</p>
            )}
          </motion.div>
        </div>

        {/* Mirror panel — the poetic line, symmetric on the right (was
            previously bundled under the left panel; now its own quiet
            counterweight, echoing the cylinder's centre).
            - Width matches the left panel EXACTLY (true mirror symmetry).
            - The accent border lives on this FIXED outer box, not on the
              paragraph itself — different quotes balance to different
              widths, and a border attached to the text was visibly sliding
              left/right as it changed (the reported X-axis jitter). The box
              itself never moves; only the text inside re-balances.
            - marginLeft:'auto' keeps the (possibly narrower) balanced text
              flush against the box's own right edge, next to the border. */}
        <div className="absolute z-20 text-right" style={{ top: '50%', right: '5%', transform: 'translateY(-50%)', width: 'min(21vw, 310px)', borderRight: '1px solid rgba(var(--accent-rgb),0.4)', paddingRight: 13 }}>
          <motion.div key={`line-${frontIndex}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}>
            <p ref={lineRef} className="font-display italic" style={{ fontSize: 'clamp(0.95rem, 1.2vw, 1.1rem)', lineHeight: 1.5, color: 'rgba(var(--accent-rgb),0.92)', marginLeft: 'auto' }}>
              <EditableText contentKey={`works.quote.${frontIndex}`} defaultValue={t(activeLine)} as="span" />
            </p>
            <span className="font-mono uppercase" style={{ display: 'block', marginTop: 8, fontSize: '0.62rem', letterSpacing: '0.22em', color: 'var(--text-dim-color)' }}>
              — <EditableText contentKey="identity.name" defaultValue="Amir Moslehi" as="span" />
            </span>
          </motion.div>
        </div>

        {/* 3D scene — core + ring share one preserve-3d context so depth is real. */}
        <div ref={sceneRef} className="absolute inset-0 flex items-center justify-center" style={{ perspective: '1500px', opacity: 0, willChange: 'opacity', transition: 'opacity 0.4s ease-out' }}>
          <div ref={anchorRef} style={{ position: 'relative', width: 0, height: 0, transformStyle: 'preserve-3d', willChange: 'transform' }}>
            {/* luminous core — two ultra-soft layers (lighter than before: fewer
                blur passes = far cheaper to repaint every frame), zero hard edge */}
            <div className="sse-anim" aria-hidden style={{ position: 'absolute', width: coreSize, height: coreSize, left: -coreSize / 2, top: -coreSize / 2, transform: 'translateZ(0px)', pointerEvents: 'none', animation: 'sseCoreBreathe 6s ease-in-out infinite' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.38) 0%, rgba(var(--accent-rgb),0.14) 34%, transparent 64%)', filter: 'blur(5px)' }} />
              <div style={{ position: 'absolute', inset: '-30%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.14) 0%, rgba(var(--accent-rgb),0.05) 42%, transparent 70%)', filter: 'blur(14px)' }} />
            </div>

            {/* the ring — ONLY this wrapper's rotateY ever changes */}
            <div ref={sphereRef} style={{ position: 'absolute', left: 0, top: 0, transformStyle: 'preserve-3d', willChange: 'transform' }}>
              {cards.map((card, i) => {
                // CYLINDER HELIX: azimuth is an EXACT 30-degree multiple per
                // card (equal turn order, unaffected by rotation) and EVERY
                // card rides the SAME ring radius on the cylinder wall —
                // perfect equality of presence — while climbing one fixed
                // helix step per index: the approved "drill".
                const theta = i * STEP_DEG;
                const thetaRad = (theta * Math.PI) / 180;
                const x = radius * Math.sin(thetaRad);
                const y = (i + 0.5 - N / 2) * radius * HELIX_FRAC;
                const z = radius * Math.cos(thetaRad);
                const track = card.track;
                const title = track ? (localized(track.title) || t('Untitled')) : t(card.concept);
                const cover = track ? trackCover(track) : '';
                const isFront = i === frontIndex;
                // "Active" (coloured + highlighted) requires BOTH: scroll has
                // already brought this card to front, AND the mouse is
                // actually over it. Hovering any other card does nothing.
                const isActive = isFront && hoveredFront;
                const isCurrent = !!track && audioState.currentTrack?.id === track.id;
                const isPlaying = isCurrent && audioState.isPlaying;

                return (
                  <div
                    key={card.concept}
                    onMouseEnter={() => { if (isFront) setHoveredFront(true); }}
                    onMouseLeave={() => { if (isFront) setHoveredFront(false); }}
                    style={{
                      position: 'absolute',
                      width: cardW,
                      height: cardH,
                      left: -cardW / 2,
                      top: -cardH / 2,
                      transformStyle: 'preserve-3d',
                      transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${theta}deg) scale(${isActive ? 1.15 : isFront ? 1.08 : 1})`,
                      transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease, box-shadow 0.4s ease',
                      zIndex: isFront ? 40 : 1,
                    }}
                  >
                    <button
                      type="button"
                      data-cursor={track ? 'play' : undefined}
                      onClick={() => onCardClick(track)}
                      className="block w-full h-full focus:outline-none rounded-3xl overflow-hidden"
                      style={{ cursor: track ? 'pointer' : 'default' }}
                      aria-label={track ? `${isPlaying ? t('Pause') : t('Play')} ${title}` : `${t(card.concept)} — ${t('coming soon')}`}
                    >
                      <div
                        className="relative w-full h-full rounded-3xl overflow-hidden"
                        style={{
                          border: isCurrent ? '1px solid rgba(var(--accent-rgb),0.9)' : isFront ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(255,255,255,0.07)',
                          boxShadow: isActive
                            ? '0 26px 64px rgba(0,0,0,0.6), 0 0 34px rgba(var(--accent-rgb),0.32)'
                            : isFront
                              ? '0 20px 48px rgba(0,0,0,0.58), 0 0 20px rgba(var(--accent-rgb),0.16)'
                              : '0 14px 34px rgba(0,0,0,0.55)',
                          background: '#0B0B0E',
                          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
                        }}
                      >
                        <VinylCardFace
                          cover={cover}
                          fallback={<AnimatedFace seed={i} active={isActive} />}
                          title={title}
                          isPlaying={isPlaying}
                          isCurrent={isCurrent}
                          currentTime={audioState.currentTime}
                          duration={audioState.duration}
                          dim={!isActive}
                        />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="absolute z-20 text-center" style={{ bottom: '5%', left: '50%', transform: 'translateX(-50%)', opacity: started ? 0 : 0.7, transition: 'opacity 0.8s ease' }}>
          <span className="text-[0.62rem] uppercase tracking-[0.32em] text-[var(--text-muted-color)] font-mono">{t('Scroll to explore')}</span>
        </div>
      </div>
    </section>
  );
}

