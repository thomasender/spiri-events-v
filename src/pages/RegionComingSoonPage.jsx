import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import { useRegion } from '../hooks/useRegion';
import {
  ALL_REGIONS_NAME,
  ALL_REGIONS_SLUG,
  regionLocative,
  regionPath,
} from '../utils/regionRouting';
import './ErrorPage.css';

/**
 * Friendly page for a region address that is not open yet (`/steiermark`
 * while `active=false`) and for the combined view `/oesterreich` while only one
 * region is active. Never a 404, never an empty calendar.
 * `region` is null for the combined view.
 */
export default function RegionComingSoonPage({ region = null, canPreview = false }) {
  const { regions } = useRegion();
  const name = region ? region.name : ALL_REGIONS_NAME;
  const path = region ? regionPath(region) : `/${ALL_REGIONS_SLUG}`;
  const text = region
    ? `Wir bereiten gerade einen Kalender für bewusste Events und Menschen ${regionLocative(region)} vor.`
    : 'Bald findest du hier die Events aus allen Bundesländern auf einen Blick.';

  // While Vorarlberg is the only active region, its calendar stays at `/`.
  const onlyDefault = regions.length <= 1;
  const targets = onlyDefault
    ? [{ to: '/', label: `Zum Kalender ${regions[0]?.name ?? 'Vorarlberg'}` }]
    : regions.map((r) => ({ to: regionPath(r), label: `Zum Kalender ${r.name}` }));

  return (
    <div className="page-container error-page fade-enter">
      <SeoMeta
        title={`${name} kommt bald`}
        description={`The Tribe ${region ? regionLocative(region) : 'für ganz Österreich'} ist in Vorbereitung.`}
        path={path}
        noindex
      />
      <div className="error-page-card" data-testid="region-coming-soon">
        <span className="eyebrow">Bald auch hier</span>
        <h1 className="error-page-title">The Tribe – {name} kommt bald</h1>
        <p className="error-page-message">{text}</p>
        <p className="error-page-message">Schau bald wieder vorbei!</p>
        {canPreview && region && (
          <p className="error-page-redirect" data-testid="region-preview-note">
            Nur für Admins sichtbar: {region.name} ist noch nicht freigeschaltet.
          </p>
        )}
        <div className="error-page-actions">
          {targets.map((t, i) => (
            <Link
              key={t.to}
              to={t.to}
              className={`btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
