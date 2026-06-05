import { useEffect, RefObject } from "react";
import * as THREE from "three";

export const disposeGeometry = (geo: THREE.BufferGeometry) => {
  geo.dispose();
};

export const disposeMaterial = (mat: THREE.Material | THREE.Material[]) => {
  if (Array.isArray(mat)) {
    mat.forEach((m) => m.dispose());
  } else {
    mat.dispose();
  }
};

export const useWebGLContextGuard = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  renderer: THREE.WebGLRenderer | null
): void => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderer) return;

    let requestId: number | null = null;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("WebGL context lost. Warning code:", requestId);

      // Dispose of renderer resources to free up memory
      renderer.dispose();
    };

    const handleContextRestored = () => {
      console.log("WebGL context restored. Re-initializing...");
      // Geometries are re-initialized and textures are re-uploaded during normal React/Three re-rendering flow or application setup
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [canvasRef, renderer]);
};
