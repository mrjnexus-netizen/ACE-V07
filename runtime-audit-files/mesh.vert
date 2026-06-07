uniform float uTime;
uniform float uBassLevel;
uniform float uMidLevel;
uniform float uHighLevel;
uniform float uAudioData[128];
attribute float aScale;
void main() {
  vec3 pos = position;
  float noise = sin(pos.x * 8.0 + uTime * 0.5) *
                cos(pos.y * 8.0 + uTime * 0.3) *
                sin(pos.z * 8.0 + uTime * 0.4);
  float displacement = uBassLevel * 0.4 * noise;
  float spread = 1.0 + uMidLevel * 0.3;
  pos = pos * spread + normalize(pos) * displacement;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aScale * (uHighLevel * 3.0 + 1.5) * (1.0 / -mvPosition.z);
}
