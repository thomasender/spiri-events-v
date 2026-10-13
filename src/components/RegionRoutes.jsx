import { useParams } from 'react-router-dom';
import CalendarPage from '../pages/CalendarPage';
import DirectoryPage from '../pages/DirectoryPage';
import PublicProfilePage from '../pages/PublicProfilePage';
import RegionComingSoonPage from '../pages/RegionComingSoonPage';
import ErrorPage from '../pages/ErrorPage';
import { useRegion } from '../hooks/useRegion';
import { useCanPreviewRegion } from '../hooks/useCanPreviewRegion';
import { resolveTopLevelSlug } from '../utils/regionRouting';

// An inactive region per the static register may be active in Firestore
// (pilot): wait for the config instead of flashing the coming-soon page.
function ComingSoonOrWait({ region }) {
  const { loading } = useRegion();
  // Preview seam (ticket 27): admins / regional moderators will later see the
  // region itself with a preview banner. Until then they get the same page
  // plus a one-line note.
  const canPreview = useCanPreviewRegion(region?.id ?? null);
  if (loading) return <div className="loading-spinner" data-testid="region-loading" />;
  return <RegionComingSoonPage region={region} canPreview={canPreview} />;
}

/**
 * `/:slug`: a region address or a public profile. Decided synchronously from
 * the fixed region slug list (username.js reserves those slugs), so profiles
 * never wait for the region config.
 */
export function RegionOrProfileRoute() {
  const { slug } = useParams();
  const { allRegions } = useRegion();
  const { kind, region } = resolveTopLevelSlug(slug?.toLowerCase(), allRegions);
  if (kind === 'profile') return <PublicProfilePage />;
  if (kind === 'coming-soon') return <ComingSoonOrWait region={region} />;
  return <CalendarPage />;
}

/** `/:regionSlug/verzeichnis`: directory of a region; anything else is a 404. */
export function RegionDirectoryRoute() {
  const { regionSlug } = useParams();
  const { allRegions } = useRegion();
  const { kind, region } = resolveTopLevelSlug(regionSlug?.toLowerCase(), allRegions);
  if (kind === 'profile') return <ErrorPage type="not-found" />;
  if (kind === 'coming-soon') return <ComingSoonOrWait region={region} />;
  return <DirectoryPage />;
}
