import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeId = 'onyx' | 'cyber' | 'minimal';

interface ChromaticContextType {
  themeId: ThemeId;
  theme: ThemeId;
  switchTheme: (theme: ThemeId) => void;
  applyLocaleTypography?: (locale: string) => void;
}

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

  const switchTheme = (theme: ThemeId) => {
    setThemeId(theme);
    localStorage.setItem('ace-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  };

  const applyLocaleTypography = (locale: string) => {
    // stub
  };

  return (
    <ChromaticContext.Provider value={{ themeId, theme: themeId, switchTheme, applyLocaleTypography }}>
      {children}
    </ChromaticContext.Provider>
  );
};

export const useChromatic = () => {
  const context = useContext(ChromaticContext);
  if (!context) throw new Error('useChromatic must be used within ChromaticProvider');
  return context;
};