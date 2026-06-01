import React from 'react';
import { useAudio } from '../context/AudioContext';
import { useIdentity } from '../context/IdentityContext';
import WaveformRenderer from './WaveformRenderer';

const PersistentAudioPlayer = () => {
  const { audioState, pauseTrack, resumeTrack, seekTrack, setVolume, nextTrack, prevTrack } = useAudio();
  const { locale } = useIdentity();
  const { currentTrack, isPlaying, currentTime, duration, volume, dominantColors } = audioState;

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

  // Convert seconds to MM:SS
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const shadowStyle = dominantColors
    ? { boxShadow: `0 -4px 40px rgba(${hexToRgb(dominantColors.vibrant)}, 0.15)` }
    : { boxShadow: '0 -4px 40px rgba(var(--accent-rgb), 0.15)' };

  return (
    <div
      style={{
        backdropFilter: 'blur(40px) saturate(200%) brightness(0.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.8)',
        background: 'rgba(var(--surface-rgb), 0.55)',
        transition: 'box-shadow 800ms ease, background 600ms ease',
        ...shadowStyle,
      }}
      className="fixed bottom-0 left-0 right-0 h-[72px] border-t border-border flex items-center px-6 z-[9999] justify-between"
    >
      {/* Cover Art and Title Info */}
      <div className="flex items-center space-x-4 max-w-[25%] truncate">
        <div className="w-[52px] h-[52px] rounded border border-border overflow-hidden relative bg-surface3 flex-shrink-0">
          {currentTrack.coverArt?.url ? (
            <img src={currentTrack.coverArt.url} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-accent/10 flex items-center justify-center font-bold text-accent">
              ACE
            </div>
          )}
        </div>
        <div className="truncate">
          <p className="font-display text-text font-bold text-sm tracking-wide leading-tight truncate">
            {currentTrack.title[locale] || currentTrack.title.en}
          </p>
          <p className="font-mono text-[10px] text-text-muted mt-0.5 tracking-wider truncate">
            {currentTrack.genre?.toUpperCase()} | {currentTrack.bpm} BPM
          </p>
        </div>
      </div>

      {/* Waveform Renderer */}
      <div className="flex-1 mx-8 relative flex items-center h-full max-w-[50%]" onClick={handleProgressClick}>
        <div className="w-full">
          <WaveformRenderer />
          <div className="flex justify-between text-[9px] font-mono text-text-muted mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Controls & Volume */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={prevTrack}
            className="text-text-muted hover:text-accent transition-colors duration-200 outline-none"
            title="Previous Track"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>
          <button
            onClick={handlePlayPause}
            className="w-10 h-10 rounded-full bg-accent text-surface-color flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 outline-none"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={nextTrack}
            className="text-text-muted hover:text-accent transition-colors duration-200 outline-none"
            title="Next Track"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
            </svg>
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-border-color rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>
      </div>
    </div>
  );
};

// Helper to convert hex to rgb for rgba box shadow
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '212, 175, 55';
}

export default PersistentAudioPlayer;
