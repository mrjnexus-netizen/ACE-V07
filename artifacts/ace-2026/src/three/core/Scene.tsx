import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ReactNode, Suspense } from 'react';
import { Spinner } from '../../components/Spinner';
import PostProcessing from './PostProcessing';
import { useWebGLRecovery } from './useWebGLRecovery';

interface SceneProps {
  children?: ReactNode;
}

const Scene = ({ children }: SceneProps) => {
  const { canvasKey, onCreated } = useWebGLRecovery();
  return (
    <Suspense fallback={<Spinner size="lg" />}>
      <Canvas
        key={canvasKey}
        onCreated={onCreated}
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: true,
          toneMapping: 4, // ACESFilmicToneMapping
        }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <fog attach="fog" args={['#080808', 10, 50]} />
        <ambientLight intensity={0.1} />
        <directionalLight intensity={1.0} position={[5, 5, 5]} castShadow />
        <directionalLight intensity={0.2} position={[-5, 0, -5]} />
        <pointLight intensity={0.5} position={[-3, 3, 3]} />
        <OrbitControls dampingFactor={0.05} enableDamping enablePan={true} enableZoom={true} />
        {children}
        <PostProcessing />
      </Canvas>
    </Suspense>
  );
};

export default Scene;