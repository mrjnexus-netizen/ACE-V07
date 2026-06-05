type ThemeId = "ONYX" | "MINIMAL" | "CYBER";

const themes: Record<ThemeId, Record<string, string>> = {
  ONYX: {
    "--background-color": "#1a1a1a",
    "--text-color": "#f2f2f2",
    "--primary-color": "#007bff",
    "--font-cormorant": "\"Cormorant Garamond\", serif",
    "--font-playfair": "\"Playfair Display\", serif",
    "--font-ebgaramond": "\"EB Garamond\", serif",
    "--font-spacemono": "\"Space Mono\", monospace",
    "--font-ibmplexmono": "\"IBM Plex Mono\", monospace",
    "--font-lora": "\"Lora\", serif",
    "--font-notosansjp": "\"Noto Sans JP\", sans-serif",
    "--font-notosanskr": "\"Noto Sans KR\", sans-serif",
    "--font-notosanssc": "\"Noto Sans SC\", sans-serif",
  },
  MINIMAL: {
    "--background-color": "#ffffff",
    "--text-color": "#333333",
    "--primary-color": "#007bff",
    "--font-cormorant": "\"Cormorant Garamond\", serif",
    "--font-playfair": "\"Playfair Display\", serif",
    "--font-ebgaramond": "\"EB Garamond\", serif",
    "--font-spacemono": "\"Space Mono\", monospace",
    "--font-ibmplexmono": "\"IBM Plex Mono\", monospace",
    "--font-lora": "\"Lora\", serif",
    "--font-notosansjp": "\"Noto Sans JP\", sans-serif",
    "--font-notosanskr": "\"Noto Sans KR\", sans-serif",
    "--font-notosanssc": "\"Noto Sans SC\", sans-serif",
  },
  CYBER: {
    "--background-color": "#000000",
    "--text-color": "#00ff00",
    "--primary-color": "#00ffff",
    "--font-cormorant": "\"Cormorant Garamond\", serif",
    "--font-playfair": "\"Playfair Display\", serif",
    "--font-ebgaramond": "\"EB Garamond\", serif",
    "--font-spacemono": "\"Space Mono\", monospace",
    "--font-ibmplexmono": "\"IBM Plex Mono\", monospace",
    "--font-lora": "\"Lora\", serif",
    "--font-notosansjp": "\"Noto Sans JP\", sans-serif",
    "--font-notosanskr": "\"Noto Sans KR\", sans-serif",
    "--font-notosanssc": "\"Noto Sans SC\", sans-serif",
  },
};

export const getThemeVariables = (themeId: ThemeId): Record<string, string> => {
  return themes[themeId];
};

export const interpolateColor = (
  from: string,
  to: string,
  progress: number
): string => {
  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return ( "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
  };

  const [fromR, fromG, fromB] = hexToRgb(from);
  const [toR, toG, toB] = hexToRgb(to);

  const r = Math.round(fromR + (toR - fromR) * progress);
  const g = Math.round(fromG + (toG - fromG) * progress);
  const b = Math.round(fromB + (toB - fromB) * progress);

  return rgbToHex(r, g, b);
};

export const applyTheme = (themeId: ThemeId) => {
  const root = document.documentElement;
  const newVars = getThemeVariables(themeId);

  requestAnimationFrame(() => {
    root.style.setProperty("transition", "opacity 600ms ease-in-out");
    root.style.setProperty("opacity", "0");

    setTimeout(() => {
      for (const [key, value] of Object.entries(newVars)) {
        root.style.setProperty(key, value);
      }
      root.style.setProperty("opacity", "1");
    }, 0);

    setTimeout(() => {
      root.style.removeProperty("transition");
      root.style.removeProperty("opacity");
    }, 600);
  });
};

// FOUC prevention: inject critical CSS variables synchronously before React hydration
export const injectCriticalCssVariables = (themeId: ThemeId) => {
  const root = document.documentElement;
  const vars = getThemeVariables(themeId);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
};
