import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';

// Cursor: a music-note-in-twirl logo. The golden spiral spins continuously;
// the grey stem stays fixed. On click the whole mark "breathes" and a few
// tiny golden sparks rise and fade. Vector â€” never loses quality.

interface Spark {
  id: number;
  x: number;
  y: number;
  dx: number;
  rise: number;
  size: number;
  delay: number;
}

// Original artwork coords (transformed). Full bbox x:[1637,3437] y:[974,3026].
// Gold twirl center ~ (2310, 2492). We crop the top so the long stem is shorter.
const VB = { x: 1560, y: 1810, w: 1960, h: 1330 }; // stem halved again
const TWIRL_CENTER = { x: 2310, y: 2492 };

const GOLD_TWIRL_D =
  'M23179.4 12560.2C22944.9 12469.6 22689.6 12419.4 22419.3 12419.5 21154.3 12419.4 20215.5 13514.6 20215.5 14748.9 20215.5 16335.5 21419.7 17748.2 23047.4 17748.2 24675.1 17748.3 25879.3 16335.5 25879.2 14748.9 25879.2 13452.1 25230.2 12210.5 24105.2 11543.8 23592.9 11240.2 23015.1 11079.6 22419.3 11079.6 21823.5 11079.6 21245.9 11240.1 20733.7 11543.7 19608.4 12210.4 18959.4 13452.1 18959.4 14748.8 18959.3 16282.2 19726.2 17751.4 21056.8 18540 21661.8 18898.5 22343.8 19088.1 23047.4 19088.1 23751 19088.2 24432.9 18898.5 25037.8 18540 26368.5 17751.5 27135.4 16282.3 27135.4 14748.9 27135.4 12978.7 26250.5 11282.1 24714.3 10371.7 24016.8 9958.3 23230.7 9739.7 22419.3 9739.7 21608.1 9739.7 20821.9 9958.3 20124.4 10371.7 18588.1 11282 17703.2 12978.7 17703.2 14748.8 17703.2 16755.7 18706 18679.9 20447.8 19712.1 21238 20180.3 22128.4 20428 23047.4 20428 24484.2 20428 25794.6 19922.3 26787.6 19067.8 27925.7 18088.4 28505.4 16393.2 28025.4 14930.3 28025.4 17715.7 25798 19788.8 23047.4 19788.9 22243.1 19788.8 21465.2 19572 20773.7 19162.2 19226.4 18245.2 18342.4 16529.6 18342.4 14748.9 18342.4 13204.8 19108.4 11716.6 20450.2 10921.5 21049.2 10566.7 21722.8 10378.8 22419.3 10378.8 23116 10378.8 23789.6 10566.7 24388.5 10921.6 25730.2 11716.7 26496.3 13204.8 26496.2 14748.8 26496.3 16056.2 25848.1 17316.8 24711.9 17990.1 24205.6 18290.2 23636.3 18448.9 23047.4 18448.9 22458.5 18448.9 21889.1 18290.2 21382.8 17990.1 20246.6 17316.7 19598.5 16056.1 19598.5 14748.9 19598.6 13678.2 20128.8 12645 21059.4 12093.6 21473.1 11848.5 21938.1 11718.8 22419.3 11718.8 22900.5 11718.7 23365.5 11848.5 23779.3 12093.7 24709.9 12645.1 25240.1 13678.3 25240.1 14748.9 25240.1 15980.9 24321.4 17109.1 23047.4 17109.1 21773.4 17109.1 20854.7 15980.9 20854.7 14748.9 20854.7 14734.4 20854.9 14719.9 20855.2 14705.4 20878.4 13514.5 21850.9 12556.2 23047.4 12556.2 23091.7 12556.2 23135.7 12557.6 23179.4 12560.2';
const STEM_D =
  'M27149 30260.3V18712.4C27722.4 18069.5 28096.4 17228.9 28178 16365.8V27566.3C30164.9 25979.8 32490 24458.3 31179.2 21813.9 34373.6 25308.3 29876.7 27572 28178 30260.3H27149';
const STEM2_D =
  'M28178 17891C27959.8 18477 27563.8 19009.9 27149 19475V18712.4C27722.4 18069.5 28096.4 17228.9 28178 16365.8V17891';

const ART_TRANSFORM = 'matrix(.1,0,0,-.1,0,4000)';

let GRAD_SEQ = 0;

