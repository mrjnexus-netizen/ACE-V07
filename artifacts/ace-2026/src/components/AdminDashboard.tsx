import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { apiPost, apiGet, apiPut, apiDelete } from '../lib/apiClient';
import { usePipeline } from '../context/PipelineContext';
import { useContent } from '../context/ContentContext';
import { FONTS_BY_LOCALE, loadGoogleFonts } from '../constants/fonts';
import type { ComposerIdentity, AudioTrack, MultiLingual, Locale } from '../types';

// ---------- shared helpers ----------
const emptyMultiLingual = (): MultiLingual => ({ en: '', es: '', fr: '', zh: '', ja: '', ko: '' });
const locales = ['en', 'es', 'fr', 'zh', 'ja', 'ko'] as const;
const localeLabels: Record<string, string> = { en: 'English', es: 'Espa\u00f1ol', fr: 'Fran\u00e7ais', zh: '\u4e2d\u6587', ja: '\u65e5\u672c\u8a9e', ko: '\ud55c\uad6d\uc5b4' };

// Selected-Works concepts — MUST match the ORDER list in WorksGallery.tsx so a
// track assigned here lands on the correct piano key on the home page.
const CONCEPT_OPTIONS = [
  'Cinema', 'Television', 'Games', 'Animation', 'Documentary', 'Advertising',
  'Trailers', 'Theatre', 'Dance', 'Concert', 'Immersive', 'Albums',
] as const;

// Native <option> lists frequently ignore the page's theme CSS and
// render with the OS/browser default (often a light background), which
// made every dropdown hard to read against this dark UI (2026-07-10).
// Explicit inline styles on both <select> and each <option> force
// consistent, readable dark styling across browsers.
const DARK_SELECT_STYLE: CSSProperties = { background: 'rgba(107,82,38,0.035)', color: 'var(--text-color)', border: '1px solid var(--adm-border, rgba(107,82,38,0.16))' };
const DARK_OPTION_STYLE = { background: '#171410', color: '#e9e4da' };

// ---------- Tab Content Components ----------
const TabIdentityMatrix = () => {
  const { composerIdentity, fetchIdentity, updateIdentity } = useIdentity();
  const [local, setLocal] = useState<ComposerIdentity | null>(null);
  const [activeLang, setActiveLang] = useState<string>('en');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(composerIdentity); }, [composerIdentity]);

  const handleFieldChange = (field: keyof ComposerIdentity, value: any) => {
    if (!local) return;
    setLocal({ ...local, [field]: value });
  };

  const handleMultiLingualChange = (field: keyof ComposerIdentity, lang: string, text: string) => {
    if (!local) return;
    const current = (local[field] as MultiLingual) || emptyMultiLingual();
    handleFieldChange(field, { ...current, [lang]: text });
  };

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    await updateIdentity(local);
    await fetchIdentity();
    setSaving(false);
  };

  if (!local) return <p className="adm-notice">Loading identity...</p>;

  return (
    <div className="space-y-5">
      <div className="adm-panel">
        <div className="adm-panel-title">Language</div>
        <div className="adm-chip-row">
          {locales.map(l => (
            <button key={l} onClick={() => setActiveLang(l)}
              className={`adm-chip ${activeLang === l ? 'adm-chip--active' : ''}`}
            >{localeLabels[l]}</button>
          ))}
        </div>
      </div>

      <p className="adm-notice">
        Name, tagline, and biography moved to inline editing — open the ✎ Visual
        Editor and edit them directly on the Hero/About sections (auto-translates
        to all 5 languages on save). Only studio address and social links stay
        here for now.
      </p>

      <div className="adm-panel space-y-4">
        <div className="adm-panel-title">Studio</div>
        {(['studioAddress'] as (keyof ComposerIdentity)[]).map(field => (
          <div key={field}>
            <label className="adm-label">{field}</label>
            <textarea
              rows={3}
              value={(local[field] as Record<string, string> | null)?.[activeLang] || ''}
              onChange={e => handleMultiLingualChange(field, activeLang, e.target.value)}
              className="adm-textarea"
            />
          </div>
        ))}
      </div>

      <div className="adm-panel">
        <div className="adm-panel-title">Social Links</div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          {(['spotify','imdb','instagram','youtube'] as const).map(link => (
            <div key={link}>
              <label className="adm-label">{link}</label>
              <input
                type="url"
                value={local.socialLinks?.[link] || ''}
                onChange={e => handleFieldChange('socialLinks', { ...local.socialLinks, [link]: e.target.value })}
                className="adm-input"
              />
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="adm-btn adm-btn--primary">
        {saving ? 'Saving…' : 'Save Identity'}
      </button>
    </div>
  );
};

// ---- Neon Audio Player (2026-07-13, per Reza) ----
// Native <audio controls> renders with the browser/OS's own default
// chrome — usually a plain dark bar that can't be restyled via CSS and
// clashed badly with the new ivory/gold theme ("bare meski... zeshte").
// This is a minimal custom transport: play/pause, a seek bar, elapsed/
// total time — built once, reused everywhere audio needs to preview in
// admin (Media Pipeline's staged upload, both Ambient Tracks states).
function NeonAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  };

  const seek = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
  };

  const fmt = (s: number): string => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 999,
      background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.07), rgba(255,255,255,0.55))',
      border: '1px solid rgba(var(--accent-rgb),0.24)',
    }}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el || !el.duration) return;
          setCurrent(el.currentTime);
          setProgress(el.currentTime / el.duration);
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 58%, #fff 42%), color-mix(in srgb, var(--accent-color) 90%, #000 10%))',
          boxShadow: '0 0 12px rgba(var(--accent-rgb),0.4)',
        }}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <rect x="3" y="2" width="3.4" height="12" rx="1" fill="#241A0C" />
            <rect x="9.6" y="2" width="3.4" height="12" rx="1" fill="#241A0C" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <path d="M4 2.4 L13.5 8 L4 13.6 Z" fill="#241A0C" />
          </svg>
        )}
      </button>
      <div
        onClick={seek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(107,82,38,0.14)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`,
          background: 'linear-gradient(90deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 65%, #fff 35%))',
          boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)',
        }} />
      </div>
      <div style={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted-color)', flexShrink: 0, minWidth: 70, textAlign: 'right' }}>
        {fmt(current)} / {fmt(duration)}
      </div>
    </div>
  );
}

const TabMediaPipeline = () => {
  const { tracks, fetchTracks } = useIdentity();
  const { playTrack } = useAudio();
  const { currentJob, stagedAudio, uploading, loadingMessage, uploadAudio, clearStagedAudio, startPipeline, approvePipeline, regeneratePipeline, resetJob } = usePipeline();
  const [savingId, setSavingId] = useState<string | null>(null);

  // Review-panel state (per Reza, 2026-07-09): cover and caption are two
  // fully independent boxes. Nothing auto-generates — each box only acts
  // when its own Generate/Regenerate button is clicked. busyArt/busyNarrative
  // are separate booleans (not one shared field) so the two boxes never
  // fight over a single "is something loading" flag.
  const [manualTitle, setManualTitle] = useState('');
  const [manualNarrative, setManualNarrative] = useState('');
  const [narrativeTouched, setNarrativeTouched] = useState(false);
  const [manualCoverUrl, setManualCoverUrl] = useState<string | null>(null);
  const [coverDismissed, setCoverDismissed] = useState(false); // admin clicked Delete on the AI cover
  const [busyArt, setBusyArt] = useState(false);
  const [busyNarrative, setBusyNarrative] = useState(false);
  const [busyCoverUpload, setBusyCoverUpload] = useState(false);
  const [busyApprove, setBusyApprove] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // "Select from Library" (2026-07-09, per Reza): browse Poster Studio's
  // generated-posters gallery and pick one directly as this track's cover.
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState<GeneratedPoster[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Keep the caption field in sync with whatever the AI just generated —
  // UNLESS the admin has already started typing their own (don't clobber
  // a manual edit in progress).
  useEffect(() => {
    const generatedEn = currentJob?.generatedNarrative?.en;
    if (generatedEn && !narrativeTouched) setManualNarrative(generatedEn);
  }, [currentJob?.generatedNarrative, narrativeTouched]);

  useEffect(() => {
    const detectedTitle = (currentJob?.audioMetadata as Record<string, unknown> | null)?.title as string | undefined;
    if (detectedTitle && !manualTitle) setManualTitle(detectedTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.audioMetadata]);

  const resetReviewState = () => {
    setManualTitle('');
    setManualNarrative('');
    setNarrativeTouched(false);
    setManualCoverUrl(null);
    setCoverDismissed(false);
    setSamplePrompt(null);
  };

  const effectiveCoverUrl = manualCoverUrl || (coverDismissed ? null : currentJob?.generatedArtUrl) || null;

  const handleGenerateArt = async () => {
    if (!currentJob) return;
    setBusyArt(true);
    setManualCoverUrl(null); // a fresh AI generation should be what's shown next, not a stale manual upload
    setCoverDismissed(false);
    try { await regeneratePipeline(currentJob.id, 'art'); } finally { setBusyArt(false); }
  };

  const handleGenerateNarrative = async () => {
    if (!currentJob) return;
    setBusyNarrative(true);
    setNarrativeTouched(false); // let the freshly-generated text flow back in
    try { await regeneratePipeline(currentJob.id, 'narrative'); } finally { setBusyNarrative(false); }
  };

  const handleDeleteCover = () => {
    setManualCoverUrl(null);
    setCoverDismissed(true);
  };

  const openLibrary = async () => {
    setShowLibrary(true);
    setLibraryLoading(true);
    try {
      const items = await apiGet<GeneratedPoster[]>('/api/poster-studio/generated');
      setLibraryItems(items ?? []);
    } catch (err) {
      console.error('Failed to load poster library:', err);
    } finally {
      setLibraryLoading(false);
    }
  };

  const selectFromLibrary = (url: string) => {
    setManualCoverUrl(url);
    setCoverDismissed(false);
    setShowLibrary(false);
  };

  // ---- Sample Prompt (2026-07-09, per Reza): read-only, copy-only view of
  // the exact prompt our AI would use — a manual fallback if automatic
  // generation ever fails: paste into ChatGPT/Midjourney/etc. and upload
  // the result by hand via "Upload your own" / typing the caption directly.
  const [samplePrompt, setSamplePrompt] = useState<{ field: 'art' | 'narrative'; text: string } | null>(null);
  const [loadingSamplePrompt, setLoadingSamplePrompt] = useState<'art' | 'narrative' | null>(null);
  const [copiedSamplePrompt, setCopiedSamplePrompt] = useState(false);

  const showSamplePrompt = async (field: 'art' | 'narrative') => {
    if (!currentJob) return;
    setLoadingSamplePrompt(field);
    setCopiedSamplePrompt(false);
    try {
      const result = await apiGet<{ prompt: string }>(`/api/pipeline/sample-prompt/${currentJob.id}?field=${field}`);
      setSamplePrompt({ field, text: result.prompt });
    } catch (err) {
      console.error('Sample prompt fetch failed:', err);
    } finally {
      setLoadingSamplePrompt(null);
    }
  };

  const copySamplePrompt = async () => {
    if (!samplePrompt) return;
    try {
      await navigator.clipboard.writeText(samplePrompt.text);
      setCopiedSamplePrompt(true);
      setTimeout(() => setCopiedSamplePrompt(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleManualCoverUpload = async (f: File) => {
    if (!currentJob) return;
    setBusyCoverUpload(true);
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', 'track-cover');
      form.append('entity_id', currentJob.id);
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) { setManualCoverUrl(uploaded.url); setCoverDismissed(false); }
    } catch (err) {
      console.error('Manual cover upload failed:', err);
    } finally {
      setBusyCoverUpload(false);
    }
  };

  const handleAccept = async () => {
    if (!currentJob) return;
    setBusyApprove(true);
    try {
      await approvePipeline(currentJob.id, {
        title: manualTitle ? { en: manualTitle, es: '', fr: '', zh: '', ja: '', ko: '' } : undefined,
        narrative: manualNarrative ? { en: manualNarrative, es: '', fr: '', zh: '', ja: '', ko: '' } : undefined,
        coverUrl: effectiveCoverUrl || undefined,
      });
    } finally {
      setBusyApprove(false);
    }
  };

  const handleFileSelected = (f: File | null | undefined) => {
    if (f) void uploadAudio(f);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
  };

  // Persist a single field change for a track (concept or featured star).
  // For the star we also clear the star on every OTHER track in the same
  // concept first, so each concept keeps at most one featured track.
  const updateTrack = useCallback(async (track: AudioTrack, patch: Partial<AudioTrack>) => {
    setSavingId(track.id);
    try {
      if (patch.isFeatured === true) {
        const concept = patch.concept ?? track.concept;
        const clashes = tracks.filter(
          (t) => t.id !== track.id && t.isFeatured && (t.concept ?? null) === (concept ?? null),
        );
        for (const c of clashes) {
          await apiPut(`/api/tracks/${c.id}`, { ...c, isFeatured: false });
        }
      }
      await apiPut(`/api/tracks/${track.id}`, { ...track, ...patch });
      await fetchTracks();
    } finally {
      setSavingId(null);
    }
  }, [tracks, fetchTracks]);

  // ---- Published-track management (Edit / Delete from the playlist) ----
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editCoverInputRef = useRef<HTMLInputElement>(null);

  const startEditingTrack = (track: AudioTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title?.en ?? '');
    setEditCaption(track.narrative?.en ?? '');
    setConfirmDeleteId(null);
  };

  const saveTrackEdits = async (track: AudioTrack) => {
    await updateTrack(track, {
      title: { ...(track.title ?? {}), en: editTitle } as AudioTrack['title'],
      narrative: { ...(track.narrative ?? {}), en: editCaption } as AudioTrack['narrative'],
    });
    setEditingTrackId(null);
  };

  const replaceTrackCover = async (track: AudioTrack, f: File) => {
    setSavingId(track.id);
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', 'track-cover');
      form.append('entity_id', track.id);
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) await updateTrack(track, { coverUrl: uploaded.url });
    } catch (err) {
      console.error('Cover replace failed:', err);
    } finally {
      setSavingId(null);
    }
  };

  const deleteTrack = async (trackId: string) => {
    setSavingId(trackId);
    try {
      await apiDelete(`/api/tracks/${trackId}`);
      setConfirmDeleteId(null);
      if (editingTrackId === trackId) setEditingTrackId(null);
      await fetchTracks();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()} className="adm-dropzone">
        <p className="adm-notice mb-1">Drag an .mp3 / .wav here, or</p>
        <label className="adm-btn adm-btn--ghost adm-btn--sm" style={{ display: 'inline-flex', cursor: 'pointer', position: 'relative' }}>
          Choose Audio File
          <input
            type="file"
            accept="audio/*"
            onChange={e => handleFileSelected(e.target.files?.[0])}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
        </label>
        {uploading && <p className="adm-notice mt-3">Uploading…</p>}
      </div>

      {/* Preview — upload is fully done and sitting here as a listenable
          file. AI processing has NOT started; it only begins when Start AI
          Processing is clicked (per Reza, 2026-07-09: the two must always
          be separate, deliberate steps). */}
      {stagedAudio && !currentJob && (
        <div className="adm-panel space-y-3">
          <p className="adm-notice" style={{ color: 'var(--accent-color)' }}>{stagedAudio.fileName}</p>
          <NeonAudioPlayer src={stagedAudio.url} />
          <div className="adm-row">
            <button onClick={() => void startPipeline()} className="adm-btn adm-btn--primary">
              Start AI Processing
            </button>
            <button onClick={() => clearStagedAudio()} className="adm-btn adm-btn--ghost adm-btn--sm">
              Discard
            </button>
          </div>
        </div>
      )}

      {currentJob && (
        <div className="adm-panel space-y-3">
          <p className="adm-notice" style={{ fontFamily: 'var(--font-mono)' }}>
            Status: {currentJob.status} ({currentJob.progress}%)
          </p>
          {loadingMessage && currentJob.status !== 'ready_for_review' && (
            <p className="adm-notice" style={{ color: 'var(--accent-color)' }}>{loadingMessage}</p>
          )}
          <div className="adm-progress-track">
            <div className="adm-progress-fill" style={{ width: `${currentJob.progress}%` }} />
          </div>
          {currentJob.errorMessage && <p className="text-xs" style={{ color: '#E38B7A' }}>{currentJob.errorMessage}</p>}

          {currentJob.status === 'ready_for_review' && (
            <div className="space-y-4" style={{ borderTop: '1px solid var(--adm-border)', paddingTop: '0.9rem' }}>
              {/* Title */}
              <div>
                <label className="adm-label">Title</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Untitled Composition"
                  className="adm-input"
                />
              </div>

              {/* ---- Box 1: Cover art — fully independent ---- */}
              <div className="adm-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <label className="adm-label">Cover Art</label>
                <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 148, height: 84, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', flexShrink: 0, border: '1px solid var(--adm-border)' }}>
                    {effectiveCoverUrl ? (
                      <img src={effectiveCoverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="adm-notice" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', textAlign: 'center', padding: '0 6px' }}>
                        {busyArt ? '' : 'No cover yet'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2" style={{ flex: 1 }}>
                    {busyArt && (
                      <p className="adm-notice" style={{ color: 'var(--accent-color)' }}>
                        {loadingMessage || 'Generating cover art…'}
                      </p>
                    )}
                    <div className="adm-row" style={{ flexWrap: 'wrap' }}>
                      <button onClick={() => void handleGenerateArt()} disabled={busyArt} className="adm-btn adm-btn--ghost adm-btn--sm">
                        {busyArt ? 'Working…' : effectiveCoverUrl ? 'Regenerate' : 'Generate'}
                      </button>
                      <button onClick={() => coverInputRef.current?.click()} disabled={busyArt || busyCoverUpload} className="adm-btn adm-btn--ghost adm-btn--sm">
                        {busyCoverUpload ? 'Uploading…' : effectiveCoverUrl ? 'Replace' : 'Upload your own'}
                      </button>
                      <button onClick={() => void openLibrary()} disabled={busyArt || busyCoverUpload} className="adm-btn adm-btn--ghost adm-btn--sm">
                        Select from Library
                      </button>
                      {effectiveCoverUrl && (
                        <button onClick={handleDeleteCover} disabled={busyArt || busyCoverUpload} className="adm-btn adm-btn--ghost adm-btn--sm">
                          Delete
                        </button>
                      )}
                      <button onClick={() => void showSamplePrompt('art')} disabled={loadingSamplePrompt === 'art'} className="adm-btn adm-btn--ghost adm-btn--sm">
                        {loadingSamplePrompt === 'art' ? 'Loading…' : 'Sample Prompt'}
                      </button>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleManualCoverUpload(f); e.target.value = ''; }}
                      />
                    </div>
                    {manualCoverUrl && <p className="adm-notice">Your uploaded photo — takes priority over the AI one.</p>}
                    <p className="adm-notice" style={{ opacity: 0.7 }}>
                      Cropping/resizing tools aren't built yet — for now, upload an image already sized how you want it.
                    </p>
                    {samplePrompt?.field === 'art' && (
                      <div className="adm-panel" style={{ background: 'rgba(0,0,0,0.25)' }}>
                        <p className="adm-notice mb-1">
                          Exact prompt our AI would use — paste into ChatGPT/Midjourney/etc. if Generate ever fails, then upload the result above.
                        </p>
                        <textarea readOnly rows={4} value={samplePrompt.text} className="adm-textarea" style={{ opacity: 0.85 }} />
                        <div className="adm-row mt-2">
                          <button onClick={() => void copySamplePrompt()} className="adm-btn adm-btn--ghost adm-btn--sm">
                            {copiedSamplePrompt ? 'Copied!' : 'Copy'}
                          </button>
                          <button onClick={() => setSamplePrompt(null)} className="adm-btn adm-btn--ghost adm-btn--sm">
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ---- Box 2: Caption — fully independent ---- */}
              <div className="adm-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <label className="adm-label">Caption</label>
                {busyNarrative && (
                  <p className="adm-notice mb-1" style={{ color: 'var(--accent-color)' }}>
                    {loadingMessage || 'Writing a caption…'}
                  </p>
                )}
                <textarea
                  rows={3}
                  value={manualNarrative}
                  onChange={(e) => { setManualNarrative(e.target.value); setNarrativeTouched(true); }}
                  placeholder="No caption yet — write your own or click Generate."
                  className="adm-textarea"
                  disabled={busyNarrative}
                />
                <div className="adm-row mt-2">
                  <button onClick={() => void handleGenerateNarrative()} disabled={busyNarrative} className="adm-btn adm-btn--ghost adm-btn--sm">
                    {busyNarrative ? 'Working…' : manualNarrative ? 'Regenerate' : 'Generate'}
                  </button>
                  {manualNarrative && !busyNarrative && (
                    <button onClick={() => { setManualNarrative(''); setNarrativeTouched(true); }} className="adm-btn adm-btn--ghost adm-btn--sm">
                      Clear
                    </button>
                  )}
                  <button onClick={() => void showSamplePrompt('narrative')} disabled={loadingSamplePrompt === 'narrative'} className="adm-btn adm-btn--ghost adm-btn--sm">
                    {loadingSamplePrompt === 'narrative' ? 'Loading…' : 'Sample Prompt'}
                  </button>
                </div>
                <p className="adm-notice mt-1">
                  Regenerate as many times as you like, or type your own — whatever's in the box is what gets used.
                  Auto-translates to the other 5 languages on publish.
                </p>
                {samplePrompt?.field === 'narrative' && (
                  <div className="adm-panel" style={{ background: 'rgba(0,0,0,0.25)' }}>
                    <p className="adm-notice mb-1">
                      Exact prompt our AI would use — paste into ChatGPT/etc. if Generate ever fails, then paste the result into the box above.
                    </p>
                    <textarea readOnly rows={3} value={samplePrompt.text} className="adm-textarea" style={{ opacity: 0.85 }} />
                    <div className="adm-row mt-2">
                      <button onClick={() => void copySamplePrompt()} className="adm-btn adm-btn--ghost adm-btn--sm">
                        {copiedSamplePrompt ? 'Copied!' : 'Copy'}
                      </button>
                      <button onClick={() => setSamplePrompt(null)} className="adm-btn adm-btn--ghost adm-btn--sm">
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => void handleAccept()} disabled={busyApprove} className="adm-btn adm-btn--primary">
                {busyApprove ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}

          {currentJob.status === 'publishing' && (
            <p className="adm-notice">Publishing…</p>
          )}

          {(currentJob.status === 'complete' || currentJob.status === 'error') && (
            <button onClick={() => { resetJob(); resetReviewState(); void fetchTracks(); }} className="adm-btn adm-btn--ghost adm-btn--sm">
              Reset
            </button>
          )}
        </div>
      )}
      <div className="adm-panel">
        <div className="adm-panel-title">Playlist</div>
        <p className="adm-panel-subtitle">
          Assign each track a concept, and star one per concept to feature it on the home page.
        </p>
        <div>
          {tracks.map(track => (
            <div key={track.id}>
            <div className="adm-track-row">
              {/* Cover thumbnail */}
              <div style={{ width: 38, height: 38, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--adm-border)' }}>
                {track.coverUrl && (
                  <img src={track.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>

              {/* Star (featured) toggle */}
              <button
                onClick={() => { void updateTrack(track, { isFeatured: !track.isFeatured }); }}
                disabled={savingId === track.id}
                title={track.isFeatured ? 'Featured on home page' : 'Mark as featured (one per concept)'}
                style={{ fontSize: '1.15rem', lineHeight: 1, color: track.isFeatured ? 'var(--accent-color)' : 'var(--text-dim-color)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                className="disabled:opacity-40"
                aria-label="Toggle featured"
              >
                {track.isFeatured ? '\u2605' : '\u2606'}
              </button>

              {/* Title + concept, stacked */}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{track.title?.en || 'Untitled'}</div>
                {track.concept && (
                  <div className="text-[0.65rem]" style={{ color: 'var(--text-dim-color)' }}>{track.concept}</div>
                )}
              </div>

              {/* Concept selector */}
              <select
                value={track.concept ?? ''}
                onChange={e => { void updateTrack(track, { concept: e.target.value || null }); }}
                disabled={savingId === track.id}
                className="adm-select"
                style={{ width: 'auto', padding: '0.35rem 0.55rem', fontSize: '0.72rem', flexShrink: 0, ...DARK_SELECT_STYLE }}
                aria-label="Concept"
              >
                <option value="" style={DARK_OPTION_STYLE}>— concept —</option>
                {CONCEPT_OPTIONS.map(c => <option key={c} value={c} style={DARK_OPTION_STYLE}>{c}</option>)}
              </select>

              {/* Live badge + play */}
              <span className={`adm-badge ${track.isLive ? 'adm-badge--ok' : 'adm-badge--paid'}`}>
                {track.isLive ? 'Live' : 'Draft'}
              </span>
              <button
                onClick={() => { void playTrack(track); }}
                aria-label={`Play ${track.title?.en || 'track'}`}
                title="Play"
                style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--adm-border)',
                  color: 'var(--text-color)', cursor: 'pointer', fontSize: '0.62rem',
                }}
              >
                ▶
              </button>

              {/* Edit / Delete */}
              <button
                onClick={() => editingTrackId === track.id ? setEditingTrackId(null) : startEditingTrack(track)}
                disabled={savingId === track.id}
                className="adm-btn adm-btn--ghost adm-btn--sm"
                style={{ flexShrink: 0 }}
                title="Edit title, caption, or cover"
              >
                {editingTrackId === track.id ? 'Close' : 'Edit'}
              </button>
              {confirmDeleteId === track.id ? (
                <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                  <button
                    onClick={() => void deleteTrack(track.id)}
                    disabled={savingId === track.id}
                    className="adm-btn adm-btn--sm"
                    style={{ background: '#7A2E2E', color: '#F3D9D9', border: '1px solid #A04545' }}
                  >
                    {savingId === track.id ? '…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="adm-btn adm-btn--ghost adm-btn--sm">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(track.id)}
                  disabled={savingId === track.id}
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  style={{ flexShrink: 0, color: '#E38B7A' }}
                  title="Delete this track"
                >
                  Delete
                </button>
              )}
            </div>

            {/* Inline edit panel */}
            {editingTrackId === track.id && (
              <div className="adm-panel space-y-2" style={{ margin: '0.35rem 0 0.7rem 0', background: 'rgba(255,255,255,0.02)' }}>
                <div>
                  <label className="adm-label">Title</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="adm-input" />
                </div>
                <div>
                  <label className="adm-label">Caption</label>
                  <textarea rows={2} value={editCaption} onChange={(e) => setEditCaption(e.target.value)} className="adm-textarea" />
                </div>
                <div className="adm-row" style={{ flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void saveTrackEdits(track)}
                    disabled={savingId === track.id}
                    className="adm-btn adm-btn--primary adm-btn--sm"
                  >
                    {savingId === track.id ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => editCoverInputRef.current?.click()}
                    disabled={savingId === track.id}
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                  >
                    Replace cover
                  </button>
                  <input
                    ref={editCoverInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceTrackCover(track, f); e.target.value = ''; }}
                  />
                </div>
              </div>
            )}
            </div>
          ))}
          {tracks.length === 0 && (
            <p className="adm-notice">No tracks yet. Upload one above.</p>
          )}
        </div>
      </div>

      {showLibrary && createPortal(
        <>
          <div onClick={() => setShowLibrary(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 640,
            maxHeight: '75%', overflowY: 'auto', zIndex: 9999,
            background: '#171410', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
            padding: '1.2rem', color: '#e9e4da',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>SELECT FROM LIBRARY — GENERATED POSTERS</div>
              <button onClick={() => setShowLibrary(false)} style={{ background: 'transparent', border: 'none', color: '#e9e4da', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
            </div>
            {libraryLoading && <p style={{ fontSize: '0.7rem', color: 'rgba(233,228,218,0.6)' }}>Loading…</p>}
            {!libraryLoading && libraryItems.length === 0 && (
              <p style={{ fontSize: '0.7rem', color: 'rgba(233,228,218,0.6)' }}>Nothing in Poster Studio's gallery yet — generate something there first.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
              {libraryItems.map((item) => (
                <button key={item.id} onClick={() => selectFromLibrary(item.posterUrl)} style={{ padding: 0, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'none', cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}>
                  <img src={item.posterUrl} alt={item.templateName ?? ''} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                  <div style={{ padding: '4px 6px' }}>
                    <p style={{ fontSize: '0.58rem', color: 'rgba(233,228,218,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.templateName ?? 'Untitled'}</p>
                    <p style={{ fontSize: '0.55rem', color: 'var(--accent-color)', textTransform: 'uppercase' }}>{item.platform}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

// Native <select>/<optgroup> can't render colored badges or icons inside
// options (a real HTML limitation, not a bug) — so tier tags and quality
// bars need a custom dropdown instead of a native <select>.
function SignalBars({ quality }: { quality: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12, flexShrink: 0 }} title={`Quality ${quality}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 3 + i * 2,
            borderRadius: 1,
            background: i <= quality ? 'var(--accent-color)' : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </span>
  );
}

