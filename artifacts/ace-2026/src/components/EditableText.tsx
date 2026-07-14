import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useContent } from '../context/ContentContext';
import { useIdentity } from '../context/IdentityContext';
import { apiPost } from '../lib/apiClient';
import { FONTS_BY_LOCALE, loadGoogleFont, loadGoogleFonts, type FontOption } from '../constants/fonts';
import type { Locale } from '../types';

interface EditableTextProps {
  /** Stable key identifying this piece of content (e.g. 'hero.tagline'). */
  contentKey: string;
  /** The compiled-in default — what renders until an admin overrides it,
   * and what "Set-to-default" reverts back to. */
  defaultValue: string;
  /** Tag to render as. Defaults to 'span' so it drops into inline text
   * naturally; pass 'h1', 'p', etc. to match the surrounding markup. */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div';
  className?: string;
  style?: CSSProperties;
}

/**
 * G2/A3a — the "everything is admin-editable" backbone, text variant.
 * Outside edit mode this is a transparent pass-through (renders the
 * resolved value or the default, nothing else — zero visual/behavioural
 * change to the live site). Inside edit mode (ContentContext.editMode,
 * only ever true when the A3a visual editor set it), hovering reveals a
 * small toolbar: Edit / Generate / Delete / Set-to-default.
 *
 * "Generate" (AI rewrite via A3b's configured model) is stubbed for now —
 * A3b's key/model plumbing isn't wired to a generation endpoint yet; the
 * button is visible so the UI reads complete, but it's honest about not
 * being wired (shows a notice rather than pretending to work).
 */
const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English', es: 'Espa\u00f1ol', fr: 'Fran\u00e7ais', zh: '\u4e2d\u6587', ja: '\u65e5\u672c\u8a9e', ko: '\ud55c\uad6d\uc5b4',
};
const LOCALE_ORDER = ['en', 'es', 'fr', 'ja', 'ko', 'zh'];

