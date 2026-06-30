import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useIdentity } from './IdentityContext';
import type { Locale } from '../types';

/**
 * TranslationContext — live UI translation.
 *
 * Usage:
 *   const { t } = useT();
 *   <h1>{t('Listen to the latest works')}</h1>
 * or:
 *   <T>Listen to the latest works</T>
 *
 * English source strings are written inline in components. When the active
 * locale is non-English, strings are translated via the backend (/api/translate,
 * Groq + Redis cache) and cached again on the client (memory + localStorage),
 * so each string is fetched at most once per language, ever.
 *
 * Graceful: until a translation arrives, the original English shows (no blank,
 * no layout jump). English locale returns source instantly with no network.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const LS_PREFIX = 'ace-tr:v2:';

type Cache = Record<string, string>; // key: `${lang}::${text}` -> translation

interface TranslationContextType {
  /** Translate a single string for the active locale. */
  t: (text: string) => string;
  /** True while at least one translation request is in flight. */
  translating: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

function ck(lang: Locale, text: string): string {
  return `${lang}::${text}`;
}

export const TranslationProvider = ({ children }: { children: ReactNode }) => {
  const { locale } = useIdentity();
  const activeLocale: Locale = locale ?? 'en';

  // In-memory cache (synchronous reads during render).
  const cacheRef = useRef<Cache>({});
  // Strings already requested this session (avoid duplicate fetches).
  const requestedRef = useRef<Set<string>>(new Set());
  // Strings seen this frame that still need translating (batched).
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [, forceRender] = useState(0);
  const [translating, setTranslating] = useState(false);

  // Hydrate memory cache from localStorage once.
  useEffect(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) {
          const val = localStorage.getItem(k);
          if (val !== null) cacheRef.current[k.slice(LS_PREFIX.length)] = val;
        }
      }
    } catch {
      /* localStorage unavailable */
    }
    forceRender((n) => n + 1);
  }, []);

  const flush = useCallback(async () => {
    flushTimerRef.current = null;
    const lang = activeLocale;
    if (lang === 'en') return;

    const batch = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (batch.length === 0) return;

    setTranslating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch, targetLang: lang }),
      });
      if (res.ok) {
        const data = (await res.json()) as { translations?: string[] };
        const out = data.translations ?? [];
        batch.forEach((text, i) => {
          const translated = out[i];
          if (typeof translated === 'string') {
            const key = ck(lang, text);
            cacheRef.current[key] = translated;
            if (translated !== text) {
              try {
                localStorage.setItem(LS_PREFIX + key, translated);
              } catch {
                /* quota / unavailable */
              }
            }
          }
        });
        forceRender((n) => n + 1);
      }
    } catch {
      /* network error — English stays visible */
    } finally {
      setTranslating(false);
    }
  }, [activeLocale]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(flush, 40); // coalesce a render's worth of strings
  }, [flush]);

  const t = useCallback(
    (text: string): string => {
      if (!text) return text;
      const lang = activeLocale;
      if (lang === 'en') return text;

      const key = ck(lang, text);
      const hit = cacheRef.current[key];
      if (hit !== undefined) return hit;

      // Not cached: queue it (once) and show English meanwhile.
      if (!requestedRef.current.has(key)) {
        requestedRef.current.add(key);
        pendingRef.current.add(text);
        scheduleFlush();
      }
      return text;
    },
    [activeLocale, scheduleFlush],
  );

  return (
    <TranslationContext.Provider value={{ t, translating }}>
      {children}
    </TranslationContext.Provider>
  );
};

const IDENTITY_T: TranslationContextType = { t: (text: string) => text, translating: false };

export const useT = (): TranslationContextType => {
  // Graceful: outside a TranslationProvider, return source text unchanged
  // instead of throwing, so shared primitives can call useT() anywhere.
  return useContext(TranslationContext) ?? IDENTITY_T;
};

/** Declarative translator: <T>Some English text</T> */
export const T = ({ children }: { children: string }): JSX.Element => {
  const { t } = useT();
  return <>{t(children)}</>;
};

