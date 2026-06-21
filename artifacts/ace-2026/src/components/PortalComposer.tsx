import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * PortalComposer — the cinematic composer image that lives at the heart of the
 * language portal, sitting BEHIND the language buttons and the ACE logo.
 *
 * Design intent (luxury / "less effect = more luxury"):
 *  - A slow "breathing" zoom (1.00 -> ~1.045) combined with a very slow
 *    diagonal drift, on three DIFFERENT time cycles so the motion never reads
 *    as a loop. This is the same trick used in expensive cinematic banners.
 *  - The image is dimmed (opacity 0.5) so the composer is *felt* rather than
 *    competing with the language buttons. A soft radial vignette melts the
 *    edges further into the black background (the PNG already fades to black
 *    at its edges, so there is never a hard border).
 *  - pointer-events: none and a low z-index keep it purely decorative — it can
 *    never intercept a click meant for a language button.
 *
 * IMPORTANT (framer-motion 11): centering is done by a STATIC flex wrapper,
 * NOT by animating translate/x with a '-50%' base. Mixing a percentage base
 * transform with numeric keyframes throws "All keyframes must be of the same
 * type" and crashes the component. The drift below uses clean numeric px
 * keyframes only.
 */
const PortalComposer = () => {
  const [ready, setReady] = useState(false);

  // Fade the composer in gently once mounted, so it doesn't "pop".
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
      {/* Fade-in + dim layer */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      >
        {/* Static centering wrapper — anchors the image to screen center. */}
        <div className="absolute inset-0 flex items-center justify-start">
          <motion.img
            src="/composer.png"
            alt=""
            draggable={false}
            className="max-w-none select-none"
            style={{ width: 'min(165vh, 200vw)', marginLeft: '-6vw', willChange: 'transform' }}
            // Slow breathing zoom + very slow diagonal drift. Three different
            // cycle lengths => the combined motion never visibly repeats.
            animate={{
              scale: [1, 1.022, 1],
              x: [0, 6, -4, 0],
              y: [0, -5, 5, 0],
            }}
            transition={{
              scale: { duration: 22, ease: 'easeInOut', repeat: Infinity },
              x: { duration: 34, ease: 'easeInOut', repeat: Infinity },
              y: { duration: 29, ease: 'easeInOut', repeat: Infinity },
            }}
          />
        </div>
      </motion.div>

      {/* Soft radial vignette — melts the edges into the black background and
          keeps the center calm so the buttons stay legible. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 75% at 30% 50%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0.92) 100%)',
        }}
      />
    </div>
  );
};

export default PortalComposer;
