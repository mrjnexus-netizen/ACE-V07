import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type ThemeId = 'onyx' | 'cyber' | 'minimal';
type Locale = 'en' | 'es' | 'fr' | 'zh' | 'ja' | 'ko';

interface ChromaticContextType {
  themeId: ThemeId;
  theme: ThemeId;
  switchTheme: (theme: ThemeId) => void;
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

const ChromaticContext = createContext<ChromaticContextType | undefined>(undefined);

export const ChromaticProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeId] = useState<ThemeId>('onyx');

  useEffect(() => {
    const stored = localStorage.getItem('ace-theme') as ThemeId | null;
    if (stored && ['onyx', 'cyber', 'minimal'].includes(stored)) {
      setThemeId(stored);
    } else {
      const random = Math.random();
      const defaultTheme: ThemeId = random < 0.33 ? 'onyx' : random < 0.66 ? 'cyber' : 'minimal';
      setThemeId(defaultTheme);
    }
  }, []);

  const applyTheme = useCallback((theme: ThemeId) => {
    const vars = THEME_VARIABLES[theme];
    const root = document.documentElement;

    // Cross-fade: set opacity to 0, apply vars, then fade in
    root.style.transition = 'opacity 600ms ease';
    root.style.opacity = '0';

    setTimeout(() => {
      Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
      root.setAttribute('data-theme', theme);
      root.style.opacity = '1';
    }, 50);
  }, []);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId, applyTheme]);

  const switchTheme = useCallback((theme: ThemeId) => {
    setThemeId(theme);
    localStorage.setItem('ace-theme', theme);
  }, []);

  return (
    <ChromaticContext.Provider value={{ themeId, theme: themeId, switchTheme }}>
      {children}
    </ChromaticContext.Provider>
  );
};

export const useChromatic = () => {
  const context = useContext(ChromaticContext);
  if (!context) throw new Error('useChromatic must be used within ChromaticProvider');
  return context;
};
