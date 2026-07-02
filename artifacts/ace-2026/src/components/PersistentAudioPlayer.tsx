import { useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { useIdentity } from '../context/IdentityContext';
import WaveformRenderer from './WaveformRenderer';
import { useT } from '../context/TranslationContext';

// Inline SVG icons (no emoji / no unicode glyphs — they corrupt across encodings)
const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const PREV = 'M6 6h2v12H6zm3.5 6l8.5 6V6z';
const NEXT = 'M16 6h2v12h-2zM6 18l8.5-6L6 6z';
const VOL = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z';
const MUTE = 'M3 9v6h4l5 5V4L7 9H3zm13 0l5 6m0-6l-5 6';

export default function PersistentAudioPlayer() {
  const { audioState, resumeTrack, pauseTrack, seekTrack, setVolume, setMuted, nextTrack, prevTrack } = useAudio();
  const { locale } = useIdentity();
  const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, dominantColors } = audioState;
  const safeLocale = locale ?? 'en';
  const { t } = useT();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  if (!currentTrack) return null;

  const handlePlayPause = () => { if (isPlaying) pauseTrack(); else void resumeTrack(); };
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTrack(((e.clientX - rect.left) / rect.width) * duration);
  };
  const handleMobileExpand = () => { if (window.innerWidth < 768) setMobileExpanded(prev => !prev); };
  const formatTime = (t: number) => { const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; };
  const shadowColor = dominantColors?.vibrant ? `rgba(${hexToRgb(dominantColors.vibrant)}, 0.15)` : 'rgba(var(--accent-rgb), 0.15)';
  const coverUrl = currentTrack.coverArt?.url || '';
  const title = (currentTrack.title as unknown as Record<string, string>)[safeLocale] || currentTrack.title?.en || '';
  const genre = currentTrack.genre || '';
  const bpm = currentTrack.bpm ? `${currentTrack.bpm} BPM` : '';

  return (
    <div style={{ backdropFilter: 'blur(40px) saturate(200%) brightness(0.8)', WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.8)', background: 'rgba(var(--surface-rgb), 0.55)', borderTop: '1px solid var(--border-color)', height: mobileExpanded ? 120 : 56, boxShadow: `0 -4px 40px ${shadowColor}`, transition: 'box-shadow 800ms ease, height 300ms' }}
      className="fixed bottom-0 left-0 right-0 z-[9999]" onClick={handleMobileExpand}>
      <div className="hidden md:flex items-center h-[72px] px-6 gap-4">
        <div className="w-[52px] h-[52px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
          {coverUrl && <img src={coverUrl} alt={title} className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`} onLoad={() => setImageLoaded(true)} />}
          {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
        </div>
        <div className="min-w-0"><p className="text-sm font-semibold truncate" style={{ color: 'var(--text-color)' }}>{title}</p><p className="text-xs truncate" style={{ color: 'var(--text-muted-color)' }}>{genre}{bpm ? ` | ${bpm}` : ''}</p></div>
        <div className="flex-1 h-10 cursor-pointer" onClick={handleProgressClick}><WaveformRenderer /><div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted-color)' }}><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
        <div className="flex items-center gap-4" style={{ color: 'var(--text-color)' }}>
          <button onClick={prevTrack} className="hover:text-[var(--accent-color)]" aria-label={t('Previous track')}><Icon d={PREV} /></button>
          <button onClick={handlePlayPause} className="btn btn--media btn--media-sm" aria-label={isPlaying ? t('Pause') : t('Play')}><span className="ring" aria-hidden="true" /><span className="bloom" aria-hidden="true" /><Icon d={isPlaying ? PAUSE : PLAY} size={20} /></button>
          <button onClick={nextTrack} className="hover:text-[var(--accent-color)]" aria-label={t('Next track')}><Icon d={NEXT} /></button>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-color)' }}>
          <button onClick={() => setMuted(!isMuted)} className="hover:text-[var(--accent-color)]" aria-label={isMuted ? t('Unmute') : t('Mute')}><Icon d={isMuted ? MUTE : VOL} /></button>
          <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => setVolume(parseFloat(e.target.value))} className="w-20 h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--accent-color)' }} aria-label={t('Volume')} />
        </div>
      </div>
      <div className="flex md:hidden flex-col h-full" style={{ color: 'var(--text-color)' }}>
        <div className="flex items-center px-3 py-1 gap-3">
          <div className="w-[36px] h-[36px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
            {coverUrl && <img src={coverUrl} alt={title} className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`} onLoad={() => setImageLoaded(true)} />}
            {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
          </div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold truncate" style={{ color: 'var(--text-color)' }}>{title}</p><p className="text-[10px] truncate" style={{ color: 'var(--text-muted-color)' }}>{genre}</p></div>
          <button onClick={handlePlayPause} className="btn btn--media btn--media-sm" aria-label={isPlaying ? t('Pause') : t('Play')}><span className="ring" aria-hidden="true" /><span className="bloom" aria-hidden="true" /><Icon d={isPlaying ? PAUSE : PLAY} size={16} /></button>
        </div>
        {mobileExpanded && (
          <div className="flex flex-col px-3 pb-2 gap-2">
            <div className="h-10 cursor-pointer" onClick={handleProgressClick}><WaveformRenderer /></div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3"><button onClick={prevTrack} aria-label={t('Previous track')}><Icon d={PREV} /></button><button onClick={nextTrack} aria-label={t('Next track')}><Icon d={NEXT} /></button></div>
              <div className="flex items-center gap-2"><button onClick={() => setMuted(!isMuted)} aria-label={isMuted ? t('Unmute') : t('Mute')}><Icon d={isMuted ? MUTE : VOL} /></button><input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => setVolume(parseFloat(e.target.value))} className="w-16 h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--accent-color)' }} aria-label={t('Volume')} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r && r[1] && r[2] && r[3] ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '212, 175, 55'; }
