import { useState, useRef } from 'react';
import { useAudio } from '../context/AudioContext';
import { useIdentity } from '../context/IdentityContext';
import WaveformRenderer from './WaveformRenderer';

const PersistentAudioPlayer = () => {
  const {
    audioState,
    resumeTrack,
    pauseTrack,
    seekTrack,
    setVolume,
    setMuted,
    nextTrack,
    prevTrack,
  } = useAudio();
  const { locale } = useIdentity();
  const {
    isPlaying,
    currentTrack,
    currentTime,
    duration,
    volume,
    isMuted,
    dominantColors,
  } = audioState;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  if (!currentTrack) return null;

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      resumeTrack();
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    seekTrack(percentage * duration);
  };

  const handleMobileExpand = () => {
    if (window.innerWidth < 768) {
      setMobileExpanded((prev) => !prev);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const shadowColor = dominantColors?.vibrant
    ? `rgba(${hexToRgb(dominantColors.vibrant)}, 0.15)`
    : 'rgba(var(--accent-rgb), 0.15)';

  const shadowStyle = {
    boxShadow: `0 -4px 40px ${shadowColor}`,
    transition: 'box-shadow 800ms ease',
  };

  const coverUrl = currentTrack.coverArt?.url || '';
  const title = currentTrack.title?.[locale] || currentTrack.title?.en || '';
  const genre = currentTrack.genre || '';
  const bpm = currentTrack.bpm ? `${currentTrack.bpm} BPM` : '';

  return (
    <div
      style={{
        backdropFilter: 'blur(40px) saturate(200%) brightness(0.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.8)',
        background: 'rgba(var(--surface-rgb), 0.55)',
        borderTop: '1px solid var(--border-color)',
        height: mobileExpanded ? 120 : 56,
        ...shadowStyle,
      }}
      className="fixed bottom-0 left-0 right-0 z-[9999] transition-all duration-300"
      onClick={handleMobileExpand}
    >
      {/* Desktop Layout */}
      <div className="hidden md:flex items-center h-[72px] px-6 gap-4">
        <div className="w-[52px] h-[52px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
          {coverUrl && (
            <img
              src={coverUrl}
              alt={title}
              className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}
              onLoad={() => setImageLoaded(true)}
            />
          )}
          {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-color)' }}>
            {title}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted-color)' }}>
            {genre}{bpm ? ` | ${bpm}` : ''}
          </p>
        </div>

        <div className="flex-1 h-10 cursor-pointer" onClick={handleProgressClick}>
          <WaveformRenderer />
          <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted-color)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={prevTrack} className="hover:text-[var(--accent-color)] transition-colors" aria-label="Previous">?</button>
          <button
            onClick={handlePlayPause}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '?' : '??'}
          </button>
          <button onClick={nextTrack} className="hover:text-[var(--accent-color)] transition-colors" aria-label="Next">?</button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setMuted(!isMuted)} className="hover:text-[var(--accent-color)] transition-colors" aria-label="Mute">
            {isMuted ? '??' : '??'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent-color)' }}
          />
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex md:hidden flex-col h-full">
        <div className="flex items-center px-3 py-1 gap-3">
          <div className="w-[36px] h-[36px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
            {coverUrl && (
              <img
                src={coverUrl}
                alt={title}
                className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}
                onLoad={() => setImageLoaded(true)}
              />
            )}
            {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-color)' }}>{title}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted-color)' }}>{genre}</p>
          </div>
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }}
          >
            {isPlaying ? '?' : '??'}
          </button>
        </div>

        {mobileExpanded && (
          <div className="flex flex-col px-3 pb-2 gap-2">
            <div className="h-10 cursor-pointer" onClick={handleProgressClick}>
              <WaveformRenderer />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={prevTrack}>?</button>
                <button onClick={nextTrack}>?</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted(!isMuted)}>{isMuted ? '??' : '??'}</button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--accent-color)' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result && result[1] && result[2] && result[3]) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return '212, 175, 55';
}

export default PersistentAudioPlayer;