export const createAnalyserNode = (ctx: AudioContext, fftSize: number): AnalyserNode => {
  const node = ctx.createAnalyser();
  node.smoothingTimeConstant = 0.85;
  node.fftSize = fftSize;
  return node;
};

export const getFrequencyBands = (
  node: AnalyserNode
): { bassLevel: number; midLevel: number; highLevel: number } => {
  const bufferLength = node.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  node.getByteFrequencyData(dataArray);

  // Helper to calculate average normalized to 0-1
  const getAverage = (start: number, end: number) => {
    if (bufferLength === 0) return 0;
    const startIndex = Math.min(start, bufferLength - 1);
    const endIndex = Math.min(end, bufferLength);
    if (startIndex >= endIndex) return 0;

    let sum = 0;
    for (let i = startIndex; i < endIndex; i++) {
      sum += dataArray[i] ?? 0;
    }
    return sum / (endIndex - startIndex) / 255;
  };

  // Bass: indices 0-10
  const bassLevel = getAverage(0, 11);
  // Mid: indices 10-100
  const midLevel = getAverage(10, 101);
  // High: indices 100-512
  const highLevel = getAverage(100, 513);

  return { bassLevel, midLevel, highLevel };
};

export const getTimeDomainData = (node: AnalyserNode): Float32Array => {
  const bufferLength = node.fftSize;
  const dataArray = new Float32Array(bufferLength);
  node.getFloatTimeDomainData(dataArray);
  return dataArray;
};
