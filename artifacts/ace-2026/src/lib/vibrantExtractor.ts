import type { VibrantPalette } from '../types';

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = (h / 6) * 360;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function resolveClash(extracted: string, themeAccent: string): string {
  const extHsl = hexToHsl(extracted);
  const accHsl = hexToHsl(themeAccent);
  if (!extHsl || !accHsl) return extracted;
  const diff = Math.abs(extHsl.h - accHsl.h);
  const angleDiff = Math.min(diff, 360 - diff);
  if (angleDiff < 30) {
    return hslToHex(extHsl.h, extHsl.s * 0.4, extHsl.l);
  }
  return extracted;
}

async function sampleDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if ((a ?? 0) > 128) {
            rSum += data[i] ?? 0;
            gSum += data[i + 1] ?? 0;
            bSum += data[i + 2] ?? 0;
            count++;
          }
        }
        if (count === 0) { resolve(null); return; }
        const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, '0');
        resolve(`#${toHex(rSum)}${toHex(gSum)}${toHex(bSum)}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export async function extractPalette(imageUrl: string): Promise<VibrantPalette | null> {
  if (!imageUrl) return null;

  const themeAccent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#D4AF37';

  try {
    const VibrantLib = (window as unknown as Record<string, unknown>).Vibrant as
      | { from: (src: string) => { getPalette: () => Promise<Record<string, { hex: string } | null>> } }
      | undefined;

    if (VibrantLib) {
      const palette = await VibrantLib.from(imageUrl).getPalette();
      const get = (key: string): string => {
        const swatch = palette[key];
        if (!swatch) return themeAccent;
        return resolveClash(swatch.hex, themeAccent);
      };
      return {
        vibrant: get('Vibrant'),
        muted: get('Muted'),
        darkVibrant: get('DarkVibrant'),
        darkMuted: get('DarkMuted'),
        lightVibrant: get('LightVibrant'),
        lightMuted: get('LightMuted'),
      };
    }

    const dominant = await sampleDominantColor(imageUrl);
    if (!dominant) return null;
    const safe = resolveClash(dominant, themeAccent);
    return {
      vibrant: safe,
      muted: safe,
      darkVibrant: safe,
      darkMuted: safe,
      lightVibrant: safe,
      lightMuted: safe,
    };
  } catch (err) {
    console.warn('[vibrantExtractor] Failed to extract palette:', err);
    return null;
  }
}