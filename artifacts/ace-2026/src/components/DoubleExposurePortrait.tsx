import { useEffect, useRef, useCallback } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { useAudio } from '../context/AudioContext';

export default function DoubleExposurePortrait() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { composerIdentity } = useIdentity();
  const { themeId } = useChromatic();
  const { bassLevel } = useAudioReactive();
  const { audioState } = useAudio();
  const animationRef = useRef<number>(0);

  const bpm = audioState.currentTrack?.bpm ?? 80;

  const portraitUrl = composerIdentity?.portrait?.url;

  const applyThemeTreatment = useCallback((ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) => {
    ctx.drawImage(img, 0, 0, w, h);

    if (themeId === 'onyx') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = 0.3;
      ctx.fillRect(0, 0, w, h);
    } else if (themeId === 'cyber') {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = '#00F5D4';
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }, [themeId]);

  const drawMotifs = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => {
    const motifOpacity = Math.min(0.5, bassLevel * 0.8);
    ctx.save();
    ctx.globalAlpha = motifOpacity;

    const strokeColor = themeId === 'onyx' ? '#D4AF37' : themeId === 'cyber' ? '#00F5D4' : '#1A1A18';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;

    // Blend mode per theme
    ctx.globalCompositeOperation = themeId === 'onyx' ? 'multiply' : themeId === 'cyber' ? 'screen' : 'overlay';

    // Staff lines (5 horizontal lines)
    const lineSpacing = h / 8;
    for (let i = 0; i < 5; i++) {
      const y = h * 0.2 + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Treble clef (simplified)
    ctx.beginPath();
    ctx.arc(w * 0.1, h * 0.3, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Sinusoidal waveform
    const freq = bpm / 60; // cycles per second
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h * 0.6 + Math.sin(x * 0.02 + time * freq * Math.PI * 2) * 30;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Musical notes (eighth notes)
    for (let i = 0; i < 6; i++) {
      const x = w * (0.2 + i * 0.12);
      const y = h * 0.7 + Math.sin(time * freq * Math.PI * 2 + i) * 15;
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 6, y - 25);
      ctx.stroke();
    }

    // Vinyl groove spiral
    ctx.beginPath();
    const cx = w * 0.8, cy = h * 0.5;
    for (let r = 10; r < 50; r += 2) {
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.stroke();

    ctx.restore();
  }, [bassLevel, bpm, themeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let img: HTMLImageElement | null = null;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      if (!ctx || !canvas) return;

      const time = performance.now() / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Null state: pure background
      if (!portraitUrl) {
        ctx.fillStyle = themeId === 'minimal' ? '#F9F9F7' : '#080808';
        ctx.fillRect(0, 0, w, h);
      } else if (img && img.complete && img.naturalWidth > 0) {
        applyThemeTreatment(ctx, img, w, h);
      }

      if (img && (!img.complete || img.naturalWidth === 0)) {
        // Image not yet loaded, still draw motifs on dark/light canvas
        ctx.fillStyle = themeId === 'minimal' ? '#F9F9F7' : '#080808';
        ctx.fillRect(0, 0, w, h);
      }

      drawMotifs(ctx, w, h, time);

      animationRef.current = requestAnimationFrame(draw);
    };

    if (portraitUrl) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Initial draw after image load
      };
      img.src = portraitUrl;
    }

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [portraitUrl, themeId, bassLevel, bpm, applyThemeTreatment, drawMotifs]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}