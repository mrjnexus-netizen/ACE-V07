import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';

type ThemeId = 'onyx' | 'cyber' | 'minimal';
type Locale = 'en' | 'es' | 'fr' | 'zh' | 'ja' | 'ko';

interface LanguageWorld {
  accent: string;
  accent2: string;
  accentRgb: string;
  mesh: string;
  surface?: string;
  surfaceRgb?: string;
}

interface ChromaticContextType {
  themeId: ThemeId;
  theme: ThemeId;
  switchTheme: (theme: ThemeId) => void;
  languageWorld: Locale | null;
  applyLanguageWorld: (locale: Locale) => void;
  applyGenreSoul: (genre: string | null) => void;
}

const THEME_VARIABLES: Record<ThemeId, Record<string, string>> = {
  onyx: {
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
    '--line-height-base': '1.7',
    '--line-height-cjk': '1.9',
  },
  cyber: {
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
    '--line-height-base': '1.6',
    '--line-height-cjk': '1.85',
  },
  minimal: {
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
    '--line-height-base': '1.8',
    '--line-height-cjk': '2.0',
  },
};

// v7 motion tokens - cinematic easing + durations, injected with every theme.
const MOTION_TOKENS: Record<string, string> = {
  '--ease-cine': 'cubic-bezier(0.16, 1, 0.3, 1)',
  '--ease-fluid': 'cubic-bezier(0.65, 0, 0.35, 1)',
  '--ease-v6': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  '--dur-fast': '450ms',
  '--dur-base': '800ms',
  '--dur-slow': '1200ms',
};

// v7 layered color model - Layer B: per-language color worlds.
// Exported (2026-07-10) so VoronoiPortraitFilter.tsx can tint its shader
// with the SAME per-language accent colors used everywhere else, rather
// than duplicating this table — single source of truth for "this
// language's color".
export const LANGUAGE_WORLDS: Record<Locale, LanguageWorld> = {
  en: { accent: '#D4AF37', accent2: '#F3D77E', accentRgb: '212, 175, 55', mesh: '#F3D77E' },
  ja: { accent: '#3A7BFF', accent2: '#FF3B6B', accentRgb: '58, 123, 255', mesh: '#4D8BFF', surface: '#070912', surfaceRgb: '7, 9, 18' },
  ko: { accent: '#FF4FD8', accent2: '#B07BFF', accentRgb: '255, 79, 216', mesh: '#FF6FE0', surface: '#0C0610', surfaceRgb: '12, 6, 16' },
  zh: { accent: '#E8232B', accent2: '#FFCF6B', accentRgb: '232, 35, 43', mesh: '#FF5A4D', surface: '#0E0606', surfaceRgb: '14, 6, 6' },
  es: { accent: '#FF7A2F', accent2: '#FFD23F', accentRgb: '255, 122, 47', mesh: '#FF9A3F', surface: '#0F0805', surfaceRgb: '15, 8, 5' },
  fr: { accent: '#C9A66B', accent2: '#E8D9B5', accentRgb: '201, 166, 107', mesh: '#D8C290', surface: '#070810', surfaceRgb: '7, 8, 16' },
};

// v7 layered color model - Layer C: transient genre souls (tint mesh on track hover/play).
const GENRE_SOULS: Record<string, string> = {
  cinematic: '#F3D77E',
  orchestral: '#F3D77E',
  ambient: '#37D4A3',
  gaming: '#FF4FD8',
  electronic: '#FF4FD8',
  film: '#E8232B',
  animation: '#9B5CFF',
};

// Apply theme synchronously before React renders - prevents flash.
function applyThemeSync(theme: ThemeId): void {
  const vars = THEME_VARIABLES[theme];
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  Object.entries(MOTION_TOKENS).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  // Default mesh color tracks the theme accent2 until a language world overrides it.
  root.style.setProperty('--mesh-color', vars['--accent2-color']);
  root.setAttribute('data-theme', theme);
}

// Apply a per-language color world on top of the active base theme (Layer B).
function applyLanguageWorldVars(locale: Locale, themeId: ThemeId): void {
  const world = LANGUAGE_WORLDS[locale];
  if (!world) return;
  const root = document.documentElement;
  root.style.setProperty('--accent-color', world.accent);
  root.style.setProperty('--accent2-color', world.accent2);
  root.style.setProperty('--accent-rgb', world.accentRgb);
  root.style.setProperty('--mesh-color', world.mesh);
  // Surface warmth only on dark themes; the ivory minimal theme keeps its surface.
  if (themeId !== 'minimal' && world.surface) {
    root.style.setProperty('--surface-color', world.surface);
    if (world.surfaceRgb) root.style.setProperty('--surface-rgb', world.surfaceRgb);
  }
  root.setAttribute('data-language-world', locale);
}

// Run immediately on module load.
const _storedTheme = localStorage.getItem('ace-theme') as ThemeId | null;
const _validThemes: ThemeId[] = ['onyx', 'cyber', 'minimal'];
const _initialTheme: ThemeId = (_storedTheme && _validThemes.includes(_storedTheme))
  ? _storedTheme
  : 'onyx';
applyThemeSync(_initialTheme);
if (!_storedTheme) localStorage.setItem('ace-theme', _initialTheme);

const ChromaticContext = createContext<ChromaticContextType | undefined>(undefined);

export const ChromaticProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeId] = useState<ThemeId>(_initialTheme);
  const [languageWorld, setLanguageWorld] = useState<Locale | null>(null);
  const languageWorldRef = useRef<Locale | null>(null);

  const applyLanguageWorld = useCallback((locale: Locale) => {
    languageWorldRef.current = locale;
    setLanguageWorld(locale);
    const root = document.documentElement;
    root.style.transition = 'background-color 800ms ease';
    applyLanguageWorldVars(locale, themeId);
  }, [themeId]);

  const applyGenreSoul = useCallback((genre: string | null) => {
    const root = document.documentElement;
    if (!genre) {
      root.style.removeProperty('--genre-soul');
      return;
    }
    const color = GENRE_SOULS[genre.toLowerCase()];
    if (color) root.style.setProperty('--genre-soul', color);
  }, []);

  const switchTheme = useCallback((theme: ThemeId) => {
    const root = document.documentElement;
    root.style.transition = 'opacity 600ms ease';
    root.style.opacity = '0';
    requestAnimationFrame(() => {
      setTimeout(() => {
        applyThemeSync(theme);
        // Re-apply the active language world so its accent survives a base-theme switch.
        if (languageWorldRef.current) {
          applyLanguageWorldVars(languageWorldRef.current, theme);
        }
        setThemeId(theme);
        localStorage.setItem('ace-theme', theme);
        root.style.opacity = '1';
      }, 300);
    });
  }, []);

  useEffect(() => {
    // Keep the language world consistent if the theme changes by other means.
    if (languageWorldRef.current) {
      applyLanguageWorldVars(languageWorldRef.current, themeId);
    }
  }, [themeId]);

  return (
    <ChromaticContext.Provider
      value={{ themeId, theme: themeId, switchTheme, languageWorld, applyLanguageWorld, applyGenreSoul }}
    >
      {children}
    </ChromaticContext.Provider>
  );
};

export const useChromatic = () => {
  const context = useContext(ChromaticContext);
  if (!context) throw new Error('useChromatic must be used within ChromaticProvider');
  return context;
};