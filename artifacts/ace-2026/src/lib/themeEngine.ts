import type { ThemeId, ThemeConfig, Locale } from '../types';
import { applyLocaleTypography } from './localeEngine';

const STORAGE_KEY = 'ace-theme';

export const THEMES: Record<ThemeId, ThemeConfig> = {
  onyx: {
    id: 'onyx',
    variables: {
      '--surface-color': '#080808',
      '--surface2-color': '#0F0F0F',
      '--surface3-color': '#1A1A1A',
      '--surface4-color': '#242424',
      '--accent-color': '#D4AF37',
      '--accent2-color': '#B8960C',
      '--accent-rgb': '212, 175, 55',
      '--surface-rgb': '8, 8, 8',
      '--text-color': '#F5F5F0',
      '--text-muted-color': '#888880',
      '--text-dim-color': '#444440',
      '--border-color': '#2A2A2A',
      '--border-accent-color': '#D4AF3740',
      '--glow-color': '#D4AF3720',
      '--font-display': "'Cormorant Garamond', 'Playfair Display', serif",
      '--font-body': "'EB Garamond', Georgia, serif",
      '--font-mono': "'Space Mono', 'Courier New', monospace",
      '--font-cjk': "'Noto Sans JP', 'Noto Sans SC', sans-serif",
      '--letter-spacing-base': '0.08em',
      '--letter-spacing-hero': '0.05em',
      '--line-height-base': '1.7',
      '--line-height-cjk': '1.9',
    },
  },
  cyber: {
    id: 'cyber',
    variables: {
      '--surface-color': '#0A0A0F',
      '--surface2-color': '#12131A',
      '--surface3-color': '#1E1F26',
      '--surface4-color': '#2C2E35',
      '--accent-color': '#00F5D4',
      '--accent2-color': '#00C4AA',
      '--accent-rgb': '0, 245, 212',
      '--surface-rgb': '10, 10, 15',
      '--text-color': '#E8E9F0',
      '--text-muted-color': '#6B6C75',
      '--text-dim-color': '#3A3B44',
      '--border-color': '#2A2B33',
      '--border-accent-color': '#00F5D440',
      '--glow-color': '#00F5D415',
      '--font-display': "'Space Mono', 'IBM Plex Mono', monospace",
      '--font-body': "'IBM Plex Mono', 'Courier New', monospace",
      '--font-mono': "'Space Mono', monospace",
      '--font-cjk': "'Noto Sans JP', 'Noto Sans SC', sans-serif",
      '--letter-spacing-base': '0.12em',
      '--letter-spacing-hero': '0.20em',
      '--line-height-base': '1.6',
      '--line-height-cjk': '1.85',
    },
  },
  minimal: {
    id: 'minimal',
    variables: {
      '--surface-color': '#F9F9F7',
      '--surface2-color': '#F2F2F0',
      '--surface3-color': '#EAEAE8',
      '--surface4-color': '#E0E0DE',
      '--accent-color': '#0A0A08',
      '--accent2-color': '#3D3D3A',
      '--accent-rgb': '10, 10, 8',
      '--surface-rgb': '249, 249, 247',
      '--text-color': '#0A0A08',
      '--text-muted-color': '#7A7A75',
      '--text-dim-color': '#C0C0BC',
      '--border-color': '#D8D8D5',
      '--border-accent-color': '#0A0A0830',
      '--glow-color': '#0A0A0808',
      '--font-display': "'Playfair Display', 'Cormorant Garamond', serif",
      '--font-body': "'Lora', Georgia, serif",
      '--font-mono': "'Space Mono', monospace",
      '--font-cjk': "'Noto Sans JP', 'Noto Sans SC', sans-serif",
      '--letter-spacing-base': '0.04em',
      '--letter-spacing-hero': '0.15em',
      '--line-height-base': '1.8',
      '--line-height-cjk': '2.0',
    },
  },
} as const;

export function selectRandomTheme(): ThemeId {
  const ids: ThemeId[] = ['onyx', 'cyber', 'minimal'];
  const selected = ids[Math.floor(Math.random() * ids.length)] ?? 'onyx';
  try { localStorage.setItem(STORAGE_KEY, selected); } catch { /* silent */ }
  return selected;
}

export function getStoredTheme(): ThemeId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'onyx' || stored === 'cyber' || stored === 'minimal') return stored;
  } catch { /* silent */ }
  return null;
}

export function applyTheme(themeId: ThemeId, locale: Locale): void {
  const theme = THEMES[themeId];
  const root = document.documentElement;

  root.style.transition = 'opacity 600ms ease';
  root.style.opacity = '0';

  const apply = () => {
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-locale', locale);
    root.setAttribute('lang', locale);
    root.setAttribute('dir', 'ltr');
    applyLocaleTypography(locale, theme);
    root.style.opacity = '1';
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
}