import { Navigate } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import { useRegion } from '../hooks/useRegion';

/**
 * `/regionen`: the region chooser (map + list) opened on purpose from the
 * header switcher or the burger menu. The chooser itself is rendered by
 * RegionChooser as a full page on top; this route only gives it an address.
 * Without two open regions there is nothing to choose: back to the start page.
 */
export default function RegionsPage() {
  const { regions, loading } = useRegion();
  if (!loading && regions.length < 2) return <Navigate to="/" replace />;
  return (
    <div className="page-container">
      <SeoMeta title="Region wählen" path="/regionen" noindex />
    </div>
  );
}
