import { useState, useEffect, useRef } from 'react';

export interface PerformanceProfile {
  isLowEnd: boolean;
  particleCount: number;
  enableEffects: boolean;
}

const LOW_PARTICLE_COUNT = 500;
const NORMAL_PARTICLE_COUNT_MOBILE = 2000;
const NORMAL_PARTICLE_COUNT_TABLET = 4000;
const NORMAL_PARTICLE_COUNT_DESKTOP = 8000;
const FPS_CHECK_INTERVAL_MS = 3000;
const FPS_THRESHOLD = 30;

function getDefaultParticleCount(isLowEnd: boolean): number {
  if (isLowEnd) return LOW_PARTICLE_COUNT;
  const w = window.innerWidth;
  if (w < 768) return NORMAL_PARTICLE_COUNT_MOBILE;
  if (w < 1024) return NORMAL_PARTICLE_COUNT_TABLET;
  return NORMAL_PARTICLE_COUNT_DESKTOP;
}

export function usePerformanceGuard(): PerformanceProfile {
  const hardwareLowEnd =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 4;

  const [profile, setProfile] = useState<PerformanceProfile>({
    isLowEnd: hardwareLowEnd,
    particleCount: getDefaultParticleCount(hardwareLowEnd),
    enableEffects: !hardwareLowEnd,
  });

  const frameCountRef = useRef(0);
  const lastCheckRef = useRef(performance.now());
  const animRef = useRef<number>(0);
  const consecutiveLowFpsRef = useRef(0);

  useEffect(() => {
    if (profile.isLowEnd) return;

    const monitor = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastCheckRef.current;

      if (elapsed >= FPS_CHECK_INTERVAL_MS) {
        const fps = (frameCountRef.current / elapsed) * 1000;
        frameCountRef.current = 0;
        lastCheckRef.current = now;

        if (fps < FPS_THRESHOLD) {
          consecutiveLowFpsRef.current++;
          if (consecutiveLowFpsRef.current >= 3) {
            setProfile({
              isLowEnd: true,
              particleCount: LOW_PARTICLE_COUNT,
              enableEffects: false,
            });
            cancelAnimationFrame(animRef.current);
            return;
          }
        } else {
          consecutiveLowFpsRef.current = 0;
        }
      }

      animRef.current = requestAnimationFrame(monitor);
    };

    animRef.current = requestAnimationFrame(monitor);
    return () => cancelAnimationFrame(animRef.current);
  }, [profile.isLowEnd]);

  return profile;
}