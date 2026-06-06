import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext';

interface LinguisticPortalProps {
  onLanguageSelect?: (locale: any) => void;
  onTransitionComplete?: () => void;
  themeId?: string;
}

export const LinguisticPortal = ({ onLanguageSelect, onTransitionComplete, themeId }: LinguisticPortalProps = {}) => {
  const navigate = useNavigate();
  const { setLocale } = useIdentity();

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
    { code: 'fr', label: 'FR' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
  ];

  const selectLanguage = (locale: string) => {
    localStorage.setItem('ace-locale', locale);
    setLocale(locale as any);
    if (onLanguageSelect) {
      onLanguageSelect(locale);
    }
    if (onTransitionComplete) {
      onTransitionComplete();
    }
    navigate('/app');
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-6 p-8">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => selectLanguage(lang.code)}
            className="text-4xl md:text-6xl font-display text-white opacity-70 hover:opacity-100 transition-all duration-300 animate-pulse hover:scale-105"
          >
            {lang.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LinguisticPortal;
