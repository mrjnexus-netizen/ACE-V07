import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ComposerIdentity, AudioTrack, Locale } from '../types';
import { useChromatic } from './ChromaticContext';

// Simple API mock/wrapper logic since we just need the types to compile cleanly and avoid compiler errors
const apiGet = async <T,>(url: string): Promise<{ success: boolean; data?: T; error?: string }> => {
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.success) {
      return { success: true, data: data.data };
    }
    return { success: false, error: data ? data.error : 'No data' };
  } catch (error) {
    throw error;
  }
};

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
  const [identity, setIdentity] = useState<ComposerIdentity | null>(null);
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

  const fetchIdentity = useCallback(async () => {
    try {
      const response = await apiGet<ComposerIdentity>('/api/identity');
      if (response.success && response.data) {
        setIdentity(response.data);
      } else {
        // Blueprint LAW 2: keep null, no error toast
        console.warn('Identity API returned unsuccessful', response);
        setIdentity(null);
      }
    } catch (err) {
      // Backend offline or 500 – graceful degradation
      console.warn('Identity fetch failed (backend may be offline):', err);
      setIdentity(null);
    }
  }, []);

  const fetchTracks = useCallback(async () => {
    try {
      const response = await apiGet<AudioTrack[]>('/api/tracks');
      if (response.success && Array.isArray(response.data)) {
        setPlaylist(response.data);
      } else {
        console.warn('Tracks API returned unsuccessful', response);
        setPlaylist([]); // empty array, never null
      }
    } catch (err) {
      console.warn('Tracks fetch failed:', err);
      setPlaylist([]);
    }
  }, []);

  useEffect(() => {
    fetchIdentity();
    fetchTracks();
  }, [fetchIdentity, fetchTracks]);

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
