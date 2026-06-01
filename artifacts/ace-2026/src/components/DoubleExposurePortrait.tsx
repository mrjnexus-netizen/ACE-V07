import { useRef, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';

const DoubleExposurePortrait = () => {
  const { identity } = useIdentity();
  const { audioState } = useAudio();
  const { theme } = useChromatic();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const portraitUrl = identity?.portrait?.url;

  useEffect(() => {
    if (!portraitUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = portraitUrl;
    img.onload = () => {
      imageRef.current = img;
    };
  }, [portraitUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 500;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let wavePhase = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      // 1. Clear background based on theme surface color
      ctx.fillStyle = theme.id === 'minimal' ? '#F9F9F7' : '#080808';
      ctx.fillRect(0, 0, width, height);

      // Get audio data for animation reactions
      const analyser = audioState.analyserNode;
      let bassLevel = 0;
      if (analyser && audioState.isPlaying) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < 10; i++) sum += dataArray[i] ?? 0;
        bassLevel = sum / 10 / 255;
      }

      const bpm = audioState.currentTrack?.bpm || 80;
      const pulsePeriod = 60000 / bpm; // ms per beat
      const now = Date.now();
      const pulseScale = 1.0 + Math.sin((now / pulsePeriod) * Math.PI * 2) * 0.08;

      ctx.save();

      // 2. Draw Layer 1: Base Portrait
      const img = imageRef.current;
      if (img) {
        // Draw centered and cover-fit
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let dw = width;
        let dh = height;
        let dx = 0;
        let dy = 0;

        if (imgRatio > canvasRatio) {
          dw = height * imgRatio;
          dx = (width - dw) / 2;
        } else {
          dh = width / imgRatio;
          dy = (height - dh) / 2;
        }

        ctx.drawImage(img, dx, dy, dw, dh);

        // Apply filters depending on active theme
        if (theme.id === 'minimal') {
          // Desaturate grayscale
          ctx.globalCompositeOperation = 'color';
          ctx.fillStyle = 'gray';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        } else if (theme.id === 'cyber') {
          // Cyan tint
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(0, 245, 212, 0.2)';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          // High contrast onyx dark multiply boost
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(8, 8, 8, 0.3)';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // 3. Draw Layer 2: Procedural Music Motifs with proper Blend Mode
      if (theme.id === 'cyber') {
        ctx.globalCompositeOperation = 'screen';
      } else if (theme.id === 'minimal') {
        ctx.globalCompositeOperation = 'overlay';
      } else {
        ctx.globalCompositeOperation = 'multiply';
      }

      ctx.translate(width / 2, height / 2);
      ctx.scale(pulseScale, pulseScale);

      // Draw 5-line musical staves (procedural curves)
      ctx.strokeStyle = theme.id === 'minimal' ? '#1A1A18' : theme.id === 'cyber' ? '#00F5D4' : '#D4AF37';
      ctx.lineWidth = 1.0;
      ctx.globalAlpha = 0.15 + bassLevel * 0.4;

      for (let offset = -20; offset <= 20; offset += 10) {
        ctx.beginPath();
        wavePhase += 0.002;
        for (let xCoord = -width / 2; xCoord < width / 2; xCoord += 5) {
          const yCoord = Math.sin(xCoord * 0.01 + wavePhase) * 30 + offset;
          if (xCoord === -width / 2) {
            ctx.moveTo(xCoord, yCoord);
          } else {
            ctx.lineTo(xCoord, yCoord);
          }
        }
        ctx.stroke();
      }

      // Draw frequency bar spirals/radial visualizer
      ctx.beginPath();
      const radialBars = 36;
      for (let i = 0; i < radialBars; i++) {
        const angle = (i / radialBars) * Math.PI * 2;
        const radius = 100 + (audioState.isPlaying ? bassLevel * 40 : 0);
        const barHeight = 20 + Math.sin(i * 1.5 + wavePhase * 10) * 15 * (bassLevel + 0.5);

        const xStart = Math.cos(angle) * radius;
        const yStart = Math.sin(angle) * radius;
        const xEnd = Math.cos(angle) * (radius + barHeight);
        const yEnd = Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
      }
      ctx.stroke();

      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [portraitUrl, theme, audioState.isPlaying, audioState.currentTrack, audioState.analyserNode]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-black border border-border rounded-lg shadow-2xl">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default DoubleExposurePortrait;
