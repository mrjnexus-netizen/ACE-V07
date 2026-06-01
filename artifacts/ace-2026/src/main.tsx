import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/MainApp';
import './index.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { ChromaticProvider } from './context/ChromaticContext';
import { IdentityProvider } from './context/IdentityContext';
import { AudioProvider } from './context/AudioContext';
import { PipelineProvider } from './context/PipelineContext';
import { StagingProvider } from './context/StagingContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChromaticProvider>
      <IdentityProvider>
        <AudioProvider>
          <PipelineProvider>
            <StagingProvider>
              <Router>
                <App />
              </Router>
            </StagingProvider>
          </PipelineProvider>
        </AudioProvider>
      </IdentityProvider>
    </ChromaticProvider>
  </React.StrictMode>
);
