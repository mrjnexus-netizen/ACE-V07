import { useRef, useMemo } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';

// A single image with real intrinsic dimensions, sourced from existing identity data.
interface GalleryImage {
  url: string;
  width: number;
  height: number;
}

// Collect every available composer image from the canonical identity sources:
// portrait, project cover images, and track cover art. No invented fields.
function collectImages(
  portraitUrl: string | undefined,
  portraitW: number | undefined,
  portraitH: number | undefined,
  projectCovers: GalleryImage[],
  trackCovers: GalleryImage[],
): GalleryImage[] {
  const images: GalleryImage[] = [];
  if (portraitUrl) {
    images.push({ url: portraitUrl, width: portraitW || 1000, height: portraitH || 1400 });
  }
  projectCovers.forEach((p) => images.push(p));
  trackCovers.forEach((t) => images.push(t));
  return images;
}

// Derive a grid footprint from the real aspect ratio (mixed landscape / portrait / tall / wide).
function spanFor(width: number, height: number): { col: number; row: number } {
  const ratio = width && height ? width / height : 1;
  if (ratio >= 1.5) return { col: 2, row: 1 }; // wide
  if (ratio <= 0.66) return { col: 1, row: 2 }; // tall
  return { col: 1, row: 1 };
}

interface TiltCardProps {
  image: GalleryImage;
  reduce: boolean;
}

function TiltCard({ image, reduce }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rxRaw = useMotionValue(0);
  const ryRaw = useMotionValue(0);
  const rotateX = useSpring(rxRaw, { stiffness: 150, damping: 18 });
  const rotateY = useSpring(ryRaw, { stiffness: 150, damping: 18 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ryRaw.set(px * 8);
    rxRaw.set(-py * 8);
  };

  const handleLeave = () => {
    rxRaw.set(0);
    ryRaw.set(0);
  };

  const span = spanFor(image.width, image.height);

  return (
    <motion.div
      ref={ref}
      data-cursor="media"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      style={{
        rotateX: reduce ? 0 : rotateX,
        rotateY: reduce ? 0 : rotateY,
        transformPerspective: 1000,
        gridColumn: `span ${span.col}`,
        gridRow: `span ${span.row}`,
        borderColor: 'var(--border-color)',
      }}
      className="relative overflow-hidden border will-change-transform"
    >
      <img
        src={image.url}
        alt=""
        crossOrigin="anonymous"
        loading="lazy"
        className="w-full h-full object-cover"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.45)' }}
      />
    </motion.div>
  );
}

export default function ComposerPresence() {
  const { identity, tracks, locale } = useIdentity();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  // Three parallax depth layers (Composer Presence: 3D-on-scroll feel).
  const y0 = useTransform(scrollYProgress, [0, 1], ['0%', '-4%']);
  const y1 = useTransform(scrollYProgress, [0, 1], ['0%', '-10%']);
  const y2 = useTransform(scrollYProgress, [0, 1], ['0%', '-16%']);
  const layers = [y0, y1, y2];

  const images = useMemo<GalleryImage[]>(() => {
    const projectCovers: GalleryImage[] = (identity?.projects || [])
      .map((p) => p.coverImage)
      .filter((c): c is NonNullable<typeof c> => !!c && !!c.url)
      .map((c) => ({ url: c.url, width: c.width, height: c.height }));
    const trackCovers: GalleryImage[] = (tracks || [])
      .map((t) => t.coverArt)
      .filter((c): c is NonNullable<typeof c> => !!c && !!c.url)
      .map((c) => ({ url: c.url, width: c.width, height: c.height }));
    return collectImages(
      identity?.portrait?.url,
      identity?.portrait?.width,
      identity?.portrait?.height,
      projectCovers,
      trackCovers,
    );
  }, [identity, tracks]);

  // Localized composer name from the canonical identity source, mirroring the
  // hero's localText() pattern, so the empty-state hero never disagrees with
  // the rest of the site. Falls back to 'ACE Composer' exactly like the hero.
  const nameMap = (identity?.name ?? null) as unknown as Record<string, string> | null;
  const composerName =
    (nameMap && nameMap[locale ?? 'en']) || (nameMap && nameMap.en) || 'ACE Composer';

  // Null-safe elegant empty state (LAW 2): no broken layout, no console noise.
  if (images.length === 0) {
    return (
      <section
        ref={sectionRef}
        className="relative w-full min-h-[70vh] flex flex-col items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--surface-color)' }}
        aria-label="The composer"
      >
        <span
          className="font-mono uppercase"
          style={{ fontSize: '0.66rem', letterSpacing: '0.34em', color: 'var(--accent-color)' }}
        >
          The Composer
        </span>
        <h2
          className="font-display text-center mt-6"
          style={{
            fontSize: 'clamp(2.5rem, 9vw, 8rem)',
            lineHeight: 0.95,
            color: 'var(--text-dim-color)',
          }}
        >
          {composerName}
        </h2>
        <div
          className="mt-8 animate-pulse"
          style={{ width: '40%', height: '1px', backgroundColor: 'var(--border-color)', animationDuration: '3s' }}
        />
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: 'var(--surface-color)', padding: 'clamp(4rem, 10vw, 9rem) clamp(1.2rem, 6vw, 7rem)' }}
      aria-label="The composer"
    >
      <div className="flex items-center gap-3 mb-10">
        <span style={{ width: '34px', height: '1px', backgroundColor: 'var(--accent-color)' }} />
        <span
          className="font-mono uppercase"
          style={{ fontSize: '0.66rem', letterSpacing: '0.34em', color: 'var(--accent-color)' }}
        >
          The Composer
        </span>
      </div>

      <div
        className="grid gap-2 md:gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gridAutoRows: '200px',
          gridAutoFlow: 'dense',
        }}
      >
        {images.map((image, i) => (
          <motion.div key={`${image.url}-${i}`} style={{ y: reduce ? 0 : layers[i % 3] }}>
            <TiltCard image={image} reduce={reduce} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}