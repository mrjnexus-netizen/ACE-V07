import { useCallback, useRef, useState } from 'react';

/**
 * WebGL context-loss recovery for @react-three/fiber canvases.
 *
 * When several <Canvas> elements (or React.StrictMode's dev double-mount)
 * exhaust the browser's WebGL context budget, the GPU drops the oldest
 * context. Without intervention the canvas FREEZES on its last frame
 * (e.g. the sphere stuck on its initial gold colour, never picking up the
 * active language accent).
 *
 * This hook:
 *  - calls preventDefault() on 'webglcontextlost' so the browser is allowed
 *    to restore the context instead of killing it permanently, and
 *  - remounts the <Canvas> (via a changing key) on 'webglcontextrestored'
 *    so R3F rebuilds the scene cleanly and re-reads the current theme/locale.
 *
 * Usage:
 *   const { canvasKey, onCreated } = useWebGLRecovery();
 *   <Canvas key={canvasKey} onCreated={onCreated} ... />
 */
type GLLike = { gl: { domElement: HTMLCanvasElement } };

export function useWebGLRecovery() {
  const [canvasKey, setCanvasKey] = useState(0);
  const bound = useRef(false);

  const onCreated = useCallback((state: GLLike) => {
    const canvas = state.gl.domElement;
    if (bound.current) return;
    bound.current = true;

    canvas.addEventListener(
      'webglcontextlost',
      (e: Event) => {
        // Allow the browser to restore the context rather than freezing.
        e.preventDefault();
      },
      false,
    );

    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        bound.current = false;
        // Force a fresh mount so the scene rebuilds with the current colours.
        setCanvasKey((k) => k + 1);
      },
      false,
    );
  }, []);

  return { canvasKey, onCreated };
}
