import { useEffect, useRef, useState } from 'react';
import { useBalancedText } from '../hooks/useBalancedText';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';
import EditableText from './EditableText';
import EditableImage from './EditableImage';
import type { Locale } from '../types';
import ScaleStage from './ScaleStage';

/**
 * Cinematic portrait scene — LOCKED COMPOSITION (blueprint G4 / H12).
 *
 * The section is a fixed 100vh stage. Inside it, the whole composition
 * (portrait + text block) lives on a ScaleStage logical canvas and scales
 * as ONE unit at any window size — the layout can never re-flow ("image
 * stays up, texts fall down" is impossible by construction).
 *
 *   - Desktop (>=768px): 1600x900 canvas — portrait left, text right,
 *     exactly the approved fullscreen composition.
 *   - Mobile  (<768px):  720x1240 canvas — portrait top, text underneath,
 *     a deliberate vertical composition (not a shrunk desktop).
 *
 * All approved effects are preserved: scroll parallax on the image, blur
 * reveal, spring scale, feathered radial mask, sheen, text slide-up/fade.
 * Sizing inside the stage is FIXED PX against the logical canvas — never
 * vw/vh (they ignore ancestor transform scale; portal lesson #1).
 */

const DESK_W = 1600;
const DESK_H = 900;
const MOB_W = 720;
const MOB_H = 1280;

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

// 2026-07-17 (site-wide responsive audit, per Reza): same reasoning as the
// identical helper in LinguisticPortal.tsx — a plain width check routed
// portrait tablets (768-1023px wide, taller than wide) into the DESKTOP
// 1600x900 landscape composition, scaled down small with dead space
// top/bottom, instead of the vertically-built MOB_W x MOB_H one actually
// designed for that shape.
function isMobileLayoutWidth(width: number, height: number): boolean {
  return width < 768 || (width < 1024 && height > width);
}

