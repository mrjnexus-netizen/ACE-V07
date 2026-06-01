import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import LiquidImage from './LiquidImage';

const SpatialScrollEngine = () => {
  const { identity, locale } = useIdentity();
  const targetRef = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: targetRef,
  });

  // Slide translation for horizontal timeline (desktop only)
  const x = useTransform(scrollYProgress, [0.1, 0.9], ['0%', '-65%']);

  // Oversized text scale and letter separation tracking
  const nameScale = useTransform(scrollYProgress, [0, 0.4], [1, 1.2]);
  const letterSpace = useTransform(scrollYProgress, [0, 0.4], ['0.08em', '0.25em']);

  const projects = identity?.projects || [];

  return (
    <section ref={targetRef} className="relative h-[300vh] bg-surface">
      {/* Scroll-Linked Sticky Header Area */}
      <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
        <div className="absolute top-12 left-12 z-20">
          <motion.h2
            style={{ letterSpacing: letterSpace, scale: nameScale }}
            className="text-6xl md:text-8xl font-display font-bold text-accent tracking-widest leading-none select-none"
          >
            {identity?.name?.[locale] || 'ACE PORTFOLIO'}
          </motion.h2>
          <p className="text-sm font-mono text-text-muted mt-2 uppercase tracking-widest">
            {identity?.tagline?.[locale]}
          </p>
        </div>

        {/* Horizontal Scroll Container (hidden on mobile, stacked fallback in CSS) */}
        <div className="hidden md:flex items-center h-full">
          <motion.div style={{ x }} className="flex space-x-12 px-12 items-center">
            {projects.length > 0 ? (
              projects.map((proj) => (
                <div
                  key={proj.id}
                  className="w-[50vw] h-[55vh] flex-shrink-0 bg-surface2 border border-border rounded-lg overflow-hidden flex flex-col justify-between p-6 relative group hover:border-accent/40 transition-colors duration-500"
                >
                  <div className="absolute inset-0 z-0 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
                    {proj.coverImage?.url && (
                      <LiquidImage src={proj.coverImage.url} alt={proj.title[locale]} className="w-full h-full object-cover" />
                    )}
                  </div>

                  <div className="relative z-10 flex justify-between items-start">
                    <span className="font-mono text-xs text-accent tracking-widest">{proj.year}</span>
                    <span className="px-3 py-1 bg-surface4 border border-border text-[10px] font-mono rounded text-text uppercase tracking-wider">
                      {proj.type}
                    </span>
                  </div>

                  <div className="relative z-10 mt-auto">
                    <h3 className="text-2xl font-display font-bold text-text mb-2 group-hover:text-accent transition-colors duration-300">
                      {proj.title[locale] || proj.title.en}
                    </h3>
                    <p className="text-xs text-text-muted font-body leading-relaxed max-w-md line-clamp-3">
                      {proj.description[locale] || proj.description.en}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="w-[80vw] h-[40vh] border border-dashed border-border rounded flex items-center justify-center font-mono text-text-muted">
                No custom projects published yet.
              </div>
            )}
          </motion.div>
        </div>

        {/* Mobile Vertical Fallback Stack */}
        <div className="md:hidden flex flex-col space-y-6 px-6 overflow-y-auto max-h-[60vh] mt-32 z-10">
          {projects.map((proj) => (
            <div key={proj.id} className="bg-surface2 border border-border rounded p-4 flex flex-col space-y-4">
              <div className="h-32 rounded overflow-hidden relative bg-surface3">
                {proj.coverImage?.url && (
                  <img src={proj.coverImage.url} alt={proj.title[locale]} className="w-full h-full object-cover" />
                )}
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-xs text-accent">{proj.year}</span>
                  <span className="text-[9px] font-mono bg-surface4 border border-border px-1.5 py-0.5 rounded text-text uppercase">
                    {proj.type}
                  </span>
                </div>
                <h3 className="text-lg font-display font-bold text-text">
                  {proj.title[locale] || proj.title.en}
                </h3>
                <p className="text-xs text-text-muted font-body mt-2 leading-relaxed">
                  {proj.description[locale] || proj.description.en}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SpatialScrollEngine;
