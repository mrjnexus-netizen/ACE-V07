import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/apiClient';
import AdminDashboard from '../components/AdminDashboard';

// Admin entry point: a small login gate. On success the server sets the
// auth cookies (httpOnly), after which the dashboard's API calls are authorized
// because apiClient sends credentials. No token is handled in the browser.
export default function AdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/auth/login', { username, password });
      setAuthed(true);
    } catch {
      setError('Login failed. Check your username and password.');
    } finally {
      setBusy(false);
    }
  };

  if (authed) {
    return <AdminDashboard onClose={() => navigate('/')} initialTab={1} />;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}
    >
      {/* soft ambient glow behind the panel, echoing the site's luxury ground */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 640,
          height: 640,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.14) 0%, rgba(var(--accent-rgb),0.05) 42%, transparent 72%)',
          filter: 'blur(2px)',
        }}
      />

      <form
        onSubmit={handleLogin}
        className="relative w-full max-w-sm p-9 rounded-2xl space-y-5"
        style={{
          backgroundColor: 'rgba(var(--surface2-rgb, 22,22,22), 0.6)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(var(--accent-rgb), 0.18)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(var(--accent-rgb),0.06)',
        }}
      >
        <div className="text-center mb-2">
          <span className="font-mono uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: 'var(--accent-color)' }}>
            Private Access
          </span>
          <h1
            className="font-display mt-2"
            style={{
              fontSize: '1.7rem',
              lineHeight: 1.1,
              background: 'linear-gradient(180deg, #F6E9BE 0%, #D9B45E 55%, #8A6A26 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            ACE Admin
          </h1>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted-color)' }}>
            Sign in to manage tracks, keys, and the pipeline.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="admin-login-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="admin-login-input"
          />
        </div>

        {error && (
          <p className="text-sm text-center" style={{ color: '#E38B7A' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !username || !password} className="btn btn--primary w-full justify-center">
          <span className="aura" aria-hidden />
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}