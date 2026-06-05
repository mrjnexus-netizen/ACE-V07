import Vibrant from "node-vibrant";

export interface VibrantPalette {
  vibrant?: string | undefined;
  muted?: string | undefined;
  darkVibrant?: string | undefined;
  darkMuted?: string | undefined;
  lightVibrant?: string | undefined;
  lightMuted?: string | undefined;
}

type ThemeId = "ONYX" | "MINIMAL" | "CYBER";

// Helper to convert hex to HSL
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

// Helper to convert HSL to hex
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

export const extractPalette = async (
  imageUrl: string
): Promise<VibrantPalette | null> => {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();
    return {
      vibrant: palette.Vibrant?.getHex(),
      muted: palette.Muted?.getHex(),
      darkVibrant: palette.DarkVibrant?.getHex(),
      darkMuted: palette.DarkMuted?.getHex(),
      lightVibrant: palette.LightVibrant?.getHex(),
      lightMuted: palette.LightMuted?.getHex(),
    };
  } catch (error) {
    return null;
  }
};

export const checkColorClash = (
  extractedHex: string,
  themeAccentHex: string
): boolean => {
  try {
    const hslExtracted = hexToHsl(extractedHex);
    const hslTheme = hexToHsl(themeAccentHex);
    const hueDiff = Math.abs(hslExtracted.h - hslTheme.h);
    const wrappedHueDiff = Math.min(hueDiff, 360 - hueDiff);
    return wrappedHueDiff < 30;
  } catch {
    return false;
  }
};

export const applyDynamicAccent = (
  palette: VibrantPalette | null,
  themeId: ThemeId
): void => {
  const root = document.documentElement;

  if (!palette || !palette.vibrant) {
    root.style.removeProperty("--dynamic-accent");
    return;
  }

  // Define fallback theme accents
  const themeAccents: Record<ThemeId, string> = {
    ONYX: "#007bff",
    MINIMAL: "#007bff",
    CYBER: "#00ffff",
  };

  const themeAccent = themeAccents[themeId] || "#007bff";
  let colorToApply = palette.vibrant;

  if (checkColorClash(colorToApply, themeAccent)) {
    // On clash: desaturate extracted color before applying as --dynamic-accent
    const hsl = hexToHsl(colorToApply);
    const desaturatedHex = hslToHex(hsl.h, Math.max(0, hsl.s - 40), hsl.l);
    colorToApply = desaturatedHex;
  }

  root.style.setProperty("--dynamic-accent", colorToApply);
};
