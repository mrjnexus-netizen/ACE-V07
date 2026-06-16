import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import type { Project, Locale } from '../types';

/**
 * Cinematic, chapter-based portfolio scroll.
 *
 * The rhythm alternates one-to-one:
 *   [project] -> [interlude text] -> [project] -> [interlude text] -> ...
 * automatically, for ANY number of projects the admin adds. Each project
 * reveals out of blur+scale as it reaches the centre, parallaxes, and banks
 * gently in 3D. Edges are feathered, cards are a uniform size.
 */

// Cinematic interludes shown between projects (editable later via Admin).
// They cycle if there are more gaps than lines.
const INTERLUDES = [
  { kicker: 'Hans Zimmer', line: 'I see music as colours, and I try to paint with sound.' },
  { kicker: 'Ludwig van Beethoven', line: 'Music is the mediator between the spiritual and the sensual life.' },
  { kicker: 'Claude Debussy', line: 'Music is the silence between the notes.' },
  { kicker: 'Johann Sebastian Bach', line: 'The aim of music is to touch the heart and refresh the soul.' },
  { kicker: 'Ennio Morricone', line: 'Silence is also music, and the most important one.' },
  { kicker: 'Igor Stravinsky', line: 'To listen is an effort, and just to hear is no merit.' },
  { kicker: 'Wolfgang Amadeus Mozart', line: 'The music is not in the notes, but in the silence between.' },
  { kicker: 'John Williams', line: 'A great film score reaches the audience before they even know it.' },
  { kicker: 'Frederic Chopin', line: 'Simplicity is the final achievement, the crowning reward of art.' },
  { kicker: 'Gustav Mahler', line: 'The symphony must be like the world; it must embrace everything.' },
  { kicker: 'Leonard Bernstein', line: 'Music can name the unnameable and communicate the unknowable.' },
  { kicker: 'Pyotr Ilyich Tchaikovsky', line: 'Music is the language of the soul, where words fall silent.' },
];

function pad(n: number) {
  return String(n + 1).padStart(2, '0');
}

