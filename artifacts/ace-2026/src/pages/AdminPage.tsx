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
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--surface-color, #0a0a0a)', color: 'var(--text-color, #ffffff)' }}
    >
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm p-8 rounded-2xl space-y-4"
        style={{ backgroundColor: 'var(--surface2-color, #161616)', border: '1px solid var(--border-color, #333333)' }}
      >
        <h1 className="text-xl font-semibold" style={{ color: 'var(--accent-color, #00e5c0)' }}>ACE Admin</h1>
        <p className="text-xs opacity-60">Sign in to manage tracks, keys, and the pipeline.</p>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full px-3 py-2 rounded outline-none text-sm"
          style={{ backgroundColor: 'var(--surface3-color, #222222)', color: 'var(--text-color, #ffffff)', border: '1px solid var(--border-color, #333333)' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded outline-none text-sm"
          style={{ backgroundColor: 'var(--surface3-color, #222222)', color: 'var(--text-color, #ffffff)', border: '1px solid var(--border-color, #333333)' }}
        />
        {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full py-2 rounded font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-color, #00e5c0)', color: 'var(--surface-color, #000000)' }}
        >
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}