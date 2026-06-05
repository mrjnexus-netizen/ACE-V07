import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext';

// Simple Spinner component
const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-black text-accent font-mono text-sm uppercase tracking-widest">
    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
    Loading Ecosystem...
  </div>
);

// Basic ErrorBoundary fallback component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('AppRouter Route Error Boundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-red-500 font-mono text-xs p-6 text-center">
          <h2>CRITICAL ENGINE FAULT DETECTED</h2>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 border border-red-500 rounded hover:bg-red-500/10">
            HOT RESTART
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy loaded components with React.lazy
const LinguisticPortal = React.lazy(() => import('../components/LinguisticPortal'));
const MainApp = React.lazy(() => import('../pages/MainApp'));
const AdminDashboard = React.lazy(() => import('../components/AdminDashboard'));

const AppRouter = () => {
  const { locale } = useIdentity();

  // Null-First language check: if locale is unset/null, force LinguisticPortal selection
  const hasLocale = !!locale;

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* '/' route loads LinguisticPortal if locale is unset/null, else redirects to App */}
        <Route
          path="/"
          element={
            <ErrorBoundary>
              {!hasLocale ? (
                <LinguisticPortal 
                  onLanguageSelect={() => window.location.href = '/app'} 
                  onTransitionComplete={() => {}}
                />
              ) : (
                <Navigate to="/app" replace />
              )}
            </ErrorBoundary>
          }
        />

        {/* '/app' route requires locale; redirects to '/' if unset */}
        <Route
          path="/app"
          element={
            <ErrorBoundary>
              {hasLocale ? <MainApp /> : <Navigate to="/" replace />}
            </ErrorBoundary>
          }
        />

        {/* '/admin' route leads directly to AdminDashboard (authGuard can be handled here or inside component) */}
        <Route
          path="/admin"
          element={
            <ErrorBoundary>
              <AdminDashboard onClose={() => window.location.href = '/app'} />
            </ErrorBoundary>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
