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
      style={{ backgroundColor: '#0B0906', color: '#F4F1EA' }}
    >
      {/* soft ambient glow behind the panel, echoing the site's luxury ground.
          2026-07-13 (per Reza): this whole screen is now a FIXED dark-gold
          "vault" look, independent of whichever theme (onyx/cyber/minimal)
          happens to be live on the public site — it previously read
          var(--surface-color)/var(--accent-color), so it silently broke
          (near-invisible inputs, a hardcoded gray panel from a --surface2-rgb
          variable that was never actually defined anywhere) whenever the
          live theme wasn't onyx. One deliberate brand look for the gate,
          always, regardless of what visitors currently see. */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 640,
          height: 640,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.05) 42%, transparent 72%)',
          filter: 'blur(2px)',
        }}
      />

      <form
        onSubmit={handleLogin}
        className="relative w-full max-w-sm p-9 rounded-2xl space-y-5"
        style={{
          backgroundColor: 'rgba(20,17,12,0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(212,175,55,0.2)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(212,175,55,0.08)',
        }}
      >
        <div className="text-center mb-2">
          <span className="font-mono uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: '#D4AF37' }}>
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
          <p className="text-xs mt-2" style={{ color: '#A79B85' }}>
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

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full justify-center"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0.75em 1em', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em',
            textTransform: 'uppercase', cursor: busy || !username || !password ? 'default' : 'pointer',
            opacity: busy || !username || !password ? 0.5 : 1,
            border: 'none', color: '#241A0C',
            background: 'linear-gradient(180deg, #F6E9BE 0%, #D4AF37 55%, #B8960C 100%)',
            boxShadow: '0 0 20px rgba(212,175,55,0.35)',
          }}
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}