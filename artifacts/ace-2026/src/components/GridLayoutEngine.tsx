import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import DoubleExposurePortrait from './DoubleExposurePortrait';
import AudioReactiveMesh from './AudioReactiveMesh';

const GridLayoutEngine = () => {
  const { identity, locale } = useIdentity();
  const { audioState, playTrack } = useAudio();

  // Seeded random layout selection persisted for session
  const layoutVariant = useMemo(() => {
    const stored = sessionStorage.getItem('ace-layout-variant');
    if (stored) return stored;

    const variants = ['A', 'B', 'C'];
    const chosen = variants[Math.floor(Math.random() * variants.length)] || 'A';
    sessionStorage.setItem('ace-layout-variant', chosen);
    return chosen;
  }, []);

  const tracks = audioState.playlist || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100, damping: 20 } },
  };

  // VARIANT A — BILLBOARD FULL BLEED
  if (layoutVariant === 'A') {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative min-h-screen bg-surface flex flex-col justify-between overflow-hidden"
      >
        {/* Full Bleed Background Canvas (Dual Mode Reactive Mesh / Portrait) */}
        <div className="absolute inset-0 z-0 opacity-30">
          {identity?.portrait?.url ? (
            <div className="w-full h-full relative">
              <DoubleExposurePortrait />
            </div>
          ) : (
            <AudioReactiveMesh />
          )}
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 p-12 mt-20 flex flex-col justify-center flex-1 max-w-4xl">
          <motion.h1 variants={itemVariants} className="text-6xl md:text-9xl font-display font-bold text-accent leading-none mb-4">
            {identity?.name?.[locale] || 'ACE'}
          </motion.h1>
          <motion.p variants={itemVariants} className="text-xl md:text-2xl font-body text-text-muted max-w-2xl leading-relaxed">
            {identity?.tagline?.[locale]}
          </motion.p>
        </div>

        {/* Floating Tracks Panel */}
        <div className="relative z-10 p-12 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl w-full">
          {tracks.slice(0, 4).map((t) => (
            <motion.div
              key={t.id}
              variants={itemVariants}
              onClick={() => playTrack(t)}
              className="p-4 bg-surface2/60 border border-border/60 rounded-xl backdrop-blur-md flex items-center justify-between cursor-pointer hover:border-accent/40 transition-colors"
            >
              <div>
                <p className="font-display font-bold text-sm text-text">{t.title[locale] || t.title.en}</p>
                <p className="font-mono text-[10px] text-text-muted mt-1 uppercase">{t.genre} | {t.bpm} BPM</p>
              </div>
              <button className="w-8 h-8 rounded-full bg-accent text-surface-color flex items-center justify-center font-bold">
                ▶
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // VARIANT B — ASYMMETRIC EDITORIAL GRID
  if (layoutVariant === 'B') {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-h-screen bg-surface p-6 md:p-12 pt-24 grid grid-cols-1 md:grid-cols-12 gap-8"
      >
        {/* Left Side: Big Portrait Card */}
        <motion.div variants={itemVariants} className="md:col-span-7 h-[75vh]">
          <DoubleExposurePortrait />
        </motion.div>

        {/* Right Side: Editorial Information & Tracks */}
        <div className="md:col-span-5 flex flex-col justify-between h-[75vh] space-y-8">
          <div className="space-y-4">
            <motion.h1 variants={itemVariants} className="text-4xl md:text-6xl font-display font-bold text-accent leading-none">
              {identity?.name?.[locale]}
            </motion.h1>
            <motion.p variants={itemVariants} className="text-sm font-mono text-text-muted uppercase tracking-widest leading-relaxed">
              {identity?.tagline?.[locale]}
            </motion.p>
            <motion.p variants={itemVariants} className="text-xs text-text-muted font-body leading-relaxed max-w-md line-clamp-4">
              {identity?.biography?.[locale]}
            </motion.p>
          </div>

          <div className="space-y-3">
            <motion.h3 variants={itemVariants} className="font-mono text-xs text-accent tracking-widest uppercase">RECENT SCORES</motion.h3>
            <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-2">
              {tracks.map((t) => (
                <motion.div
                  key={t.id}
                  variants={itemVariants}
                  onClick={() => playTrack(t)}
                  className="p-3 bg-surface2 border border-border rounded flex items-center justify-between cursor-pointer hover:bg-surface3 transition-colors"
                >
                  <div className="truncate">
                    <p className="font-display font-bold text-xs text-text truncate">{t.title[locale] || t.title.en}</p>
                    <p className="font-mono text-[9px] text-text-dim mt-0.5">{t.genre?.toUpperCase()}</p>
                  </div>
                  <span className="font-mono text-[10px] text-accent">{t.bpm} BPM</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // VARIANT C — DECONSTRUCTED TYPOGRAPHIC
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-surface flex flex-col justify-center items-center overflow-hidden relative"
    >
      {/* Massive Typographic Background */}
      <motion.div
        variants={itemVariants}
        className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 z-0"
      >
        <span className="text-[25vw] font-display font-bold text-accent select-none truncate">
          {identity?.name?.[locale]?.split(' ')[0] || 'ACE'}
        </span>
      </motion.div>

      <div className="relative z-10 max-w-4xl w-full px-6 flex flex-col items-center text-center space-y-12">
        <div className="space-y-4">
          <motion.h1 variants={itemVariants} className="text-5xl md:text-8xl font-display font-bold tracking-[0.1em] text-accent uppercase leading-tight">
            {identity?.name?.[locale]}
          </motion.h1>
          <motion.p variants={itemVariants} className="text-base md:text-lg text-text-muted font-body italic max-w-xl mx-auto">
            {identity?.tagline?.[locale]}
          </motion.p>
        </div>

        {/* 3D WebGL particle sphere embedded in page body */}
        <motion.div variants={itemVariants} className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] rounded-full overflow-hidden border border-border/20 shadow-2xl relative">
          <AudioReactiveMesh />
        </motion.div>

        {/* Quick Playlist link */}
        <motion.div variants={itemVariants} className="flex flex-wrap gap-4 justify-center">
          {tracks.slice(0, 3).map((t) => (
            <button
              key={t.id}
              onClick={() => playTrack(t)}
              className="px-4 py-2 border border-border bg-surface2/40 hover:bg-accent hover:text-surface-color transition-colors rounded-full font-mono text-xs tracking-wider"
            >
              LISTEN: {t.title[locale]?.toUpperCase() || t.title.en.toUpperCase()}
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default GridLayoutEngine;
