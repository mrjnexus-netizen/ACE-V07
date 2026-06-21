import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { ConceptMotif, conceptTint } from './conceptArt';
import type { AudioTrack } from '../types';

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

let toneCtx: AudioContext | null = null;
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
  const [pressed, setPressed] = useState(false);

  const slice = 0.6 / total;
  const start = index * slice;
  const end = start + slice;

  const x = useTransform(progress, [start, end], reduce ? ['0%', '0%'] : ['-105%', '0%']);
  const opacity = useTransform(progress, [start, (start + end) / 2], [0, 1]);
  const labelOpacity = useTransform(progress, [end - slice * 0.3, end + 0.02], [0, 1]);
  const labelX = useTransform(progress, [end - slice * 0.3, end + 0.02], reduce ? [0, 0] : [-14, 0]);

  const press = useCallback(() => { setPressed(true); playNote(freq); }, [freq]);

  // Longest key ~ 46vw, shortest ~ 11.5vw (4:1 ratio). Clamped for sanity.
  const minVW = 11.5;
  const maxVW = 46;
  const widthVW = minVW + (maxVW - minVW) * lengthPct;

  const count = group.tracks.length;

  return (
    <div className="relative flex items-center" style={{ height: 'clamp(2.4rem, 4.6vh, 3.2rem)' }}>
      {/* Decorative black key nestled in the gap to the NEXT white key
          (shorter than the white key, 3D, like a real piano). Not for last. */}
      {!isLast && (
        <motion.div
          aria-hidden
          className="absolute z-20 pointer-events-none"
          style={{
            left: 0,
            bottom: 'calc(-1 * clamp(0.15rem, 0.35vh, 0.25rem) - 0.5px)',
            width: `clamp(3.6rem, ${widthVW * 0.6}vw, ${widthVW * 0.25}rem)`,
            height: 'clamp(1.92rem, 3.68vh, 2.56rem)',
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
        className="relative h-full focus:outline-none"
        style={{
          x,
          opacity,
          width: `clamp(6rem, ${widthVW}vw, ${widthVW * 0.42}rem)`,
          cursor: 'pointer',
          transformOrigin: 'left center',
        }}
        aria-label={`Explore ${group.label} (${count} ${count === 1 ? 'track' : 'tracks'})`}
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
        style={{ opacity: labelOpacity, x: labelX, marginLeft: 'clamp(1rem, 2.5vw, 2.25rem)', cursor: 'pointer' }}
      >
        <span className="font-display font-light whitespace-nowrap"
          style={{ fontSize: 'clamp(1.1rem, 2.3vw, 1.9rem)', letterSpacing: '0.02em', lineHeight: 1, color: pressed ? 'var(--accent-color)' : 'var(--text-color)', transition: 'color 0.3s ease' }}>
          {group.label}
        </span>
        <span className="font-mono whitespace-nowrap hidden md:inline"
          style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: 'var(--text-dim-color)' }}>
          {count > 0 ? `${String(count).padStart(2, '0')} ${count === 1 ? 'track' : 'tracks'}` : 'soon'}
        </span>
      </motion.button>
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

  const gridV = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.18 } },
  };
  const cardV = {
    hidden: { opacity: 0, y: reduce ? 0 : 18 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.55, ease } },
  };

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
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 9999, background: 'rgba(8,8,8,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.45, ease }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${group.label} tracks`}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        data-cursor="text"
        className="absolute flex items-center justify-center rounded-full focus:outline-none transition-colors hover:bg-white/[0.06]"
        style={{
          zIndex: 2,
          top: 'clamp(1.25rem, 3vw, 2.25rem)',
          right: 'clamp(1.25rem, 4vw, 3rem)',
          width: '44px',
          height: '44px',
          border: '1px solid var(--border-color)',
          background: 'rgba(255,255,255,0.02)',
          color: 'var(--text-color)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Scroll area — clicks on empty space bubble up to close */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Content block — interactive, does not close on click */}
        <motion.div
          className="mx-auto"
          style={{
            maxWidth: '1180px',
            padding: 'clamp(5rem, 11vh, 7.5rem) clamp(1.5rem, 4vw, 4rem) clamp(4rem, 8vh, 6rem)',
          }}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease, delay: reduce ? 0 : 0.05 }}
        >
          {/* Header */}
          <div className="mb-14 md:mb-20">
            <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}>
              Selected Works
            </span>
            <h2 className="font-display font-light mt-5" style={{ fontSize: 'clamp(2rem, 5vw, 3.6rem)', lineHeight: 1.08, color: 'var(--text-color)' }}>
              {group.label}
            </h2>
            <p className="font-display font-light mt-5" style={{ fontSize: 'clamp(0.95rem, 1.6vw, 1.2rem)', lineHeight: 1.6, color: 'var(--text-dim-color)', maxWidth: '46ch' }}>
              {group.blurb}
            </p>
            <p className="font-mono mt-6" style={{ fontSize: '0.64rem', letterSpacing: '0.18em', color: 'var(--text-dim-color)' }}>
              {count > 0 ? `${String(count).padStart(2, '0')} ${count === 1 ? 'TRACK' : 'TRACKS'}` : ''}
            </p>
          </div>

          {/* Grid OR elegant schematic placeholders (3 cards) */}
          {count === 0 ? (
            <motion.div
              className="flex flex-wrap justify-center"
              style={{ gap: 'clamp(1.5rem, 3vw, 2.5rem)', width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}
              variants={gridV}
              initial="hidden"
              animate="show"
            >
              {[0, 1, 2].map((i) => {
                const tint = conceptTint(group.label);
                return (
                  <motion.article key={`ph-${i}`} variants={cardV} className="group" style={{ flex: '0 1 300px', maxWidth: '340px', minWidth: '240px' }}>
                    <div
                      className="relative w-full overflow-hidden"
                      style={{ aspectRatio: '4 / 3', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                    >
                      <ConceptMotif concept={group.label} />
                      {/* Sample (inactive) play affordance — shows the final
                          feel; real tracks get a live play/pause button. */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span
                          className="flex items-center justify-center rounded-full transition-opacity duration-500 opacity-40 group-hover:opacity-70"
                          style={{ width: '46px', height: '46px', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M5 3 L13 8 L5 13 Z" fill="rgba(255,255,255,0.7)" /></svg>
                        </span>
                      </div>
                    </div>
                    <h3 className="font-display font-light mt-4" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', lineHeight: 1.3, color: 'var(--text-color)' }}>
                      Untitled {group.label} Score
                    </h3>
                    <p className="font-display font-light mt-2" style={{ fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-dim-color)' }}>
                      A piece still taking shape in the composer&rsquo;s studio.
                    </p>
                    <span className="font-mono uppercase inline-block mt-2" style={{ fontSize: '0.55rem', letterSpacing: '0.35em', color: tint }}>
                      In composition
                    </span>
                  </motion.article>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              className="flex flex-wrap justify-center"
              style={{ gap: 'clamp(1.5rem, 3vw, 2.5rem)', width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}
              variants={gridV}
              initial="hidden"
              animate="show"
            >
              {group.tracks.map((t) => {
                const cover = trackCover(t);
                const title = trackTitle(t);
                const caption = trackCaption(t);
                const isCurrent = audioState.currentTrack?.id === t.id;
                const isPlaying = isCurrent && audioState.isPlaying;
                return (
                  <motion.article key={t.id} variants={cardV} className="group" style={{ flex: '0 1 300px', maxWidth: '340px', minWidth: '240px' }}>
                    <button
                      type="button"
                      data-cursor="play"
                      onClick={() => onTrackClick(t)}
                      className="block w-full text-left focus:outline-none"
                      style={{ cursor: 'pointer' }}
                      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${title}`}
                    >
                      <div
                        className="relative w-full overflow-hidden"
                        style={{
                          aspectRatio: '4 / 3',
                          borderRadius: '6px',
                          border: isCurrent ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                          background: 'rgba(255,255,255,0.02)',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
                        }}
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={title}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0))' }}
                          >
                            <span className="font-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: 'var(--text-dim-color)' }}>
                              {group.label.toUpperCase()}
                            </span>
                          </div>
                        )}

                        {/* Now-playing equaliser (also shows, paused, on the current track) */}
                        {isCurrent && <NowPlaying active={isPlaying} />}

                        {/* Hover play hint when nothing is playing on this card */}
                        {!isCurrent && (
                          <div
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
                            style={{ background: 'rgba(0,0,0,0.28)', transition: 'opacity 0.4s ease' }}
                            aria-hidden
                          >
                            <span
                              className="flex items-center justify-center rounded-full"
                              style={{ width: '46px', height: '46px', border: '1px solid rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.25)' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 3 L13 8 L5 13 Z" fill="#fff" /></svg>
                            </span>
                          </div>
                        )}
                      </div>
                      <h3 className="font-display font-light mt-4" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', lineHeight: 1.3, color: isCurrent ? 'var(--accent-color)' : 'var(--text-color)', transition: 'color 0.3s ease' }}>
                        {title}
                      </h3>
                      {caption && (
                        <p className="font-display font-light mt-2" style={{ fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-dim-color)' }}>
                          {caption}
                        </p>
                      )}
                    </button>
                  </motion.article>
                );
              })}
            </motion.div>
          )}
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
  const { tracks } = useIdentity();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<ConceptGroup | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
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
      style={{ color: 'var(--text-color)', padding: 'clamp(5rem, 12vw, 9rem) 0' }}
      aria-label="Works by concept"
    >
      <div className="mb-12 md:mb-16" style={{ padding: '0 clamp(1.5rem, 6vw, 7rem)' }}>
        <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}>
          Section 03 — Selected Works
        </span>
        <h2 className="font-display font-light mt-5" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.6rem)', lineHeight: 1.2, color: 'var(--text-color)' }}>
          Play a concept.
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

      <p className="font-mono mt-14" style={{ fontSize: '0.66rem', letterSpacing: '0.15em', color: 'var(--text-dim-color)', padding: '0 clamp(1.5rem, 6vw, 7rem)' }}>
        SELECT A KEY TO OPEN ITS WORKS — OR KEEP SCROLLING
      </p>

      <ConceptOverlay group={active} onClose={handleClose} reduce={reduce} />
    </section>
  );
}
