// ============================================================
// ACE-2026 — DevAudioTester (TEMPORARY, dev-only)
// A floating panel of buttons that plays local demo tracks through
// the real AudioContext so the LivingScore genre-morph + audio
// reactivity can be verified end-to-end WITHOUT S3, Admin, or the
// database. Each button calls the real playTrack(), so the full
// chain (analyser → useAudioReactive → LivingScore) runs for real.
//
// Renders ONLY in dev (import.meta.env.DEV). Safe to delete: remove
// this file and its <DevAudioTester/> mount in MainApp.
//
// Requires the demo media files to exist at:
//   public/media/track-cinematic.mp3
//   public/media/track-gaming.mp3
//   public/media/track-animation.mp3
//   public/media/track-ambient.mp3
//   public/media/cover-abstract.jpg
// ============================================================

import { useAudio } from '../context/AudioContext';
import { useAudioReactive } from '../hooks/useAudioReactive';
import type { AudioTrack } from '../types';

const ml = (s: string) => ({ en: s, es: s, fr: s, zh: s, ja: s, ko: s });

const COVER = '/media/cover-abstract.jpg';

const makeTrack = (
  id: string,
  title: string,
  genre: string,
  audioUrl: string,
): AudioTrack => ({
  id,
  title: ml(title) as AudioTrack['title'],
  narrative: ml('Local demo track for testing the Living Score.') as AudioTrack['narrative'],
  audioUrl,
  coverArt: {
    url: COVER,
    blurHash: '',
    width: 1000,
    height: 1000,
    format: 'jpg',
    dominantColors: [],
    vibrantPalette: null,
  },
  coverUrl: COVER,
  genre: genre as AudioTrack['genre'],
  bpm: null,
  mood: null,
  duration: 30,
  sortOrder: 0,
  isLive: true,
  createdAt: new Date().toISOString(),
  concept: null,
  isFeatured: false,
});

const DEMO: { label: string; track: AudioTrack }[] = [
  { label: 'Cinematic', track: makeTrack('demo-cinematic', 'Cinematic Teaser', 'Cinematic', '/media/track-cinematic.mp3') },
  { label: 'Gaming', track: makeTrack('demo-gaming', 'Pixel Fight', 'Synthwave 8-bit Arcade', '/media/track-gaming.mp3') },
  { label: 'Animation', track: makeTrack('demo-animation', 'Cartoon Comedy', 'Animation Playful Comedy', '/media/track-animation.mp3') },
  { label: 'Ambient', track: makeTrack('demo-ambient', 'Calm Piano', 'Ambient Piano Calm', '/media/track-ambient.mp3') },
];

const DevAudioTester = () => {
  const { playTrack, pauseTrack, audioState } = useAudio();
  const { bassLevel, midLevel, highLevel } = useAudioReactive();
  if (!import.meta.env.DEV) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 9999,
        width: 248,
        padding: 14,
        borderRadius: 14,
        background: 'rgba(10,10,12,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#fff',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.14em', marginBottom: 10 }}>
        DEV · LIVING SCORE
      </div>

      {/* live audio readout — confirms signal actually reaches the chain */}
      <div style={{ marginBottom: 10, fontSize: 9, letterSpacing: '0.06em' }}>
        {([['BASS', bassLevel], ['MID', midLevel], ['HIGH', highLevel]] as const).map(
          ([lab, val]) => (
            <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 30, opacity: 0.65 }}>{lab}</span>
              <span
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.min(100, val * 100)}%`,
                    background: '#3DF0FF',
                  }}
                />
              </span>
              <span style={{ width: 30, textAlign: 'right', opacity: 0.8 }}>
                {val.toFixed(2)}
              </span>
            </div>
          ),
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          justifyItems: 'stretch',
          gap: 8,
        }}
      >
        {DEMO.map(({ label, track }) => {
          const active = audioState.currentTrack?.id === track.id && audioState.isPlaying;
          return (
            <button
              key={track.id}
              onClick={() => void playTrack(track)}
              style={{
                width: '100%',
                cursor: 'pointer',
                padding: '9px 8px',
                borderRadius: 9,
                border: active ? '1px solid #fff' : '1px solid rgba(255,255,255,0.22)',
                background: active ? '#fff' : 'rgba(255,255,255,0.04)',
                color: active ? '#000' : '#e8e8e8',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => pauseTrack()}
        style={{
          marginTop: 8,
          width: '100%',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: 9,
          border: '1px solid rgba(255,255,255,0.22)',
          background: 'transparent',
          color: '#bbb',
          fontSize: 11,
          letterSpacing: '0.08em',
        }}
      >
        ❚❚  PAUSE
      </button>
    </div>
  );
};

export default DevAudioTester;
