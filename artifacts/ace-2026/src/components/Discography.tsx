import { useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import type { AudioTrack } from '../types';

// Section 03 - Discography. Lists the composer's live tracks and plays them
// in the persistent audio player on click. Null-safe: shows an elegant empty
// state when there are no tracks yet (LAW 1/2).
export default function Discography() {
  const { tracks, locale } = useIdentity();
  const { playTrack, setPlaylist, audioState } = useAudio();
  const safeLocale = locale ?? 'en';

  const liveTracks = tracks.filter((t) => t.isLive);

  useEffect(() => {
    if (liveTracks.length > 0) setPlaylist(liveTracks);
  }, [liveTracks, setPlaylist]);

  const titleOf = (t: AudioTrack) =>
    (t.title as unknown as Record<string, string>)[safeLocale] || t.title?.en || 'Untitled';

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // Build a refined, dot-separated metadata line (genre / BPM / mood).
  const metaOf = (t: AudioTrack) => {
    const parts: string[] = [];
    if (t.genre) parts.push(String(t.genre));
    if (t.bpm) parts.push(`${t.bpm} BPM`);
    if (t.mood) parts.push(String(t.mood));
    return parts.join('  \u00B7  ');
  };

  return (
    <section
      id="discography"
      className="relative w-full living-veil"
      style={{ color: 'var(--text-color)', padding: 'clamp(5rem, 11vw, 9rem) clamp(1.5rem, 8vw, 9rem)' }}
    >
      {/* Heading — restrained, with a kicker like the other sections */}
      <div className="mb-14 md:mb-20">
        <span
          className="font-mono uppercase"
          style={{ fontSize: '0.7rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}
        >
          Section 03
        </span>
        <h2
          className="font-display font-light mt-5"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.6rem)', lineHeight: 1.05, letterSpacing: '0.01em', color: 'var(--text-color)' }}
        >
          Discography
        </h2>
      </div>

      {liveTracks.length === 0 ? (
        <div
          className="w-full flex items-center justify-center py-24"
          style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted-color)' }}
        >
          <p style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', fontSize: '0.8rem' }}>No tracks published yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {liveTracks.map((track, i) => {
            const active = audioState.currentTrack?.id === track.id;
            // API returns raw `coverUrl`; the front-end type expects `coverArt.url`.
            const cover = track.coverArt?.url || (track as unknown as { coverUrl?: string }).coverUrl || '';
            return (
              <li key={track.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => void playTrack(track)}
                  data-cursor="play"
                  className="group w-full flex items-center text-left"
                  style={{
                    gap: 'clamp(1rem, 2.5vw, 2rem)',
                    padding: 'clamp(1.1rem, 2.2vw, 1.6rem) 0.25rem',
                    transition: 'opacity 0.5s ease, padding-left 0.5s cubic-bezier(0.5,0,0.2,1)',
                    opacity: active ? 1 : 0.92,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.paddingLeft = '1.25rem'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.paddingLeft = '0.25rem'; e.currentTarget.style.opacity = active ? '1' : '0.92'; }}
                  aria-label={`Play ${titleOf(track)}`}
                >
                  {/* index */}
                  <span
                    className="font-mono flex-shrink-0"
                    style={{ fontSize: '0.72rem', letterSpacing: '0.15em', width: '2.2rem', color: active ? 'var(--accent-color)' : 'var(--text-dim-color)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* cover */}
                  <span
                    className="rounded-md overflow-hidden flex-shrink-0"
                    style={{ width: 'clamp(2.6rem, 4vw, 3.4rem)', height: 'clamp(2.6rem, 4vw, 3.4rem)', backgroundColor: 'var(--surface3-color)' }}
                  >
                    {cover && <img src={cover} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />}
                  </span>

                  {/* title + meta */}
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate font-display font-light"
                      style={{ fontSize: 'clamp(1.05rem, 1.8vw, 1.4rem)', letterSpacing: '0.01em', color: active ? 'var(--accent-color)' : 'var(--text-color)', transition: 'color 0.4s ease' }}
                    >
                      {titleOf(track)}
                    </span>
                    {metaOf(track) && (
                      <span
                        className="block truncate font-mono mt-1.5"
                        style={{ fontSize: '0.68rem', letterSpacing: '0.08em', color: 'var(--text-muted-color)' }}
                      >
                        {metaOf(track)}
                      </span>
                    )}
                  </span>

                  {/* duration */}
                  {track.duration ? (
                    <span
                      className="font-mono flex-shrink-0"
                      style={{ fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-muted-color)' }}
                    >
                      {fmt(track.duration)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {/* closing hairline */}
          <li style={{ borderTop: '1px solid var(--border-color)' }} aria-hidden />
        </ul>
      )}
    </section>
  );
}
