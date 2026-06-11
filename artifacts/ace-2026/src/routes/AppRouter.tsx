import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import MainApp from '../pages/MainApp';

const AdminPage = lazy(() => import('../pages/AdminPage'));

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<Suspense fallback={null}><AdminPage /></Suspense>} />
        <Route path="*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
};