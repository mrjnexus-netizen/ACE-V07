import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAudio } from '../context/AudioContext';
import { useIdentity } from '../context/IdentityContext';
import WaveformRenderer from './WaveformRenderer';
import { useT } from '../context/TranslationContext';

// 2026-07-17 (site-wide responsive audit, per Reza): this bar's real
// on-screen height was previously a mystery to every OTHER fixed-position
// element (EditModeIndicator, ExecutiveStudioBot) — they each guessed a
// fixed `bottom` offset, so when this bar was actually taller than they
// assumed (e.g. expanded on mobile), they silently sat underneath it.
// Publishing the TRUE current height as a CSS custom property means any
// other fixed-bottom element can write `bottom: calc(X + var(--pap-h))`
// and simply never collide with this bar again, no matter how tall it is
// at any given moment. Falls back to 0px via each consumer's own
// `var(--pap-h, 0px)` when this component isn't mounted at all (no track
// loaded yet).
const PAP_HEIGHT_VAR = '--pap-h';

// Inline SVG icons (no emoji / no unicode glyphs — they corrupt across encodings)
const Icon = ({ d, size = 18, stroke }: { d: string; size?: number; stroke?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 2 : 0} strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const PREV = 'M6 6h2v12H6zm3.5 6l8.5 6V6z';
const NEXT = 'M16 6h2v12h-2zM6 18l8.5-6L6 6z';
const VOL = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z';
const MUTE = 'M3 9v6h4l5 5V4L7 9H3zm13 0l5 6m0-6l-5 6';
const CLOSE = 'M6 6l12 12M18 6L6 18';
// 2026-07-20 (per Reza — video piece support): standard four-corner
// "expand" glyph, filled (not stroke-based like CLOSE above) so it uses
// the shared Icon component's default fill rendering unchanged.
const FULLSCREEN = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';

export default function PersistentAudioPlayer() {
  const { audioState, resumeTrack, pauseTrack, stopTrack, seekTrack, setVolume, setMuted, nextTrack, prevTrack, toggleVideoFullscreen } = useAudio();
  const { locale } = useIdentity();
  const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, dominantColors } = audioState;
  const safeLocale = locale ?? 'en';
  const { t } = useT();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Keep --pap-h in sync with the bar's REAL rendered height at all times —
  // including the desktop height (72px, set by the .pap-shell media rule in
  // index.css, not by this JS at all) so other components don't need their
  // own copy of the 768px breakpoint to know which number applies.
  useEffect(() => {
    if (!currentTrack) {
      document.documentElement.style.setProperty(PAP_HEIGHT_VAR, '0px');
      return;
    }
    const sync = () => {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      const h = isDesktop ? 72 : mobileExpanded ? 120 : 56;
      document.documentElement.style.setProperty(PAP_HEIGHT_VAR, `${h}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [currentTrack, mobileExpanded]);

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

  // 2026-07-20 (real, hard-diagnosed bug, per Reza): z-[10000] alone could
  // never beat the gallery overlay at ANY value — an ancestor further up
  // the tree has isolation:isolate, which pins this bar's stacking order
  // to that ancestor's own position among ITS siblings, ignoring whatever
  // z-index this div claims. Confirmed live via getComputedStyle() on
  // every ancestor. Portaling straight to document.body removes this bar
  // from that ancestor's subtree entirely, so its z-index is finally
  // compared at the true top level.
  return createPortal((
    <div style={{ backdropFilter: 'blur(40px) saturate(200%) brightness(0.8)', WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.8)', background: 'rgba(var(--surface-rgb), 0.55)', borderTop: '1px solid var(--border-color)', height: mobileExpanded ? 120 : 56, boxShadow: `0 -4px 40px ${shadowColor}`, transition: 'box-shadow 800ms ease, height 300ms', zIndex: 2147483000 }}
      className="pap-shell fixed bottom-0 left-0 right-0">
      <div className="hidden md:flex items-center h-[72px] px-6 gap-4">
        <div className="w-[52px] h-[52px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
          {coverUrl && <img src={coverUrl} alt={title} className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`} onLoad={() => setImageLoaded(true)} />}
          {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
        </div>
        <div className="min-w-0"><p className="text-sm font-semibold truncate" style={{ color: 'var(--text-color)' }}>{title}</p><p className="text-xs truncate" style={{ color: 'var(--text-muted-color)' }}>{genre}{bpm ? ` | ${bpm}` : ''}</p></div>
        <div className="flex-1 min-w-0 h-10 cursor-pointer" onClick={handleProgressClick}><WaveformRenderer /><div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted-color)' }}><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
        <div className="flex items-center gap-4 flex-shrink-0" style={{ color: 'var(--text-color)' }}>
          <button onClick={prevTrack} className="hover:text-[var(--accent-color)]" aria-label={t('Previous track')}><Icon d={PREV} /></button>
          <button onClick={handlePlayPause} className="btn btn--media btn--media-sm" aria-label={isPlaying ? t('Pause') : t('Play')}><span className="ring" aria-hidden="true" /><span className="bloom" aria-hidden="true" /><Icon d={isPlaying ? PAUSE : PLAY} size={20} /></button>
          <button onClick={nextTrack} className="hover:text-[var(--accent-color)]" aria-label={t('Next track')}><Icon d={NEXT} /></button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" style={{ color: 'var(--text-color)' }}>
          <button onClick={() => setMuted(!isMuted)} className="hover:text-[var(--accent-color)]" aria-label={isMuted ? t('Unmute') : t('Mute')}><Icon d={isMuted ? MUTE : VOL} /></button>
          <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => setVolume(parseFloat(e.target.value))} className="pap-volume hidden lg:block w-20 h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--accent-color)' }} aria-label={t('Volume')} />
          {currentTrack.mediaType === 'video' && (
            <button onClick={toggleVideoFullscreen} className="hidden lg:inline-flex hover:text-[var(--accent-color)]" aria-label={t('Fullscreen')}><Icon d={FULLSCREEN} size={15} /></button>
          )}
          {/* 2026-07-18 (per Reza): a way to fully dismiss the bar and stop
              playback mid-track, not just pause it — pauseTrack alone keeps
              the bar mounted (by design, so a paused track can resume).
              stopTrack (new in AudioContext) clears currentTrack entirely,
              which unmounts this whole bar. */}
          <button onClick={stopTrack} className="hover:text-[var(--accent-color)] ml-1" aria-label={t('Close player')}><Icon d={CLOSE} size={16} stroke /></button>
        </div>
      </div>
      <div className="flex md:hidden flex-col justify-center h-full" style={{ color: 'var(--text-color)' }}>
        <div className="flex items-center px-3.5 py-1.5 gap-3.5">
          <div className="flex items-center gap-3 flex-1 min-w-0" onClick={handleMobileExpand}>
            <div className="w-[36px] h-[36px] rounded overflow-hidden bg-[var(--surface3-color)] flex-shrink-0">
              {coverUrl && <img src={coverUrl} alt={title} className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`} onLoad={() => setImageLoaded(true)} />}
              {!imageLoaded && <div className="w-full h-full bg-[var(--accent-color)] opacity-10" />}
            </div>
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold truncate" style={{ color: 'var(--text-color)' }}>{title}</p><p className="text-[10px] truncate" style={{ color: 'var(--text-muted-color)' }}>{genre}</p></div>
          </div>
          <button onClick={handlePlayPause} className="btn btn--media btn--media-sm flex-shrink-0" aria-label={isPlaying ? t('Pause') : t('Play')}><span className="ring" aria-hidden="true" /><span className="bloom" aria-hidden="true" /><Icon d={isPlaying ? PAUSE : PLAY} size={16} /></button>
          <button onClick={stopTrack} className="flex-shrink-0 hover:text-[var(--accent-color)] ml-1" aria-label={t('Close player')}><Icon d={CLOSE} size={14} stroke /></button>
        </div>
        {mobileExpanded && (
          <div className="flex flex-col px-3 pb-2 gap-2">
            <div className="h-10 cursor-pointer" onClick={handleProgressClick}><WaveformRenderer /></div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3"><button onClick={prevTrack} aria-label={t('Previous track')}><Icon d={PREV} /></button><button onClick={nextTrack} aria-label={t('Next track')}><Icon d={NEXT} /></button></div>
              <div className="flex items-center gap-2"><button onClick={() => setMuted(!isMuted)} aria-label={isMuted ? t('Unmute') : t('Mute')}><Icon d={isMuted ? MUTE : VOL} /></button><input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => setVolume(parseFloat(e.target.value))} className="pap-volume w-16 h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--accent-color)' }} aria-label={t('Volume')} />{currentTrack.mediaType === 'video' && (<button onClick={toggleVideoFullscreen} className="hover:text-[var(--accent-color)]" aria-label={t('Fullscreen')}><Icon d={FULLSCREEN} size={14} /></button>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

function hexToRgb(hex: string): string { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r && r[1] && r[2] && r[3] ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '212, 175, 55'; }
