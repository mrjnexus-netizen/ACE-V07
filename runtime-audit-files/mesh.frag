uniform vec3 uColor;
uniform float uOpacity;
void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  if (dist > 0.5) discard;
  float alpha = 1.0 - (dist * 2.0);
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}
