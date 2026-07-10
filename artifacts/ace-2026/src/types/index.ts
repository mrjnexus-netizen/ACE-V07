// ============================================================
// ACE-2026 — Canonical Type Definitions
// Source of truth for ALL shared TypeScript interfaces.
// Every field matches Blueprint Section 8 exactly.
// Zero 'any' types. All nullables explicit.
// ============================================================

export type Locale = 'en' | 'es' | 'fr' | 'zh' | 'ja' | 'ko';
export type ThemeId = 'onyx' | 'cyber' | 'minimal';

export interface ThemeConfig {
  id: ThemeId;
  variables: Record<string, string>;
}

// ------------------------------------------------------------------
// Multilingual text — every user-facing text field uses this shape.
// Blueprint LAW 3: no text field may be limited to one language.
// ------------------------------------------------------------------
export interface MultiLingual {
  en: string;
  es: string;
  fr: string;
  zh: string;
  ja: string;
  ko: string;
}

// ------------------------------------------------------------------
// Vibrant colour palette extracted from cover art images
// ------------------------------------------------------------------
export interface VibrantPalette {
  vibrant: string;
  muted: string;
  darkVibrant: string;
  darkMuted: string;
  lightVibrant: string;
  lightMuted: string;
}

// ------------------------------------------------------------------
// Media asset — always null-safe; blurHash enables placeholder UI
// ------------------------------------------------------------------
export interface MediaAsset {
  url: string;
  blurHash: string;
  width: number;
  height: number;
  format: 'webp' | 'jpg' | 'png';
  dominantColors: string[];
  vibrantPalette: VibrantPalette | null;
}

// ------------------------------------------------------------------
// Social links — all nullable; UI hides missing links gracefully
// ------------------------------------------------------------------
export interface SocialLinks {
  spotify: string | null;
  imdb: string | null;
  instagram: string | null;
  youtube: string | null;
}

// ------------------------------------------------------------------
// Project — portfolio item in the Spatial Scroll timeline
// ------------------------------------------------------------------
export interface Project {
  id: string;
  title: MultiLingual;
  type: 'film' | 'game' | 'animation' | 'documentary';
  year: number;
  description: MultiLingual;
  coverImage: MediaAsset | null;
}

// ------------------------------------------------------------------
// ComposerIdentity — Blueprint LAW 2: ALL fields null at launch.
// Admin injects via CMS. UI renders gracefully with null values.
// ------------------------------------------------------------------
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
}

// ------------------------------------------------------------------
// Audio track — single portfolio music piece
// ------------------------------------------------------------------
export interface AudioTrack {
  id: string;
  title: MultiLingual;
  narrative: MultiLingual;
  audioUrl: string;
  coverArt: MediaAsset | null;
  // Flat cover URL — matches the actual tracks.cover_url DB column and
  // what the API/UI use in practice (2026-07-10). coverArt above stays
  // for now in case something else still relies on the richer shape.
  coverUrl: string | null;
  genre: 'cinematic' | 'gaming' | 'animation' | 'ambient';
  bpm: number | null;
  mood: string | null;
  duration: number;
  sortOrder: number;
  isLive: boolean;
  // Selected-Works concept this track belongs to (e.g. "Cinema"). Null until
  // the admin assigns one on upload.
  concept: string | null;
  // Featured ("starred") track — one per concept surfaces on the home page.
  isFeatured: boolean;
  createdAt: string;
}

// ------------------------------------------------------------------
// AudioState — global singleton state managed by AudioContext
// Blueprint Section 9: player is purely presentational, never owns state
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// AI Media Pipeline — state machine statuses
// ------------------------------------------------------------------
export type PipelineStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing_audio'
  | 'ready_for_review'
  | 'generating_art'
  | 'generating_narrative'
  | 'applying_filters'
  | 'awaiting_approval'
  | 'publishing'
  | 'complete'
  | 'error';

export interface AudioMetadata {
  dominantInstrument: string | null;
  bpm: number | null;
  mood: string | null;
  keySignature: string | null;
  duration: number;
  title: string | null;
  genre: string | null;
  aiListenAnalysis: string | null;
}

export interface PipelineJob {
  id: string;
  status: PipelineStatus;
  progress: number;
  audioMetadata: AudioMetadata | null;
  generatedArtUrl: string | null;
  generatedNarrative: MultiLingual | null;
  errorMessage: string | null;
}

// ------------------------------------------------------------------
// Standard API response envelope — matches backend exactly
// ------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
  timestamp: string;
}