export default function SpatialScrollEngine() {
  const containerRef = useRef<HTMLElement>(null);
  const { composerIdentity, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const [isMobile, setIsMobile] = useState(false);
  const projects = composerIdentity?.projects ?? [];

  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, []);


  if (!projects.length)
    return (
      <section className="min-h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted-color)] text-sm font-mono uppercase tracking-[0.12em]">
          No projects yet
        </p>
      </section>
    );

  // Build the sequence: one project, then one interlude, alternating. An
  // interlude follows every project except the last. Scales to ANY number.
  type Slot =
    | { kind: 'project'; project: Project; index: number }
    | { kind: 'interlude'; data: { kicker: string; line: string } };
  const slots: Slot[] = [];
  let interludeCount = 0;
  for (let i = 0; i < projects.length; i += 1) {
    slots.push({ kind: 'project', project: projects[i]!, index: i });
    // Interlude after each project, only if more projects follow.
    if (i + 1 < projects.length) {
      slots.push({ kind: 'interlude', data: INTERLUDES[interludeCount % INTERLUDES.length]! });
      interludeCount += 1;
    }
  }

  // MOBILE: simple, reliable vertical reveal.
  if (isMobile) {
    return (
      <section className="relative py-16 px-4">
        <header className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
            The Score
          </span>
          <h2 className="text-3xl font-display text-[var(--text-color)] mt-2">Selected Works</h2>
        </header>
        <div className="flex flex-col gap-14">
          {slots.map((slot, si) => {
            if (slot.kind === 'interlude') {
              return (
                <div key={`int-${si}`} className="text-center py-6">
                  <span className="text-xs uppercase tracking-[0.3em] text-[var(--accent-color)] font-mono">
                    {slot.data.kicker}
                  </span>
                  <p className="font-display text-[var(--text-color)] italic leading-snug mt-3"
                     style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)' }}>
                    {slot.data.line}
                  </p>
                </div>
              );
            }
            const p = slot.project;
            const title =
              (p.title as unknown as Record<string, string>)[safeLocale] || p.title?.en || 'Untitled';
            const desc =
              (p.description as unknown as Record<string, string>)[safeLocale] || p.description?.en || '';
            const cover = p.coverImage?.url || (p as unknown as { coverUrl?: string }).coverUrl || '';
            return (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: '16 / 10' }}>
                  {cover ? (
                    <img src={cover} alt={title} crossOrigin="anonymous"
                      className="w-full h-full object-cover"
                      style={{
                        WebkitMaskImage: 'radial-gradient(140% 130% at 50% 45%, #000 60%, transparent 100%)',
                        maskImage: 'radial-gradient(140% 130% at 50% 45%, #000 60%, transparent 100%)',
                      }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase">No cover</div>
                  )}
                </div>
                <div className="mt-4">
                  <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">{p.type}</span>
                  <h3 className="text-2xl font-display text-[var(--text-color)] leading-tight mt-1 mb-1">{title}</h3>
                  {desc && <p className="text-sm text-[var(--text-muted-color)]">{desc}</p>}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>
    );
  }

  // DESKTOP: each slot is a full-height scene that reveals cinematically
  // (blur + scale + rise) as it enters view. Reliable: every slot is really
  // in the document flow, so all of them show, each with full screen time,
  // and transitions are clean because each owns its own screen.
  return (
    <section ref={containerRef} className="relative">
      <header className="h-[60vh] flex flex-col items-center justify-center text-center px-8">
        <span className="text-xs uppercase tracking-[0.25em] text-[var(--accent-color)] font-mono">
          The Score
        </span>
        <h2 className="text-5xl md:text-7xl font-display text-[var(--text-color)] mt-3">
          Selected Works
        </h2>
      </header>

      <div style={{ perspective: '1600px' }}>
        {slots.map((slot, si) => {
          if (slot.kind === 'interlude') {
            return (
              <div
                key={`int-${si}`}
                className="flex items-center justify-center px-8 text-center"
                style={{ minHeight: '22vh' }}
              >
                <motion.div
                  initial={{ opacity: 0, filter: 'blur(10px)', y: 40 }}
                  whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  viewport={{ once: false, amount: 0.6 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-none rounded-3xl px-10 py-8"
                  style={{
                    background:
                      'radial-gradient(120% 120% at 50% 50%, rgba(var(--surface-rgb),0.85) 40%, rgba(var(--surface-rgb),0.45) 75%, transparent 100%)',
                  }}
                >
                  <span className="text-xs uppercase tracking-[0.3em] text-[var(--accent-color)] font-mono">
                    {slot.data.kicker}
                  </span>
                  <p
                    className="font-display text-[var(--text-color)] mt-5 whitespace-nowrap"
                    style={{ fontSize: 'clamp(0.7rem, 2vw, 1.4rem)', fontStyle: 'italic', lineHeight: 1.2 }}
                  >
                    {slot.data.line}
                  </p>
                </motion.div>
              </div>
            );
          }

          const p = slot.project;
          const title =
            (p.title as unknown as Record<string, string>)[safeLocale] || p.title?.en || 'Untitled';
          const desc =
            (p.description as unknown as Record<string, string>)[safeLocale] || p.description?.en || '';
          const cover = p.coverImage?.url || (p as unknown as { coverUrl?: string }).coverUrl || '';

          return (
            <div key={p.id} className="flex items-center justify-center px-6 md:px-16" style={{ minHeight: '78vh' }}>
              <motion.article
                initial={{ opacity: 0, filter: 'blur(12px)', scale: 0.94, y: 50 }}
                whileInView={{ opacity: 1, filter: 'blur(0px)', scale: 1, y: 0 }}
                viewport={{ once: false, amount: 0.5 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-5xl grid md:grid-cols-12 gap-8 items-center"
              >
                <span
                  aria-hidden
                  className="pointer-events-none select-none absolute -top-20 -left-2 md:-left-8 font-display leading-none"
                  style={{ fontSize: 'clamp(7rem, 18vw, 16rem)', color: 'var(--text-color)', opacity: 0.05 }}
                >
                  {pad(slot.index)}
                </span>

                <div className="md:col-span-7">
                  <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: '16 / 10' }}>
                    {cover ? (
                      <img
                        src={cover}
                        alt={title}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                        style={{
                          WebkitMaskImage: 'radial-gradient(135% 125% at 50% 45%, #000 62%, transparent 100%)',
                          maskImage: 'radial-gradient(135% 125% at 50% 45%, #000 62%, transparent 100%)',
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase tracking-[0.15em]">
                        No cover
                      </div>
                    )}
                    <div
                      className="absolute inset-0 pointer-events-none rounded-3xl"
                      style={{ background: 'linear-gradient(125deg, rgba(255,255,255,0.08), transparent 40%)' }}
                    />
                  </div>
                </div>

                <div
                  className="md:col-span-5 rounded-2xl px-5 py-6"
                  style={{
                    background:
                      'linear-gradient(120deg, rgba(var(--surface-rgb),0.82), rgba(var(--surface-rgb),0.4))',
                  }}
                >
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
                      {p.type}
                    </span>
                    {p.year ? (
                      <span className="text-[0.7rem] text-[var(--text-muted-color)] font-mono">{p.year}</span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-[var(--text-color)] leading-[1.05] mb-4"
                      style={{ fontSize: 'clamp(1.9rem, 3.6vw, 3.25rem)' }}>
                    {title}
                  </h3>
                  {desc && (
                    <p className="text-sm md:text-base text-[var(--text-muted-color)] leading-relaxed">
                      {desc}
                    </p>
                  )}
                </div>
              </motion.article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
