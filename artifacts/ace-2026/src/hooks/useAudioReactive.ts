import { useEffect, useState, useRef } from 'react';
import { useAudio } from '../context/AudioContext';
import { getFrequencyBands, getTimeDomainData } from '../lib/audioAnalyser';

export interface AudioReactiveData {
  bassLevel: number;
  midLevel: number;
  highLevel: number;
  timeDomainData: Float32Array;
}

export function useAudioReactive(): AudioReactiveData {
  const audio = useAudio();
  // Support both useAudio().analyserNode and useAudio().audioState.analyserNode
  const analyserNode = (audio as any).analyserNode || audio?.audioState?.analyserNode || null;

  const [data, setData] = useState<AudioReactiveData>({
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    timeDomainData: new Float32Array(0),
  });

  const rAFRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyserNode) {
      setData({
        bassLevel: 0,
        midLevel: 0,
        highLevel: 0,
        timeDomainData: new Float32Array(0),
      });
      return;
    }

    const update = () => {
      const bands = getFrequencyBands(analyserNode);
      const timeDomain = getTimeDomainData(analyserNode);

      setData({
        ...bands,
        timeDomainData: timeDomain,
      });

      rAFRef.current = requestAnimationFrame(update);
    };

    update();

    return () => {
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current);
      }
    };
  }, [analyserNode]);

  return data;
}

export default useAudioReactive;
