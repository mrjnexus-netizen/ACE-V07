// Single source of truth for the 12 concept names, shared between
// SpatialScrollEngine (the orbital "Selected Works" cards) and
// ComposerPresence (the rotating genre banners' guided-journey feature —
// 2026-07-11). Kept in its own tiny module rather than exported from
// SpatialScrollEngine.tsx directly so ComposerPresence doesn't end up
// statically importing that whole (heavy, otherwise lazy-loaded) component
// just to read this list.
export const CONCEPT_ORDER = [
  'Cinema', 'Television', 'Games', 'Animation', 'Documentary', 'Advertising',
  'Trailers', 'Theatre', 'Dance', 'Concert', 'Immersive', 'Albums',
] as const;
