import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import type { Project, Locale } from '../types';

function TimelineCard({ project, index, locale }: { project: Project; index: number; locale: Locale }) {
  const title = (project.title as unknown as Record<string, string>)[locale] || project.title?.en || 'Untitled';
  const desc = (project.description as unknown as Record<string, string>)[locale] || project.description?.en || '';
  const cover = project.coverImage?.url || '';
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: index * 0.1 }} viewport={{ once: true, margin: '-100px' }}
      className="relative w-[60vw] md:w-[45vw] flex-shrink-0 snap-start group">
      <div className="relative overflow-hidden border border-[var(--border-color)] rounded-lg bg-[var(--surface2-color)] h-full">
        {cover ? <img src={cover} alt={title} className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-105" crossOrigin="anonymous" /> : <div className="w-full h-48 bg-[var(--surface3-color)] flex items-center justify-center text-[var(--text-muted-color)] text-xs">NO COVER</div>}
        <div className="p-4">
          <div className="flex justify-between items-start mb-1"><span className="text-xs uppercase tracking-[0.15em] text-[var(--accent-color)] font-mono">{project.type}</span>{project.year ? <span className="text-xs text-[var(--text-muted-color)] font-mono">{project.year}</span> : null}</div>
          <h3 className="text-lg font-display text-[var(--text-color)] leading-tight mb-1">{title}</h3>
          {desc && <p className="text-sm text-[var(--text-muted-color)] line-clamp-2">{desc}</p>}
        </div>
      </div>
    </motion.div>
  );
}

export default function SpatialScrollEngine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { composerIdentity, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const [isMobile, setIsMobile] = useState(false);
  const projects = composerIdentity?.projects ?? [];

  useEffect(() => { const c = () => setIsMobile(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);

  if (!projects.length) return <section className="min-h-[300px] flex items-center justify-center"><p className="text-[var(--text-muted-color)] text-sm font-mono uppercase tracking-[0.12em]">No projects yet</p></section>;

  return (
    <section ref={containerRef} className="relative py-16 overflow-hidden">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
        <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">Portfolio</span>
        <h2 className="text-3xl md:text-5xl font-display text-[var(--text-color)] mt-2">Selected Works</h2>
      </motion.div>
      {isMobile ? (
        <div className="flex flex-col gap-6 px-4">{projects.map((p, i) => <TimelineCard key={p.id} project={p} index={i} locale={safeLocale} />)}</div>
      ) : (
        <div className="flex gap-6 px-8 overflow-x-auto" style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', willChange: 'transform' }}>
          {projects.map((p, i) => <TimelineCard key={p.id} project={p} index={i} locale={safeLocale} />)}
        </div>
      )}
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.8 }} className="mt-16 text-center select-none pointer-events-none">
        <span className="text-[4rem] md:text-[24vw] font-display leading-none tracking-[0.02em]" style={{ mixBlendMode: 'difference', color: 'var(--text-color)' }}>ACE</span>
      </motion.div>
    </section>
  );
}