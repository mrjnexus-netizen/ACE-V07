export interface FrequencyBands {
  bassLevel: number;
  midLevel: number;
  highLevel: number;
}

export function createAnalyserNode(
  audioContext: AudioContext,
  fftSize?: number
): AnalyserNode {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize ?? (window.innerWidth < 768 ? 512 : 2048);
  analyser.smoothingTimeConstant = 0.85;
  return analyser;
}

export function getFrequencyBands(analyserNode: AnalyserNode): FrequencyBands {
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  const bassEnd = Math.min(10, bufferLength);
  const midEnd = Math.min(100, bufferLength);
  const highEnd = Math.min(512, bufferLength);

  let bassSum = 0;
  for (let i = 0; i < bassEnd; i++) bassSum += (dataArray[i] ?? 0);
  const bassLevel = bassEnd > 0 ? bassSum / (bassEnd * 255) : 0;

  let midSum = 0;
  for (let i = bassEnd; i < midEnd; i++) midSum += (dataArray[i] ?? 0);
  const midCount = midEnd - bassEnd;
  const midLevel = midCount > 0 ? midSum / (midCount * 255) : 0;

  let highSum = 0;
  for (let i = midEnd; i < highEnd; i++) highSum += (dataArray[i] ?? 0);
  const highCount = highEnd - midEnd;
  const highLevel = highCount > 0 ? highSum / (highCount * 255) : 0;

  return {
    bassLevel: Math.min(1, Math.max(0, bassLevel)),
    midLevel: Math.min(1, Math.max(0, midLevel)),
    highLevel: Math.min(1, Math.max(0, highLevel)),
  };
}

export function getTimeDomainData(analyserNode: AnalyserNode): Float32Array {
  const dataArray = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(dataArray);
  return dataArray;
}