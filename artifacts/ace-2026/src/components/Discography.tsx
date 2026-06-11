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

  return (
    <section
      id="discography"
      className="relative w-full px-6 md:px-16 py-24"
      style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}
    >
      <h2
        className="font-display mb-12"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 4rem)', letterSpacing: 'var(--letter-spacing-base)' }}
      >
        Discography
      </h2>

      {liveTracks.length === 0 ? (
        <div
          className="w-full rounded-lg flex items-center justify-center py-24"
          style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted-color)' }}
        >
          <p style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>No tracks published yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-px" style={{ backgroundColor: 'var(--border-color)' }}>
          {liveTracks.map((track, i) => {
            const active = audioState.currentTrack?.id === track.id;
            const cover = track.coverArt?.url || '';
            return (
              <li key={track.id}>
                <button
                  onClick={() => void playTrack(track)}
                  className="group w-full flex items-center gap-5 px-5 py-5 text-left transition-colors"
                  style={{ backgroundColor: active ? 'var(--surface2-color)' : 'var(--surface-color)' }}
                  aria-label={`Play ${titleOf(track)}`}
                >
                  <span
                    className="font-mono text-sm w-8 flex-shrink-0"
                    style={{ color: active ? 'var(--accent-color)' : 'var(--text-dim-color)', fontFamily: 'var(--font-mono)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="w-14 h-14 rounded overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: 'var(--surface3-color)' }}
                  >
                    {cover && <img src={cover} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-lg"
                      style={{ fontFamily: 'var(--font-display)', color: active ? 'var(--accent-color)' : 'var(--text-color)' }}
                    >
                      {titleOf(track)}
                    </span>
                    <span className="block truncate text-xs mt-1" style={{ color: 'var(--text-muted-color)', fontFamily: 'var(--font-mono)' }}>
                      {track.genre}
                      {track.bpm ? ` · ${track.bpm} BPM` : ''}
                      {track.mood ? ` · ${track.mood}` : ''}
                    </span>
                  </span>
                  {track.duration ? (
                    <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-muted-color)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(track.duration)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}