import { useRef } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
} from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';
import type { Locale } from '../types';

/**
 * Cinematic portrait scene.
 * The composer's portrait is revealed as you scroll: it rises with a slow
 * parallax, sharpens out of blur, and scales gently into place. Edges are
 * feathered (no hard rectangle), and a short pull-quote / tagline sits beside
 * it. Shares the visual language of SpatialScrollEngine so the page reads as
 * one continuous, deliberate experience.
 */
function localText(
  identity: ReturnType<typeof useIdentity>['composerIdentity'],
  locale: Locale,
  field: 'name' | 'tagline' | 'biography'
): string {
  if (!identity) return '';
  const ml = identity[field];
  if (!ml) return '';
  const rec = ml as unknown as Record<string, string>; return rec[locale] || rec.en || '';
}

export default function DoubleExposurePortrait() {
  const sectionRef = useRef<HTMLElement>(null);
  const { composerIdentity, locale } = useIdentity();
  const { t } = useT();
  const safeLocale = (locale ?? 'en') as Locale;
  const reduced = useReducedMotion() ?? false;

  const portraitUrl = composerIdentity?.portrait?.url;
  const name = localText(composerIdentity, safeLocale, 'name') || 'Amir Moslehi';
  const tagline = localText(composerIdentity, safeLocale, 'tagline');
  const bio = localText(composerIdentity, safeLocale, 'biography');

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Parallax: the image drifts slower than the page.
  const imgY = useTransform(
    scrollYProgress,
    [0, 1],
    reduced ? ['0%', '0%'] : ['-12%', '12%']
  );
  // Reveal: blur + scale settle as the scene reaches centre, ease back out.
  const blurPx = useTransform(
    scrollYProgress,
    [0, 0.35, 0.65, 1],
    reduced ? [0, 0, 0, 0] : [16, 0, 0, 16]
  );
  const blur = useTransform(blurPx, (v) => `blur(${v}px)`);
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduced ? [1, 1, 1] : [1.12, 1, 1.12]
  );
  const sScale = useSpring(scale, { stiffness: 80, damping: 26, mass: 0.7 });

  // Text slides up gently into place.
  const textY = useTransform(
    scrollYProgress,
    [0.1, 0.5],
    reduced ? ['0%', '0%'] : ['40%', '0%']
  );
  const textOpacity = useTransform(scrollYProgress, [0.15, 0.45], [0, 1]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full min-h-screen flex items-center py-24 overflow-hidden"
    >
      <div className="w-full max-w-6xl mx-auto px-6 md:px-12 grid md:grid-cols-12 gap-10 items-center">
        {/* Portrait — feathered, parallaxing, aspect-correct */}
        <div className="md:col-span-7">
          <motion.div
            style={{ scale: sScale, filter: blur }}
            className="relative w-full overflow-hidden rounded-3xl"
          >
            <div className="relative" style={{ aspectRatio: '4 / 5' }}>
              {portraitUrl ? (
                <motion.img
                  src={portraitUrl}
                  alt={name}
                  crossOrigin="anonymous"
                  style={{
                    y: imgY,
                    WebkitMaskImage:
                      'radial-gradient(125% 120% at 50% 42%, #000 55%, transparent 100%)',
                    maskImage:
                      'radial-gradient(125% 120% at 50% 42%, #000 55%, transparent 100%)',
                  }}
                  className="absolute inset-0 w-full h-[124%] -top-[12%] object-cover will-change-transform"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase tracking-[0.15em]">
                  {t('Portrait')}
                </div>
              )}
              {/* soft sheen + bottom legibility veil, feathered */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(125deg, rgba(255,255,255,0.08), transparent 40%), linear-gradient(to top, rgba(var(--surface-rgb),0.55), transparent 55%)',
                }}
              />
            </div>
          </motion.div>
        </div>

        {/* Text */}
        <motion.div
          style={{ y: textY, opacity: textOpacity }}
          className="md:col-span-5"
        >
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--accent-color)] font-mono">
            {t('The Composer')}
          </span>
          <h2
            className="font-display text-[var(--text-color)] leading-[1.02] mt-3 mb-5"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)' }}
          >
            {name}
          </h2>
          {tagline && (
            <p className="text-lg md:text-xl text-[var(--text-color)] opacity-90 mb-4 leading-snug">
              {t(tagline)}
            </p>
          )}
          {bio && (
            <p className="text-sm md:text-base text-[var(--text-muted-color)] leading-relaxed max-w-md">
              {t(bio)}
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
