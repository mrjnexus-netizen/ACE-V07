import React, { useState } from 'react';

interface AdminDashboardProps {
  onClose: () => void;
  initialTab?: number;
  requireAuth?: boolean;
}

const AdminDashboard = ({ onClose, initialTab = 1 }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<number>(initialTab);

  const tabs = [
    { id: 1, name: 'Tab 1: Hexa-Lingual Suite' },
    { id: 2, name: 'Tab 2: Asset Media Manager' },
    { id: 3, name: 'Tab 3: CMS Gateway Hub' },
    { id: 4, name: 'Tab 4: Settings & Configuration' },
    { id: 5, name: 'Tab 5: System Verification' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900">
        <h1 className="text-xl font-bold tracking-wider text-amber-500 font-mono">ACE ENGINE // ADMIN PORTAL</h1>
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors text-sm font-mono"
        >
          CLOSE [ESC]
        </button>
      </div>

      {/* Main Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="w-64 bg-neutral-900/50 border-r border-neutral-800 flex flex-col p-4 space-y-2">
          <div className="text-xs font-mono text-neutral-500 uppercase tracking-widest px-3 mb-2">Navigation</div>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2.5 rounded text-sm font-mono transition-all ${
                activeTab === tab.id
                  ? 'bg-amber-500/10 text-amber-500 border-l-2 border-amber-500 pl-4 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Content Panel */}
        <div className="flex-1 p-8 overflow-y-auto bg-neutral-950">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h2 className="text-2xl font-bold font-mono text-neutral-200">{tabs.find(t => t.id === activeTab)?.name}</h2>
              <span className="text-xs font-mono bg-neutral-800 text-amber-500 px-2 py-1 rounded">STATUS: READY</span>
            </div>

            {/* Tab Contents */}
            {activeTab === 1 && (
              <div className="space-y-4 bg-neutral-900/40 border border-neutral-800 p-6 rounded-lg">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Welcome to the Hexa-Lingual Suite. Here you can edit and synchronize multilingual strings across English (EN), Spanish (ES), French (FR), Chinese (ZH), Japanese (JA), and Korean (KO).
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
                    <span className="text-xs text-amber-500 font-mono">ACTIVE LOCALES</span>
                    <p className="text-lg font-bold mt-1">6 Active Locales</p>
                  </div>
                  <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
                    <span className="text-xs text-amber-500 font-mono">SYNC STATUS</span>
                    <p className="text-lg font-bold mt-1">Fully Synchronized</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 2 && (
              <div className="space-y-4 bg-neutral-900/40 border border-neutral-800 p-6 rounded-lg">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Decoupled Asset Media Manager. Manage visual media assets, including album artwork, video loops, and secondary graphic representations.
                </p>
                <div className="border-2 border-dashed border-neutral-800 rounded-lg p-12 text-center hover:border-amber-500/50 transition-colors cursor-pointer">
                  <p className="text-sm text-neutral-400">Drag & drop asset media files here, or click to upload</p>
                  <p className="text-xs text-neutral-600 mt-2">Supports JPG, PNG, MP4 up to 50MB</p>
                </div>
              </div>
            )}

            {activeTab === 3 && (
              <div className="space-y-4 bg-neutral-900/40 border border-neutral-800 p-6 rounded-lg">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Dynamic CMS API Gatekeeper Hub. Configure database entities, dynamic routes, and microservice bindings.
                </p>
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded font-mono text-xs text-neutral-400">
                  <div className="flex justify-between py-1 border-b border-neutral-800">
                    <span>GET /api/identity</span>
                    <span className="text-emerald-500">200 OK</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-neutral-800">
                    <span>PUT /api/identity</span>
                    <span className="text-emerald-500">200 OK</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>POST /api/pipeline/process</span>
                    <span className="text-amber-500">PENDING</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 4 && (
              <div className="space-y-4 bg-neutral-900/40 border border-neutral-800 p-6 rounded-lg">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Configure critical system keys, service credentials, external integrations, and behavior overrides.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-neutral-400 mb-1">API Key 1</label>
                    <input type="password" value="••••••••••••••••••••••••" readOnly className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-neutral-400 mb-1">API Key 2</label>
                    <input type="password" value="••••••••••••••••••••••••" readOnly className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 5 && (
              <div className="space-y-4 bg-neutral-900/40 border border-neutral-800 p-6 rounded-lg">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  System Diagnostics & Document Verification Assistant. Verify structural compliance across essential media files and documents.
                </p>
                <div className="p-4 bg-neutral-900/80 border border-neutral-800 rounded space-y-2 font-mono text-xs text-neutral-400">
                  <p className="flex items-center text-emerald-400">✓ Database status: Connected</p>
                  <p className="flex items-center text-emerald-400">✓ Environment configurations: Loaded</p>
                  <p className="flex items-center text-amber-400">⚠ Storage volume: 84% Capacity</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
