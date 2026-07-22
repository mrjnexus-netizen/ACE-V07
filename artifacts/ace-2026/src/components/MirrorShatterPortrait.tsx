import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { motion, useTransform, cubicBezier, type MotionValue } from 'framer-motion';
import VoronoiPortraitFilter from './VoronoiPortraitFilter';
import type { Locale } from '../types';

/**
 * MirrorShatterPortrait (2026-07-10, per Reza) — a photo that assembles
 * itself from scattered low-poly shards as the person scrolls, driven by
 * the EXACT SAME scrollYProgress MotionValue that reveals the piano keys
 * in WorksGallery.tsx, so the picture completes at the same pace and in
 * the same top-to-bottom direction as the keys sliding in beside it.
 *
 * Why algorithmic shards instead of a hand-traced SVG (Reza's reference,
 * codepen.io/woodwoerk/pen/bERRrM): that artwork's ~540 polygons were
 * drawn by an artist to fit one specific portrait — there is no way to
 * generate that from an arbitrary admin-uploaded photo. Instead this
 * builds a deterministic "shattered glass" triangle mesh (jittered grid,
 * not a plain rectangle grid, so it reads as organic shards rather than
 * a tile puzzle) that works identically for ANY image dropped in via the
 * EditableImage admin flow. Every shard shows the SAME full photo at the
 * SAME background-position/size, just clipped to its own triangle — so
 * once every shard has arrived, the seams are invisible and it reads as
 * one continuous photograph.
 *
 * v2 fixes (2026-07-10, per Reza's review of v1):
 * - The whole thing is now invisible (opacity 0, nothing painted at all —
 *   not even a blurred placeholder) until progress reaches `windowStart`.
 *   v1's mount-time blur/scale animation ran unconditionally the instant
 *   this mounted, regardless of scroll position, which read as a phantom
 *   blurred shape sitting there before the person had scrolled anywhere
 *   near it. Now there's truly nothing until the reveal begins.
 * - Fixed a real bug: each shard's local reveal window could END past
 *   `windowStart + windowSpan` (start was computed from centroidY*span,
 *   THEN a local span was added on top, so the last row's shards finished
 *   later than the piano keys did — the photo still had visible gaps
 *   right as the last key settled). Start is now computed against a
 *   REDUCED span so start+localSpan never exceeds windowStart+windowSpan;
 *   the photo is now guaranteed fully settled at the exact same progress
 *   value the last piano key is.
 * - Movement eased (cubicBezier, same curve used elsewhere in this app)
 *   instead of linear, and the fly-in distance shortened — reads as a
 *   calmer, more deliberate arrival instead of a snap.
 *
 * Edge treatment + ambient motion deliberately mirror the Hero portrait
 * (GridLayoutEngine.tsx) per Reza's explicit ask: same slow breathing
 * scale/drift, same radial soft-edge mask (all four sides fade out — this
 * is an inset floating photo, not a full-bleed hero, so a radial mask
 * reads better than the hero's top-to-bottom one), same cinematic
 * vignette — just gated behind the same progress-driven opacity as the
 * shards so none of it shows before the reveal starts.
 */

const EASE = cubicBezier(0.22, 1, 0.36, 1);

