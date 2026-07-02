import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ScaleStageProps {
  /** Logical canvas width in px - the composition is designed at this size. */
  width: number;
  /** Logical canvas height in px. */
  height: number;
  children: ReactNode;
  className?: string;
  /**
   * Whether to clip children to the logical canvas box (default true).
   * Set false when the composition's own edges already feather into the
   * background (e.g. a starfield) - clipping would otherwise draw a faint
   * hard rectangular boundary line where the canvas meets the surrounding
   * area on off-16:9 viewports.
   */
  clip?: boolean;
}

/**
 * ScaleStage — locks a composition to a fixed logical canvas (e.g. 1600x900)
 * and applies ONE uniform scale factor so every relationship inside it stays
 * IDENTICAL at any container size (blueprint G4 - "locked composition").
 *
 * scale = min(containerWidth / width, containerHeight / height)
 *
 * Using the SMALLER of the two ratios means the whole canvas always fits
 * inside the container without ever stretching/cropping unevenly - the
 * composition simply gets uniformly smaller on odd/narrow aspect ratios
 * (never deformed), exactly like zooming a single fixed image in and out.
 *
 * Children should be authored as if the viewport were exactly `width` x
 * `height` px (position with %, or with px/svg-viewBox math against that
 * fixed canvas) - do NOT use vw/vh inside children, since those units are
 * always relative to the REAL browser viewport and will not respect this
 * component's scale transform.
 */
export default function ScaleStage({ width, height, children, className, clip = true }: ScaleStageProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = Math.min(rect.width / width, rect.height / height);
      setScale(s);
    };

    measure();

    // ResizeObserver catches container-size changes (window resize, layout
    // shifts, devtools panel toggling, etc.) - more reliable than a bare
    // window 'resize' listener alone since it also fires on programmatic
    // layout changes that don't dispatch a resize event.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [width, height]);

  return (
    <div ref={outerRef} className={className} style={{ position: 'absolute', inset: 0, overflow: clip ? 'hidden' : 'visible' }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
