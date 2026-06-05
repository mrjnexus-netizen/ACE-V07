import { createContext, useContext, useState, useRef, useEffect, useMemo, ReactNode } from 'react';
import { AudioState, AudioTrack, VibrantPalette } from '../types';
import Vibrant from 'node-vibrant';

interface AudioContextType {
  audioState: AudioState;
  playTrack: (track: AudioTrack) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  seekTrack: (time: number) => void;
  setVolume: (volume: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  playEnvironmentalSound: (frequency: number, duration: number, volume: number) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

interface AudioProviderProps {
  children: ReactNode;
  initialPlaylist?: AudioTrack[];
}

// Simple RGB/HSL conversions for color clash logic
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  let r, g, b;
  h /= 360;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x: number) => {
    const hexStr = Math.round(x * 255).toString(16);
    return hexStr.length === 1 ? '0' + hexStr : hexStr;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function desaturate(hex: string, factor: number = 0.5): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s * factor, l);
}

export const AudioProvider = ({ children, initialPlaylist = [] }: AudioProviderProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<globalThis.AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    isMuted: false,
    analyserNode: null,
    audioContext: null,
    dominantColors: null,
    playlist: initialPlaylist,
    currentIndex: -1,
  });

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioState.volume;
    }
  }, [audioState.volume]);

  // Lazy initialize AudioContext on user gesture, NOT on mount
  const initAudio = async () => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = window.innerWidth < 768 ? 512 : 2048;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      setAudioState((prev) => ({
        ...prev,
        audioContext: audioContextRef.current,
        analyserNode: analyser,
      }));

      if (audioRef.current) {
        const source = audioContextRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(audioContextRef.current.destination);
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  useEffect(() => {
    const handleUserGesture = () => {
      initAudio();
      document.removeEventListener('click', handleUserGesture);
      document.removeEventListener('touchstart', handleUserGesture);
    };

    document.addEventListener('click', handleUserGesture);
    document.addEventListener('touchstart', handleUserGesture);

    return () => {
      document.removeEventListener('click', handleUserGesture);
      document.removeEventListener('touchstart', handleUserGesture);
    };
  }, []);

  // Update current time and duration
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setAudioState((prev) => ({ ...prev, currentTime: audioRef.current!.currentTime }));
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioState((prev) => ({ ...prev, duration: audioRef.current!.duration }));
    }
  };

  const handleEnded = () => {
    if (audioState.currentIndex < audioState.playlist.length - 1) {
      nextTrack();
    } else {
      setAudioState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  };

  const extractAndApplyVibrantColors = async (imageUrl?: string) => {
    if (!imageUrl) {
      setAudioState((prev) => ({ ...prev, dominantColors: null }));
      return;
    }
    try {
      const palette = await Vibrant.from(imageUrl).getPalette();
      const vibrantPalette: VibrantPalette = {
        vibrant: palette.Vibrant?.hex || '#00F5D4',
        muted: palette.Muted?.hex || '#6B6C75',
        darkVibrant: palette.DarkVibrant?.hex || '#000000',
        darkMuted: palette.DarkMuted?.hex || '#333333',
        lightVibrant: palette.LightVibrant?.hex || '#666666',
        lightMuted: palette.LightMuted?.hex || '#999999',
      };

      // Color clash prevention: if hue is within 30° of theme accent -> desaturate
      const themeAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
      if (themeAccentColor && themeAccentColor.startsWith('#')) {
        const themeHsl = hexToHsl(themeAccentColor);
        const vibrantHsl = hexToHsl(vibrantPalette.vibrant);
        const diff = Math.abs(themeHsl.h - vibrantHsl.h);
        const hueDiff = Math.min(diff, 360 - diff);
        if (hueDiff <= 30) {
          vibrantPalette.vibrant = desaturate(vibrantPalette.vibrant, 0.4);
        }
      }

      setAudioState((prev) => ({ ...prev, dominantColors: vibrantPalette }));
      document.documentElement.style.setProperty('--dynamic-accent', vibrantPalette.vibrant);
    } catch (error) {
      console.error('Error extracting vibrant colors:', error);
      setAudioState((prev) => ({ ...prev, dominantColors: null }));
      document.documentElement.style.removeProperty('--dynamic-accent');
    }
  };

  // Track switching effect
  useEffect(() => {
    const currentTrack = audioState.currentTrack;
    if (currentTrack && audioRef.current) {
      audioRef.current.src = currentTrack.audioUrl;
      audioRef.current.load();
      if (audioState.isPlaying) {
        audioRef.current.play().catch((err) => console.log('Autoplay blocked:', err));
      }
      extractAndApplyVibrantColors(currentTrack.coverArt?.url);
    } else if (audioRef.current) {
      audioRef.current.src = '';
      setAudioState((prev) => ({ ...prev, dominantColors: null, duration: 0, currentTime: 0 }));
    }
  }, [audioState.currentTrack]);

  const playTrack = async (track: AudioTrack) => {
    await initAudio();
    const index = audioState.playlist.findIndex((t) => t.id === track.id);
    setAudioState((prev) => ({
      ...prev,
      currentTrack: track,
      currentIndex: index,
      isPlaying: true,
    }));
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setAudioState((prev) => ({ ...prev, isPlaying: false }));
  };

  const resumeTrack = async () => {
    await initAudio();
    // iOS Safari: audioContext.resume() on every play attempt
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    audioRef.current?.play();
    setAudioState((prev) => ({ ...prev, isPlaying: true }));
  };

  const seekTrack = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioState((prev) => ({ ...prev, currentTime: time }));
    }
  };

  const setVolume = (volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      setAudioState((prev) => ({ ...prev, volume }));
    }
  };

  const nextTrack = () => {
    if (audioState.playlist.length === 0) return;
    const nextIndex = (audioState.currentIndex + 1) % audioState.playlist.length;
    const track = audioState.playlist[nextIndex];
    if (track) {
      playTrack(track);
    }
  };

  const prevTrack = () => {
    if (audioState.playlist.length === 0) return;
    const prevIndex = (audioState.currentIndex - 1 + audioState.playlist.length) % audioState.playlist.length;
    const track = audioState.playlist[prevIndex];
    if (track) {
      playTrack(track);
    }
  };

  // Environmental UI Audio Engine (Base64 micro-tones with gain limited to 0.15 max)
  const playEnvironmentalSound = (frequency: number, duration: number, volume: number) => {
    if (!audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const osc = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    const now = audioContextRef.current.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    
    // Ensure volume is clamped to max 0.15
    const clampedVolume = Math.min(volume, 0.15);
    gainNode.gain.setValueAtTime(clampedVolume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);

    osc.start(now);
    osc.stop(now + duration / 1000);
  };

  const memoizedContextValue = useMemo(() => ({
    audioState,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTrack,
    setVolume,
    nextTrack,
    prevTrack,
    playEnvironmentalSound,
  }), [audioState]);

  return (
    <AudioContext.Provider value={memoizedContextValue}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        muted={audioState.isMuted}
      />
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
