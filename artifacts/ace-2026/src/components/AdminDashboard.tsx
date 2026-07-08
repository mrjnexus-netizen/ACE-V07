import { useState, useCallback, useEffect } from 'react';
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

  if (!local) return <p className="text-[var(--text-muted-color)]">Loading identity...</p>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {locales.map(l => (
          <button key={l} onClick={() => setActiveLang(l)}
            className={`px-3 py-1 text-xs font-mono rounded ${activeLang === l ? 'bg-[var(--accent-color)] text-[var(--surface-color)]' : 'bg-[var(--surface3-color)] text-[var(--text-muted-color)]'}`}
          >{localeLabels[l]}</button>
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted-color)]" style={{ maxWidth: 480 }}>
        Name, tagline, and biography moved to inline editing — open the ✎ Visual
        Editor and edit them directly on the Hero/About sections (auto-translates
        to all 5 languages on save). Only studio address and social links stay
        here for now.
      </p>

      {(['studioAddress'] as (keyof ComposerIdentity)[]).map(field => (
        <div key={field}>
          <label className="block text-xs font-mono text-[var(--text-muted-color)] mb-1 capitalize">{field}</label>
          <textarea
            rows={3}
            value={(local[field] as Record<string, string> | null)?.[activeLang] || ''}
            onChange={e => handleMultiLingualChange(field, activeLang, e.target.value)}
            className="w-full bg-[var(--surface3-color)] border border-[var(--border-color)] rounded p-2 text-sm text-[var(--text-color)]"
          />
        </div>
      ))}

      {/* Social Links */}
      <div className="grid grid-cols-2 gap-4">
        {(['spotify','imdb','instagram','youtube'] as const).map(link => (
          <div key={link}>
            <label className="block text-xs font-mono text-[var(--text-muted-color)] mb-1">{link}</label>
            <input
              type="url"
              value={local.socialLinks?.[link] || ''}
              onChange={e => handleFieldChange('socialLinks', { ...local.socialLinks, [link]: e.target.value })}
              className="w-full bg-[var(--surface3-color)] border border-[var(--border-color)] rounded p-2 text-sm text-[var(--text-color)]"
            />
          </div>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="px-4 py-2 bg-[var(--accent-color)] text-[var(--surface-color)] rounded font-semibold disabled:opacity-50"
      >{saving ? 'Saving...' : 'Save Identity'}</button>
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
    <div className="space-y-6">
      <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-[var(--border-color)] rounded-lg p-12 text-center hover:border-[var(--accent-color)] transition-colors cursor-pointer"
      >
        <p className="text-sm text-[var(--text-muted-color)]">Drop .mp3 / .wav or YouTube URL here</p>
        <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-4 text-xs" />
      </div>
      {file && (
        <button onClick={() => { if (file) void startPipeline({ file }); }} className="px-4 py-2 bg-[var(--accent-color)] text-[var(--surface-color)] rounded">Process {file.name}</button>
      )}
      {currentJob && (
        <div className="bg-[var(--surface2-color)] p-4 rounded space-y-2">
          <p className="font-mono text-sm">Status: {currentJob.status} ({currentJob.progress}%)</p>
          <div className="w-full bg-[var(--surface3-color)] h-2 rounded">
            <div className="bg-[var(--accent-color)] h-2 rounded transition-all" style={{ width: `${currentJob.progress}%` }} />
          </div>
          {currentJob.errorMessage && <p className="text-xs text-red-400">{currentJob.errorMessage}</p>}
          {currentJob.status === 'awaiting_approval' && (
            <button onClick={() => { void approvePipeline(currentJob.id); }} className="px-3 py-1 text-xs bg-green-600 text-white rounded">Approve &amp; Publish</button>
          )}
          {(currentJob.status === 'complete' || currentJob.status === 'error') && (
            <button onClick={() => { resetJob(); setFile(null); void fetchTracks(); }} className="px-3 py-1 text-xs bg-[var(--surface3-color)] rounded">Reset</button>
          )}
        </div>
      )}
      <div>
        <h3 className="font-display text-lg mb-1">Playlist</h3>
        <p className="text-xs text-[var(--text-muted-color)] mb-3">
          Assign each track a concept, and star one per concept to feature it on the home page.
        </p>
        <div className="space-y-2">
          {tracks.map(track => (
            <div key={track.id} className="flex items-center gap-3 p-3 border-b border-[var(--border-color)]">
              {/* Star (featured) toggle */}
              <button
                onClick={() => { void updateTrack(track, { isFeatured: !track.isFeatured }); }}
                disabled={savingId === track.id}
                title={track.isFeatured ? 'Featured on home page' : 'Mark as featured (one per concept)'}
                className="text-lg leading-none disabled:opacity-40"
                style={{ color: track.isFeatured ? 'var(--accent-color)' : 'var(--text-dim-color)' }}
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
                className="bg-[var(--surface3-color)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-color)] disabled:opacity-40"
                aria-label="Concept"
              >
                <option value="">— concept —</option>
                {CONCEPT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Live badge + play */}
              <span className="text-[0.6rem] font-mono px-2 py-0.5 rounded"
                style={{ color: track.isLive ? 'var(--accent-color)' : 'var(--text-dim-color)', border: '1px solid var(--border-color)' }}>
                {track.isLive ? 'LIVE' : 'DRAFT'}
              </span>
              <button onClick={() => { void playTrack(track); }} className="text-[var(--accent-color)] text-xs">Play</button>
            </div>
          ))}
          {tracks.length === 0 && (
            <p className="text-xs text-[var(--text-muted-color)]">No tracks yet. Upload one above.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const TabGatekeeperHub = () => {
  const [keys, setKeys] = useState({ AI_IMAGE_GENERATION_KEY: '', LLM_NARRATIVE_API_KEY: '', YOUTUBE_API_DATA_V3: '' });
  const [show, setShow] = useState<Record<string, boolean>>({});

  const toggleShow = (key: string) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

  const handleTest = async (keyName: string) => {
    // POST /api/keys/test
    await apiPost('/api/keys/test', { keyName });
  };

  const handleSave = async (keyName: string) => {
    // POST /api/keys
    await apiPost('/api/keys', { keyName, value: keys[keyName as keyof typeof keys] });
  };

  return (
    <div className="space-y-4">
      {Object.entries(keys).map(([keyName, value]) => (
        <div key={keyName}>
          <label className="block text-xs font-mono text-[var(--text-muted-color)] mb-1">{keyName}</label>
          <div className="flex gap-2">
            <input type={show[keyName] ? 'text' : 'password'} value={value}
              onChange={e => setKeys(prev => ({ ...prev, [keyName]: e.target.value }))}
              className="flex-1 bg-[var(--surface3-color)] border border-[var(--border-color)] rounded p-2 text-sm text-[var(--text-color)]"
            />
            <button onClick={() => toggleShow(keyName)} className="px-2 py-1 text-xs bg-[var(--surface3-color)] rounded">{show[keyName] ? 'Hide' : 'Show'}</button>
            <button onClick={() => handleTest(keyName)} className="px-2 py-1 text-xs bg-[var(--surface3-color)] rounded">Test</button>
            <button onClick={() => handleSave(keyName)} className="px-2 py-1 text-xs bg-[var(--accent-color)] text-[var(--surface-color)] rounded">Save</button>
          </div>
        </div>
      ))}
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
    <div className="space-y-6">
      <div className="flex gap-4 items-center">
        <button
          onClick={() => (editMode ? handleDiscard() : handleEnterEdit())}
          className={`px-4 py-2 rounded ${editMode ? 'bg-[var(--accent-color)] text-[var(--surface-color)]' : 'bg-[var(--surface3-color)]'}`}
        >
          {editMode ? 'Editing (draft)' : 'Live Mode'}
        </button>
        {editMode && (
          <>
            <button
              onClick={handlePublish}
              disabled={!hasPendingChange}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-40"
            >
              Publish
            </button>
            <button onClick={handleDiscard} className="px-4 py-2 bg-[var(--surface3-color)] rounded">
              Discard
            </button>
          </>
        )}
      </div>

      {editMode ? (
        <div className="p-4 border border-dashed border-[var(--accent-color)] rounded space-y-3">
          <p className="text-xs text-[var(--text-muted-color)]">
            Pick a theme below — it previews everywhere in the grid, live site untouched until you hit Publish.
          </p>
          <div className="flex gap-4">
            {(['onyx', 'cyber', 'minimal'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPendingTheme(t)}
                className={`px-3 py-1 text-xs rounded ${pendingTheme === t ? 'bg-[var(--accent-color)] text-[var(--surface-color)]' : 'bg-[var(--surface3-color)]'}`}
              >
                {t}
                {t === themeId && <span className="ml-1 opacity-60">(live)</span>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted-color)]">
          Currently live: <span style={{ color: 'var(--accent-color)' }}>{themeId}</span>. Enter Editing to stage a
          different theme and preview it safely before publishing.
        </p>
      )}

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
      <input type="file" accept=".pdf,.txt,.eml" onChange={e => { setFile(e.target.files?.[0] || null); setChecklist([]); setNotice(null); }} />
      {file && <button onClick={handleAnalyze} disabled={analyzing} className="px-4 py-2 bg-[var(--accent-color)] text-[var(--surface-color)] rounded disabled:opacity-50">{analyzing ? 'Analyzing...' : 'Analyze'}</button>}
      {notice && <p className="text-xs text-[var(--text-muted-color)]">{notice}</p>}
      {checklist.length > 0 && (
        <div className="space-y-2">
          {checklist.map((group, i) => (
            <div key={i}>
              <h4 className="font-semibold text-sm">{group.category}</h4>
              <ul className="list-disc pl-5 text-xs text-[var(--text-muted-color)]">
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
      className="fixed inset-0 z-50 flex flex-col font-sans"
      style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h1 className="text-lg font-mono tracking-wider" style={{ color: 'var(--accent-color)' }}>ACE ADMIN</h1>
        <button onClick={onClose} className="px-4 py-2 bg-[var(--surface3-color)] rounded text-sm">Close</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r p-4 space-y-2 flex flex-col" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={handleOpenVisualEditor}
            className="w-full text-left px-3 py-2 rounded text-sm font-mono border"
            style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
          >
            ✎ Visual Editor
          </button>
          <div className="pt-2 space-y-2">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm font-mono transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--surface-color)]'
                    : 'hover:bg-[var(--surface3-color)]'
                }`}
              >{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
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
    </motion.div>
  );
}
