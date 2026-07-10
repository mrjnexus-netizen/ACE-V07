import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { apiPost, apiGet, apiPut, apiDelete } from '../lib/apiClient';
import { usePipeline } from '../context/PipelineContext';
import StagingPreview from './StagingPreview';
import { useContent } from '../context/ContentContext';
import type { ComposerIdentity, AudioTrack, MultiLingual, ThemeId } from '../types';

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
const DARK_SELECT_STYLE = { background: '#171410', color: '#e9e4da', border: '1px solid rgba(255,255,255,0.14)' };
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
          <audio controls src={stagedAudio.url} style={{ width: '100%' }} />
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

const TabStagingEngine = () => {
  const { themeId, switchTheme } = useChromatic();
  const [editMode, setEditMode] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<ThemeId>(themeId);

  // Keep the staged pick in sync with the live theme whenever we're not
  // actively editing (e.g. someone changed it elsewhere).
  useEffect(() => {
    if (!editMode) setPendingTheme(themeId);
  }, [editMode, themeId]);

  const hasPendingChange = editMode && pendingTheme !== themeId;

  const handleEnterEdit = () => {
    setPendingTheme(themeId);
    setEditMode(true);
  };

  const handlePublish = () => {
    switchTheme(pendingTheme);
    setEditMode(false);
  };

  const handleDiscard = () => {
    setPendingTheme(themeId);
    setEditMode(false);
  };

  return (
    <div className="space-y-5">
      <div className="adm-panel">
        <div className="adm-row">
          <button
            onClick={() => (editMode ? handleDiscard() : handleEnterEdit())}
            className={`adm-btn ${editMode ? 'adm-btn--primary' : 'adm-btn--ghost'}`}
          >
            {editMode ? 'Editing (draft)' : 'Live Mode'}
          </button>
          {editMode && (
            <>
              <button
                onClick={handlePublish}
                disabled={!hasPendingChange}
                className="adm-btn"
                style={{ background: '#3FAE63', color: '#fff' }}
              >
                Publish
              </button>
              <button onClick={handleDiscard} className="adm-btn adm-btn--ghost">
                Discard
              </button>
            </>
          )}
        </div>

        {editMode ? (
          <div className="mt-4 pt-4" style={{ borderTop: '1px dashed var(--adm-border)' }}>
            <p className="adm-notice mb-3">
              Pick a theme below — it previews everywhere in the grid, live site untouched until you hit Publish.
            </p>
            <div className="adm-chip-row">
              {(['onyx', 'cyber', 'minimal'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPendingTheme(t)}
                  className={`adm-chip ${pendingTheme === t ? 'adm-chip--active' : ''}`}
                >
                  {t}
                  {t === themeId && <span className="opacity-60"> (live)</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="adm-notice mt-3">
            Currently live: <span style={{ color: 'var(--accent-color)' }}>{themeId}</span>. Enter Editing to stage a
            different theme and preview it safely before publishing.
          </p>
        )}
      </div>

      <StagingPreview />
    </div>
  );
};

const TabDocumentAssistant = () => {
  const [file, setFile] = useState<File | null>(null);
  const [checklist, setChecklist] = useState<{ category: string; items: string[] }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
        <input type="file" accept=".pdf,.txt,.eml" onChange={e => { setFile(e.target.files?.[0] || null); setChecklist([]); setNotice(null); }} className="text-xs" />
        {file && (
          <div className="mt-3">
            <button onClick={handleAnalyze} disabled={analyzing} className="adm-btn adm-btn--primary">
              {analyzing ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        )}
        {notice && <p className="adm-notice mt-2">{notice}</p>}
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


export default function AdminDashboard({ onClose, initialTab = 1 }: { onClose: () => void; initialTab?: number }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { enterEditMode } = useContent();
  const tabs = [
    { id: 1, label: 'Identity Matrix' },
    { id: 2, label: 'Media Pipeline' },
    { id: 3, label: 'Gatekeeper Hub' },
    { id: 4, label: 'Staging Engine' },
    { id: 5, label: 'Document Assistant' },
    { id: 6, label: 'Poster Studio' },
  ];

  const handleOpenVisualEditor = () => {
    enterEditMode();
    window.location.href = '/';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="adm-shell fixed inset-0 z-50 flex flex-col font-sans"
      style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}
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
            <div className="adm-sidebar-section-label">Sections</div>
            <nav className="adm-nav">
              {tabs.map(tab => (
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
        </div>

        <div className="adm-content">
          <div className="adm-content-inner">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {activeTab === 1 && <TabIdentityMatrix />}
                {activeTab === 2 && <TabMediaPipeline />}
                {activeTab === 3 && <TabGatekeeperHub />}
                {activeTab === 4 && <TabStagingEngine />}
                {activeTab === 5 && <TabDocumentAssistant />}
                {activeTab === 6 && <TabPosterStudio />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
