import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import { LANGUAGE_WORLDS } from '../context/ChromaticContext';
import type { Locale } from '../types';

/**
 * VoronoiPortraitFilter (2026-07-10, per Reza's reference:
 * codepen.io/guillaumerxl/pen/JYBvBG) — a WebGL shader treatment that
 * breaks the photo into a fine voronoi-cell mosaic and tints it, using
 * the SAME per-language accent color already defined in
 * ChromaticContext.tsx (LANGUAGE_WORLDS) rather than the codepen's fixed
 * reddish sample — so the portrait's filter color changes language to
 * language exactly like every other accent-colored element on the site.
 *
 * Deliberately simplified from the reference in one way: the original
 * used a PerspectiveCamera + lit 3D plane with a vertex shader that
 * displaces the mesh by the voronoi field. That displacement is
 * invisible in practice there (the plane has only 4 vertices — default
 * PlaneGeometry segments — so "deforming" it barely does anything; the
 * actual voronoi-cell look entirely comes from the FRAGMENT shader,
 * which is preserved here close to verbatim). Replaced the camera/mesh
 * setup with a flat OrthographicCamera + fullscreen quad, which is the
 * standard, much simpler technique for a pure image-shader effect like
 * this and drops nothing visible.
 *
 * Also added: object-fit "cover" UV correction (the codepen sampled the
 * texture 1:1, fine for its own square canvas; our container's aspect
 * ratio differs from the source photo's, so this scales/centers the UVs
 * to crop-fill without stretching, the same visual behavior as
 * background-size: cover elsewhere in this app).
 *
 * v2 (2026-07-10, per Reza's review): the codepen's own default settings
 * (brightness 2, voronoise 500, full-strength color multiply) wash the
 * photo out almost entirely — added tintStrength/patternStrength uniforms
 * to blend the cell-pattern and the color tint toward the plain image
 * instead of fully replacing it, and lowered brightness/voronoise
 * defaults substantially. Also gated the render loop behind an
 * IntersectionObserver so this stops spending GPU cycles the moment it
 * scrolls off screen (see the perf note further down).
 */

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The voronoi() function is verbatim from the reference codepen — pure,
// self-contained GLSL math, nothing to adapt.
const FRAGMENT_SHADER = `
  float hash( float n ) { return fract(sin(n)*43758.5453); }

  vec2 hash( vec2 p ) {
    p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
    return fract(sin(p)*43758.5453);
  }

  vec3 voronoi( in vec2 x ) {
    vec2 n = floor(x);
    vec2 f = fract(x);

    vec2 mg, mr;
    float md = 8.0;
    for( int j=-1; j<=1; j++ )
    for( int i=-1; i<=1; i++ ) {
      vec2 g = vec2(float(i),float(j));
      vec2 o = hash( n + g );
      vec2 r = g + o - f;
      float d = dot(r,r);
      if( d<md ) { md = d; mr = r; mg = g; }
    }

    md = 8.0;
    for( int j=-2; j<=2; j++ )
    for( int i=-2; i<=2; i++ ) {
      vec2 g = mg + vec2(float(i),float(j));
      vec2 o = hash( n + g );
      vec2 r = g + o - f;
      if( dot(mr-r,mr-r)>0.1 ) {
        float d = dot( 3.0*(mr+r), normalize(r-mr) );
        md = min( md, d );
      }
    }

    return vec3( md, mr );
  }

  uniform sampler2D picture;
  uniform float time;
  uniform float lineWidthMin;
  uniform float lineWidthMax;
  uniform float brightness;
  uniform float voronoise;
  uniform vec3 filterColor;
  uniform float tintStrength;
  uniform float patternStrength;
  uniform vec2 resolution;
  uniform float imageAspect;
  uniform float screenAspect;

  varying vec2 vUv;

  void main( void ) {
    // object-fit: cover — crop-fill the texture into this container's
    // aspect ratio instead of stretching it (standard three.js cover-UV
    // technique).
    vec2 ratio = vec2(
      min(screenAspect / imageAspect, 1.0),
      min(imageAspect / screenAspect, 1.0)
    );
    vec2 coverUv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec2 p = gl_FragCoord.xy / resolution.xx;
    vec3 c = voronoi( voronoise * p );

    vec3 cellPattern = c.x * (1.2) * vec3( 1.0 );
    cellPattern = mix( vec3(1.0, 1.0, 1.0), cellPattern, smoothstep( lineWidthMin, lineWidthMax, c.x ) );
    // patternStrength (2026-07-10, per Reza — v1 was "way too strong,
    // the photo basically disappears"): blend the cell netting toward
    // neutral white (i.e. invisible) instead of applying it at full
    // strength.
    vec3 patternCol = mix( vec3(1.0), cellPattern, patternStrength );

    vec4 base = texture2D(picture, coverUv) * vec4(patternCol, 1.0) * brightness;
    // tintStrength: same reasoning — blend the language-color multiply
    // toward the plain (untinted) base image rather than fully replacing
    // its color, so the photo stays clearly a photo, just lightly
    // colored, not a wash of solid color.
    vec3 tinted = mix( base.rgb, base.rgb * filterColor * 1.8, tintStrength );

    gl_FragColor = vec4(tinted, 1.0);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default function VoronoiPortraitFilter({
  src,
  locale,
  className,
  style,
}: {
  src: string;
  /** Picks the tint from ChromaticContext's LANGUAGE_WORLDS — same accent
   * color as every other language-tinted element on the site. */
  locale: Locale;
  className?: string;
  style?: CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-creates the whole WebGL context on src/locale change (an admin
  // replacing the photo, or the person switching language) rather than
  // trying to patch uniforms live — both change rarely, and a full
  // teardown/rebuild is far less error-prone than partial updates.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const [r, g, b] = hexToRgb(LANGUAGE_WORLDS[locale].accent);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        picture: { value: null },
        time: { value: 0 },
        lineWidthMin: { value: 0.0 },
        lineWidthMax: { value: 0.35 },
        // Toned way down per Reza (2026-07-10): v1's brightness:1.35 +
        // voronoise:260 + a full-strength color multiply washed the
        // photo out almost entirely. This keeps the photo clearly
        // readable with only a light cell texture and a gentle language
        // tint riding on top.
        brightness: { value: 1.05 },
        voronoise: { value: 150 },
        filterColor: { value: new THREE.Vector3(r, g, b) },
        tintStrength: { value: 0.28 },
        patternStrength: { value: 0.32 },
        resolution: { value: new THREE.Vector2(1, 1) },
        imageAspect: { value: 1 },
        screenAspect: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let texture: THREE.Texture | null = null;
    // 2026-07-11 fix (per Reza — swapped to a new photo, filter rendered
    // solid black): two bugs at once. (1) No onError handler, so a failed
    // texture load (bad URL, CORS, network) failed completely silently —
    // added one that logs to console so a real cause shows up instead of
    // just "it's black". (2) The render loop below was calling
    // renderer.render() every frame from the moment this mounted,
    // regardless of whether the texture had actually finished loading —
    // sampling the unset `picture` uniform before/if it never loads
    // paints a solid black frame instead of leaving the canvas
    // transparent. `textureReady` now gates rendering so nothing is drawn
    // until there's an actual photo to show (and if loading truly fails,
    // the canvas just stays transparent instead of a black block).
    let textureReady = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    // 2026-07-17 (real bug, confirmed via console + a direct-navigation
    // test, per Reza): ShardPiece (in this same file) loads this EXACT
    // same `src` as a plain CSS background-image, which is always a
    // no-cors request — no way to set crossOrigin on a CSS background.
    // That request lands in the browser's HTTP cache first (shards render
    // before this WebGL layer). When THIS loader then requests the exact
    // same URL WITH crossOrigin=anonymous, some browsers (confirmed:
    // Chrome) reuse the already-cached no-cors ("opaque") response instead
    // of re-fetching in CORS mode — and an opaque cached response can
    // never be read as pixel data, so the texture load fails with
    // naturalWidth/naturalHeight stuck at 0, REGARDLESS of how permissive
    // the server's actual CORS policy is (confirmed: this bucket's CORS
    // config is wide open, AllowedOrigins: "*" — ruled out as the cause).
    // A harmless, stable-per-mount query param makes this load a
    // DIFFERENT cache key from the shard's plain <img>/background-image
    // request, so the two can never collide — the browser fetches this
    // one fresh, in CORS mode, exactly once.
    const textureSrc = `${src}${src.includes('?') ? '&' : '?'}three-tex=1`;
    loader.load(
      textureSrc,
      (tex) => {
        texture = tex;
        material.uniforms.picture!.value = tex;
        material.uniforms.imageAspect!.value = tex.image.width / tex.image.height;
        textureReady = true;
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.error('[VoronoiPortraitFilter] Texture failed to load:', src, err);
      }
    );

    function resize() {
      if (!container) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      (material.uniforms.resolution!.value as THREE.Vector2).set(w, h);
      material.uniforms.screenAspect!.value = w / h;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Perf (2026-07-10, per Reza — this shader's fragment cost is real:
    // ~25+9 texture-free samples per pixel from the voronoi() loops): only
    // render frames while this is actually on screen. Off-screen, the
    // rAF loop keeps running (so it's instantly ready the moment it
    // scrolls back into view) but skips the expensive render() call
    // entirely — this is likely the single biggest GPU-cycle waste this
    // component could cause if left rendering full-screen-shader frames
    // while scrolled away.
    let inView = false;
    const io = new IntersectionObserver(([entry]) => { inView = !!entry?.isIntersecting; }, { threshold: 0.01 });
    io.observe(container);

    // 2026-07-12 (Reza — reported hangs during scroll/transitions):
    // this component previously had NO webglcontextlost/restored
    // handling at all. If the browser drops the GL context (GPU
    // pressure — too many contexts open across tabs, driver reset,
    // etc.), the rAF loop below just kept calling renderer.render()
    // against a dead context every single frame, forever — that's a
    // real, ongoing cost, not a one-off glitch, and a plausible
    // contributor to the reported hangs. Now: contextlost pauses
    // rendering immediately (and calls preventDefault(), which is what
    // tells the browser this context is allowed to come back); on
    // contextrestored, Three.js re-uploads GL resources automatically
    // the next time render() runs, so simply resuming the flag is
    // enough — no full teardown/rebuild needed.
    let contextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      // eslint-disable-next-line no-console
      console.warn('[VoronoiPortraitFilter] WebGL context lost — pausing render loop until restored.');
    };
    const handleContextRestored = () => {
      contextLost = false;
      // eslint-disable-next-line no-console
      console.info('[VoronoiPortraitFilter] WebGL context restored — resuming.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    const startedAt = Date.now();
    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      if (!inView || !textureReady || contextLost) return;
      material.uniforms.time!.value = (Date.now() - startedAt) * 0.0004;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost, false);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored, false);
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [src, locale]);

  return <div ref={containerRef} className={className} style={{ position: 'absolute', inset: 0, ...style }} />;
}
