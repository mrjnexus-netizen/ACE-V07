import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A1 — secret keystroke access (blueprint §5.A).
 * Anywhere on the site, at any moment, typing the exact string below
 * (no clicking, no visible affordance) opens the hidden admin route.
 *
 * - Truly global: does NOT ignore keystrokes while an input/textarea is
 *   focused (per Reza's explicit spec — "anywhere" means anywhere).
 * - Rolling buffer keeps only the last N characters (N = secret length),
 *   so the match is exact-suffix, not exact-position — no need to type
 *   it "from a clean slate".
 * - Buffer resets on every route change, so a partial match spanning a
 *   navigation can never accidentally complete later.
 * - Only single printable characters advance the buffer (`e.key.length
 *   === 1`) — modifier/navigation keys (Shift, Enter, arrows, etc.) are
 *   ignored rather than breaking the sequence.
 */
const SECRET = 'AmirMoslehi8328495053';

export function useSecretKnock(targetPath: string = '/admin') {
  const navigate = useNavigate();
  const location = useLocation();
  const bufferRef = useRef('');

  useEffect(() => {
    bufferRef.current = '';
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.length !== 1) return;
      const next = (bufferRef.current + e.key).slice(-SECRET.length);
      bufferRef.current = next;
      if (next === SECRET) {
        bufferRef.current = '';
        navigate(targetPath);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, targetPath]);
}
