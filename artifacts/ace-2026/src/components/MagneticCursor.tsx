import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const MagneticCursor = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [cursorType, setCursorType] = useState<'default' | 'text' | 'media' | 'play' | 'drag'>('default');

  const posX = useMotionValue(-100);
  const posY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 200 };
  const cursorX = useSpring(posX, springConfig);
  const cursorY = useSpring(posY, springConfig);

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) {
      document.body.style.cursor = 'auto';
      return;
    }

    document.body.style.cursor = 'none';
    setVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      posX.set(e.clientX - 6);
      posY.set(e.clientY - 6);

      const magnetics = document.querySelectorAll('[data-magnetic], button, a');
      magnetics.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const htmlEl = el as HTMLElement;
        if (dist < 80) {
          posX.set(centerX - 6);
          posY.set(centerY - 6);
          htmlEl.style.transform = `translate3d(${dx * 0.35}px, ${dy * 0.35}px, 0)`;
          htmlEl.style.transition = 'transform 0.1s ease-out';
        } else {
          if (htmlEl.style.transform) {
            htmlEl.style.transform = '';
            htmlEl.style.transition = 'transform 0.3s ease-out';
          }
        }
      });
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const cursorAttr = target.getAttribute('data-cursor') || target.closest('[data-cursor]')?.getAttribute('data-cursor');
      if (cursorAttr === 'text') setCursorType('text');
      else if (cursorAttr === 'media') setCursorType('media');
      else if (cursorAttr === 'play') setCursorType('play');
      else if (cursorAttr === 'drag') setCursorType('drag');
      else setCursorType('default');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      document.body.style.cursor = 'auto';
    };
  }, [posX, posY]);

  if (!visible) return null;

  const cursorStyle: Record<string, React.CSSProperties> = {
    default: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: '#FFFFFF',
    },
    text: {
      width: 4,
      height: 24,
      borderRadius: '2px',
      backgroundColor: '#FFFFFF',
    },
    media: {
      width: 52,
      height: 52,
      borderRadius: '50%',
      border: '1px solid #FFFFFF',
      backgroundColor: 'transparent',
    },
    play: {
      width: 52,
      height: 52,
      borderRadius: '50%',
      border: '1px solid #FFFFFF',
      backgroundColor: 'transparent',
    },
    drag: {
      width: 40,
      height: 40,
      borderRadius: '0%',
      border: '2px solid #FFFFFF',
      backgroundColor: 'transparent',
    },
  };

  return (
    <motion.div
      style={{
        left: cursorX,
        top: cursorY,
        mixBlendMode: 'exclusion',
        pointerEvents: 'none',
        position: 'fixed',
        zIndex: 99999,
        ...cursorStyle[cursorType],
      }}
      className="flex items-center justify-center font-mono text-[9px] text-white font-bold tracking-widest uppercase"
    >
      {cursorType === 'play' && 'PLAY'}
      {cursorType === 'media' && 'VIEW'}
      {cursorType === 'drag' && '\u2194'}
    </motion.div>
  );
};

export default MagneticCursor;