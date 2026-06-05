import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAudio } from '../context/AudioContext';
import { loadShader } from '../lib/shaderLoader';

// React ErrorBoundary: wraps entire Canvas
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error('AudioReactiveMesh WebGL Error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-black text-red-500 font-mono text-xs">
          WEBGL RENDER ERROR
        </div>
      );
    }
    return this.props.children;
  }
}

// Suspense fallback: MeshSkeletonLoader (animated dark placeholder)
const MeshSkeletonLoader = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#080808] animate-pulse min-h-[400px]">
    <div className="w-12 h-12 rounded-full border border-accent/20 border-t-accent animate-spin" />
  </div>
);

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

const ParticleSphere = ({ isVisibleRef }: { isVisibleRef: React.RefObject<boolean> }) => {
  const { audioState } = useAudio();
  const meshRef = useRef<THREE.Points | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const { gl: renderer } = useThree();
  const [vertexShader, setVertexShader] = useState<string>('');

  // Fetch mesh.vert shader asynchronously on mount using shaderLoader
  useEffect(() => {
    loadShader('/shaders/mesh.vert').then((code) => {
      if (code) {
        setVertexShader(code);
      }
    });
  }, []);

  // Mouse tracking with smooth lerp interpolation (inertia factor 0.05)
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetRotation.current.y = ((e.clientX / window.innerWidth) - 0.5) * Math.PI * 0.5;
      targetRotation.current.x = ((e.clientY / window.innerHeight) - 0.5) * Math.PI * 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

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
    uAudioData: { value: new Float32Array(128) },
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
    // IntersectionObserver: pause useFrame calculations/renders when canvas off-screen
    if (!isVisibleRef.current || !vertexShader) return;

    const time = state.clock.getElapsedTime();

    // Mouse tracking smooth lerp with inertia factor 0.05
    currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.05;
    currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.05;

    if (meshRef.current) {
      meshRef.current.rotation.x = currentRotation.current.x;
      meshRef.current.rotation.y = currentRotation.current.y;
    }

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

        // Populate uAudioData[128] uniform
        const audioData = u.uAudioData.value;
        const step = Math.floor(len / 128) || 1;
        for (let i = 0; i < 128; i++) {
          audioData[i] = (dataArray[i * step] ?? 0) / 255;
        }

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
          meshRef.current.rotation.y = time * 0.05 + currentRotation.current.y; // combine idle and mouse
        }
        if (u.uBassLevel) u.uBassLevel.value = 0;
        if (u.uMidLevel) u.uMidLevel.value = 0;
        if (u.uHighLevel) u.uHighLevel.value = 0;
        if (u.uOpacity) u.uOpacity.value = 0.35;
      }
    }
  });

  // Strict memory and GPU cleanup on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      if (materialRef.current) materialRef.current.dispose();
      renderer.dispose();
    };
  }, [geometry, renderer]);

  if (!vertexShader) return null;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  useEffect(() => {
    // IntersectionObserver: pause useFrame when canvas off-screen
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry?.isIntersecting ?? true;
    }, { threshold: 0.1 });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] relative bg-transparent">
      <ErrorBoundary>
        <Suspense fallback={<MeshSkeletonLoader />}>
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]}>
            <ambientLight intensity={0.15} />
            <pointLight position={[10, 10, 10]} intensity={0.5} />
            <ParticleSphere isVisibleRef={isVisibleRef} />
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              enableDamping={true}
              dampingFactor={0.05}
              maxPolarAngle={Math.PI / 2}
              minPolarAngle={Math.PI / 2}
            />
          </Canvas>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default AudioReactiveMesh;
