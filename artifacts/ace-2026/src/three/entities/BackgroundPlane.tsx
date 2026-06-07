import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useChromatic } from '../../context/ChromaticContext';

const BackgroundPlane = () => {
  const { themeId } = useChromatic();
  const { viewport } = useThree();

  const colorMap: Record<string, string> = {
    onyx: '#080808',
    cyber: '#0A0A0F',
    minimal: '#F9F9F7',
  };

  const color = colorMap[themeId] || '#080808';

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Subtle radial gradient
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 400);
    if (themeId === 'cyber') {
      gradient.addColorStop(0, '#0A0A0F');
      gradient.addColorStop(1, '#0D1520');
    } else if (themeId === 'minimal') {
      gradient.addColorStop(0, '#F9F9F7');
      gradient.addColorStop(1, '#F0F0EC');
    } else {
      gradient.addColorStop(0, '#080808');
      gradient.addColorStop(1, '#0F0F0F');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [themeId]);

  if (!texture) return null;

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[viewport.width * 2, viewport.height * 2]} />
      <meshBasicMaterial map={texture} color={color} />
    </mesh>
  );
};

export default BackgroundPlane;
