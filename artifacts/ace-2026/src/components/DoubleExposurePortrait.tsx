import { useRef, useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useChromatic } from '../context/ChromaticContext';
import { useAudioReactive } from '../hooks/useAudioReactive';

const DoubleExposurePortrait = () => {
  const { identity } = useIdentity();
  const { audioState } = useAudio();
  const { theme } = useChromatic();
  const { bassLevel } = useAudioReactive();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const portraitUrl = identity?.portrait?.url;

  useEffect(() => {
    if (!portraitUrl) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = portraitUrl;
    img.onload = () => {
      imageRef.current = img;
    };
    img.onerror = () => {
      imageRef.current = null;
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

      // 1. NULL STATE background color clearing
      // portrait null -> ONYX/CYBER: pure black canvas; MINIMAL: pure ivory canvas
      const img = imageRef.current;
      if (!img) {
        ctx.fillStyle = theme.id === 'minimal' ? '#FFFFF0' : '#000000'; // ivory or black
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = theme.id === 'minimal' ? '#F9F9F7' : '#080808';
        ctx.fillRect(0, 0, width, height);
      }

      const bpm = audioState.currentTrack?.bpm || 80;
      const pulsePeriod = 60000 / bpm; // ms per beat
      const now = Date.now();
      // scale oscillates ±8% at BPM tempo
      const pulseScale = 1.0 + Math.sin((now / pulsePeriod) * Math.PI * 2) * 0.08;

      ctx.save();

      // 2. Draw Layer 1: Base Portrait
      if (img) {
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
          ctx.globalCompositeOperation = 'color';
          ctx.fillStyle = 'gray';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        } else if (theme.id === 'cyber') {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(0, 245, 212, 0.2)';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(8, 8, 8, 0.3)';
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // 3. Draw Layer 2: Procedural Music Motifs
      // Blend modes: ONYX='multiply' (gold motifs), CYBER='screen' (cyan motifs), MINIMAL='overlay' (dark motifs)
      if (theme.id === 'cyber') {
        ctx.globalCompositeOperation = 'screen';
      } else if (theme.id === 'minimal') {
        ctx.globalCompositeOperation = 'overlay';
      } else {
        ctx.globalCompositeOperation = 'multiply';
      }

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(pulseScale, pulseScale);

      // Colors & Opacity: Motif opacity increases with bassLevel
      const motifColor = theme.id === 'minimal' ? '#1A1A18' : theme.id === 'cyber' ? '#00F5D4' : '#D4AF37';
      ctx.strokeStyle = motifColor;
      ctx.fillStyle = motifColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.2 + bassLevel * 0.7; // reactive opacity

      wavePhase += 0.01;

      // Motif A: Staff lines (5-line staves) + Treble clef outlines
      ctx.save();
      ctx.translate(0, -120);
      // Staff lines
      for (let s = -20; s <= 20; s += 10) {
        ctx.beginPath();
        ctx.moveTo(-150, s);
        ctx.lineTo(150, s);
        ctx.stroke();
      }
      // Treble Clef outline (procedural drawing)
      ctx.beginPath();
      ctx.arc(0, 10, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -35);
      ctx.bezierCurveTo(20, -35, 15, -10, 0, 15);
      ctx.bezierCurveTo(-15, 25, -20, -5, 0, -35);
      ctx.stroke();
      ctx.restore();

      // Motif B: Piano keyboard silhouette
      ctx.save();
      ctx.translate(-100, 150);
      ctx.lineWidth = 1.0;
      // White keys
      for (let k = 0; k < 10; k++) {
        ctx.strokeRect(k * 20, 0, 20, 50);
      }
      // Black keys
      ctx.fillStyle = motifColor;
      for (let k = 0; k < 9; k++) {
        if (k !== 2 && k !== 6) {
          ctx.fillRect(k * 20 + 13, 0, 14, 30);
        }
      }
      ctx.restore();

      // Motif C: Sinusoidal waveform curves
      ctx.beginPath();
      for (let xCoord = -200; xCoord <= 200; xCoord += 5) {
        const yCoord = Math.sin(xCoord * 0.03 + wavePhase) * 20;
        if (xCoord === -200) {
          ctx.moveTo(xCoord, yCoord);
        } else {
          ctx.lineTo(xCoord, yCoord);
        }
      }
      ctx.stroke();

      // Motif D: Eighth/quarter note shapes
      ctx.save();
      ctx.translate(120, -50);
      // Quarter Note
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 6, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(7, -30);
      ctx.stroke();

      // Eighth Note
      ctx.translate(-50, 40);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 6, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(7, -30);
      ctx.lineTo(17, -20);
      ctx.stroke();
      ctx.restore();

      // Motif E: Frequency bar visualizations (radial layout)
      ctx.save();
      ctx.beginPath();
      const radialBars = 24;
      for (let i = 0; i < radialBars; i++) {
        const angle = (i / radialBars) * Math.PI * 2;
        const radius = 60 + bassLevel * 20;
        const barHeight = 15 + Math.sin(i * 1.5 + wavePhase) * 10;

        const xStart = Math.cos(angle) * radius;
        const yStart = Math.sin(angle) * radius;
        const xEnd = Math.cos(angle) * (radius + barHeight);
        const yEnd = Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
      }
      ctx.stroke();
      ctx.restore();

      // Motif F: Vinyl groove spiral paths
      ctx.save();
      ctx.beginPath();
      const numPoints = 120;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / 10) * Math.PI;
        const radius = (i * 0.5) + Math.sin(angle * 2 + wavePhase) * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();

      ctx.restore();
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
  }, [portraitUrl, theme, audioState.currentTrack, bassLevel]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-black border border-border rounded-lg shadow-2xl">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default DoubleExposurePortrait;
