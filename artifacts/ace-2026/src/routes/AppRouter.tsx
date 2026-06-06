import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spinner } from '../components/Spinner';

const LinguisticPortal = lazy(() => import('../components/LinguisticPortal'));
const MainApp = lazy(() => import('../pages/MainApp'));
const AdminDashboard = lazy(() => import('../components/AdminDashboard'));

export const AppRouter = () => {
  const locale = localStorage.getItem('ace-locale');

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-surface"><Spinner size="lg" /></div>}>
        <Routes>
          <Route path="/" element={!locale ? <LinguisticPortal /> : <Navigate to="/app" replace />} />
          <Route path="/app" element={<MainApp />} />
          <Route path="/admin" element={<AdminDashboard onClose={() => window.history.back()} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};