import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import { ThemeId, ThemeConfig, Locale } from '../types';

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
      '--font-display': "'Cormorant Garamond', 'Playfair Display', serif",
      '--font-body': "'EB Garamond', Georgia, serif",
      '--font-mono': "'Space Mono', 'Courier New', monospace",
      '--font-cjk': "'Noto Sans JP', sans-serif",
      '--letter-spacing-base': '0.08em',
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
      '--border-color': '#2A2B33',
      '--glow-color': '#00F5D415',
      '--font-display': "'Space Mono', 'IBM Plex Mono', monospace",
      '--font-body': "'IBM Plex Mono', 'Courier New', monospace",
      '--letter-spacing-base': '0.12em',
      '--line-height-base': '1.6',
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
      '--border-color': '#D8D8D5',
      '--glow-color': '#0A0A0808',
      '--font-display': "'Playfair Display', 'Cormorant Garamond', serif",
      '--font-body': "'Lora', Georgia, serif",
      '--letter-spacing-base': '0.04em',
      '--line-height-base': '1.8',
    },
  },
};

interface ChromaticContextType {
  theme: ThemeConfig;
  switchTheme: (themeId: ThemeId) => void;
  applyLocaleTypography: (locale: Locale) => void;
}

const ChromaticContext = createContext<ChromaticContextType | null>(null);

export const ChromaticProvider = ({ children }: { children: ReactNode }) => {
  const getInitialTheme = (): ThemeId => {
    const stored = localStorage.getItem('ace-theme') as ThemeId | null;

    if (stored && Object.keys(THEMES).includes(stored)) {
      return stored;
    }

    const list: ThemeId[] = ['onyx', 'cyber', 'minimal'];
    const random = list[Math.floor(Math.random() * list.length)]!;

    localStorage.setItem('ace-theme', random);
    return random;
  };

  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() =>
    getInitialTheme()
  );

  const theme = THEMES[currentThemeId];

  useEffect(() => {
    localStorage.setItem('ace-theme', currentThemeId);
    applyTheme(theme);
  }, [currentThemeId]);

  const applyTheme = (t: ThemeConfig) => {
    const root = document.documentElement;

    Object.entries(t.variables).forEach(([k, v]) => {
      root.style.setProperty(k, String(v ?? ''));
    });

    root.setAttribute('data-theme', t.id);
  };

  const applyLocaleTypography = (locale: Locale) => {
    const root = document.documentElement;
    const vars = theme.variables;

    let fontCjk: string = vars['--font-cjk'] ?? '';
    let letterSpacing: string = vars['--letter-spacing-base'] ?? '';
    let lineHeight: string = vars['--line-height-base'] ?? '';

    if (locale === 'zh') fontCjk = "'Noto Sans SC', sans-serif";
    if (locale === 'ja') fontCjk = "'Noto Sans JP', sans-serif";
    if (locale === 'ko') fontCjk = "'Noto Sans KR', sans-serif";

    root.style.setProperty('--font-cjk', fontCjk);
    root.style.setProperty('--letter-spacing-base', letterSpacing);
    root.style.setProperty('--line-height-base', lineHeight);

    root.setAttribute('lang', locale);
  };

  const switchTheme = (id: ThemeId) => {
    setCurrentThemeId(id);
  };

  const value = useMemo(
    () => ({ theme, switchTheme, applyLocaleTypography }),
    [theme]
  );

  return (
    <ChromaticContext.Provider value={value}>
      {children}
    </ChromaticContext.Provider>
  );
};

export const useChromatic = () => {
  const ctx = useContext(ChromaticContext);
  if (!ctx) throw new Error('useChromatic must be inside provider');
  return ctx;
};