const NoteMark = ({ size = 52, opacity = 1, spin = false }: { size?: number; opacity?: number; spin?: boolean }) => {
  const [uid] = useState(() => `gold${GRAD_SEQ++}`);
  const gid = `${uid}_g`;
  const hid = `${uid}_h`;
  const aspect = VB.h / VB.w;

  return (
    <svg
      width={size}
      height={size * aspect}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      style={{ opacity, display: 'block', overflow: 'visible' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Rich, saturated crystal-gold */}
        <linearGradient id={gid} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#FFE9A0" />
          <stop offset="28%" stopColor="#FFC73A" />
          <stop offset="58%" stopColor="#EDA60E" />
          <stop offset="82%" stopColor="#C57E07" />
          <stop offset="100%" stopColor="#8F5E04" />
        </linearGradient>
        {/* Glassy diagonal highlight overlay â€” subtle, only a top sheen */}
        <linearGradient id={hid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="18%" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grey stem (fixed) â€” bold via same-color stroke */}
      <g transform={ART_TRANSFORM}>
        <path d={STEM_D} fill="#a3a3a3" stroke="#a3a3a3" strokeWidth="500" strokeLinejoin="round" fillRule="evenodd" />
        <path d={STEM2_D} fill="#828282" fillRule="evenodd" />
      </g>

      {/* golden twirl (spins around its own center) */}
      <motion.g
        style={{ transformOrigin: `${TWIRL_CENTER.x}px ${TWIRL_CENTER.y}px` }}
        animate={spin ? { rotate: 360 } : {}}
        transition={spin ? { duration: 6, repeat: Infinity, ease: 'linear' } : {}}
      >
        <g transform={ART_TRANSFORM}>
          <path d={GOLD_TWIRL_D} fill={`url(#${gid})`} fillRule="evenodd" />
          {/* glassy sheen on top of the gold */}
          <path d={GOLD_TWIRL_D} fill={`url(#${hid})`} fillRule="evenodd" />
        </g>
      </motion.g>
    </svg>
  );
};

const MagneticCursor = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [pressed, setPressed] = useState<boolean>(false);
  const [sparks, setSparks] = useState<Spark[]>([]);

  const posX = useMotionValue(-100);
  const posY = useMotionValue(-100);

  const springConfig = { damping: 22, stiffness: 380, mass: 0.5 };
  const cursorX = useSpring(posX, springConfig);
  const cursorY = useSpring(posY, springConfig);

  const SIZE = 26; // 50% smaller
  const aspect = VB.h / VB.w;
  const TIP_X = ((TWIRL_CENTER.x - VB.x) / VB.w) * SIZE;
  const TIP_Y = ((TWIRL_CENTER.y - VB.y) / VB.h) * (SIZE * aspect);

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) {
      // Touch device: never show the custom cursor; leave the OS cursor alone.
      return;
    }

    // Desktop: the OS pointer is hidden by global CSS (@media(pointer:fine)
    // body{cursor:none}). We intentionally do NOT toggle body.style.cursor in
    // JS — doing so raced with the CSS rule and briefly showed both cursors.
    setVisible(true);

    let seed = 0;

    const handleMouseMove = (e: MouseEvent) => {
      posX.set(e.clientX - TIP_X);
      posY.set(e.clientY - TIP_Y);

      const magnetics = document.querySelectorAll('[data-magnetic]');
      magnetics.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const h = el as HTMLElement;
        if (dist < 80) {
          h.style.transform = `translate3d(${dx * 0.35}px, ${dy * 0.35}px, 0)`;
          h.style.transition = 'transform 0.1s ease-out';
        } else if (h.style.transform) {
          h.style.transform = '';
          h.style.transition = 'transform 0.3s ease-out';
        }
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      setPressed(true);
      const base = seed;
      const next: Spark[] = Array.from({ length: 5 }).map((_, i) => ({
        id: base + i,
        x: e.clientX,
        y: e.clientY,
        dx: (Math.random() - 0.5) * 26,
        rise: 26 + Math.random() * 24,
        size: 8 + Math.random() * 7,
        delay: i * 0.05,
      }));
      seed += 5;
      setSparks((s) => [...s, ...next]);
      const ids = next.map((n) => n.id);
      window.setTimeout(() => setSparks((s) => s.filter((x) => !ids.includes(x.id))), 1100);
    };

    const handleMouseUp = () => setPressed(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [posX, posY, TIP_X, TIP_Y]);

  if (!visible) return null;
  if (typeof document === 'undefined') return null;

  // Portal to <body> so the cursor shares the same stacking context as other
  // body-level portals (e.g. the Works concept overlay). This makes its high
  // z-index actually win against them instead of being trapped inside #root
  // (which has isolation:isolate). Same mark, same twirl, same details.
  return createPortal(
    <>
      <motion.div
        style={{
          left: cursorX,
          top: cursorY,
          pointerEvents: 'none',
          position: 'fixed',
          zIndex: 99999,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55)) drop-shadow(0 0 4px rgba(246,192,38,0.45))',
        }}
        animate={{ scale: pressed ? 0.85 : 1, rotate: 15 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      >
        <NoteMark size={SIZE} spin />
      </motion.div>

      <AnimatePresence>
        {sparks.map((s) => (
          <motion.div
            key={s.id}
            style={{
              left: s.x - s.size / 2,
              top: s.y - s.size / 2,
              pointerEvents: 'none',
              position: 'fixed',
              zIndex: 99998,
              borderRadius: '50%',
              width: s.size,
              height: s.size,
              background: 'radial-gradient(circle, rgba(255,247,210,0.98) 0%, rgba(246,192,38,0.6) 55%, transparent 100%)',
            }}
            initial={{ opacity: 0.9, y: 0, x: 0, scale: 1 }}
            animate={{ opacity: 0, y: -s.rise, x: s.dx, scale: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, delay: s.delay, ease: [0.25, 0.6, 0.3, 1] }}
          />
        ))}
      </AnimatePresence>
    </>,
    document.body,
  );
};

export default MagneticCursor;
