import type { Locale, ThemeConfig } from '../types';

const VALID_LOCALES: readonly Locale[] = ['en', 'es', 'fr', 'zh', 'ja', 'ko'];
const STORAGE_KEY = 'ace-locale';

export function isValidLocale(value: string): value is Locale {
  return (VALID_LOCALES as readonly string[]).includes(value);
}

export function getInitialLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLocale(stored)) return stored;
  } catch { /* localStorage unavailable */ }
  return null;
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* silent */ }
  document.documentElement.setAttribute('lang', locale);
  document.documentElement.setAttribute('dir', 'ltr');
  document.documentElement.setAttribute('data-locale', locale);
}

export function getLocalizedText(
  content: Record<Locale, string> | null | undefined,
  locale: Locale
): string {
  if (!content) return '';
  return content[locale] ?? content.en ?? '';
}

export function applyLocaleTypography(locale: Locale, _theme: ThemeConfig): void {
  const root = document.documentElement;

  switch (locale) {
    case 'zh':
      root.style.setProperty('--font-active', "'Noto Sans SC', sans-serif");
      root.style.setProperty('--letter-spacing-active', '0.05em');
      root.style.setProperty('--line-height-active', 'var(--line-height-cjk)');
      root.style.setProperty('word-break', 'normal');
      break;
    case 'ja':
      root.style.setProperty('--font-active', "'Noto Sans JP', sans-serif");
      root.style.setProperty('--letter-spacing-active', '0.03em');
      root.style.setProperty('--line-height-active', 'var(--line-height-cjk)');
      break;
    case 'ko':
      root.style.setProperty('--font-active', "'Noto Sans KR', sans-serif");
      root.style.setProperty('--letter-spacing-active', '0.04em');
      root.style.setProperty('--line-height-active', 'var(--line-height-cjk)');
      break;
    case 'es':
    case 'fr': {
      root.style.setProperty('--font-active', 'var(--font-display)');
      root.style.setProperty('--letter-spacing-active', 'var(--letter-spacing-base)');
      const baseLineHeight = parseFloat(
        getComputedStyle(root).getPropertyValue('--line-height-base') || '1.7'
      );
      root.style.setProperty('--line-height-active', String(baseLineHeight * 1.05));
      break;
    }
    default:
      root.style.setProperty('--font-active', 'var(--font-display)');
      root.style.setProperty('--letter-spacing-active', 'var(--letter-spacing-base)');
      root.style.setProperty('--line-height-active', 'var(--line-height-base)');
  }
}