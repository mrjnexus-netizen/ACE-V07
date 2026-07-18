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
      // 2026-07-17 (site-wide responsive audit, per Reza): the backing
      // buffer was set to the CSS pixel size 1:1, so on any high-DPI phone
      // (DPR 2-3, which is most phones today) the 1.5px line got upscaled
      // and read as blurry. Sizing the actual buffer at CSS-size * DPR and
      // scaling the drawing context back down keeps every draw call below
      // in plain CSS-pixel coordinates (no other changes needed) while the
      // GPU composites a full-resolution buffer.
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.parentElement?.clientWidth || 300;
      const cssHeight = 40; // Fixed CSS height for waveform
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
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

      // CSS-pixel dimensions, NOT canvas.width/height (those are now the
      // DPR-scaled backing-buffer size) -- ctx's transform already maps
      // these back up to the real buffer, so every coordinate below stays
      // in the same simple space it always was.
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      // clearRect must cover the FULL backing buffer, not just the CSS
      // size, or old pixels persist in the DPR-scaled margin) -- easiest
      // correct way is to clear in raw device-pixel space via a fresh
      // identity transform, then restore ours for drawing.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

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
