import { Suspense, lazy } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { useSmoothScroll } from '../hooks/useSmoothScroll';
import { ErrorBoundary } from '../components/ErrorBoundary';
import BackgroundMusic from '../components/BackgroundMusic';

// Lazy-loaded components for code splitting
const LivingScore = lazy(() => import('../components/LivingScore'));
const LinguisticPortal = lazy(() => import('../components/LinguisticPortal'));
const GridLayoutEngine = lazy(() => import('../components/GridLayoutEngine'));
const ComposerPresence = lazy(() => import('../components/ComposerPresence'));
const MusicTime = lazy(() => import('../components/MusicTime'));
const DoubleExposurePortrait = lazy(() => import('../components/DoubleExposurePortrait'));
const SpatialScrollEngine = lazy(() => import('../components/SpatialScrollEngine'));
const WorksGallery = lazy(() => import('../components/WorksGallery'));
const PersistentAudioPlayer = lazy(() => import('../components/PersistentAudioPlayer'));
const ExecutiveStudioBot = lazy(() => import('../components/ExecutiveStudioBot'));
const MagneticCursor = lazy(() => import('../components/MagneticCursor'));
const Footer = lazy(() => import('../components/Footer'));

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

  // Global Lenis smooth scroll (safe: native scroll preserved if unavailable).
  useSmoothScroll();

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
      {/* Living Score â€” global fixed 3D particle field behind all content (S5) */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <LivingScore />
        </Suspense>
      </ErrorBoundary>

      {/* Per-language ambient bed (orb dances to it; ducks under site audio) */}
      <BackgroundMusic />

      {/* Foreground content sits above the 3D layer */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Hero Section - Grid Layout Engine (3 random variants) */}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <GridLayoutEngine />
          </Suspense>
        </ErrorBoundary>

        {/* Composer Presence - composer gallery (mixed aspect, tilt, parallax) */}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <ComposerPresence />
          </Suspense>
        </ErrorBoundary>

        {/* Music Time interlude (blueprint M1-M6) — standalone, own IntersectionObserver */}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <MusicTime />
          </Suspense>
        </ErrorBoundary>

        {/* Double Exposure Portrait */}
        <div data-reveal>
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <DoubleExposurePortrait />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Spatial Scroll Engine (Projects Timeline) */}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <SpatialScrollEngine />
          </Suspense>
        </ErrorBoundary>

        {/* Works (Section 03 - concept menu: Cinema / Game / Animation / ...) */}
        {/* No data-reveal wrapper: its scroll animation creates a stacking
            context that breaks the living-veil backdrop-filter, letting the
            particle field bleed over the content. */}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <WorksGallery />
          </Suspense>
        </ErrorBoundary>

        {/* Footer - was defined but never mounted anywhere in the app (2026-07-02 fix) */}
        <ErrorBoundary>
          <Suspense fallback={null}>
            <Footer />
          </Suspense>
        </ErrorBoundary>
      </div>

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
