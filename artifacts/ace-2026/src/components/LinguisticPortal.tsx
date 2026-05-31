import React, { useRef, useEffect, useState } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { Locale } from '../types';

interface LinguisticPortalProps {
  onLanguageSelect: (locale: Locale) => void;
}

const LinguisticPortal = ({ onLanguageSelect }: LinguisticPortalProps) => {
  const [hovered, setHovered] = useState<Locale | null>(null);

  const languages: { locale: Locale; label: string; frequency: number }[] = [
    { locale: 'en', label: 'ENGLISH', frequency: 440 },
    { locale: 'es', label: 'ESPANOL', frequency: 528 },
    { locale: 'fr', label: 'FRANCAIS', frequency: 396 },
    { locale: 'zh', label: '中文', frequency: 639 },
    { locale: 'ja', label: '日本語', frequency: 741 },
    { locale: 'ko', label: '한국어', frequency: 852 },
  ];

  const handleSelect = (locale: Locale) => {
    // Simple transition or shatter animation via CSS can be triggered here
    onLanguageSelect(locale);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col justify-center items-center overflow-hidden select-none z-50">
      {/* Cinematic Starfield Background using absolute position divs */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
      </div>

      <div className="relative flex flex-col items-center max-w-4xl w-full px-4">
        {/* Monogram/Logo Header */}
        <div className="text-accent font-mono text-sm tracking-[0.25em] mb-12 animate-pulse">
          ACE-2026
        </div>

        {/* 6 language vertical floating pillars arrangement */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-12 w-full justify-items-center mb-16">
          {languages.map((lang) => {
            const isHovered = hovered === lang.locale;
            return (
              <button
                key={lang.locale}
                onClick={() => handleSelect(lang.locale)}
                onMouseEnter={() => setHovered(lang.locale)}
                onMouseLeave={() => setHovered(null)}
                style={{ minWidth: '150px', minHeight: '52px' }}
                className={`text-center font-display text-2xl md:text-3xl transition-all duration-300 transform outline-none border-b border-transparent ${
                  isHovered
                    ? 'text-accent border-accent tracking-[0.3em] scale-110 opacity-100'
                    : 'text-text opacity-40 hover:opacity-100 tracking-wide'
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>

        {/* Center line element */}
        <div className="w-2/3 h-[1px] bg-accent/20 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/60 to-transparent animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default LinguisticPortal;
