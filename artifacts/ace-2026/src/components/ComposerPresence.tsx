import { useRef, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useT } from '../context/TranslationContext';
import type { AudioTrack } from '../types';

// Short, editable blurbs per genre (lowercased key).
const GENRE_BLURBS: Record<string, string> = {
  orchestral: 'Sweeping strings and brass — the grammar of the symphony, rebuilt for the modern screen.',
  cinematic: 'Themes written to live beneath the image, shaping what the eye believes it feels.',
  gaming: 'Adaptive, interactive scores that respond and evolve with the player in real time.',
  animation: 'Bright, characterful music that gives motion its heartbeat and worlds their wonder.',
  ambient: 'Slow, weightless texture — sound designed to surround rather than to lead.',
  electronic: 'Synthesised pulse and grain, where circuitry learns to breathe.',
  'electronic-orchestral': 'Where live orchestra and electronics meet — organic and synthetic in one breath.',
  synthwave: 'Neon-lit nostalgia: analog warmth wrapped around a driving retro pulse.',
  choral: 'The human voice, massed and luminous — the oldest instrument, reimagined.',
  other: 'Work that resists category — experiments and one-of-a-kind scores.',
};

function blurbFor(genre: string): string {
  return GENRE_BLURBS[genre.toLowerCase()] || GENRE_BLURBS.other!;
}

interface GenreGroup {
  genre: string;
  tracks: AudioTrack[];
  cover: string;
}

function coverOf(t: AudioTrack): string {
  return t.coverArt?.url || (t as unknown as { coverUrl?: string }).coverUrl || '';
}

const ROTATE_MS = 3000;

export default function ComposerPresence() {
  const { identity, tracks, locale } = useIdentity();
  const { playTrack } = useAudio();
  const { t } = useT();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.5 });

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Group tracks by genre automatically.
  const groups = useMemo<GenreGroup[]>(() => {
    const map = new Map<string, AudioTrack[]>();
    (tracks ?? []).forEach((t) => {
      const g = (t.genre || 'other').trim();
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    });
    return Array.from(map.entries()).map(([genre, list]) => ({
      genre,
      tracks: list,
      cover: coverOf(list[0]!),
    }));
  }, [tracks]);

  // Auto-advance every ROTATE_MS while the section is in view and not paused.
  useEffect(() => {
    if (!inView || paused || reduce || groups.length <= 1) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % groups.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [inView, paused, reduce, groups.length]);

  const nameMap = (identity?.name ?? null) as unknown as Record<string, string> | null;
  const composerName =
    (nameMap && nameMap[locale ?? 'en']) || (nameMap && nameMap.en) || t('ACE Composer');

  if (groups.length === 0) {
    return (
      <section ref={sectionRef} className="relative w-full min-h-[70vh] flex flex-col items-center justify-center overflow-hidden living-veil" aria-label={t('The composer')}>
        <span className="font-mono uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.34em', color: 'var(--accent-color)' }}>{t('The Composer')}</span>
        <h2 className="font-display text-center mt-6" style={{ fontSize: 'clamp(2.5rem, 9vw, 8rem)', lineHeight: 0.95, color: 'var(--text-dim-color)' }}>{composerName}</h2>
      </section>
    );
  }

  const current = groups[active]!;

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden living-veil"
      style={{ padding: 'clamp(6rem, 14vw, 12rem) 0', minHeight: '100vh' }}
      aria-label={t('The composer')}
    >
      {/* Heading — centred, generous breathing room above the band */}
      <div
        className="flex flex-col items-center text-center"
        style={{ padding: '0 clamp(1.5rem, 8vw, 9rem)', marginBottom: 'clamp(4rem, 9vw, 7rem)' }}
      >
        <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.45em', color: 'var(--accent-color)' }}>
          {t('The Composer')}
        </span>
        <h2
          className="font-display font-light mt-6"
          style={{ fontSize: 'clamp(1.4rem, 2.8vw, 2.4rem)', lineHeight: 1.3, color: 'var(--text-color)', maxWidth: '24ch' }}
        >
          {t('The worlds {name} scores for.').replace('{name}', composerName.split(' ')[0] ?? '')}
        </h2>
      </div>

      {/* The rotating band — curved like a strap around a cylinder */}
      <div
        className="relative w-full"
        style={{ perspective: '1400px', height: 'clamp(220px, 34vh, 360px)' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <AnimatePresence mode="popLayout">
          <motion.button
            key={current.genre}
            type="button"
            data-cursor="media"
            onClick={() => current.tracks[0] && void playTrack(current.tracks[0])}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: '60%', rotateY: -28, filter: 'blur(8px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: '0%', rotateY: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: '-60%', rotateY: 28, filter: 'blur(8px)' }}
            transition={{ duration: 1, ease: [0.5, 0, 0.2, 1] }}
            className="absolute inset-0 w-full flex items-center focus:outline-none"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* full-bleed background image with side curvature via mask + gradients */}
            <div className="absolute inset-0 overflow-hidden">
              {current.cover && (
                <img
                  src={current.cover}
                  alt=""
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
                    maskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
                  }}
                />
              )}
              {/* darkening for legibility */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #000 2%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.45) 70%, #000 98%), linear-gradient(to top, rgba(0,0,0,0.6), transparent 60%)' }} />
              {/* top + bottom hairlines to read as a 'band' */}
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)' }} />
              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)' }} />
            </div>

            {/* content */}
            <div className="relative z-10 w-full flex items-center justify-between" style={{ padding: '0 clamp(2rem, 9vw, 10rem)' }}>
              <div className="max-w-2xl text-left">
                <span className="font-mono uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--accent-color)' }}>
                  {String(active + 1).padStart(2, '0')} / {String(groups.length).padStart(2, '0')}
                </span>
                <h3
                  className="font-display font-light mt-3 text-white capitalize"
                  style={{ fontSize: 'clamp(2rem, 5.5vw, 4.5rem)', lineHeight: 1 }}
                >
                  {t(current.genre)}
                </h3>
                <p className="font-light mt-4 text-white/75" style={{ fontSize: 'clamp(0.85rem, 1.2vw, 1.05rem)', lineHeight: 1.55, maxWidth: '46ch' }}>
                  {t(blurbFor(current.genre))}
                </p>
                <span className="inline-block font-mono mt-5 text-white/50" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                  {String(current.tracks.length).padStart(2, '0')} {current.tracks.length === 1 ? t('work') : t('works')}
                </span>
              </div>
            </div>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* progress dots */}
      <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 'clamp(3rem, 6vw, 5rem)' }}>
        {groups.map((g, i) => (
          <button
            key={g.genre}
            type="button"
            aria-label={`${t('Show')} ${g.genre}`}
            onClick={() => setActive(i)}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === active ? 26 : 7,
              height: 7,
              backgroundColor: i === active ? 'var(--accent-color)' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>
    </section>
  );
}

