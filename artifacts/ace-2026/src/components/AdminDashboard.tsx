import React, { useState, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useStaging } from '../context/StagingContext';
import { usePipeline } from '../context/PipelineContext';
import { useChromatic } from '../context/ChromaticContext';
import { Locale, MultiLingual } from '../types';

interface AdminDashboardProps {
  onClose: () => void;
}

const AdminDashboard = ({ onClose }: AdminDashboardProps) => {
  const { identity } = useIdentity();
  const { isEditMode, setIsEditMode, draftState, updateDraftField, commitDraft, rollbackDraft } = useStaging();
  const { currentJob } = usePipeline();
  const { theme } = useChromatic();

  const [activeTab, setActiveTab] = useState<number>(1);
  const [activeLocaleTab, setActiveLocaleTab] = useState<Locale>('en');

  // Tab 3 API Keys State
  const [apiKeys, setApiKeys] = useState({
    AI_IMAGE_GENERATION_KEY: '',
    LLM_NARRATIVE_API_KEY: '',
    YOUTUBE_API_DATA_V3: '',
  });
  const [, setKeyStatus] = useState<any[]>([]);

  // Tab 5 Document Assistant State
  const [documentChecklist, setDocumentChecklist] = useState<any[]>([]);

  useEffect(() => {
    fetchKeysStatus();
  }, []);

  const fetchKeysStatus = async () => {
    try {
      const res = await fetch('/api/keys/status');
      const data = await res.json();
      if (data.success) {
        setKeyStatus(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveKeys = async () => {
    try {
      for (const [keyName, keyValue] of Object.entries(apiKeys)) {
        if (!keyValue) continue;
        await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyName, keyValue, isActive: true }),
        });
      }
      alert('API keys saved and securely encrypted.');
      fetchKeysStatus();
    } catch (err) {
      alert('Failed to save API keys');
    }
  };

  const testKeyConnection = async (keyName: string, keyValue: string) => {
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName, keyValue }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${keyName} status: ${data.data.status}`);
      } else {
        alert(`Test failed: ${data.error}`);
      }
      fetchKeysStatus();
    } catch (err) {
      alert('Test failed');
    }
  };

  // AI translate function for Tab 1
  const handleAITranslate = async (fieldType: string, text: string) => {
    try {
      const res = await fetch('/api/identity/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang: activeLocaleTab }),
      });
      const data = await res.json();
      if (data.success) {
        updateDraftField(fieldType as any, data.data);
        alert('Translated successfully into all 6 ecosystem languages!');
      }
    } catch (err) {
      alert('Translation failed');
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        // Flatten list for checklist
        const flattened = [
          ...data.data.checklist.timecodes.map((t: any) => ({ ...t, cat: 'TIMECODES' })),
          ...data.data.checklist.revisions.map((t: any) => ({ ...t, cat: 'REVISIONS' })),
          ...data.data.checklist.deliverables.map((t: any) => ({ ...t, cat: 'DELIVERABLES' })),
          ...data.data.checklist.deadlines.map((t: any) => ({ ...t, cat: 'DEADLINES' })),
        ];
        setDocumentChecklist(flattened);
      }
    } catch (err) {
      alert('Document analysis failed');
    }
  };

  return (
    <div
      style={{
        backdropFilter: 'blur(35px) saturate(180%)',
        WebkitBackdropFilter: 'blur(35px) saturate(180%)',
        background: theme.id === 'minimal' ? 'rgba(242, 242, 240, 0.95)' : 'rgba(15, 15, 15, 0.95)',
      }}
      className="fixed inset-4 md:inset-10 border border-border rounded-2xl flex flex-col z-[9999] overflow-hidden text-text"
    >
      {/* Top Header Controls */}
      <div className="p-6 border-b border-border flex justify-between items-center bg-surface2">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide">CMS Gatekeeper Portal</h2>
          <p className="font-mono text-[10px] text-accent tracking-widest uppercase mt-1">Ecosystem Command Center</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Draft/Live Mode Switcher */}
          <div className="flex items-center space-x-2 bg-surface4 border border-border p-1.5 rounded-lg">
            <button
              onClick={() => setIsEditMode(false)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                !isEditMode ? 'bg-accent text-surface-color' : 'text-text-muted hover:text-text'
              }`}
            >
              LIVE VIEW
            </button>
            <button
              onClick={() => setIsEditMode(true)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors flex items-center ${
                isEditMode ? 'bg-amber-500 text-black' : 'text-text-muted hover:text-text'
              }`}
            >
              EDIT MODE
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface4 border border-border flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer outline-none text-text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Panel Content with Sidebar Tabs */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[200px] border-r border-border bg-surface2 p-4 flex flex-col space-y-2">
          {[
            { id: 1, label: 'Identity Matrix' },
            { id: 2, label: 'Media Pipeline' },
            { id: 3, label: 'API Gatekeeper' },
            { id: 4, label: 'Staging preview' },
            { id: 5, label: 'CMS Document' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`w-full text-left p-3 rounded-xl font-display text-sm font-bold tracking-wide transition-colors ${
                activeTab === t.id
                  ? 'bg-accent text-surface-color'
                  : 'text-text-muted hover:bg-surface4 hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Pages */}
        <div className="flex-grow p-6 overflow-y-auto bg-surface">
          {/* TAB 1: IDENTITY MATRIX */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-bold">Tab 1 — Identity Matrix Config</h3>
                <div className="flex space-x-1 bg-surface3 border border-border p-1 rounded">
                  {(['en', 'es', 'fr', 'zh', 'ja', 'ko'] as Locale[]).map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setActiveLocaleTab(loc)}
                      className={`px-2 py-0.5 text-xs font-mono rounded ${
                        activeLocaleTab === loc ? 'bg-accent text-surface-color' : 'text-text-muted'
                      }`}
                    >
                      {loc.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {!isEditMode ? (
                <div className="p-4 bg-surface2 border border-border rounded-xl text-text-muted text-xs">
                  ⚠️ Switch to <strong>EDIT MODE</strong> above to update values.
                </div>
              ) : (
                <div className="space-y-4 max-w-2xl">
                  {/* Name Input */}
                  <div>
                    <label className="block text-xs font-mono text-text-muted mb-1">COMPOSER NAME ({activeLocaleTab.toUpperCase()})</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={draftState?.name?.[activeLocaleTab] || ''}
                        onChange={(e) => {
                          const updated = { ...draftState?.name } as MultiLingual;
                          updated[activeLocaleTab] = e.target.value;
                          updateDraftField('name', updated);
                        }}
                        className="flex-grow bg-surface2 border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleAITranslate('name', draftState?.name?.[activeLocaleTab] || '')}
                        className="px-3 bg-surface4 border border-border text-xs font-mono hover:bg-surface3 rounded-lg"
                      >
                        AI Translate
                      </button>
                    </div>
                  </div>

                  {/* Tagline */}
                  <div>
                    <label className="block text-xs font-mono text-text-muted mb-1">ARTISTIC TAGLINE ({activeLocaleTab.toUpperCase()})</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={draftState?.tagline?.[activeLocaleTab] || ''}
                        onChange={(e) => {
                          const updated = { ...draftState?.tagline } as MultiLingual;
                          updated[activeLocaleTab] = e.target.value;
                          updateDraftField('tagline', updated);
                        }}
                        className="flex-grow bg-surface2 border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleAITranslate('tagline', draftState?.tagline?.[activeLocaleTab] || '')}
                        className="px-3 bg-surface4 border border-border text-xs font-mono hover:bg-surface3 rounded-lg"
                      >
                        AI Translate
                      </button>
                    </div>
                  </div>

                  {/* Biography */}
                  <div>
                    <label className="block text-xs font-mono text-text-muted mb-1">BIOGRAPHY ({activeLocaleTab.toUpperCase()})</label>
                    <div className="flex space-x-2">
                      <textarea
                        rows={4}
                        value={draftState?.biography?.[activeLocaleTab] || ''}
                        onChange={(e) => {
                          const updated = { ...draftState?.biography } as MultiLingual;
                          updated[activeLocaleTab] = e.target.value;
                          updateDraftField('biography', updated);
                        }}
                        className="flex-grow bg-surface2 border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleAITranslate('biography', draftState?.biography?.[activeLocaleTab] || '')}
                        className="px-3 bg-surface4 border border-border text-xs font-mono hover:bg-surface3 rounded-lg self-start"
                      >
                        AI Translate
                      </button>
                    </div>
                  </div>

                  {/* Staging actions */}
                  <div className="pt-4 flex space-x-4">
                    <button
                      onClick={commitDraft}
                      className="px-6 py-2.5 bg-accent text-surface-color font-mono text-xs font-bold rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      APPROVE & PUBLISH TO LIVE
                    </button>
                    <button
                      onClick={rollbackDraft}
                      className="px-6 py-2.5 bg-surface4 border border-border text-text-muted font-mono text-xs font-bold rounded-lg hover:text-text transition-colors"
                    >
                      DISCARD STAGED CHANGES
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MEDIA PIPELINE */}
          {activeTab === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-display font-bold">Tab 2 — Autonomous Media Ingestion Pipeline</h3>

              <div className="p-8 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center bg-surface2 hover:border-accent transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm font-display font-bold text-text">Drag and drop WAV/MP3 files or enter YouTube URLs</p>
                <p className="text-xs text-text-dim font-mono mt-1 uppercase tracking-wider">Supports files up to 50MB</p>
              </div>

              {currentJob && (
                <div className="p-4 bg-surface3 border border-border rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-accent uppercase tracking-widest">STAGE: {currentJob.status}</span>
                    <span>{currentJob.progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-surface4 rounded overflow-hidden">
                    <div style={{ width: `${currentJob.progress}%` }} className="h-full bg-accent transition-all duration-300" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: API GATEKEEPER */}
          {activeTab === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-display font-bold">Tab 3 — API Gatekeeper Hub</h3>
              <p className="text-xs text-text-muted font-body leading-relaxed max-w-xl">
                Credentials gerenciados pelo painel são criptografados dinamicamente no banco de dados usando <strong>AES-256-GCM</strong>.
              </p>

              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-xs font-mono text-text-muted mb-1">OPENAI DALL-E 3 IMAGE KEY (AI_IMAGE_GENERATION_KEY)</label>
                  <div className="flex space-x-2">
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={apiKeys.AI_IMAGE_GENERATION_KEY}
                      onChange={(e) => setApiKeys({ ...apiKeys, AI_IMAGE_GENERATION_KEY: e.target.value })}
                      className="flex-grow bg-surface2 border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => testKeyConnection('AI_IMAGE_GENERATION_KEY', apiKeys.AI_IMAGE_GENERATION_KEY)}
                      className="px-3 bg-surface4 border border-border text-xs font-mono hover:bg-surface3 rounded-lg"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-text-muted mb-1">OPENAI GPT-4O NARRATIVE KEY (LLM_NARRATIVE_API_KEY)</label>
                  <div className="flex space-x-2">
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={apiKeys.LLM_NARRATIVE_API_KEY}
                      onChange={(e) => setApiKeys({ ...apiKeys, LLM_NARRATIVE_API_KEY: e.target.value })}
                      className="flex-grow bg-surface2 border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => testKeyConnection('LLM_NARRATIVE_API_KEY', apiKeys.LLM_NARRATIVE_API_KEY)}
                      className="px-3 bg-surface4 border border-border text-xs font-mono hover:bg-surface3 rounded-lg"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveKeys}
                  className="px-6 py-2.5 bg-accent text-surface-color font-mono text-xs font-bold rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  SAVE & ENCRYPT KEYS
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: STAGING PREVIEW */}
          {activeTab === 4 && (
            <div className="space-y-6">
              <h3 className="text-xl font-display font-bold">Tab 4 — Theme Staging Preview</h3>
              <p className="text-xs text-text-muted">Explore simultaneously in Onyx, Cyber, and Minimal contexts.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Onyx */}
                <div className="bg-[#080808] text-[#F5F5F0] border border-[#2A2A2A] p-4 rounded-xl space-y-4">
                  <span className="font-mono text-[9px] text-[#D4AF37] tracking-wider uppercase">ONYX THEME</span>
                  <h4 className="font-display text-2xl font-bold text-[#D4AF37]">{draftState?.name?.[activeLocaleTab] || identity?.name?.[activeLocaleTab] || 'Composer'}</h4>
                  <p className="text-xs font-body text-[#888880] leading-relaxed line-clamp-4">{draftState?.biography?.[activeLocaleTab] || identity?.biography?.[activeLocaleTab] || 'Liner notes'}</p>
                </div>

                {/* Cyber */}
                <div className="bg-[#0A0A0F] text-[#E8E9F0] border border-[#2A2B33] p-4 rounded-xl space-y-4">
                  <span className="font-mono text-[9px] text-[#00F5D4] tracking-wider uppercase">CYBER THEME</span>
                  <h4 className="font-mono text-lg font-bold text-[#00F5D4]">{draftState?.name?.[activeLocaleTab] || identity?.name?.[activeLocaleTab] || 'Composer'}</h4>
                  <p className="text-xs font-mono text-[#6B6C75] leading-relaxed line-clamp-4">{draftState?.biography?.[activeLocaleTab] || identity?.biography?.[activeLocaleTab] || 'Liner notes'}</p>
                </div>

                {/* Minimal */}
                <div className="bg-[#F9F9F7] text-[#0A0A08] border border-[#D8D8D5] p-4 rounded-xl space-y-4">
                  <span className="font-mono text-[9px] text-[#0A0A08] tracking-wider uppercase">MINIMAL THEME</span>
                  <h4 className="font-display text-2xl font-bold text-[#0A0A08]">{draftState?.name?.[activeLocaleTab] || identity?.name?.[activeLocaleTab] || 'Composer'}</h4>
                  <p className="text-xs font-body text-[#7A7A75] leading-relaxed line-clamp-4">{draftState?.biography?.[activeLocaleTab] || identity?.biography?.[activeLocaleTab] || 'Liner notes'}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CMS DOCUMENT ASSISTANT */}
          {activeTab === 5 && (
            <div className="space-y-6">
              <h3 className="text-xl font-display font-bold">Tab 5 — CMS Document Assistant</h3>
              <p className="text-xs text-text-muted">Upload revision notes, cue sheets, or delivery deadlines to automatically extract actionable lists.</p>

              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  id="assistant-upload"
                  className="hidden"
                  onChange={handleDocumentUpload}
                />
                <label
                  htmlFor="assistant-upload"
                  className="px-4 py-2 bg-surface4 border border-border text-xs font-mono rounded-lg cursor-pointer hover:bg-surface3"
                >
                  UPLOAD CUE SHEET / REVISIONS FILE
                </label>
              </div>

              {documentChecklist.length > 0 && (
                <div className="space-y-4 max-w-2xl">
                  {['TIMECODES', 'REVISIONS', 'DELIVERABLES', 'DEADLINES'].map((cat) => {
                    const items = documentChecklist.filter((c) => c.cat === cat);
                    if (items.length === 0) return null;

                    return (
                      <div key={cat} className="space-y-2">
                        <h4 className="text-xs font-mono text-accent tracking-widest">{cat}</h4>
                        <div className="space-y-1">
                          {items.map((it, idx) => (
                            <div key={idx} className="flex items-center space-x-3 p-2 bg-surface2 border border-border rounded-lg text-xs">
                              <input type="checkbox" checked={it.checked} readOnly className="rounded accent-accent" />
                              <span className="flex-grow">{it.item}</span>
                              <span className={`px-1.5 py-0.5 text-[9px] rounded font-mono uppercase ${
                                it.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-surface4 text-text-muted'
                              }`}>{it.priority}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
