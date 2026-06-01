import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { ThemeId, ThemeConfig, Locale } from '../types';

// Define theme configurations based on Section 2
const THEMES: Record<ThemeId, ThemeConfig> = {
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
      '--font-display': '\'Cormorant Garamond\', \'Playfair Display\', serif',
      '--font-body': '\'EB Garamond\', Georgia, serif',
      '--font-mono': '\'Space Mono\', \'Courier New\', monospace',
      '--font-cjk': '\'Noto Sans JP\', \'Noto Sans SC\', sans-serif',
      '--letter-spacing-base': '0.08em',
      '--letter-spacing-hero': 'scroll-linked (0.05em to 0.30em)',
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
      '--font-display': '\'Space Mono\', \'IBM Plex Mono\', monospace',
      '--font-body': '\'IBM Plex Mono\', \'Courier New\', monospace',
      '--font-mono': '\'Space Mono\', monospace',
      '--font-cjk': '\'Noto Sans JP\', \'Noto Sans SC\', sans-serif',
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
      '--font-display': '\'Playfair Display\', \'Cormorant Garamond\', serif',
      '--font-body': '\'Lora\', Georgia, serif',
      '--font-mono': '\'Space Mono\', monospace',
      '--font-cjk': '\'Noto Sans JP\', \'Noto Sans SC\', sans-serif',
      '--letter-spacing-base': '0.04em',
      '--letter-spacing-hero': '0.15em',
      '--line-height-base': '1.8',
      '--line-height-cjk': '2.0',
    },
  },
};

interface ChromaticContextType {
  theme: ThemeConfig;
  switchTheme: (themeId: ThemeId) => void;
  applyLocaleTypography: (locale: Locale, theme: ThemeConfig) => void;
}

const ChromaticContext = createContext<ChromaticContextType | undefined>(undefined);

export const ChromaticProvider = ({ children }: { children: ReactNode }) => {
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() => {
    const storedTheme = localStorage.getItem('ace-theme');
    return (storedTheme as ThemeId) || THEMES.onyx.id; // Default to 'onyx'
  });

  const theme = THEMES[currentThemeId];

  useEffect(() => {
    localStorage.setItem('ace-theme', currentThemeId);
    applyTheme(theme);
  }, [currentThemeId, theme]);

  const applyTheme = (selectedTheme: ThemeConfig) => {
    const root = document.documentElement;
    Object.entries(selectedTheme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    root.setAttribute('data-theme', selectedTheme.id);
  };

  const applyLocaleTypography = (locale: Locale, selectedTheme: ThemeConfig) => {
    const root = document.documentElement;
    let fontDisplay = selectedTheme.variables['--font-display'] ?? null;
    let fontBody = selectedTheme.variables['--font-body'] ?? null;
    let fontMono = selectedTheme.variables['--font-mono'] ?? null;
    let letterSpacingBase = selectedTheme.variables['--letter-spacing-base'] ?? null;
    let lineHeightBase = selectedTheme.variables['--line-height-base'] ?? null;
    let fontCjk = selectedTheme.variables['--font-cjk'] ?? null;
    let lineHeightCjk = selectedTheme.variables['--line-height-cjk'] ?? null;

    switch (locale) {
      case 'zh':
        fontCjk = '\'Noto Sans SC\', sans-serif';
        letterSpacingBase = '0.05em';
        lineHeightBase = lineHeightCjk;
        break;
      case 'ja':
        fontCjk = '\'Noto Sans JP\', sans-serif';
        letterSpacingBase = '0.03em';
        lineHeightBase = lineHeightCjk;
        break;
      case 'ko':
        fontCjk = '\'Noto Sans KR\', sans-serif';
        letterSpacingBase = '0.04em';
        lineHeightBase = lineHeightCjk;
        break;
      case 'es':
      case 'fr':
        lineHeightBase = `calc(${lineHeightBase} * 1.05)`; // +5% for accent character clearance
        break;
      default:
        // English and other LTR languages, use base values
        break;
    }

    root.style.setProperty('--font-display', fontDisplay);
    root.style.setProperty('--font-body', fontBody);
    root.style.setProperty('--font-mono', fontMono);
    root.style.setProperty('--font-cjk', fontCjk);
    root.style.setProperty('--letter-spacing-base', letterSpacingBase);
    root.style.setProperty('--line-height-base', lineHeightBase);
    root.style.setProperty('--line-height-cjk', lineHeightCjk);

    root.setAttribute('data-locale', locale);
    root.setAttribute('lang', locale);
    root.setAttribute('dir', 'ltr');
  };

  const switchTheme = (themeId: ThemeId) => {
    setCurrentThemeId(themeId);
  };

  const memoizedContextValue = useMemo(() => ({
    theme,
    switchTheme,
    applyLocaleTypography,
  }), [theme, switchTheme, applyLocaleTypography]);

  return (
    <ChromaticContext.Provider value={memoizedContextValue}>
      {children}
    </ChromaticContext.Provider>
  );
};

export const useChromatic = () => {
  const context = useContext(ChromaticContext);
  if (context === undefined) {
    throw new Error('useChromatic must be used within a ChromaticProvider');
  }
  return context;
};
