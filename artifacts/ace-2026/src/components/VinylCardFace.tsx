import type { ReactNode } from 'react';

// ============================================================
// ACE-2026 — VinylCardFace (v2 — Reza's feedback 2026-07-11)
//
// v1 problems, root-caused and fixed:
//  1. "dokmeye play ku?" — there was no explicit play/pause affordance,
//     only the cursor changing (data-cursor="play") on the outer button,
//     which isn't visible/obvious at a glance. FIX: an explicit circular
//     play/pause button, centred on the card, built from the SAME
//     gradient + glow recipe as the site's existing .btn--media system
//     (index.css) — luxury-neon, not invented fresh.
//  2. "chera kam keyfiyate... yekam zariftar" — the tonearm was a plain
//     grey bar rendering stretched across almost the entire card.
//     ROOT CAUSE: percentage `height` on an absolutely-positioned child
//     of a "padding-bottom: 100%" square (no explicit height) is
//     ambiguous — it resolved against a much taller box than intended.
//     FIX: the whole turntable badge is now a single SVG with a fixed
//     viewBox — no percentage-of-unclear-container math anywhere,
//     precise at any card size, small and refined (corner badge, not a
//     headline element) — the centre play button is the real affordance.
//
// v3 (per Reza, 2026-07-18): no title/time text on the card anymore — it
// duplicated the <h3> SpatialScrollEngine already renders outside the
// card, and cluttered what should be a clean showcase for the AI-generated
// cover art. Cover art blur removed too — it existed only to keep that
// now-gone title legible; the artwork shows crisp and full now. The play
// button moved from a large centred circle to a small badge mirroring the
// turntable (same size, same bottom alignment, opposite side) — the
// turntable's own tonearm animation (already driven by `isPlaying`,
// completely unchanged) IS the "now playing" feedback.
// ============================================================

export const VINYL_CARD_STYLES = `
@keyframes vinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.vinyl-disc-spin { animation: vinylSpin 3.2s linear infinite; }
@keyframes vinylNoteFloat {
  0%   { opacity: 0;   transform: translateY(0) scale(0.75); }
  25%  { opacity: 1; }
  100% { opacity: 0;   transform: translateY(-26px) scale(1.1); }
}
.vinyl-note { position: absolute; bottom: 8%; font-size: 10px; animation: vinylNoteFloat 1.9s ease-in infinite; }
@media (prefers-reduced-motion: reduce) {
  .vinyl-disc-spin { animation: none !important; }
  .vinyl-note { animation: none !important; opacity: 0 !important; }
}
`;

function PlayPauseGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="34%" height="34%" viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="2" width="3.4" height="12" rx="1" fill="var(--btn-ink, #0B0B0D)" />
      <rect x="9.6" y="2" width="3.4" height="12" rx="1" fill="var(--btn-ink, #0B0B0D)" />
    </svg>
  ) : (
    <svg width="34%" height="34%" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 2.4 L13.5 8 L4 13.6 Z" fill="var(--btn-ink, #0B0B0D)" />
    </svg>
  );
}

/** The turntable badge — a single fixed-viewBox SVG, so nothing depends on
 * an ambiguous CSS percentage-height chain. Purely decorative flourish in
 * the corner; the actual "click to play" affordance is the centre button.
 *
 * Reza (2026-07-11): the disc should spin naturally at all times — playing
 * or not — like a real turntable idling. Play/pause should only move the
 * needle onto/off the record and trigger the notes/time, never start or
 * stop the spin itself. `spinning` (true only for the front/active card —
 * see the perf note on AnimatedFace above this stays a single running
 * animation, not all twelve at once) drives the disc; `playing` drives
 * only the needle. */
function TurntableBadge({ spinning, playing }: { spinning: boolean; playing: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden>
      {/* soft neon bloom behind the disc */}
      <circle cx="32" cy="34" r="24" fill="rgba(var(--accent-rgb),0.22)" style={{ filter: 'blur(6px)' }} />
      {/* record — spins whenever this card is the front/active one,
          regardless of play state. Grooves are deliberately IRREGULAR
          (varied dash lengths, slightly offset radii/rotations) rather
          than perfectly uniform concentric rings — a perfectly symmetric
          disc reads as motionless even while rotating (no detail for the
          eye to track). A handful of scratch-like dashes plus one bright
          sweeping sheen streak give the spin something real to catch.
          2026-07-18 (real bug, per Reza): this record used to be drawn
          BEFORE the tonearm below — SVG paints in document order, so the
          disc was covering the needle every time it rotated onto the
          record ("needle goes under the record"). Painting the record
          FIRST and the tonearm SECOND (below) fixes that permanently —
          the needle is now always on top of the disc surface, exactly
          like a real turntable. */}
      <g className={spinning ? 'vinyl-disc-spin' : undefined} style={{ transformOrigin: '32px 34px' }}>
        <circle cx="32" cy="34" r="21" fill="#0c0c0c" />
        {/* irregular scratch grooves — varied dash patterns + radii, not
            uniform rings, so the surface has real texture to rotate */}
        <circle cx="32" cy="34" r="19.4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="14 3 6 5" />
        <circle cx="32" cy="34" r="17.1" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.4" strokeDasharray="4 2 11 4 7 3" />
        <circle cx="32" cy="34" r="14.6" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" strokeDasharray="9 4 3 6" />
        <circle cx="32" cy="34" r="12.2" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" strokeDasharray="5 3 8 2 4 5" />
        <circle cx="32" cy="34" r="9.7" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="12 5" />
        {/* a few short off-radius scuff marks, hand-placed at uneven
            angles rather than a repeating pattern */}
        <path d="M 44.5 22.5 A 17 17 0 0 1 47 34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.4" strokeLinecap="round" />
        <path d="M 18.5 41 A 14.6 14.6 0 0 1 17.4 30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.35" strokeLinecap="round" />
        <path d="M 32 12.6 A 21 21 0 0 1 40 15.8" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.3" strokeLinecap="round" />
        {/* sweeping light sheen — a soft wedge that makes the rotation
            visually unmistakable, like light catching a real record */}
        <path d="M 32 34 L 32 13 A 21 21 0 0 1 45.8 20.2 Z" fill="rgba(255,255,255,0.05)" />
        <circle cx="32" cy="34" r="21" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <circle cx="32" cy="34" r="7.5" fill="var(--accent-color)" opacity="0.95" />
        <circle cx="32" cy="34" r="7.5" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
        <circle cx="32" cy="34" r="1.6" fill="#0c0c0c" />
      </g>
      {/* tonearm base pivot */}
      <circle cx="54" cy="10" r="3.4" fill="#cfcfcf" />
      {/* tonearm — short, precise, rotates around the pivot only. Only
          play/pause moves this, never the idle spin. */}
      <g style={{ transformOrigin: '54px 10px', transform: playing ? 'rotate(34deg)' : 'rotate(2deg)', transition: 'transform 1.1s cubic-bezier(0.45,0,0.15,1)' }}>
        <rect x="52.3" y="9" width="2.4" height="24" rx="1.2" fill="#d8d8d8" />
        <circle cx="53.5" cy="32" r="2.2" fill="#bdbdbd" />
      </g>
    </svg>
  );
}

