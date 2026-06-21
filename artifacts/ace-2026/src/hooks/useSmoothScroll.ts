import Lenis from '@studio-freight/lenis';
import { useEffect, useRef, useState, useCallback } from 'react';

interface SmoothScrollOptions {
  duration: number;
  easing: (t: number) => number;
  smoothWheel: boolean;
}

// Global smooth scroll built on Lenis 1.x.
// Safe by design: native scrolling is never disabled, so if Lenis fails to start
// (or prefers-reduced-motion is set) the page still scrolls normally.
const useSmoothScroll = () => {
  const lenisRef = useRef<Lenis | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollSubscribers = useRef<Set<(scroll: number) => void>>(new Set());

  const subscribeToScroll = useCallback((callback: (scroll: number) => void) => {
    scrollSubscribers.current.add(callback);
    return () => {
      scrollSubscribers.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const subs = scrollSubscribers.current;
    let lenis: Lenis | null = null;
    let rafId = 0;

    try {
      const options: SmoothScrollOptions = {
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      };
      lenis = new Lenis(options as any);
      lenisRef.current = lenis;
      // Expose the instance globally so overlays/modals can stop/start the
      // smooth-scroll engine (it ignores body overflow:hidden on its own).
      (window as unknown as { __lenis?: Lenis | null }).__lenis = lenis;

      const onScroll = ({ scroll }: { scroll: number }) => {
        setScrollPosition(scroll);
        subs.forEach((callback) => callback(scroll));
      };
      lenis.on('scroll', onScroll);

      const animate = (time: number) => {
        lenisRef.current?.raf(time);
        rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);
    } catch {
      // Native scrolling remains fully functional if Lenis cannot initialise.
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      lenisRef.current?.destroy();
      lenisRef.current = null;
      (window as unknown as { __lenis?: Lenis | null }).__lenis = null;
      subs.clear();
    };
  }, []);

  return { lenis: lenisRef.current, scrollPosition, subscribeToScroll };
};

const useScrollPosition = (callback: (scroll: number) => void) => {
  const { subscribeToScroll } = useSmoothScroll();

  useEffect(() => {
    return subscribeToScroll(callback);
  }, [callback, subscribeToScroll]);
};

export { useSmoothScroll, useScrollPosition };