// 2026-07-13 (per Reza — the native <select>'s OPEN dropdown list rendered
// with pale, barely-readable native browser chrome that couldn't be
// restyled via CSS, same root cause as the admin panel's earlier native-
// control issues). A small custom dropdown instead: full control over
// every pixel, same "click outside to close" behavior a native select
// gives for free, reimplemented here.
//
// v3 (per Reza) — editing only ever happens in the English panel; every
// other language updates via AI translation EXCEPT font, which the AI has
// no say over. So this single dropdown sets SIX independent choices (one
// per language), not one value shared across all of them — clicking an
// option under "日本語" only changes the Japanese version's font, clicking
// under "English" only changes English's, etc. The dropdown stays open
// across picks (closing after every single click would make setting all
// six painfully slow) — it's closed explicitly via the Done button or
// clicking outside.
function FontDropdown({
  valueByLocale,
  fontsByLocale,
  onChange,
}: {
  valueByLocale: Record<string, string>;
  fontsByLocale: Record<string, FontOption[]>;
  onChange: (locale: string, family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Dedup by family — the Latin list is shared across en/es/fr, no
    // point requesting the same Google Fonts CSS three times. Collected
    // into ONE array and loaded via a single combined request (see
    // loadGoogleFonts' own comment for why this matters — it used to be
    // ~50 separate <link> insertions in a tight loop, which caused a
    // real site-wide performance hang, not just a cosmetic issue).
    const seen = new Set<string>();
    const toRequest: string[] = [];
    for (const locale of LOCALE_ORDER) {
      for (const f of fontsByLocale[locale] ?? []) {
        if (seen.has(f.family)) continue;
        seen.add(f.family);
        toRequest.push(f.family);
      }
    }
    loadGoogleFonts(toRequest);
  }, [open, fontsByLocale]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Scrolling inside the open list must never bleed through to the page
  // behind it — this toolbar floats (via portal) over live site content,
  // so without this a scroll-to-browse-fonts gesture was also scrolling
  // the whole page underneath. React's synthetic wheel handler is
  // PASSIVE by default (for scroll-perf reasons), which silently ignores
  // preventDefault() — same class of issue already solved elsewhere in
  // this codebase for Lenis conflicts: a native listener with
  // { passive: false } is required for preventDefault() to actually work.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const onWheelNative = (e: globalThis.WheelEvent) => {
      const atTop = el.scrollTop === 0 && e.deltaY < 0;
      const atBottom = el.scrollHeight - el.scrollTop === el.clientHeight && e.deltaY > 0;
      if (!atTop && !atBottom) e.stopPropagation();
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [open]);

  const setCount = LOCALE_ORDER.filter((l) => valueByLocale[l]).length;

  return (
    <div ref={rootRef} className="ace-font-dropdown" onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ace-font-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{setCount > 0 ? `Fonts \u2014 ${setCount} of 6 set` : 'Fonts (default for all)'}</span>
        <span className="ace-font-dropdown-caret" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div ref={listRef} className="ace-font-dropdown-list">
          {LOCALE_ORDER.map((locale) => {
            const fonts = fontsByLocale[locale] ?? [];
            if (fonts.length === 0) return null;
            const currentValue = valueByLocale[locale] ?? '';
            return (
              <div key={locale} className="ace-font-dropdown-group">
                <div className="ace-font-dropdown-group-label">{LOCALE_DISPLAY_NAMES[locale] ?? locale}</div>
                <button
                  type="button"
                  className={`ace-font-dropdown-option ${!currentValue ? 'ace-font-dropdown-option--active' : ''}`}
                  onClick={() => onChange(locale, '')}
                >
                  <span className="ace-font-dropdown-option-name">Default font</span>
                </button>
                {fonts.map((f) => (
                  <button
                    key={`${locale}-${f.family}`}
                    type="button"
                    className={`ace-font-dropdown-option ${currentValue === f.family ? 'ace-font-dropdown-option--active' : ''}`}
                    onClick={() => onChange(locale, f.family)}
                  >
                    <span className="ace-font-dropdown-option-line">
                      <strong>{f.family}</strong>
                      <span className="ace-font-dropdown-option-dash"> — </span>
                      <span
                        className="ace-font-override"
                        style={{ '--ace-font-override': `'${f.family}', inherit` } as CSSProperties}
                      >
                        {f.note}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          <div className="ace-font-dropdown-done-row">
            <button type="button" className="ace-editable-btn ace-editable-btn--sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditableText({ contentKey, defaultValue, as = 'span', className, style }: EditableTextProps) {
  const { editMode, resolve, save, saveWithCascade, resetToDefault } = useContent();
  const { locale } = useIdentity();
  const safeLocale: Locale = (locale ?? 'en') as Locale;
  // Reza: edits only ever happen in English — every other language
  // updates on its own via auto-translation. Non-English locales in edit
  // mode still get "Set to default" (to discard one bad translation
  // without touching English or the rest), but not Edit/Generate/Delete.
  const isMaster = safeLocale === 'en';

  const resolved = resolve(contentKey, safeLocale);
  const displayValue = resolved ?? defaultValue;

  // 2026-07-13 (per Reza) — font/color are stored as their OWN keys
  // (contentKey + '.font' / '.color'), never folded into the text value
  // itself. That keeps every existing resolve()/save() call across the
  // whole site working exactly as before — nothing had to change about
  // how plain text is stored, this is purely additive. They're PER-LOCALE
  // (not cascaded like text) since a font choice is a deliberate,
  // script-specific decision — Japanese text picking a Japanese font
  // shouldn't force that same pick onto the Korean or English versions.
  const fontKey = `${contentKey}.font`;
  const colorKey = `${contentKey}.color`;
  const resolvedFont = resolve(fontKey, safeLocale);
  const resolvedColor = resolve(colorKey, safeLocale);

  const ALL_LOCALES = ['en', 'es', 'fr', 'zh', 'ja', 'ko'] as const;

  // 2026-07-13 (per Reza) — the admin's Fonts management drawer stores
  // which of the curated fonts are actually enabled per language, as a
  // JSON array under a dedicated content_entries key. Nothing set yet ==
  // every curated font is available (a sensible default, not an empty
  // picker on first use).
  const availableFontsByLocale: Record<string, FontOption[]> = {};
  for (const loc of ALL_LOCALES) {
    const allForLoc = FONTS_BY_LOCALE[loc] ?? [];
    const enabledRaw = resolve('enabled-fonts', loc);
    if (!enabledRaw) {
      availableFontsByLocale[loc] = allForLoc;
      continue;
    }
    try {
      const enabledNames: string[] = JSON.parse(enabledRaw);
      const filtered = allForLoc.filter((f) => enabledNames.includes(f.family));
      availableFontsByLocale[loc] = filtered.length > 0 ? filtered : allForLoc;
    } catch {
      availableFontsByLocale[loc] = allForLoc;
    }
  }

  // The CURRENTLY-SAVED font for every language, keyed by locale — read
  // once per render, this is what the dropdown's checkmarks reflect and
  // what "Cancel" reverts the draft back to. Editing only ever happens in
  // the English panel, but the picker sets all six from right there.
  const resolvedFontByLocale: Record<string, string> = {};
  for (const loc of ALL_LOCALES) {
    resolvedFontByLocale[loc] = resolve(fontKey, loc) ?? '';
  }

  useEffect(() => {
    if (resolvedFont) loadGoogleFont(resolvedFont);
  }, [resolvedFont]);

  // 2026-07-13 (per Reza — root-caused via getComputedStyle in DevTools):
  // a plain inline `style={{fontFamily: ...}}` was being silently beaten
  // by some other rule on the page resolving to var(--font-mono) — this
  // is the ACTUAL rendering path visitors see, so this was the real bug,
  // not just the picker's own preview. CSS custom properties set via
  // inline style, read by a dedicated class with `!important`, reliably
  // wins regardless of what that other rule turns out to be.
  const presentationStyle: CSSProperties & { [key: `--${string}`]: string } = {
    ...style,
    ...(resolvedColor ? { color: resolvedColor } : {}),
  };
  if (resolvedFont) {
    presentationStyle['--ace-font-override'] = `'${resolvedFont}', ${style?.fontFamily ?? 'inherit'}`;
  }
  const presentationClassName = [className, resolvedFont ? 'ace-font-override' : ''].filter(Boolean).join(' ');

  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue);
  const [draftFontByLocale, setDraftFontByLocale] = useState<Record<string, string>>(resolvedFontByLocale);
  const [draftColor, setDraftColor] = useState(resolvedColor ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  // The toolbar is position:fixed, visually detached from the text (it
  // floats above it with a gap). Moving the mouse from the text to the
  // toolbar crosses that gap over OTHER elements, which fires a real
  // mouseleave on the text before the toolbar's mouseenter — so a plain
  // hover flag made the toolbar disappear the instant you moved toward
  // it. Fix: leaving either region schedules a hide a beat later;
  // entering EITHER region cancels that pending hide. Bridges the gap.
  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHovering(true);
  };
  const scheduleHide = () => {
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setHovering(false), 220);
  };

  // Fixed-position toolbar computed from the wrapper's real screen
  // position — NOT position:absolute relative to the wrapper. Most
  // sections on this site use `overflow: hidden` (for their own reveal/
  // curtain animations), which would silently clip an absolutely
  // positioned toolbar sitting above the text. position:fixed escapes
  // that entirely. Always centered directly over the text itself
  // (not floating above/below it) — guaranteed visible regardless of
  // scroll position, no viewport-edge cases to chase.
  useEffect(() => {
    if (!hovering && !editing && !notice) return;
    const update = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPos({ top: rect.top + rect.height / 2, left: rect.left + rect.width / 2 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hovering, editing, notice]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      setDraft(displayValue);
      setDraftFontByLocale(resolvedFontByLocale);
      setDraftColor(resolvedColor ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayValue, resolvedColor, editing, ...ALL_LOCALES.map((l) => resolvedFontByLocale[l])]);

  // Keep result/error notices visible for a few seconds even after the
  // mouse leaves — otherwise a cascade-translation failure notice could
  // disappear before anyone reads it (toolbar visibility was previously
  // hover-only).
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const Tag = as;

  if (!editMode) {
    return (
      <Tag className={presentationClassName || undefined} style={presentationStyle}>
        {displayValue}
      </Tag>
    );
  }

  const handleSave = async () => {
    setBusy(true);
    setNotice('Translating into 5 languages…');
    try {
      const { cascadeErrors } = await saveWithCascade(contentKey, draft);
      // Font is per-locale, saved directly (never cascaded) — a
      // Japanese-only typeface choice has no business overwriting the
      // English or Korean versions of this same piece of text. Every one
      // of the 6 languages is checked here (not just the current editing
      // locale), since this ONE English-panel dropdown is where all 6 get
      // set — editing never happens in the other 5 languages directly.
      await Promise.all(
        ALL_LOCALES.map(async (loc) => {
          const next = draftFontByLocale[loc] ?? '';
          const prev = resolvedFontByLocale[loc] ?? '';
          if (next === prev) return; // unchanged — skip the write entirely
          if (next) await save(fontKey, loc, 'text', next);
          else await resetToDefault(fontKey, loc); // cleared back to "Default font"
        })
      );
      if (draftColor) await save(colorKey, safeLocale, 'text', draftColor);
      setEditing(false);
      setNotice(cascadeErrors.length > 0 ? `Saved, but translation failed for: ${cascadeErrors.join(', ')}` : null);
    } catch {
      setNotice('Could not save — try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    setNotice('Asking the AI for a rewrite…');
    setEditing(true);
    try {
      const { suggestion } = await apiPost<{ suggestion: string }>(`/api/content/${encodeURIComponent(contentKey)}/generate-text`, {
        currentValue: displayValue,
      });
      setDraft(suggestion);
      setNotice('AI suggestion ready — review it, then Save (or Cancel to discard).');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'AI rewrite failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    // Distinct from Set-to-default: this stages an intentionally BLANK
    // override (cascaded to every language too), rather than reverting to
    // the compiled placeholder copy.
    setBusy(true);
    try {
      await saveWithCascade(contentKey, '');
      setEditing(false);
      setNotice(null);
    } catch {
      setNotice('Could not clear — try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await resetToDefault(contentKey, safeLocale);
      await resetToDefault(fontKey, safeLocale);
      await resetToDefault(colorKey, safeLocale);
      setEditing(false);
      setNotice(null);
    } catch {
      setNotice('Could not reset — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span
      ref={wrapRef}
      className="ace-editable-wrap"
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <Tag
        className={className}
        style={{
          ...style,
          outline: hovering || editing ? '1.5px dashed rgba(212,175,55,0.75)' : '1.5px dashed transparent',
          outlineOffset: '3px',
          transition: 'outline-color 0.2s ease',
        }}
      >
        {displayValue || <span style={{ opacity: 0.4 }}>({contentKey})</span>}
      </Tag>

      {(hovering || editing || notice) && toolbarPos &&
        createPortal(
          <span
            className="ace-editable-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: 'fixed',
              top: toolbarPos.top,
              left: toolbarPos.left,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {!editing ? (
              <>
                {isMaster ? (
                  <>
                    <button type="button" className="ace-editable-btn" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ace-editable-btn"
                      onClick={handleGenerate}
                      disabled={busy}
                    >
                      Generate
                    </button>
                    <button type="button" className="ace-editable-btn" onClick={handleDelete} disabled={busy}>
                      Delete
                    </button>
                  </>
                ) : (
                  <span className="ace-editable-notice" style={{ margin: 0 }}>
                    Switch to English to edit — this language updates automatically.
                  </span>
                )}
                <button
                  type="button"
                  className="ace-editable-btn"
                  onClick={handleReset}
                  disabled={busy || resolved === null}
                >
                  Set to default
                </button>
              </>
            ) : (
              <span className="ace-editable-editform">
                <textarea
                  className="ace-editable-textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  autoFocus
                />
                <span className="ace-editable-editform-style-row">
                  <FontDropdown
                    valueByLocale={draftFontByLocale}
                    fontsByLocale={availableFontsByLocale}
                    onChange={(loc, family) => setDraftFontByLocale((prev) => ({ ...prev, [loc]: family }))}
                  />
                  <input
                    type="color"
                    className="ace-editable-color"
                    value={draftColor || '#ffffff'}
                    onChange={(e) => setDraftColor(e.target.value)}
                    title="Text color"
                  />
                  {draftColor && (
                    <button
                      type="button"
                      className="ace-editable-btn ace-editable-btn--sm"
                      onClick={() => setDraftColor('')}
                      title="Clear color override"
                    >
                      ×
                    </button>
                  )}
                </span>
                <span className="ace-editable-editform-actions">
                  <button type="button" className="ace-editable-btn ace-editable-btn--save" onClick={handleSave} disabled={busy}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="ace-editable-btn"
                    onClick={() => {
                      setDraft(displayValue);
                      setDraftFontByLocale(resolvedFontByLocale);
                      setDraftColor(resolvedColor ?? '');
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                </span>
              </span>
            )}
            {notice && <span className="ace-editable-notice">{notice}</span>}
          </span>,
          document.body
        )}
    </span>
  );
}
