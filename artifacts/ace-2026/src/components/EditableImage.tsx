import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useContent } from '../context/ContentContext';
import { apiPost } from '../lib/apiClient';

interface UploadedAsset {
  url: string;
}

interface EditableImageProps {
  /** Stable key identifying this image (e.g. 'hero.backgroundImage'). */
  contentKey: string;
  /** The compiled-in default URL — what renders until an admin replaces
   * it, and what "Set-to-default" reverts back to. */
  defaultUrl: string;
  /** Render prop: given the resolved URL (override or default), render
   * the actual image element. Lets callers keep their own <img> or
   * <motion.img> (parallax, masks, whatever) — EditableImage only owns
   * URL resolution and the edit-mode chrome around it, never the image
   * element itself. */
  children: (url: string) => ReactNode;
}

/**
 * G2/A3a — image variant of EditableText.
 *
 * v3 (per Reza, 2026-07-08): the reposition/zoom step happens IN PLACE,
 * directly inside the same frame the image already occupies on the real
 * page — NOT a separate popup with its own made-up size. The frame's
 * live on-screen size (from wrapRef's getBoundingClientRect) IS the crop
 * frame; no aspectRatio prop needed anymore, it's read from reality.
 *
 * Photos are NOT per-language — one override, saved once against the
 * 'en' row; `resolve()` already falls back to 'en' for every other
 * locale, so every language shows the same photo automatically.
 *
 * Uploads go through the EXISTING /api/media/upload endpoint (S3 +
 * blurhash, already used by the works pipeline) — entity_type: 'content',
 * entity_id: the contentKey.
 *
 * Scope (per Reza): composer's own photography only (Hero background,
 * About portrait) — never the AI-generated work thumbnails; those belong
 * to the separate H9 pipeline.
 */
