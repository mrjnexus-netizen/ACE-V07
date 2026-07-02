import { useEffect, useState } from 'react';
import { motion, type TargetAndTransition, type Transition } from 'framer-motion';

/**
 * PortalComposer — the cinematic composer image at the heart of the language
 * portal, sitting BEHIND the language buttons and the ACE logo.
 *
 * Design intent (luxury / "less effect = more luxury"):
 *  - Slow breathing zoom + very slow diagonal drift on three different cycles
 *    so motion never reads as a loop.
 *  - Clean natural grade, image at opacity ~0.82 so it melts softly into space.
 *  - A radial MASK feathers all edges (esp. the right vertical edge) so the
 *    PNG's rectangle never shows as a hard line.
 *
 * IMPORTANT (framer-motion 11): centering uses a STATIC flex wrapper.
 */

const EDGE_FADE =
  'radial-gradient(ellipse 64% 78% at 44% 48%, ' +
  '#000 0%, #000 52%, rgba(0,0,0,0.72) 70%, rgba(0,0,0,0.4) 83%, ' +
  'rgba(0,0,0,0.14) 93%, rgba(0,0,0,0) 100%)';

const RIGHT_FADE =
  'linear-gradient(to right, #000 80%, rgba(0,0,0,0.35) 92%, rgba(0,0,0,0) 99%)';

const MASK = EDGE_FADE + ', ' + RIGHT_FADE;

const ANIM: TargetAndTransition = { scale: [1, 1.022, 1], x: [0, 6, -4, 0], y: [0, -5, 5, 0] };

const TRANS: Transition = {
  scale: { duration: 22, ease: 'easeInOut', repeat: Infinity },
  x: { duration: 34, ease: 'easeInOut', repeat: Infinity },
  y: { duration: 29, ease: 'easeInOut', repeat: Infinity },
};

const CINEMA_FILTER =
  'url(#composerSharp) contrast(1.08) saturate(1.16) brightness(1.20)';

const PortalComposer = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="composerSharp" x="0" y="0" width="100%" height="100%">
          <feConvolveMatrix
            order="3"
            preserveAlpha="true"
            kernelMatrix="0 -0.35 0  -0.35 2.4 -0.35  0 -0.35 0"
          />
        </filter>
      </svg>

      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 flex items-center justify-start">
          <div style={{ position: 'relative', marginLeft: '16px' }}>
            <motion.img
              src="/composer.png"
              alt=""
              draggable={false}
              className="max-w-none select-none"
              style={{
                display: 'block',
                // 2026-07-02: was `min(120vh, 140vw)` - vh/vw units are ALWAYS
                // relative to the real browser viewport, never to a
                // transform-scaled ancestor (ScaleStage). That meant this
                // photo didn't shrink along with the rest of the composition
                // at smaller window sizes, so its right-edge fade mask ended
                // up misaligned with the (correctly-scaled) guitar next to
                // it - visible as a hard vertical seam. Fixed size in px,
                // computed against the SAME 1600x900 logical canvas
                // ScaleStage uses (min(900*1.2, 1600*1.4) = 1080px), so it
                // scales together with everything else via the one shared
                // transform instead of drifting independently.
                width: '1080px',
                opacity: 0.82,
                willChange: 'transform',
                filter: CINEMA_FILTER,
                WebkitMaskImage: MASK,
                maskImage: MASK,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              }}
              animate={ANIM}
              transition={TRANS}
            />
          </div>
        </div>
      </motion.div>

      <div className="absolute inset-0" style={{ background: 'transparent' }} />
    </div>
  );
};

export default PortalComposer;
