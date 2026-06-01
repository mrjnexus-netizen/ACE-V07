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

  // Initialize AudioContext and AnalyserNode on first user gesture
  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = window.innerWidth < 768 ? 512 : 2048; // Mobile vs Desktop
      analyser.smoothingTimeConstant = 0.85;

      analyserRef.current = analyser;
      setAudioState((prev) => ({
        ...prev,
        audioContext: audioContextRef.current,
        analyserNode: analyserRef.current,
      }));

      // Connect audio element to analyser
      if (audioRef.current && audioContextRef.current) {
        const source = audioContextRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
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
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Handle track changes and metadata
  useEffect(() => {
    const currentTrack = audioState.currentTrack;
    if (currentTrack && audioRef.current) {
      audioRef.current.src = currentTrack.audioUrl;
      audioRef.current.load();
      if (audioState.isPlaying) {
        audioRef.current.play();
      }
      extractAndApplyVibrantColors(currentTrack.coverArt?.url);
    } else if (audioRef.current) {
      audioRef.current.src = '';
      setAudioState((prev) => ({ ...prev, dominantColors: null, duration: 0, currentTime: 0 }));
    }
  }, [audioState.currentTrack]);

  const extractAndApplyVibrantColors = async (imageUrl?: string) => {
    if (!imageUrl) {
      setAudioState((prev) => ({ ...prev, dominantColors: null }));
      return;
    }
    try {
      const palette = await Vibrant.from(imageUrl).getPalette();
      const vibrantPalette: VibrantPalette = {
        vibrant: palette.Vibrant?.hex || 
          (palette.DarkVibrant?.hex || palette.LightVibrant?.hex || '#000000'),
        muted: palette.Muted?.hex || 
          (palette.DarkMuted?.hex || palette.LightMuted?.hex || '#333333'),
        darkVibrant: palette.DarkVibrant?.hex || 
          (palette.Vibrant?.hex || palette.LightVibrant?.hex || '#000000'),
        darkMuted: palette.DarkMuted?.hex || 
          (palette.Muted?.hex || palette.LightMuted?.hex || '#333333'),
        lightVibrant: palette.LightVibrant?.hex || 
          (palette.Vibrant?.hex || palette.DarkVibrant?.hex || '#666666'),
        lightMuted: palette.LightMuted?.hex || 
          (palette.Muted?.hex || palette.DarkMuted?.hex || '#999999'),
      };

      // Apply color clash prevention (mock for now, actual implementation needs theme accent color)
      // const themeAccentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-color");
      // if (vibrantPalette.vibrant && isColorClashing(vibrantPalette.vibrant, themeAccentColor)) {
      //   vibrantPalette.vibrant = desaturateColor(vibrantPalette.vibrant, 0.6);
      // }
      
      setAudioState((prev) => ({ ...prev, dominantColors: vibrantPalette }));
      document.documentElement.style.setProperty("--dynamic-accent", vibrantPalette.vibrant);
    } catch (error) {
      console.error("Error extracting vibrant colors:", error);
      setAudioState((prev) => ({ ...prev, dominantColors: null }));
      document.documentElement.style.removeProperty("--dynamic-accent");
    }
  };

  const playTrack = async (track: AudioTrack) => {
    await initAudio(); // Ensure audio context is active
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
    const nextIndex = (audioState.currentIndex + 1) % audioState.playlist.length;
    const track = audioState.playlist[nextIndex];
    if (track) {
      playTrack(track);
    }
  };

  const prevTrack = () => {
    const prevIndex = (audioState.currentIndex - 1 + audioState.playlist.length) % audioState.playlist.length;
    const track = audioState.playlist[prevIndex];
    if (track) {
      playTrack(track);
    }
  };

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
    // Play next track or stop if no more tracks
    if (audioState.currentIndex < audioState.playlist.length - 1) {
      nextTrack();
    } else {
      setAudioState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  };

  // Environmental UI Audio Engine (Mock for now)
  const playEnvironmentalSound = (frequency: number, duration: number, volume: number) => {
    if (audioContextRef.current) {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
      gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);

      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + duration / 1000);

      // Cleanup
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    }
  };

  // Expose playEnvironmentalSound through context for LinguisticPortal
  const memoizedContextValue = useMemo(() => ({
    audioState,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTrack,
    setVolume,
    nextTrack,
    prevTrack,
    playEnvironmentalSound, // Expose for environmental sounds
  }), [audioState, playTrack, pauseTrack, resumeTrack, seekTrack, setVolume, nextTrack, prevTrack, playEnvironmentalSound]);

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
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
