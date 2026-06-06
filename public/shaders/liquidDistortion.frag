uniform sampler2D uTexture;
uniform float uHoverState;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float strength = uHoverState * 0.04;
  uv.x += sin(uv.y * 20.0 + uTime * 5.0) * strength;
  uv.y += cos(uv.x * 20.0 + uTime * 4.0) * strength;
  vec4 color = texture2D(uTexture, uv);
  gl_FragColor = color;
}
