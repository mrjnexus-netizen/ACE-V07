export interface MultiLingual {
  en: string;
  es: string;
  fr: string;
  zh: string;
  ja: string;
  ko: string;
}

export interface MediaAsset {
  url: string;
  blurHash: string;
  width: number;
  height: number;
  format: 'webp' | 'jpg' | 'png';
  dominantColors: string[];
  vibrantPalette: VibrantPalette | null;
}

export interface VibrantPalette {
  vibrant: string;
  muted: string;
  darkVibrant: string;
  darkMuted: string;
  lightVibrant: string;
  lightMuted: string;
}

export interface ComposerIdentity {
  id: string | null;
  name: MultiLingual | null;
  tagline: MultiLingual | null;
  biography: MultiLingual | null;
  awards: MultiLingual[] | null;
  studioAddress: MultiLingual | null;
  portrait: MediaAsset | null;
  logo: MediaAsset | null;
  heroVideo: string | null;
  socialLinks: SocialLinks | null;
  projects: Project[] | null;
  trackCount: number | null;
  genres: string[] | null;
}

export interface SocialLinks {
  spotify: string | null;
  imdb: string | null;
  instagram: string | null;
  youtube: string | null;
}

export interface Project {
  id: string;
  title: MultiLingual;
  type: 'film' | 'game' | 'animation' | 'documentary';
  year: number;
  description: MultiLingual;
  coverImage: MediaAsset | null;
}

export interface AudioTrack {
  id: string;
  title: MultiLingual;
  narrative: MultiLingual;
  audioUrl: string;
  coverArt: MediaAsset | null;
  genre: 'cinematic' | 'gaming' | 'animation' | 'ambient';
  bpm: number | null;
  mood: string | null;
  duration: number;
  sortOrder: number;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AudioState {
  isPlaying: boolean;
  currentTrack: AudioTrack | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  analyserNode: AnalyserNode | null;
  audioContext: AudioContext | null;
  dominantColors: VibrantPalette | null;
  playlist: AudioTrack[];
  currentIndex: number;
}

export type PipelineStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing_audio'
  | 'generating_art'
  | 'generating_narrative'
  | 'applying_filters'
  | 'awaiting_approval'
  | 'publishing'
  | 'complete'
  | 'error';

export interface PipelineJob {
  id: string;
  status: PipelineStatus;
  progress: number;
  audioMetadata: AudioMetadata | null;
  generatedArtUrl: string | null;
  generatedNarrative: MultiLingual | null;
  errorMessage: string | null;
}

export interface AudioMetadata {
  dominantInstrument: string | null;
  bpm: number | null;
  mood: string | null;
  keySignature: string | null;
  duration: number;
  title: string | null;
}

export type Locale = 'en' | 'es' | 'fr' | 'zh' | 'ja' | 'ko';

export type ThemeId = 'onyx' | 'cyber' | 'minimal';

export interface ThemeConfig {
  id: ThemeId;
  variables: Record<string, string>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
  timestamp: string;
}
