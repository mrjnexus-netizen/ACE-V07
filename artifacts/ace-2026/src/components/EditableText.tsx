import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useContent } from '../context/ContentContext';
import { useIdentity } from '../context/IdentityContext';
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
export default function EditableText({ contentKey, defaultValue, as = 'span', className, style }: EditableTextProps) {
  const { editMode, resolve, saveWithCascade, resetToDefault } = useContent();
  const { locale } = useIdentity();
  const safeLocale: Locale = (locale ?? 'en') as Locale;
  // Reza: edits only ever happen in English — every other language
  // updates on its own via auto-translation. Non-English locales in edit
  // mode still get "Set to default" (to discard one bad translation
  // without touching English or the rest), but not Edit/Generate/Delete.
  const isMaster = safeLocale === 'en';

  const resolved = resolve(contentKey, safeLocale);
  const displayValue = resolved ?? defaultValue;

  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue);
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
  // that entirely, so this works inside any section without needing to
  // know its overflow settings.
  useEffect(() => {
    if (!hovering && !editing && !notice) return;
    const update = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPos({ top: Math.max(8, rect.top - 8), left: rect.left });
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
    if (!editing) setDraft(displayValue);
  }, [displayValue, editing]);

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
      <Tag className={className} style={style}>
        {displayValue}
      </Tag>
    );
  }

  const handleSave = async () => {
    setBusy(true);
    setNotice('Translating into 5 languages…');
    try {
      const { cascadeErrors } = await saveWithCascade(contentKey, draft);
      setEditing(false);
      setNotice(cascadeErrors.length > 0 ? `Saved, but translation failed for: ${cascadeErrors.join(', ')}` : null);
    } catch {
      setNotice('Could not save — try again.');
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

      {(hovering || editing || notice) && toolbarPos && (
        <span
          className="ace-editable-toolbar"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            position: 'fixed',
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: 'translateY(-100%)',
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
                    onClick={() => setNotice('AI rewrite is coming soon (needs an A3b model selected).')}
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
              <span className="ace-editable-editform-actions">
                <button type="button" className="ace-editable-btn ace-editable-btn--save" onClick={handleSave} disabled={busy}>
                  Save
                </button>
                <button
                  type="button"
                  className="ace-editable-btn"
                  onClick={() => {
                    setDraft(displayValue);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </span>
            </span>
          )}
          {notice && <span className="ace-editable-notice">{notice}</span>}
        </span>
      )}
    </span>
  );
}
