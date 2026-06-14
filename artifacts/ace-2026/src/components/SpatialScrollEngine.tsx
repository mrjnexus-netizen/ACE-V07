import { useRef, useState, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import type { Project, Locale } from '../types';

/**
 * Cinematic, chapter-based scroll engine for the portfolio.
 * Each project is a "movement": it materialises out of blur + scale as it enters
 * the viewport, its cover image parallaxes against the frame, the whole card banks
 * gently in 3D, and a large faint chapter numeral sits behind it. Edges are
 * feathered with masks so nothing reads as a hard rectangle.
 *
 * Technique references (studied, not copied): Diamond Journey (blur+scale text
 * reveal), Raven / Alireza (numbered chapters), Pasqua (chaptered narrative).
 */

function pad(n: number) {
  return String(n + 1).padStart(2, '0');
}

function SpatialMovement({
  project,
  index,
  total,
  locale,
  progress,
  reduced,
}: {
  project: Project;
  index: number;
  total: number;
  locale: Locale;
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const title =
    (project.title as unknown as Record<string, string>)[locale] || project.title?.en || 'Untitled';
  const desc =
    (project.description as unknown as Record<string, string>)[locale] ||
    project.description?.en ||
    '';
  const cover = project.coverImage?.url || '';

  // Each movement owns a slice of overall scroll progress.
  const slice = 1 / Math.max(total, 1);
  const center = slice * (index + 0.5);
  const inAt = center - slice * 0.85;
  const outAt = center + slice * 0.85;

  // --- Cinematic reveal: blur + scale + opacity (Diamond-Journey style) ---
  const blurPx = useTransform(
    progress,
    [inAt, center, outAt],
    reduced ? [0, 0, 0] : [14, 0, 14]
  );
  const blur = useTransform(blurPx, (v) => `blur(${v}px)`);
  const opacity = useTransform(
    progress,
    [inAt, center - slice * 0.1, center + slice * 0.1, outAt],
    reduced ? [1, 1, 1, 1] : [0, 1, 1, 0]
  );
  const scale = useTransform(
    progress,
    [inAt, center, outAt],
    reduced ? [1, 1, 1] : [0.78, 1, 0.78]
  );

  // --- Gentle 3D bank as the card crosses the centre ---
  const rotateY = useTransform(
    progress,
    [inAt, center, outAt],
    reduced ? [0, 0, 0] : [34, 0, -34]
  );
  const rotateX = useTransform(
    progress,
    [inAt, center, outAt],
    reduced ? [0, 0, 0] : [14, 0, 14]
  );

  // Real depth travel: card flies in from far, settles, recedes again.
  const z = useTransform(
    progress,
    [inAt, center, outAt],
    reduced ? [0, 0, 0] : [-420, 0, -420]
  );

  // --- Layered parallax: cover moves slower than the frame ---
  const imgY = useTransform(
    progress,
    [inAt, outAt],
    reduced ? ['0%', '0%'] : ['-18%', '18%']
  );

  // Springs so motion feels expensive, not twitchy.
  const spring = { stiffness: 80, damping: 24, mass: 0.7 };
  const sScale = useSpring(scale, spring);
  const sRotateY = useSpring(rotateY, spring);
  const sRotateX = useSpring(rotateX, spring);
  const sZ = useSpring(z, spring);

  return (
    <motion.article
      style={{
        opacity,
        scale: sScale,
        rotateY: sRotateY,
        rotateX: sRotateX,
        z: sZ,
        filter: blur,
        transformStyle: 'preserve-3d',
      }}
      className="absolute inset-0 flex items-center justify-center px-6 md:px-16"
    >
      <div className="relative w-full max-w-5xl grid md:grid-cols-12 gap-8 items-center">
        {/* Giant faint chapter numeral behind everything */}
        <span
          aria-hidden
          className="pointer-events-none select-none absolute -top-24 -left-2 md:-left-10 font-display leading-none"
          style={{
            fontSize: 'clamp(8rem, 22vw, 20rem)',
            color: 'var(--text-color)',
            opacity: 0.06,
            transform: 'translateZ(-60px)',
          }}
        >
          {pad(index)}
        </span>

        {/* Cover — feathered edges, parallaxing */}
        <div className="md:col-span-7 relative" style={{ transform: 'translateZ(40px)' }}>
          <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '16 / 10' }}>
            {cover ? (
              <motion.img
                src={cover}
                alt={title}
                crossOrigin="anonymous"
                style={{
                  y: imgY,
                  WebkitMaskImage:
                    'radial-gradient(130% 120% at 50% 45%, #000 52%, transparent 100%)',
                  maskImage:
                    'radial-gradient(130% 120% at 50% 45%, #000 52%, transparent 100%)',
                }}
                className="absolute inset-0 w-full h-[124%] -top-[12%] object-cover will-change-transform"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase tracking-[0.15em]">
                No cover
              </div>
            )}
            {/* soft inner glass sheen */}
            <div
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{
                background:
                  'linear-gradient(125deg, rgba(255,255,255,0.10), transparent 38%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>

        {/* Text */}
        <div className="md:col-span-5" style={{ transform: 'translateZ(20px)' }}>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
              {project.type}
            </span>
            {project.year ? (
              <span className="text-[0.7rem] text-[var(--text-muted-color)] font-mono">
                {project.year}
              </span>
            ) : null}
          </div>
          <h3 className="font-display text-[var(--text-color)] leading-[1.04] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.75rem)' }}>
            {title}
          </h3>
          {desc && (
            <p className="text-sm md:text-base text-[var(--text-muted-color)] leading-relaxed max-w-md">
              {desc}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export default function SpatialScrollEngine() {
  const containerRef = useRef<HTMLElement>(null);
  const { composerIdentity, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const [isMobile, setIsMobile] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const projects = composerIdentity?.projects ?? [];

  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Thin progress line that fills as you move through the movements.
  const lineScale = useSpring(scrollYProgress, { stiffness: 90, damping: 30 });

  if (!projects.length)
    return (
      <section className="min-h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted-color)] text-sm font-mono uppercase tracking-[0.12em]">
          No projects yet
        </p>
      </section>
    );

  // MOBILE: simple, reliable vertical reveal (no pin / heavy 3D).
  if (isMobile) {
    return (
      <section className="relative py-16 px-4">
        <header className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
            The Score
          </span>
          <h2 className="text-3xl font-display text-[var(--text-color)] mt-2">Selected Works</h2>
        </header>
        <div className="flex flex-col gap-12">
          {projects.map((p, i) => {
            const title =
              (p.title as unknown as Record<string, string>)[safeLocale] || p.title?.en || 'Untitled';
            const desc =
              (p.description as unknown as Record<string, string>)[safeLocale] ||
              p.description?.en ||
              '';
            const cover = p.coverImage?.url || '';
            return (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <span
                  aria-hidden
                  className="absolute -top-10 left-0 font-display leading-none select-none pointer-events-none"
                  style={{ fontSize: '6rem', color: 'var(--text-color)', opacity: 0.07 }}
                >
                  {pad(i)}
                </span>
                <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '16 / 10' }}>
                  {cover ? (
                    <img
                      src={cover}
                      alt={title}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover"
                      style={{
                        WebkitMaskImage:
                          'radial-gradient(135% 125% at 50% 45%, #000 55%, transparent 100%)',
                        maskImage:
                          'radial-gradient(135% 125% at 50% 45%, #000 55%, transparent 100%)',
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase">
                      No cover
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
                      {p.type}
                    </span>
                    {p.year ? (
                      <span className="text-[0.7rem] text-[var(--text-muted-color)] font-mono">
                        {p.year}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-2xl font-display text-[var(--text-color)] leading-tight mb-2">
                    {title}
                  </h3>
                  {desc && <p className="text-sm text-[var(--text-muted-color)]">{desc}</p>}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>
    );
  }

  // DESKTOP: pinned stage; vertical scroll drives the cinematic movements.
  return (
    <section
      ref={containerRef}
      className="relative"
      style={{ height: `${Math.max(projects.length, 2) * 100}vh` }}
    >
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <header className="pt-12 text-center shrink-0">
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--accent-color)] font-mono">
            The Score
          </span>
          <h2 className="text-4xl md:text-5xl font-display text-[var(--text-color)] mt-2">
            Selected Works
          </h2>
        </header>

        {/* Stage with perspective for real depth */}
        <div className="relative flex-1" style={{ perspective: '1600px' }}>
          {projects.map((p, i) => (
            <SpatialMovement
              key={p.id}
              project={p}
              index={i}
              total={projects.length}
              locale={safeLocale}
              progress={scrollYProgress}
              reduced={reduced}
            />
          ))}
        </div>

        {/* Progress line */}
        <div className="shrink-0 pb-10 px-16">
          <div className="relative h-px w-full bg-[var(--border-color)]">
            <motion.div
              className="absolute left-0 top-0 h-px bg-[var(--accent-color)] origin-left w-full"
              style={{ scaleX: lineScale }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
