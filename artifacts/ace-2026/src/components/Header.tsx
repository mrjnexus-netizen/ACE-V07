import { useState } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { cn } from '../lib/utils';

export const Header = () => {
  const { locale, setLocale } = useIdentity();
  const { themeId, switchTheme } = useChromatic();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const locales = [
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
    { code: 'fr', label: 'FR' },
    { code: 'zh', label: 'ZH' },
    { code: 'ja', label: 'JA' },
    { code: 'ko', label: 'KO' },
  ];

  const themes = ['onyx', 'cyber', 'minimal'] as const;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-2xl font-display tracking-wider text-accent">ACE</div>
        <div className="hidden md:flex items-center space-x-6">
          <div className="flex space-x-2">
            {locales.map((loc) => (
              <button
                key={loc.code}
                onClick={() => setLocale(loc.code as any)}
                className={cn(
                  'text-xs font-mono px-2 py-1 rounded transition',
                  locale === loc.code
                    ? 'text-accent bg-accent/10'
                    : 'text-text-muted hover:text-text-color'
                )}
              >
                {loc.label}
              </button>
            ))}
          </div>
          <div className="flex space-x-2">
            {themes.map((t) => (
              <button
                key={t}
                onClick={() => switchTheme(t)}
                className={cn(
                  'w-6 h-6 rounded-full border transition-transform hover:scale-110',
                  themeId === t ? 'ring-2 ring-accent scale-110' : 'opacity-60',
                  t === 'onyx' && 'bg-[#080808]',
                  t === 'cyber' && 'bg-[#00F5D4]',
                  t === 'minimal' && 'bg-[#F9F9F7]'
                )}
                aria-label={'Switch to ' + t + ' theme'}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden text-text-color"
          aria-label="Menu"
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>
      {isMobileMenuOpen && (
        <div className="md:hidden bg-surface2 border-t border-border p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono text-text-muted">Language</span>
            <div className="flex flex-wrap gap-2">
              {locales.map((loc) => (
                <button
                  key={loc.code}
                  onClick={() => {
                    setLocale(loc.code as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    'text-xs font-mono px-2 py-1 rounded',
                    locale === loc.code ? 'text-accent bg-accent/10' : 'text-text-muted'
                  )}
                >
                  {loc.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono text-text-muted">Theme</span>
            <div className="flex gap-2">
              {themes.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    switchTheme(t);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    'w-6 h-6 rounded-full border',
                    t === 'onyx' && 'bg-[#080808]',
                    t === 'cyber' && 'bg-[#00F5D4]',
                    t === 'minimal' && 'bg-[#F9F9F7]',
                    themeId === t && 'ring-2 ring-accent'
                  )}
                  aria-label={'Switch to ' + t}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};