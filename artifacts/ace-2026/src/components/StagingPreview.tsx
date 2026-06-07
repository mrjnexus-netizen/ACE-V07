import { useState, useEffect, useRef } from 'react';
import { useIdentity } from '../context/IdentityContext';
import type { ComposerIdentity, ThemeId, Locale } from '../types';

type Viewport = 'mobile' | 'tablet' | 'desktop';
const VIEWPORT_WIDTHS: Record<Viewport, number> = { mobile: 375, tablet: 768, desktop: 1440 };
const THEME_IDS: ThemeId[] = ['onyx', 'cyber', 'minimal'];
const THEME_LABELS: Record<ThemeId, string> = { onyx: 'ONYX', cyber: 'CYBER', minimal: 'MINIMAL' };

function localText(identity: ComposerIdentity | null, locale: Locale, field: 'name' | 'tagline' | 'biography'): string {
  if (!identity) return '';
  const ml = identity[field];
  if (!ml) return '';
  return (ml as unknown as Record<string, string>)[locale] || '';
}

function getThemeVariables(theme: ThemeId): Record<string, string> {
  const o: Record<string, string> = { '--surface-color':'#080808','--accent-color':'#D4AF37','--text-color':'#F5F5F0','--text-muted-color':'#888880','--border-color':'#2A2A2A','--surface3-color':'#1A1A1A','--surface-rgb':'8,8,8' };
  const c: Record<string, string> = { '--surface-color':'#0A0A0F','--accent-color':'#00F5D4','--text-color':'#E8E9F0','--text-muted-color':'#6B6C75','--border-color':'#2A2B33','--surface3-color':'#1E1F26','--surface-rgb':'10,10,15' };
  const m: Record<string, string> = { '--surface-color':'#F9F9F7','--accent-color':'#0A0A08','--text-color':'#0A0A08','--text-muted-color':'#7A7A75','--border-color':'#D8D8D5','--surface3-color':'#EAEAE8','--surface-rgb':'249,249,247' };
  return theme === 'onyx' ? o : theme === 'cyber' ? c : m;
}

function ThemePreviewFrame({ theme, identity, locale, viewport }: { theme: ThemeId; identity: ComposerIdentity | null; locale: Locale; viewport: Viewport }) {
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (frameRef.current) Object.entries(getThemeVariables(theme)).forEach(([k, v]) => frameRef.current!.style.setProperty(k, v));
  }, [theme]);
  const w = VIEWPORT_WIDTHS[viewport];
  const scale = viewport === 'desktop' ? 0.5 : viewport === 'tablet' ? 0.7 : 0.9;
  const h = viewport === 'mobile' ? 667 : viewport === 'tablet' ? 1024 : 900;
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>{THEME_LABELS[theme]}</span>
      <div ref={frameRef} className="overflow-hidden border rounded-lg shadow-2xl transition-all duration-500" style={{ width: `${w}px`, height: `${h}px`, transform: `scale(${scale})`, transformOrigin: 'top center', backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}>
        <div className="p-4 h-full flex flex-col justify-center items-center text-center">
          <h1 className="text-4xl font-display mb-2" style={{ color: 'var(--text-color)' }}>{localText(identity, locale, 'name') || 'ACE'}</h1>
          <p className="text-sm opacity-70" style={{ color: 'var(--text-muted-color)' }}>{localText(identity, locale, 'tagline')}</p>
          <div className="mt-6 w-16 h-16 rounded-full" style={{ backgroundColor: 'var(--accent-color)', opacity: 0.2 }} />
        </div>
      </div>
    </div>
  );
}

export default function StagingPreview() {
  const { composerIdentity, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const [viewport, setViewport] = useState<Viewport>('desktop');
  return (
    <div className="space-y-6 p-6" style={{ backgroundColor: 'var(--surface-color)' }}>
      <div className="flex gap-4 items-center justify-center">
        {(['mobile','tablet','desktop'] as Viewport[]).map(v => (
          <button key={v} onClick={() => setViewport(v)} className={`px-3 py-1 text-xs font-mono rounded ${viewport === v ? 'bg-[var(--accent-color)] text-[var(--surface-color)]' : 'bg-[var(--surface3-color)]'}`}>{v.toUpperCase()}</button>
        ))}
      </div>
      <div className="flex justify-center gap-8 flex-wrap">
        {THEME_IDS.map(theme => <ThemePreviewFrame key={theme} theme={theme} identity={composerIdentity} locale={safeLocale} viewport={viewport} />)}
      </div>
    </div>
  );
}