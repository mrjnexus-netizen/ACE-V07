import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '../context/TranslationContext';

/**
 * PromoScreen — 2026-07-14 (per Reza). An OPTIONAL fullscreen page shown
 * automatically right after language selection, before the visitor reaches
 * MainApp. Admin-controlled entirely: on/off, and whatever the admin wants
 * to promote (a video, a banner, a concert poster, an upcoming track —
 * literally any image or video).
 *
 * Behaviour:
 *  - Image: shown for `durationMs` (admin-configurable, default 10s), then
 *    auto-advances.
 *  - Video: plays to its own natural end, THEN holds 3 more seconds before
 *    auto-advancing (unless already skipped).
 *  - A quiet countdown (seconds remaining) sits under Skip so visitors
 *    always know how long they'd wait.
 *  - Skip stays inactive for the first 20% of the total display time, then
 *    lights up — a deliberate small delay, not a hard block.
 *  - This is rendered while LinguisticPortal is still mounted (before
 *    MainApp/MagneticCursor exist), so the sitewide cursor:none rule would
 *    otherwise leave NO visible cursor at all here — explicitly restores
 *    the native cursor for this screen only.
 */

const DEFAULT_IMAGE_DURATION_MS = 10000;
const VIDEO_END_GRACE_MS = 3000;
const FADE_MS = 600;
const SKIP_ACTIVATES_AT = 0.2; // 20% of total duration

export default function PromoScreen({
  mediaType,
  mediaUrl,
  durationMs,
  onDone,
}: {
  mediaType: 'video' | 'image';
  mediaUrl: string;
  durationMs?: number;
  onDone: () => void;
}) {
  const { t } = useT();
  const [visible, setVisible] = useState(true);
  const [totalMs, setTotalMs] = useState<number | null>(mediaType === 'image' ? (durationMs ?? DEFAULT_IMAGE_DURATION_MS) : null);
  const [remainingMs, setRemainingMs] = useState<number | null>(totalMs);
  const [skipReady, setSkipReady] = useState(false);
  const doneRef = useRef(false);
  const startRef = useRef<number>(performance.now());

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Image: fixed countdown from totalMs.
  useEffect(() => {
    if (mediaType !== 'image' || totalMs == null) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, totalMs - (performance.now() - startRef.current));
      setRemainingMs(left);
      if (left <= 0) {
        window.clearInterval(id);
        finish();
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, totalMs]);

  // Skip activates once 20% of the total known duration has elapsed.
  useEffect(() => {
    if (totalMs == null) return;
    const id = window.setTimeout(() => setSkipReady(true), totalMs * SKIP_ACTIVATES_AT);
    return () => window.clearTimeout(id);
  }, [totalMs]);

  const handleVideoMeta = (e: SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) {
      const ms = d * 1000 + VIDEO_END_GRACE_MS;
      setTotalMs(ms);
      setRemainingMs(ms);
      startRef.current = performance.now();
    }
  };

  const handleVideoTimeUpdate = () => {
    if (totalMs == null) return;
    const left = Math.max(0, totalMs - (performance.now() - startRef.current));
    setRemainingMs(left);
  };

  const handleVideoEnded = () => {
    // Hold VIDEO_END_GRACE_MS after the video's own natural end, then advance.
    window.setTimeout(finish, VIDEO_END_GRACE_MS);
  };

  const remainingSeconds = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: 'easeInOut' }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: '#000', zIndex: 99980, cursor: 'auto' }}
        >
          {mediaType === 'video' ? (
            <video
              src={mediaUrl}
              autoPlay
              playsInline
              onLoadedMetadata={handleVideoMeta}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              className="w-full h-full object-contain"
              style={{ background: '#000', cursor: 'auto' }}
            />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-contain select-none" draggable={false} style={{ cursor: 'auto' }} />
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ gap: 6 }}>
            <button
              type="button"
              onClick={skipReady ? finish : undefined}
              disabled={!skipReady}
              className="transition-all active:scale-95"
              style={{
                padding: '5px 18px',
                borderRadius: 999,
                fontSize: '0.68rem',
                letterSpacing: '0.16em',
                fontWeight: 400,
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                background: 'rgba(8,8,10,0.4)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: skipReady
                  ? '1px solid rgba(var(--accent-rgb, 212,175,55), 0.5)'
                  : '1px solid rgba(255,255,255,0.1)',
                color: skipReady ? 'rgba(var(--accent-rgb, 212,175,55), 0.95)' : 'rgba(255,255,255,0.28)',
                boxShadow: skipReady ? '0 0 14px rgba(var(--accent-rgb, 212,175,55), 0.25)' : 'none',
                cursor: skipReady ? 'pointer' : 'default',
                opacity: skipReady ? 1 : 0.6,
                transitionDuration: '0.5s',
              }}
            >
              {t('Skip')}
            </button>
            {remainingSeconds != null && remainingSeconds > 0 && (
              <span
                style={{
                  fontSize: '0.62rem',
                  letterSpacing: '0.08em',
                  color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'var(--font-display)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {remainingSeconds}s
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
