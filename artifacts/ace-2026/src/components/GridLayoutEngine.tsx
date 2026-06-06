import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { useMediaQuery } from 'react-responsive';
import PersistentAudioPlayer from './PersistentAudioPlayer';

// Seeded random for consistent variant selection per session
const seed = 42;
const seededRandom = (s: number) => {
  const x = Math.sin(s) * 10000;
  return x - Math.floor(x);
};

const GridLayoutEngine = () => {
  const { identity, locale } = useIdentity();
  const { audioState } = useAudio();
  const { theme } = useChromatic();
  const isMobile = useMediaQuery({ maxWidth: 767 });

  type LayoutVariant = 'A' | 'B' | 'C';
  const [variant, setVariant] = useState<LayoutVariant | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let storedVariant = sessionStorage.getItem('gridLayoutVariant');
      if (!storedVariant) {
        const rand = seededRandom(seed);
        if (rand < 0.33) storedVariant = 'A';
        else if (rand < 0.66) storedVariant = 'B';
        else storedVariant = 'C';
        sessionStorage.setItem('gridLayoutVariant', storedVariant);
      }
      setVariant(storedVariant as LayoutVariant);
    }
  }, []);

  const portraitRef = useRef<HTMLDivElement | null>(null);
  const lettersRef = useRef<(HTMLSpanElement | null)[]>([]);

  // lettersRef structure is handled dynamically
  const { scrollYProgress: scrollYProgressLetters } = useScroll({
    offset: ['start end', 'end start'],
  });

  const translateXLeft = useTransform(scrollYProgressLetters, [0, 1], ['0vw', '-15vw']);
  const translateXRight = useTransform(scrollYProgressLetters, [0, 1], ['0vw', '15vw']);

  const renderVariantA = () => (
    <div className="relative w-full h-screen flex flex-col items-center justify-center p-4">
      {/* Portrait / Black Canvas */}
      <div className="absolute inset-0 z-0 bg-black">
        {identity?.portrait?.url ? (
          <img 
            src={identity.portrait.url} 
            alt={identity.name?.[locale] || 'Composer Portrait'} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-black flex items-center justify-center text-text-muted text-lg font-mono">No Portrait</div>
        )}
      </div>

      {/* Text Overlay */}
      <div className="absolute bottom-12 left-12 z-10 text-white">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="font-display font-bold leading-none"
          style={{ fontSize: isMobile ? '3rem' : 'clamp(3rem, 8vw, 9rem)' }}
        >
          {identity?.name?.[locale] || 'Artist Name'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="font-body opacity-70"
          style={{ fontSize: isMobile ? '1rem' : 'clamp(1rem, 2vw, 1.5rem)' }}
        >
          {identity?.tagline?.[locale] || 'Tagline missing.'}
        </motion.p>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 100 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute right-12 bottom-12 w-0.5 bg-accent h-24 animate-pulse z-10"
      />

      {/* CTA Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute z-10 bg-accent text-surface-color font-display font-bold px-8 py-3 rounded-full shadow-lg hover:scale-105 transition-transform duration-300"
        style={{ top: '70vh' }}
      >
        Enter Studio
      </motion.button>

      {/* Audio player slides from bottom on first scroll */}
      <AnimatePresence>
        {audioState.isPlaying && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            <PersistentAudioPlayer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderVariantB = () => (
    <div className="relative w-full h-screen grid md:grid-cols-12 md:grid-rows-6 gap-0 bg-surface text-text-muted">
      {/* Portrait */}
      <div className="md:col-span-7 md:row-span-4 bg-surface3 flex items-center justify-center overflow-hidden">
        {identity?.portrait?.url ? (
          <img 
            src={identity.portrait.url} 
            alt={identity.name?.[locale] || 'Composer Portrait'} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-surface3 flex items-center justify-center font-mono">No Portrait</div>
        )}
      </div>

      {/* Name + Tagline */}
      <div className="md:col-span-5 md:row-span-2 p-8 bg-surface2 flex flex-col justify-center">
        <h1 className="font-display font-bold leading-tight"
          style={{ fontSize: isMobile ? '2.5rem' : 'clamp(2.5rem, 5vw, 6rem)' }}>
          {identity?.name?.[locale] || 'Artist Name'}
        </h1>
        <p className="font-body opacity-70 mt-2">
          {identity?.tagline?.[locale] || 'Tagline missing.'}
        </p>
      </div>

      {/* Bio Excerpt */}
      <div className="md:col-span-5 md:row-span-1 p-8 bg-surface2 flex items-center">
        <p className="font-body leading-relaxed line-clamp-3">
          {identity?.biography?.[locale] || 'Biography excerpt missing.'}
        </p>
      </div>

      {/* Track count + genre badges */}
      <div className="md:col-span-5 md:row-span-1 p-8 bg-surface2 flex items-center space-x-4">
        {identity?.trackCount !== null && identity?.trackCount !== undefined && identity.trackCount > 0 && (
          <span className="font-mono text-sm px-3 py-1 bg-surface4 border border-border rounded-full">
            {identity.trackCount} Tracks
          </span>
        )}
        {identity?.genres && identity.genres.length > 0 && (
          <span className="font-mono text-sm px-3 py-1 bg-surface4 border border-border rounded-full">
            {identity.genres[0]}
          </span>
        )}
      </div>

      {/* Audio player card */}
      <div className="md:col-span-5 md:row-span-2 p-4 bg-surface2 rounded-lg m-4 glassmorphism-bg">
        <PersistentAudioPlayer />
      </div>
    </div>
  );

  const renderVariantC = () => (
    <div className="relative w-full h-screen overflow-hidden bg-surface flex flex-col justify-center items-center">
      {/* Composer name: 18vw-25vw, deliberately overflows viewport */}
      <div className="absolute inset-0 flex items-center justify-center">
        {identity?.name?.[locale] && (
          <motion.h1
            className="font-display font-black text-text-muted uppercase whitespace-nowrap overflow-hidden flex"
            style={{ 
              fontSize: isMobile ? '45vw' : 'clamp(18vw, 22vw, 25vw)', 
              willChange: 'transform' 
            }}
          >
            {identity.name[locale].split('').map((char, i) => (
              <motion.span
                key={i}
                ref={el => { lettersRef.current[i] = el; }}
                style={{ 
                  display: 'inline-block',
                  x: i % 2 === 0 ? translateXLeft : translateXRight, 
                  filter: 'contrast(200%)',
                  mixBlendMode: 'difference'
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.h1>
        )}
      </div>

      {/* Content flows in negative space between letterforms */}
      <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
        <motion.div
          className="relative w-64 h-64 rounded-full overflow-hidden border border-border bg-surface3"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          style={{
            clipPath: identity?.portrait?.url ? 'circle(50% at 50% 50%)' : 'none',
          }}
        >
          {/* Portrait inside letterform void (clip-path mask) */}
          {identity?.portrait?.url ? (
            <img 
              src={identity.portrait.url} 
              alt={identity.name?.[locale] || 'Composer Portrait'} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-surface3 flex items-center justify-center text-text-muted text-lg font-mono">No Portrait</div>
          )}
        </motion.div>
      </div>
    </div>
  );

  if (variant === null) {
    return <div className="w-full h-screen bg-surface flex items-center justify-center text-text-muted">Loading Layout...</div>;
  }

  return (
    <AnimatePresence mode="wait">
      {
        variant === 'A' ? renderVariantA() : 
        variant === 'B' ? renderVariantB() : 
        renderVariantC()
      }
    </AnimatePresence>
  );
};

export default GridLayoutEngine;
