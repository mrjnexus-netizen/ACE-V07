import { useEffect, useRef } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { useAudioReactive } from '../hooks/useAudioReactive';

export default function DoubleExposurePortrait() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { composerIdentity } = useIdentity();
  const { themeId } = useChromatic();
  const { bassLevel } = useAudioReactive();
  const animationRef = useRef<number>();

  const portraitUrl = composerIdentity?.portrait?.url;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let img: HTMLImageElement | null = null;

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else if (!portraitUrl) {
        const bg = themeId === 'minimal' ? '#F9F9F7' : '#080808';
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // procedural motifs (simplified)
      const time = Date.now() / 1000;
      const opacity = Math.min(0.5, bassLevel * 0.8);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = themeId === 'onyx' ? '#D4AF37' : themeId === 'cyber' ? '#00F5D4' : '#1A1A18';
      ctx.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
        const x = canvas.width * (i / 20);
        const y = canvas.height * (0.3 + Math.sin(time * 2 + i * 0.5) * 0.1);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x - 10, y);
        ctx.stroke();
      }
      ctx.restore();

      animationRef.current = requestAnimationFrame(draw);
    };

    if (portraitUrl) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = img!.naturalWidth;
        canvas.height = img!.naturalHeight;
        draw();
      };
      img.src = portraitUrl;
    } else {
      canvas.width = 800;
      canvas.height = 600;
      draw();
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [portraitUrl, themeId, bassLevel]);

  return <canvas ref={canvasRef} className="w-full h-full object-cover" />;
}