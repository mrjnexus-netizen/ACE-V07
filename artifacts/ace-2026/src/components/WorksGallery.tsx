import { useMemo, useRef, useState, useCallback } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import type { Project } from '../types';

// Section 03 - Works as a VERTICAL PIANO anchored to the left edge.
// 12 realistic ivory keys stack top-to-bottom, flush left. Their length steps
// down: the top key is the longest (~4x the bottom), descending to the bottom
// key. As the section scrolls in, keys slide in one-by-one from the left; once
// a key lands, its concept name is written horizontally just outside it (right).
// Hover/tap depresses the key and plays a soft note; click opens the concept.

const CONCEPTS: Record<string, { label: string; blurb: string }> = {
  film: { label: 'Cinema', blurb: 'Original scores written to live beneath the image.' },
  cinema: { label: 'Cinema', blurb: 'Original scores written to live beneath the image.' },
  tv: { label: 'Television', blurb: 'Themes and cues that carry a series across seasons.' },
  series: { label: 'Television', blurb: 'Themes and cues that carry a series across seasons.' },
  television: { label: 'Television', blurb: 'Themes and cues that carry a series across seasons.' },
  game: { label: 'Games', blurb: 'Adaptive, interactive music that evolves with the player.' },
  gaming: { label: 'Games', blurb: 'Adaptive, interactive music that evolves with the player.' },
  animation: { label: 'Animation', blurb: 'Bright, characterful writing that gives motion its heartbeat.' },
  documentary: { label: 'Documentary', blurb: 'Textural soundscapes that let the real world breathe.' },
  advertising: { label: 'Advertising', blurb: 'Precise, memorable music built to land in seconds.' },
  brand: { label: 'Advertising', blurb: 'Precise, memorable music built to land in seconds.' },
  commercial: { label: 'Advertising', blurb: 'Precise, memorable music built to land in seconds.' },
  trailer: { label: 'Trailers', blurb: 'High-impact cues engineered to move an audience fast.' },
  trailers: { label: 'Trailers', blurb: 'High-impact cues engineered to move an audience fast.' },
  theatre: { label: 'Theatre', blurb: 'Live score for the stage, written to breathe with performers.' },
  theater: { label: 'Theatre', blurb: 'Live score for the stage, written to breathe with performers.' },
  stage: { label: 'Theatre', blurb: 'Live score for the stage, written to breathe with performers.' },
  dance: { label: 'Dance', blurb: 'Music composed for movement, tempo as choreography.' },
  ballet: { label: 'Dance', blurb: 'Music composed for movement, tempo as choreography.' },
  concert: { label: 'Concert', blurb: 'Works for the hall, orchestra and ensemble at full scale.' },
  orchestral: { label: 'Concert', blurb: 'Works for the hall, orchestra and ensemble at full scale.' },
  vr: { label: 'Immersive', blurb: 'Spatial audio for VR, XR and installation.' },
  xr: { label: 'Immersive', blurb: 'Spatial audio for VR, XR and installation.' },
  immersive: { label: 'Immersive', blurb: 'Spatial audio for VR, XR and installation.' },
  album: { label: 'Albums', blurb: 'Long-form artist records under the composer\u2019s own name.' },
  artist: { label: 'Albums', blurb: 'Long-form artist records under the composer\u2019s own name.' },
  other: { label: 'Other Works', blurb: 'Scores that resist category \u2014 experiments and commissions.' },
};

const ORDER = [
  'Cinema', 'Television', 'Games', 'Animation', 'Documentary', 'Advertising',
  'Trailers', 'Theatre', 'Dance', 'Concert', 'Immersive', 'Albums', 'Other Works',
];

function conceptOf(type: string): { label: string; blurb: string } {
  const key = (type || 'other').toLowerCase().trim();
  const c = CONCEPTS[key] || CONCEPTS.other!;
  return { label: c.label, blurb: c.blurb };
}

interface ConceptGroup {
  label: string;
  blurb: string;
  projects: Project[];
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
        aria-label={`Explore ${group.label} (${group.projects.length} works)`}
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
          {String(group.projects.length).padStart(2, '0')} {group.projects.length === 1 ? 'work' : 'works'}
        </span>
      </motion.button>
    </div>
  );
}

export default function WorksGallery() {
  const { identity } = useIdentity();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const projects = useMemo<Project[]>(() => identity?.projects ?? [], [identity]);

  const groups = useMemo<ConceptGroup[]>(() => {
    const map = new Map<string, ConceptGroup>();
    projects.forEach((p) => {
      const { label, blurb } = conceptOf(p.type);
      if (!map.has(label)) map.set(label, { label, blurb, projects: [] });
      map.get(label)!.projects.push(p);
    });
    return Array.from(map.values()).sort((a, b) => {
      const ia = ORDER.indexOf(a.label); const ib = ORDER.indexOf(b.label);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [projects]);

  const handleActivate = useCallback((label: string) => {
    void label; // next step: open concept overlay
  }, []);

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

      {n === 0 ? (
        <div className="w-full flex items-center justify-center py-24"
          style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted-color)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', fontSize: '0.8rem' }}>No works published yet.</p>
        </div>
      ) : (
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
      )}

      <p className="font-mono mt-14" style={{ fontSize: '0.66rem', letterSpacing: '0.15em', color: 'var(--text-dim-color)', padding: '0 clamp(1.5rem, 6vw, 7rem)' }}>
        SELECT A KEY TO OPEN ITS WORKS — OR KEEP SCROLLING
      </p>
    </section>
  );
}
