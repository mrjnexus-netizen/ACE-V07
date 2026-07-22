// ============================================================
// ACE-2026 — AudioContext (Global Audio Engine)
// Blueprint Section 9: singleton AudioContext, lazy init on
// first user gesture, AnalyserNode, Vibrant.js palette extraction,
// color-clash prevention, iOS Safari resume() compliance,
// environmental UI audio (max 0.15 gain).
//
// Fixes from audit:
//   1. Vibrant.js palette extraction wired in on track change
//   2. MediaElementSource created only once (prevents InvalidStateError)
//   3. audio element src updated when playTrack called
//   4. handleEnded stable ref (no stale closure on nextTrack)
//   5. memoizedContextValue deps corrected
//   6. playlist sync: IdentityContext feeds playlist via useEffect
//   7. color-clash prevention (hue within 30° → desaturate)
//   8. CSS --dynamic-accent updated after Vibrant extraction
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { AudioState, AudioTrack, VibrantPalette } from '../types';
import { extractPalette } from '../lib/vibrantExtractor';

// ------------------------------------------------------------------
// Palette extraction — delegates to the shared, dependency-free
// extractor in lib/vibrantExtractor.ts. That module uses a global
// window.Vibrant when present and otherwise falls back to a canvas
// dominant-color sampler, so no missing 'vibrant'/'node-vibrant'
// module is imported and color-clash prevention is applied there.
// ------------------------------------------------------------------
async function extractVibrantPalette(imageUrl: string): Promise<VibrantPalette | null> {
  return extractPalette(imageUrl);
}

// ------------------------------------------------------------------
// Color-clash prevention — Blueprint Section 9:
// "If extracted hue is within 30° of theme accent → desaturate"
// ------------------------------------------------------------------
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

