import { useEffect, useRef, useState } from 'react';

interface ImageCropModalProps {
  file: File;
  /** width / height of the target frame, e.g. 4/3, 3/4, 16/9. */
  aspectRatio: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const FRAME_WIDTH = 460;
const OUTPUT_WIDTH = 1600;

/**
 * G2/A3a — the missing piece of EditableImage's upload flow (per Reza):
 * bring the photo into a frame, let the admin drag it around and zoom in/
 * out, THEN commit. Nothing is uploaded until "Save" here is pressed.
 *
 * Approach: rather than storing a separate "focal point" alongside the
 * URL (which would mean every consumer of EditableImage has to also
 * understand that metadata), this bakes the chosen pan/zoom into the
 * actual exported file via canvas — the uploaded image already IS what
 * the admin composed. Simpler for the rest of the system, at the cost of
 * not being able to re-adjust framing later without re-uploading (an
 * acceptable trade for how this site uses these images).
 */
export default function ImageCropModal({ file, aspectRatio, onConfirm, onCancel }: ImageCropModalProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);
  const imgElRef = useRef<HTMLImageElement>(null);

  const frameHeight = FRAME_WIDTH / aspectRatio;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base "cover" size — the image size (before the admin's extra zoom)
  // that exactly fills the frame with no gaps, same logic CSS object-fit:
  // cover uses. Everything else (drag offset, extra zoom) builds on this.
  const baseSize = (() => {
    if (!natural) return { w: FRAME_WIDTH, h: frameHeight };
    const imgAspect = natural.w / natural.h;
    if (imgAspect > aspectRatio) {
      const h = frameHeight;
      return { w: h * imgAspect, h };
    }
    const w = FRAME_WIDTH;
    return { w, h: w / imgAspect };
  })();

  const drawW = baseSize.w * scale;
  const drawH = baseSize.h * scale;

  const clampOffset = (x: number, y: number) => {
    // Never let the image pan far enough to show empty space inside the frame.
    const maxX = Math.max(0, (drawW - FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (drawH - frameHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffX + dx, dragRef.current.startOffY + dy));
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const next = Math.min(3, Math.max(1, s - e.deltaY * 0.0015));
      return next;
    });
  };

  // Re-clamp whenever zoom changes (zooming out can leave the previous
  // pan out of bounds).
  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, natural]);

  const handleConfirm = () => {
    const img = imgElRef.current;
    if (!img || !natural) return;
    setExporting(true);

    const outH = Math.round(OUTPUT_WIDTH / aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setExporting(false); return; }

    const outScale = OUTPUT_WIDTH / FRAME_WIDTH;
    const outDrawW = drawW * outScale;
    const outDrawH = drawH * outScale;
    const outX = (OUTPUT_WIDTH - outDrawW) / 2 + offset.x * outScale;
    const outY = (outH - outDrawH) / 2 + offset.y * outScale;

    ctx.drawImage(img, 0, 0, natural.w, natural.h, outX, outY, outDrawW, outDrawH);

    canvas.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) onConfirm(blob);
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 600, background: 'rgba(4,4,6,0.88)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="rounded-xl p-6"
        style={{ background: 'rgba(16,16,18,0.98)', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
      >
        <p className="font-mono uppercase text-center mb-3" style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--accent-color)' }}>
          Drag to reposition · scroll or slider to zoom
        </p>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          style={{
            width: FRAME_WIDTH,
            height: frameHeight,
            overflow: 'hidden',
            position: 'relative',
            cursor: 'grab',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            touchAction: 'none',
          }}
        >
          {imgUrl && (
            <img
              ref={imgElRef}
              src={imgUrl}
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: drawW,
                height: drawH,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          className="w-full mt-3"
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            className="ace-editable-btn"
            onClick={onCancel}
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ace-editable-btn ace-editable-btn--save"
            onClick={handleConfirm}
            disabled={exporting || !natural}
          >
            {exporting ? 'Preparing…' : 'Use This Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
