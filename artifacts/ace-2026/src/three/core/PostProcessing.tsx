// ACE-2026 — PostProcessing (temporarily disabled)
// The @react-three/postprocessing effect chain (Bloom / ChromaticAberration /
// Vignette) is disabled because that package pulls a second copy of three whose
// Vector2 type diverges across versions and breaks the typecheck on some setups.
// This component renders nothing so the rest of the 3D scene compiles and runs.
// To re-enable: add @react-three/postprocessing with three pinned to the app's
// three version (0.170.0) and restore the EffectComposer chain here.
const PostProcessing = (): null => null;

export default PostProcessing;