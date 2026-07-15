import { useLayoutEffect, useRef } from 'react';

/**
 * useBalancedText v5 (wgBalance-v5) — deterministic tidy paragraphs in EVERY
 * browser, desktop and mobile:
 *
 *   1. text-align (justify by default, 'center' opt-in via the align
 *      param — 2026-07-14 per Reza: a sitewide switch to 'center' broke
 *      several paragraphs that were correct with 'justify' — About's bio
 *      copy, the Cinema/Ambiant concept captions. Only ONE call site
 *      (TrackCaption, the carousel's focus caption) actually needed
 *      centering; every other caller keeps the original justify behavior
 *      by not passing this param).
 *   2. binary-searched max-width -> the LAST line is never a lonely widow
 *      word: the block is narrowed to the tightest width that keeps the
 *      natural line count, spreading words evenly onto the final line.
 *
 * Fixes over v2 (why v2 appeared to do nothing):
 *   - FONT LOADING RACE: metrics were measured against the fallback font,
 *     before the real webfonts (Cormorant/Cinzel/Inter) arrived; the "fixed"
 *     layout was computed for a font that then got swapped out. Now we
 *     re-balance on document.fonts.ready AND on every font loadingdone event.
 *   - Re-asserts after EVERY render (depless useLayoutEffect), so React
 *     re-applying a JSX style={{maxWidth:'46ch'}} can never undo us.
 *   - Re-balances on element resize, parent resize, and window resize
 *     (covers mobile rotation + ScaleStage scale changes).
 *   - Sets data-wg-balance="v3" on the element so it is VERIFIABLE in
 *     DevTools that the hook really ran on the deployed build.
 */
export function useBalancedText<T extends HTMLElement>(align: 'justify' | 'center' = 'justify') {
  const ref = useRef<T | null>(null);
  // Reza (2026-07-12) — Performance profile showed balanceNow() at 25.5%
  // of total main-thread time, with Range.getClientRects() (its
  // reflow-forcing measurement) at 19%. Root cause: the depless
  // useLayoutEffect below re-ran the full 12-step forced-reflow binary
  // search on EVERY render of every component using this hook — several
  // of which (ComposerPresence's rotating banner, SpatialScrollEngine's
  // per-frame scroll loop) re-render constantly, even when the text and
  // container width hadn't actually changed. Cache the last computed
  // result keyed on (containerWidth + text content); if unchanged, just
  // reapply the cached maxWidth (a plain style write, no measurement) —
  // still defends against React stomping the style on re-render, at a
  // fraction of the cost.
  const cacheRef = useRef<{ key: string; maxWidth: string } | null>(null);

  // Re-assert after every single render/commit — but cheaply (see above).
  useLayoutEffect(() => {
    balanceNow(ref.current, cacheRef, align);
  });

  // One-time listeners: fonts, resizes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => balanceNow(ref.current, cacheRef, align, true));
    };

    // Re-run once all webfonts are in (the v2 killer).
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(schedule).catch(() => {});
      document.fonts.addEventListener?.('loadingdone', schedule);
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.removeEventListener?.('loadingdone', schedule);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

function balanceNow(
  el: HTMLElement | null,
  cacheRef: { current: { key: string; maxWidth: string } | null },
  align: 'justify' | 'center',
  forceRecompute = false
) {
  if (!el || typeof document === 'undefined') return;
  const parent = el.parentElement;
  if (!parent) return;

  // 1) Center (opt-in) or justify (default) — see the top-of-file note on
  // why this is a per-call-site choice, not a global default.
  el.style.textAlign = align;
  el.dataset.wgBalance = 'v5';
  el.dataset.wgBalance = 'v4';

  // offsetWidth = LAYOUT pixels, immune to ancestor transform:scale().
  // getBoundingClientRect() returns VISUAL (scaled) pixels - inside a
  // ScaleStage that mismatch made the computed max-width wrong (same class
  // of bug as the vh-inside-ScaleStage lesson from the portal work).
  const containerWidth = parent.offsetWidth || parent.getBoundingClientRect().width;
  if (!containerWidth) return;

  // Cheap key (no forced reflow beyond the single width read above) — if
  // neither the container width nor the text itself changed since the
  // last time we actually measured, just reapply the cached result
  // instead of re-running the 12-step forced-reflow binary search below.
  const key = `${Math.round(containerWidth)}:${el.textContent ?? ''}`;
  const cached = cacheRef.current;
  if (!forceRecompute && cached && cached.key === key) {
    el.style.maxWidth = cached.maxWidth;
    return;
  }

  const lineCount = (): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  };

  // 2) Widow-kill via balanced max-width.
  el.style.maxWidth = 'none';
  const naturalLines = lineCount();
  if (naturalLines <= 1) {
    cacheRef.current = { key, maxWidth: 'none' };
    return; // single line — nothing to balance
  }

  let lo = Math.max(40, containerWidth * 0.28);
  let hi = containerWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    el.style.maxWidth = `${mid}px`;
    if (lineCount() > naturalLines) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const finalMaxWidth = `${Math.ceil(hi)}px`;
  el.style.maxWidth = finalMaxWidth;
  cacheRef.current = { key, maxWidth: finalMaxWidth };
}
