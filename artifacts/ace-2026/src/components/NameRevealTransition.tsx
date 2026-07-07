import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';

/**
 * Scroll-triggered curtain reveal between the Hero and "The Composer"
 * section — adapted from Reza's reference (codepen.io/shahidshaikhs/pen/JjGoaOz):
 * a stack of dark cover panels peels away (staggered slide), a short
 * flying mark holds the eye for a beat, then the composer's full name
 * settles in gold Cinzel type with a gentle mousemove tilt.
 *
 * v2: rebuilt WITHOUT gsap — `gsap` was never an actual project dependency
 * (the site failed to boot: "Failed to resolve import gsap"). Same
 * choreography, done with plain CSS transitions driven by a few discrete
 * React state flips (NOT a per-frame loop — a handful of setState calls
 * across ~2.2s is fine; only continuous rAF loops must avoid setState) plus
 * a ref-driven mousemove tilt (direct style writes, no state, no library).
 *
 * - Plays ONCE, triggered by IntersectionObserver when scrolled into view.
 *   No scroll pin/lock (the earlier IntroSequence pin was hard-rejected).
 * - Panel tones and type pulled from the site's own dark ground + gold
 *   gradient system.
 * - `prefers-reduced-motion`: resting state renders immediately, no motion.
 */
export default function NameRevealTransition() {
  const sectionRef = useRef<HTMLElement>(null);
  const nameElRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);
  const reduce = useReducedMotion() ?? false;
  const { identity, locale } = useIdentity();
  const { t } = useT();

  const [markIn, setMarkIn] = useState(false);
  const [peeled, setPeeled] = useState(false);
  const [nameIn, setNameIn] = useState(false);

  const nameMap = (identity?.name ?? null) as unknown as Record<string, string> | null;
  const composerName = (nameMap && nameMap[locale ?? 'en']) || (nameMap && nameMap.en) || t('ACE Composer');
  const firstName = composerName.split(' ')[0] ?? composerName;

  useEffect(() => {
    if (reduce) {
      setPeeled(true);
      setNameIn(true);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !playedRef.current) {
          playedRef.current = true;
          const t1 = window.setTimeout(() => setMarkIn(true), 20);
          const t2 = window.setTimeout(() => setMarkIn(false), 1400);
          const t3 = window.setTimeout(() => setPeeled(true), 1300);
          const t4 = window.setTimeout(() => setNameIn(true), 2200);
          timeoutsRef.current.push(t1, t2, t3, t4);
        }
      },
      { threshold: 0.45 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // Lightweight mousemove tilt on the resting name — ref-driven, direct
  // style write, never React state (WorkSphere/carousel performance lesson).
  useEffect(() => {
    if (reduce) return;
    const el = sectionRef.current;
    const name = nameElRef.current;
    if (!el || !name) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const xPos = (e.clientX - rect.left) / rect.width - 0.5;
        const yPos = (e.clientY - rect.top) / rect.height - 0.5;
        name.style.transform = `rotateY(${xPos * 10}deg) rotateX(${-yPos * 10}deg)`;
      });
    };
    el.addEventListener('mousemove', onMove);
    return () => {
      el.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden flex items-center justify-center"
      style={{ minHeight: '70vh', backgroundColor: 'var(--surface-color)' }}
      aria-hidden
    >
      {/* resting content: the composer's full name, revealed once covers peel */}
      <div
        ref={nameElRef}
        className="relative text-center"
        style={{
          opacity: nameIn ? 1 : 0,
          transform: nameIn ? 'translateX(0)' : 'translateX(-60%)',
          transition: 'opacity 1s ease, transform 1s ease',
          transformStyle: 'preserve-3d',
        }}
      >
        <span
          className="font-mono uppercase block"
          style={{ fontSize: '0.7rem', letterSpacing: '0.45em', color: 'var(--accent-color)', marginBottom: '1rem' }}
        >
          {t('Composer')}
        </span>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 6rem)',
            lineHeight: 1,
            background: 'linear-gradient(180deg, #F6E9BE 0%, #D9B45E 55%, #8A6A26 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {composerName}
        </h2>
      </div>

      {/* stacked cover panels — peel away left to reveal the name above */}
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(8,8,10,${1 - i * 0.06})`,
            zIndex: 10 - i,
            transform: peeled ? 'translateX(-100%)' : 'translateX(0)',
            transition: `transform 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 0.15}s`,
          }}
        />
      ))}

      {/* flying short mark on the very top layer */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: markIn ? 1 : 0,
          transform: markIn ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'opacity 0.8s ease, transform 0.8s ease',
          zIndex: 20,
        }}
      >
        <span
          className="font-display"
          style={{ fontSize: 'clamp(3rem, 10vw, 8rem)', color: 'var(--accent-color)', letterSpacing: '-0.02em' }}
        >
          {firstName}
        </span>
      </div>
    </section>
  );
}
