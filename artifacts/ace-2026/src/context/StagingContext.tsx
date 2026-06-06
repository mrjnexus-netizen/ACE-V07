import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ComposerIdentity } from '../types';
import { useIdentity } from './IdentityContext';
import { apiPut } from '../lib/apiClient';

interface StagingContextType {
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  draftState: ComposerIdentity | null;
  hasPendingChanges: boolean;
  commitDraft: () => Promise<void>;
  rollbackDraft: () => void;
  updateDraftField: (field: keyof ComposerIdentity, value: any) => void;
  unsavedChanges: boolean;
}

const StagingContext = createContext<StagingContextType | undefined>(undefined);

export const StagingProvider = ({ children }: { children: ReactNode }) => {
  const { composerIdentity: identity, fetchIdentity } = useIdentity();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [draftState, setDraftState] = useState<ComposerIdentity | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  const unsavedChanges = hasPendingChanges;

  const toggleEditMode = useCallback((mode: boolean) => {
    setIsEditMode(mode);
    if (mode && !draftState) {
      setDraftState(identity ? JSON.parse(JSON.stringify(identity)) : null);
      setHasPendingChanges(false);
    } else if (!mode) {
      setDraftState(null);
      setHasPendingChanges(false);
    }
  }, [identity, draftState]);

  const updateDraftField = useCallback((field: keyof ComposerIdentity, value: any) => {
    setDraftState((prev) => {
      const current = prev || identity || {
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
      };
      const updated = { ...current, [field]: value };
      setHasPendingChanges(true);
      return updated;
    });
  }, [identity]);

  const rollbackDraft = useCallback(() => {
    setDraftState(identity ? JSON.parse(JSON.stringify(identity)) : null);
    setHasPendingChanges(false);
  }, [identity]);

  const commitDraft = useCallback(async () => {
    if (!draftState) return;
    try {
      await apiPut<ComposerIdentity>('/api/identity', draftState);
      await fetchIdentity();
      setHasPendingChanges(false);
      setIsEditMode(false);
      setDraftState(null);
    } catch (err) {
      console.error('Error committing draft state:', err);
    }
  }, [draftState, fetchIdentity]);

  return (
    <StagingContext.Provider
      value={{
        isEditMode,
        setIsEditMode: toggleEditMode,
        draftState,
        hasPendingChanges,
        commitDraft,
        rollbackDraft,
        updateDraftField,
        unsavedChanges,
      }}
    >
      {children}
    </StagingContext.Provider>
  );
};

export const useStaging = () => {
  const context = useContext(StagingContext);
  if (context === undefined) {
    throw new Error('useStaging must be used within a StagingProvider');
  }
  return context;
};
