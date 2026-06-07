import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import type { Project } from '../types';

function TimelineCard({ project, index }: { project: Project; index: number }) {
  const { locale } = useIdentity();
  const title = project.title?.[locale] || project.title?.en || 'Untitled';
  const typeLabel = project.type || '';
  const year = project.year ? String(project.year) : '';
  const desc = project.description?.[locale] || project.description?.en || '';
  const cover = project.coverImage?.url || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: index * 0.1 }}
      viewport={{ once: true, margin: '-100px' }}
      className="relative w-[60vw] md:w-[45vw] flex-shrink-0 snap-start group"
    >
      <div className="relative overflow-hidden border border-[var(--border-color)] rounded-lg bg-[var(--surface2-color)] h-full">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-105"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-48 bg-[var(--surface3-color)] flex items-center justify-center text-[var(--text-muted-color)] text-xs">
            NO COVER
          </div>
        )}
        <div className="p-4">
          <div className="flex justify-between items-start mb-1">
            <span className="text-xs uppercase tracking-[0.15em] text-[var(--accent-color)] font-mono">
              {typeLabel}
            </span>
            {year && (
              <span className="text-xs text-[var(--text-muted-color)] font-mono">{year}</span>
            )}
          </div>
          <h3 className="text-lg font-display text-[var(--text-color)] leading-tight mb-1">{title}</h3>
          {desc && (
            <p className="text-sm text-[var(--text-muted-color)] line-clamp-2">{desc}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function SpatialScrollEngine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { composerIdentity } = useIdentity();
  const { themeId } = useChromatic();
  const [isMobile, setIsMobile] = useState(false);
  const projects = composerIdentity?.projects ?? [];

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll-linked animation for desktop horizontal timeline
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const translateX = useTransform(scrollYProgress, [0.4, 1.0], ['0%', isMobile ? '0%' : '-80%']);

  if (!projects.length) {
    return (
      <section className="min-h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted-color)] text-sm font-mono uppercase tracking-[0.12em]">
          No projects yet
        </p>
      </section>
    );
  }

  return (
    <section ref={containerRef} className="relative py-16 overflow-hidden">
      {/* Section title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-10"
      >
        <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
          Portfolio
        </span>
        <h2 className="text-3xl md:text-5xl font-display text-[var(--text-color)] mt-2">
          Selected Works
        </h2>
      </motion.div>

      {/* Desktop: horizontal scroll; Mobile: vertical stack */}
      {isMobile ? (
        <div className="flex flex-col gap-6 px-4">
          {projects.map((p, i) => (
            <TimelineCard key={p.id} project={p} index={i} />
          ))}
        </div>
      ) : (
        <motion.div style={{ translateX, scrollSnapType: 'x mandatory', overflowX: 'auto', WebkitOverflowScrolling: 'touch', willChange: 'transform' }} className="flex gap-6 px-8">
          {projects.map((p, i) => (
            <TimelineCard key={p.id} project={p} index={i} />
          ))}
        </motion.div>
      )}

      {/* Text mask reveal (achievement keyword) */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        className="mt-16 text-center select-none pointer-events-none"
      >
        <span
          className="text-[4rem] md:text-[24vw] font-display leading-none tracking-[0.02em]"
          style={{
            mixBlendMode: 'difference',
            color: 'var(--text-color)',
            background: 'transparent',
          }}
        >
          ACE
        </span>
      </motion.div>
    </section>
  );
}