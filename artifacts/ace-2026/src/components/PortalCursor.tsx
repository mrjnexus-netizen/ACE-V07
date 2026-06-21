import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';

/**
 * PortalCursor — a self-contained luxury cursor used ONLY on the language
 * selection screen (LinguisticPortal). Two concentric glowing gold rings that
 * follow the mouse, breathe gently (slow pulse), and emit a single expanding
 * pulse-ring on click. It hides the native cursor only while mounted, so the
 * rest of the site (which uses MagneticCursor) is never affected.
 *
 * Disabled on touch / coarse-pointer devices.
 */

interface Click { id: number; x: number; y: number; }

const PortalCursor = () => {
  // Skip entirely on touch devices.
  const [enabled] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches,
  );

  // Raw mouse position → smoothed with a spring for a calm, weighty follow.
  const mx = useMotionValue(-100);
  const my = useMotionValue(-100);
  const x = useSpring(mx, { damping: 26, stiffness: 260, mass: 0.6 });
  const y = useSpring(my, { damping: 26, stiffness: 260, mass: 0.6 });

  const [visible, setVisible] = useState(false);
  const [hot, setHot] = useState(false); // hovering a language button
  const [clicks, setClicks] = useState<Click[]>([]);
  const clickId = useRef(0);

  // Hide the native cursor across the page while the portal is mounted.
  // Restored automatically on unmount, so the inner site is untouched.
  useEffect(() => {
    if (!enabled) return;
    const prev = document.documentElement.style.cursor;
    document.documentElement.style.cursor = 'none';
    return () => { document.documentElement.style.cursor = prev; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const move = (e: MouseEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
      if (!visible) setVisible(true);
      const t = e.target as HTMLElement | null;
      setHot(!!t && !!t.closest('[data-cursor="go"]'));
    };
    const down = (e: MouseEvent) => {
      const id = clickId.current++;
      setClicks((c) => [...c, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setClicks((c) => c.filter((k) => k.id !== id)), 900);
    };
    const leave = () => setVisible(false);

    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseleave', leave);
    };
  }, [enabled, mx, my, visible]);

  if (!enabled) return null;

  const GOLD = '#F3D77E';

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        pointerEvents: 'none',
        cursor: 'none',
      }}
    >
      {/* Outer ring — larger, fainter, breathing. */}
      <motion.div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          translateX: '-50%',
          translateY: '-50%',
          borderRadius: '9999px',
          border: `1px solid ${GOLD}`,
          opacity: visible ? 0.55 : 0,
          boxShadow: `0 0 14px ${GOLD}66, inset 0 0 8px ${GOLD}33`,
        }}
        animate={{
          width: hot ? 28 : 19,
          height: hot ? 28 : 19,
          scale: [1, 1.12, 1],
        }}
        transition={{
          width: { type: 'spring', damping: 20, stiffness: 200 },
          height: { type: 'spring', damping: 20, stiffness: 200 },
          scale: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
        }}
      />

      {/* Inner ring — small, brighter, breathing in counter-phase. */}
      <motion.div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          translateX: '-50%',
          translateY: '-50%',
          borderRadius: '9999px',
          border: `1px solid ${GOLD}`,
          background: `radial-gradient(circle, ${GOLD}22 0%, transparent 70%)`,
          opacity: visible ? 0.95 : 0,
          boxShadow: `0 0 10px ${GOLD}88`,
        }}
        animate={{
          width: hot ? 7 : 5,
          height: hot ? 7 : 5,
          scale: [1, 0.82, 1],
        }}
        transition={{
          width: { type: 'spring', damping: 20, stiffness: 220 },
          height: { type: 'spring', damping: 20, stiffness: 220 },
          scale: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
        }}
      />

      {/* Click pulses — one expanding ring per click. */}
      <AnimatePresence>
        {clicks.map((c) => (
          <motion.div
            key={c.id}
            style={{
              position: 'fixed',
              left: c.x,
              top: c.y,
              translateX: '-50%',
              translateY: '-50%',
              borderRadius: '9999px',
              border: `1px solid ${GOLD}`,
            }}
            initial={{ width: 9, height: 9, opacity: 0.7 }}
            animate={{ width: 45, height: 45, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PortalCursor;