function desaturate(hex: string, factor = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const blend = (c: number) => Math.round(c + (gray - c) * factor);
  return `#${blend(r).toString(16).padStart(2, '0')}${blend(g).toString(16).padStart(2, '0')}${blend(b).toString(16).padStart(2, '0')}`.toUpperCase();
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function applyDynamicAccent(palette: VibrantPalette): void {
  const root = document.documentElement;
  const themeAccent = getComputedStyle(root).getPropertyValue('--accent-color').trim();
  const accentHue = hexToHue(themeAccent);
  const vibrantHue = hexToHue(palette.vibrant);
  const safe = hueDiff(vibrantHue, accentHue) < 30
    ? desaturate(palette.vibrant)
    : palette.vibrant;
  root.style.setProperty('--dynamic-accent', safe);
}

// ------------------------------------------------------------------
// Context shape
// ------------------------------------------------------------------
interface AudioContextType {
  audioState: AudioState;
  playTrack: (track: AudioTrack) => Promise<void>;
  pauseTrack: () => void;
  stopTrack: () => void;
  resumeTrack: () => Promise<void>;
  seekTrack: (time: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (isMuted: boolean) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setPlaylist: (tracks: AudioTrack[]) => void;
  playEnvironmentalSound: (frequency: number, duration: number, volume: number) => void;
  // 2026-07-20 (per Reza — video piece support): toggles the video
  // element into/out of true browser fullscreen. A no-op if nothing is
  // currently loaded there.
  toggleVideoFullscreen: () => void;
}

const AudioCtx = createContext<AudioContextType | undefined>(undefined);

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------
export function AudioProvider({ children }: { children: ReactNode }) {
  const audioElRef   = useRef<HTMLAudioElement | null>(null);
  // 2026-07-20 (per Reza — video piece support): a real, visible <video>
  // element, rendered by this same provider (see the drawer JSX at the
  // bottom of this file) so video playback is available site-wide,
  // exactly like the persistent audio bar already is. Deliberately NOT
  // routed through the Web Audio graph below (no MediaElementSource/
  // analyser) — nothing in the spec calls for audio-reactive visuals on
  // video, so this stays simpler and never risks the fragile "can only
  // create a MediaElementSource once" constraint on the audio graph.
  // Volume/mute are mirrored onto it directly (see setVolume/setMuted).
  const videoElRef   = useRef<HTMLVideoElement | null>(null);
  const actxRef      = useRef<globalThis.AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const sourceRef    = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  // Track whether source node has been created (can only be created once per element)
  const sourceCreated = useRef(false);

  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying:    false,
    currentTrack: null,
    currentTime:  0,
    duration:     0,
    volume:       0.8,
    isMuted:      false,
    analyserNode: null,
    audioContext: null,
    dominantColors: null,
    playlist:     [],
    currentIndex: -1,
  });

  // Stable ref to audioState for use in callbacks (avoids stale closures)
  const stateRef = useRef(audioState);
  useEffect(() => { stateRef.current = audioState; }, [audioState]);

  // ------------------------------------------------------------------
  // Lazy AudioContext init — only on first user gesture (Blueprint LAW)
  // ------------------------------------------------------------------
  const initAudioContext = useCallback(async (): Promise<void> => {
    if (!actxRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actxRef.current = new AudioContextClass();

      const analyser = actxRef.current.createAnalyser();
      // fftSize per device — Blueprint Section 5
      analyser.fftSize = window.innerWidth < 768 ? 512 : 2048;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      // Wire audio element → gain → analyser → destination (only once per element).
      // The GainNode is what actually controls audible volume/mute from here on —
      // once createMediaElementSource exists, the <audio> element's own .muted/
      // .volume no longer affect what's actually heard (the signal is captured
      // into the Web Audio graph instead of playing through the element natively).
      if (audioElRef.current && !sourceCreated.current) {
        sourceCreated.current = true;
        sourceRef.current = actxRef.current.createMediaElementSource(audioElRef.current);
        const gain = actxRef.current.createGain();
        gain.gain.setValueAtTime(
          stateRef.current.isMuted ? 0 : stateRef.current.volume,
          actxRef.current.currentTime
        );
        gainRef.current = gain;
        sourceRef.current.connect(gain);
        gain.connect(analyser);
        analyser.connect(actxRef.current.destination);
      }

      setAudioState(prev => ({
        ...prev,
        audioContext: actxRef.current,
        analyserNode: analyser,
      }));
    }

    // iOS Safari: always resume on gesture
    if (actxRef.current.state === 'suspended') {
      await actxRef.current.resume();
    }
  }, []);

  // ------------------------------------------------------------------
  // Attach gesture listener for lazy init
  // ------------------------------------------------------------------
  useEffect(() => {
    const handle = () => {
      void initAudioContext();
      document.removeEventListener('click',      handle);
      document.removeEventListener('touchstart', handle);
    };
    document.addEventListener('click',      handle, { passive: true });
    document.addEventListener('touchstart', handle, { passive: true });
    return () => {
      document.removeEventListener('click',      handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [initAudioContext]);

  // ------------------------------------------------------------------
  // Audio element event handlers
  // ------------------------------------------------------------------
  // 2026-07-20: generic over audio/video — reads from e.currentTarget
  // (both HTMLAudioElement and HTMLVideoElement share the HTMLMediaElement
  // interface) instead of a hardcoded ref, so the exact same handler
  // attaches to both elements below with zero duplication.
  // 2026-07-20 (per Reza — critical fix): e.currentTarget can genuinely be
  // null at the moment this fires in some browsers when switching away
  // from real fullscreen (the crash reported: "Cannot read properties of
  // null (reading 'currentTime')" — this threw INSIDE a setState updater,
  // which crashed the whole AudioProvider and took down the entire site,
  // since it sits above everything else in the tree). TypeScript's own
  // typing for SyntheticEvent.currentTarget claims non-null, but that
  // guarantee doesn't always hold at runtime for a rapidly-changing
  // fullscreen/media element — a plain truthy check is the fix.
  const handleTimeUpdate = useCallback((e: SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (!el) return;
    setAudioState(prev => ({ ...prev, currentTime: el.currentTime }));
  }, []);

  const handleLoadedMetadata = useCallback((e: SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (!el) return;
    setAudioState(prev => ({ ...prev, duration: el.duration }));
  }, []);

  // handleEnded uses stateRef to avoid stale closure
  const handleEnded = useCallback(() => {
    const { currentIndex, playlist } = stateRef.current;
    if (currentIndex < playlist.length - 1) {
      const next = playlist[currentIndex + 1];
      if (next) void playTrack(next); // eslint-disable-line @typescript-eslint/no-use-before-define
    } else {
      setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, []); // stable — reads via stateRef

  // ------------------------------------------------------------------
  // Vibrant palette extraction on track change
  // ------------------------------------------------------------------
  const extractAndApplyPalette = useCallback(async (track: AudioTrack) => {
    const imageUrl = track.coverArt?.url ?? null;
    if (!imageUrl) {
      setAudioState(prev => ({ ...prev, dominantColors: null }));
      document.documentElement.style.removeProperty('--dynamic-accent');
      return;
    }
    const palette = await extractVibrantPalette(imageUrl);
    if (palette) {
      applyDynamicAccent(palette);
      setAudioState(prev => ({ ...prev, dominantColors: palette }));
    }
  }, []);

  // ------------------------------------------------------------------
  // Playback controls
  // ------------------------------------------------------------------
  const playTrack = useCallback(async (track: AudioTrack): Promise<void> => {
    await initAudioContext();

    // Same fullscreen safety as stopTrack, for the same reason — starting
    // a NEW track (including auto-advance to the next one when a video
    // ends) should never leave the browser stuck in real fullscreen over
    // whatever was playing before.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* nothing more we can do */ });
    }

    const { playlist } = stateRef.current;
    const index = playlist.findIndex(t => t.id === track.id);

    // 2026-07-20 (per Reza): video and audio share this exact same
    // control surface but play through two different elements — always
    // pause whichever one ISN'T needed for this track, so switching from
    // a playing video straight to an audio track (or vice versa) never
    // leaves the old one silently still running in the background.
    if (track.mediaType === 'video') {
      audioElRef.current?.pause();
      if (videoElRef.current) {
        videoElRef.current.src = track.videoUrl || '';
        videoElRef.current.load();
        try {
          await videoElRef.current.play();
        } catch {
          // Autoplay blocked — user gesture required (already handled via initAudioContext)
        }
      }
    } else {
      videoElRef.current?.pause();
      if (audioElRef.current) {
        audioElRef.current.src = track.audioUrl;
        audioElRef.current.load();
        try {
          await audioElRef.current.play();
        } catch {
          // Autoplay blocked — user gesture required (already handled via initAudioContext)
        }
      }
    }

    setAudioState(prev => ({
      ...prev,
      currentTrack: track,
      currentIndex: index,
      isPlaying: true,
      currentTime: 0,
    }));

    void extractAndApplyPalette(track);
  }, [initAudioContext, extractAndApplyPalette]);

  const pauseTrack = useCallback(() => {
    if (stateRef.current.currentTrack?.mediaType === 'video') videoElRef.current?.pause();
    else audioElRef.current?.pause();
    setAudioState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  // 2026-07-18 (per Reza): pauseTrack keeps currentTrack set (by design —
  // that's what lets a paused track resume from where it left off), so
  // PersistentAudioPlayer stays mounted after a pause. stopTrack is the
  // new "actually dismiss the bar" action for the player's close button —
  // pauses AND clears currentTrack, which unmounts the bar entirely
  // (PersistentAudioPlayer returns null once currentTrack is null). For a
  // video track this also closes the drawer, since it's driven off the
  // exact same currentTrack.mediaType check.
  const stopTrack = useCallback(() => {
    // 2026-07-20 (per Reza — critical fix): browsers put a <video> into
    // REAL, OS-level fullscreen not just via our own fullscreen button,
    // but also natively (double-click on the video is a default browser
    // behavior we never disabled). If that happened and the track is then
    // stopped/closed without explicitly exiting fullscreen first, the
    // browser stays stuck showing true fullscreen over an element that's
    // about to be hidden — the entire screen goes black, not just this
    // component. Unconditionally exiting fullscreen here, before anything
    // else, guarantees this can never happen regardless of how fullscreen
    // was entered.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* nothing more we can do */ });
    }
    const isVideo = stateRef.current.currentTrack?.mediaType === 'video';
    const el: HTMLMediaElement | null = isVideo ? videoElRef.current : audioElRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setAudioState(prev => ({ ...prev, isPlaying: false, currentTrack: null, currentTime: 0, duration: 0 }));
  }, []);

  const resumeTrack = useCallback(async (): Promise<void> => {
    await initAudioContext();
    try {
      const isVideo = stateRef.current.currentTrack?.mediaType === 'video';
      const el: HTMLMediaElement | null = isVideo ? videoElRef.current : audioElRef.current;
      await el?.play();
      setAudioState(prev => ({ ...prev, isPlaying: true }));
    } catch {
      // silently handle autoplay block
    }
  }, [initAudioContext]);

  const seekTrack = useCallback((time: number) => {
    const isVideo = stateRef.current.currentTrack?.mediaType === 'video';
    const el: HTMLMediaElement | null = isVideo ? videoElRef.current : audioElRef.current;
    if (el) {
      el.currentTime = time;
      setAudioState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    // Set on both elements unconditionally — harmless (only one is ever
    // actually playing at a time) and means volume stays in sync no
    // matter which one becomes active next.
    if (audioElRef.current) audioElRef.current.volume = clamped;
    if (videoElRef.current) videoElRef.current.volume = clamped;
    if (gainRef.current && actxRef.current && !stateRef.current.isMuted) {
      gainRef.current.gain.setValueAtTime(clamped, actxRef.current.currentTime);
    }
    setAudioState(prev => ({ ...prev, volume: clamped }));
  }, []);

  const setMuted = useCallback((isMuted: boolean) => {
    if (audioElRef.current) audioElRef.current.muted = isMuted;
    if (videoElRef.current) videoElRef.current.muted = isMuted;
    if (gainRef.current && actxRef.current) {
      gainRef.current.gain.setValueAtTime(isMuted ? 0 : stateRef.current.volume, actxRef.current.currentTime);
    }
    setAudioState(prev => ({ ...prev, isMuted }));
  }, []);

  const nextTrack = useCallback(() => {
    const { currentIndex, playlist } = stateRef.current;
    if (!playlist.length) return;
    const next = playlist[(currentIndex + 1) % playlist.length];
    if (next) void playTrack(next);
  }, [playTrack]);

  const prevTrack = useCallback(() => {
    const { currentIndex, playlist } = stateRef.current;
    if (!playlist.length) return;
    const prev = playlist[(currentIndex - 1 + playlist.length) % playlist.length];
    if (prev) void playTrack(prev);
  }, [playTrack]);

  const setPlaylist = useCallback((tracks: AudioTrack[]) => {
    setAudioState(prev => ({ ...prev, playlist: tracks }));
  }, []);

  // ------------------------------------------------------------------
  // Environmental UI audio — Blueprint Section 9:
  // pre-synthesised micro-tones, max 0.15 gain
  // ------------------------------------------------------------------
  const playEnvironmentalSound = useCallback((
    frequency: number,
    duration: number,
    volume: number,
  ): void => {
    if (!actxRef.current || actxRef.current.state === 'suspended') return;
    if (stateRef.current.isMuted) return; // respect the global mute — every site sound, not just the track

    const osc  = actxRef.current.createOscillator();
    const gain = actxRef.current.createGain();

    osc.connect(gain);
    gain.connect(actxRef.current.destination);

    const now = actxRef.current.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);

    const safeVolume = Math.min(volume, 0.15); // Blueprint: max 0.15 gain
    gain.gain.setValueAtTime(safeVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);

    osc.start(now);
    osc.stop(now + duration / 1000);

    // Clean up nodes after they finish
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }, []);

  // 2026-07-20 (per Reza): the fullscreen button lives in
  // PersistentAudioPlayer.tsx, which has no access to videoElRef (private
  // to this provider) — exposed as a context action instead. No-op if
  // nothing is playing or the browser blocks it (Fullscreen API requires
  // a user gesture, which a button click already satisfies).
  const toggleVideoFullscreen = useCallback(() => {
    const el = videoElRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen().catch(() => { /* blocked — nothing more we can do */ });
    }
  }, []);

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (actxRef.current && actxRef.current.state !== 'closed') {
        void actxRef.current.close();
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Context value — stable references via useCallback above
  // ------------------------------------------------------------------
  const value = useMemo<AudioContextType>(() => ({
    audioState,
    playTrack,
    pauseTrack,
    stopTrack,
    resumeTrack,
    seekTrack,
    setVolume,
    setMuted,
    nextTrack,
    prevTrack,
    setPlaylist,
    playEnvironmentalSound,
    toggleVideoFullscreen,
  }), [
    audioState,
    playTrack,
    pauseTrack,
    stopTrack,
    resumeTrack,
    seekTrack,
    setVolume,
    setMuted,
    nextTrack,
    prevTrack,
    setPlaylist,
    playEnvironmentalSound,
    toggleVideoFullscreen,
  ]);

  return (
    <AudioCtx.Provider value={value}>
      {/* Hidden audio element — src set dynamically in playTrack */}
      <audio
        ref={audioElRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        muted={audioState.isMuted}
        preload="metadata"
        crossOrigin="anonymous"
        aria-hidden="true"
      />

      {/* 2026-07-20 (per Reza) — Video drawer: slides up from behind the
          persistent bottom bar whenever the current piece is a video,
          shows it at full quality, autoplaying. Sits exactly above the
          bar via the shared --pap-h CSS variable (the same one
          PersistentAudioPlayer.tsx already publishes to coordinate every
          fixed-position element against the bar's real height) so it
          never gets a hardcoded pixel offset that drifts out of sync on
          resize/mobile. The bar itself needs ZERO changes to work for
          video — play/pause/prev/next/volume/close all already route
          through the exact same functions above, now video-aware.

          2026-07-20 ROUND 2 (real, hard-diagnosed bug): a z-index alone
          could never win here, at ANY value — an ancestor further up the
          tree has `isolation: isolate`, which creates its own stacking
          context with z-index:auto. That pins this drawer's stacking
          order to wherever that ANCESTOR sits among ITS OWN siblings,
          completely ignoring whatever z-index this div claims for
          itself — confirmed live via getComputedStyle() walking every
          ancestor. A React Portal straight to document.body sidesteps
          this permanently: the drawer is no longer a DOM descendant of
          that isolating ancestor (or of the gallery overlay, or of
          anything else that might introduce the same problem later), so
          its z-index is finally compared at the true top level, where
          10000 genuinely wins against the gallery overlay's 99999. */}
      {typeof document !== 'undefined' && createPortal(
        <div
          aria-hidden={audioState.currentTrack?.mediaType !== 'video'}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'var(--pap-h, 64px)',
            zIndex: 2147483000, // effectively unbeatable — see comment above on why a "reasonable" number isn't the fix, but this still needs to be genuinely huge now that it's compared at the true top level
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: audioState.currentTrack?.mediaType === 'video' ? 'auto' : 'none',
            opacity: audioState.currentTrack?.mediaType === 'video' ? 1 : 0,
            transform: audioState.currentTrack?.mediaType === 'video' ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
        <div className="ace-video-drawer-inner">
            <video
              ref={videoElRef}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              muted={audioState.isMuted}
              playsInline
              preload="metadata"
              className="ace-video-drawer-video"
            />
        </div>
      </div>,
      document.body
      )}

      {children}
    </AudioCtx.Provider>
  );
}

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------
export function useAudio(): AudioContextType {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}