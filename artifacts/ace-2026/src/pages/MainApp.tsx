import React, { useState, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
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
  const { identity, locale, setLocale } = useIdentity();
  const { theme, switchTheme, applyLocaleTypography } = useChromatic();
  const [showPortal, setShowPortal] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!showPortal) {
      // Once portal is dismissed, apply initial typography based on selected locale and current theme
      applyLocaleTypography(locale, theme);
    }
  }, [showPortal, locale, theme, applyLocaleTypography]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+A toggles admin dashboard
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAdmin((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLanguageSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale);
    setShowPortal(false);
  };

  if (showPortal) {
    return <LinguisticPortal onLanguageSelect={handleLanguageSelect} />;
  }

  return (
    <div className="min-h-screen bg-surface text-text font-body transition-colors duration-600 relative overflow-x-hidden select-none">
      {/* Global Magnetic Cursor System */}
      <MagneticCursor />

      {/* Secret Admin Panel Access Trigger in Header (ACE monogram logo) */}
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
            className={`cursor-pointer hover:text-accent transition-colors ${theme.id === 'onyx' ? 'text-accent' : 'text-text-muted'}`}
          >
            ONYX
          </button>
          <button
            onClick={() => switchTheme('cyber')}
            className={`cursor-pointer hover:text-accent transition-colors ${theme.id === 'cyber' ? 'text-accent' : 'text-text-muted'}`}
          >
            CYBER
          </button>
          <button
            onClick={() => switchTheme('minimal')}
            className={`cursor-pointer hover:text-accent transition-colors ${theme.id === 'minimal' ? 'text-accent' : 'text-text-muted'}`}
          >
            MINIMAL
          </button>
        </nav>
      </header>

      {/* Layout Randomization Engine */}
      <GridLayoutEngine />

      {/* Spatial HorizontalTimeline Scroll Engine */}
      <SpatialScrollEngine />

      {/* Persistent Audio Player */}
      <PersistentAudioPlayer />

      {/* Executive Studio Bot (positioned above bottom player) */}
      <ExecutiveStudioBot />

      {/* Admin Dashboard overlay */}
      {showAdmin && <AdminDashboard onClose={() => setShowAdmin(false)} />}
    </div>
  );
};

export default MainApp;
