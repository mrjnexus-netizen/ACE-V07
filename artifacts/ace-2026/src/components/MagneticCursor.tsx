import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const MagneticCursor = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [cursorType, setCursorType] = useState<'default' | 'text' | 'media' | 'audio'>('default');
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const posX = useMotionValue(-100);
  const posY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 200 };
  const cursorX = useSpring(posX, springConfig);
  const cursorY = useSpring(posY, springConfig);

  useEffect(() => {
    // Gracefully hide on touch devices
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) {
      document.body.style.cursor = 'auto';
      return;
    }

    // Hide original cursor
    document.body.style.cursor = 'none';
    setVisible(true);

    const moveCursor = (e: MouseEvent) => {
      posX.set(e.clientX - 6);
      posY.set(e.clientY - 6);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const cursorAttr = target.getAttribute('data-cursor');
      if (cursorAttr === 'play') {
        setCursorType('audio');
      } else if (cursorAttr === 'view') {
        setCursorType('media');
      } else if (
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('a')
      ) {
        setCursorType('text');
      } else {
        setCursorType('default');
      }
    };

    window.addEventListener('mousemove', moveCursor);
    window.addEventListener('mouseover', handleMouseOver);

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      window.removeEventListener('mouseover', handleMouseOver);
      document.body.style.cursor = 'auto';
    };
  }, [posX, posY]);

  if (!visible) return null;

  const cursorVariants = {
    default: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: 'var(--accent-color)',
    },
    text: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      border: '1px solid var(--accent-color)',
      backgroundColor: 'transparent',
    },
    media: {
      width: 48,
      height: 48,
      borderRadius: '50%',
      backgroundColor: 'rgba(var(--accent-rgb), 0.2)',
      border: '1px solid var(--accent-color)',
    },
    audio: {
      width: 48,
      height: 48,
      borderRadius: '50%',
      backgroundColor: 'rgba(var(--accent-rgb), 0.3)',
      border: '2px solid var(--accent-color)',
    },
  };

  return (
    <motion.div
      ref={cursorRef}
      style={{
        left: cursorX,
        top: cursorY,
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        position: 'fixed',
        zIndex: 99999,
        transform: 'translate3d(0, 0, 0)',
      }}
      variants={cursorVariants}
      animate={cursorType}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center justify-center font-mono text-[9px] text-accent font-bold tracking-widest uppercase"
    >
      {cursorType === 'audio' && 'PLAY'}
      {cursorType === 'media' && 'VIEW'}
    </motion.div>
  );
};

export default MagneticCursor;
