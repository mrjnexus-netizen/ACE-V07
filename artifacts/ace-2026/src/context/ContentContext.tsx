import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiGet, apiTranslate, apiPut, apiDelete } from '../lib/apiClient';
import type { Locale } from '../types';

export type ContentType = 'text' | 'image' | 'audio' | 'link';

interface ContentEntry {
  id: string;
  key: string;
  locale: Locale;
  type: ContentType;
  value: string;
}

interface ContentContextType {
  /** True when the real site is being rendered inside the A3a visual
   * editor — EditableX wrappers show their hover overlay only then. */
  editMode: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  loading: boolean;
  /** override(locale) -> override('en') -> null (caller supplies the
   * compiled-in default as the final fallback). */
  resolve: (key: string, locale: Locale) => string | null;
  save: (key: string, locale: Locale, type: ContentType, value: string) => Promise<void>;
  /** Saves the English (master) value, then auto-translates it into the
   * other 5 locales and saves each — per Reza: edits only ever happen in
   * English, every other language updates on its own. Text only; image/
   * audio/link overrides are locale-specific by nature and use `save`
   * directly. Per-language failures are swallowed individually (one bad
   * translation shouldn't undo the English save or block the rest) —
   * `cascadeErrors` reports which locales didn't make it, so the caller
   * can show that honestly instead of silently pretending success. */
  saveWithCascade: (key: string, enValue: string) => Promise<{ cascadeErrors: Locale[] }>;
  /** "Set-to-default": removes the override, reverting to the compiled
   * default. */
  resetToDefault: (key: string, locale: Locale) => Promise<void>;
}

const EDIT_MODE_KEY = 'ace_edit_mode';
const ALL_LOCALES: Locale[] = ['en', 'es', 'fr', 'zh', 'ja', 'ko'];

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider = ({ children }: { children: ReactNode }) => {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(EDIT_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const fetchEntries = useCallback(async () => {
    try {
      const rows = await apiGet<ContentEntry[]>('/api/content');
      setEntries(rows);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const enterEditMode = useCallback(() => {
    try {
      sessionStorage.setItem(EDIT_MODE_KEY, '1');
    } catch {
      /* sessionStorage unavailable — edit mode just won't survive a
       * navigation, non-fatal */
    }
    setEditMode(true);
  }, []);

  const exitEditMode = useCallback(() => {
    try {
      sessionStorage.removeItem(EDIT_MODE_KEY);
    } catch {
      /* noop */
    }
    setEditMode(false);
  }, []);

  const resolve = useCallback(
    (key: string, locale: Locale): string | null => {
      const exact = entries.find((e) => e.key === key && e.locale === locale);
      if (exact) return exact.value;
      const en = entries.find((e) => e.key === key && e.locale === 'en');
      if (en) return en.value;
      return null;
    },
    [entries]
  );

  const save = useCallback(async (key: string, locale: Locale, type: ContentType, value: string) => {
    const row = await apiPut<ContentEntry>(`/api/content/${encodeURIComponent(key)}`, { locale, type, value });
    setEntries((prev) => {
      const withoutThis = prev.filter((e) => !(e.key === key && e.locale === locale));
      return [...withoutThis, row];
    });
  }, []);

  const saveWithCascade = useCallback(
    async (key: string, enValue: string): Promise<{ cascadeErrors: Locale[] }> => {
      await save(key, 'en', 'text', enValue);

      const targets = ALL_LOCALES.filter((l) => l !== 'en');
      const cascadeErrors: Locale[] = [];

      await Promise.all(
        targets.map(async (targetLang) => {
          try {
            const translation = await apiTranslate(enValue, targetLang);
            await save(key, targetLang, 'text', translation);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[ContentContext] cascade translation failed for "${key}" -> ${targetLang}:`, err);
            cascadeErrors.push(targetLang);
          }
        })
      );

      return { cascadeErrors };
    },
    [save]
  );

  const resetToDefault = useCallback(async (key: string, locale: Locale) => {
    await apiDelete(`/api/content/${encodeURIComponent(key)}?locale=${locale}`);
    setEntries((prev) => prev.filter((e) => !(e.key === key && e.locale === locale)));
  }, []);

  return (
    <ContentContext.Provider
      value={{ editMode, enterEditMode, exitEditMode, loading, resolve, save, saveWithCascade, resetToDefault }}
    >
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) throw new Error('useContent must be used within ContentProvider');
  return context;
};
