import { useState, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAdmin } from '../context/AdminContext';

export const Footer = () => {
  const { composerIdentity } = useIdentity();
  const { openAdmin } = useAdmin();
  const [tapCount, setTapCount] = useState(0);
  const [lastTap, setLastTap] = useState(0);

  const socialLinks = composerIdentity?.socialLinks;

  const handleTripleTap = () => {
    const now = Date.now();
    if (now - lastTap < 500) {
      setTapCount(prev => prev + 1);
    } else {
      setTapCount(1);
    }
    setLastTap(now);
  };

  useEffect(() => {
    if (tapCount === 3) {
      openAdmin();
      setTapCount(0);
    }
  }, [tapCount, openAdmin]);

  return (
    <footer className="border-t border-border bg-surface/50 backdrop-blur-sm py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div
            onClick={handleTripleTap}
            className="text-2xl font-display tracking-wider text-accent cursor-pointer select-none"
            aria-label="ACE logo (triple tap for admin)"
          >
            ACE
          </div>
          <div className="text-xs text-text-muted">
            © {new Date().getFullYear()} ACE-2026. All rights reserved.
          </div>
          {socialLinks && (
            <div className="flex space-x-4">
              {socialLinks.spotify && (
                <a href={socialLinks.spotify} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent transition">
                  Spotify
                </a>
              )}
              {socialLinks.imdb && (
                <a href={socialLinks.imdb} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent transition">
                  IMDb
                </a>
              )}
              {socialLinks.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent transition">
                  Instagram
                </a>
              )}
              {socialLinks.youtube && (
                <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent transition">
                  YouTube
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};