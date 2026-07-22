import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { PointerEvent as RPointerEvent, KeyboardEvent as RKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useT } from '../context/TranslationContext';
import { ConceptMotif, conceptTint } from './conceptArt';
import { useBalancedText } from '../hooks/useBalancedText';
import EditableImage from './EditableImage';
import MirrorShatterPortrait from './MirrorShatterPortrait';
import type { AudioTrack, Locale } from '../types';

// Section 03 - Works as a VERTICAL PIANO anchored to the left edge.
// All 12 concepts are ALWAYS shown as keys (whether or not they hold tracks).
// Clicking a key opens a full-screen overlay listing that concept's tracks
// (thumbnail + title + caption). Clicking a track plays it in place (global
// AudioContext) and shows a luxe "now playing" sound-wave over its thumbnail.
// Empty concepts show an elegant "coming soon" message.

// The canonical 12 concepts + an "Other Works" catch-all. This ORDER is the
// single source of truth shared with the Admin concept selector.
const ORDER = [
  'Cinema', 'Television', 'Games', 'Animation', 'Documentary', 'Advertising',
  'Trailers', 'Theatre', 'Dance', 'Concert', 'Immersive', 'Albums',
] as const;

const BLURBS: Record<string, string> = {
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

// Track coverArt fallback: API returns raw `coverUrl`, the front reads
// `coverArt?.url`. Always fall back to coverUrl so thumbnails don't go black.
function trackCover(t: AudioTrack): string {
  return t.coverArt?.url || (t as unknown as { coverUrl?: string }).coverUrl || '';
}

function trackTitle(t: AudioTrack): string {
  return t.title?.en || 'Untitled';
}

function trackCaption(t: AudioTrack): string {
  return t.narrative?.en || '';
}

interface ConceptGroup {
  label: string;
  blurb: string;
  tracks: AudioTrack[];
}

const NOTE_HZ = [
  261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99,
];

// Reza (2026-07-10): the reveal was finishing almost instantly — the keys
// and the mirror portrait were both fully "there" well before he'd even
// started scrolling into the section, because the OLD 0.6 fraction was
// measured against a short offset (['start end','start start'] = exactly
// one viewport-height of scroll). Now split into two pieces, both shared
// by PianoLane AND MirrorShatterPortrait so they can never drift apart:
//   - START_OFFSET: a deliberate dead zone of plain scrolling BEFORE
//     anything starts assembling (per Reza's follow-up: it was still
//     kicking off too early even after the first fix).
//   - REVEAL_SPAN: how much of progress, starting from START_OFFSET, the
//     reveal takes to complete. START_OFFSET + REVEAL_SPAN is the exact
//     progress value everything must be fully settled by — the section's
//     natural reading position (the 2026-07-07 constraint, preserved).
// Reza (2026-07-11): precise anchor given — when the section header
// ("SECTION 03 — SELECTED WORKS / Play a concept.") reaches the TOP of
// the viewport, BOTH the piano keys and the mirror portrait must be
// fully finished. That moment is exactly progress=1 under the
// ['start end','start start'] offset below (section top hits viewport
// top). So completion (START_OFFSET + REVEAL_SPAN) is pinned to exactly
// 1 — not "close to 1", exactly 1, by construction. Also pushed the
// start further back per his "push the timing back more" — more plain
// scrolling before anything begins, all still finishing at that same
// fixed anchor.
const START_OFFSET = 0.35;
const REVEAL_SPAN = 1 - START_OFFSET;

let toneCtx: AudioContext | null = null;

// K1 fix (2026-07-02): pre-warm the piano's AudioContext on the FIRST
// qualifying user gesture anywhere on the page (same gesture class the
// shared site audio engine already listens for), instead of lazily
// constructing + resuming it on the first key hover. A freshly-constructed
// AudioContext usually starts 'suspended', and resume() is async - that
// gap was the perceptible delay before the first note played. Warming it
// up ahead of time means it's already running by the time anyone reaches
// the piano section.
let toneCtxWarmed = false;
function warmToneCtx() {
  if (toneCtxWarmed || typeof window === 'undefined') return;
  toneCtxWarmed = true;
  try {
    if (!toneCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      toneCtx = new Ctor();
    }
    if (toneCtx.state === 'suspended') void toneCtx.resume();
  } catch {
    /* non-essential */
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('click', warmToneCtx, { passive: true, once: true });
  window.addEventListener('touchstart', warmToneCtx, { passive: true, once: true });
  window.addEventListener('keydown', warmToneCtx, { once: true });
}

function playNote(freq: number) {
  try {
    if (!toneCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      toneCtx = new Ctor();
    }
    const ctx = toneCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.85);
  } catch {
    /* non-essential */
  }
}

// One track card's caption, balanced independently (each card needs its own
// hook instance — cannot call useBalancedText conditionally inside a .map).
function TrackCaption({ text }: { text: string }) {
  const ref = useBalancedText<HTMLParagraphElement>('justify');
  const { t } = useT();
  // 2026-07-22 (per Reza): long captions could run on indefinitely under
  // the focused card — clamped to 2 lines with an explicit "See more" /
  // "Show less" toggle instead, same pattern as the ring-card captions in
  // SpatialScrollEngine.tsx. Resets to collapsed whenever the caption
  // text itself changes (i.e. a different track becomes focused) so the
  // next card never silently starts pre-expanded.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [text]);
  // Note: text-align is controlled entirely by useBalancedText's own
  // `align` param above (it writes el.style.textAlign imperatively on
  // every render, which would silently overwrite any textAlign set here
  // via React's style prop) — do NOT set textAlign in this component's
  // own inline styles below, it would have no visible effect.
  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p
        ref={ref}
        className="font-display font-light"
        style={
          expanded
            ? { fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-dim-color)' }
            : {
                fontSize: '0.9rem',
                lineHeight: 1.55,
                color: 'var(--text-dim-color)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-1 text-xs underline"
        style={{ color: 'var(--accent-color)', pointerEvents: 'auto' }}
      >
        {expanded ? t('Show less') : t('See more')}
      </button>
    </div>
  );
}

// Luxe "now playing" equaliser — five slim gold bars gently rising/falling.
function NowPlaying({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div
      className="absolute inset-0 flex items-end justify-center gap-[3px] pointer-events-none"
      style={{
        padding: '0 0 14%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.05) 55%, transparent)',
      }}
      aria-hidden
    >
      {bars.map((b) => (
        <motion.span
          key={b}
          style={{
            width: 'clamp(3px, 0.5vw, 5px)',
            borderRadius: '2px',
            background: 'linear-gradient(to top, var(--accent2-color, #B8960C), var(--accent-color))',
            boxShadow: '0 0 8px rgba(212,175,55,0.5)',
          }}
          initial={{ height: '12%' }}
          animate={active ? { height: ['18%', '62%', '30%', '54%', '22%'] } : { height: '14%' }}
          transition={active ? { duration: 1.1 + b * 0.18, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay: b * 0.08 } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

// One realistic ivory piano key (a horizontal lane). Length steps down by
// `lengthPct` (1.0 = longest top key, smaller = shorter lower keys).
function PianoLane({
  group,
  index,
  total,
  progress,
  reduce,
  freq,
  lengthPct,
  isLast,
  onActivate,
}: {
  group: ConceptGroup;
  index: number;
  total: number;
  progress: MotionValue<number>;
  reduce: boolean;
  freq: number;
  lengthPct: number;
  isLast: boolean;
  onActivate: (label: string) => void;
}) {
  const { t } = useT();
  const [pressed, setPressed] = useState(false);

  const slice = REVEAL_SPAN / total;
  const start = START_OFFSET + index * slice;
  const end = start + slice;

  // Softened per Reza (2026-07-10): the old version faded in across only
  // HALF the slice (snappy). This now eases across the FULL slice with an
  // intermediate keyframe, so each key arrives more gradually — still
  // fully settled by `end`, so the section-must-be-complete-by-arrival
  // rule from 2026-07-07 (see the scrollYProgress comment below) still
  // holds; only the per-key curve got gentler, not the total window.
  const x = useTransform(progress, [start, start + slice * 0.7, end], reduce ? ['0%', '0%', '0%'] : ['-105%', '-18%', '0%']);
  const opacity = useTransform(progress, [start, start + slice * 0.6, end], [0, 0.7, 1]);
  const labelOpacity = useTransform(progress, [end - slice * 0.3, end + 0.02], [0, 1]);
  const labelX = useTransform(progress, [end - slice * 0.3, end + 0.02], reduce ? [0, 0] : [-14, 0]);

  const press = useCallback(() => { setPressed(true); playNote(freq); }, [freq]);

  // Longest key ~ 32vw, shortest ~ 8vw (4:1 ratio, scaled down with the
  // shorter lane height so keys keep their proportions). Clamped for sanity.
  const minVW = 8;
  const maxVW = 32;
  const widthVW = minVW + (maxVW - minVW) * lengthPct;

  const count = group.tracks.length;

  return (
    <div className="relative flex items-center" style={{ height: 'clamp(1.35rem, 2.7vh, 1.85rem)' }}>
      {/* Decorative black key nestled in the gap to the NEXT white key
          (shorter than the white key, 3D, like a real piano). Not for last. */}
      {!isLast && (
        <motion.div
          aria-hidden
          className="absolute z-20 pointer-events-none"
          style={{
            left: 0,
            bottom: 'calc(-1 * clamp(0.15rem, 0.35vh, 0.25rem) - 0.5px)',
            width: `clamp(1rem, ${widthVW * 0.6}vw, ${widthVW * 0.4}rem)`,
            height: 'clamp(1.36rem, 2.72vh, 1.84rem)',
            transform: 'translateY(50%)',
            opacity,
          }}
        >
          <svg viewBox="0 0 130 24" preserveAspectRatio="none" className="w-full h-full block">
            <defs>
              <linearGradient id={`ebony-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3A3A3A" />
                <stop offset="22%" stopColor="#1E1E1E" />
                <stop offset="80%" stopColor="#0B0B0B" />
                <stop offset="100%" stopColor="#000000" />
              </linearGradient>
            </defs>
            <path d="M0,1 H118 Q128,1 128,8 V16 Q128,23 118,23 H0 Z" fill={`url(#ebony-${index})`} stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            {/* top sheen for 3D */}
            <rect x="0" y="1" width="128" height="3" fill="rgba(255,255,255,0.16)" />
            {/* front lip */}
            <path d="M0,18 H128 V16 Q128,23 118,23 H0 Z" fill="rgba(0,0,0,0.6)" />
          </svg>
        </motion.div>
      )}

      {/* The ivory key (realistic: light face, soft right shadow, rounded right end) */}
      <motion.button
        type="button"
        data-cursor="play"
        onClick={() => onActivate(group.label)}
        onMouseEnter={press}
        onMouseLeave={() => setPressed(false)}
        onFocus={press}
        onBlur={() => setPressed(false)}
        className="relative h-full focus:outline-none pk-hit-slop"
        style={{
          x,
          opacity,
          width: `clamp(1.5rem, ${widthVW}vw, ${widthVW * 0.6}rem)`,
          transformOrigin: 'left center',
        }}
        aria-label={`${t('Explore')} ${t(group.label)} (${count} ${count === 1 ? t('track') : t('tracks')})`}
      >
        <svg viewBox="0 0 220 44" preserveAspectRatio="none" className="w-full h-full block"
          style={{ transform: pressed && !reduce ? 'translateX(8px)' : 'translateX(0)', transition: 'transform 0.18s cubic-bezier(0.5,0,0.2,1)' }}>
          <defs>
            <linearGradient id={`ivory-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="14%" stopColor="#FCFCF9" />
              <stop offset="55%" stopColor="#F0F0EA" />
              <stop offset="86%" stopColor="#E2E2DA" />
              <stop offset="100%" stopColor="#CFCFC6" />
            </linearGradient>
            {/* left-edge bevel: a soft dark-to-transparent for 3D depth */}
            <linearGradient id={`bevelL-${index}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(0,0,0,0.28)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
            {/* right tip rounded shading for volume */}
            <linearGradient id={`bevelR-${index}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.16)" />
            </linearGradient>
          </defs>
          {/* key body — rounded on all corners, more on the right tip */}
          <path d="M6,2 H202 Q218,2 218,12 V32 Q218,42 202,42 H6 Q2,42 2,38 V6 Q2,2 6,2 Z"
            fill={pressed ? '#FFFFFF' : `url(#ivory-${index})`}
            stroke="rgba(0,0,0,0.16)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          {/* top sheen */}
          <path d="M6,2 H202 Q218,2 218,12 V16 H2 V6 Q2,2 6,2 Z" fill="#FFFFFF" opacity="0.45" />
          {/* bottom contact shadow for stacked depth */}
          <path d="M2,34 H218 V32 Q218,42 202,42 H6 Q2,42 2,38 Z" fill="rgba(0,0,0,0.14)" />
          {/* left + right bevels (3D volume) */}
          <rect x="2" y="2" width="26" height="40" fill={`url(#bevelL-${index})`} />
          <rect x="170" y="2" width="48" height="40" fill={`url(#bevelR-${index})`} />
          {/* gold tip strip flush left when pressed */}
          <rect x="2" y="6" width="4" height="32" rx="2" fill="var(--accent-color)" opacity={pressed ? 1 : 0} style={{ transition: 'opacity 0.2s ease' }} />
        </svg>
      </motion.button>

      {/* Concept label — horizontal, just outside the key on its right */}
      <motion.button
        type="button"
        data-cursor="play"
        onClick={() => onActivate(group.label)}
        onMouseEnter={press}
        onMouseLeave={() => setPressed(false)}
        className="flex items-baseline gap-4 focus:outline-none text-left"
        style={{ opacity: labelOpacity, x: labelX, marginLeft: 'clamp(1rem, 2.5vw, 2.25rem)' }}
      >
        <span className="font-display font-light whitespace-nowrap"
          style={{ fontSize: 'clamp(1.1rem, 2.3vw, 1.9rem)', letterSpacing: '0.02em', lineHeight: 1, color: pressed ? 'var(--accent-color)' : 'var(--text-color)', transition: 'color 0.3s ease' }}>
          {t(group.label)}
        </span>
        <span className="font-mono whitespace-nowrap hidden md:inline"
          style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: 'var(--text-dim-color)' }}>
          {count > 0 ? `${String(count).padStart(2, '0')} ${count === 1 ? t('track') : t('tracks')}` : t('soon')}
        </span>
      </motion.button>
    </div>
  );
}

// C1-C3: circular scroll carousel replacing the concept grid. The reference
// CSS demo (`animation-timeline: scroll()` + `offset-path: circle`) is
// Chromium-only, so this reimplements the identical feel with a JS driver.
//
// GEOMETRY (the root-cause fix): with a fixed 24-degree step, any list of
// more than 15 items spans past 360 degrees — items were literally landing
// ON TOP of each other (card 15 at the exact angle of card 0, etc.), which
// buried the sharp focus card under blurred duplicates and destroyed the
// layout/size/highlight. Angles are therefore computed with MOD-N index
// arithmetic relative to the continuous centre index: every card always has
// a UNIQUE slot in [-n/2, n/2) steps, and the wheel loops infinitely with no
// collision, for any item count.
//
// INPUT: React 17+ registers `wheel` listeners passively, so a synthetic
// onWheel's preventDefault() is silently ignored — the page scrolled instead
// of the wheel stepping. The wheel handler is attached NATIVELY with
// { passive: false } so detent stepping actually receives the gesture.
interface CarouselItem {
  key: string;
  cover: string;
  title: string;
  caption: string;
  concept: string;
  isCurrent: boolean;
  isPlaying: boolean;
  placeholder: boolean;
  tint?: string;
  onSelectPlay?: () => void;
}

const STEP_DEG = 24;
const VISIBLE_CUTOFF_DEG = 60; // exactly 5 slots on screen: centre, +-1, +-2

function CarouselCard({
  item,
  angleDeg,
  radius,
  isFocus,
  instant,
  onSelect,
}: {
  item: CarouselItem;
  angleDeg: number; // ALREADY signed + unique (mod-n relative angle)
  radius: number;
  // Focus/position/highlight are ALL derived from the same single rotation
  // value every render — there is no separate "target" anything could lag
  // behind, so this is always exactly in sync with what's on screen.
  isFocus: boolean;
  // true while the user is actively dragging: the CSS transition below is
  // switched off during a drag (position updates 1:1 with the pointer every
  // frame; a transition here would itself reintroduce a lag, chasing the
  // cursor). It switches back on the instant the drag ends, for one smooth
  // luxury glide into the snapped position.
  instant: boolean;
  onSelect: () => void;
}) {
  const rad = (angleDeg * Math.PI) / 180;
  const gap = Math.abs(angleDeg);
  const dist = Math.min(1, gap / VISIBLE_CUTOFF_DEG); // 0 (focus) .. 1 (edge)
  const hidden = gap > VISIBLE_CUTOFF_DEG;
  const x = radius * Math.sin(rad);
  const y = radius * (1 - Math.cos(rad)) * 0.8; // arc dip, like the reference
  const tilt = angleDeg * 0.3;

  if (hidden) return null; // never mount far-side slots at all

  return (
    <button
      type="button"
      data-cursor={item.placeholder ? undefined : 'play'}
      onClick={onSelect}
      className="absolute focus:outline-none rounded-2xl overflow-hidden group"
      style={{
        width: 172,
        height: 252,
        left: '50%',
        top: '36%',
        marginLeft: -86,
        marginTop: -126,
        // STRONG, UNMISTAKABLE contrast — independent of the underlying
        // artwork (placeholder motifs are moody/dark by design, so filters
        // alone weren't proof enough that the focus card is "the one"; a
        // real scale jump + a hard accent ring + a solid glow behind it now
        // make it obvious regardless of content).
        transform: `translate3d(${x}px, ${y}px, 0px) rotate(${tilt}deg) scale(${isFocus ? 1.18 : 1 - dist * 0.3})`,
        filter: `blur(${dist * 10}px) grayscale(${Math.min(1, dist * 1.6) * 100}%) brightness(${1 - dist * 0.78})`,
        opacity: 1 - dist * 0.15,
        boxShadow: isFocus
          ? '0 0 0 3px rgba(var(--accent-rgb),0.9), 0 0 70px 14px rgba(var(--accent-rgb),0.55), 0 20px 50px rgba(0,0,0,0.6)'
          : 'none',
        zIndex: Math.round((1 - dist) * 100) + (isFocus ? 50 : 0),
        willChange: 'transform, filter',
        transition: instant
          ? 'filter 0.12s linear, opacity 0.2s ease'
          : 'transform 0.9s cubic-bezier(0.22,1,0.36,1), filter 0.7s cubic-bezier(0.22,1,0.36,1), opacity 0.55s ease, box-shadow 0.6s ease',
      }}
      aria-label={item.placeholder ? item.title : `${item.isPlaying ? 'Pause' : 'Play'} ${item.title}`}
      aria-current={isFocus || undefined}
    >
      <div
        className="relative w-full h-full"
        style={{
          borderRadius: 10,
          border: item.isCurrent ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
          background: 'rgba(255,255,255,0.02)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        }}
      >
        {item.cover ? (
          <img src={item.cover} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <ConceptMotif concept={item.concept} />
        )}
        {item.isCurrent && <NowPlaying active={item.isPlaying} />}
        {item.placeholder && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="flex items-center justify-center rounded-full transition-opacity duration-500 opacity-40 group-hover:opacity-70"
              style={{ width: '40px', height: '40px', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16"><path d="M5 3 L13 8 L5 13 Z" fill="rgba(255,255,255,0.7)" /></svg>
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

function WorkCarousel({ items }: { items: CarouselItem[] }) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ x: number; startRotation: number } | null>(null);
  const wheelAccRef = useRef(0);
  // ROTATION IS THE SINGLE SOURCE OF TRUTH — no separate "target" chased by
  // an animation loop. Every input (wheel/drag/click/keys) sets it directly,
  // synchronously, the instant it happens. There is no time/delay concept
  // left anywhere in this cycle: the highlighted card and the visual
  // position are, by construction, always the exact same value at the exact
  // same instant — they cannot go out of sync or lag behind each other the
  // way a chased/eased target could.
  const [rotation, setRotation] = useState(0);
  const [containerW, setContainerW] = useState(900);
  const [isDragging, setIsDragging] = useState(false);
  const n = items.length;
  const step = STEP_DEG;
  const radius = Math.min(containerW * 0.66, 740);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // NATIVE non-passive wheel (React 17+ registers wheel passively, which
  // silently ignores preventDefault) + capture phase (this app runs Lenis
  // smooth-scroll globally, which can otherwise grab the gesture first).
  // Works identically in BOTH directions — deltaY/deltaX can each be
  // positive or negative and Math.sign handles either sign symmetrically.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || n === 0) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      wheelAccRef.current += e.deltaY + e.deltaX;
      const TH = 60;
      let delta = 0;
      while (Math.abs(wheelAccRef.current) >= TH) {
        delta += Math.sign(wheelAccRef.current) * step;
        wheelAccRef.current -= Math.sign(wheelAccRef.current) * TH;
      }
      if (delta !== 0) setRotation((r) => r + delta);
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true } as EventListenerOptions);
  }, [n, step]);

  // Continuous index (used only for angle math / relAngle); the focused
  // card is the nearest whole step to the CURRENT rotation, computed fresh
  // on every render — there is nothing else it could lag behind.
  const virt = -rotation / step;
  const focusIndex = n > 0 ? ((Math.round(virt) % n) + n) % n : 0;
  const focusItem = items[focusIndex];

  const relAngle = (i: number): number => {
    let rel = (i - virt) % n;
    if (rel > n / 2) rel -= n;
    if (rel < -n / 2) rel += n;
    return rel * step;
  };

  const onPointerDown = (e: RPointerEvent) => {
    draggingRef.current = { x: e.clientX, startRotation: rotation };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    // 1:1 direct tracking while dragging — no CSS transition is active here
    // (see isDragging below), so this never lags behind the real cursor.
    setRotation(d.startRotation - (e.clientX - d.x) * 0.5);
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    setIsDragging(false);
    // Snap to the nearest card on release — the CSS transition re-enables
    // the instant isDragging flips false, giving one smooth luxury glide
    // into place.
    setRotation((r) => Math.round(r / step) * step);
  };
  const onKeyDown = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowRight') { setRotation((r) => r + step); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { setRotation((r) => r - step); e.preventDefault(); }
  };
  const goTo = (i: number) => {
    // Bring card i to front via the shortest path from the CURRENT position.
    setRotation((r) => r - relAngle(i));
  };

  if (n === 0) return null;

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={containerRef}
        role="listbox"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative focus:outline-none"
        style={{
          width: '100%',
          maxWidth: '96vw',
          margin: '0 auto',
          height: 'min(62vh, 560px)',
          touchAction: 'pan-y',
        }}
        aria-label={t('Circular works carousel — scroll, drag, or use arrow keys')}
      >
        {/* No hard clip here: far-side cards are never even mounted
            (returns null past VISIBLE_CUTOFF_DEG), so there's nothing left
            to clip — and a hard overflow:hidden box was slicing the focus
            card's accent glow/ring wherever it touched the boundary,
            producing stray thin line artifacts. The outer scroll area still
            has overflowX:hidden as a page-level safety net. */}
        <div className="absolute inset-0" style={{ overflow: 'visible' }}>
          {items.map((item, i) => (
            <CarouselCard
              key={item.key}
              item={item}
              angleDeg={relAngle(i)}
              radius={radius}
              isFocus={i === focusIndex}
              instant={isDragging}
              onSelect={() => {
                goTo(i);
                item.onSelectPlay?.();
              }}
            />
          ))}
        </div>

      {/* Caption — right beneath the FOCUS card. Positioning lives on this
          PLAIN div (framer-motion rewrites transforms on its own elements). */}
      {focusItem && (
        <div
          className="absolute text-center"
          style={{ maxWidth: 420, width: '100%', left: '50%', transform: 'translateX(-50%)', top: 'calc(36% + 146px)', zIndex: 200, pointerEvents: 'none' }}
        >
        <motion.div
          key={focusItem.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="font-mono uppercase inline-block mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: focusItem.tint || 'var(--accent-color)' }}>
            {t(focusItem.concept)}
          </span>
          <h3 className="font-display font-light" style={{ fontSize: 'clamp(1.05rem, 1.8vw, 1.3rem)', color: focusItem.isCurrent ? 'var(--accent-color)' : 'var(--text-color)' }}>
            {focusItem.title}
          </h3>
          {focusItem.caption && <TrackCaption text={focusItem.caption} />}
          {focusItem.placeholder && focusItem.tint && (
            <span className="font-mono uppercase inline-block mt-2" style={{ fontSize: '0.55rem', letterSpacing: '0.35em', color: focusItem.tint }}>
              {t('In composition')}
            </span>
          )}
        </motion.div>
        </div>
      )}
      </div>
    </div>
  );
}
// Full-screen concept overlay. Rendered via portal to document.body so it
// escapes the section's overflow-hidden + living-veil stacking context (the
// particle sphere / backdrop-filter cannot leak over it). Soft fade in/out,
// staggered cards, ESC + backdrop click + scroll-lock. No new route, so the
// living score, audio and particle sphere keep running underneath.
function OverlayPanel({
  group,
  onClose,
  reduce,
}: {
  group: ConceptGroup;
  onClose: () => void;
  reduce: boolean;
}) {
  const { audioState, playTrack, pauseTrack, setPlaylist } = useAudio();
  const { t } = useT();

  // Lock scroll + ESC while mounted. Lenis (smooth scroll) ignores plain body
  // overflow:hidden, so we stop the instance directly via window.__lenis and
  // also add its class + body overflow as belt-and-suspenders fallbacks.
  useEffect(() => {
    const root = document.documentElement;
    const lenis = (window as unknown as { __lenis?: { stop?: () => void; start?: () => void } | null }).__lenis;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.classList.add('lenis-stopped');
    lenis?.stop?.();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      root.classList.remove('lenis-stopped');
      lenis?.start?.();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Feed this concept's tracks to the global player as the active playlist so
  // next/prev stay within the concept.
  useEffect(() => {
    if (group.tracks.length) setPlaylist(group.tracks);
  }, [group.tracks, setPlaylist]);

  const ease: [number, number, number, number] = [0.4, 0, 0.2, 1];
  const count = group.tracks.length;

  // G5: force even wrap + no widow last-word on the concept blurb,
  // cross-browser. Re-balance when the open concept changes.
  const blurbBalanceRef = useBalancedText<HTMLParagraphElement>();

  const onTrackClick = useCallback((t: AudioTrack) => {
    const isThis = audioState.currentTrack?.id === t.id;
    if (isThis && audioState.isPlaying) {
      pauseTrack();
    } else {
      void playTrack(t);
    }
  }, [audioState.currentTrack, audioState.isPlaying, playTrack, pauseTrack]);

  return (
    <motion.div
      key="concept-overlay"
      className="works-gallery-overlay fixed inset-0 flex flex-col"
      style={{ zIndex: 9999, background: 'rgba(8,8,8,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.45, ease }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${t(group.label)} ${t('tracks')}`}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('Close')}
        data-cursor="text"
        className="btn btn--icon absolute"
        style={{
          position: 'absolute',
          zIndex: 2,
          top: 'clamp(1.25rem, 3vw, 2.25rem)',
          right: 'clamp(1.25rem, 4vw, 3rem)',
        }}
      >
        <span className="bloom" aria-hidden="true" />
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Simple, fluid, fills the real screen at any size — no locked/scaled
          canvas. Header and carousel just size themselves off vw/vh like the
          rest of the site's responsive sections. */}
      <div
        className="flex-1 min-h-0 w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overflowX: 'hidden' }}
        onClick={onClose}
      >
        <motion.div
          className="w-full h-full flex flex-col"
          style={{ padding: 'clamp(1.5rem, 4vh, 3.5rem) clamp(1.5rem, 4vw, 4rem)' }}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease, delay: reduce ? 0 : 0.05 }}
        >
          {/* Header */}
          <div className="mb-4 md:mb-6" style={{ flexShrink: 0 }}>
            <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}>
              {t('Gallery')}
            </span>
            <h2 className="font-display font-light mt-2" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1.08, color: 'var(--text-color)' }}>
              {t(group.label)}
            </h2>
            <p ref={blurbBalanceRef} className="font-display font-light mt-2" style={{ fontSize: 'clamp(0.9rem, 1.4vw, 1.05rem)', lineHeight: 1.5, color: 'var(--text-dim-color)', maxWidth: '46ch' }}>
              {t(group.blurb)}
            </p>
            {count > 0 && (
              <p className="font-mono mt-3" style={{ fontSize: '0.66rem', letterSpacing: '0.18em', color: 'var(--text-dim-color)' }}>
                {`${String(count).padStart(2, '0')} ${count === 1 ? t('TRACK') : t('TRACKS')}`}
              </p>
            )}
          </div>

          {/* C1-C3: circular scroll carousel — fills remaining space */}
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <WorkCarousel
              items={
                count === 0
                  ? Array.from({ length: 20 }, (_, i) => i).map((i) => ({
                      key: `ph-${i}`,
                      cover: '',
                      title: t('Untitled {concept} Score').replace('{concept}', t(group.label)),
                      caption: t('A piece still taking shape in the composer’s studio.'),
                      concept: group.label,
                      isCurrent: false,
                      isPlaying: false,
                      placeholder: true,
                      tint: conceptTint(group.label),
                    }))
                  : (() => {
                      // 2026-07-18 (per Reza): with only 1-2 real tracks,
                      // the carousel's own geometry (built for a full
                      // loop) rendered mostly empty space either side of
                      // one lonely card — not broken exactly, just
                      // visually sparse and unfinished-looking. Same fix
                      // as the zero-track branch above, but cycling
                      // through the REAL tracks instead of fake
                      // placeholders — a minimum of 6 slots, repeating
                      // the same handful of real tracks as many times as
                      // needed. Every repeat still points at the exact
                      // same track object (same cover/title/caption/
                      // click handler) — clicking any copy plays the
                      // same thing; only the React key differs so React
                      // doesn't collide on duplicate ids.
                      const real = group.tracks.map((tk) => {
                        const isCurrent = audioState.currentTrack?.id === tk.id;
                        return {
                          key: tk.id,
                          cover: trackCover(tk),
                          title: trackTitle(tk),
                          caption: trackCaption(tk),
                          concept: group.label,
                          isCurrent,
                          isPlaying: isCurrent && audioState.isPlaying,
                          placeholder: false,
                          onSelectPlay: () => onTrackClick(tk),
                        };
                      });
                      const MIN_LOOP = 6;
                      if (real.length >= MIN_LOOP) return real;
                      const padded = [...real];
                      let cycle = 0;
                      while (padded.length < MIN_LOOP) {
                        const source = real[cycle % real.length];
                        padded.push({ ...source, key: `${source.key}-loop${Math.floor(cycle / real.length) + 1}` });
                        cycle += 1;
                      }
                      return padded;
                    })()
              }
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ConceptOverlay({
  group,
  onClose,
  reduce,
}: {
  group: ConceptGroup | null;
  onClose: () => void;
  reduce: boolean;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {group && <OverlayPanel key="ov" group={group} onClose={onClose} reduce={reduce} />}
    </AnimatePresence>,
    document.body,
  );
}

export default function WorksGallery() {
  const { tracks, composerIdentity, locale } = useIdentity();
  const { t } = useT();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<ConceptGroup | null>(null);

  // Reza (2026-07-07): the reveal must be COMPLETE by the time the section
  // settles into its natural reading position — not still opening keys
  // several scrolls later, by which point the heading has scrolled off the
  // top.
  //
  // Reza (2026-07-10, follow-up): with the ENTRANCE-only range this used
  // ('start end' -> 'start start' — exactly one viewport-height of scroll,
  // no matter how the START_OFFSET/REVEAL_SPAN fractions above are tuned),
  // the whole reveal was compressed into a sliver right at the very start
  // of the section coming into view — "tahe safast", felt rushed, and by
  // the time the section was actually being read it had already finished.
  // Changed the END anchor to 'center center' (section's own vertical
  // CENTER reaching the viewport's center) instead of 'start start' (its
  // TOP reaching the viewport's top) — this adds real scroll distance
  // (roughly half the section's height) for the reveal to play out across,
  // so it's visibly happening through the middle of scrolling into the
  // section, while still finishing at a natural "settled, centered, done
  // reading in" point rather than dragging past it.
  //
  // Reza (2026-07-10, second follow-up): still too fast/early. Pushed
  // further in the same direction: widened the end anchor again ('center
  // center' -> 'end center', more real scroll distance) and raised
  // START_OFFSET above for a longer beat of plain scrolling before
  // anything starts. Same mechanism, just pushed further — simple.
  //
  // Reza (2026-07-11, precise anchor given): back to 'start start' (section
  // TOP hits viewport TOP = progress 1) — he specified exactly this moment
  // (header fully arrived at the top edge) as when everything must be
  // done. START_OFFSET above now does the "push it back further" work
  // instead of widening this anchor, since widening it further would push
  // completion PAST the point he pinned it to.
  // 2026-07-21 (per Reza, root-cause fix — supersedes the 2026-07-11 anchor
  // below): 'start start' requires at least one full viewport-height of
  // scrollable content to exist AFTER this section for progress to ever
  // reach 1 — on tall viewports (tablet especially) that room often isn't
  // there, so the last keys' reveal could never complete, no matter how
  // much content follows. 'end end' is self-contained — progress reaches 1
  // exactly when this section has fully scrolled past, a condition that
  // depends only on the section's OWN height, guaranteed reachable on any
  // device. Completion timing shifts slightly earlier than the exact
  // "header at the very top" moment originally specified, in exchange for
  // being reliable on every screen size — the actual practical goal.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end end'],
  });

  // ALWAYS build all 12 concepts (+ Other Works). Each gets the live tracks
  // whose `concept` matches its label. Empty concepts still appear as keys.
  const groups = useMemo<ConceptGroup[]>(() => {
    const live = (tracks ?? []).filter((t) => t.isLive);
    return ORDER.map((label) => ({
      label,
      blurb: BLURBS[label] ?? '',
      tracks: live.filter((t) => (t.concept ?? '') === label),
    }));
  }, [tracks]);

  const handleActivate = useCallback((label: string) => {
    const g = groups.find((x) => x.label === label) ?? null;
    setActive(g);
  }, [groups]);

  // Keep the open overlay's track list fresh if tracks update while open.
  useEffect(() => {
    setActive((prev) => (prev ? groups.find((g) => g.label === prev.label) ?? prev : prev));
  }, [groups]);

  const handleClose = useCallback(() => setActive(null), []);

  const n = groups.length;

  return (
    <section
      ref={sectionRef}
      id="works"
      className="relative w-full living-veil overflow-hidden"
      style={{ color: 'var(--text-color)', padding: 'clamp(1rem, 2vh, 1.75rem) 0 clamp(0.75rem, 1.75vh, 1.5rem)' }}
      aria-label={t('Works by concept')}
    >
      <div style={{ padding: '0 clamp(1.5rem, 6vw, 7rem)', marginBottom: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
        <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}>
          {t('Section 03 — Selected Works')}
        </span>
        <h2 className="font-display font-light mt-5" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.6rem)', lineHeight: 1.2, color: 'var(--text-color)' }}>
          {t('Play a concept.')}
        </h2>
      </div>

      <div className="flex flex-col" style={{ gap: 'clamp(0.3rem, 0.7vh, 0.5rem)' }}>
        {groups.map((g, i) => (
          <PianoLane
            key={g.label}
            group={g}
            index={i}
            total={n}
            progress={scrollYProgress}
            reduce={reduce}
            freq={NOTE_HZ[i % NOTE_HZ.length]!}
            lengthPct={n > 1 ? 1 - i / (n - 1) : 1}
            isLast={i === n - 1}
            onActivate={handleActivate}
          />
        ))}
      </div>

      {/* Mirror portrait (2026-07-10, per Reza): sits on the right, a mirror
          of the piano keys on the left, and assembles itself from scattered
          shards on the SAME scroll timeline as the keys sliding in (see
          MirrorShatterPortrait.tsx). Hidden below the `xl` breakpoint via
          the wrapper's Tailwind classes — there's no room for a mirrored
          column once the piano keys stack to full width on small screens.
          2026-07-17 (site-wide responsive audit, per Reza's live iPad Pro
          test): this was `lg` (1024px) until a real portrait-tablet test
          showed the actual bug — at exactly 1024px wide, the box math
          (width: clamp(220px,22vw,380px) against height: min(68vh,620px))
          resolves to roughly 225x620px, an extremely narrow/tall shape.
          cover-cropping a landscape source photo into that shape crops
          away most of its width, leaving only a tight zoomed sliver (what
          Reza saw: just an eye/glasses, not the intended composition).
          `xl` (1280px) keeps this off the whole portrait-tablet range
          entirely, so it only ever appears once there's enough width for
          the box's aspect ratio to look intentional rather than accidental.
          2026-07-17 (per Reza): tried the 3-device (ResponsiveEditableImage)
          system here first, but Reza decided this specific photo should
          stay on the plain single-version toolbar — the 3-device system is
          reserved for the Hero portrait and the Promo Screen media instead.
          Reuses EditableImage (contentKey 'worksSection.mirrorPortrait') so
          it gets upload/crop/replace/delete in the admin panel for free,
          exactly like every other admin-managed photo on the site. Falls
          back to the composer's main portrait until an admin sets one
          specifically here. */}
      {composerIdentity?.portrait?.url && (
        <div
          className="hidden xl:block absolute pointer-events-none"
          style={{ right: 'clamp(1.5rem, 6vw, 7rem)', top: '50%', transform: 'translateY(-50%)', width: 'clamp(220px, 22vw, 380px)', height: 'min(68vh, 620px)', zIndex: 15 }}
        >
          <EditableImage contentKey="worksSection.mirrorPortrait" defaultUrl={composerIdentity.portrait.url}>
            {(url) => (
              <MirrorShatterPortrait
                src={url}
                locale={(locale ?? 'en') as Locale}
                progress={scrollYProgress}
                windowStart={START_OFFSET}
                windowSpan={REVEAL_SPAN}
                className="pointer-events-auto"
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </EditableImage>
        </div>
      )}

      <p className="font-mono mt-14" style={{ fontSize: '0.66rem', letterSpacing: '0.15em', color: 'var(--text-dim-color)', padding: '0 clamp(1.5rem, 6vw, 7rem)' }}>
        {t('SELECT A KEY TO OPEN ITS WORKS — OR KEEP SCROLLING')}
      </p>

      <ConceptOverlay group={active} onClose={handleClose} reduce={reduce} />
    </section>
  );
}

