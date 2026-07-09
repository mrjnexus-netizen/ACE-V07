import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';
import EditableText from './EditableText';
import EditableImage from './EditableImage';
import type { ComposerIdentity, Locale } from '../types';

function localText(
  identity: ComposerIdentity | null,
  locale: Locale,
  field: 'name' | 'tagline' | 'biography'
): string {
  if (!identity) return '';
  const ml = identity[field];
  if (!ml) return '';
  const rec = ml as unknown as Record<string, string>; return rec[locale] || rec.en || '';
}

function rand(seed: number) {
  const x = Math.sin(seed * 999.13) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Hero — restrained, luxurious title sequence (Borgo Santandrea / Sal Parasuco DNA).
 * Centered composition, generous negative space, refined letter-spaced typography,
 * one slow & dignified fade-rise. No glitch, no neon, no snap. The portrait breathes
 * gently behind a soft vignette so the name stays clean and legible.
 */
export default function GridLayoutEngine() {
  const { composerIdentity, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();

  const name = localText(composerIdentity, safeLocale, 'name') || 'Amir Moslehi';
  const tagline = localText(composerIdentity, safeLocale, 'tagline');
  const portraitUrl = composerIdentity?.portrait?.url;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['0%', '14%']);
  const contentY = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['0%', '-22%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const motes = Array.from({ length: 60 }, (_, i) => i);
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div ref={ref} className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: '#000' }}>
      {/* Background portrait — gentle perpetual drift + scroll parallax */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        <motion.div
          className="absolute inset-0"
          initial={reduced ? { scale: 1.06 } : { scale: 1.2, filter: 'blur(16px)' }}
          animate={
            reduced
              ? { scale: 1.06 }
              : { scale: [1.1, 1.16, 1.1], x: ['-1%', '1%', '-1%'], filter: 'blur(0px)' }
          }
          transition={{
            scale: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
            x: { duration: 28, repeat: Infinity, ease: 'easeInOut' },
            filter: { duration: 1.6, ease },
          }}
        >
          {portraitUrl ? (
            <EditableImage contentKey="hero.backgroundImage" defaultUrl={portraitUrl}>
              {(url) => (
                <img
                  src={url}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 60%, transparent 96%)',
                    maskImage: 'linear-gradient(to bottom, #000 0%, #000 60%, transparent 96%)',
                  }}
                />
              )}
            </EditableImage>
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: 'var(--surface-color)' }} />
          )}
        </motion.div>
        {/* Soft cinematic vignette — even darkening + a long smooth fade to black at the bottom (no hard edge).
            pointer-events:none: purely decorative, was previously eating every hover/click over the whole
            image (including the edit-mode toolbar trigger) since it fully covers the image on top of it. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 45%, transparent 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.8) 100%), linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.3) 65%)',
          }}
        />
        {/* dedicated long fade-out to pure black at the very bottom — removes any hard seam */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: '40%', background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 55%, #000 100%)' }}
        />
      </motion.div>

      {/* Floating motes — barely-there, slow */}
      {!reduced && (
        <div className="absolute inset-0 pointer-events-none">
          {motes.map((i) => {
            const left = rand(i + 1) * 100;
            const top = rand(i + 7) * 100;
            const size = 1.5 + rand(i + 3) * 3;
            const dur = 14 + rand(i + 5) * 14;
            const drift = 24 + rand(i + 9) * 48;
            return (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, background: 'rgba(255,255,255,0.8)', boxShadow: '0 0 6px rgba(255,255,255,0.5)' }}
                animate={{ y: [0, -drift, 0], opacity: [0, 0.75, 0] }}
                transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay: rand(i + 11) * 8 }}
              />
            );
          })}
        </div>
      )}

      {/* Centered, luxurious composition */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity, pointerEvents: 'none' }}
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
      >
        <motion.span
          initial={{ opacity: 0, y: 14, letterSpacing: '0.5em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.42em' }}
          transition={{ duration: 1.2, ease, delay: 0.3 }}
          className="text-[0.7rem] md:text-xs uppercase text-white/70 font-mono mb-8"
          style={{ letterSpacing: '0.42em', pointerEvents: 'auto' }}
        >
          <EditableText contentKey="hero.kicker" defaultValue={t('Cinematic Composer')} as="span" />
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.6, ease, delay: 0.5 }}
          className="font-display text-white font-light"
          style={{ fontSize: 'clamp(2.75rem, 9vw, 9rem)', letterSpacing: '0.04em', lineHeight: 1.02, pointerEvents: 'auto' }}
        >
          <EditableText contentKey="identity.name" defaultValue={name} as="span" />
        </motion.h1>

        {/* thin decorative rule */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease, delay: 1 }}
          className="mt-8 mb-7 h-px"
          style={{ width: 'clamp(80px, 14vw, 200px)', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent)' }}
        />

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease, delay: 1.15 }}
          className="text-white/65 max-w-lg font-light"
          style={{ fontSize: 'clamp(0.95rem, 1.5vw, 1.25rem)', letterSpacing: '0.02em', pointerEvents: 'auto' }}
        >
          <EditableText contentKey="identity.tagline" defaultValue={tagline ? t(tagline) : ''} as="span" />
        </motion.p>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 1.2 }}
        style={{ opacity: contentOpacity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <EditableText
          contentKey="hero.scrollLabel"
          defaultValue={t('Scroll')}
          as="span"
          className="text-[0.6rem] font-mono uppercase tracking-[0.35em] text-white/45"
        />
        <motion.div
          animate={reduced ? {} : { scaleY: [1, 0.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-px h-12 bg-gradient-to-b from-white/50 to-transparent origin-top"
        />
      </motion.div>
    </div>
  );
}

