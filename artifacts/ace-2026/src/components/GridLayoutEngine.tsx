import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import type { ComposerIdentity, Locale } from '../types';

const VARIANTS = ['A', 'B', 'C'] as const;
type Variant = typeof VARIANTS[number];

function getStoredVariant(): Variant {
  const stored = sessionStorage.getItem('ace-grid-variant');
  if (stored && VARIANTS.includes(stored as Variant)) return stored as Variant;
  const random = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!;
  sessionStorage.setItem('ace-grid-variant', random);
  return random;
}

function localText(identity: ComposerIdentity | null, locale: Locale, field: 'name' | 'tagline' | 'biography'): string {
  if (!identity) return '';
  const ml = identity[field];
  if (!ml) return '';
  return (ml as unknown as Record<string, string>)[locale] || '';
}

// --- VARIANT A: BILLBOARD FULL BLEED --------------------------------
function VariantA({ identity, locale }: { identity: ComposerIdentity | null; locale: Locale }) {
  const portraitUrl = identity?.portrait?.url;
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ backgroundColor: portraitUrl ? 'transparent' : 'var(--surface-color)' }}>
      {portraitUrl ? (
        <img src={portraitUrl} alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
      ) : (
        <div className="absolute inset-0 bg-[var(--surface-color)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-12 left-8 md:left-16">
        <h1 className="text-[clamp(3rem,8vw,9rem)] font-display leading-none text-white">
          {localText(identity, locale, 'name') || 'ACE Composer'}
        </h1>
        <p className="text-[clamp(1rem,2vw,1.5rem)] opacity-70 text-white mt-2">
          {localText(identity, locale, 'tagline')}
        </p>
      </div>
      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:block">
        <div className="w-px h-24 bg-white/30 animate-pulse" style={{ animationDuration: '3s' }} />
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button className="px-6 py-3 border border-white/30 text-white/80 hover:bg-white/10 transition-colors rounded font-mono text-sm tracking-widest uppercase">
          Enter Studio
        </button>
      </div>
    </div>
  );
}

// --- VARIANT B: ASYMMETRIC EDITORIAL GRID ----------------------------
function VariantB({ identity, locale }: { identity: ComposerIdentity | null; locale: Locale }) {
  const portraitUrl = identity?.portrait?.url;
  return (
    <div className="grid grid-cols-12 h-screen" style={{ backgroundColor: 'var(--surface-color)' }}>
      {/* Portrait: columns 1-7, rows 1-4 */}
      <div className="col-span-7 row-span-4 bg-[var(--surface2-color)] overflow-hidden">
        {portraitUrl ? (
          <img src={portraitUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
        ) : (
          <div className="w-full h-full bg-[var(--surface3-color)]" />
        )}
      </div>
      {/* Name + tagline: columns 8-12, rows 1-2 */}
      <div className="col-span-5 row-span-2 flex flex-col justify-end p-8">
        <h2 className="text-[clamp(2.5rem,5vw,6rem)] font-display leading-none" style={{ color: 'var(--text-color)' }}>
          {localText(identity, locale, 'name') || 'ACE'}
        </h2>
        <p className="text-sm mt-4 opacity-70" style={{ color: 'var(--text-muted-color)' }}>
          {localText(identity, locale, 'tagline')}
        </p>
      </div>
      {/* Bio excerpt: columns 8-12, row 3 */}
      <div className="col-span-5 row-span-1 p-8 pt-0">
        <p className="text-sm line-clamp-3" style={{ color: 'var(--text-muted-color)' }}>
          {localText(identity, locale, 'biography')}
        </p>
      </div>
      {/* Audio player card placeholder: columns 8-12, rows 4-6 */}
      <div className="col-span-5 row-span-2 p-8">
        <div className="w-full h-32 rounded-lg border flex items-center justify-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(var(--surface-rgb),0.5)' }}>
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted-color)' }}>Audio Player</span>
        </div>
      </div>
    </div>
  );
}

// --- VARIANT C: DECONSTRUCTED TYPOGRAPHIC ----------------------------
function VariantC({ identity, locale }: { identity: ComposerIdentity | null; locale: Locale }) {
  const name = localText(identity, locale, 'name') || 'ACE COMPOSER';
  const letters = name.split('');
  const portraitUrl = identity?.portrait?.url;

  return (
    <div className="relative h-screen overflow-hidden" style={{ backgroundColor: 'var(--surface-color)' }}>
      <div className="flex items-center justify-center h-full px-4">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4 max-w-5xl w-full">
          {letters.map((letter, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.6 }}
              className="text-[15vw] md:text-[18vw] font-display leading-none select-none"
              style={{ color: 'var(--text-color)', gridColumn: i % 2 === 0 ? 'span 2' : 'span 1' }}
            >
              {letter}
            </motion.div>
          ))}
        </div>
      </div>
      {/* Portrait in clip-path void */}
      {portraitUrl && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full overflow-hidden opacity-20 pointer-events-none">
          <img src={portraitUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
        </div>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-mono tracking-[0.2em] opacity-40" style={{ color: 'var(--text-muted-color)' }}>
        SCROLL TO EXPLORE
      </div>
    </div>
  );
}

// --- MAIN ENGINE -----------------------------------------------------
export default function GridLayoutEngine() {
  const { composerIdentity, locale } = useIdentity();
  const { themeId } = useChromatic();
  const [variant, setVariant] = useState<Variant>(getStoredVariant);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={variant}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {variant === 'A' && <VariantA identity={composerIdentity} locale={locale} />}
        {variant === 'B' && <VariantB identity={composerIdentity} locale={locale} />}
        {variant === 'C' && <VariantC identity={composerIdentity} locale={locale} />}
      </motion.div>
    </AnimatePresence>
  );
}