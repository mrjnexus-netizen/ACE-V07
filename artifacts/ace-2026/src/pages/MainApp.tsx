import { useEffect } from 'react';
import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';
import { GridLayoutEngine } from '../components/GridLayoutEngine';
import { SpatialScrollEngine } from '../components/SpatialScrollEngine';
import { DoubleExposurePortrait } from '../components/DoubleExposurePortrait';
import { PersistentAudioPlayer } from '../components/PersistentAudioPlayer';
import { ExecutiveStudioBot } from '../components/ExecutiveStudioBot';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

export const MainApp = () => {
  const { fetchIdentity, fetchTracks } = useIdentity();
  const { themeId, applyLocaleTypography } = useChromatic();
  const locale = localStorage.getItem('ace-locale') || 'en';

  useEffect(() => {
    fetchIdentity();
    fetchTracks();
  }, [fetchIdentity, fetchTracks]);

  useEffect(() => {
    if (applyLocaleTypography) {
      applyLocaleTypography(locale);
    }
  }, [locale, applyLocaleTypography]);

  return (
    <div className="min-h-screen bg-surface text-text-color" data-theme={themeId}>
      <Header />
      <main className="pt-16">
        <GridLayoutEngine />
        <DoubleExposurePortrait />
        <SpatialScrollEngine />
      </main>
      <PersistentAudioPlayer />
      <ExecutiveStudioBot />
      <Footer />
    </div>
  );
};