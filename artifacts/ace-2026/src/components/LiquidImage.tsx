import { useEffect, useRef, useCallback, useState } from 'react';
import { useSpring } from 'framer-motion';

interface LiquidImageProps {
  src: string;
  alt?: string;
  className?: string;
}

const vertexShader = `
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uHoverState;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float wave = sin(vUv.y * 20.0 + uTime * 5.0) * cos(vUv.x * 20.0 + uTime * 4.0);
    float distortion = uHoverState * 0.04;
    vec2 distortedUv = vUv + vec2(wave * distortion, wave * distortion * 0.8);
    gl_FragColor = texture2D(uTexture, distortedUv);
  }
`;

export const LiquidImage = ({ src, alt = '', className = '' }: LiquidImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const hoverState = useSpring(0, { stiffness: 100, damping: 30 });
  const timeRef = useRef(0);
  const frameRef = useRef<number>(0);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const compileShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }
    return shader;
  };

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    const uvLocation = gl.getAttribLocation(program, 'uv');
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;
    glRef.current = gl;
    programRef.current = program;
  }, []);

  const animate = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    timeRef.current += 0.016;
    const hoverValue = hoverState.get();

    gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'uTime'), timeRef.current);
    gl.uniform1f(gl.getUniformLocation(program, 'uHoverState'), hoverValue);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    frameRef.current = requestAnimationFrame(animate);
  }, [hoverState]);

  const handleContextLost = useCallback((e: Event) => {
    // Without preventDefault(), the browser treats this as a PERMANENT
    // loss and never fires 'webglcontextrestored' — the canvas just goes
    // blank forever. This is the same root cause documented in
    // useWebGLRecovery.ts and already fixed in VoronoiPortraitFilter.tsx;
    // this component uses a raw WebGL context (not react-three-fiber's
    // <Canvas>) so it needs its own handlers rather than that hook.
    e.preventDefault();
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
  }, []);

  const handleContextRestored = useCallback(() => {
    // Rebuild the whole pipeline (shaders/program/buffers/texture) against
    // the freshly-restored context, then re-upload the already-loaded
    // image and resume the render loop.
    initWebGL();
    const gl = glRef.current;
    const texture = textureRef.current;
    const img = imageRef.current;
    if (gl && texture && img) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }
    if (containerRef.current && !frameRef.current) {
      frameRef.current = requestAnimationFrame(animate);
    }
  }, [initWebGL, animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
    };
  }, [handleContextLost, handleContextRestored]);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setDimensions({ width: img.width, height: img.height });
      imageRef.current = img;
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!loaded) return;
    initWebGL();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (!frameRef.current) frameRef.current = requestAnimationFrame(animate);
        } else {
          if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
          }
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) observer.observe(containerRef.current);

    // Upload texture after WebGL is ready
    const upload = () => {
      const gl = glRef.current;
      const texture = textureRef.current;
      const img = imageRef.current;
      if (gl && texture && img) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (!frameRef.current) frameRef.current = requestAnimationFrame(animate);
      } else {
        setTimeout(upload, 50);
      }
    };
    upload();

    return () => {
      observer.disconnect();
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      if (textureRef.current) glRef.current?.deleteTexture(textureRef.current);
      if (programRef.current) glRef.current?.deleteProgram(programRef.current);
    };
  }, [loaded, initWebGL, animate]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => hoverState.set(1)}
      onMouseLeave={() => hoverState.set(0)}
      className={`relative overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full object-cover"
        style={{ willChange: 'transform' }}
      />
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ backgroundColor: 'var(--surface3-color)' }}
        />
      )}
    </div>
  );
};

export default LiquidImage;