export default function EditableImage({ contentKey, defaultUrl, children }: EditableImageProps) {
  const { editMode, resolve, save, resetToDefault } = useContent();

  const resolved = resolve(contentKey, 'en');
  const displayUrl = resolved || defaultUrl;

  const [hovering, setHovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  // --- crop-in-place state (only populated while composing a new upload) ---
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHovering(true);
  };
  const scheduleHide = () => {
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setHovering(false), 220);
  };

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Toolbar position: fixed at the top-right INNER corner of whatever
  // portion of the image is currently visible in the viewport — NOT
  // tied to mouse position at all (per Reza: independent of the mouse,
  // never jumps around). Recalculated on scroll/resize so it stays
  // anchored to the visible part of the image even if the image is
  // taller than the viewport. Crop mode keeps its own below-frame spot.
  useEffect(() => {
    if (!hovering && !notice && !pendingFile) return;
    const update = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (pendingFile) {
        setToolbarPos({ top: rect.bottom + 8, left: rect.left });
      } else {
        const visibleTop = Math.max(rect.top, 0);
        const visibleRight = Math.min(rect.right, window.innerWidth);
        setToolbarPos({ top: visibleTop + 16, left: visibleRight - 16 });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hovering, notice, pendingFile]);

  useEffect(() => {
    if (!pendingFile) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setPendingUrl(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);
  if (!editMode) {
    return <>{children(displayUrl)}</>;
  }

  // Base "cover" size — the image size (before any extra zoom) that
  // exactly fills the REAL frame (wrapRef's actual on-screen box) with no
  // gaps, same logic CSS object-fit:cover uses.
  const frameRect = wrapRef.current?.getBoundingClientRect();
  const frameW = frameRect?.width || 1;
  const frameH = frameRect?.height || 1;
  const baseSize = (() => {
    if (!natural) return { w: frameW, h: frameH };
    const imgAspect = natural.w / natural.h;
    const frameAspect = frameW / frameH;
    if (imgAspect > frameAspect) {
      const h = frameH;
      return { w: h * imgAspect, h };
    }
    const w = frameW;
    return { w, h: w / imgAspect };
  })();
  const drawW = baseSize.w * scale;
  const drawH = baseSize.h * scale;

  const clampOffset = (x: number, y: number) => {
    const maxX = Math.max(0, (drawW - frameW) / 2);
    const maxY = Math.max(0, (drawH - frameH) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  // Re-clamps for a NEW zoom level (not the current one) — used right
  // after setScale so the pan offset never leaves a gap when zooming out,
  // whether the zoom came from the wheel or the slider.
  const clampOffsetForScale = (nextScale: number, x: number, y: number) => {
    const nextW = baseSize.w * nextScale;
    const nextH = baseSize.h * nextScale;
    const maxX = Math.max(0, (nextW - frameW) / 2);
    const maxY = Math.max(0, (nextH - frameH) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const applyZoom = (nextScale: number) => {
    const clamped = Math.min(3, Math.max(1, nextScale));
    setScale(clamped);
    setOffset((o) => clampOffsetForScale(clamped, o.x, o.y));
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
    applyZoom(scale - e.deltaY * 0.0015);
  };

  const handleCropConfirm = () => {
    const img = cropImgRef.current;
    if (!img || !natural || !frameRect) return;
    setUploading(true);
    setNotice('Uploading…');

    // Export at 2x the real on-screen frame size for a crisp result,
    // capped so huge monitors don't produce absurdly large files.
    const outScale = Math.min(2, 2000 / Math.max(frameW, frameH));
    const outW = Math.round(frameW * outScale);
    const outH = Math.round(frameH * outScale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setUploading(false); return; }

    const outDrawW = drawW * outScale;
    const outDrawH = drawH * outScale;
    const outX = (outW - outDrawW) / 2 + offset.x * outScale;
    const outY = (outH - outDrawH) / 2 + offset.y * outScale;
    ctx.drawImage(img, 0, 0, natural.w, natural.h, outX, outY, outDrawW, outDrawH);

    canvas.toBlob(
      async (blob) => {
        if (!blob) { setUploading(false); setNotice('Could not prepare the image — try again.'); return; }
        try {
          const form = new FormData();
          form.append('media', blob, 'photo.jpg');
          form.append('entity_type', 'content');
          form.append('entity_id', contentKey);
          const asset = await apiPost<UploadedAsset>('/api/media/upload', form);
          await save(contentKey, 'en', 'image', asset.url);
          setNotice(null);
          setPendingFile(null);
        } catch {
          setNotice('Upload failed — try again.');
        } finally {
          setUploading(false);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await save(contentKey, 'en', 'image', '');
      setNotice(null);
    } catch {
      setNotice('Could not clear — try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await resetToDefault(contentKey, 'en');
      setNotice(null);
    } catch {
      setNotice('Could not reset — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative block"
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      style={{ width: '100%', height: '100%' }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          outline: hovering || pendingFile ? '1.5px dashed rgba(212,175,55,0.75)' : '1.5px dashed transparent',
          outlineOffset: '-3px',
          transition: 'outline-color 0.2s ease',
        }}
      >
        {children(displayUrl)}
      </div>

      {/* Crop-in-place overlay — fills the SAME frame, right on top of the
          real image, while composing a new upload. */}
      {pendingFile && pendingUrl && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className="absolute inset-0"
          style={{ overflow: 'hidden', cursor: 'grab', touchAction: 'none', background: '#000' }}
        >
          <img
            ref={cropImgRef}
            src={pendingUrl}
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
        </div>
      )}

      {(hovering || notice || pendingFile) &&
        toolbarPos &&
        createPortal(
          <span
            className="ace-editable-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: 'fixed',
              top: toolbarPos.top,
              left: toolbarPos.left,
              transform: pendingFile ? 'none' : 'translate(-100%, 0)',
            }}
          >
            {pendingFile ? (
              <span className="ace-editable-editform">
                <span className="ace-editable-editform-actions" style={{ justifyContent: 'space-between' }}>
                  <span className="ace-editable-notice" style={{ margin: 0 }}>
                    Drag to reposition
                  </span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="ace-editable-btn" onClick={() => setPendingFile(null)} disabled={uploading}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ace-editable-btn ace-editable-btn--save"
                      onClick={handleCropConfirm}
                      disabled={uploading || !natural}
                    >
                      {uploading ? 'Uploading…' : 'Use This Photo'}
                    </button>
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className="ace-editable-notice" style={{ margin: 0, whiteSpace: 'nowrap' }}>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={scale}
                    onChange={(e) => applyZoom(parseFloat(e.target.value))}
                    style={{ width: 220 }}
                  />
                </span>
              </span>
            ) : (
              <>
                <button type="button" className="ace-editable-btn" onClick={() => fileInputRef.current?.click()}>
                  Replace
                </button>
                <button
                  type="button"
                  className="ace-editable-btn"
                  onClick={() => setNotice('AI image generation is coming soon (needs an A3b model selected).')}
                >
                  Generate
                </button>
                <button type="button" className="ace-editable-btn" onClick={handleDelete} disabled={busy}>
                  Delete
                </button>
                <button type="button" className="ace-editable-btn" onClick={handleReset} disabled={busy || resolved === null}>
                  Set to default
                </button>
              </>
            )}
            {notice && <span className="ace-editable-notice">{notice}</span>}
          </span>,
          document.body
        )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/webp,image/jpeg,image/png,image/gif,image/heic,image/heif,image/bmp,image/tiff"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
