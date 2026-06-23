import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * WelcomeGate — a luxurious cinematic entry curtain shown before the language
 * portal on every load. A handwritten welcome line fades in over the living
 * starfield, with a single minimal "Enter" control (thin pulsing gold ring).
 *
 * Its click is the user gesture that unlocks audio, so onEnter() both starts
 * the ambient music and dismisses the gate into the language portal.
 */

const WelcomeGate = ({ onEnter }: { onEnter: () => void }) => {
  const [leaving, setLeaving] = useState(false);

  const handleEnter = () => {
    if (leaving) return;
    setLeaving(true);
    // let the fade play, then hand off to the portal
    setTimeout(onEnter, 1100);
  };

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ background: 'transparent' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        >
          <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400;1,500&family=Parisienne&display=swap');" }} />

          {/* Handwritten welcome line */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 2.0, ease: 'easeOut', delay: 0.4 }}
            style={{
              fontFamily: "'Parisienne', cursive",
              fontSize: 'clamp(2.2rem, 5vw, 4.4rem)',
              color: 'rgba(243,215,126,0.92)',
              textShadow: '0 0 26px rgba(243,215,126,0.35), 0 0 60px rgba(243,215,126,0.12)',
              letterSpacing: '0.02em',
              textAlign: 'center',
              padding: '0 6vw',
              lineHeight: 1.3,
            }}
          >
            Step into the sound of Amir Moslehi
          </motion.div>

          {/* Minimal gold Enter control */}
          <motion.button
            onClick={handleEnter}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 1.6 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            className="relative mt-14 flex items-center justify-center"
            style={{
              width: 132, height: 56,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Enter"
          >
            {/* thin pulsing ring */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{ border: '1px solid rgba(243,215,126,0.55)' }}
              animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.05, 1] }}
              transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
            />
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: '1.35rem',
                letterSpacing: '0.32em',
                paddingLeft: '0.32em',
                color: 'rgba(247,238,200,0.95)',
              }}
            >
              Enter
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeGate;
