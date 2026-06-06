import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { useChromatic } from '../../context/ChromaticContext';

const PostProcessing = () => {
  const { themeId } = useChromatic();

  const isCyber = themeId === 'cyber';
  const isOnyx = themeId === 'onyx';
  const isMinimal = themeId === 'minimal';

  if (isMinimal) return null;

  const effects: React.ReactElement[] = [];
  effects.push(<Bloom key="bloom" intensity={isCyber ? 1.2 : 0.2} luminanceThreshold={0.8} luminanceSmoothing={0.9} />);
  if (isCyber) effects.push(<ChromaticAberration key="ca" offset={[0.002, 0.002]} />);
  if (isOnyx) effects.push(<Vignette key="vig" eskil={false} offset={0.1} darkness={1.1} />);

  return <EffectComposer>{effects}</EffectComposer>;
};

export default PostProcessing;
