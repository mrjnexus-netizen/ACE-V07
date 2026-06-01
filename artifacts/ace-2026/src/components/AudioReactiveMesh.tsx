import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAudio } from '../context/AudioContext';

// Inline Shaders
const vertexShader = `
  uniform float uTime;
  uniform float uBassLevel;
  uniform float uMidLevel;
  uniform float uHighLevel;
  attribute float aScale;
  varying vec3 vPosition;

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
    gl_PointSize = aScale * (uHighLevel * 3.0 + 1.5) *
                   (1.0 / -mvPosition.z);
    vPosition = position;
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = 1.0 - (dist * 2.0);
    gl_FragColor = vec4(uColor, alpha * uOpacity);
  }
`;

const ParticleSphere = () => {
  const { audioState } = useAudio();
  const meshRef = useRef<THREE.Points | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const particleCount = useMemo(() => {
    const width = window.innerWidth;
    if (width < 768) return 2000;  // Mobile
    if (width < 1024) return 4000; // Tablet
    return 8000;                   // Desktop
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const scales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Uniform distribution on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 2.5;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      scales[i] = 0.5 + Math.random() * 2.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    return geo;
  }, [particleCount]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBassLevel: { value: 0 },
    uMidLevel: { value: 0 },
    uHighLevel: { value: 0 },
    uColor: { value: new THREE.Color('#D4AF37') },
    uOpacity: { value: 0.35 },
  }), []);

  // Update theme accent color into uniforms
  useEffect(() => {
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#D4AF37';
    uniforms.uColor.value.set(accentColor);
  }, [uniforms]);

  // Audio analysis variables
  const analyser = audioState.analyserNode;
  const dataArray = useMemo(() => (analyser ? new Uint8Array(analyser.frequencyBinCount) : null), [analyser]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (materialRef.current && materialRef.current.uniforms) {
      const u = materialRef.current.uniforms;
      if (u.uTime) u.uTime.value = time;

      if (analyser && dataArray && audioState.isPlaying) {
        analyser.getByteFrequencyData(dataArray);

        // Process frequency bands
        let bass = 0;
        let mid = 0;
        let high = 0;

        const len = dataArray.length;
        // Bass: 0-10 bins
        for (let i = 0; i < 10; i++) {
          bass += dataArray[i] ?? 0;
        }
        bass = bass / 10 / 255;

        // Mid: 10-100 bins
        const midEnd = Math.min(100, len);
        for (let i = 10; i < midEnd; i++) {
          mid += dataArray[i] ?? 0;
        }
        mid = mid / (midEnd - 10) / 255;

        // High: 100-512 bins
        const highEnd = Math.min(512, len);
        for (let i = 100; i < highEnd; i++) {
          high += dataArray[i] ?? 0;
        }
        high = high / (highEnd - 10) / 255;

        if (u.uBassLevel) u.uBassLevel.value = bass;
        if (u.uMidLevel) u.uMidLevel.value = mid;
        if (u.uHighLevel) u.uHighLevel.value = high;

        // Color flash on bass peak
        if (bass > 0.75) {
          if (u.uColor) u.uColor.value.set('#FFFFFF');
          if (u.uOpacity) u.uOpacity.value = 0.9;
        } else {
          const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#D4AF37';
          if (u.uColor) u.uColor.value.set(accentColor);
          if (u.uOpacity) u.uOpacity.value = 0.35 + bass * 0.5;
        }
      } else {
        // Idle breathing state (Uniform scale 0.95 to 1.05, 4s ease loop)
        const breathe = 1.0 + Math.sin(time * Math.PI * 0.5) * 0.05;
        if (meshRef.current) {
          meshRef.current.scale.set(breathe, breathe, breathe);
          meshRef.current.rotation.y = time * 0.05; // slow idle rotation
        }
        if (u.uBassLevel) u.uBassLevel.value = 0;
        if (u.uMidLevel) u.uMidLevel.value = 0;
        if (u.uHighLevel) u.uHighLevel.value = 0;
        if (u.uOpacity) u.uOpacity.value = 0.35;
      }
    }
  });

  // Strict memory cleanup
  useEffect(() => {
    return () => {
      geometry.dispose();
      if (materialRef.current) materialRef.current.dispose();
    };
  }, [geometry]);

  return (
    <points ref={meshRef}>
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        ref={materialRef}
        attach="material"
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const AudioReactiveMesh = () => {
  return (
    <div className="w-full h-full min-h-[400px] relative bg-transparent">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]}>
        <ambientLight intensity={0.15} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <ParticleSphere />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping={true}
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
};

export default AudioReactiveMesh;
