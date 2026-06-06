import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { apiGet, apiPut } from '../lib/apiClient';
import type { ComposerIdentity, AudioTrack, Locale } from '../types';

interface IdentityContextType {
  composerIdentity: ComposerIdentity | null;
  identity: ComposerIdentity | null;
  tracks: AudioTrack[];
  playlist: AudioTrack[];
  locale: Locale;
  setLocale: (locale: Locale) => void;
  loading: boolean;
  fetchIdentity: () => Promise<void>;
  fetchTracks: () => Promise<void>;
  updateIdentity: (data: Partial<ComposerIdentity>) => Promise<void>;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export const IdentityProvider = ({ children }: { children: ReactNode }) => {
  const [composerIdentity, setComposerIdentity] = useState<ComposerIdentity | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [locale, setLocale] = useState<Locale>('en');
  const [loading, setLoading] = useState(false);

  const fetchIdentity = useCallback(async () => {
    try {
      const res = await apiGet<ComposerIdentity>('/api/identity');
      if (res.success && res.data) setComposerIdentity(res.data);
      else setComposerIdentity(null);
    } catch {
      setComposerIdentity(null);
    }
  }, []);

  const fetchTracks = useCallback(async () => {
    try {
      const res = await apiGet<AudioTrack[]>('/api/tracks');
      if (res.success && Array.isArray(res.data)) setTracks(res.data);
      else setTracks([]);
    } catch {
      setTracks([]);
    }
  }, []);

  const updateIdentity = useCallback(async (data: Partial<ComposerIdentity>) => {
    try {
      const res = await apiPut<ComposerIdentity>('/api/identity', data);
      if (res.success && res.data) setComposerIdentity(res.data);
    } catch (err) {
      console.error('Update failed', err);
    }
  }, []);

  return (
    <IdentityContext.Provider
      value={{
        composerIdentity,
        identity: composerIdentity,
        tracks,
        playlist: tracks,
        locale,
        setLocale,
        loading,
        fetchIdentity,
        fetchTracks,
        updateIdentity,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
};

export const useIdentity = () => {
  const context = useContext(IdentityContext);
  if (!context) throw new Error('useIdentity must be used within IdentityProvider');
  return context;
};