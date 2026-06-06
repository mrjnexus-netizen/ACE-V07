import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './routes/AppRouter';
import { ChromaticProvider } from './context/ChromaticContext';
import { IdentityProvider } from './context/IdentityContext';
import { AudioProvider } from './context/AudioContext';
import { PipelineProvider } from './context/PipelineContext';
import { StagingProvider } from './context/StagingContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
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
  </React.StrictMode>
);