import { useRef, useEffect } from 'react';
import { useAudio } from '../context/AudioContext';
import { useAudioReactive } from '../hooks/useAudioReactive';

interface WaveformRendererProps {
  color?: string;
}

const WaveformRenderer = ({ color }: WaveformRendererProps) => {
  const { audioState } = useAudio();
  const { timeDomainData } = useAudioReactive();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 40; // Fixed height for waveform
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const bufferLength = timeDomainData.length;
      const hasAudio = audioState.isPlaying && bufferLength > 0;

      ctx.beginPath();
      if (hasAudio) {
        for (let i = 0; i < bufferLength; i++) {
          const sample = timeDomainData[i] ?? 0;
          const x = (i / bufferLength) * width;
          const y = (sample * 0.8 + 0.5) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      } else {
        // Null-safe: renders flat centerline when no audio
        for (let i = 0; i < width; i++) {
          const x = i;
          const y = height / 2;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.strokeStyle = color || audioState.dominantColors?.vibrant || 'var(--accent-color)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw Playhead: 1px vertical line at currentTime/duration ratio, accent-color
      if (audioState.duration > 0) {
        const playheadX = (audioState.currentTime / audioState.duration) * width;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.strokeStyle = 'var(--accent-color)';
        ctx.lineWidth = 1.0; // 1px vertical line
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [timeDomainData, audioState.isPlaying, audioState.currentTime, audioState.duration, color, audioState.dominantColors]);

  return (
    <div className="w-full h-[40px] relative">
      <canvas ref={canvasRef} className="w-full h-full block cursor-pointer" />
    </div>
  );
};

export default WaveformRenderer;
