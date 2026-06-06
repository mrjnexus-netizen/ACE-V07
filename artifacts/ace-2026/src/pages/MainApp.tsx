import { useState, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import LinguisticPortal from '../components/LinguisticPortal';
import GridLayoutEngine from '../components/GridLayoutEngine';
import SpatialScrollEngine from '../components/SpatialScrollEngine';
import PersistentAudioPlayer from '../components/PersistentAudioPlayer';
import ExecutiveStudioBot from '../components/ExecutiveStudioBot';
import AdminDashboard from '../components/AdminDashboard';
import MagneticCursor from '../components/MagneticCursor';
import { Locale } from '../types';

const MainApp = () => {
  const { locale, setLocale } = useIdentity();
  const { theme, switchTheme, applyLocaleTypography } = useChromatic();

  const [showPortal, setShowPortal] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!showPortal) {
      applyLocaleTypography(locale);
    }
  }, [showPortal, locale, applyLocaleTypography]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAdmin((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ensure routing and click-based navigation trigger /admin access method
  useEffect(() => {
    if (window.location.pathname === '/admin') {
      setShowAdmin(true);
    }
  }, []);

  // Fix 5: Iframe Title (Third-Party Injection - Defensive)
  useEffect(() => {
    const setIframeAttributes = () => {
      const iframes = document.querySelectorAll('iframe:not([title]):not([aria-label])');
      iframes.forEach(iframe => {
        iframe.setAttribute('aria-hidden', 'true');
      });
    };

    setIframeAttributes();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          setIframeAttributes();
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  const handleLanguageSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale);
    setShowPortal(false);
  };

  if (showPortal) {
    return (
      <LinguisticPortal 
        onLanguageSelect={handleLanguageSelect} 
        onTransitionComplete={() => setShowPortal(false)} // Callback to unmount after transition
        themeId={theme.id}
      />
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <div className="min-h-screen bg-surface text-text font-body transition-opacity duration-500 relative overflow-x-hidden select-none">
        <MagneticCursor />

        <header className="fixed top-0 left-0 right-0 z-40 p-6 flex justify-between items-center backdrop-blur-md border-b border-border/10 bg-surface/30">
          <h1
            onClick={() => setShowAdmin(true)}
            className="text-2xl font-display font-bold text-accent tracking-[0.2em] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            title="Open Admin CMD"
          >
            ACE-2026
          </h1>

          <nav className="flex space-x-6 text-xs font-mono tracking-widest uppercase items-center">
            <button
              onClick={() => switchTheme('onyx')}
              className={`cursor-pointer hover:text-accent transition-colors ${
                theme.id === 'onyx' ? 'text-accent' : 'text-text-muted'
              }`}
            >
              ONYX
            </button>

            <button
              onClick={() => switchTheme('cyber')}
              className={`cursor-pointer hover:text-accent transition-colors ${
                theme.id === 'cyber' ? 'text-accent' : 'text-text-muted'
              }`}
            >
              CYBER
            </button>

            <button
              onClick={() => switchTheme('minimal')}
              className={`cursor-pointer hover:text-accent transition-colors ${
                theme.id === 'minimal' ? 'text-accent' : 'text-text-muted'
              }`}
            >
              MINIMAL
            </button>
          </nav>
        </header>

        <main id="main-content" tabIndex={-1}>
          <GridLayoutEngine />
          <SpatialScrollEngine />
          <PersistentAudioPlayer />
          <ExecutiveStudioBot />
        </main>

        {showAdmin && (
          <AdminDashboard onClose={() => setShowAdmin(false)} />
        )}
      </div>
    </>
  );
};

export default MainApp;
