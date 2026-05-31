import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ComposerIdentity, MultiLingual, AudioTrack, Locale } from '../types';

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
  const [identity, setIdentity] = useState<ComposerIdentity | null>(null);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [locale, setLocaleState] = useState<Locale>(() => {
    const storedLocale = localStorage.getItem('ace-locale');
    return (storedLocale as Locale) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('ace-locale', locale);
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    // Potentially re-fetch identity or tracks if content is locale-dependent and not fully multilingual from API
  };

  const fetchIdentity = async () => {
    try {
      const response = await fetch("/api/identity");
      const data = await response.json();
      if (data.success) {
        setIdentity(data.data);
      } else {
        console.error("Failed to fetch identity:", data.error);
        setIdentity(null);
      }
    } catch (error) {
      console.error("Error fetching identity:", error);
      setIdentity(null);
    }
  };

  const fetchTracks = async () => {
    try {
      const response = await fetch("/api/tracks");
      const data = await response.json();
      if (data.success) {
        setPlaylist(data.data);
      } else {
        console.error("Failed to fetch tracks:", data.error);
        setPlaylist([]);
      }
    } catch (error) {
      console.error("Error fetching tracks:", error);
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
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return context;
};
