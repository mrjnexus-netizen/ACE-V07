import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import MainApp from '../pages/MainApp';
import { useSecretKnock } from '../hooks/useSecretKnock';
import SoundToggle from '../components/SoundToggle';

const AdminPage = lazy(() => import('../pages/AdminPage'));

// A1: mounted once, inside the Router context (useNavigate/useLocation
// need it) — renders nothing, just listens.
function SecretKnockListener() {
  useSecretKnock('/admin');
  return null;
}

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <SecretKnockListener />
      <Routes>
        <Route path="/admin" element={<Suspense fallback={null}><AdminPage /></Suspense>} />
        <Route
          path="*"
          element={
            <>
              <SoundToggle />
              <MainApp />
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};