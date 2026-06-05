import { useState, useEffect } from "react";

type HardwareTier = "high" | "medium" | "low";

export const detectHardwareTier = (): HardwareTier => {
  const concurrency = navigator.hardwareConcurrency || 0;
  const deviceMemory = (navigator as any).deviceMemory || 0;

  if (concurrency >= 8) {
    return "high";
  } else if (concurrency >= 4) {
    return "medium";
  } else {
    if (deviceMemory < 4) {
      return "low";
    }
    return "low";
  }
};

const getParticleCount = (tier: HardwareTier): number => {
  switch (tier) {
    case "high":
      return 8000;
    case "medium":
      return 4000;
    case "low":
      return 2000;
  }
};

const shouldEnableEffects = (tier: HardwareTier): boolean => {
  return tier === "high" || tier === "medium";
};

export const usePerformanceGuard = () => {
  const [tier, setTier] = useState<HardwareTier>(detectHardwareTier());
  const [particleCount, setParticleCount] = useState<number>(
    getParticleCount(tier)
  );
  const [enableEffects, setEnableEffects] = useState<boolean>(
    shouldEnableEffects(tier)
  );
  const [enableBloom, setEnableBloom] = useState<boolean>(enableEffects); // Assuming enableBloom is tied to enableEffects initially

  useEffect(() => {
    let frameTimes: number[] = [];
    let lastFrameTime = performance.now();

    const monitorFps = () => {
      const now = performance.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;

      frameTimes.push(1000 / deltaTime);
      frameTimes = frameTimes.slice(-180); // Keep last 3 seconds (60fps * 3s)

      const avgFps = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

      if (avgFps < 30 && tier !== "low") {
        setTier("low");
        setParticleCount(getParticleCount("low"));
        setEnableEffects(shouldEnableEffects("low"));
        setEnableBloom(false); // Disable bloom on low tier
        document.documentElement.style.setProperty("backdrop-filter", "none");
        // Disable scan lines - specific implementation would depend on how scan lines are rendered
        // Use CSS dissolve instead of 3D shatter - specific implementation would depend on how these are rendered
      }

      requestAnimationFrame(monitorFps);
    };

    // We need to check if window is defined to avoid issues during SSR
    if (typeof window !== 'undefined') {
      requestAnimationFrame(monitorFps);
    }

  }, [tier]);

  return { tier, particleCount, enableEffects, enableBloom };
};
