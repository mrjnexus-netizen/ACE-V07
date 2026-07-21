import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAudio } from '../context/AudioContext';

/**
 * Universal sound on/off toggle (per Reza's spec, 2026-07-08, revised
 * after first pass felt too small and lost the "music" feel):
 * - Tiny → now 48px, clearly visible.
 * - Spinning vinyl-disc icon (grooves + label dot) instead of plain
 *   waveform bars — closer to the reference's music-disc concept.
 * - Explicit `cursor: 'none'`: this button is mounted in AppRouter,
 *   OUTSIDE MainApp's `.ace-main-shell` (which is what the site's global
 *   cursor:none rule is scoped to) — so it needs its own override or the
 *   native OS pointer shows through here specifically, clashing with the
 *   custom magnetic cursor everywhere else.
 * - Never stops any audio *logic*; only silences the actual output — see
 *   AudioContext.tsx (GainNode is what really controls this once audio
 *   is routed through the Web Audio graph; the element's own .muted
 *   stops being effective at that point).
 * - Persists only for the current load: plain React state in
 *   AudioContext, resets on next refresh.
 */
export default function SoundToggle() {
  const { audioState, setMuted } = useAudio();
  const isMuted = audioState.isMuted;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.button
      type="button"
      onClick={() => setMuted(!isMuted)}
      aria-label={isMuted ? 'Unmute site sound' : 'Mute site sound'}
      aria-pressed={!isMuted}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.06 }}
      className="fixed flex items-center justify-center"
      style={{
        top: 0,
        left: '1.1rem',
        zIndex: 250,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'rgba(8,8,10,0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(212,175,55,0.35)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        cursor: 'none',
      }}
    >
      <svg viewBox="0 0 48 48" width="30" height="30" style={{ overflow: 'visible' }}>
        {/* ripple rings — only while unmuted */}
        <AnimatePresence>
          {!isMuted && (
            <>
              {[0, 0.7, 1.4].map((delay) => (
                <motion.circle
                  key={delay}
                  cx="24"
                  cy="24"
                  r="9"
                  fill="none"
                  stroke="rgba(212,175,55,0.4)"
                  strokeWidth="1"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.1, repeat: Infinity, delay, ease: 'easeOut' }}
                  style={{ transformOrigin: '24px 24px' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* the vinyl disc — spins continuously while unmuted, freezes when muted */}
        <motion.g
          animate={isMuted ? { rotate: 0 } : { rotate: 360 }}
          transition={isMuted ? { duration: 0.4 } : { duration: 4.5, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '24px 24px' }}
        >
          <circle cx="24" cy="24" r="10.5" fill="rgba(212,175,55,0.1)" stroke="var(--accent-color, #D4AF37)" strokeWidth="1.3" />
          <circle cx="24" cy="24" r="7.4" fill="none" stroke="var(--accent-color, #D4AF37)" strokeWidth="0.7" opacity="0.55" />
          <circle cx="24" cy="24" r="4.6" fill="none" stroke="var(--accent-color, #D4AF37)" strokeWidth="0.7" opacity="0.4" />
          {/* label dot, offset from center like a real record label mark */}
          <circle cx="24" cy="16.5" r="1.3" fill="var(--accent-color, #D4AF37)" />
          <circle cx="24" cy="24" r="1.6" fill="var(--accent-color, #D4AF37)" />
        </motion.g>

        {/* muted slash */}
        <AnimatePresence>
          {isMuted && (
            <motion.line
              x1="15" y1="15" x2="33" y2="33"
              stroke="var(--accent-color, #D4AF37)"
              strokeWidth="1.8"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
          )}
        </AnimatePresence>
      </svg>
    </motion.button>,
    document.body
  );
}
