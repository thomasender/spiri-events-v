import { Navigate, useParams } from 'react-router-dom';
import AboutPage from '../pages/AboutPage';
import CalendarPage from '../pages/CalendarPage';
import DirectoryPage from '../pages/DirectoryPage';
import PublicProfilePage from '../pages/PublicProfilePage';
import RegionComingSoonPage from '../pages/RegionComingSoonPage';
import ErrorPage from '../pages/ErrorPage';
import { RegionContext, useRegion } from '../hooks/useRegion';
import { useCanPreviewRegion } from '../hooks/useCanPreviewRegion';
import { redirectTargetPath, resolveTopLevelSlug } from '../utils/regionRouting';

// An inactive region per the static register may be active in Firestore
// (pilot): wait for the config instead of flashing the coming-soon page.
function ComingSoonOrWait({ region, view = null }) {
  const { loading } = useRegion();
  // Preview seam: staff who may moderate the region get a one-line note on the
  // coming-soon page. Follow-up: show the region itself with a preview banner.
  const canPreview = useCanPreviewRegion(region?.id ?? null);
  if (loading) return <div className="loading-spinner" data-testid="region-loading" />;
  return <RegionComingSoonPage region={region} view={view} canPreview={canPreview} />;
}

// An unavailable combined view with a fallback (`/deutschland` with one German
// region) replaces itself by that region's page. Waits for the region config
// first: the static register only knows Vorarlberg as active.
function RedirectOrWait({ redirect, path }) {
  const { loading, allRegions } = useRegion();
  if (loading) return <div className="loading-spinner" data-testid="region-loading" />;
  return <Navigate to={redirectTargetPath(redirect, path, allRegions)} replace />;
}

// A slug that is no known region may still be a region a Super-Admin created in the
// Verwaltung (those slugs arrive with the region config), so wait for it before showing a
// profile or a 404.
function UnknownSlugOrWait({ children }) {
  const { loading } = useRegion();
  if (loading) return <div className="loading-spinner" data-testid="region-loading" />;
  return children;
}

/**
 * `/:slug`: a region address or a public profile. The fixed region slugs
 * (username.js reserves those) are decided synchronously; any other slug waits for
 * the region config in case it names a region created in the Verwaltung.
 */
export function RegionOrProfileRoute() {
  const { slug } = useParams();
  const { allRegions } = useRegion();
  const { kind, region, view, redirect } = resolveTopLevelSlug(slug?.toLowerCase(), allRegions);
  if (kind === 'profile') {
    return (
      <UnknownSlugOrWait>
        <PublicProfilePage />
      </UnknownSlugOrWait>
    );
  }
  if (kind === 'redirect') return <RedirectOrWait redirect={redirect} path="/" />;
  if (kind === 'coming-soon') return <ComingSoonOrWait region={region} view={view} />;
  return <CalendarPage />;
}

/** `/:regionSlug/verzeichnis`: directory of a region; anything else is a 404. */
export function RegionDirectoryRoute() {
  const { regionSlug } = useParams();
  const { allRegions } = useRegion();
  const { kind, region, view, redirect } = resolveTopLevelSlug(
    regionSlug?.toLowerCase(),
    allRegions
  );
  if (kind === 'profile') {
    return (
      <UnknownSlugOrWait>
        <ErrorPage type="not-found" />
      </UnknownSlugOrWait>
    );
  }
  if (kind === 'redirect') return <RedirectOrWait redirect={redirect} path="/verzeichnis" />;
  if (kind === 'coming-soon') return <ComingSoonOrWait region={region} view={view} />;
  return <DirectoryPage />;
}

function ComingSoonAbout({ region }) {
  const ctx = useRegion();
  const value = { ...ctx, region, regionId: region.id, comingSoon: false };
  return (
    <RegionContext.Provider value={value}>
      <AboutPage />
    </RegionContext.Provider>
  );
}

/** `/:regionSlug/ueber-uns`: "Über uns" of a region; combined views use the general page. */
export function RegionAboutRoute() {
  const { regionSlug } = useParams();
  const { allRegions } = useRegion();
  const { kind, region, view, redirect } = resolveTopLevelSlug(
    regionSlug?.toLowerCase(),
    allRegions
  );
  if (kind === 'profile') {
    return (
      <UnknownSlugOrWait>
        <ErrorPage type="not-found" />
      </UnknownSlugOrWait>
    );
  }
  if (kind === 'redirect') return <RedirectOrWait redirect={redirect} path="/ueber-uns" />;
  if (kind === 'all-regions') return <Navigate to="/ueber-uns" replace />;
  // A not-yet-open region still has its own "Über uns" (the footer links to it).
  if (kind === 'coming-soon' && region) return <ComingSoonAbout region={region} />;
  if (kind === 'coming-soon') return <ComingSoonOrWait region={region} view={view} />;
  return <AboutPage />;
}