export default function VinylCardFace({
  cover,
  fallback,
  title,
  isPlaying,
  isCurrent: _isCurrent,
  currentTime: _currentTime,
  duration: _duration,
  dim,
}: {
  cover: string;
  fallback: ReactNode; // AnimatedFace, used when there's no cover image yet
  title: string;
  isPlaying: boolean;
  isCurrent: boolean;
  currentTime: number;
  duration: number;
  dim: boolean; // true when this card is not the active/front one
}) {
  return (
    <div className="relative w-full h-full overflow-hidden" aria-label={title}>
      {/* 2026-07-18 (per Reza): the cover art now shows crisp and full —
          no blur. It used to be heavily blurred specifically to keep the
          title text legible on top of it; now that the card carries no
          text at all (see below), there's nothing for the blur to protect
          and it was just degrading the AI-generated poster. Dimming for
          non-active cards stays (brightness/grayscale) for visual
          hierarchy, but never blur — the artwork itself always stays
          sharp. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          filter: dim ? 'brightness(0.55) grayscale(45%)' : 'brightness(0.94)',
          transition: 'filter 0.5s ease',
        }}
      >
        {cover ? (
          <img src={cover} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
        ) : (
          fallback
        )}
      </div>

      {/* 2026-07-18 (per Reza): no title/time text on the card anymore —
          "the cards shouldn't have writing on them", since the title is
          already shown outside the card (SpatialScrollEngine's own <h3>
          right below it) and duplicating it here was cluttering the clean
          cover-art surface. `title` is still passed through to the
          wrapper's aria-label above, so screen-reader users don't lose it — 
          this was a purely visual redundancy, not an accessibility one. */}

      {/* THE PLAY/PAUSE AFFORDANCE — mirrored with the turntable badge:
          same size, same bottom alignment, opposite (left) side of the
          card. See the comment on TurntableBadge's position below — 2026-07-18
          (per Reza): moved from a large centred button to this smaller
          mirrored badge; the turntable's own tonearm animation (already
          driven by the same `isPlaying` state) IS the "play" feedback now
          — clicking this button sets isPlaying exactly like before
          (SpatialScrollEngine owns that click handler, untouched here),
          which is what makes the tonearm on the right drop onto the
          record. Nothing about the turntable's own design, animation, or
          position changed. */}
      <div className="absolute" style={{ left: '7%', bottom: '7%', width: '30%', maxWidth: 52, aspectRatio: '1' }}>
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            borderRadius: '50%',
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 52%, #fff 48%), color-mix(in srgb, var(--accent-color) 76%, #fff 24%))',
            boxShadow: dim ? '0 0 10px rgba(var(--accent-rgb),0.28)' : '0 0 20px rgba(var(--accent-rgb),0.45)',
          }}
        >
          <PlayPauseGlyph playing={isPlaying} />
        </div>
      </div>

      {/* The turntable — small, precise, refined corner flourish. Unchanged:
          same design, same position, same animation as before. */}
      <div className="absolute" style={{ right: '7%', bottom: '7%', width: '30%', maxWidth: 52 }}>
        <TurntableBadge spinning={!dim} playing={isPlaying} />
      </div>

      {/* dancing notes while actually playing */}
      {isPlaying && (
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <span className="vinyl-note" style={{ left: '16%', color: 'var(--accent-color)', animationDelay: '0s' }}>♪</span>
          <span className="vinyl-note" style={{ left: '36%', color: 'var(--accent-color)', animationDelay: '0.55s' }}>♫</span>
          <span className="vinyl-note" style={{ left: '56%', color: 'var(--accent-color)', animationDelay: '1.1s' }}>♪</span>
        </div>
      )}
    </div>
  );
}
