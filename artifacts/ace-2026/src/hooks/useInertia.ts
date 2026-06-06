import { useRef, useState, useEffect } from 'react';

export function useInertia<T extends number | [number, number]>(
  target: T,
  factor: number,
  threshold = 0.001
): T {
  const currentRef = useRef<T>(target);
  const rafRef = useRef<number | null>(null);
  const [value, setValue] = useState<T>(target);

  useEffect(() => {
    const animate = () => {
      const current = currentRef.current;

      if (typeof current === 'number' && typeof target === 'number') {
        const next = current + (target - current) * factor;
        currentRef.current = next as T;
        setValue(next as T);

        if (Math.abs(target - next) >= threshold) {
          rafRef.current = requestAnimationFrame(animate);
        }
      } else if (Array.isArray(current) && Array.isArray(target)) {
        const next: [number, number] = [
          current[0] + (target[0] - current[0]) * factor,
          current[1] + (target[1] - current[1]) * factor,
        ];
        currentRef.current = next as T;
        setValue(next as T);

        if (
          Math.abs(target[0] - next[0]) >= threshold ||
          Math.abs(target[1] - next[1]) >= threshold
        ) {
          rafRef.current = requestAnimationFrame(animate);
        }
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, factor, threshold]);

  return value;
}

export default useInertia;
