import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioReactive } from '../../hooks/useAudioReactive';
import { useChromatic } from '../../context/ChromaticContext';
import { usePerformanceGuard } from '../../lib/performanceGuard';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBassLevel;
  uniform float uMidLevel;
  uniform float uHighLevel;
  uniform float uAudioData[128];
  attribute float aScale;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    float noise = sin(pos.x * 8.0 + uTime * 0.5) *
                  cos(pos.y * 8.0 + uTime * 0.3) *
                  sin(pos.z * 8.0 + uTime * 0.4);
    float displacement = uBassLevel * 0.4 * noise;
    float spread = 1.0 + uMidLevel * 0.3;
    pos = pos * spread + normalize(pos) * displacement;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aScale * (uHighLevel * 3.0 + 1.5) * (1.0 / -mvPosition.z);
    vAlpha = 0.8;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = 1.0 - (dist * 2.0);
    gl_FragColor = vec4(uColor, alpha * uOpacity);
  }
`;

const AudioSphere = () => {
  const meshRef = useRef<THREE.Points>(null);
  const { bassLevel, midLevel, highLevel } = useAudioReactive();
  const { themeId } = useChromatic();
  const { particleCount } = usePerformanceGuard();

  const { positions, scales } = useMemo(() => {
    const count = particleCount || 8000;
    const pos = new Float32Array(count * 3);
    const scl = new Float32Array(count);
    const radius = 2.5;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      scl[i] = Math.random() * 0.5 + 0.5;
    }
    return { positions: pos, scales: scl };
  }, [particleCount]);

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    return geom;
  }, [positions, scales]);

  const accentColor = useMemo(() => {
    const root = document.documentElement;
    const color = getComputedStyle(root).getPropertyValue('--accent-color').trim() || '#D4AF37';
    return new THREE.Color(color);
  }, [themeId]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBassLevel: { value: 0 },
    uMidLevel: { value: 0 },
    uHighLevel: { value: 0 },
    uColor: { value: accentColor },
    uOpacity: { value: 0.35 },
    uAudioData: { value: new Array(128).fill(0) },
  }), [accentColor]);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uBassLevel.value = bassLevel;
      material.uniforms.uMidLevel.value = midLevel;
      material.uniforms.uHighLevel.value = highLevel;
      const mixColor = accentColor.clone();
      if (bassLevel > 0.7) {
        mixColor.lerp(new THREE.Color('white'), (bassLevel - 0.7) / 0.3);
      } else if (bassLevel > 0.3) {
        mixColor.lerp(new THREE.Color('white'), (bassLevel - 0.3) / 0.4);
      }
      material.uniforms.uColor.value = mixColor;
      material.uniforms.uOpacity.value = bassLevel > 0.3 ? 0.6 : 0.35;
      meshRef.current.rotation.y += 0.0005;
    }
  });

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export default AudioSphere;
