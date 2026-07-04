import { useLayoutEffect, useRef } from 'react';

/**
 * useBalancedText v4 (wgBalance-v4) — deterministic tidy paragraphs in EVERY
 * browser, desktop and mobile:
 *
 *   1. text-align: justify  -> every line's LEFT and RIGHT edges are flush
 *      (the direct cure for ragged "aghab-jolo" line endings). Applied here
 *      in JS so no call-site style object can accidentally omit it.
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
export function useBalancedText<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  // Re-assert after every single render/commit.
  useLayoutEffect(() => {
    balanceNow(ref.current);
  });

  // One-time listeners: fonts, resizes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => balanceNow(ref.current));
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

function balanceNow(el: HTMLElement | null) {
  if (!el || typeof document === 'undefined') return;
  const parent = el.parentElement;
  if (!parent) return;

  // 1) Flush both edges — deterministic, zero browser dependence.
  el.style.textAlign = 'justify';
  // keep the very last line natural (browser default: start-aligned)
  el.dataset.wgBalance = 'v4';

  const lineCount = (): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  };

  // 2) Widow-kill via balanced max-width.
  el.style.maxWidth = 'none';
  // offsetWidth = LAYOUT pixels, immune to ancestor transform:scale().
  // getBoundingClientRect() returns VISUAL (scaled) pixels - inside a
  // ScaleStage that mismatch made the computed max-width wrong (same class
  // of bug as the vh-inside-ScaleStage lesson from the portal work).
  const containerWidth = parent.offsetWidth || parent.getBoundingClientRect().width;
  if (!containerWidth) return;

  const naturalLines = lineCount();
  if (naturalLines <= 1) return; // single line — nothing to balance

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
  el.style.maxWidth = `${Math.ceil(hi)}px`;
}
