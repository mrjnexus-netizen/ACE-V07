import { useIdentity } from '../context/IdentityContext';

export default function SpatialScrollEngine() {
  const { tracks } = useIdentity();

  return (
    <div className="py-12 text-center">
      <h3 className="text-xl font-display">Spatial Scroll Engine</h3>
      <p className="text-muted">{tracks.length} tracks in playlist</p>
    </div>
  );
}