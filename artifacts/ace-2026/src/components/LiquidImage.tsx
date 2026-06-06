import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';

interface LiquidImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export const LiquidImage = ({ src, alt = '', className = '' }: LiquidImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);
  const { ref: inViewRef, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inView) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const animate = (time: number) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const elapsed = (time - startTimeRef.current) / 1000;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const strength = hovered ? 0.015 : 0;
        const offsetX = Math.sin(elapsed * 5) * strength * img.width;
        const offsetY = Math.cos(elapsed * 4) * strength * img.height;
        ctx.drawImage(img, offsetX, offsetY, canvas.width, canvas.height);
        frameRef.current = requestAnimationFrame(animate);
      };
      frameRef.current = requestAnimationFrame(animate);
    };
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [src, inView, hovered]);

  return (
    <div
      ref={inViewRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={'relative overflow-hidden ' + className}
    >
      <canvas ref={canvasRef} className="w-full h-full object-cover" />
      {!inView && <div className="absolute inset-0 bg-surface animate-pulse" />}
    </div>
  );
};

export default LiquidImage;