// ============================================================
// ACE-2026 — BackgroundMusic
// Per-language ambient bed that the central orb dances to.
//
// Behaviour (all fades are smooth gain ramps):
//  - Plays /audio/bg-<locale>.mp3 (looping) while a language is active.
//  - Language switch  -> cross-fade (fade old out, swap, fade new in).
//  - A site track/media playing (audioState.isPlaying) -> duck to silence
//    + pause; when it stops -> fade back in + resume.
//  - Tab hidden (leaving the page) -> fade out + pause; returning -> fade in.
//  - Ceiling volume is 50% (BG_VOLUME), tweakable later from the admin panel.
//
// The orb reacts because the bed is routed into the SAME AnalyserNode the
// audio engine exposes (audioState.analyserNode). AudioContext.tsx is left
// untouched — we only ADD a source: bgEl -> bgGain -> analyser (-> dest).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { useIdentity } from '../context/IdentityContext';
import { useContent } from '../context/ContentContext';
import type { Locale } from '../types';

const BG_VOLUME = 0.5; // 50% ceiling (per request)
const FADE_MS = 1200;

const SUPPORTED = ['en', 'es', 'fr', 'ja', 'zh', 'ko'] as const;

// 2026-07-12 (per Reza — admin-manageable ambient tracks): each locale's
// bed is now a content-entry override (key: `ambient-track-<locale>`,
// type: 'audio', uploaded via the admin's new "Ambient Tracks" tab) with
// the original bundled /audio/bg-<locale>.mp3 as the fallback for any
// locale nothing has been uploaded for yet. Same two-tier
// override-then-default pattern EditableText/EditableImage already use
// everywhere else on the site — nothing new invented here.
function bgSrcFor(locale: string | null, resolve: (key: string, locale: Locale) => string | null): string | null {
  if (!locale) return null;
  const l = (SUPPORTED as readonly string[]).includes(locale) ? locale : 'en';
  const override = resolve(`ambient-track-${l}`, 'en');
  return override || `/audio/bg-${l}.mp3`;
}

export default function BackgroundMusic() {
  const { audioState } = useAudio();
  const { locale } = useIdentity();
  const { resolve } = useContent();

  const elRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const curSrcRef = useRef<string | null>(null);
  const swapTimer = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  const actx = audioState.audioContext;
  const analyser = audioState.analyserNode;
  const trackPlaying = audioState.isPlaying;

  // Smoothly ramp the bed gain toward a target (0 .. BG_VOLUME).
  const rampTo = (target: number) => {
    const ctx = audioState.audioContext;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + FADE_MS / 1000);
  };

  const allowed = (): boolean =>
    !!locale && !audioState.isPlaying && !audioState.isMuted && typeof document !== 'undefined' && !document.hidden;

  // 1) Wire bgEl -> bgGain -> analyser (once the engine's context exists).
  useEffect(() => {
    const el = elRef.current;
    if (!actx || !analyser || !el || gainRef.current) return;
    try {
      const src = actx.createMediaElementSource(el);
      const gain = actx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(analyser); // analyser -> destination already wired by the engine
      gainRef.current = gain;
      setReady(true);
    } catch {
      /* element already routed / unsupported */
    }
  }, [actx, analyser]);

  // 2) Language change (or an admin just published a new override) ->
  // cross-fade to the new bed.
  useEffect(() => {
    if (!ready) return;
    const el = elRef.current;
    const src = bgSrcFor(locale, resolve);
    if (!el || !src || curSrcRef.current === src) return;
    curSrcRef.current = src;

    rampTo(0); // fade current out
    if (swapTimer.current) window.clearTimeout(swapTimer.current);
    swapTimer.current = window.setTimeout(() => {
      el.src = src;
      el.loop = true;
      el.load();
      if (allowed()) {
        void el.play().catch(() => {});
        rampTo(BG_VOLUME); // fade new in
      }
    }, FADE_MS);

    return () => {
      if (swapTimer.current) window.clearTimeout(swapTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, ready, resolve]);

  // 3) Gate: play at ceiling only when visible, language set, no site track.
  useEffect(() => {
    if (!ready) return;
    const el = elRef.current;
    if (!el) return;

    const apply = () => {
      if (allowed()) {
        if (el.paused) void el.play().catch(() => {});
        rampTo(BG_VOLUME);
      } else {
        rampTo(0);
        window.setTimeout(() => {
          if (!allowed() && !el.paused) el.pause();
        }, FADE_MS);
      }
    };

    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locale, trackPlaying, audioState.isMuted]);

  return <audio ref={elRef} loop preload="auto" aria-hidden="true" />;
}
