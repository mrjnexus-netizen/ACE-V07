import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ComposerIdentity } from '../types';
import { useIdentity } from './IdentityContext';

interface StagingContextType {
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  draftState: ComposerIdentity | null;
  setDraftState: React.Dispatch<React.SetStateAction<ComposerIdentity | null>>;
  hasPendingChanges: boolean;
  commitDraft: () => Promise<void>;
  rollbackDraft: () => void;
  updateDraftField: (field: keyof ComposerIdentity, value: any) => void;
  draft: Partial<ComposerIdentity>;
  stageDraft: (field: keyof ComposerIdentity, value: any) => void;
  previewDraft: ComposerIdentity | null;
  unsavedChanges: boolean;
}

const StagingContext = createContext<StagingContextType | undefined>(undefined);

export const StagingProvider = ({ children }: { children: ReactNode }) => {
  const { identity, fetchIdentity } = useIdentity();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [draftState, setDraftState] = useState<ComposerIdentity | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  // Synchronize/Maintain new requested API fields as well to avoid breaks
  const draft = draftState || {};
  const unsavedChanges = hasPendingChanges;

  const toggleEditMode = (mode: boolean) => {
    setIsEditMode(mode);
    if (mode && !draftState) {
      setDraftState(identity ? JSON.parse(JSON.stringify(identity)) : null);
      setHasPendingChanges(false);
    } else if (!mode) {
      setDraftState(null);
      setHasPendingChanges(false);
    }
  };

  const updateDraftField = (field: keyof ComposerIdentity, value: any) => {
    setDraftState((prev: ComposerIdentity | null) => {
      const current = prev || identity || {
        id: null, name: null, tagline: null, biography: null, awards: null, studioAddress: null, portrait: null, logo: null, heroVideo: null, socialLinks: null, projects: null, trackCount: null, genres: null
      };
      const updated = {
        ...current,
        [field]: value,
      };
      setHasPendingChanges(true);
      return updated;
    });
  };

  const stageDraft = (field: keyof ComposerIdentity, value: any) => {
    updateDraftField(field, value);
  };

  const previewDraft = draftState || identity;

  const rollbackDraft = () => {
    setDraftState(identity ? JSON.parse(JSON.stringify(identity)) : null);
    setHasPendingChanges(false);
  };

  const commitDraft = async () => {
    try {
      if (!draftState) return;

      const response = await fetch('/api/identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftState),
      });

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to publish draft changes');
      }

      await fetchIdentity(); // reload live state
      setHasPendingChanges(false);
      setIsEditMode(false);
      setDraftState(null);
    } catch (err) {
      console.error('Error committing draft state:', err);
      alert(err instanceof Error ? err.message : 'Commit failed');
    }
  };

  return (
    <StagingContext.Provider
      value={{
        isEditMode,
        setIsEditMode: toggleEditMode,
        draftState,
        setDraftState,
        hasPendingChanges,
        commitDraft,
        rollbackDraft,
        updateDraftField,
        draft,
        stageDraft,
        previewDraft,
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
