import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useT } from '../context/TranslationContext';

// ===========================================================================
// Shared per-concept schematic art — single source of truth used by BOTH the
// Selected Works scroll (SpatialScrollEngine) and the piano concept overlay
// (WorksGallery). Each of the 12 concepts has its OWN gently animated motif and
// gold-tinted glow, so cards feel distinct, alive and luxurious before any
// real track exists. Change a motif here and both sections update.
// ===========================================================================

export const EASE_SOFT = [0.45, 0, 0.2, 1] as const;

// Each entry returns the animated SVG inner content. Motion is slow + subtle.
export const CONCEPT_ART: Record<string, { tint: string; render: () => ReactNode }> = {
  // Film strip drifting slowly sideways, aperture iris breathing.
  Cinema: {
    tint: '#E6C457',
    render: () => (
      <>
        <motion.g
          animate={{ x: [0, -32, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="40" y="74" width="360" height="52" rx="4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          {Array.from({ length: 13 }).map((_, i) => (
            <rect key={i} x={48 + i * 28} y="62" width="14" height="9" rx="2" fill="currentColor" opacity="0.55" />
          ))}
          {Array.from({ length: 13 }).map((_, i) => (
            <rect key={`b${i}`} x={48 + i * 28} y="129" width="14" height="9" rx="2" fill="currentColor" opacity="0.55" />
          ))}
        </motion.g>
        <motion.circle
          cx="200" cy="100" r="24" fill="none" stroke="currentColor" strokeWidth="1.4"
          animate={{ r: [22, 27, 22], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </>
    ),
  },
  // Scan line sweeping down a screen.
  Television: {
    tint: '#8FD0E0',
    render: () => (
      <>
        <rect x="86" y="52" width="228" height="150" rx="12" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="172" y1="206" x2="228" y2="206" stroke="currentColor" strokeWidth="3" />
        <motion.line
          x1="92" x2="308" stroke="currentColor" strokeWidth="2" opacity="0.7"
          animate={{ y1: [60, 196, 60], y2: [60, 196, 60] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {[0.2, 0.4, 0.6, 0.8].map((p, i) => (
          <line key={i} x1="92" y1={60 + 136 * p} x2="308" y2={60 + 136 * p} stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
        ))}
      </>
    ),
  },
  // Equaliser bars rising and falling.
  Games: {
    tint: '#7FE6B6',
    render: () => (
      <>
        {Array.from({ length: 13 }).map((_, i) => {
          const x = 44 + i * 26;
          const base = [30, 60, 40, 80, 50, 95, 55, 78, 36, 66, 44, 72, 48][i]!;
          return (
            <motion.rect
              key={i} x={x} width="15" rx="3" fill="currentColor"
              opacity={0.45 + (i % 3) * 0.18}
              animate={{ height: [base * 0.4, base, base * 0.55, base * 0.85, base * 0.4], y: [130 - base * 0.4, 130 - base, 130 - base * 0.55, 130 - base * 0.85, 130 - base * 0.4] }}
              transition={{ duration: 2.4 + (i % 4) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
            />
          );
        })}
      </>
    ),
  },
  // Concentric rings pulsing outward.
  Animation: {
    tint: '#F0B488',
    render: () => (
      <>
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i} cx="200" cy="100" fill="none" stroke="currentColor" strokeWidth="1.3"
            animate={{ r: [20, 120], opacity: [0.7, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeOut', delay: i * 1.66 }}
          />
        ))}
        <circle cx="200" cy="100" r="8" fill="currentColor" />
      </>
    ),
  },
  // Data points easing along a trend line.
  Documentary: {
    tint: '#C7BCA6',
    render: () => (
      <>
        <line x1="44" y1="172" x2="356" y2="172" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
        <motion.path
          d="M44,150 L110,90 L160,120 L230,60 L300,110 L356,72" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeDasharray="600" animate={{ strokeDashoffset: [600, 0] }}
          transition={{ duration: 4, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        />
        {[[110,90],[160,120],[230,60],[300,110]].map(([x,y],i)=>(
          <motion.circle key={i} cx={x} cy={y} r="4" fill="currentColor"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }} />
        ))}
      </>
    ),
  },
  // Megaphone with broadcasting sound arcs pulsing.
  Advertising: {
    tint: '#EF9999',
    render: () => (
      <>
        <path d="M120,72 L120,128 L160,128 L240,162 L240,38 L160,72 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i} d={`M${256 + i * 16},${82 - i * 8} Q${286 + i * 22},100 ${256 + i * 16},${118 + i * 8}`}
            fill="none" stroke="currentColor" strokeWidth="1.2"
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
          />
        ))}
      </>
    ),
  },
  // Play triangles pulsing forward in sequence.
  Trailers: {
    tint: '#D2A6EA',
    render: () => (
      <>
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i} d={`M${120 + i * 70},60 L${120 + i * 70},140 L${190 + i * 70},100 Z`}
            fill="currentColor"
            animate={{ opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
          />
        ))}
      </>
    ),
  },
  // Two theatre masks breathing gently.
  Theatre: {
    tint: '#E2CB82',
    render: () => (
      <>
        <line x1="40" y1="48" x2="360" y2="48" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
        <motion.path d="M92,62 Q92,152 198,152 Q198,62 92,62 Z" fill="none" stroke="currentColor" strokeWidth="1.4"
          animate={{ scale: [1, 1.04, 1] }} style={{ transformOrigin: '145px 107px' }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.path d="M202,62 Q202,152 308,152 Q308,62 202,62 Z" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.6"
          animate={{ scale: [1, 1.04, 1] }} style={{ transformOrigin: '255px 107px' }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }} />
      </>
    ),
  },
  // Flowing motion ribbons undulating.
  Dance: {
    tint: '#8FD6BA',
    render: () => (
      <>
        <motion.path
          fill="none" stroke="currentColor" strokeWidth="1.7"
          animate={{ d: [
            'M30,150 C110,40 180,160 240,90 C290,35 350,130 370,70',
            'M30,120 C110,170 180,50 240,130 C290,180 350,60 370,120',
            'M30,150 C110,40 180,160 240,90 C290,35 350,130 370,70',
          ] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45"
          animate={{ d: [
            'M30,130 C120,60 190,180 260,110 C300,70 350,150 370,100',
            'M30,160 C120,100 190,40 260,140 C300,180 350,80 370,140',
            'M30,130 C120,60 190,180 260,110 C300,70 350,150 370,100',
          ] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        />
      </>
    ),
  },
  // Treble clef + staff lines softly breathing.
  Concert: {
    tint: '#D9B56F',
    render: () => (
      <>
        {[44, 69, 94, 119, 144].map((y) => (
          <line key={y} x1="60" y1={y} x2="340" y2={y} stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
        ))}
        <motion.path
          d="M150,40 L150,150 Q150,170 130,170 Q112,170 112,154 Q112,140 130,140 Q140,140 140,150 L140,55 L230,42 L230,140 Q230,160 210,160 Q192,160 192,144 Q192,130 210,130 Q220,130 220,140"
          fill="none" stroke="currentColor" strokeWidth="1.4"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </>
    ),
  },
  // Orbiting ellipses rotating in 3D-ish space.
  Immersive: {
    tint: '#A4BEEC',
    render: () => (
      <>
        <motion.ellipse
          cx="200" cy="100" rx="130" ry="48" fill="none" stroke="currentColor" strokeWidth="1.2"
          style={{ transformOrigin: '200px 100px' }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        />
        <motion.ellipse
          cx="200" cy="100" rx="48" ry="130" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6"
          style={{ transformOrigin: '200px 100px' }}
          animate={{ rotate: [0, -360] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        />
        <circle cx="200" cy="100" r="10" fill="currentColor" />
      </>
    ),
  },
  // Vinyl record slowly spinning.
  Albums: {
    tint: '#E6C457',
    render: () => (
      <motion.g
        style={{ transformOrigin: '200px 100px' }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="200" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="200" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        <circle cx="200" cy="100" r="38" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        <circle cx="200" cy="100" r="14" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="200" cy="100" r="5" fill="currentColor" />
        <circle cx="200" cy="60" r="3" fill="currentColor" opacity="0.7" />
      </motion.g>
    ),
  },
};

// Schematic placeholder for concepts without a featured track yet — a unique,
// gently animated coded motif per concept, with a soft glow, so each card is
// distinct, alive and never empty.
export function SchematicPlaceholder({ concept }: { concept: string }) {
  const { t } = useT();
  const art = CONCEPT_ART[concept];
  const tint = art?.tint ?? 'var(--accent-color)';
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: `radial-gradient(120% 120% at 50% 35%, ${tint}1F, rgba(255,255,255,0.015) 55%, transparent)` }}
      aria-hidden
    >
      {/* Soft breathing glow behind the motif */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: '60%', height: '70%', background: `radial-gradient(circle, ${tint}26, transparent 70%)`, filter: 'blur(22px)' }}
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full"
        style={{ color: tint, opacity: 0.4, filter: `drop-shadow(0 0 6px ${tint}55)` }}>
        {art?.render()}
      </svg>
      <motion.span
        className="font-mono uppercase relative"
        style={{ fontSize: '0.62rem', letterSpacing: '0.42em', color: tint }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4, repeat: Infinity, ease: EASE_SOFT as unknown as number[] }}
      >
        {t(concept)}
      </motion.span>
      <span className="font-display font-light relative mt-2" style={{ fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)', color: 'var(--text-dim-color)' }}>
        {t('In composition')}
      </span>
    </div>
  );
}


// Lightweight: just the animated motif + glow for a concept (no caption text).
// Used inside schematic placeholder CARDS that render their own title/desc.
export function ConceptMotif({ concept }: { concept: string }) {
  const art = CONCEPT_ART[concept];
  const tint = art?.tint ?? 'var(--accent-color)';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: `radial-gradient(120% 120% at 50% 40%, ${tint}1F, rgba(255,255,255,0.015) 55%, transparent)` }}
      aria-hidden
    >
      <motion.div
        className="absolute rounded-full"
        style={{ width: '62%', height: '72%', background: `radial-gradient(circle, ${tint}26, transparent 70%)`, filter: 'blur(20px)' }}
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full"
        style={{ color: tint, opacity: 0.42, filter: `drop-shadow(0 0 6px ${tint}55)` }}>
        {art?.render()}
      </svg>
    </div>
  );
}

// Tint accessor for callers that want to colour their own text to match.
export function conceptTint(concept: string): string {
  return CONCEPT_ART[concept]?.tint ?? 'var(--accent-color)';
}
