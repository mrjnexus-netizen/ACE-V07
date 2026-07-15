import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';
import EditableImage from './EditableImage';

/**
 * PortalComposer — the cinematic composer image at the heart of the language
 * portal, sitting BEHIND the language buttons and the ACE logo.
 *
 * Design intent (luxury / "less effect = more luxury"):
 *  - Static photo (2026-07-14 per Reza: the original slow breathing zoom +
 *    diagonal drift animation was removed — the image no longer moves).
 *  - Natural, unfiltered photo quality (2026-07-14 per Reza: the previous
 *    sharpen convolution + contrast/saturate/brightness push was producing
 *    visible artifacts on real uploaded photos and degrading quality —
 *    removed entirely; the photo now renders exactly as uploaded).
 *  - Image at opacity ~0.82 so it melts softly into space.
 *  - A radial MASK feathers all edges so the frame never shows as a hard line.
 *
 * IMPORTANT (framer-motion 11): centering uses a STATIC flex wrapper.
 *
 * 2026-07-14 (per Reza) — admin-editable (replace/zoom/reposition), added
 * WITHOUT touching this component's own always-visible render at all —
 * that path below is the exact original code, zero risk to the live look.
 *
 * Multiple z-index attempts at making the always-visible layer itself
 * clickable in edit mode all lost to LinguisticPortal's HeadstockSelector
 * SVG (confirmed via elementFromPoint() + getComputedStyle() in DevTools,
 * repeatedly — this wasn't guessed) — some intermediate stacking context
 * inside ScaleStage keeps trapping it regardless of the z-index value used.
 * Rather than keep archaeology-ing ScaleStage's internals, this uses the
 * SAME proven technique MagneticCursor.tsx already uses for the identical
 * class of problem: a React portal straight to document.body with
 * position:fixed. A portaled node is not a descendant of ScaleStage (or
 * anything else) at all, so no ancestor's stacking context can ever trap
 * it — deterministic, not another guess.
 *
 * EditPortalOverlay below is a SEPARATE, INVISIBLE (opacity:0) EditableImage
 * instance, portaled to <body>, position:fixed over the real photo's
 * on-screen rect (recalculated on scroll/resize). It shares the exact same
 * contentKey as the visible photo, so replacing/cropping through it updates
 * the real (always-visible, untouched) photo automatically via ContentContext
 * — no visual duplication, since the overlay itself never shows its image.
 */

// 2026-07-14 (per Reza): uploaded photos have unpredictable backgrounds, so
// any perceivable edge between photo and the galaxy backdrop reads as ugly.
// The fade must reach TRUE zero well inside the frame on every side — the
// photo dissolves into space the way its bottom-right already did (the one
// spot Reza pointed to as "this is how it should look everywhere"). The old
// mask held 100% opacity out to 52% and then fell off quickly — a narrow
// transition band that read as a soft-but-visible border, especially near
// the square frame's top/left. This one starts easing from 30% out and hits
// 0 at 88%, so a wide, gradual dissolve on all four sides and no photo
// pixel ever reaches the frame boundary at any visible opacity.
const EDGE_FADE =
  'radial-gradient(ellipse 58% 58% at 50% 48%, ' +
  '#000 0%, #000 30%, rgba(0,0,0,0.88) 44%, rgba(0,0,0,0.62) 58%, ' +
  'rgba(0,0,0,0.36) 70%, rgba(0,0,0,0.16) 79%, rgba(0,0,0,0.05) 85%, rgba(0,0,0,0) 88%)';

const MASK = EDGE_FADE;

const DEFAULT_PHOTO = '/composer.png';
const CONTENT_KEY = 'linguisticPortal.composerPhoto';

/** Portaled to document.body only while editMode is true. Tracks the real
 * photo's live on-screen rect (via the ref passed in) and renders an
 * invisible, pointer-events:auto EditableImage exactly on top of it, at a
 * z-index guaranteed to beat everything except the custom cursor. */
function EditPortalOverlay({ photoRef }: { photoRef: RefObject<HTMLImageElement> }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const update = () => {
      const el = photoRef.current;
      if (!el) return;
      // WelcomeGate is CONDITIONALLY mounted in LinguisticPortal
      // ({!entered && <WelcomeGate/>}) — when it's up, its '.wg-stage'
      // node exists in the DOM; the moment Enter is clicked it's fully
      // removed. That's a direct, deterministic signal — replaces an
      // earlier elementFromPoint()-based visibility guess that the
      // full-screen headstock SVG (z-index:7, covers the photo at all
      // times on the language page) was silently defeating.
      if (document.querySelector('.wg-stage')) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const id = window.setInterval(update, 400); // tracks the breathing zoom/drift + gate open/close
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.clearInterval(id);
    };
  }, [photoRef]);

  // When the photo is covered (rect===null), returning null UNMOUNTS the
  // EditableImage below entirely — destroying any in-progress state it
  // held (hover, an open crop session, toolbar) rather than leaving a
  // stale position:fixed crop UI floating over whatever screen replaced
  // it (the exact bug seen when WelcomeGate re-covered the scene while a
  // crop was open).
  if (!rect || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        zIndex: 250,
      }}
    >
      <EditableImage contentKey={CONTENT_KEY} defaultUrl={DEFAULT_PHOTO}>
        {(url) => <img src={url} alt="" style={{ width: '100%', height: '100%', opacity: 0, objectFit: 'cover' }} />}
      </EditableImage>
    </div>,
    document.body
  );
}

const PortalComposer = ({
  widthCss = 'min(120vh, 140vw)',
  marginLeftCss = '1vw',
}: { widthCss?: string; marginLeftCss?: string } = {}) => {
  const [ready, setReady] = useState(false);
  const { editMode, resolve } = useContent();
  const photoRef = useRef<HTMLImageElement>(null);

  // The always-visible photo now resolves the SAME contentKey the portaled
  // overlay saves to, so a replacement shows up here immediately.
  const resolvedUrl = resolve(CONTENT_KEY, 'en') || DEFAULT_PHOTO;

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
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 flex items-center justify-start">
          <div style={{ position: 'relative', marginLeft: marginLeftCss, width: widthCss, aspectRatio: '1' }}>
            <img
              ref={photoRef}
              src={resolvedUrl}
              alt=""
              draggable={false}
              className="max-w-none select-none"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.82,
                WebkitMaskImage: MASK,
                maskImage: MASK,
              }}
            />
          </div>
        </div>
      </motion.div>

      <div className="absolute inset-0" style={{ background: 'transparent' }} />

      {editMode && <EditPortalOverlay photoRef={photoRef} />}
    </div>
  );
};

export default PortalComposer;
