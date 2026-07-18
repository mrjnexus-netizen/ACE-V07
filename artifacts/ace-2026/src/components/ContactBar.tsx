import type { CSSProperties, ReactNode } from 'react';
import { useT } from '../context/TranslationContext';

/**
 * Persistent CONTACT bar (blueprint T1-T3).
 * Reference: codepen.io/techgirldiaries/pen/LYWqXrV (round icon buttons
 * that expand on hover to reveal the network name, brand hover color).
 *
 * Adaptation for this site (per MEGA_MASTER §5.T):
 * - Kept: the expand-on-hover pill -> reveal network name interaction.
 * - Discarded: the demo's white gradient background, solid brand-color
 *   icon fills, and its credit footer.
 * - Ours: a thin, hairline-glass fixed top bar built on the same Button
 *   System language as the rest of the site (.bloom-style hover, luxury
 *   easing) — accent-glow by default, with only a subtle per-network hue
 *   tint on hover instead of a solid brand block.
 * - Hand-drawn inline SVG icons (no icon-library dependency, matching the
 *   rest of the project's zero-new-dependency convention).
 * - Mounts only once `locale` is set (MainApp already gates everything on
 *   this), and is `position: fixed`, so it persists across every scroll
 *   and section, above regular content but below the concept-overlay
 *   modal (`zIndex: 9999` in WorksGallery) — see zIndex below.
 * - Channels are hardcoded placeholders for now; blueprint marks these as
 *   admin-editable content once Phase 4 (A3a content system) exists —
 *   swapping to a content-driven list later is a one-line change here.
 */

interface ContactChannel {
  id: string;
  label: string;
  href: string;
  /** Per-network glow tint on hover, "r,g,b" — falls back to --accent-rgb. */
  hue: string;
  icon: ReactNode;
}

const ICON_SIZE = 18;
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: ICON_SIZE,
  height: ICON_SIZE,
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

function LinkedInIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="7.5" y1="10" x2="7.5" y2="16.5" />
      <circle cx="7.5" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11.5 16.5v-4c0-1.4 1-2.4 2.3-2.4s2.2 1 2.2 2.4v4" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CHANNELS: ContactChannel[] = [
  { id: 'email', label: 'Email', href: 'mailto:contact@amirmoslehi.com', hue: '212,175,55', icon: <EmailIcon /> },
  { id: 'instagram', label: 'Instagram', href: 'https://instagram.com/amirmoslehi', hue: '225,48,108', icon: <InstagramIcon /> },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/amirmoslehi', hue: '10,102,194', icon: <LinkedInIcon /> },
  { id: 'youtube', label: 'YouTube', href: 'https://youtube.com/@amirmoslehi', hue: '255,20,20', icon: <YouTubeIcon /> },
];

export default function ContactBar() {
  const { t } = useT();

  return (
    <nav
      className="fixed top-0 left-0 right-0"
      // 2026-07-17 (site-wide responsive audit, per Reza): bumped 44 -> 48
      // to match SoundToggle's own 48px control size, and to give the
      // pills room now that they grow to a proper 44px touch target on
      // coarse (touch) pointers (see .contactbar-pill in index.css).
      style={{ zIndex: 200, height: 48, pointerEvents: 'none' }}
      aria-label={t('Contact')}
    >
      {/* hairline glass backdrop, separate layer so the pills row can opt
          back into pointer events without the whole strip capturing them */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(var(--surface-rgb), 0.5)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(var(--accent-rgb), 0.14)',
        }}
      />
      <div
        className="relative h-full flex items-center justify-end gap-2"
        style={{ padding: '0 clamp(1rem, 3vw, 2.5rem)', pointerEvents: 'auto' }}
      >
        {CHANNELS.map((c) => (
          <a
            key={c.id}
            href={c.href}
            target={c.id === 'email' ? undefined : '_blank'}
            rel={c.id === 'email' ? undefined : 'noreferrer'}
            className="contactbar-pill"
            style={{ '--pill-hue': c.hue } as CSSProperties}
            aria-label={t(c.label)}
          >
            <span className="contactbar-pill-icon">{c.icon}</span>
            <span className="contactbar-pill-label font-mono">{t(c.label)}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