interface PickerProvider {
  id: string;
  label: string;
  tier?: 'paid' | 'limited free' | 'free';
  keyName: string;
  docsUrl: string;
  noKeyRequired?: boolean;
  models: { id: string; label: string; quality: number }[];
}

function tierBadgeClass(tier?: string) {
  if (tier === 'free') return 'adm-badge--free';
  if (tier === 'limited free') return 'adm-badge--limited';
  return 'adm-badge--paid';
}

function ProviderModelPicker({
  providers,
  value,
  onChange,
}: {
  providers: PickerProvider[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [providerId, modelId] = value.split('::');
  const selectedProvider = providers.find((p) => p.id === providerId);
  const selectedModel = selectedProvider?.models.find((m) => m.id === modelId);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="adm-select"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}
      >
        <span>
          {selectedModel ? `${selectedProvider!.label} — ${selectedModel.label}` : '— choose a provider & model —'}
        </span>
        <span aria-hidden style={{ opacity: 0.6, marginLeft: 8 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 340,
            overflowY: 'auto',
            background: 'var(--surface2-color, #141414)',
            border: '1px solid var(--adm-border)',
            borderRadius: 10,
            zIndex: 60,
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
          }}
        >
          {providers.map((p) => (
            <div key={p.id}>
              <div
                style={{
                  padding: '0.5rem 0.85rem 0.3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--surface2-color, #141414)',
                }}
              >
                <span className="adm-sidebar-section-label" style={{ padding: 0, margin: 0 }}>{p.label}</span>
                {p.tier && <span className={`adm-badge ${tierBadgeClass(p.tier)}`}>{p.tier}</span>}
              </div>
              {p.models.map((m) => {
                const active = p.id === providerId && m.id === modelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onChange(`${p.id}::${m.id}`); setOpen(false); }}
                    className="adm-nav-item"
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.85rem',
                      borderRadius: 0,
                      fontSize: '0.78rem',
                      background: active ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
                      color: active ? 'var(--accent-color)' : 'var(--text-color)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                    <SignalBars quality={m.quality} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TabGatekeeperHub = () => {
  const [registry, setRegistry] = useState<{
    text: PickerProvider[];
    image: PickerProvider[];
  }>({ text: [], image: [] });
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, { isConfigured: boolean; testedAt: string | null }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});

  // "Which provider is currently active" — per Reza (2026-07-08): no
  // hardcoded default, admin picks explicitly and confirms.
  const [activeText, setActiveText] = useState<{ providerId: string; model: string }>({ providerId: '', model: '' });
  const [activeImage, setActiveImage] = useState<{ providerId: string; model: string }>({ providerId: '', model: '' });

  const [aws, setAws] = useState({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1', bucket: '', tier: 'free' as 'free' | 'paid' });
  const [awsShowSecret, setAwsShowSecret] = useState(false);

  const fetchStatus = async () => {
    try {
      const rows = await apiGet<Array<{ keyName: string; isConfigured: boolean; testedAt: string | null; value?: string }>>('/api/keys/status');
      const map: typeof status = {};
      const keyValues: Record<string, string> = {};
      rows.forEach((r) => {
        map[r.keyName] = { isConfigured: r.isConfigured, testedAt: r.testedAt };
        if (r.value === undefined) return;
        if (r.keyName === 'AWS_S3_CREDENTIALS') {
          try {
            const parsed = JSON.parse(r.value);
            setAws((prev) => ({ ...prev, ...parsed }));
          } catch {
            // ignore malformed stored value
          }
          return;
        }
        if (r.keyName === 'TEXT_AI_SELECTED' || r.keyName === 'IMAGE_AI_SELECTED') {
          try {
            const parsed = JSON.parse(r.value) as { providerId: string; model: string };
            if (r.keyName === 'TEXT_AI_SELECTED') setActiveText(parsed);
            else setActiveImage(parsed);
          } catch {
            // ignore malformed stored value
          }
          return;
        }
        keyValues[r.keyName] = r.value;
      });
      setStatus(map);
      setProviderKeys((prev) => ({ ...keyValues, ...prev }));
    } catch {
      // status is a nicety, not a blocker
    }
  };

  const fetchRegistry = async () => {
    try {
      const data = await apiGet<typeof registry>('/api/keys/ai-providers');
      setRegistry(data);
    } catch {
      // registry fetch failed — sections just render empty, not fatal
    }
  };

  useEffect(() => { fetchStatus(); fetchRegistry(); }, []);

  const toggleShow = (key: string) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

  const handleTest = async (keyName: string, keyValue: string, model?: string) => {
    setBusy(prev => ({ ...prev, [keyName]: true }));
    setNotice(prev => ({ ...prev, [keyName]: '' }));
    try {
      const res = await apiPost<{ message?: string }>('/api/keys/test', { keyName, keyValue, model });
      setNotice(prev => ({ ...prev, [keyName]: res.message || 'Connected.' }));
    } catch (err) {
      setNotice(prev => ({ ...prev, [keyName]: err instanceof Error ? err.message : 'Test failed.' }));
    } finally {
      setBusy(prev => ({ ...prev, [keyName]: false }));
    }
  };

  const handleSave = async (keyName: string, keyValue: string) => {
    setBusy(prev => ({ ...prev, [keyName]: true }));
    setNotice(prev => ({ ...prev, [keyName]: '' }));
    try {
      await apiPost('/api/keys', { keyName, keyValue });
      setNotice(prev => ({ ...prev, [keyName]: 'Saved.' }));
      await fetchStatus();
    } catch (err) {
      setNotice(prev => ({ ...prev, [keyName]: err instanceof Error ? err.message : 'Save failed.' }));
    } finally {
      setBusy(prev => ({ ...prev, [keyName]: false }));
    }
  };

  const handleSetActive = async (kind: 'text' | 'image', providerId: string, model: string) => {
    const keyName = kind === 'text' ? 'TEXT_AI_SELECTED' : 'IMAGE_AI_SELECTED';
    if (!providerId || !model) {
      setNotice(prev => ({ ...prev, [keyName]: 'Pick a provider and a model first.' }));
      return;
    }
    await handleSave(keyName, JSON.stringify({ providerId, model }));
  };

  const awsJson = () => JSON.stringify(aws);

  const tierColor = (tier?: 'paid' | 'limited free' | 'free') => {
    if (tier === 'free') return '#5FD98A';
    if (tier === 'limited free') return 'var(--accent-color)';
    if (tier === 'paid') return 'var(--text-muted-color)';
    return 'var(--text-muted-color)';
  };

  const handleActivateSelected = async (kind: 'text' | 'image') => {
    const active = kind === 'text' ? activeText : activeImage;
    const providers = kind === 'text' ? registry.text : registry.image;
    const provider = providers.find((p) => p.id === active.providerId);
    if (!provider || !active.model) return;
    const value = provider.noKeyRequired ? 'no-key-required' : (providerKeys[provider.keyName] || '');
    if (!provider.noKeyRequired && !value) {
      setNotice((prev) => ({ ...prev, [provider.keyName]: 'Enter an API key first.' }));
      return;
    }
    await handleSave(provider.keyName, value);
    await handleSetActive(kind, active.providerId, active.model);
  };

  const renderProviderSection = (kind: 'text' | 'image') => {
    const providers = kind === 'text' ? registry.text : registry.image;
    const active = kind === 'text' ? activeText : activeImage;
    const setActive = kind === 'text' ? setActiveText : setActiveImage;
    const activeKeyName = kind === 'text' ? 'TEXT_AI_SELECTED' : 'IMAGE_AI_SELECTED';
    const selectedProvider = providers.find((p) => p.id === active.providerId);
    const comboValue = active.providerId && active.model ? `${active.providerId}::${active.model}` : '';

    return (
      <div className="adm-panel space-y-3">
        <div className="adm-panel-title">{kind === 'text' ? 'Text AI Providers' : 'Image AI Providers'}</div>
        <p className="adm-panel-subtitle">
          Pick a provider + model below — its fields (if any) appear right under it. No default is assumed;
          "Generate" only works once you Save &amp; Activate one here.{' '}
          <span style={{ color: tierColor('paid') }}>paid</span> needs a billed account,{' '}
          <span style={{ color: tierColor('limited free') }}>limited free</span> has a free tier with rate limits,{' '}
          <span style={{ color: tierColor('free') }}>free</span> needs nothing at all.
        </p>

        <div className="adm-panel adm-panel--raised">
          <ProviderModelPicker
            providers={providers}
            value={comboValue}
            onChange={(v) => {
              const [providerId, model] = v.split('::');
              setActive({ providerId: providerId ?? '', model: model ?? '' });
            }}
          />

          {selectedProvider && (
            <div className="mt-3 space-y-2">
              {selectedProvider.noKeyRequired ? (
                <p className="adm-notice">No API key needed for {selectedProvider.label}.</p>
              ) : (
                <div className="adm-row">
                  <input
                    type={show[selectedProvider.keyName] ? 'text' : 'password'}
                    value={providerKeys[selectedProvider.keyName] ?? ''}
                    onChange={(e) => setProviderKeys((prev) => ({ ...prev, [selectedProvider.keyName]: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="API key"
                    className="adm-input"
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button onClick={() => toggleShow(selectedProvider.keyName)} className="adm-btn adm-btn--ghost adm-btn--sm">
                    {show[selectedProvider.keyName] ? 'Hide' : 'Show'}
                  </button>
                  <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer" className="text-xs underline text-[var(--text-muted-color)] whitespace-nowrap">get a key</a>
                </div>
              )}

              <div className="adm-row">
                {!selectedProvider.noKeyRequired && (
                  <button
                    onClick={() => handleTest(selectedProvider.keyName, providerKeys[selectedProvider.keyName] || '', active.model)}
                    disabled={busy[selectedProvider.keyName] || !providerKeys[selectedProvider.keyName]}
                    className="adm-btn adm-btn--ghost"
                  >
                    Test
                  </button>
                )}
                <button
                  onClick={() => handleActivateSelected(kind)}
                  disabled={busy[selectedProvider.keyName] || busy[activeKeyName] || (!selectedProvider.noKeyRequired && !providerKeys[selectedProvider.keyName])}
                  className="adm-btn adm-btn--primary"
                >
                  Save &amp; Activate
                </button>
              </div>

              {status[selectedProvider.keyName]?.isConfigured && <span className="adm-badge adm-badge--ok">✓ configured</span>}
              {notice[selectedProvider.keyName] && <p className="adm-notice">{notice[selectedProvider.keyName]}</p>}
              {notice[activeKeyName] && <p className="adm-notice">{notice[activeKeyName]}</p>}
            </div>
          )}
        </div>

        {status[activeKeyName]?.isConfigured && (
          <p className="adm-notice" style={{ color: 'var(--accent-color)' }}>
            ✓ Active {kind} provider saved — this is what "Generate" uses right now.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* AI model-update alerts — surfaces when a configured provider (e.g.
          Gemini) has models we don't have listed yet, so stale entries get
          noticed instead of silently causing "model not found" failures. */}
      <div className="adm-panel">
        <label className="adm-label">
          YouTube Data API {status.YOUTUBE_API_DATA_V3?.isConfigured && <span className="adm-badge adm-badge--ok" style={{ marginLeft: 6 }}>configured</span>}
        </label>
        <div className="adm-row">
          <input type={show.YOUTUBE_API_DATA_V3 ? 'text' : 'password'}
            value={providerKeys.YOUTUBE_API_DATA_V3 ?? ''}
            onChange={e => setProviderKeys(prev => ({ ...prev, YOUTUBE_API_DATA_V3: e.target.value }))}
            className="adm-input"
            style={{ flex: 1, minWidth: 160 }}
          />
          <button onClick={() => toggleShow('YOUTUBE_API_DATA_V3')} className="adm-btn adm-btn--ghost adm-btn--sm">{show.YOUTUBE_API_DATA_V3 ? 'Hide' : 'Show'}</button>
          <button onClick={() => handleTest('YOUTUBE_API_DATA_V3', providerKeys.YOUTUBE_API_DATA_V3 || '')} disabled={busy.YOUTUBE_API_DATA_V3 || !providerKeys.YOUTUBE_API_DATA_V3} className="adm-btn adm-btn--ghost adm-btn--sm">Test</button>
          <button onClick={() => handleSave('YOUTUBE_API_DATA_V3', providerKeys.YOUTUBE_API_DATA_V3 || '')} disabled={busy.YOUTUBE_API_DATA_V3 || !providerKeys.YOUTUBE_API_DATA_V3} className="adm-btn adm-btn--primary adm-btn--sm">Save</button>
        </div>
        {notice.YOUTUBE_API_DATA_V3 && <p className="adm-notice mt-1">{notice.YOUTUBE_API_DATA_V3}</p>}
      </div>

      {renderProviderSection('text')}
      {renderProviderSection('image')}


      {/* External service accounts — structured credentials (AWS S3 first;
          add more the same way: a small fixed-fields form + a JSON blob
          under one keyName in the same encrypted api_keys table). */}
      <div>
        <hr className="adm-section-divider mb-5" />
        <div className="adm-panel space-y-3">
          <div className="adm-panel-title">External Service Accounts</div>
          <p className="adm-panel-subtitle">
            Credentials for outside services this site depends on (storage, APIs). Encrypted at rest, same as the keys
            above. Anyone with the admin login can recreate these with their own account — just re-enter fresh
            credentials here.
          </p>

          <div className="adm-panel adm-panel--raised space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-semibold">AWS S3 (file storage)</span>
              <div className="flex items-center gap-2">
                {status.AWS_S3_CREDENTIALS?.isConfigured && <span className="adm-badge adm-badge--ok">✓ configured</span>}
                <select
                  value={aws.tier}
                  onChange={e => setAws(prev => ({ ...prev, tier: e.target.value as 'free' | 'paid' }))}
                  className="adm-select"
                  style={{ width: 'auto', padding: '0.3rem 0.55rem', fontSize: '0.72rem', ...DARK_SELECT_STYLE }}
                  title="Not verified against AWS billing — just a note for yourself"
                >
                  <option value="free" style={DARK_OPTION_STYLE}>Free tier</option>
                  <option value="paid" style={DARK_OPTION_STYLE}>Paid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="adm-label">Access Key ID</label>
                <input type="text" value={aws.accessKeyId} autoComplete="off" name="aws-access-key-id-field"
                  onChange={e => setAws(prev => ({ ...prev, accessKeyId: e.target.value }))}
                  className="adm-input"
                />
              </div>
              <div>
                <label className="adm-label">Secret Access Key</label>
                <div className="adm-row">
                  <input type={awsShowSecret ? 'text' : 'password'} value={aws.secretAccessKey} autoComplete="new-password" name="aws-secret-key-field"
                    onChange={e => setAws(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                    className="adm-input"
                    style={{ flex: 1 }}
                  />
                  <button onClick={() => setAwsShowSecret(v => !v)} className="adm-btn adm-btn--ghost adm-btn--sm">
                    {awsShowSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="adm-label">Region</label>
                <input type="text" value={aws.region} placeholder="us-east-2" autoComplete="off" name="ace-aws-region-field"
                  onChange={e => setAws(prev => ({ ...prev, region: e.target.value }))}
                  className="adm-input"
                />
              </div>
              <div>
                <label className="adm-label">Bucket Name</label>
                <input type="text" value={aws.bucket} placeholder="amirmoslehiace2026" autoComplete="off" name="ace-aws-bucket-field"
                  onChange={e => setAws(prev => ({ ...prev, bucket: e.target.value }))}
                  className="adm-input"
                />
              </div>
            </div>

            <div className="adm-row">
              <button
                onClick={() => handleTest('AWS_S3_CREDENTIALS', awsJson())}
                disabled={busy.AWS_S3_CREDENTIALS || !aws.accessKeyId || !aws.secretAccessKey || !aws.bucket}
                className="adm-btn adm-btn--ghost"
              >
                Test Connection
              </button>
              <button
                onClick={() => handleSave('AWS_S3_CREDENTIALS', awsJson())}
                disabled={busy.AWS_S3_CREDENTIALS || !aws.accessKeyId || !aws.secretAccessKey || !aws.bucket}
                className="adm-btn adm-btn--primary"
              >
                Save
              </button>
            </div>
            {/* Live diagnostic — shows exactly what the app currently sees
                in each field (character counts), so a stuck "disabled"
                button is instantly self-diagnosable without DevTools. */}
            <p className="text-xs" style={{ color: 'var(--text-dim-color)', opacity: 0.75 }}>
              Access Key ID: {aws.accessKeyId.length} chars · Secret Access Key: {aws.secretAccessKey.length} chars ·
              Bucket: {aws.bucket.length} chars · Region: {aws.region.length} chars
              {busy.AWS_S3_CREDENTIALS ? ' · busy=true (a request is stuck — refresh the page)' : ''}
            </p>
            {notice.AWS_S3_CREDENTIALS && <p className="adm-notice">{notice.AWS_S3_CREDENTIALS}</p>}
            <p className="text-xs" style={{ color: 'var(--text-dim-color)', opacity: 0.65 }}>
              Note: "Free tier" above is a note you set yourself — AWS doesn't expose a simple way to check billing
              status from here. "Test Connection" for real (attempts to reach the bucket with these credentials) still
              works regardless of tier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const TabDocumentAssistant = () => {
  const [file, setFile] = useState<File | null>(null);
  const [checklist, setChecklist] = useState<{ category: string; items: string[] }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setNotice(null);
    setChecklist([]);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const data = await apiPost<{
        timecodes?: unknown[];
        revisions?: unknown[];
        deliverables?: unknown[];
        deadlines?: unknown[];
        degraded?: boolean;
        message?: string;
      } | null>('/api/documents/analyze', formData);

      if (!data) {
        setNotice('Document analysis is unavailable in demo mode.');
        return;
      }

      const toItems = (v: unknown[] | undefined): string[] =>
        Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : [];

      const groups = [
        { category: 'Timecodes', items: toItems(data.timecodes) },
        { category: 'Revisions', items: toItems(data.revisions) },
        { category: 'Deliverables', items: toItems(data.deliverables) },
        { category: 'Deadlines', items: toItems(data.deadlines) },
      ].filter((g) => g.items.length > 0);

      setChecklist(groups);
      if (data.degraded || groups.length === 0) {
        setNotice(data.message ?? 'No items extracted. Configure LLM_NARRATIVE_API_KEY for AI analysis.');
      }
    } catch {
      setNotice('Could not analyze the document. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="adm-panel">
        <div className="adm-panel-title">Document Assistant</div>
        <p className="adm-panel-subtitle">Upload a brief/contract (.pdf, .txt, .eml) to pull out timecodes, revisions, deliverables, and deadlines.</p>

        <div
          className="adm-dropzone"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          {file ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{file.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted-color)', marginTop: 4 }}>
                Click to choose a different file
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '1.6rem', marginBottom: 6, color: 'var(--accent-color)' }} aria-hidden>⇪</div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Drop or click to upload</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted-color)', marginTop: 4 }}>.pdf, .txt, or .eml</div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.eml"
          style={{ display: 'none' }}
          onChange={(e) => { setFile(e.target.files?.[0] || null); setChecklist([]); setNotice(null); }}
        />

        {file && (
          <div className="adm-row mt-4">
            <button onClick={handleAnalyze} disabled={analyzing} className="adm-btn adm-btn--primary">
              {analyzing ? 'Analyzing…' : 'Analyze'}
            </button>
            <button onClick={() => { setFile(null); setChecklist([]); setNotice(null); }} className="adm-btn adm-btn--ghost">
              Clear
            </button>
          </div>
        )}
        {notice && <p className="adm-notice mt-3">{notice}</p>}
      </div>
      {checklist.length > 0 && (
        <div className="adm-panel space-y-3">
          {checklist.map((group, i) => (
            <div key={i}>
              <h4 className="font-semibold text-sm mb-1">{group.category}</h4>
              <ul className="list-disc pl-5 text-xs text-[var(--text-muted-color)] space-y-0.5">
                {group.items.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------- Main Dashboard Component ----------
// ---- AI Model Update Bell (2026-07-09, per Reza) ----
// Compact sidebar notification instead of a big always-visible text dump:
// a bell + badge, click to open a small dropdown listing what's new per
// provider, with a signal-bar importance indicator and a per-model Apply
// button that adds it straight into the selectable model dropdown.
interface ModelUpdateAlertT {
  providerId: string;
  providerLabel: string;
  newModelIds: string[];
  truncatedCount: number;
  importance: 'high' | 'medium';
  description: string;
}

function ImportanceBars({ importance }: { importance: 'high' | 'medium' }) {
  const filled = importance === 'high' ? 4 : 2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, height: 10 }} title={importance === 'high' ? 'Major provider' : 'Secondary provider'}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{
          width: 3, height: 3 + i * 2.2, borderRadius: 1,
          background: i < filled ? '#D4A24C' : 'rgba(255,255,255,0.15)',
        }} />
      ))}
    </span>
  );
}

function ModelUpdatesBell() {
  const [alerts, setAlerts] = useState<ModelUpdateAlertT[]>([]);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  const fetchAlerts = async () => {
    try {
      const result = await apiGet<{ alerts: ModelUpdateAlertT[] }>('/api/model-updates');
      setAlerts(result.alerts ?? []);
    } catch { /* non-critical */ }
  };

  useEffect(() => { void fetchAlerts(); }, []);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((v) => !v);
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const result = await apiPost<{ alerts: ModelUpdateAlertT[] }>('/api/model-updates/refresh', {});
      setAlerts(result.alerts ?? []);
    } finally {
      setChecking(false);
    }
  };

  const applyModel = async (providerId: string, modelId: string) => {
    setApplyingId(modelId);
    try {
      const result = await apiPost<{ alerts: ModelUpdateAlertT[] }>(`/api/model-updates/${providerId}/apply`, { modelId });
      setAlerts(result.alerts ?? []);
    } finally {
      setApplyingId(null);
    }
  };

  const dismissProvider = async (providerId: string) => {
    setAlerts((prev) => prev.filter((a) => a.providerId !== providerId));
    try { await apiPost(`/api/model-updates/${providerId}/dismiss`, {}); } catch { /* local dismiss already applied */ }
  };

  const totalCount = alerts.reduce((sum, a) => sum + a.newModelIds.length, 0);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label="AI model updates"
        title="AI model updates"
        style={{
          position: 'relative', width: 34, height: 34, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--adm-border)',
          color: 'var(--text-color)', cursor: 'pointer', fontSize: '0.95rem',
        }}
      >
        🔔
        {totalCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
            background: 'var(--accent-color)', color: '#1a1a1a', fontSize: '0.6rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {open && panelPos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: panelPos.top, left: panelPos.left, width: 300, zIndex: 9999,
            maxHeight: 360, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            background: '#171410', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10,
            padding: '0.85rem', fontFamily: 'inherit', color: '#e9e4da',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.03em', color: '#e9e4da' }}>AI MODEL UPDATES</div>
              <button
                onClick={() => void checkNow()}
                disabled={checking}
                style={{ fontSize: '0.62rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 5, color: '#e9e4da', cursor: 'pointer' }}
              >
                {checking ? '…' : 'Check Now'}
              </button>
            </div>

            {alerts.length === 0 && (
              <p style={{ fontSize: '0.68rem', color: 'rgba(233,228,218,0.6)', marginTop: '0.5rem' }}>Nothing new — you're up to date.</p>
            )}

            {alerts.map((a) => (
              <div key={a.providerId} style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: '#e9e4da' }}>
                    <ImportanceBars importance={a.importance} /> {a.providerLabel}
                  </span>
                  <button
                    onClick={() => void dismissProvider(a.providerId)}
                    style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 4, color: 'rgba(233,228,218,0.7)', cursor: 'pointer' }}
                  >
                    Dismiss
                  </button>
                </div>
                <p style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', margin: '0.2rem 0 0.3rem' }}>{a.description}</p>
                {a.newModelIds.map((modelId) => (
                  <div key={modelId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.15rem 0' }}>
                    <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, color: '#e9e4da' }}>{modelId}</span>
                    <button
                      onClick={() => void applyModel(a.providerId, modelId)}
                      disabled={applyingId === modelId}
                      style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.5rem', flexShrink: 0, marginLeft: 6, borderRadius: 4,
                        background: '#D4A24C', border: 'none', color: '#1a1408', cursor: 'pointer', fontWeight: 600,
                      }}
                    >
                      {applyingId === modelId ? '…' : 'Apply'}
                    </button>
                  </div>
                ))}
                {a.truncatedCount > 0 && (
                  <p style={{ fontSize: '0.6rem', color: 'rgba(233,228,218,0.4)', marginTop: 2 }}>+{a.truncatedCount} more not shown</p>
                )}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ---- Poster Studio (2026-07-09, per Reza) ----
interface PosterTemplate { id: string; name: string; category: string | null; youtubeTemplateUrl: string; instagramTemplateUrl: string; defaultPrompt: string; }
interface ComposerPortrait { id: string; label: string | null; portraitUrl: string; }
interface GeneratedPoster { id: string; templateName: string | null; platform: 'youtube' | 'instagram'; posterUrl: string; promptUsed: string | null; createdAt: string; }

// Fully custom upload control — the native <input type="file"> stays
// visually hidden; everything (idle / uploading / done + filename +
// thumbnail) is driven off our own state instead of the browser's native
// "No file chosen" label, which never updated on its own (2026-07-10,
// this is the actual fix for that). Hoisted to module scope (not defined
// inside TabPosterStudio) so it doesn't remount — and lose the file
// input's clickability — on every parent re-render.
function UploadSlot({
  label, uploadState, previewUrl, fileName, onPick,
}: { label: string; uploadState: 'idle' | 'uploading' | 'done'; previewUrl: string | null; fileName: string | null; onPick: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ minWidth: 160 }}>
      <label style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', display: 'block', marginBottom: 3 }}>{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: uploadState === 'done' ? '1px solid #D4A24C' : '1px dashed rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '0.6rem', cursor: 'pointer', textAlign: 'center',
          background: 'rgba(255,255,255,0.03)', minHeight: 90, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
        }}
      >
        {uploadState === 'done' && previewUrl && (
          <img src={previewUrl} alt={label} style={{ width: '100%', maxHeight: 90, objectFit: 'cover', borderRadius: 5 }} />
        )}
        {uploadState === 'uploading' && <span style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)' }}>Uploading…</span>}
        {uploadState === 'idle' && <span style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)' }}>Click to choose an image</span>}
        {uploadState === 'done' && (
          <span style={{ color: '#D4A24C', fontSize: '0.62rem' }}>
            ✓ {fileName ?? 'Uploaded'} — click to replace
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = ''; }}
      />
    </div>
  );
}

// One independent generate/regenerate/save panel — used twice (YouTube,
// Instagram) via props, each fully self-contained. Hoisted to module
// scope for the same remount-avoidance reason as UploadSlot above.
function PlatformPanel({
  platform, result, generating, saving, saved, error, disabled, onGenerate, onSave, onDownload,
}: {
  platform: 'youtube' | 'instagram';
  result: { posterUrl: string; promptUsed: string } | null;
  generating: boolean; saving: boolean; saved: boolean; error: string | null; disabled: boolean;
  onGenerate: () => void; onSave: () => void; onDownload: () => void;
}) {
  return (
    <div className="adm-panel" style={{ flex: 1, minWidth: 240, opacity: disabled ? 0.5 : 1 }}>
      <label className="adm-label" style={{ textTransform: 'capitalize' }}>{platform}</label>
      {result ? (
        <img src={result.posterUrl} alt={platform} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--adm-border)', marginBottom: 8 }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: platform === 'youtube' ? '16/9' : '1/1', borderRadius: 8, border: '1px dashed var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <span className="adm-notice">Nothing generated yet</span>
        </div>
      )}
      <div className="adm-row" style={{ flexWrap: 'wrap' }}>
        <button onClick={onGenerate} disabled={generating || disabled} className="adm-btn adm-btn--ghost adm-btn--sm">
          {generating ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
        </button>
        {result && (
          <button onClick={onSave} disabled={saving || saved} className="adm-btn adm-btn--primary adm-btn--sm">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save to Gallery'}
          </button>
        )}
        {result && (
          <button onClick={onDownload} className="adm-btn adm-btn--ghost adm-btn--sm">
            Download
          </button>
        )}
      </div>
      {error && <p className="text-xs mt-1" style={{ color: '#E38B7A' }}>{error}</p>}
    </div>
  );
}

const PosterTemplatesPanel = () => {
  const [templates, setTemplates] = useState<PosterTemplate[]>([]);
  const [portraits, setPortraits] = useState<ComposerPortrait[]>([]);
  const [generated, setGenerated] = useState<GeneratedPoster[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(null); // null = no portrait, intentional

  // Independent per-platform generation state (2026-07-10, per Reza:
  // YouTube and Instagram are generated, regenerated, and saved
  // completely independently of each other).
  const [ytResult, setYtResult] = useState<{ posterUrl: string; promptUsed: string } | null>(null);
  const [igResult, setIgResult] = useState<{ posterUrl: string; promptUsed: string } | null>(null);
  const [ytGenerating, setYtGenerating] = useState(false);
  const [igGenerating, setIgGenerating] = useState(false);
  const [ytSaving, setYtSaving] = useState(false);
  const [igSaving, setIgSaving] = useState(false);
  const [ytSaved, setYtSaved] = useState(false);
  const [igSaved, setIgSaved] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [igError, setIgError] = useState<string | null>(null);

  // ---- Add Template form: two separate precisely-sized uploads ----
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');
  const [ytUploadState, setYtUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [igUploadState, setIgUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [ytPreviewUrl, setYtPreviewUrl] = useState<string | null>(null);
  const [igPreviewUrl, setIgPreviewUrl] = useState<string | null>(null);
  const [ytFileName, setYtFileName] = useState<string | null>(null);
  const [igFileName, setIgFileName] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // ---- Edit Template (2026-07-10, per Reza): every field of an
  // already-saved template stays fully editable — name, category, both
  // images, and the prompt. ----
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editYtUrl, setEditYtUrl] = useState<string | null>(null);
  const [editIgUrl, setEditIgUrl] = useState<string | null>(null);
  const [editYtUploadState, setEditYtUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [editIgUploadState, setEditIgUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchAll = async () => {
    const [t, p, g] = await Promise.allSettled([
      apiGet<PosterTemplate[]>('/api/poster-studio/templates'),
      apiGet<ComposerPortrait[]>('/api/poster-studio/portraits'),
      apiGet<GeneratedPoster[]>('/api/poster-studio/generated'),
    ]);
    if (t.status === 'fulfilled') setTemplates(t.value ?? []);
    else console.error('Failed to load templates:', t.reason);
    if (p.status === 'fulfilled') setPortraits(p.value ?? []);
    else console.error('Failed to load portraits:', p.reason);
    if (g.status === 'fulfilled') setGenerated(g.value ?? []);
    else console.error('Failed to load generated posters:', g.reason);
  };

  useEffect(() => { void fetchAll(); }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const selectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setYtResult(null); setIgResult(null);
    setYtSaved(false); setIgSaved(false);
    setYtError(null); setIgError(null);
  };

  // ---- Upload slot: fully custom UI, native <input> stays invisible so
  // its own "No file selected" label never shows (2026-07-10, fixes the
  // exact thing Reza flagged) — we render our own idle/uploading/done
  // states and a real thumbnail preview instead. ----
  const uploadTemplateSlot = async (f: File, slot: 'youtube' | 'instagram') => {
    const setUploadState = slot === 'youtube' ? setYtUploadState : setIgUploadState;
    const setPreviewUrl = slot === 'youtube' ? setYtPreviewUrl : setIgPreviewUrl;
    const setFileName = slot === 'youtube' ? setYtFileName : setIgFileName;
    setUploadState('uploading');
    setFileName(f.name);
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', `poster-template-${slot}`);
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) {
        setPreviewUrl(uploaded.url);
        setUploadState('done');
      } else {
        setUploadState('idle');
      }
    } catch (err) {
      console.error(`${slot} template upload failed:`, err);
      setUploadState('idle');
    }
  };

  const resetTemplateForm = () => {
    setNewTemplateName(''); setNewTemplateCategory(''); setNewTemplatePrompt(''); setTemplateError(null);
    setYtUploadState('idle'); setIgUploadState('idle');
    setYtPreviewUrl(null); setIgPreviewUrl(null);
    setYtFileName(null); setIgFileName(null);
    setAddingTemplate(false);
  };

  const saveNewTemplate = async () => {
    if (!ytPreviewUrl || !igPreviewUrl || !newTemplateName || !newTemplatePrompt) return;
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      await apiPost('/api/poster-studio/templates', {
        name: newTemplateName,
        category: newTemplateCategory || null,
        youtubeTemplateUrl: ytPreviewUrl,
        instagramTemplateUrl: igPreviewUrl,
        defaultPrompt: newTemplatePrompt,
      });
      resetTemplateForm();
      await fetchAll();
    } catch (err) {
      console.error('Failed to save template:', err);
      setTemplateError((err as Error).message || 'Failed to save template — see details below.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await apiDelete(`/api/poster-studio/templates/${id}`);
      if (selectedTemplateId === id) setSelectedTemplateId(null);
      await fetchAll();
    } catch (err) { console.error('Delete template failed:', err); }
  };

  const startEditTemplate = (t: PosterTemplate) => {
    setAddingTemplate(false);
    setEditingTemplateId(t.id);
    setEditName(t.name);
    setEditCategory(t.category || '');
    setEditPrompt(t.defaultPrompt);
    setEditYtUrl(t.youtubeTemplateUrl);
    setEditIgUrl(t.instagramTemplateUrl);
    setEditYtUploadState('done');
    setEditIgUploadState('done');
    setEditError(null);
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setEditError(null);
  };

  const uploadEditSlot = async (f: File, slot: 'youtube' | 'instagram') => {
    const setUploadState = slot === 'youtube' ? setEditYtUploadState : setEditIgUploadState;
    const setUrl = slot === 'youtube' ? setEditYtUrl : setEditIgUrl;
    setUploadState('uploading');
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', `poster-template-${slot}`);
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) { setUrl(uploaded.url); setUploadState('done'); }
      else setUploadState('idle');
    } catch (err) {
      console.error(`${slot} template re-upload failed:`, err);
      setUploadState('idle');
    }
  };

  const saveEditTemplate = async () => {
    if (!editingTemplateId || !editYtUrl || !editIgUrl || !editName || !editPrompt) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await apiPut(`/api/poster-studio/templates/${editingTemplateId}`, {
        name: editName,
        category: editCategory || null,
        youtubeTemplateUrl: editYtUrl,
        instagramTemplateUrl: editIgUrl,
        defaultPrompt: editPrompt,
      });
      setEditingTemplateId(null);
      await fetchAll();
    } catch (err) {
      console.error('Failed to save template edits:', err);
      setEditError((err as Error).message || 'Failed to save changes — see details below.');
    } finally {
      setSavingEdit(false);
    }
  };

  // ---- Independent per-platform generate / regenerate / save ----
  const generatePlatform = async (platform: 'youtube' | 'instagram') => {
    if (!selectedTemplateId) return;
    const setGenerating = platform === 'youtube' ? setYtGenerating : setIgGenerating;
    const setResult = platform === 'youtube' ? setYtResult : setIgResult;
    const setSaved = platform === 'youtube' ? setYtSaved : setIgSaved;
    const setError = platform === 'youtube' ? setYtError : setIgError;
    setGenerating(true);
    setError(null);
    setSaved(false);
    try {
      const data = await apiPost<{ posterUrl: string; promptUsed: string }>('/api/poster-studio/generate', {
        templateId: selectedTemplateId,
        portraitId: selectedPortraitId,
        platform,
      });
      setResult(data);
    } catch (err) {
      setError((err as Error).message || `${platform} generation failed.`);
    } finally {
      setGenerating(false);
    }
  };

  const savePlatform = async (platform: 'youtube' | 'instagram') => {
    const result = platform === 'youtube' ? ytResult : igResult;
    if (!result || !selectedTemplate) return;
    const setSaving = platform === 'youtube' ? setYtSaving : setIgSaving;
    const setSaved = platform === 'youtube' ? setYtSaved : setIgSaved;
    const setError = platform === 'youtube' ? setYtError : setIgError;
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/poster-studio/save', {
        templateId: selectedTemplateId,
        templateName: selectedTemplate.name,
        portraitId: selectedPortraitId,
        platform,
        posterUrl: result.posterUrl,
        promptUsed: result.promptUsed,
      });
      setSaved(true);
      await fetchAll();
    } catch (err) {
      setError((err as Error).message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGenerated = async (id: string) => {
    try {
      await apiDelete(`/api/poster-studio/generated/${id}`);
      await fetchAll();
    } catch (err) { console.error('Delete generated poster failed:', err); }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const thumbBase = { width: 84, height: 84, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flexShrink: 0, position: 'relative' } as const;

  const generatedByPlatform = (p: 'youtube' | 'instagram') => generated.filter((g) => g.platform === p);

  return (
    <div className="space-y-5">
      {/* Templates gallery */}
      <div className="adm-panel">
        <div className="adm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="adm-label">Poster Templates</label>
          <button onClick={() => addingTemplate ? resetTemplateForm() : setAddingTemplate(true)} className="adm-btn adm-btn--ghost adm-btn--sm">
            {addingTemplate ? 'Cancel' : '+ Add Template'}
          </button>
        </div>

        {addingTemplate && (
          <div className="space-y-3 mt-2" style={{ borderTop: '1px solid var(--adm-border)', paddingTop: '0.6rem' }}>
            <input type="text" placeholder="Template name" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} className="adm-input" />
            <select value={newTemplateCategory} onChange={(e) => setNewTemplateCategory(e.target.value)} className="adm-select" style={DARK_SELECT_STYLE}>
              <option value="" style={DARK_OPTION_STYLE}>Uncategorized</option>
              {CONCEPT_OPTIONS.map((c) => <option key={c} value={c} style={DARK_OPTION_STYLE}>{c}</option>)}
            </select>
            <textarea rows={3} placeholder="Default prompt for this template — how should the composer photo be blended in?" value={newTemplatePrompt} onChange={(e) => setNewTemplatePrompt(e.target.value)} className="adm-textarea" />
            <div className="adm-row" style={{ flexWrap: 'wrap', gap: 16 }}>
              <UploadSlot label="YouTube-size image" uploadState={ytUploadState} previewUrl={ytPreviewUrl} fileName={ytFileName} onPick={(f) => uploadTemplateSlot(f, 'youtube')} />
              <UploadSlot label="Instagram-size image" uploadState={igUploadState} previewUrl={igPreviewUrl} fileName={igFileName} onPick={(f) => uploadTemplateSlot(f, 'instagram')} />
            </div>
            <button
              onClick={() => void saveNewTemplate()}
              disabled={savingTemplate || ytUploadState !== 'done' || igUploadState !== 'done' || !newTemplateName || !newTemplatePrompt}
              className="adm-btn adm-btn--primary adm-btn--sm"
            >
              {savingTemplate ? 'Saving…' : 'Save Template'}
            </button>
            {templateError && <p className="text-xs" style={{ color: '#E38B7A' }}>{templateError}</p>}
          </div>
        )}

        {/* Grouped by category — every category from the site's concept
            taxonomy always gets its own section (with a divider), even
            when empty, so the partition is always visibly ready
            (2026-07-10, per Reza). "Uncategorized" only shows if it has
            templates in it. */}
        <div className="mt-3">
          {[...CONCEPT_OPTIONS, 'Uncategorized'].map((cat) => {
            const items = templates.filter((t) => (t.category || 'Uncategorized') === cat);
            if (cat === 'Uncategorized' && items.length === 0) return null;
            return (
              <div key={cat} style={{ borderTop: '1px solid var(--adm-border)', paddingTop: '0.6rem', marginTop: '0.6rem' }}>
                <p style={{ fontSize: '0.68rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent-color)', marginBottom: '0.5rem' }}>{cat}</p>
                <div className="adm-row" style={{ flexWrap: 'wrap', gap: 14 }}>
                  {items.map((t) => (
                    <div key={t.id} style={{ width: 84 }}>
                      <div style={{ ...thumbBase, border: selectedTemplateId === t.id ? '2px solid var(--accent-color)' : '1px solid var(--adm-border)' }} onClick={() => selectTemplate(t.id)}>
                        <img src={t.youtubeTemplateUrl} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditTemplate(t); }}
                          style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.55rem', cursor: 'pointer' }}
                          title="Edit"
                        >✎</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteTemplate(t.id); }}
                          style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer' }}
                          title="Delete"
                        >×</button>
                      </div>
                      <p style={{ fontSize: '0.62rem', color: 'var(--text-dim-color)', textAlign: 'center', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>
                        {t.name}
                      </p>
                    </div>
                  ))}
                  {items.length === 0 && <p className="adm-notice" style={{ opacity: 0.5 }}>— empty —</p>}
                </div>
              </div>
            );
          })}
        </div>

        {editingTemplateId && createPortal(
          <>
            <div onClick={cancelEditTemplate} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.55)' }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '90%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', zIndex: 9999,
              background: '#171410', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
              padding: '1.2rem', color: '#e9e4da', boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.03em' }}>EDITING TEMPLATE</span>
                <button onClick={cancelEditTemplate} style={{ background: 'transparent', border: 'none', color: '#e9e4da', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
              </div>

              <label style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', display: 'block', marginBottom: 3 }}>Template name</label>
              <input
                type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '0.5rem 0.6rem', color: '#e9e4da', fontSize: '0.8rem', marginBottom: '0.7rem' }}
              />

              <label style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', display: 'block', marginBottom: 3 }}>Category</label>
              <select
                value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '0.5rem 0.6rem', color: '#e9e4da', fontSize: '0.8rem', marginBottom: '0.7rem' }}
              >
                <option value="" style={DARK_OPTION_STYLE}>Uncategorized</option>
                {CONCEPT_OPTIONS.map((c) => <option key={c} value={c} style={DARK_OPTION_STYLE}>{c}</option>)}
              </select>

              <label style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', display: 'block', marginBottom: 3 }}>Prompt</label>
              <textarea
                rows={3} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '0.5rem 0.6rem', color: '#e9e4da', fontSize: '0.8rem', marginBottom: '0.7rem', resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <UploadSlot label="YouTube-size image" uploadState={editYtUploadState} previewUrl={editYtUrl} fileName={null} onPick={(f) => uploadEditSlot(f, 'youtube')} />
                <UploadSlot label="Instagram-size image" uploadState={editIgUploadState} previewUrl={editIgUrl} fileName={null} onPick={(f) => uploadEditSlot(f, 'instagram')} />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => void saveEditTemplate()}
                  disabled={savingEdit || editYtUploadState !== 'done' || editIgUploadState !== 'done' || !editName || !editPrompt}
                  style={{ padding: '0.45rem 1rem', borderRadius: 6, background: '#D4A24C', border: 'none', color: '#1a1408', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={cancelEditTemplate} style={{ padding: '0.45rem 1rem', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', color: '#e9e4da', fontSize: '0.78rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
              {editError && <p style={{ fontSize: '0.7rem', color: '#E38B7A', marginTop: 8 }}>{editError}</p>}
            </div>
          </>,
          document.body
        )}
      </div>

      {/* Portraits — selection only. Full management (add/edit/delete)
          moved to its own "Composer Portraits" tab (2026-07-10), since
          the gallery is shared infrastructure, not specific to templates. */}
      <div className="adm-panel">
        <label className="adm-label">Composer Portrait</label>
        <p className="adm-notice mb-2">Pick one to blend in, or manage the gallery itself from the Composer Portraits tab.</p>
        <div className="adm-row mt-2" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div
            style={{ ...thumbBase, border: selectedPortraitId === null ? '2px solid var(--accent-color)' : '1px dashed var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', textAlign: 'center', padding: 4 }}
            onClick={() => setSelectedPortraitId(null)}
          >
            None<br />(template only)
          </div>
          {portraits.map((p) => (
            <div key={p.id} style={{ ...thumbBase, border: selectedPortraitId === p.id ? '2px solid var(--accent-color)' : '1px solid var(--adm-border)' }} onClick={() => setSelectedPortraitId(p.id)}>
              <img src={p.portraitUrl} alt={p.label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
          {portraits.length === 0 && <p className="adm-notice">No portraits yet — add one in the Composer Portraits tab.</p>}
        </div>
      </div>

      {/* Generate — two fully independent panels. Always visible below
          the galleries (2026-07-10, per Reza) — disabled/prompted for a
          template rather than hidden, so it's never a mystery where
          Generate lives. Prompt editing lives ONLY inside each
          template's Edit modal now (2026-07-10) — nothing duplicated
          out here; this section is just portrait selection (above) +
          the two generate/regenerate/save panels. */}
      <div className="adm-panel space-y-2">
        {selectedTemplate ? (
          <p className="adm-notice">
            {selectedPortraitId ? "The composer portrait will be blended into the template using that template's own prompt." : 'No portrait selected — template will be used on its own, no interference.'}
            {' '}Generate/Regenerate/Save work independently per platform below.
          </p>
        ) : (
          <p className="adm-notice">Select a template above to enable generation.</p>
        )}
        <div className="adm-row mt-2" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <PlatformPanel
            platform="youtube" result={ytResult} generating={ytGenerating} saving={ytSaving} saved={ytSaved} error={ytError}
            disabled={!selectedTemplate}
            onGenerate={() => void generatePlatform('youtube')}
            onSave={() => void savePlatform('youtube')}
            onDownload={() => void downloadImage(ytResult!.posterUrl, 'poster-youtube.webp')}
          />
          <PlatformPanel
            platform="instagram" result={igResult} generating={igGenerating} saving={igSaving} saved={igSaved} error={igError}
            disabled={!selectedTemplate}
            onGenerate={() => void generatePlatform('instagram')}
            onSave={() => void savePlatform('instagram')}
            onDownload={() => void downloadImage(igResult!.posterUrl, 'poster-instagram.webp')}
            />
          </div>
        </div>

      {/* Generated Posters gallery — grouped by platform */}
      <div className="adm-panel">
        <label className="adm-label">Generated Posters — YouTube ({generatedByPlatform('youtube').length})</label>
        <div className="adm-row mt-2" style={{ flexWrap: 'wrap', gap: 10 }}>
          {generatedByPlatform('youtube').map((g) => (
            <div key={g.id} style={{ position: 'relative', width: 120, height: 68, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--adm-border)' }}>
              <img src={g.posterUrl} alt={g.templateName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => void deleteGenerated(g.id)} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          {generatedByPlatform('youtube').length === 0 && <p className="adm-notice">Nothing saved yet.</p>}
        </div>

        <label className="adm-label mt-3" style={{ display: 'block' }}>Generated Posters — Instagram ({generatedByPlatform('instagram').length})</label>
        <div className="adm-row mt-2" style={{ flexWrap: 'wrap', gap: 10 }}>
          {generatedByPlatform('instagram').map((g) => (
            <div key={g.id} style={{ position: 'relative', width: 90, height: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--adm-border)' }}>
              <img src={g.posterUrl} alt={g.templateName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => void deleteGenerated(g.id)} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          {generatedByPlatform('instagram').length === 0 && <p className="adm-notice">Nothing saved yet.</p>}
        </div>
      </div>
    </div>
  );
};

// ---- Track Cover Generator (2026-07-10, per Reza) ----
// A separate, track-specific flow — ONLY for generating covers for
// existing tracks on this site. No poster templates involved: a
// structured manual-fill prompt (adapted from a reference "premium
// Instagram cover" prompt he provided) + optional portrait, generated
// fresh each time. Saving writes straight to the selected track's cover.

const GENRE_MOOD_OPTIONS = [
  'Cinematic Orchestral',
  'Epic Trailer',
  'Dark Cinematic Trap',
  'Ambient / Ethereal',
  'Emotional Piano Ballad',
  'Electronic / Synthwave',
  'Jazz / Noir',
  'Documentary / Understated',
  'Action / Intense',
  'Romantic / Warm',
  'Melancholic / Reflective',
  'Uplifting / Triumphant',
  'Mysterious / Suspenseful',
  'Minimal / Modern',
  'World / Ethnic Fusion',
];

const TrackCoverGeneratorPanel = () => {
  const { tracks: tracksList } = useIdentity();
  const [portraits, setPortraits] = useState<ComposerPortrait[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackTitle, setTrackTitle] = useState('');
  const [genreMood, setGenreMood] = useState('');
  const [persianCoverText, setPersianCoverText] = useState('');
  const [portraitMode, setPortraitMode] = useState<'none' | 'gallery' | 'upload'>('none');
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(null);
  const [uploadedPortraitUrl, setUploadedPortraitUrl] = useState<string | null>(null);
  const [portraitUploadState, setPortraitUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [portraitFileName, setPortraitFileName] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ posterUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI audio-context suggestion (2026-07-10): if this track already went
  // through Media Pipeline, that job's real audio analysis is fetched and
  // used to suggest a Genre/Mood — purely a starting point, never forces
  // the choice. Bridges the two tabs without merging their workflows.
  const [audioContext, setAudioContext] = useState<{ hasAnalysis: boolean; genre: string | null; aiListenAnalysis: string | null } | null>(null);
  const [loadingAudioContext, setLoadingAudioContext] = useState(false);

  const fetchPortraits = async () => {
    try {
      const p = await apiGet<ComposerPortrait[]>('/api/poster-studio/portraits');
      setPortraits(p ?? []);
    } catch (err) {
      console.error('Failed to load portraits:', err);
    }
  };

  useEffect(() => { void fetchPortraits(); }, []);

  const suggestGenreMood = (genre: string | null, analysis: string | null): string | null => {
    const haystack = `${genre ?? ''} ${analysis ?? ''}`.toLowerCase();
    const KEYWORD_MAP: [string[], string][] = [
      [['trap'], 'Dark Cinematic Trap'],
      [['orchestral', 'symphony', 'strings'], 'Cinematic Orchestral'],
      [['trailer', 'epic'], 'Epic Trailer'],
      [['ambient', 'ethereal', 'atmospheric'], 'Ambient / Ethereal'],
      [['piano', 'ballad'], 'Emotional Piano Ballad'],
      [['synth', 'electronic', 'edm'], 'Electronic / Synthwave'],
      [['jazz', 'noir', 'saxophone'], 'Jazz / Noir'],
      [['documentary'], 'Documentary / Understated'],
      [['action', 'intense'], 'Action / Intense'],
      [['romantic', 'warm', 'love'], 'Romantic / Warm'],
      [['melancholic', 'sad', 'reflective'], 'Melancholic / Reflective'],
      [['uplifting', 'triumphant', 'heroic'], 'Uplifting / Triumphant'],
      [['mysterious', 'suspense', 'tension'], 'Mysterious / Suspenseful'],
      [['minimal', 'modern'], 'Minimal / Modern'],
      [['world', 'ethnic', 'folk'], 'World / Ethnic Fusion'],
    ];
    for (const [keywords, option] of KEYWORD_MAP) {
      if (keywords.some((k) => haystack.includes(k))) return option;
    }
    return null;
  };

  const selectTrack = async (id: string) => {
    setSelectedTrackId(id);
    const t = tracksList.find((x) => x.id === id);
    setTrackTitle(t?.title?.en ?? '');
    setResult(null); setSaved(false); setError(null);
    setAudioContext(null);
    setLoadingAudioContext(true);
    try {
      const ctx = await apiGet<{ hasAnalysis: boolean; genre: string | null; aiListenAnalysis: string | null }>(`/api/poster-studio/track-audio-context/${id}`);
      setAudioContext(ctx);
      if (ctx?.hasAnalysis) {
        const suggestion = suggestGenreMood(ctx.genre, ctx.aiListenAnalysis);
        if (suggestion) setGenreMood(suggestion);
      }
    } catch (err) {
      console.error('Failed to load audio context:', err);
    } finally {
      setLoadingAudioContext(false);
    }
  };

  const activePortraitUrl = portraitMode === 'gallery'
    ? (portraits.find((p) => p.id === selectedPortraitId)?.portraitUrl ?? null)
    : portraitMode === 'upload' ? uploadedPortraitUrl : null;

  const uploadPortrait = async (f: File) => {
    setPortraitUploadState('uploading');
    setPortraitFileName(f.name);
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', 'track-cover-portrait');
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) { setUploadedPortraitUrl(uploaded.url); setPortraitUploadState('done'); }
      else setPortraitUploadState('idle');
    } catch (err) {
      console.error('Portrait upload failed:', err);
      setPortraitUploadState('idle');
    }
  };

  const generate = async () => {
    if (!trackTitle || !genreMood) return;
    setGenerating(true); setError(null); setSaved(false);
    try {
      const data = await apiPost<{ posterUrl: string }>('/api/poster-studio/track-cover/generate', {
        trackTitle, genreMood, coverText: persianCoverText || undefined,
        portraitId: portraitMode === 'gallery' ? selectedPortraitId : undefined,
        // uploaded portraits don't have a portraitId — the backend only
        // supports gallery portraits by id today; an uploaded one-off
        // photo is passed through as a gallery selection the admin can
        // also just save to the gallery first if they want to reuse it.
      });
      setResult(data);
    } catch (err) {
      setError((err as Error).message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const saveToTrack = async () => {
    if (!result || !selectedTrackId) return;
    setSaving(true); setError(null);
    try {
      await apiPost('/api/poster-studio/track-cover/save', { trackId: selectedTrackId, posterUrl: result.posterUrl });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTrack = tracksList.find((t) => t.id === selectedTrackId) ?? null;

  return (
    <div className="space-y-5">
      <div className="adm-panel" style={{ borderColor: 'rgba(212,162,76,0.3)' }}>
        <p className="adm-notice">
          For quickly re-generating or hand-tweaking the cover of an already-published track. For the <strong>best-quality first cover</strong> —
          the one built from an actual AI listen of the audio file — use <strong>Media Pipeline</strong> instead. If this track was already
          processed there, this tab will suggest a Genre/Mood based on that analysis.
        </p>
      </div>
      <div className="adm-panel">
        <label className="adm-label">Select a Track</label>
        <p className="adm-notice mb-2">Covers here are only ever for tracks already on the site — pick one to generate its cover.</p>
        {tracksList.length === 0 ? (
          <p className="adm-notice">No tracks found.</p>
        ) : (
          <select value={selectedTrackId ?? ''} onChange={(e) => { if (e.target.value) void selectTrack(e.target.value); }} className="adm-select" style={DARK_SELECT_STYLE}>
            <option value="" style={DARK_OPTION_STYLE}>— choose a track —</option>
            {tracksList.map((t) => (
              <option key={t.id} value={t.id} style={DARK_OPTION_STYLE}>{t.title?.en || 'Untitled'}</option>
            ))}
          </select>
        )}
      </div>

      {selectedTrack && (
        <div className="adm-panel space-y-3">
          {loadingAudioContext && <p className="adm-notice">Checking for a prior Media Pipeline analysis of this track…</p>}
          {audioContext?.hasAnalysis && (
            <div className="adm-panel" style={{ background: 'rgba(212,162,76,0.08)', borderColor: 'rgba(212,162,76,0.3)' }}>
              <p className="adm-notice">
                <strong>Media Pipeline already analyzed this track's audio.</strong>
                {audioContext.aiListenAnalysis && <> AI heard: <em>{audioContext.aiListenAnalysis}</em></>}
                {' '}Genre/Mood below was pre-filled from that — change it if it's not quite right.
              </p>
            </div>
          )}
          <div>
            <label className="adm-label">Track Title / Theme</label>
            <input type="text" value={trackTitle} onChange={(e) => setTrackTitle(e.target.value)} className="adm-input" />
          </div>
          <div>
            <label className="adm-label">Genre / Mood</label>
            <select value={genreMood} onChange={(e) => setGenreMood(e.target.value)} className="adm-select" style={DARK_SELECT_STYLE}>
              <option value="" style={DARK_OPTION_STYLE}>— choose —</option>
              {GENRE_MOOD_OPTIONS.map((g) => <option key={g} value={g} style={DARK_OPTION_STYLE}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="adm-label">Cover Text (optional)</label>
            <textarea rows={2} placeholder="Text to render on the cover, in whatever language you type — leave blank for none" value={persianCoverText} onChange={(e) => setPersianCoverText(e.target.value)} className="adm-textarea" />
          </div>

          <div>
            <label className="adm-label">Composer Portrait</label>
            <div className="adm-row" style={{ flexWrap: 'wrap' }}>
              <button onClick={() => setPortraitMode('none')} className="adm-btn adm-btn--sm" style={{ background: portraitMode === 'none' ? 'rgba(var(--accent-rgb),0.15)' : undefined }}>None</button>
              <button onClick={() => setPortraitMode('gallery')} className="adm-btn adm-btn--sm" style={{ background: portraitMode === 'gallery' ? 'rgba(var(--accent-rgb),0.15)' : undefined }}>Select from Gallery</button>
              <button onClick={() => setPortraitMode('upload')} className="adm-btn adm-btn--sm" style={{ background: portraitMode === 'upload' ? 'rgba(var(--accent-rgb),0.15)' : undefined }}>Upload New</button>
            </div>

            {portraitMode === 'gallery' && (
              <div className="adm-row mt-2" style={{ flexWrap: 'wrap', gap: 8 }}>
                {portraits.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPortraitId(p.id)}
                    style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: selectedPortraitId === p.id ? '2px solid var(--accent-color)' : '1px solid var(--adm-border)' }}
                  >
                    <img src={p.portraitUrl} alt={p.label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
                {portraits.length === 0 && <p className="adm-notice">No portraits saved yet — add one in the Poster Templates tab.</p>}
              </div>
            )}

            {portraitMode === 'upload' && (
              <div className="mt-2">
                <UploadSlot label="Portrait photo" uploadState={portraitUploadState} previewUrl={uploadedPortraitUrl} fileName={portraitFileName} onPick={uploadPortrait} />
                <p className="adm-notice mt-1" style={{ opacity: 0.7 }}>Tip: save this to the Composer Portraits gallery (Poster Templates tab) if you'll reuse it.</p>
              </div>
            )}
          </div>

          <button onClick={() => void generate()} disabled={generating || !trackTitle || !genreMood} className="adm-btn adm-btn--primary">
            {generating ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
          </button>
          {error && <p className="text-xs" style={{ color: '#E38B7A' }}>{error}</p>}

          {result && (
            <div style={{ marginTop: 10 }}>
              <img src={result.posterUrl} alt="Generated cover" style={{ width: 260, borderRadius: 8, border: '1px solid var(--adm-border)' }} />
              <div className="adm-row mt-2">
                <button onClick={() => void saveToTrack()} disabled={saving || saved} className="adm-btn adm-btn--primary adm-btn--sm">
                  {saving ? 'Saving…' : saved ? '✓ Saved to track' : 'Save as Track Cover'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---- Composer Portraits (2026-07-10) ----
// Split out into its own tab — this gallery is shared infrastructure
// (used by Poster Templates generation AND Track Covers), not something
// that belongs nested inside one specific workflow.
const ComposerPortraitsPanel = () => {
  const [portraits, setPortraits] = useState<ComposerPortrait[]>([]);

  const [addingPortrait, setAddingPortrait] = useState(false);
  const [newPortraitLabel, setNewPortraitLabel] = useState('');
  const [portraitUploadState, setPortraitUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState<string | null>(null);
  const [portraitFileName, setPortraitFileName] = useState<string | null>(null);
  const [savingPortrait, setSavingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  const [editingPortraitId, setEditingPortraitId] = useState<string | null>(null);
  const [editPortraitLabel, setEditPortraitLabel] = useState('');
  const [editPortraitUrl, setEditPortraitUrl] = useState<string | null>(null);
  const [editPortraitUploadState, setEditPortraitUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [savingPortraitEdit, setSavingPortraitEdit] = useState(false);
  const [portraitEditError, setPortraitEditError] = useState<string | null>(null);

  const fetchPortraits = async () => {
    try {
      const p = await apiGet<ComposerPortrait[]>('/api/poster-studio/portraits');
      setPortraits(p ?? []);
    } catch (err) {
      console.error('Failed to load portraits:', err);
    }
  };

  useEffect(() => { void fetchPortraits(); }, []);

  const uploadPortraitFile = async (f: File) => {
    setPortraitUploadState('uploading');
    setPortraitFileName(f.name);
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', 'composer-portrait');
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) { setPortraitPreviewUrl(uploaded.url); setPortraitUploadState('done'); }
      else setPortraitUploadState('idle');
    } catch (err) {
      console.error('Portrait upload failed:', err);
      setPortraitUploadState('idle');
    }
  };

  const saveNewPortrait = async () => {
    if (!portraitPreviewUrl) return;
    setSavingPortrait(true);
    setPortraitError(null);
    try {
      await apiPost('/api/poster-studio/portraits', { label: newPortraitLabel || null, portraitUrl: portraitPreviewUrl });
      setNewPortraitLabel(''); setPortraitUploadState('idle'); setPortraitPreviewUrl(null); setPortraitFileName(null); setAddingPortrait(false);
      await fetchPortraits();
    } catch (err) {
      console.error('Failed to save portrait:', err);
      setPortraitError((err as Error).message || 'Failed to save portrait — see details below.');
    } finally {
      setSavingPortrait(false);
    }
  };

  const deletePortrait = async (id: string) => {
    try {
      await apiDelete(`/api/poster-studio/portraits/${id}`);
      await fetchPortraits();
    } catch (err) { console.error('Delete portrait failed:', err); }
  };

  const startEditPortrait = (p: ComposerPortrait) => {
    setEditingPortraitId(p.id);
    setEditPortraitLabel(p.label || '');
    setEditPortraitUrl(p.portraitUrl);
    setEditPortraitUploadState('done');
    setPortraitEditError(null);
  };

  const uploadEditPortraitFile = async (f: File) => {
    setEditPortraitUploadState('uploading');
    try {
      const form = new FormData();
      form.append('media', f);
      form.append('entity_type', 'composer-portrait');
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (uploaded?.url) { setEditPortraitUrl(uploaded.url); setEditPortraitUploadState('done'); }
      else setEditPortraitUploadState('idle');
    } catch (err) {
      console.error('Portrait re-upload failed:', err);
      setEditPortraitUploadState('idle');
    }
  };

  const saveEditPortrait = async () => {
    if (!editingPortraitId || !editPortraitUrl) return;
    setSavingPortraitEdit(true);
    setPortraitEditError(null);
    try {
      await apiPut(`/api/poster-studio/portraits/${editingPortraitId}`, { label: editPortraitLabel || null, portraitUrl: editPortraitUrl });
      setEditingPortraitId(null);
      await fetchPortraits();
    } catch (err) {
      console.error('Failed to save portrait edits:', err);
      setPortraitEditError((err as Error).message || 'Failed to save changes.');
    } finally {
      setSavingPortraitEdit(false);
    }
  };

  const thumbBase = { width: 84, height: 84, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flexShrink: 0, position: 'relative' } as const;

  return (
    <div className="space-y-5">
      <div className="adm-panel">
        <p className="adm-notice mb-2">
          Shared across Poster Templates and Track Covers — photos of the composer used when blending a portrait into a generated cover or poster.
        </p>
        <div className="adm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="adm-label">Composer Portraits ({portraits.length})</label>
          <button onClick={() => setAddingPortrait((v) => !v)} className="adm-btn adm-btn--ghost adm-btn--sm">
            {addingPortrait ? 'Cancel' : '+ Add Portrait'}
          </button>
        </div>

        {addingPortrait && (
          <div className="space-y-2 mt-2" style={{ borderTop: '1px solid var(--adm-border)', paddingTop: '0.6rem' }}>
            <input type="text" placeholder="Label (optional)" value={newPortraitLabel} onChange={(e) => setNewPortraitLabel(e.target.value)} className="adm-input" />
            <UploadSlot label="Portrait photo" uploadState={portraitUploadState} previewUrl={portraitPreviewUrl} fileName={portraitFileName} onPick={uploadPortraitFile} />
            <button onClick={() => void saveNewPortrait()} disabled={savingPortrait || portraitUploadState !== 'done'} className="adm-btn adm-btn--primary adm-btn--sm">
              {savingPortrait ? 'Saving…' : 'Save Portrait'}
            </button>
            {portraitError && <p className="text-xs" style={{ color: '#E38B7A' }}>{portraitError}</p>}
          </div>
        )}

        <div className="adm-row mt-3" style={{ flexWrap: 'wrap', gap: 10 }}>
          {portraits.map((p) => (
            <div key={p.id} style={{ width: 90 }}>
              <div style={{ ...thumbBase, border: '1px solid var(--adm-border)' }}>
                <img src={p.portraitUrl} alt={p.label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); startEditPortrait(p); }}
                  style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.55rem', cursor: 'pointer' }}
                  title="Edit"
                >✎</button>
                <button
                  onClick={(e) => { e.stopPropagation(); void deletePortrait(p.id); }}
                  style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer' }}
                  title="Delete"
                >×</button>
              </div>
              {p.label && (
                <p style={{ fontSize: '0.62rem', color: 'var(--text-dim-color)', textAlign: 'center', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.label}>
                  {p.label}
                </p>
              )}
            </div>
          ))}
          {portraits.length === 0 && !addingPortrait && <p className="adm-notice">No portraits yet — add one to get started.</p>}
        </div>
      </div>

      {editingPortraitId && createPortal(
        <>
          <div onClick={() => setEditingPortraitId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '90%', maxWidth: 380, maxHeight: '85vh', overflowY: 'auto', zIndex: 9999,
            background: '#171410', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
            padding: '1.2rem', color: '#e9e4da', boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.03em' }}>EDITING PORTRAIT</span>
              <button onClick={() => setEditingPortraitId(null)} style={{ background: 'transparent', border: 'none', color: '#e9e4da', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
            </div>

            <label style={{ fontSize: '0.65rem', color: 'rgba(233,228,218,0.6)', display: 'block', marginBottom: 3 }}>Label (optional)</label>
            <input
              type="text" value={editPortraitLabel} onChange={(e) => setEditPortraitLabel(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '0.5rem 0.6rem', color: '#e9e4da', fontSize: '0.8rem', marginBottom: '0.7rem' }}
            />

            <div style={{ marginBottom: '0.9rem' }}>
              <UploadSlot label="Portrait photo" uploadState={editPortraitUploadState} previewUrl={editPortraitUrl} fileName={null} onPick={uploadEditPortraitFile} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => void saveEditPortrait()}
                disabled={savingPortraitEdit || editPortraitUploadState !== 'done'}
                style={{ padding: '0.45rem 1rem', borderRadius: 6, background: '#D4A24C', border: 'none', color: '#1a1408', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
              >
                {savingPortraitEdit ? 'Saving…' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingPortraitId(null)} style={{ padding: '0.45rem 1rem', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', color: '#e9e4da', fontSize: '0.78rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            {portraitEditError && <p style={{ fontSize: '0.7rem', color: '#E38B7A', marginTop: 8 }}>{portraitEditError}</p>}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

const TabPosterStudio = () => {
  const [subTab, setSubTab] = useState<'templates' | 'portraits' | 'trackCovers'>('templates');
  return (
    <div>
      <div className="adm-row mb-3" style={{ borderBottom: '1px solid var(--adm-border)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setSubTab('templates')}
          className="adm-btn adm-btn--sm"
          style={{ background: subTab === 'templates' ? 'rgba(var(--accent-rgb),0.15)' : 'transparent', border: subTab === 'templates' ? '1px solid var(--accent-color)' : '1px solid var(--adm-border)' }}
        >
          Poster Templates
        </button>
        <button
          onClick={() => setSubTab('portraits')}
          className="adm-btn adm-btn--sm"
          style={{ background: subTab === 'portraits' ? 'rgba(var(--accent-rgb),0.15)' : 'transparent', border: subTab === 'portraits' ? '1px solid var(--accent-color)' : '1px solid var(--adm-border)' }}
        >
          Composer Portraits
        </button>
        <button
          onClick={() => setSubTab('trackCovers')}
          className="adm-btn adm-btn--sm"
          style={{ background: subTab === 'trackCovers' ? 'rgba(var(--accent-rgb),0.15)' : 'transparent', border: subTab === 'trackCovers' ? '1px solid var(--accent-color)' : '1px solid var(--adm-border)' }}
        >
          Track Covers
        </button>
      </div>
      {subTab === 'templates' && <PosterTemplatesPanel />}
      {subTab === 'portraits' && <ComposerPortraitsPanel />}
      {subTab === 'trackCovers' && <TrackCoverGeneratorPanel />}
    </div>
  );
};

// ---------- Ambient Tracks (2026-07-12, per Reza) ----------
// 7 rows: one ambient bed per language + one for the language-selection
// screen itself. Each is a content_entries override (type: 'audio') under
// its own dedicated key — locale is fixed to 'en' on all seven since these
// aren't per-locale VARIANTS of one thing, the KEY already identifies
// which of the seven a row is; 'en' is just a technically-required anchor
// value the content system's locale column needs.
//
// Same upload -> LOCAL preview -> confirm -> S3 + save flow as
// EditableImage's pending-file pattern, minus the crop step (audio has
// nothing to crop). Preview plays from a local object URL so the admin can
// actually listen before anything is uploaded or goes live.
//
// v2 (per Reza, 2026-07-12): the bundled DEFAULT file must be visible and
// playable too, not just a "using default" caption — every row always
// shows something you can actually press play on. Also a full visual pass
// — the first version rendered with bare .adm-panel/.adm-btn and read as
// flat/lifeless; this uses the site's own luxury-neon recipe (accent
// gradient + glow, same one used on the public site's media buttons)
// instead of undecorated defaults.
const AMBIENT_TRACKS: { key: string; label: string; defaultUrl: string }[] = [
  { key: 'ambient-track-en', label: localeLabels.en!, defaultUrl: '/audio/bg-en.mp3' },
  { key: 'ambient-track-es', label: localeLabels.es!, defaultUrl: '/audio/bg-es.mp3' },
  { key: 'ambient-track-fr', label: localeLabels.fr!, defaultUrl: '/audio/bg-fr.mp3' },
  { key: 'ambient-track-zh', label: localeLabels.zh!, defaultUrl: '/audio/bg-zh.mp3' },
  { key: 'ambient-track-ja', label: localeLabels.ja!, defaultUrl: '/audio/bg-ja.mp3' },
  { key: 'ambient-track-ko', label: localeLabels.ko!, defaultUrl: '/audio/bg-ko.mp3' },
  { key: 'ambient-track-selector', label: 'Language-Selection Screen', defaultUrl: '/portal-ambient.mp3' },
];

const AMBIENT_BTN_NEON: CSSProperties = {
  padding: '0.5em 1.2em',
  borderRadius: 999,
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.03em',
  border: '1px solid rgba(var(--accent-rgb),0.5)',
  cursor: 'pointer',
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 58%, #fff 42%), color-mix(in srgb, var(--accent-color) 90%, #000 10%))',
  color: '#241A0C',
  boxShadow: '0 0 18px rgba(var(--accent-rgb),0.4), inset 0 1px 0 rgba(255,255,255,0.35)',
  transition: 'box-shadow 0.2s ease, transform 0.15s ease',
};
const AMBIENT_BTN_GHOST: CSSProperties = {
  padding: '0.5em 1.2em',
  borderRadius: 999,
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.03em',
  border: '1px solid rgba(var(--accent-rgb),0.32)',
  cursor: 'pointer',
  background: 'rgba(var(--accent-rgb),0.05)',
  color: 'var(--accent-color)',
};

const AmbientTrackRow = ({ trackKey, label, defaultUrl }: { trackKey: string; label: string; defaultUrl: string }) => {
  const { resolve, save } = useContent();
  const currentUrl = resolve(trackKey, 'en');
  const isCustom = !!currentUrl;
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pendingFile) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const handleSave = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setNotice('Uploading…');
    try {
      const form = new FormData();
      form.append('media', pendingFile);
      form.append('entity_type', 'content');
      form.append('entity_id', trackKey);
      const asset = await apiPost<{ url: string }>('/api/media/upload', form);
      await save(trackKey, 'en', 'audio', asset.url);
      setPendingFile(null);
      setNotice(null);
    } catch {
      setNotice('Upload failed — try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '18px 20px',
        borderRadius: 16,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        {/* accent-tinted note badge */}
        <div
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.28), rgba(var(--accent-rgb),0.06))',
            boxShadow: '0 0 14px rgba(var(--accent-rgb),0.3)',
            color: 'var(--accent-color)', fontSize: '1.1rem',
          }}
          aria-hidden
        >
          ♪
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{label}</div>
          <div
            style={{
              display: 'inline-block', marginTop: 4, padding: '0.15em 0.7em', borderRadius: 999,
              fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              color: isCustom ? '#0B0B0D' : 'var(--accent-color)',
              background: isCustom ? 'var(--accent-color)' : 'rgba(var(--accent-rgb),0.12)',
              border: isCustom ? 'none' : '1px solid rgba(var(--accent-rgb),0.35)',
            }}
          >
            {isCustom ? 'Custom' : 'Default'}
          </div>
        </div>
      </div>

      {pendingUrl ? (
        <>
          <div style={{ fontSize: '0.75rem', opacity: 0.75, marginBottom: 6 }}>Preview — nothing is live yet</div>
          <NeonAudioPlayer src={pendingUrl} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => setPendingFile(null)} disabled={uploading}>
              Cancel
            </button>
            <button type="button" style={{ ...AMBIENT_BTN_NEON, opacity: uploading ? 0.6 : 1 }} onClick={handleSave} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Save & Publish'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Always playable — the live override if there is one, otherwise
              the bundled default. Never just a caption with nothing to press. */}
          <NeonAudioPlayer src={currentUrl || defaultUrl} />
          <button type="button" style={{ ...AMBIENT_BTN_NEON, marginTop: 12 }} onClick={() => fileInputRef.current?.click()}>
            {isCustom ? 'Replace' : 'Upload Custom Track'}
          </button>
        </>
      )}

      {notice && <div style={{ marginTop: 8, fontSize: '0.8rem', opacity: 0.8 }}>{notice}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPendingFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
};

// ---------- Fonts (2026-07-13, per Reza) ----------
// A per-language drawer: which of the curated fonts (constants/fonts.ts)
// actually show up in EditableText's font picker for that language.
// Stored as a JSON array of family names under content_entries key
// 'enabled-fonts', one row per locale — reusing the same generic system
// everything else in admin already uses, no new table.
const FontsLanguageSection = ({ localeCode, label }: { localeCode: Locale; label: string }) => {
  const { resolve, save } = useContent();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const catalog = FONTS_BY_LOCALE[localeCode] ?? [];

  useEffect(() => {
    if (!open || loaded) return;
    const raw = resolve('enabled-fonts', localeCode);
    if (raw) {
      try {
        setEnabled(new Set(JSON.parse(raw) as string[]));
      } catch {
        setEnabled(new Set(catalog.map((f) => f.family))); // corrupt value — fall back to "everything on"
      }
    } else {
      setEnabled(new Set(catalog.map((f) => f.family))); // nothing configured yet — default to all enabled
    }
    setLoaded(true);
    // Loading each font's actual weight so the checkbox row previews in
    // its own typeface — genuinely helps pick, not just a name in a list.
    loadGoogleFonts(catalog.map((f) => f.family));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  const toggle = (family: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  };

  const persist = async () => {
    setSaving(true);
    try {
      await save('enabled-fonts', localeCode, 'text', JSON.stringify(Array.from(enabled)));
    } catch (err) {
      console.error('Failed to save enabled fonts:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      borderRadius: 14, marginBottom: 10, overflow: 'hidden',
      border: '1px solid rgba(var(--accent-rgb),0.16)',
      background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.05), rgba(255,255,255,0.015))',
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)',
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={BIZ_BADGE('rgba(var(--accent-rgb),0.12)', 'var(--accent-color)')}>
            {catalog.length} fonts
          </span>
          <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', opacity: 0.6 }}>▾</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          {!loaded ? (
            <div style={{ opacity: 0.6, fontSize: '0.82rem' }}>Loading…</div>
          ) : (
            <>
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {catalog.map((f) => (
                  <label
                    key={f.family}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                      cursor: 'pointer', background: enabled.has(f.family) ? 'rgba(var(--accent-rgb),0.06)' : 'transparent',
                    }}
                  >
                    <input type="checkbox" checked={enabled.has(f.family)} onChange={() => toggle(f.family)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted-color)' }}>{f.family}</div>
                      <div style={{ fontFamily: `'${f.family}', inherit`, fontSize: '1.15rem', lineHeight: 1.3, marginTop: 2 }}>
                        {f.note}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button type="button" style={AMBIENT_BTN_NEON} onClick={persist} disabled={saving}>
                {saving ? 'Saving\u2026' : 'Save'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// 2026-07-14 (per Reza) — the optional fullscreen page shown right after
// language selection, before MainApp. Admin fully controls: on/off, and
// whatever's being promoted (video, banner, poster, upcoming track —
// literally any image or video). Stored via the same content_entries
// mechanism as everything else — no new table. mediaUrl is saved as type
// 'link' (just a URL either way; ContentType has no separate 'video'
// variant) — mediaType is what actually tells the frontend how to render it.
const TabPromoScreen = () => {
  const { resolve, save } = useContent();
  const [enabled, setEnabled] = useState(false);
  const [mediaType, setMediaType] = useState<'video' | 'image'>('image');
  const [imageDurationSeconds, setImageDurationSeconds] = useState(10);
  const [savedMediaUrl, setSavedMediaUrl] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [savedMediaType, setSavedMediaType] = useState<'video' | 'image'>('image');
  const [savedImageDurationSeconds, setSavedImageDurationSeconds] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const en = resolve('promoScreen.enabled', 'en') === 'true';
    const mt = resolve('promoScreen.mediaType', 'en');
    const resolvedType = mt === 'video' || mt === 'image' ? mt : 'image';
    setEnabled(en);
    setSavedEnabled(en);
    setMediaType(resolvedType);
    setSavedMediaType(resolvedType);
    const durRaw = resolve('promoScreen.imageDurationSeconds', 'en');
    const dur = durRaw ? Number(durRaw) : 10;
    const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 10;
    setImageDurationSeconds(safeDur);
    setSavedImageDurationSeconds(safeDur);
    setSavedMediaUrl(resolve('promoScreen.mediaUrl', 'en'));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the local object URL when it's replaced/unmounted (avoids leaking).
  useEffect(() => {
    return () => { if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl); };
  }, [stagedPreviewUrl]);

  const dirty = enabled !== savedEnabled || mediaType !== savedMediaType || imageDurationSeconds !== savedImageDurationSeconds || !!stagedFile;
  const displayUrl = stagedPreviewUrl ?? savedMediaUrl;

  const chooseFile = (file: File) => {
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    setStagedFile(file);
    setStagedPreviewUrl(URL.createObjectURL(file));
  };

  const clearStagedOrSaved = () => {
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    setStagedFile(null);
    setStagedPreviewUrl(null);
    setSavedMediaUrl(null);
  };

  // The ONE action that actually persists anything — uploads the staged
  // file first (if there is one), then saves enabled + mediaType +
  // mediaUrl together. Nothing else on this screen saves by itself
  // (2026-07-14, per Reza: was three separate save-ish actions before —
  // confusing; now exactly one).
  const submit = async () => {
    setSaving(true);
    setNotice(null);
    try {
      let finalUrl = savedMediaUrl ?? '';
      if (stagedFile) {
        const form = new FormData();
        form.append('media', stagedFile, stagedFile.name);
        form.append('entity_type', 'content');
        form.append('entity_id', 'promoScreen.mediaUrl');
        const asset = await apiPost<{ url: string }>('/api/media/upload', form);
        finalUrl = asset.url;
      }
      await save('promoScreen.enabled', 'en', 'text', enabled ? 'true' : 'false');
      await save('promoScreen.mediaType', 'en', 'text', mediaType);
      await save('promoScreen.imageDurationSeconds', 'en', 'text', String(imageDurationSeconds));
      await save('promoScreen.mediaUrl', 'en', 'link', finalUrl);

      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
      setStagedFile(null);
      setStagedPreviewUrl(null);
      setSavedMediaUrl(finalUrl || null);
      setSavedEnabled(enabled);
      setSavedMediaType(mediaType);
      setSavedImageDurationSeconds(imageDurationSeconds);
      setNotice('Saved.');
    } catch {
      setNotice('Save failed — try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <h2 className="adm-section-title">Promo Screen</h2>
      <p style={{ opacity: 0.7, marginBottom: 20, fontSize: '0.85rem' }}>
        An optional fullscreen page shown right after a visitor picks a language, before they reach the main site.
        Off by default until you turn it on. A video plays for its own length; an image shows for 5 seconds. Visitors
        can always tap Skip.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          style={{
            width: 44, height: 24, borderRadius: 999, position: 'relative',
            background: enabled ? 'var(--accent-color)' : 'rgba(255,255,255,0.15)',
            transition: 'background 0.2s ease', border: 'none', cursor: 'pointer', flexShrink: 0,
          }}
          aria-pressed={enabled}
        >
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s ease',
          }} />
        </button>
        <span style={{ fontWeight: 600 }}>{enabled ? 'Promo screen is ON' : 'Promo screen is OFF'}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['image', 'video'] as const).map((mt) => (
          <button
            key={mt}
            type="button"
            className="adm-btn"
            style={mediaType === mt ? { background: 'rgba(var(--accent-rgb),0.16)', color: 'var(--accent-color)' } : undefined}
            onClick={() => setMediaType(mt)}
          >
            {mt === 'image' ? 'Image' : 'Video'}
          </button>
        ))}
      </div>

      {mediaType === 'image' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Display duration</label>
          <input
            type="number"
            min={1}
            max={120}
            value={imageDurationSeconds}
            onChange={(e) => setImageDurationSeconds(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            style={{
              width: 64, padding: '4px 8px', borderRadius: 8, fontSize: '0.85rem', textAlign: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-color)',
            }}
          />
          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>seconds</span>
        </div>
      )}

      <div style={{
        padding: 20, borderRadius: 14, marginBottom: 20,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.05), rgba(255,255,255,0.015))',
        border: '1px solid rgba(var(--accent-rgb),0.14)', maxWidth: 480,
      }}>
        {displayUrl ? (
          <div>
            {mediaType === 'video' ? (
              <video src={displayUrl} controls style={{ width: '100%', borderRadius: 10, marginBottom: 12 }} />
            ) : (
              <img src={displayUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 12 }} />
            )}
            {stagedFile && (
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-color)', marginBottom: 8 }}>
                New file staged — press Save &amp; Submit below to upload it.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => fileInputRef.current?.click()}>
                Choose different {mediaType === 'video' ? 'video' : 'image'}
              </button>
              <button type="button" style={AMBIENT_BTN_GHOST} onClick={clearStagedOrSaved}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            style={AMBIENT_BTN_NEON}
            onClick={() => fileInputRef.current?.click()}
          >
            {`Choose ${mediaType === 'video' ? 'a video' : 'an image'}`}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={mediaType === 'video' ? 'video/*' : 'image/*'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) chooseFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* The ONE save action for this whole screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!dirty || saving}
          style={{
            padding: '6px 16px', borderRadius: 999, fontSize: '0.75rem', letterSpacing: '0.04em',
            fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'default',
            background: dirty ? 'linear-gradient(135deg, var(--accent-color), var(--accent2-color, var(--accent-color)))' : 'rgba(255,255,255,0.08)',
            color: dirty ? 'var(--surface-color)' : 'rgba(255,255,255,0.4)',
            border: 'none', transition: 'opacity 0.15s ease', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save & Submit'}
        </button>
        {dirty && !saving && <span style={{ fontSize: '0.72rem', opacity: 0.55 }}>Unsaved changes</span>}
        {notice && <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>{notice}</span>}
      </div>
    </div>
  );
};

const TabFonts = () => (
  <div>
    <h2 className="adm-section-title">Fonts</h2>
    <p style={{ opacity: 0.7, marginBottom: 20, fontSize: '0.85rem' }}>
      Choose which curated fonts show up in the font picker (inside any text's Edit toolbar) for each language.
      Nothing selected here yet means every curated font is available by default — narrowing this down just
      keeps the picker focused on what you actually want offered.
    </p>
    {locales.map((l) => (
      <FontsLanguageSection key={l} localeCode={l} label={localeLabels[l]!} />
    ))}
  </div>
);

const TabAmbientTracks = () => (
  <div>
    <h2 className="adm-section-title">Ambient Tracks</h2>
    <p style={{ opacity: 0.7, marginBottom: 20, fontSize: '0.85rem' }}>
      One ambient bed per language, plus the language-selection screen. Preview locally before saving —
      Save & Publish replaces the live track immediately; the reactive visuals (waves, particles, the orb)
      keep working with whatever plays, no changes needed there.
    </p>
    {AMBIENT_TRACKS.map((t) => (
      <AmbientTrackRow key={t.key} trackKey={t.key} label={t.label} defaultUrl={t.defaultUrl} />
    ))}
  </div>
);


// ---------- Business Scanner (Phase 5 / A3c, 2026-07-13) ----------
// Step 1 of the build (per the plan agreed with Reza): schema + base route
// + this admin tab. Leads and Reports are wired to real (currently empty)
// data. Sources & Keys UI is drawn now but the actual key save/test call
// is a TODO — it needs the real /api/keys contract confirmed first, noted
// inline rather than guessed. Settings' schedule toggle is local-only for
// now (not yet persisted) — the node-cron wiring is a later step, once
// hosting is decided.
interface PositionLead {
  id: string;
  source: string;
  sourceUrl: string | null;
  url: string;
  project: string | null;
  company: string | null;
  person: string | null;
  details: string | null;
  contacts: Record<string, string>;
  lang: string | null;
  score: number;
  scoredBy: string;
  status: 'new' | 'reviewed' | 'dismissed';
  firstSeen: string;
  updatedAt: string;
}
interface LeadsSummary { new: number; reviewed: number; dismissed: number; total: number }
interface PositionReport { id: string; reportUrl: string; leadCount: number; periodStart: string | null; periodEnd: string | null; createdAt: string }

const BIZ_BADGE = (bg: string, fg: string): CSSProperties => ({
  display: 'inline-block', padding: '0.15em 0.7em', borderRadius: 999,
  fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase',
  background: bg, color: fg,
});

const STATUS_STYLE: Record<PositionLead['status'], CSSProperties> = {
  new: BIZ_BADGE('rgba(var(--accent-rgb),0.16)', 'var(--accent-color)'),
  reviewed: BIZ_BADGE('rgba(120,200,140,0.16)', '#78C88C'),
  dismissed: BIZ_BADGE('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.45)'),
};

const BizLeadsPanel = () => {
  const [leads, setLeads] = useState<PositionLead[]>([]);
  const [summary, setSummary] = useState<LeadsSummary>({ new: 0, reviewed: 0, dismissed: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState<'' | PositionLead['status']>('');
  const [relevantOnly, setRelevantOnly] = useState(true); // hides score-0 noise by default — the whole reason this bug got noticed
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (relevantOnly) params.set('minScore', '20'); // hides score-0 noise (e.g. unrelated postings that share a feed with real ones) — visible score badge + this toggle are the fix for a lead like "Real-Time Environment Artist" sorting above genuinely relevant results
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [leadsRes, summaryRes] = await Promise.all([
        apiGet<PositionLead[]>(`/api/positions/leads${qs}`),
        apiGet<LeadsSummary>('/api/positions/leads/summary'),
      ]);
      setLeads(leadsRes ?? []);
      setSummary(summaryRes ?? { new: 0, reviewed: 0, dismissed: 0, total: 0 });
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, relevantOnly]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: PositionLead['status']) => {
    try {
      await apiPut(`/api/positions/leads/${id}`, { status });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    } catch (err) {
      console.error('Failed to update lead:', err);
    }
  };

  const scanNow = async () => {
    setScanning(true);
    setScanNotice(null);
    try {
      const result = await apiPost<{ scanned: number; inserted: number; aiScored: number }>('/api/positions/scan', {});
      setScanNotice(
        `Scan complete — ${result.inserted} new lead${result.inserted === 1 ? '' : 's'}` +
        (result.aiScored > 0 ? `, ${result.aiScored} AI-scored.` : '.')
      );
      void load();
    } catch (err) {
      setScanNotice(err instanceof Error ? err.message : 'No scan sources are configured yet.');
    } finally {
      setScanning(false);
    }
  };

  const rescoreAll = async () => {
    setRescoring(true);
    setScanNotice(null);
    try {
      const result = await apiPost<{ rescored: number; changed: number }>('/api/positions/rescore', {});
      setScanNotice(`Re-scored ${result.rescored} leads — ${result.changed} scores changed.`);
      void load();
    } catch (err) {
      setScanNotice(err instanceof Error ? err.message : 'Re-score failed.');
    } finally {
      setRescoring(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['total', 'new', 'reviewed', 'dismissed'] as const).map((k) => (
          <div key={k} style={{
            padding: '10px 16px', borderRadius: 12,
            background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.08), rgba(255,255,255,0.02))',
            border: '1px solid rgba(var(--accent-rgb),0.16)', minWidth: 90,
          }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{summary[k]}</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <button type="button" style={AMBIENT_BTN_GHOST} onClick={rescoreAll} disabled={rescoring}>
            {rescoring ? 'Re-scoring…' : 'Re-score All'}
          </button>
          <button type="button" style={AMBIENT_BTN_NEON} onClick={scanNow} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        </div>
      </div>
      {scanNotice && <div style={{ marginBottom: 12, fontSize: '0.82rem', opacity: 0.8 }}>{scanNotice}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {(['', 'new', 'reviewed', 'dismissed'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            style={{
              ...AMBIENT_BTN_GHOST,
              background: statusFilter === s ? 'rgba(var(--accent-rgb),0.16)' : 'transparent',
            }}
          >
            {s || 'All'}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
        <button
          type="button"
          onClick={() => setRelevantOnly((v) => !v)}
          style={{
            ...AMBIENT_BTN_GHOST,
            background: relevantOnly ? 'rgba(120,200,140,0.16)' : 'transparent',
            color: relevantOnly ? '#78C88C' : 'var(--accent-color)',
          }}
        >
          {relevantOnly ? '✓ Relevant only (score \u2265 20)' : 'Show all (incl. score 0)'}
        </button>
      </div>

      {loading ? (
        <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>
      ) : leads.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>
          No leads yet. Once a source (RSS, then Google Programmable Search) is wired up and a scan runs, results appear here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leads.map((lead) => (
            <div key={lead.id} style={{
              padding: 16, borderRadius: 14,
              background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.05), rgba(255,255,255,0.015))',
              border: '1px solid rgba(var(--accent-rgb),0.14)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{lead.project || lead.company || 'Untitled lead'}</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.65, marginTop: 2 }}>
                    {[lead.company, lead.person].filter(Boolean).join(' \u00b7 ') || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span style={STATUS_STYLE[lead.status]}>{lead.status}</span>
                  <span style={BIZ_BADGE(
                    lead.score >= 50 ? 'rgba(120,200,140,0.18)' : lead.score >= 20 ? 'rgba(var(--accent-rgb),0.16)' : 'rgba(255,255,255,0.06)',
                    lead.score >= 50 ? '#78C88C' : lead.score >= 20 ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'
                  )}>
                    Score {lead.score}
                  </span>
                  <span style={BIZ_BADGE('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.55)')}>{lead.source}</span>
                  {lead.scoredBy === 'ai' && (
                    <span style={BIZ_BADGE('rgba(180,140,255,0.16)', '#B48CFF')}>✨ AI</span>
                  )}
                </div>
              </div>
              {lead.details && <p style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: 8 }}>{lead.details}</p>}
              {Object.keys(lead.contacts || {}).length > 0 && (
                <div style={{ fontSize: '0.76rem', opacity: 0.7, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {lead.contacts.email && <span>✉ {lead.contacts.email}</span>}
                  {lead.contacts.phone && <span>☎ {lead.contacts.phone}</span>}
                  {lead.contacts.formUrl && (
                    <a href={lead.contacts.formUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)' }}>Application form →</a>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <a href={lead.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--accent-color)' }}>
                  View source →
                </a>
                <div style={{ display: 'flex', gap: 6 }}>
                  {lead.status !== 'reviewed' && (
                    <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => updateStatus(lead.id, 'reviewed')}>Mark reviewed</button>
                  )}
                  {lead.status !== 'dismissed' && (
                    <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => updateStatus(lead.id, 'dismissed')}>Dismiss</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ChatLogRow {
  id: string;
  conversationId: string;
  locale: string;
  messages: Array<{ role: 'user' | 'bot'; text: string; timestamp: string }>;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

// 2026-07-14 (per Reza — read visitor chat conversations from the admin
// panel, so he can personally reach out if a visitor left contact info):
// same card-list pattern as BizLeadsPanel above, collapsed by default
// (a full transcript is a lot to show inline) with a "Mark read" action
// mirroring the briefs table's isRead field.
const BizConversationsPanel = () => {
  const [logs, setLogs] = useState<ChatLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<ChatLogRow[]>('/api/chat-logs');
      setLogs(rows ?? []);
    } catch (err) {
      console.error('Failed to load chat logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (id: string, isRead: boolean) => {
    try {
      await apiPut(`/api/chat-logs/${id}`, { isRead });
      setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, isRead } : l)));
    } catch (err) {
      console.error('Failed to update chat log:', err);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visible = unreadOnly ? logs.filter((l) => !l.isRead) : logs;
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(visible.map((l) => l.id));
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} conversation${selected.size === 1 ? '' : 's'}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await apiPost('/api/chat-logs/bulk-delete', { ids: Array.from(selected) });
      setLogs((prev) => prev.filter((l) => !selected.has(l.id)));
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to delete chat logs:', err);
    } finally {
      setDeleting(false);
    }
  };

  const unreadCount = logs.filter((l) => !l.isRead).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          style={{
            ...AMBIENT_BTN_GHOST,
            background: unreadOnly ? 'rgba(var(--accent-rgb),0.16)' : 'transparent',
          }}
        >
          {unreadOnly ? `Unread only (${unreadCount})` : `All conversations (${logs.length})`}
        </button>
        {visible.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', opacity: 0.8, cursor: 'pointer' }}>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
            Select all
          </label>
        )}
        {selected.size > 0 && (
          <button
            type="button"
            onClick={deleteSelected}
            disabled={deleting}
            style={{ ...AMBIENT_BTN_GHOST, marginLeft: 'auto', color: '#E8232B', borderColor: 'rgba(232,35,43,0.4)' }}
          >
            {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>
          {unreadOnly ? 'No unread conversations.' : 'No visitor conversations yet — they\u2019ll appear here as people chat with the Studio Bot.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((log) => {
            const lastMsg = log.messages[log.messages.length - 1];
            const expanded = expandedId === log.id;
            return (
              <div key={log.id} style={{
                padding: 16, borderRadius: 14,
                background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.05), rgba(255,255,255,0.015))',
                border: log.isRead ? '1px solid rgba(var(--accent-rgb),0.14)' : '1px solid rgba(var(--accent-rgb),0.4)',
              }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(log.id)}
                    onChange={() => toggleSelect(log.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => setExpandedId(expanded ? null : log.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!log.isRead && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-color)', flexShrink: 0 }} />}
                      <span style={{ fontWeight: 600 }}>{log.messages.length} message{log.messages.length === 1 ? '' : 's'}</span>
                      <span style={BIZ_BADGE('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.55)')}>{log.locale.toUpperCase()}</span>
                    </div>
                    {lastMsg && (
                      <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastMsg.role === 'user' ? 'Visitor: ' : 'Bot: '}{lastMsg.text}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.55, flexShrink: 0 }} onClick={() => setExpandedId(expanded ? null : log.id)}>
                    {new Date(log.updatedAt).toLocaleString()}
                  </div>
                </div>
                {expanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {log.messages.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: '0.8rem',
                        background: m.role === 'user' ? 'rgba(var(--accent-rgb),0.16)' : 'rgba(255,255,255,0.04)',
                      }}>
                        {m.text}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" style={AMBIENT_BTN_GHOST} onClick={(e) => { e.stopPropagation(); markRead(log.id, !log.isRead); }}>
                    {log.isRead ? 'Mark unread' : 'Mark read'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface ApiKeyStatus { keyName: string; isActive: boolean | null; isConfigured: boolean; testedAt: string | null; value?: string }

const BizSourcesPanel = () => {
  const [apiKey, setApiKey] = useState('');
  const [searchEngineId, setSearchEngineId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeOk, setNoticeOk] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await apiGet<ApiKeyStatus[]>('/api/keys/status');
        const row = rows?.find((r) => r.keyName === 'GOOGLE_SEARCH_CREDENTIALS');
        if (row?.isConfigured) {
          setConfigured(true);
          setTestedAt(row.testedAt);
          if (row.value) {
            try {
              const parsed = JSON.parse(row.value) as { apiKey?: string; searchEngineId?: string };
              setApiKey(parsed.apiKey || '');
              setSearchEngineId(parsed.searchEngineId || '');
            } catch { /* leave fields blank if the stored value can't be parsed */ }
          }
        }
      } catch (err) {
        console.error('Failed to load key status:', err);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await apiPost('/api/keys', {
        keyName: 'GOOGLE_SEARCH_CREDENTIALS',
        keyValue: JSON.stringify({ apiKey, searchEngineId }),
      });
      setConfigured(true);
      setNoticeOk(true);
      setNotice('Saved. Click Test Connection to verify it actually works before relying on it.');
    } catch (err) {
      setNoticeOk(false);
      setNotice(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const result = await apiPost<{ message: string }>('/api/keys/test', {
        keyName: 'GOOGLE_SEARCH_CREDENTIALS',
        keyValue: JSON.stringify({ apiKey, searchEngineId }),
      });
      setNoticeOk(true);
      setNotice(result?.message || 'Connected.');
      setTestedAt(new Date().toISOString());
    } catch (err) {
      setNoticeOk(false);
      setNotice(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <p style={{ opacity: 0.7, marginBottom: 16, fontSize: '0.85rem' }}>
        Add keys here as sources come online. RSS needs none. The scanner already works fully without any key here —
        each one just makes it reach further.
      </p>
      <div style={{
        padding: 18, borderRadius: 14, marginBottom: 12,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>RSS Feeds</div>
        <div style={{ fontSize: '0.8rem', opacity: 0.65 }}>No key needed — already active, covering all 12 concepts.</div>
      </div>
      <div style={{
        padding: 18, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>Google Programmable Search</div>
          <span style={BIZ_BADGE(
            configured ? 'rgba(120,200,140,0.18)' : 'rgba(255,255,255,0.06)',
            configured ? '#78C88C' : 'rgba(255,255,255,0.5)'
          )}>
            {configured ? 'Configured' : 'Not configured'}
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 12 }}>
          Needs an API key + a Search Engine ID (cx) from{' '}
          <a href="https://programmablesearchengine.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)' }}>
            Google Programmable Search
          </a>. Once saved and tested, every scan searches for composer/sound-craft work across all 12 concepts automatically — nothing else to configure.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }}
          />
          <input
            type="text"
            value={searchEngineId}
            onChange={(e) => setSearchEngineId(e.target.value)}
            placeholder="Search Engine ID (cx)"
            style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={AMBIENT_BTN_NEON} onClick={save} disabled={saving || !apiKey || !searchEngineId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" style={AMBIENT_BTN_GHOST} onClick={test} disabled={testing || !apiKey || !searchEngineId}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
        {notice && (
          <div style={{ marginTop: 10, fontSize: '0.8rem', color: noticeOk ? '#78C88C' : '#E08585' }}>{notice}</div>
        )}
        {testedAt && !notice && (
          <div style={{ marginTop: 10, fontSize: '0.74rem', opacity: 0.5 }}>Last tested: {new Date(testedAt).toLocaleString()}</div>
        )}
      </div>
    </div>
  );
};

const BizReportsPanel = () => {
  const [reports, setReports] = useState<PositionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<PositionReport[]>('/api/positions/reports');
      setReports(rows ?? []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const result = await apiPost<{ reportUrl: string; leadCount: number }>('/api/positions/reports/generate', {});
      setNotice(`Report ready — ${result.leadCount} leads included.`);
      void load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const GenerateButton = (
    <button type="button" style={AMBIENT_BTN_NEON} onClick={generate} disabled={generating}>
      {generating ? 'Building…' : 'Generate Report Now'}
    </button>
  );

  if (loading) return <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: 0 }}>
          Pulls every lead scored 20+ that isn’t dismissed into a clean .xlsx — the same builder the 8AM
          scheduled report (once hosting is decided) will call.
        </p>
        {GenerateButton}
      </div>
      {notice && <div style={{ marginBottom: 14, fontSize: '0.82rem', opacity: 0.85 }}>{notice}</div>}
      {reports.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>
          No reports yet — click Generate Report Now above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map((r) => (
            <div key={r.id} style={{
              padding: 14, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.05), rgba(255,255,255,0.015))',
              border: '1px solid rgba(var(--accent-rgb),0.14)',
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                <div style={{ fontSize: '0.78rem', opacity: 0.6 }}>{r.leadCount} leads</div>
              </div>
              <a href={r.reportUrl} target="_blank" rel="noreferrer" style={AMBIENT_BTN_NEON as CSSProperties}>Download</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BizSettingsPanel = () => {
  const [scheduleOn, setScheduleOn] = useState(false);
  const [deliveryEmail, setDeliveryEmailLocal] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await apiGet<{ enabled: boolean; deliveryEmail: string }>('/api/positions/settings');
        setScheduleOn(!!settings?.enabled);
        setDeliveryEmailLocal(settings?.deliveryEmail || '');
      } catch (err) {
        console.error('Failed to load scanner settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSchedule = async () => {
    setToggling(true);
    try {
      const next = !scheduleOn;
      await apiPut('/api/positions/settings', { enabled: next });
      setScheduleOn(next);
    } catch (err) {
      console.error('Failed to update schedule toggle:', err);
    } finally {
      setToggling(false);
    }
  };

  const saveEmail = async () => {
    setSavingEmail(true);
    setNotice(null);
    try {
      await apiPut('/api/positions/settings', { deliveryEmail });
      setNotice('Saved.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) return <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <div style={{
        padding: 18, borderRadius: 14, marginBottom: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Automatic schedule</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 2 }}>
              Scan every 2 hours; build a report at 8:00 AM Houston time.
            </div>
          </div>
          <button
            type="button"
            onClick={toggleSchedule}
            disabled={toggling}
            style={{ ...AMBIENT_BTN_NEON, opacity: scheduleOn ? 1 : 0.4 }}
          >
            {toggling ? '…' : scheduleOn ? 'On' : 'Off'}
          </button>
        </div>
        <div style={{ fontSize: '0.74rem', opacity: 0.5, marginTop: 10 }}>
          Real node-cron tasks — flipping this actually starts/stops them immediately. Only fires on schedule while
          this server process stays running, so it's genuinely useful once this is deployed somewhere always-on;
          harmless to leave on in the meantime, it just won't fire while the dev server is closed.
        </div>
      </div>
      <div style={{
        padding: 18, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Delivery email (optional)</div>
        <input
          type="email"
          value={deliveryEmail}
          onChange={(e) => setDeliveryEmailLocal(e.target.value)}
          placeholder="you@example.com"
          style={{ ...DARK_SELECT_STYLE, width: '100%', padding: '0.5em 0.8em', borderRadius: 8 }}
        />
        <div style={{ fontSize: '0.74rem', opacity: 0.5, margin: '8px 0 12px' }}>
          Saved either way — actual emailing isn't wired yet (no SMTP configured), so for now every report simply
          saves to the Reports tab regardless of what's set here.
        </div>
        <button type="button" style={AMBIENT_BTN_NEON} onClick={saveEmail} disabled={savingEmail}>
          {savingEmail ? 'Saving…' : 'Save'}
        </button>
        {notice && <div style={{ marginTop: 8, fontSize: '0.8rem', opacity: 0.8 }}>{notice}</div>}
      </div>
    </div>
  );
};

const TabBusiness = () => {
  const [subTab, setSubTab] = useState<'leads' | 'conversations' | 'sources' | 'reports' | 'settings'>('leads');
  return (
    <div>
      <h2 className="adm-section-title">Business</h2>
      <p style={{ opacity: 0.7, marginBottom: 16, fontSize: '0.85rem' }}>
        Finds potential composing work across languages and sources, scores relevance, and builds a clean report.
        Works from RSS alone with zero keys configured — every key added under Sources just extends its reach.
      </p>
      <div className="adm-row" style={{ gap: 8, marginBottom: 20 }}>
        {(['leads', 'conversations', 'sources', 'reports', 'settings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="adm-btn"
            style={subTab === t ? { background: 'rgba(var(--accent-rgb),0.16)', color: 'var(--accent-color)' } : undefined}
            onClick={() => setSubTab(t)}
          >
            {t === 'leads' ? 'Leads' : t === 'conversations' ? 'Conversations' : t === 'sources' ? 'Sources & Keys' : t === 'reports' ? 'Reports' : 'Settings'}
          </button>
        ))}
      </div>
      {subTab === 'leads' && <BizLeadsPanel />}
      {subTab === 'conversations' && <BizConversationsPanel />}
      {subTab === 'sources' && <BizSourcesPanel />}
      {subTab === 'reports' && <BizReportsPanel />}
      {subTab === 'settings' && <BizSettingsPanel />}
    </div>
  );
};

// ---------- Security (2FA) — 2026-07-13 ----------
// ---------- Email Verification (2026-07-13) ----------
// SMTP credentials + the "prove you own this address, then optionally
// require it at login" flow. Kept as its own component (not inlined into
// TabSecurity) since it's a genuinely separate sub-feature with its own
// multi-step state — same reasoning that kept Ambient Tracks' rows and
// Business's sub-panels each in their own component.
const EmailVerificationPanel = () => {
  // SMTP credentials (Save & Test)
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpNotice, setSmtpNotice] = useState<string | null>(null);
  const [smtpNoticeOk, setSmtpNoticeOk] = useState(true);

  // Email address (set -> confirm code -> require toggle)
  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailNoticeOk, setEmailNoticeOk] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [keyRows, emailStatus] = await Promise.all([
          apiGet<ApiKeyStatus[]>('/api/keys/status'),
          apiGet<{ email: string | null; verified: boolean; required: boolean }>('/api/auth/email/status'),
        ]);
        const smtpRow = keyRows?.find((r) => r.keyName === 'SMTP_CREDENTIALS');
        if (smtpRow?.isConfigured) {
          setSmtpConfigured(true);
          if (smtpRow.value) {
            try {
              const parsed = JSON.parse(smtpRow.value) as Partial<{ host: string; port: number; user: string; fromAddress: string; secure: boolean }>;
              setSmtpHost(parsed.host || '');
              setSmtpPort(String(parsed.port || 587));
              setSmtpUser(parsed.user || '');
              setSmtpFrom(parsed.fromAddress || '');
              setSmtpSecure(!!parsed.secure);
            } catch { /* leave fields blank if unparsable */ }
          }
        }
        setEmail(emailStatus?.email ?? null);
        setVerified(!!emailStatus?.verified);
        setRequired(!!emailStatus?.required);
      } catch (err) {
        console.error('Failed to load email verification status:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveSmtp = async () => {
    setSmtpSaving(true);
    setSmtpNotice(null);
    try {
      await apiPost('/api/keys', {
        keyName: 'SMTP_CREDENTIALS',
        keyValue: JSON.stringify({ host: smtpHost, port: Number(smtpPort), user: smtpUser, pass: smtpPass, fromAddress: smtpFrom, secure: smtpSecure }),
      });
      setSmtpConfigured(true);
      setSmtpNoticeOk(true);
      setSmtpNotice('Saved. Click Test Connection to verify it actually works before relying on it.');
    } catch (err) {
      setSmtpNoticeOk(false);
      setSmtpNotice(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSmtpSaving(false);
    }
  };

  const testSmtp = async () => {
    setSmtpTesting(true);
    setSmtpNotice(null);
    try {
      const result = await apiPost<{ message: string }>('/api/keys/test', {
        keyName: 'SMTP_CREDENTIALS',
        keyValue: JSON.stringify({ host: smtpHost, port: Number(smtpPort), user: smtpUser, pass: smtpPass, fromAddress: smtpFrom, secure: smtpSecure }),
      });
      setSmtpNoticeOk(true);
      setSmtpNotice(result?.message || 'Connected.');
    } catch (err) {
      setSmtpNoticeOk(false);
      setSmtpNotice(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setSmtpTesting(false);
    }
  };

  const startEmailSet = async () => {
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await apiPost('/api/auth/email/set', { email: newEmail });
      setAwaitingCode(true);
      setEmailNoticeOk(true);
      setEmailNotice(`Code sent to ${newEmail}.`);
    } catch (err) {
      setEmailNoticeOk(false);
      setEmailNotice(err instanceof Error ? err.message : 'Failed to send code — check SMTP is configured above.');
    } finally {
      setEmailBusy(false);
    }
  };

  const confirmEmail = async () => {
    if (confirmCode.length !== 6) return;
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await apiPost('/api/auth/email/confirm', { code: confirmCode });
      setEmail(newEmail);
      setVerified(true);
      setAwaitingCode(false);
      setNewEmail('');
      setConfirmCode('');
      setEmailNoticeOk(true);
      setEmailNotice('Email verified.');
    } catch (err) {
      setEmailNoticeOk(false);
      setEmailNotice(err instanceof Error ? err.message : 'Incorrect or expired code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const toggleRequired = async () => {
    const next = !required;
    setEmailBusy(true);
    try {
      await apiPut('/api/auth/email/require', { required: next });
      setRequired(next);
    } catch (err) {
      setEmailNoticeOk(false);
      setEmailNotice(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setEmailBusy(false);
    }
  };

  if (loading) return <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <>
      <div style={{
        marginTop: 16, padding: 20, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>Email Sending (SMTP)</div>
          <span style={BIZ_BADGE(
            smtpConfigured ? 'rgba(120,200,140,0.18)' : 'rgba(255,255,255,0.06)',
            smtpConfigured ? '#78C88C' : 'rgba(255,255,255,0.5)'
          )}>
            {smtpConfigured ? 'Configured' : 'Not configured'}
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 12 }}>
          Works with any provider — a Gmail app password, SendGrid, Resend's SMTP relay, etc. Required before email
          verification (below) can send anything.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxWidth: 380 }}>
          <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP Host (e.g. smtp.gmail.com)" style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }} />
          <input type="text" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ''))} placeholder="Port (587 or 465)" style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }} />
          <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="Username" style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }} />
          <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="Password" style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }} />
          <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="From address (e.g. no-reply@yoursite.com)" style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted-color)' }}>
            <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            Use TLS on connect (port 465) — leave off for STARTTLS (port 587, most common)
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={AMBIENT_BTN_NEON} onClick={saveSmtp} disabled={smtpSaving || !smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom}>
            {smtpSaving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" style={AMBIENT_BTN_GHOST} onClick={testSmtp} disabled={smtpTesting || !smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom}>
            {smtpTesting ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
        {smtpNotice && <div style={{ marginTop: 10, fontSize: '0.8rem', color: smtpNoticeOk ? '#78C88C' : '#E08585' }}>{smtpNotice}</div>}
      </div>

      <div style={{
        marginTop: 16, padding: 20, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>Email Verification</div>
          {verified && (
            <span style={BIZ_BADGE(
              required ? 'rgba(120,200,140,0.18)' : 'rgba(255,255,255,0.06)',
              required ? '#78C88C' : 'rgba(255,255,255,0.5)'
            )}>
              {required ? 'Required at login' : 'Optional'}
            </span>
          )}
        </div>

        {verified && email && !awaitingCode ? (
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: 12 }}>
              Verified: <strong>{email}</strong>
            </div>
            <button type="button" style={AMBIENT_BTN_GHOST} onClick={toggleRequired} disabled={emailBusy}>
              {required ? 'Stop requiring at login' : 'Require at login'}
            </button>
          </div>
        ) : awaitingCode ? (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted-color)', marginBottom: 10 }}>
              Enter the 6-digit code sent to {newEmail}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8, width: 140, letterSpacing: '0.2em', fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => { setAwaitingCode(false); setConfirmCode(''); }} disabled={emailBusy}>Cancel</button>
              <button type="button" style={AMBIENT_BTN_NEON} onClick={confirmEmail} disabled={emailBusy || confirmCode.length !== 6}>
                {emailBusy ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted-color)', marginBottom: 10 }}>
              {smtpConfigured ? 'Enter an email address to verify it.' : 'Configure SMTP above first.'}
            </p>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={!smtpConfigured}
              style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8, width: '100%', maxWidth: 280 }}
            />
            <div style={{ marginTop: 12 }}>
              <button type="button" style={AMBIENT_BTN_NEON} onClick={startEmailSet} disabled={emailBusy || !smtpConfigured || !newEmail}>
                {emailBusy ? 'Sending…' : 'Send Code'}
              </button>
            </div>
          </div>
        )}
        {emailNotice && <div style={{ marginTop: 10, fontSize: '0.8rem', color: emailNoticeOk ? '#78C88C' : '#E08585' }}>{emailNotice}</div>}
      </div>
    </>
  );
};

const TabSecurity = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // setup flow state
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // disable flow state
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);

  // change-password flow state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await apiGet<{ enabled: boolean }>('/api/auth/2fa/status');
      setEnabled(!!status?.enabled);
    } catch (err) {
      console.error('Failed to load 2FA status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const startSetup = async () => {
    setSetupError(null);
    try {
      const data = await apiPost<{ secret: string; qrCodeDataUrl: string }>('/api/auth/2fa/setup', {});
      setSetupData(data);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to start setup.');
    }
  };

  const confirmSetup = async () => {
    if (!setupData || setupCode.length !== 6) return;
    setSettingUp(true);
    setSetupError(null);
    try {
      await apiPost('/api/auth/2fa/verify-setup', { secret: setupData.secret, code: setupCode });
      setSetupData(null);
      setSetupCode('');
      setEnabled(true);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Incorrect code — check the app and try again.');
    } finally {
      setSettingUp(false);
    }
  };

  const cancelSetup = () => {
    setSetupData(null);
    setSetupCode('');
    setSetupError(null);
  };

  const confirmDisable = async () => {
    if (!disablePassword) return;
    setDisabling(true);
    setDisableError(null);
    try {
      await apiPost('/api/auth/2fa/disable', { password: disablePassword });
      setEnabled(false);
      setShowDisableForm(false);
      setDisablePassword('');
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'Incorrect password.');
    } finally {
      setDisabling(false);
    }
  };

  const confirmChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPut('/api/auth/change-password', { currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) return <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <h2 className="adm-section-title">Security</h2>
      <p style={{ opacity: 0.7, marginBottom: 20, fontSize: '0.85rem' }}>
        Two-factor authentication (TOTP) — an authenticator app (Google Authenticator, Authy, etc.), no email or SMS
        needed. Once enabled, signing in needs the password AND a fresh 6-digit code from the app.
      </p>

      <div style={{
        padding: 20, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: setupData || (enabled && showDisableForm) ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Two-Factor Authentication</div>
            <span style={BIZ_BADGE(
              enabled ? 'rgba(120,200,140,0.18)' : 'rgba(255,255,255,0.06)',
              enabled ? '#78C88C' : 'rgba(255,255,255,0.5)'
            )}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {!enabled && !setupData && (
            <button type="button" style={AMBIENT_BTN_NEON} onClick={startSetup}>Enable 2FA</button>
          )}
          {enabled && !showDisableForm && (
            <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => setShowDisableForm(true)}>Disable</button>
          )}
        </div>

        {/* Setup flow: QR code + secret + code confirmation */}
        {setupData && (
          <div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR code"
                style={{ width: 180, height: 180, borderRadius: 10, border: '1px solid var(--adm-border)', background: '#fff', padding: 8 }}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted-color)', marginBottom: 10 }}>
                  Scan with your authenticator app, or enter this key manually:
                </p>
                <code style={{
                  display: 'block', padding: '8px 10px', borderRadius: 8, fontSize: '0.78rem', wordBreak: 'break-all',
                  background: 'rgba(107,82,38,0.06)', border: '1px solid var(--adm-border)', marginBottom: 14,
                }}>
                  {setupData.secret}
                </code>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8, width: 140, letterSpacing: '0.2em', fontSize: '1rem' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" style={AMBIENT_BTN_GHOST} onClick={cancelSetup} disabled={settingUp}>Cancel</button>
                  <button type="button" style={AMBIENT_BTN_NEON} onClick={confirmSetup} disabled={settingUp || setupCode.length !== 6}>
                    {settingUp ? 'Confirming…' : 'Confirm & Enable'}
                  </button>
                </div>
                {setupError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#A6371F' }}>{setupError}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Disable flow: password re-entry */}
        {enabled && showDisableForm && (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted-color)', marginBottom: 10 }}>
              Enter your password to confirm turning 2FA off.
            </p>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Current password"
              style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8, width: '100%', maxWidth: 260 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => { setShowDisableForm(false); setDisablePassword(''); setDisableError(null); }} disabled={disabling}>
                Cancel
              </button>
              <button type="button" style={{ ...AMBIENT_BTN_NEON, background: 'linear-gradient(180deg,#E38B7A,#B23A28)' }} onClick={confirmDisable} disabled={disabling || !disablePassword}>
                {disabling ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
            {disableError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#A6371F' }}>{disableError}</div>}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 16, padding: 20, borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(var(--accent-rgb),0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(var(--accent-rgb),0.16)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPasswordForm ? 16 : 0 }}>
          <div style={{ fontWeight: 600 }}>Password</div>
          {!showPasswordForm && (
            <button type="button" style={AMBIENT_BTN_GHOST} onClick={() => { setShowPasswordForm(true); setPasswordSuccess(false); }}>
              Change Password
            </button>
          )}
        </div>

        {passwordSuccess && !showPasswordForm && (
          <div style={{ fontSize: '0.8rem', color: '#78C88C' }}>Password changed successfully.</div>
        )}

        {showPasswordForm && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxWidth: 320 }}>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{ ...DARK_SELECT_STYLE, padding: '0.5em 0.8em', borderRadius: 8 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={AMBIENT_BTN_GHOST}
                onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(null); }}
                disabled={changingPassword}
              >
                Cancel
              </button>
              <button
                type="button"
                style={AMBIENT_BTN_NEON}
                onClick={confirmChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              >
                {changingPassword ? 'Saving…' : 'Save New Password'}
              </button>
            </div>
            {passwordError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#A6371F' }}>{passwordError}</div>}
          </div>
        )}
      </div>

      <EmailVerificationPanel />
    </div>
  );
};


export default function AdminDashboard({ onClose, initialTab = 1 }: { onClose: () => void; initialTab?: number }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { enterEditMode } = useContent();
  const tabGroups = [
    {
      label: 'Site Content',
      tabs: [
        { id: 1, label: 'Identity Matrix' },
        { id: 7, label: 'Ambient Tracks' },
        { id: 10, label: 'Fonts' },
        { id: 11, label: 'Promo Screen' },
      ],
    },
    {
      label: 'Creative Production',
      tabs: [
        { id: 2, label: 'Media Pipeline' },
        { id: 6, label: 'Poster Studio' },
      ],
    },
    {
      label: 'AI & Integrations',
      tabs: [
        { id: 3, label: 'Gatekeeper Hub' },
        { id: 5, label: 'Document Assistant' },
      ],
    },
    {
      label: 'Business Tools',
      tabs: [
        { id: 8, label: 'Business' },
      ],
    },
    {
      label: 'Security',
      tabs: [
        { id: 9, label: 'Security' },
      ],
    },
  ];

  const handleOpenVisualEditor = () => {
    enterEditMode();
    window.location.href = '/';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="adm-shell fixed inset-0 z-50 flex flex-col font-sans"
    >
      <div className="adm-header">
        <h1 className="adm-header-title">ACE Admin</h1>
        <button onClick={onClose} className="adm-btn adm-btn--ghost">Close</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="adm-sidebar">
          <div className="adm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={handleOpenVisualEditor} className="adm-visual-editor-btn" style={{ flex: 1 }}>
              <span aria-hidden>✎</span> Visual Editor
            </button>
            <ModelUpdatesBell />
          </div>

          <div>
            {tabGroups.map((group) => (
              <div key={group.label} className="adm-sidebar-group">
                <div className="adm-sidebar-section-label">{group.label}</div>
                <nav className="adm-nav">
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`adm-nav-item ${activeTab === tab.id ? 'adm-nav-item--active' : ''}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </div>

        <div className="adm-content">
          <div className="adm-content-inner">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {activeTab === 1 && <TabIdentityMatrix />}
                {activeTab === 2 && <TabMediaPipeline />}
                {activeTab === 3 && <TabGatekeeperHub />}
                {activeTab === 5 && <TabDocumentAssistant />}
                {activeTab === 6 && <TabPosterStudio />}
                {activeTab === 7 && <TabAmbientTracks />}
                {activeTab === 8 && <TabBusiness />}
                {activeTab === 9 && <TabSecurity />}
                {activeTab === 10 && <TabFonts />}
                {activeTab === 11 && <TabPromoScreen />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
