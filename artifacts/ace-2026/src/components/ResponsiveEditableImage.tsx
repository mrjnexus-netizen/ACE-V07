import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useContent } from '../context/ContentContext';
import EditableImage from './EditableImage';

/**
 * ResponsiveEditableImage — for "landscape photo" spots that need a
 * DIFFERENT crop per device shape, not just a smaller version of the same
 * crop (2026-07-17, per Reza's live iPad Pro test: a wide photo forced
 * into a narrow/tall tablet box was cropping away almost everything but a
 * sliver — the real fix for content like that is letting the admin choose
 * what shows on each device, not just scaling one crop down further).
 *
 * v2 (2026-07-17, per Reza's UX review of v1): v1 showed a small 3-thumbnail
 * panel permanently floating over the image whenever in edit mode — Reza
 * pointed out this clutters the most important image on the page (the
 * Hero) while it's being reviewed. Better: a single unobtrusive "Replace"
 * -style button (same corner/style language as EditableImage's own
 * toolbar) opens a clean modal dialog with all three device slots side by
 * side. Browse, crop, and save each independently inside the dialog;
 * "Done" closes it and you're back on the real page, already showing the
 * update.
 *
 * Storage: reuses the EXISTING content_entries system as-is (key + locale
 * + value) — no schema change, no new API route, and each slot inside the
 * dialog is a full, ordinary EditableImage (same Replace/Generate/Delete/
 * Set-to-default toolbar it has everywhere else on the site — nothing new
 * to learn). Three keys share one base name:
 *   - `${contentKey}`          — desktop (the "master" — also exactly the
 *                                 key any OLD, non-responsive
 *                                 EditableImage(contentKey) elsewhere on
 *                                 the site already reads, so wrapping an
 *                                 existing image in this component is
 *                                 backward-compatible: the photo an admin
 *                                 already set keeps showing exactly as
 *                                 before until they touch the new tablet/
 *                                 mobile slots).
 *   - `${contentKey}.tablet`   — tablet override (falls back to desktop)
 *   - `${contentKey}.mobile`  — mobile override (falls back to tablet,
 *                                 then desktop)
 *
 * Breakpoints match the ones already fixed elsewhere in this same audit
 * (WorksGallery's mirror-portrait `xl:` threshold, LinguisticPortal /
 * DoubleExposurePortrait's orientation-aware mobile check) — mobile <768,
 * tablet 768-1279, desktop >=1280.
 */

type DeviceVariant = 'desktop' | 'tablet' | 'mobile';

function classify(width: number): DeviceVariant {
  if (width < 768) return 'mobile';
  if (width < 1280) return 'tablet';
  return 'desktop';
}

