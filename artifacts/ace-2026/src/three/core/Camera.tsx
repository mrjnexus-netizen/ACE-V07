import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useScrollPosition } from '../../hooks/useSmoothScroll';

const CameraController = () => {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  useScrollPosition((scroll: number) => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? scroll / maxScroll : 0;
    camera.position.y = progress * -5;
  });

  useFrame(() => {
    mouse.current.x += (target.current.x - mouse.current.x) * 0.05;
    mouse.current.y += (target.current.y - mouse.current.y) * 0.05;
    camera.position.x = mouse.current.x * 0.3;
    camera.position.y += mouse.current.y * 0.1;
    camera.lookAt(0, camera.position.y * 0.5, 0);
  });

  return null;
};

export default CameraController;
