import { useIdentity } from '../context/IdentityContext';
import { useChromatic } from '../context/ChromaticContext';

export default function GridLayoutEngine() {
  const { composerIdentity, locale } = useIdentity();
  const { themeId } = useChromatic();

  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-display">Grid Layout Engine (Variant A)</h2>
      <p className="text-muted">Theme: {themeId} | Locale: {locale}</p>
      {composerIdentity?.name?.[locale] && (
        <p className="mt-4">Welcome, {composerIdentity.name[locale]}</p>
      )}
    </div>
  );
}