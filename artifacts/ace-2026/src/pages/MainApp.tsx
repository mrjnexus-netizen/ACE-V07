import React, { useState, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import LinguisticPortal from '../components/LinguisticPortal';
import { Locale } from '../types';

const MainApp = () => {
  const { identity, fetchIdentity, fetchTracks, locale, setLocale } = useIdentity();
  const { audioState, playTrack, pauseTrack, setVolume, nextTrack, prevTrack } = useAudio();
  const { theme, switchTheme, applyLocaleTypography } = useChromatic();
  const [showPortal, setShowPortal] = useState(true);

  useEffect(() => {
    if (!showPortal) {
      // Once portal is dismissed, apply initial typography based on selected locale and current theme
      applyLocaleTypography(locale, theme);
    }
  }, [showPortal, locale, theme, applyLocaleTypography]);

  const handleLanguageSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale);
    setShowPortal(false);
  };

  if (showPortal) {
    return <LinguisticPortal onLanguageSelect={handleLanguageSelect} />;
  }

  return (
    <div className="min-h-screen bg-surface text-text font-body transition-colors duration-600">
      <header className="p-4 border-b border-border flex justify-between items-center">
        <h1 className="text-4xl font-display text-accent">ACE-2026</h1>
        <nav>
          <button onClick={() => switchTheme('onyx')} className="mr-2 p-2">Onyx</button>
          <button onClick={() => switchTheme('cyber')} className="mr-2 p-2">Cyber</button>
          <button onClick={() => switchTheme('minimal')} className="p-2">Minimal</button>
        </nav>
      </header>
      <main className="p-4">
        <h2 className="text-3xl font-display mb-4">Welcome, Composer</h2>
        {identity ? (
          <div className="space-y-4">
            <p className="text-xl">Name: {identity.name?.[locale]}</p>
            <p className="text-muted">Tagline: {identity.tagline?.[locale]}</p>
            {/* More identity details */}
          </div>
        ) : (
          <p className="text-muted">Loading composer identity...</p>
        )}

        <h3 className="text-2xl font-display mt-8 mb-4">Audio Tracks</h3>
        {audioState.playlist.length > 0 ? (
          <div className="space-y-2">
            {audioState.playlist.map((track) => (
              <div key={track.id} className="flex items-center p-2 bg-surface2 border border-border rounded-md">
                <p className="flex-grow">{track.title[locale] || track.title.en}</p>
                <button
                  onClick={() => playTrack(track)}
                  className="ml-4 px-4 py-2 bg-accent text-surface rounded-md"
                >
                  {audioState.isPlaying && audioState.currentTrack?.id === track.id ? 'Pause' : 'Play'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">No tracks available.</p>
        )}
      </main>
      {/* Persistent Audio Player would go here, receiving state from useAudio */}
    </div>
  );
};

export default MainApp;
