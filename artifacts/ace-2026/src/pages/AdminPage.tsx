import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/apiClient';
import AdminDashboard from '../components/AdminDashboard';

// Admin entry point: a small login gate. On success the server sets the
// auth cookies (httpOnly), after which the dashboard's API calls are authorized
// because apiClient sends credentials. No token is handled in the browser.
type LoginStep = 'credentials' | '2fa' | 'email';

export default function AdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ requires2FA?: boolean; requiresEmail?: boolean }>('/api/auth/login', { username, password });
      if (result?.requires2FA) setStep('2fa');
      else if (result?.requiresEmail) setStep('email');
      else setAuthed(true);
    } catch {
      setError('Login failed. Check your username and password.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const endpoint = step === '2fa' ? '/api/auth/2fa/login-verify' : '/api/auth/email/login-verify';
      const result = await apiPost<{ requiresEmail?: boolean }>(endpoint, { code });
      // A 2FA-only account finishes here. An account with BOTH 2FA and
      // email verification enabled gets chained straight to the email
      // step next — the backend decides the order, this just follows it.
      if (step === '2fa' && result?.requiresEmail) {
        setStep('email');
        setCode('');
      } else {
        setAuthed(true);
      }
    } catch {
      setError('Incorrect code. Please try again.');
      setCode('');
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
        onSubmit={step === 'credentials' ? handleLogin : handleVerifyCode}
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
            {step === '2fa'
              ? 'Enter the 6-digit code from your authenticator app.'
              : step === 'email'
              ? 'Enter the 6-digit code just emailed to you.'
              : 'Sign in to manage tracks, keys, and the pipeline.'}
          </p>
        </div>

        {step !== 'credentials' ? (
          <div className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoComplete="one-time-code"
              autoFocus
              className="admin-login-input text-center"
              style={{ letterSpacing: '0.5em', fontSize: '1.1rem' }}
            />
          </div>
        ) : (
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
        )}

        {error && (
          <p className="text-sm text-center" style={{ color: '#E38B7A' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (step !== 'credentials' ? code.length !== 6 : !username || !password)}
          className="w-full justify-center"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0.75em 1em', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: busy || (step !== 'credentials' ? code.length !== 6 : !username || !password) ? 'default' : 'pointer',
            opacity: busy || (step !== 'credentials' ? code.length !== 6 : !username || !password) ? 0.5 : 1,
            border: 'none', color: '#241A0C',
            background: 'linear-gradient(180deg, #F6E9BE 0%, #D4AF37 55%, #B8960C 100%)',
            boxShadow: '0 0 20px rgba(212,175,55,0.35)',
          }}
        >
          {busy ? (step !== 'credentials' ? 'Verifying…' : 'Signing in…') : (step !== 'credentials' ? 'Verify' : 'Sign In')}
        </button>

        {step !== 'credentials' && (
          <button
            type="button"
            onClick={() => { setStep('credentials'); setCode(''); setError(null); }}
            className="w-full text-center text-xs"
            style={{ color: '#A79B85', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}