import { useContent } from '../context/ContentContext';

/**
 * Mounted once in MainApp (fixed UI group). Renders nothing unless
 * ContentContext.editMode is true — then shows a small persistent pill so
 * the admin always has a visible, obvious way back out, and a reminder
 * they're looking at the live site in edit mode (not a preview copy).
 */
export default function EditModeIndicator() {
  const { editMode, exitEditMode } = useContent();
  if (!editMode) return null;

  return (
    <div
      className="fixed flex items-center gap-3"
      style={{
        // 2026-07-17 (site-wide responsive audit, per Reza): was a fixed
        // 1.25rem, which sat directly under PersistentAudioPlayer whenever
        // a track was playing WHILE editing (a very normal combination —
        // checking how a change sounds/looks is part of editing) — the
        // player's z-9999 beat this pill's z-500 and covered "Exit to
        // Admin". --pap-h (published by PersistentAudioPlayer itself, 0px
        // when no track is loaded) means this always clears the bar by
        // exactly 1.25rem of breathing room, at any of its three heights.
        bottom: 'calc(1.25rem + var(--pap-h, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        padding: '0.55rem 1.1rem',
        borderRadius: 999,
        background: 'rgba(8,8,10,0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(var(--accent-rgb), 0.4)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        transition: 'bottom 300ms ease',
      }}
    >
      <span
        className="font-mono uppercase"
        style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--accent-color)' }}
      >
        Editing live site
      </span>
      <button
        type="button"
        onClick={() => {
          exitEditMode();
          window.location.href = '/admin';
        }}
        className="font-mono uppercase"
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.15em',
          color: 'var(--text-color)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          padding: '0.3rem 0.75rem',
          cursor: 'pointer',
        }}
      >
        Exit to Admin
      </button>
    </div>
  );
}