function useDeviceVariant(): DeviceVariant {
  const [variant, setVariant] = useState<DeviceVariant>(() =>
    typeof window !== 'undefined' ? classify(window.innerWidth) : 'desktop'
  );
  useEffect(() => {
    const onResize = () => setVariant(classify(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return variant;
}

interface ResponsiveEditableImageProps {
  /** Base key for the desktop/master variant (e.g. 'worksSection.mirrorPortrait'). */
  contentKey: string;
  /** Compiled-in default — used for ALL three variants until an admin
   * uploads device-specific replacements. */
  defaultUrl: string;
  children: (url: string) => ReactNode;
}

// 2026-07-17 (per Reza): 3 identical square frames gave no sense of how a
// crop would actually look on each device — a Desktop photo is landscape,
// a Mobile one is tall/portrait. Real (representative, not pixel-exact —
// exact numbers vary per placement on the site) device-shaped frames so
// the admin can visually judge the crop before saving.
const DEVICE_FRAME_ASPECT: Record<'desktop' | 'tablet' | 'mobile', string> = {
  desktop: '16 / 9',
  tablet: '3 / 4',
  mobile: '9 / 16',
};

function DeviceSlot({
  device,
  label,
  hint,
  contentKey,
  defaultUrl,
}: {
  device: 'desktop' | 'tablet' | 'mobile';
  label: string;
  hint: string;
  contentKey: string;
  defaultUrl: string;
}) {
  return (
    <div className="rei-modal-slot">
      <div className="rei-modal-slot-header">
        <span className="rei-modal-slot-label">{label}</span>
        <span className="rei-modal-slot-hint">{hint}</span>
      </div>
      <div className="rei-modal-slot-frame" style={{ aspectRatio: DEVICE_FRAME_ASPECT[device] }}>
        <EditableImage contentKey={contentKey} defaultUrl={defaultUrl}>
          {(url) => <img src={url} alt="" className="rei-modal-slot-img" />}
        </EditableImage>
      </div>
    </div>
  );
}

export default function ResponsiveEditableImage({ contentKey, defaultUrl, children }: ResponsiveEditableImageProps) {
  const { resolve, editMode } = useContent();
  const variant = useDeviceVariant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [triggerPos, setTriggerPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const tabletKey = `${contentKey}.tablet`;
  const mobileKey = `${contentKey}.mobile`;

  const desktopUrl = resolve(contentKey, 'en') || defaultUrl;
  const tabletUrl = resolve(tabletKey, 'en') || desktopUrl;
  const mobileUrl = resolve(mobileKey, 'en') || tabletUrl;

  const activeUrl = variant === 'mobile' ? mobileUrl : variant === 'tablet' ? tabletUrl : desktopUrl;

  // 2026-07-17 (real regression, per Reza): the trigger used to be a plain
  // position:absolute child of this wrapper, which meant it lived inside
  // whatever local stacking context its caller happened to be — for the
  // Hero (GridLayoutEngine.tsx), that's a motion.div with a continuous
  // scale/x animation (its own transform -> its own stacking context)
  // inside an ancestor with overflow:hidden. The trigger was there in the
  // DOM but effectively unreachable/invisible depending on the caller's
  // own layout — exactly the "the edit box completely disappeared" bug
  // Reza hit. EditableImage's OWN toolbar never has this problem because
  // it's portaled straight to document.body with a fixed, viewport-
  // anchored position computed from the wrapper's real on-screen rect —
  // copying that exact, already-proven approach here instead of
  // reinventing a different one.
  useEffect(() => {
    if (!hovering) return;
    const update = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const visibleTop = Math.max(rect.top, 0);
      const visibleRight = Math.min(rect.right, window.innerWidth);
      setTriggerPos({ top: visibleTop + 12, left: visibleRight - 12 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hovering]);

  if (!editMode) {
    return <>{children(activeUrl)}</>;
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {children(activeUrl)}

      {/* Single unobtrusive trigger, portaled to document.body (see the
          effect above for why) so it's always reachable/visible regardless
          of whatever transform/overflow/stacking-context the caller's own
          layout has. */}
      {hovering &&
        triggerPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            className="rei-trigger"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onClick={() => setDialogOpen(true)}
            style={{ position: 'fixed', top: triggerPos.top, left: triggerPos.left, transform: 'translate(-100%, 0)' }}
          >
            Edit Photos (3 devices)
          </button>,
          document.body
        )}

      {dialogOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="rei-modal-backdrop" onMouseDown={() => setDialogOpen(false)}>
            <div className="rei-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="rei-modal-header">
                <span className="rei-modal-title">Photo — per device</span>
                <button type="button" className="rei-modal-close" onClick={() => setDialogOpen(false)}>
                  Done
                </button>
              </div>
              <p className="rei-modal-subtitle">
                Set a different crop for each device. Leave a slot untouched and it automatically falls
                back to the one above it (Mobile &rarr; Tablet &rarr; Desktop).
              </p>
              <div className="rei-modal-slots">
                <DeviceSlot
                  device="desktop"
                  label="Desktop"
                  hint="≥1280px — master, used as fallback"
                  contentKey={contentKey}
                  defaultUrl={defaultUrl}
                />
                <DeviceSlot
                  device="tablet"
                  label="Tablet"
                  hint="768–1279px"
                  contentKey={tabletKey}
                  defaultUrl={desktopUrl}
                />
                <DeviceSlot
                  device="mobile"
                  label="Mobile"
                  hint="<768px"
                  contentKey={mobileKey}
                  defaultUrl={tabletUrl}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
