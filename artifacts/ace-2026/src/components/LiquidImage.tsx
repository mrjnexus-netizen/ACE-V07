import React, { useRef, useState, useEffect } from 'react';

interface LiquidImageProps {
  src: string;
  alt: string;
  className?: string;
}

const LiquidImage = ({ src, alt, className = '' }: LiquidImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (error) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      imageRef.current = img;
    };
    img.onerror = () => {
      setError(true);
    };
  }, [src, error]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || error || !imageRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 300);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 300);

    let animationFrameId: number;
    let time = 0;
    let hoverProgress = 0;

    const draw = () => {
      time += 0.05;
      if (hovered) {
        hoverProgress += (1 - hoverProgress) * 0.1;
      } else {
        hoverProgress += (0 - hoverProgress) * 0.1;
      }

      ctx.clearRect(0, 0, width, height);

      const img = imageRef.current;
      if (img) {
        // Draw image with dynamic wave distortion to simulate liquid tension
        const sliceCount = 30;
        for (let i = 0; i < sliceCount; i++) {
          const sy = (i / sliceCount) * height;
          const sh = height / sliceCount;

          // Wave equation
          const distortion = Math.sin(time + (i / sliceCount) * Math.PI * 4) * 15 * hoverProgress;

          ctx.drawImage(
            img,
            0, sy, img.width, img.height / sliceCount,
            distortion, sy, width, sh
          );
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [hovered, error, src]);

  if (error || !src) {
    return <img src={src} alt={alt} className={className} />;
  }

  return (
    <div
      className={`relative overflow-hidden w-full h-full ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <canvas ref={canvasRef} className="w-full h-full object-cover block" />
      {/* Hidden fallback image for SEO and accessibility */}
      <img src={src} alt={alt} className="sr-only" />
    </div>
  );
};

export default LiquidImage;
