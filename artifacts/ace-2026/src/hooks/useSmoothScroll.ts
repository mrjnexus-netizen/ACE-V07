import Lenis from '@studio-freight/lenis';
import { useEffect, useRef, useState, useCallback } from 'react';

// Use type assertion / any for option passing to Lenis if types don't match, 
// to satisfy exact requirements.
interface ExtendedLenisOptions {
  duration?: number;
  easing?: (t: number) => number;
  direction?: 'vertical' | 'horizontal';
  smooth?: boolean;
  smoothTouch?: boolean;
}

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
    const options: ExtendedLenisOptions = {
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      smooth: true,
      smoothTouch: false,
    };

    const lenis = new Lenis(options as any);
    lenisRef.current = lenis;

    const onScroll = ({ scroll }: { scroll: number }) => {
      setScrollPosition(scroll);
      scrollSubscribers.current.forEach((callback) => callback(scroll));
    };

    lenis.on('scroll', onScroll);

    let rafId: number;
    const animate = (time: DOMHighResTimeStamp) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    // Disable native scroll
    document.body.style.overflow = 'hidden';

    return () => {
      lenis.destroy();
      cancelAnimationFrame(rafId);
      document.body.style.overflow = ''; // Re-enable native scroll
      scrollSubscribers.current.clear();
    };
  }, []);

  return { lenis: lenisRef.current, scrollPosition, subscribeToScroll };
};

const useScrollPosition = (callback: (scroll: number) => void) => {
  const { subscribeToScroll } = useSmoothScroll();

  useEffect(() => {
    if (subscribeToScroll) {
      return subscribeToScroll(callback);
    }
  }, [callback, subscribeToScroll]);
};

export { useSmoothScroll, useScrollPosition };