// Deterministic pseudo-random (mulberry32-style) — stable across renders/
// StrictMode double-invokes, unlike Math.random(), so the shard mesh
// never "reshuffles" itself on a re-render.
function seededRand(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface Shard {
  id: string;
  points: [number, number][]; // 3x [x%, y%] within the container, 0-100
  centroidY: number; // 0-1, top-to-bottom position — drives reveal order
  dx: number; // px offset shard starts from before settling into place
  dy: number;
}

const COLS = 8;
const ROWS = 10;
const JITTER = 0.34; // fraction of one cell's size — higher = more "broken glass", less "grid"

function buildShardMesh(): Shard[] {
  // Shared vertex grid: (COLS+1) x (ROWS+1) points. Interior points are
  // jittered; the outer boundary is kept perfectly flush with the
  // container edge so the overall silhouette stays a clean rectangle for
  // the mask-image fade to work with (no ragged photo edge poking out).
  const verts: { x: number; y: number }[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: { x: number; y: number }[] = [];
    for (let c = 0; c <= COLS; c++) {
      const isEdge = r === 0 || r === ROWS || c === 0 || c === COLS;
      const cellW = 100 / COLS;
      const cellH = 100 / ROWS;
      const jx = isEdge ? 0 : (seededRand(r * 97 + c * 13 + 1) - 0.5) * 2 * JITTER * cellW;
      const jy = isEdge ? 0 : (seededRand(r * 61 + c * 29 + 7) - 0.5) * 2 * JITTER * cellH;
      row.push({ x: (c / COLS) * 100 + jx, y: (r / ROWS) * 100 + jy });
    }
    verts.push(row);
  }

  const shards: Shard[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tl = verts[r]![c]!;
      const tr = verts[r]![c + 1]!;
      const bl = verts[r + 1]![c]!;
      const br = verts[r + 1]![c + 1]!;
      // Alternate the diagonal split direction checkerboard-style so
      // every seam doesn't run parallel — reads as irregular shards
      // rather than a repeating pattern of identical triangle pairs.
      const flip = (r + c) % 2 === 0;
      const triA: [number, number][] = flip
        ? [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]]
        : [[tl.x, tl.y], [tr.x, tr.y], [br.x, br.y]];
      const triB: [number, number][] = flip
        ? [[tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]]
        : [[tl.x, tl.y], [br.x, br.y], [bl.x, bl.y]];
      [triA, triB].forEach((pts, i) => {
        const centroidY = (pts[0]![1] + pts[1]![1] + pts[2]![1]) / 3 / 100;
        const seed = r * COLS * 2 + c * 2 + i;
        const angle = seededRand(seed + 1000) * Math.PI * 2;
        // Shortened per Reza (was 16-38px — read as a "snap"; this is a
        // calmer, more dignified settle).
        const mag = 9 + seededRand(seed + 2000) * 13;
        shards.push({
          id: `${r}-${c}-${i}`,
          points: pts,
          centroidY,
          dx: Math.cos(angle) * mag,
          dy: Math.sin(angle) * mag,
        });
      });
    }
  }
  return shards;
}

