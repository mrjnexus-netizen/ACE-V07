import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ComposerIdentity, AudioTrack, Locale } from '../types';
import { useChromatic } from './ChromaticContext';

interface IdentityContextType {
  identity: ComposerIdentity | null;
  playlist: AudioTrack[];
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  fetchIdentity: () => Promise<void>;
  fetchTracks: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export const IdentityProvider = ({ children }: { children: ReactNode }) => {
  const { applyLocaleTypography } = useChromatic();
  
  // Null-First setup: all ComposerIdentity fields initialized as null
  const [identity, setIdentity] = useState<ComposerIdentity | null>({
    id: null,
    name: null,
    tagline: null,
    biography: null,
    awards: null,
    studioAddress: null,
    portrait: null,
    logo: null,
    heroVideo: null,
    socialLinks: null,
    projects: null,
  });

  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  
  const [locale, setLocaleState] = useState<Locale>(() => {
    const storedLocale = localStorage.getItem('ace-locale');
    if (storedLocale) return storedLocale as Locale;
    
    // Browser locale check
    const navLanguage = navigator.language.split('-')[0];
    const supportedLocales: Locale[] = ['en', 'es', 'fr', 'zh', 'ja', 'ko'];
    if (supportedLocales.includes(navLanguage as Locale)) {
      return navLanguage as Locale;
    }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('ace-locale', locale);
    applyLocaleTypography(locale);
  }, [locale, applyLocaleTypography]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
  };

  const fetchIdentity = async () => {
    try {
      const response = await fetch('/api/identity');
      const data = await response.json();
      if (data && data.success && data.data) {
        setIdentity(data.data);
      } else {
        console.error('Failed to fetch identity:', data ? data.error : 'No data');
        // Fallback or keep fields as null, never crash
      }
    } catch (error) {
      console.error('Error fetching identity:', error);
      // Keep state safe, no crashes
    }
  };

  const fetchTracks = async () => {
    try {
      const response = await fetch('/api/tracks');
      const data = await response.json();
      if (data && data.success && data.data) {
        setPlaylist(data.data);
      } else {
        console.error('Failed to fetch tracks:', data ? data.error : 'No data');
        setPlaylist([]);
      }
    } catch (error) {
      console.error('Error fetching tracks:', error);
      setPlaylist([]);
    }
  };

  useEffect(() => {
    fetchIdentity();
    fetchTracks();
  }, []);

  return (
    <IdentityContext.Provider value={{ identity, playlist, locale, setLocale, fetchIdentity, fetchTracks }}>
      {children}
    </IdentityContext.Provider>
  );
};

export const useIdentity = () => {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
};
