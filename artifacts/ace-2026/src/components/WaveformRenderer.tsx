import { useRef, useEffect } from 'react';
import { useAudio } from '../context/AudioContext';

interface WaveformRendererProps {
  color?: string;
}

const WaveformRenderer = ({ color }: WaveformRendererProps) => {
  const { audioState } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioState.analyserNode;
    const bufferLength = analyser ? analyser.fftSize : 256;
    const dataArray = new Float32Array(bufferLength);

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 40;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (analyser && audioState.isPlaying) {
        analyser.getFloatTimeDomainData(dataArray);

        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
          const sample = dataArray[i] ?? 0;
          const x = (i / bufferLength) * width;
          const y = (sample * 0.8 + 0.5) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = color || audioState.dominantColors?.vibrant || 'var(--accent-color)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw Playhead
        if (audioState.duration > 0) {
          const playheadX = (audioState.currentTime / audioState.duration) * width;
          ctx.beginPath();
          ctx.moveTo(playheadX, 0);
          ctx.lineTo(playheadX, height);
          ctx.strokeStyle = 'var(--accent-color)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        // Flat centerline when idle/no audio
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = 'var(--border-color)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animationFrameIdRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [audioState.analyserNode, audioState.isPlaying, audioState.currentTime, audioState.duration, color, audioState.dominantColors]);

  return (
    <div className="w-full h-[40px] relative">
      <canvas ref={canvasRef} className="w-full h-full block cursor-pointer" />
    </div>
  );
};

export default WaveformRenderer;
