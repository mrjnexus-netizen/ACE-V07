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
} from 'react';
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
  resumeTrack: () => Promise<void>;
  seekTrack: (time: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (isMuted: boolean) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setPlaylist: (tracks: AudioTrack[]) => void;
  playEnvironmentalSound: (frequency: number, duration: number, volume: number) => void;
}

const AudioCtx = createContext<AudioContextType | undefined>(undefined);

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------
export function AudioProvider({ children }: { children: ReactNode }) {
  const audioElRef   = useRef<HTMLAudioElement | null>(null);
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
  const handleTimeUpdate = useCallback(() => {
    if (audioElRef.current) {
      setAudioState(prev => ({ ...prev, currentTime: audioElRef.current!.currentTime }));
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioElRef.current) {
      setAudioState(prev => ({ ...prev, duration: audioElRef.current!.duration }));
    }
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

    const { playlist } = stateRef.current;
    const index = playlist.findIndex(t => t.id === track.id);

    // Update audio element src before play
    if (audioElRef.current) {
      audioElRef.current.src = track.audioUrl;
      audioElRef.current.load();
      try {
        await audioElRef.current.play();
      } catch {
        // Autoplay blocked — user gesture required (already handled via initAudioContext)
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
    audioElRef.current?.pause();
    setAudioState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const resumeTrack = useCallback(async (): Promise<void> => {
    await initAudioContext();
    try {
      await audioElRef.current?.play();
      setAudioState(prev => ({ ...prev, isPlaying: true }));
    } catch {
      // silently handle autoplay block
    }
  }, [initAudioContext]);

  const seekTrack = useCallback((time: number) => {
    if (audioElRef.current) {
      audioElRef.current.currentTime = time;
      setAudioState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    if (audioElRef.current) audioElRef.current.volume = clamped;
    if (gainRef.current && actxRef.current && !stateRef.current.isMuted) {
      gainRef.current.gain.setValueAtTime(clamped, actxRef.current.currentTime);
    }
    setAudioState(prev => ({ ...prev, volume: clamped }));
  }, []);

  const setMuted = useCallback((isMuted: boolean) => {
    if (audioElRef.current) audioElRef.current.muted = isMuted;
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
    resumeTrack,
    seekTrack,
    setVolume,
    setMuted,
    nextTrack,
    prevTrack,
    setPlaylist,
    playEnvironmentalSound,
  }), [
    audioState,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTrack,
    setVolume,
    setMuted,
    nextTrack,
    prevTrack,
    setPlaylist,
    playEnvironmentalSound,
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