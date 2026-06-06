import { useEffect, useState, useRef } from 'react';

export function useInertia<T extends number | [number, number]>(
  target: T,
  factor: number,
  threshold = 0.001
): T {
  const isArray = Array.isArray(target);
  
  // Set up state for current value
  const [current, setCurrent] = useState<T>(target);
  
  // Refs to track latest values safely inside the animation loop
  const targetRef = useRef<T>(target);
  const currentRef = useRef<T>(target);
  const rAFRef = useRef<number | null>(null);

  // Update targetRef when target changes
  useEffect(() => {
    targetRef.current = target;
    
    // Start or restart loop when target changes
    const startLoop = () => {
      if (rAFRef.current !== null) return;

      const loop = () => {
        const tgt = targetRef.current;
        const cur = currentRef.current;

        let changed = false;
        let next: any;

        if (Array.isArray(tgt) && Array.isArray(cur)) {
          const nextVal: [number, number] = [
            cur[0] + (tgt[0] - cur[0]) * factor,
            cur[1] + (tgt[1] - cur[1]) * factor,
          ];

          const diffX = Math.abs(tgt[0] - nextVal[0]);
          const diffY = Math.abs(tgt[1] - nextVal[1]);

          if (diffX < threshold && diffY < threshold) {
            next = tgt; // snap to exact target
          } else {
            next = nextVal;
            changed = true;
          }
        } else if (typeof tgt === 'number' && typeof cur === 'number') {
          const nextVal = cur + (tgt - cur) * factor;
          const diff = Math.abs(tgt - nextVal);

          if (diff < threshold) {
            next = tgt; // snap to exact target
          } else {
            next = nextVal;
            changed = true;
          }
        }

        if (next !== undefined) {
          currentRef.current = next;
          setCurrent(next);
        }

        if (changed) {
          rAFRef.current = requestAnimationFrame(loop);
        } else {
          rAFRef.current = null;
        }
      };

      rAFRef.current = requestAnimationFrame(loop);
    };

    startLoop();
  }, [target, factor, threshold]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current);
      }
    };
  }, []);

  return current;
}

export default useInertia;
