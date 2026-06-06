import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';

const SpatialScrollEngine = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { identity } = useIdentity();
  const projects = identity?.projects;
  const heroVideoUrl = identity?.heroVideo;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const xTransform = useTransform(scrollYProgress, [0.4, 1.0], ['0%', '-80%']);

  // اگر پروژه‌ای وجود نداشت، یک نوار خالی نشان بده
  const hasProjects = projects && projects.length > 0;

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      {/* Hero section with video or gradient */}
      <div className="relative h-screen w-full">
        {heroVideoUrl ? (
          <video
            src={heroVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-surface2 to-surface" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <h2 className="text-center text-4xl font-display mix-blend-difference md:text-8xl">
            ACHIEVEMENTS
          </h2>
        </div>
      </div>

      {/* Horizontal scroll wrapper */}
      <div className="relative overflow-x-auto no-scrollbar" style={{ overflowX: 'auto' }}>
        <motion.div
          style={{ x: xTransform }}
          className="flex gap-8 will-change-transform"
        >
          {hasProjects ? (
            projects.map((project) => (
              <div
                key={project.id}
                className="w-[60vw] md:w-[60vw] flex-shrink-0 snap-start"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg">
                  {project.coverImage?.url && (
                    <img
                      src={project.coverImage.url}
                      alt={project.title?.en || ''}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <h3 className="mt-4 text-2xl font-display">
                  {project.title?.en || 'Untitled'}
                </h3>
                <p className="text-muted">{project.type}</p>
                <p className="text-muted">{project.year}</p>
              </div>
            ))
          ) : (
            <div className="w-full py-20 text-center text-muted">
              No projects yet.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SpatialScrollEngine;