function ShardPiece({
  shard,
  src,
  progress,
  windowStart,
  windowSpan,
  localSpan,
}: {
  shard: Shard;
  src: string;
  progress: MotionValue<number>;
  windowStart: number;
  windowSpan: number;
  localSpan: number;
}) {
  const clip = `polygon(${shard.points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
  // centroidY is scaled against (windowSpan - localSpan), NOT windowSpan
  // itself — this guarantees the LAST shard's end (start + localSpan)
  // lands exactly at windowStart + windowSpan, same as the piano keys'
  // final key. Without this reduction the last row finished visibly
  // later than the keys (the bug Reza caught: photo still incomplete
  // when the keys were done).
  const start = windowStart + shard.centroidY * (windowSpan - localSpan);
  const end = start + localSpan;

  const opacity = useTransform(progress, [start, start + localSpan * 0.7, end], [0, 0.85, 1], { ease: [EASE, EASE] });
  const x = useTransform(progress, [start, end], [shard.dx, 0], { ease: [EASE] });
  const y = useTransform(progress, [start, end], [shard.dy, 0], { ease: [EASE] });
  const filter = useTransform(progress, [start, end], ['blur(9px)', 'blur(0px)'], { ease: [EASE] });

  return (
    <motion.div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        clipPath: clip,
        WebkitClipPath: clip,
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity,
        x,
        y,
        filter,
        willChange: 'transform, opacity, filter',
      }}
    />
  );
}

export default function MirrorShatterPortrait({
  src,
  locale,
  progress,
  windowStart = 0.14,
  windowSpan = 0.78,
  showVoronoi = true,
  className,
  style,
}: {
  src: string;
  /** Picks the voronoi filter's tint (see VoronoiPortraitFilter.tsx). */
  locale: Locale;
  /** Shared with the piano keys — same section's scrollYProgress. */
  progress: MotionValue<number>;
  /** Where in [0,1] progress this reveal starts. A non-zero default
   * (per Reza) so there's a deliberate "arriving, settling in" beat of
   * plain scrolling before anything starts assembling, rather than it
   * kicking off the instant the section is barely on screen. */
  windowStart?: number;
  /** How much of progress the full reveal spans, starting from
   * `windowStart`. Keep `windowStart + windowSpan` equal to the piano
   * keys' own completion point (WorksGallery.tsx's START_OFFSET +
   * REVEAL_SPAN) so both finish at the same scroll position. */
  windowSpan?: number;
  /** 2026-07-21 (per Reza): VoronoiPortraitFilter creates its OWN
   * separate THREE.WebGLRenderer. WorksGallery.tsx's usage (default true)
   * is fine — nothing else nearby needs WebGL. But SpatialScrollEngine.tsx
   * ALSO runs its own Three.js scene for the card ring, and having two
   * concurrent WebGL contexts in view at once was hitting the browser's
   * context limit, silently losing one (rendering as a garbled solid-
   * color mess, not the intended photo/filter). Passing false here skips
   * ever creating that second WebGL context — the shard mosaic simply
   * stays as the final, permanent state instead of crossfading into it. */
  showVoronoi?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const shards = useMemo(buildShardMesh, []);
  // Every shard overlaps its neighbours for the smooth continuous "wave"
  // feel (rather than the piano keys' hard discrete steps) — deliberately
  // large relative to windowSpan so many shards are mid-transition at
  // once.
  const localSpan = windowSpan * 0.22;

  // Nothing is painted — not even the vignette or mask — until progress
  // reaches windowStart. This is what makes the space genuinely empty
  // (the page's own background shows through) rather than a blurred
  // placeholder sitting there before the scroll-in begins.
  const containerOpacity = useTransform(progress, [windowStart, windowStart + 0.025], [0, 1]);

  // 2026-07-11 (per Reza — explicit request, piano keys left untouched):
  // this used to wait until the shard reveal was almost fully done before
  // cross-dissolving into the voronoi treatment. Now it happens much
  // earlier — centered on the HALFWAY point of the reveal window (50%
  // sooner relative to when the piano keys finish) — and then STAYS in
  // the voronoi state for the rest of the scroll, all the way past
  // `completion`. No special "stay" logic needed: voronoiOpacity simply
  // reaches 1 at the midpoint and never gets a reason to come back down
  // until progress drops below it again — which is exactly what happens,
  // automatically, if the person scrolls back UP past this point (the
  // reverse dissolve back to the shard mosaic he also asked for — for
  // free, since this is all driven by the same scroll-linked MotionValue
  // in both directions).
  const midPoint = windowStart + windowSpan * 0.5;
  const crossfadeSpan = windowSpan * 0.16;
  const mosaicOpacity = useTransform(
    progress,
    showVoronoi ? [midPoint - crossfadeSpan / 2, midPoint + crossfadeSpan / 2] : [0, 1],
    showVoronoi ? [1, 0] : [1, 1],
    { ease: [EASE, EASE] }
  );
  const voronoiOpacity = useTransform(progress, [midPoint - crossfadeSpan / 2, midPoint + crossfadeSpan / 2], [0, 1], { ease: [EASE] });

  return (
    <motion.div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, opacity: containerOpacity, ...style }}
      animate={{ scale: [1.1, 1.16, 1.1], x: ['-1%', '1%', '-1%'] }}
      transition={{
        scale: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
        x: { duration: 28, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage:
            'radial-gradient(160% 150% at 50% 45%, #000 15%, rgba(0,0,0,0.85) 38%, rgba(0,0,0,0.45) 62%, rgba(0,0,0,0.12) 85%, transparent 100%)',
          maskImage:
            'radial-gradient(160% 150% at 50% 45%, #000 15%, rgba(0,0,0,0.85) 38%, rgba(0,0,0,0.45) 62%, rgba(0,0,0,0.12) 85%, transparent 100%)',
        }}
      >
        <motion.div className="absolute inset-0" style={{ opacity: mosaicOpacity }}>
          {shards.map((s) => (
            <ShardPiece key={s.id} shard={s} src={src} progress={progress} windowStart={windowStart} windowSpan={windowSpan} localSpan={localSpan} />
          ))}
        </motion.div>

        {showVoronoi && (
          <motion.div className="absolute inset-0" style={{ opacity: voronoiOpacity }}>
            <VoronoiPortraitFilter src={src} locale={locale} />
          </motion.div>
        )}
      </div>

      {/* Cinematic vignette — matches the Hero portrait's treatment. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 45%, transparent 30%, rgba(0,0,0,0.5) 78%, rgba(0,0,0,0.75) 100%)',
        }}
      />
    </motion.div>
  );
}
