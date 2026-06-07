// ============================================================
// ACE-2026 — Application Bootstrap
// Blueprint Section 34: provider nesting order is MANDATORY.
// Order (outer → inner):
//   1. ChromaticProvider  — theme must be outermost
//   2. IdentityProvider   — locale + composer data
//   3. AudioProvider      — singleton audio engine
//   4. PipelineProvider   — AI pipeline state machine
//   5. StagingProvider    — draft / live toggle
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';

import { ChromaticProvider } from './context/ChromaticContext';
import { IdentityProvider } from './context/IdentityContext';
import { AudioProvider } from './context/AudioContext';
import { PipelineProvider } from './context/PipelineContext';
import { StagingProvider } from './context/StagingContext';
import { AppRouter } from './routes/AppRouter';

import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in document.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ChromaticProvider>
      <IdentityProvider>
        <AudioProvider>
          <PipelineProvider>
            <StagingProvider>
              <AppRouter />
            </StagingProvider>
          </PipelineProvider>
        </AudioProvider>
      </IdentityProvider>
    </ChromaticProvider>
  </React.StrictMode>,
);