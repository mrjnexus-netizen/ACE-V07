import { useIdentity } from '../context/IdentityContext';
import { useT } from '../context/TranslationContext';
import EditableText from './EditableText';
import CreatorMark from './CreatorMark';

// Luxury cinematic footer (2026-07-02 redesign). Self-contained .ftr-* classes
// (see the Footer block appended to index.css) so it never depends on the
// Tailwind utility pipeline for critical visibility (blueprint lesson 2.5-2).
// Themed entirely off --accent-color / --accent-rgb -> auto re-themes per language.

type IconProps = { path: string; label: string };

const SOCIAL_ICONS: Record<string, string> = {
  // Simple, single-path brand glyphs (simple-icons style, generic silhouettes)
  spotify:
    'M12 2a10 10 0 100 20 10 10 0 000-20zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 11-.277-1.215c3.809-.871 7.077-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 11-.452-1.492c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 01-.955 1.609z',
  imdb:
    'M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm2.2 3.2v7.6h1.9V8.2H5.2zm3.1 0v7.6h1.7v-5l1 5h1.2l1-5.1v5.1h1.7V8.2h-2.5l-.8 4-.8-4H8.3zm8.4 0v7.6h2.3c1.4 0 2.2-.6 2.2-2.3v-3c0-1.7-.8-2.3-2.2-2.3h-2.3zm1.9 1.3h.3c.5 0 .6.2.6.8v2.6c0 .6-.1.8-.6.8h-.3V9.5z',
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38A5.85 5.85 0 00.63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.12-1.38.66-.66 1.08-1.33 1.38-2.12.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.12A5.85 5.85 0 0019.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 105.84 12 6.16 6.16 0 0012 5.84zm0 10.16A4 4 0 1116 12a4 4 0 01-4 4zm6.4-11.85a1.44 1.44 0 11-1.44-1.44 1.44 1.44 0 011.44 1.44z',
  youtube:
    'M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.6V8.4l6.24 3.6z',
};

export const Footer = () => {
  const { composerIdentity } = useIdentity();
  const { t } = useT();

  // TEMPORARY placeholder social links (2026-07-02): composerIdentity.socialLinks
  // is currently empty in the DB - no admin panel exists yet to set it (Phase 4 /
  // A3a of the blueprint). These placeholders keep the Footer visually correct
  // now; once the admin content system ships, this component should read
  // exclusively from composerIdentity.socialLinks (already wired below) and this
  // fallback block can be deleted. DO NOT remove the composerIdentity path.
  const PLACEHOLDER_SOCIAL_LINKS = {
    spotify: 'https://open.spotify.com/',
    imdb: 'https://www.imdb.com/',
    instagram: 'https://www.instagram.com/',
    youtube: 'https://www.youtube.com/',
  };
  const socialLinks = composerIdentity?.socialLinks || PLACEHOLDER_SOCIAL_LINKS;

  const links: Array<{ key: keyof typeof SOCIAL_ICONS; url?: string | null; label: string }> = [
    { key: 'spotify', url: socialLinks?.spotify, label: 'Spotify' },
    { key: 'imdb', url: socialLinks?.imdb, label: 'IMDb' },
    { key: 'instagram', url: socialLinks?.instagram, label: 'Instagram' },
    { key: 'youtube', url: socialLinks?.youtube, label: 'YouTube' },
  ];
  const active = links.filter((l) => !!l.url);

  return (
    <footer className="ftr">
      <div className="ftr-rule" aria-hidden="true" />
      <div className="ftr-inner">
        <div className="ftr-sig">
          <span className="ftr-sig-name">
            <EditableText contentKey="identity.name" defaultValue="Amir Moslehi" as="span" />
          </span>
          <span className="ftr-sig-sub">
            <EditableText contentKey="footer.subtitle" defaultValue={t('THE COMPOSER')} as="span" />
          </span>
        </div>

        {active.length > 0 && (
          <nav className="ftr-social" aria-label={t('Social links')}>
            {active.map((l) => (
              <a
                key={l.key}
                href={l.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="ftr-icon"
                aria-label={l.label}
                title={l.label}
              >
                <span className="ftr-icon-bloom" aria-hidden="true" />
                <svg viewBox="0 0 24 24" className="ftr-icon-svg" aria-hidden="true">
                  <path d={SOCIAL_ICONS[l.key]} />
                </svg>
              </a>
            ))}
          </nav>
        )}

        <div className="ftr-copy">
          © {new Date().getFullYear()} <EditableText contentKey="identity.name" defaultValue="Amir Moslehi" as="span" />.{' '}
          <EditableText contentKey="footer.rights" defaultValue={t('All rights reserved.')} as="span" />
        </div>

        <CreatorMark />
      </div>
    </footer>
  );
};

export default Footer;
