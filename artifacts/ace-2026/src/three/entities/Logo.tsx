import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useChromatic } from '../../context/ChromaticContext';

const Logo = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { themeId } = useChromatic();

  const accentColor = useRef<THREE.Color>(new THREE.Color('#D4AF37'));

  // Update accent color on theme change
  if (typeof window !== 'undefined') {
    const root = document.documentElement;
    const color = getComputedStyle(root).getPropertyValue('--accent-color').trim() || '#D4AF37';
    accentColor.current = new THREE.Color(color);
  }

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      meshRef.current.rotation.z += 0.001;
      meshRef.current.rotation.x += 0.0005;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1.5, 0]}>
      <torusGeometry args={[0.4, 0.05, 16, 100]} />
      <meshStandardMaterial
        color={accentColor.current}
        emissive={accentColor.current}
        emissiveIntensity={0.3}
        metalness={0.8}
        roughness={0.2}
      />
    </mesh>
  );
};

export default Logo;
