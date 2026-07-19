import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * CreatorMark — a small, quiet "seal" easter egg near Amir's own footer
 * signature (2026-07-18, per Reza).
 *
 * v4 (per Reza's design review of v3): v3 tried a hand-illustrated
 * low-poly human figure at a desk — without any way to visually iterate
 * on freehand SVG geometry before shipping it, that came out looking
 * incoherent rather than deliberate. v4 drops figurative illustration
 * entirely in favor of something built from primitives that reliably
 * look intentional: a plaque, corner accents, and typography.
 *
 * v13 (per Reza, after MANY rounds where clicking still did nothing —
 * confirmed step by step via DevTools: right-click→Inspect correctly
 * resolved to the plaque (hit-testing was fine); neither onClick,
 * onPointerUp, NOR a native addEventListener('click') ever fired;
 * even `document.querySelector('.crm-seal').click()` run directly in
 * the Console — completely bypassing any real mouse/browser event path
 * — produced nothing. That last test is the smoking gun: if a
 * programmatic .click() call does nothing, the problem was never the
 * click event at all — it's what happens AFTER state changes, during
 * render. Sitting right there in the Console the whole time: "Content
 * Security Policy of your site blocks the use of 'eval' in JavaScript."
 * framer-motion's AnimatePresence/motion.div (used for this modal's
 * enter/exit animation) apparently hits an eval/Function-constructor
 * code path internally for something in its animation pipeline — CSP
 * blocks it, the render of the portaled tree throws, and because
 * nothing above it uses an error boundary that shows visible fallback
 * UI, the failure is completely silent: setOpen(true) runs fine (it's
 * plain React state), but the new tree never successfully commits to
 * the DOM. Fix: framer-motion removed from this file entirely. The
 * modal is now plain conditional rendering with a CSS @keyframes
 * entrance (the exact same technique already used below for the
 * signature sweep, which HAS been working this whole time — further
 * confirming framer-motion specifically, not React or CSS in general,
 * was the actual problem).
 *
 * Colors use var(--accent-color)/var(--accent-rgb) throughout, so this
 * follows the site's own per-language color system (ChromaticContext)
 * rather than a fixed hex. Sized modestly on purpose — it should never
 * compete with Amir's own signature for attention.
 */
// 2026-07-18 (per Reza): the only real contact detail available for now.
// Kept as named constants (not buried in JSX) so swapping any of these for
// something dynamic later -- e.g. the Telegram-bot-managed content source
// Reza's planning once the site ships, so HE can update them without a
// developer -- is a one-line change here, not a hunt through the
// component. The three without a real destination yet just link nowhere
// (`#`, click suppressed) until Reza has them.
const CONTACT_EMAIL = 'Mr.j.nexus@gmail.com';
const INSTAGRAM_URL = '';
const WEBSITE_URL = '';
const TELEGRAM_URL = '';
const WHATSAPP_URL = '';

// Same minimal geometric line-icon convention as ContactBar.tsx (fill:none,
// currentColor stroke, rounded caps/joins) so this reads as part of the
// same icon family as the header's own contact icons, not a mismatched
// import.
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 18,
  height: 18,
};

function EmailIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function WebsiteIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path d="M20.5 4.5l-17 7.3 5.3 1.8" />
      <path d="M8.8 13.6l1.4 5.8 2.4-3.4 4.5 3.4 3.4-15.4-11.7 9.6" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path d="M6 20l1.1-3.4A8 8 0 1 1 10.4 19L6 20z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5 0.8 0 1-0.6 1-1.1v-1.1l-2-0.6-0.7 0.9a4 4 0 0 1-2.9-2.9l0.9-0.7-0.6-2H9.1c-0.1 0-0.1 0-0.1 0.1z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function CreatorMark() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 2026-07-18 (per Reza, final polish pass): opening had a CSS entrance
  // animation, but closing had none at all — clicking Close just
  // instantly unmounted the whole thing. handleClose plays a reverse
  // animation (the `crm-fs-closing` class below) for CLOSE_MS, THEN
  // actually unmounts — same two-state "closing, then gone" pattern used
  // for exit transitions everywhere else on this site that don't use
  // framer-motion's AnimatePresence.
  const CLOSE_MS = 320;
  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  // Belt-and-suspenders click handling, kept from earlier rounds even
  // though the real bug turned out to be downstream of this (see file
  // comment) — doesn't hurt to keep three independent trigger paths.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const onNativeClick = () => setOpen(true);
    el.addEventListener('click', onNativeClick);
    return () => el.removeEventListener('click', onNativeClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="crm-seal"
        onClick={() => setOpen(true)}
        onPointerUp={() => setOpen(true)}
        aria-label="A small seal — click for the full credit"
      >
        <div className="crm-seal-plaque">
          <span className="crm-seal-corner crm-seal-corner--tl" aria-hidden="true" />
          <span className="crm-seal-corner crm-seal-corner--tr" aria-hidden="true" />
          <span className="crm-seal-corner crm-seal-corner--bl" aria-hidden="true" />
          <span className="crm-seal-corner crm-seal-corner--br" aria-hidden="true" />
          <div className="crm-seal-sign-stack">
            <span className="crm-seal-signtext">Mr.J</span>
            <span className="crm-seal-nexus">Nexus</span>
          </div>
        </div>
        <div className="crm-seal-tag">
          <span className="crm-seal-tag-main">Site Design &amp; Engineering</span>
        </div>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={`crm-fs-backdrop ${closing ? 'crm-fs-closing' : ''}`} onMouseDown={handleClose}>
            <div className={`crm-fs-box ${closing ? 'crm-fs-closing' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
              <div className="crm-fs-frame">
                <video
                  className="crm-fs-video"
                  src="/mrj-signature.webm"
                  autoPlay
                  muted
                  playsInline
                  aria-hidden="true"
                />

                <div className="crm-fs-socials">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="crm-fs-social" aria-label="Email">
                    <EmailIcon />
                  </a>
                  <a
                    href={INSTAGRAM_URL || undefined}
                    className="crm-fs-social"
                    aria-label="Instagram"
                    onClick={(e) => { if (!INSTAGRAM_URL) e.preventDefault(); }}
                    target={INSTAGRAM_URL ? '_blank' : undefined}
                    rel={INSTAGRAM_URL ? 'noopener noreferrer' : undefined}
                  >
                    <InstagramIcon />
                  </a>
                  <a
                    href={WEBSITE_URL || undefined}
                    className="crm-fs-social"
                    aria-label="Website"
                    onClick={(e) => { if (!WEBSITE_URL) e.preventDefault(); }}
                    target={WEBSITE_URL ? '_blank' : undefined}
                    rel={WEBSITE_URL ? 'noopener noreferrer' : undefined}
                  >
                    <WebsiteIcon />
                  </a>
                  <a
                    href={TELEGRAM_URL || undefined}
                    className="crm-fs-social"
                    aria-label="Telegram"
                    onClick={(e) => { if (!TELEGRAM_URL) e.preventDefault(); }}
                    target={TELEGRAM_URL ? '_blank' : undefined}
                    rel={TELEGRAM_URL ? 'noopener noreferrer' : undefined}
                  >
                    <TelegramIcon />
                  </a>
                  <a
                    href={WHATSAPP_URL || undefined}
                    className="crm-fs-social"
                    aria-label="WhatsApp"
                    onClick={(e) => { if (!WHATSAPP_URL) e.preventDefault(); }}
                    target={WHATSAPP_URL ? '_blank' : undefined}
                    rel={WHATSAPP_URL ? 'noopener noreferrer' : undefined}
                  >
                    <WhatsAppIcon />
                  </a>
                </div>
              </div>

              <button type="button" className="crm-fs-close" onClick={handleClose} aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
                  <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
