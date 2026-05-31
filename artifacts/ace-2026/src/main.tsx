import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/MainApp'; // Renamed App.tsx to MainApp.tsx
import './index.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { ChromaticProvider } from './context/ChromaticContext';
import { IdentityProvider } from './context/IdentityContext';
import { AudioProvider } from './context/AudioContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChromaticProvider>
      <IdentityProvider>
        <AudioProvider>
          <Router>
            <App />
          </Router>
        </AudioProvider>
      </IdentityProvider>
    </ChromaticProvider>
  </React.StrictMode>
);