function useIsMobile(): boolean {
  const [m, setM] = useState(
    typeof window !== 'undefined' ? isMobileLayoutWidth(window.innerWidth, window.innerHeight) : false
  );
  useEffect(() => {
    const on = () => setM(isMobileLayoutWidth(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return m;
}

/** The portrait artwork with all its approved effects, filling its parent box. */
function PortraitArt({
  url,
  name,
  imgY,
  blur,
  sScale,
  placeholder,
}: {
  url: string | undefined;
  name: string;
  imgY: MotionValue<string>;
  blur: MotionValue<string>;
  sScale: MotionValue<number>;
  placeholder: string;
}) {
  return (
    <motion.div
      style={{ scale: sScale, filter: blur, borderRadius: 24 }}
      className="relative w-full h-full overflow-hidden"
    >
      <div className="absolute inset-0">
        {url ? (
          <EditableImage contentKey="about.portraitImage" defaultUrl={url}>
            {(resolvedUrl) => (
              <motion.img
                src={resolvedUrl}
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
            )}
          </EditableImage>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted-color)] text-xs font-mono uppercase tracking-[0.15em]">
            {placeholder}
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
  );
}

/** The text block (kicker / name / tagline / bio) at fixed logical-px sizes. */
function AboutText({
  name,
  tagline,
  bio,
  kicker,
  textY,
  textOpacity,
  nameSize,
  taglineSize,
  bioSize,
  bioMaxWidth,
}: {
  name: string;
  tagline: string;
  bio: string;
  kicker: string;
  textY: MotionValue<string>;
  textOpacity: MotionValue<number>;
  nameSize: number;
  taglineSize: number;
  bioSize: number;
  bioMaxWidth: number;
}) {
  // G5/H13: even wrap + widow-kill, cross-browser (v4: transform-aware).
  const taglineRef = useBalancedText<HTMLParagraphElement>();
  const bioRef = useBalancedText<HTMLParagraphElement>();
  return (
    <motion.div style={{ y: textY, opacity: textOpacity }}>
      <span
        className="font-mono uppercase"
        style={{ fontSize: 12, letterSpacing: '0.25em', color: 'var(--accent-color)' }}
      >
        <EditableText contentKey="about.kicker" defaultValue={kicker} as="span" />
      </span>
      <h2
        className="font-display"
        style={{
          fontSize: nameSize,
          lineHeight: 1.02,
          marginTop: 12,
          marginBottom: 20,
          color: 'var(--text-color)',
        }}
      >
        <EditableText contentKey="identity.name" defaultValue={name} as="span" />
      </h2>
      <p
        ref={taglineRef}
        style={{
          fontSize: taglineSize,
          lineHeight: 1.35,
          opacity: 0.9,
          marginBottom: 16,
          color: 'var(--text-color)',
        }}
      >
        <EditableText contentKey="identity.tagline" defaultValue={tagline} as="span" />
      </p>
      <p
        ref={bioRef}
        style={{
          fontSize: bioSize,
          lineHeight: 1.6,
          maxWidth: bioMaxWidth,
          color: 'var(--text-muted-color)',
        }}
      >
        <EditableText contentKey="identity.biography" defaultValue={bio} as="span" />
      </p>
    </motion.div>
  );
}

export default function DoubleExposurePortrait() {
  const sectionRef = useRef<HTMLElement>(null);
  const { composerIdentity, locale } = useIdentity();
  const { t } = useT();
  const safeLocale = (locale ?? 'en') as Locale;
  const reduced = useReducedMotion() ?? false;
  const isMobile = useIsMobile();

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

  const kicker = t('The Composer');
  const trTagline = tagline ? t(tagline) : '';
  const trBio = bio ? t(bio) : '';

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-visible"
      style={isMobile ? { padding: '2.5rem 0' } : { height: '100vh' }}
      aria-label={kicker}
    >
      {!isMobile ? (
        /* ---------- DESKTOP locked scene: 1600x900, portrait left / text right ---------- */
        <ScaleStage width={DESK_W} height={DESK_H} clip={false}>
          <div style={{ position: 'absolute', left: 120, top: 62, width: 620, height: 776 }}>
            <PortraitArt
              url={portraitUrl}
              name={name}
              imgY={imgY}
              blur={blur}
              sScale={sScale}
              placeholder={t('Portrait')}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 830,
              top: 0,
              width: 650,
              height: DESK_H,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              paddingRight: 60,
            }}
          >
            <AboutText
              name={name}
              tagline={trTagline}
              bio={trBio}
              kicker={kicker}
              textY={textY}
              textOpacity={textOpacity}
              nameSize={64}
              taglineSize={23}
              bioSize={20}
              bioMaxWidth={540}
            />
          </div>
        </ScaleStage>
      ) : (
        /* ---------- MOBILE locked scene: 720x1280, portrait top / text below.
           Wrapper's aspect-ratio matches the canvas exactly (no forced 100vh),
           so ScaleStage's scale is never letterboxed - zero dead space above
           or below the photo, and no extra pre-scroll gap before it appears. */
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            aspectRatio: `${MOB_W} / ${MOB_H}`,
          }}
        >
          <ScaleStage width={MOB_W} height={MOB_H} clip={false}>
            <div style={{ position: 'absolute', left: 100, top: 40, width: 520, height: 650 }}>
              <PortraitArt
                url={portraitUrl}
                name={name}
                imgY={imgY}
                blur={blur}
                sScale={sScale}
                placeholder={t('Portrait')}
              />
            </div>
            <div style={{ position: 'absolute', left: 70, top: 750, width: 580 }}>
              <AboutText
                name={name}
                tagline={trTagline}
                bio={trBio}
                kicker={kicker}
                textY={textY}
                textOpacity={textOpacity}
                nameSize={58}
                taglineSize={23}
                bioSize={19}
                bioMaxWidth={560}
              />
            </div>
          </ScaleStage>
        </div>
      )}
    </section>
  );
}
