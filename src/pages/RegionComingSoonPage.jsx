import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import { BRAND_NAME } from '../config/brand';
import { useRegion } from '../hooks/useRegion';
import { regionLocative, regionPath } from '../utils/regionRouting';
import { combinedViewTexts } from '../utils/regionTexts';
import './ErrorPage.css';

/**
 * Friendly page for a region address that is not open yet (`/steiermark`
 * while `active=false`) and for a combined view (`/oesterreich`, `/deutschland`,
 * `/schweiz`, `/alle-tribes`) without any active region in scope. Never a 404,
 * never an empty calendar. `region` is null for a combined view (`view`, default
 * the Austrian one).
 */
export default function RegionComingSoonPage({ region = null, view = null, canPreview = false }) {
  const { regions } = useRegion();
  const viewTexts = combinedViewTexts(view);
  const name = region ? region.name : (view?.label ?? 'Österreich');
  const path = region ? regionPath(region) : regionPath(view?.slug ?? 'oesterreich');
  const text = region
    ? `Wir bereiten gerade einen Kalender für bewusste Events und Menschen ${regionLocative(region)} vor.`
    : viewTexts.comingSoon;

  // While Vorarlberg is the only active region, its calendar stays at `/`.
  const onlyDefault = regions.length <= 1;
  const targets = onlyDefault
    ? [{ to: '/', label: `Zum Kalender ${regions[0]?.name ?? 'Vorarlberg'}` }]
    : regions.map((r) => ({ to: regionPath(r), label: `Zum Kalender ${r.name}` }));

  return (
    <div className="page-container error-page fade-enter">
      <SeoMeta
        title={`${name} kommt bald`}
        description={`${BRAND_NAME} ${region ? regionLocative(region) : viewTexts.comingSoonSubject} ist in Vorbereitung.`}
        path={path}
        noindex
      />
      <div className="error-page-card" data-testid="region-coming-soon">
        <span className="eyebrow">Bald auch hier</span>
        <h1 className="error-page-title">
          {BRAND_NAME} – {name} kommt bald
        </h1>
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
