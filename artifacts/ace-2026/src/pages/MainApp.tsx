import { Suspense, lazy } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Lazy-loaded components for code splitting
const LinguisticPortal = lazy(() => import('../components/LinguisticPortal'));
const GridLayoutEngine = lazy(() => import('../components/GridLayoutEngine'));
const DoubleExposurePortrait = lazy(() => import('../components/DoubleExposurePortrait'));
const SpatialScrollEngine = lazy(() => import('../components/SpatialScrollEngine'));
const Discography = lazy(() => import('../components/Discography'));
const PersistentAudioPlayer = lazy(() => import('../components/PersistentAudioPlayer'));
const ExecutiveStudioBot = lazy(() => import('../components/ExecutiveStudioBot'));
const MagneticCursor = lazy(() => import('../components/MagneticCursor'));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--surface-color)' }}>
      <div className="w-12 h-12 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accent-color)', borderTopColor: 'transparent' }} />
    </div>
  );
}

export default function MainApp() {
  const { locale, loading } = useIdentity();
  const { themeId } = useChromatic();

  // Show Linguistic Portal if locale not yet selected
  if (!locale) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <LinguisticPortal />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}>
      {/* Hero Section - Grid Layout Engine (3 random variants) */}
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <GridLayoutEngine />
        </Suspense>
      </ErrorBoundary>

      {/* Double Exposure Portrait */}
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <DoubleExposurePortrait />
        </Suspense>
      </ErrorBoundary>

      {/* Spatial Scroll Engine (Projects Timeline) */}
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <SpatialScrollEngine />
        </Suspense>
      </ErrorBoundary>

      {/* Discography (Section 03 - tracks grid + click to play) */}
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Discography />
        </Suspense>
      </ErrorBoundary>

      {/* Fixed UI: Persistent Audio Player */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <PersistentAudioPlayer />
        </Suspense>
      </ErrorBoundary>

      {/* Executive Studio Bot */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <ExecutiveStudioBot />
        </Suspense>
      </ErrorBoundary>

      {/* Magnetic Cursor (desktop only) */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <MagneticCursor />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}