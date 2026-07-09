import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { apiPost, apiGet, apiPut } from '../lib/apiClient';
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
  const { currentJob, startPipeline, approvePipeline, resetJob } = usePipeline();
  const [file, setFile] = useState<File | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
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

  return (
    <div className="space-y-5">
      <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()} className="adm-dropzone">
        <p className="adm-notice mb-3">Drop .mp3 / .wav or YouTube URL here</p>
        <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
      </div>
      {file && (
        <button onClick={() => { if (file) void startPipeline({ file }); }} className="adm-btn adm-btn--primary">
          Process {file.name}
        </button>
      )}
      {currentJob && (
        <div className="adm-panel space-y-3">
          <p className="adm-notice" style={{ fontFamily: 'var(--font-mono)' }}>
            Status: {currentJob.status} ({currentJob.progress}%)
          </p>
          <div className="adm-progress-track">
            <div className="adm-progress-fill" style={{ width: `${currentJob.progress}%` }} />
          </div>
          {currentJob.errorMessage && <p className="text-xs" style={{ color: '#E38B7A' }}>{currentJob.errorMessage}</p>}
          <div className="adm-row">
            {currentJob.status === 'awaiting_approval' && (
              <button onClick={() => { void approvePipeline(currentJob.id); }} className="adm-btn adm-btn--primary adm-btn--sm">
                Approve &amp; Publish
              </button>
            )}
            {(currentJob.status === 'complete' || currentJob.status === 'error') && (
              <button onClick={() => { resetJob(); setFile(null); void fetchTracks(); }} className="adm-btn adm-btn--ghost adm-btn--sm">
                Reset
              </button>
            )}
          </div>
        </div>
      )}
      <div className="adm-panel">
        <div className="adm-panel-title">Playlist</div>
        <p className="adm-panel-subtitle">
          Assign each track a concept, and star one per concept to feature it on the home page.
        </p>
        <div>
          {tracks.map(track => (
            <div key={track.id} className="adm-track-row">
              {/* Star (featured) toggle */}
              <button
                onClick={() => { void updateTrack(track, { isFeatured: !track.isFeatured }); }}
                disabled={savingId === track.id}
                title={track.isFeatured ? 'Featured on home page' : 'Mark as featured (one per concept)'}
                className="text-lg leading-none disabled:opacity-40"
                style={{ color: track.isFeatured ? 'var(--accent-color)' : 'var(--text-dim-color)', background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Toggle featured"
              >
                {track.isFeatured ? '\u2605' : '\u2606'}
              </button>

              {/* Title */}
              <span className="text-sm flex-1 min-w-0 truncate">{track.title?.en || 'Untitled'}</span>

              {/* Concept selector */}
              <select
                value={track.concept ?? ''}
                onChange={e => { void updateTrack(track, { concept: e.target.value || null }); }}
                disabled={savingId === track.id}
                className="adm-select"
                style={{ width: 'auto' }}
                aria-label="Concept"
              >
                <option value="">— concept —</option>
                {CONCEPT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Live badge + play */}
              <span className={`adm-badge ${track.isLive ? 'adm-badge--ok' : 'adm-badge--paid'}`}>
                {track.isLive ? 'Live' : 'Draft'}
              </span>
              <button onClick={() => { void playTrack(track); }} className="adm-btn adm-btn--ghost adm-btn--sm">Play</button>
            </div>
          ))}
          {tracks.length === 0 && (
            <p className="adm-notice">No tracks yet. Upload one above.</p>
          )}
        </div>
      </div>
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
                  style={{ width: 'auto', padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                  title="Not verified against AWS billing — just a note for yourself"
                >
                  <option value="free">Free tier</option>
                  <option value="paid">Paid</option>
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
export default function AdminDashboard({ onClose, initialTab = 1 }: { onClose: () => void; initialTab?: number }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { enterEditMode } = useContent();
  const tabs = [
    { id: 1, label: 'Identity Matrix' },
    { id: 2, label: 'Media Pipeline' },
    { id: 3, label: 'Gatekeeper Hub' },
    { id: 4, label: 'Staging Engine' },
    { id: 5, label: 'Document Assistant' },
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
          <button onClick={handleOpenVisualEditor} className="adm-visual-editor-btn">
            <span aria-hidden>✎</span> Visual Editor
          </button>

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
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
