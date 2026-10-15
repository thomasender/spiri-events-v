import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, Share2 } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import { BRAND_NAME } from '../config/brand';
import { useAuth } from '../hooks/useAuth';
import { useRegionEventCount } from '../hooks/useRegionEventCount';
import { copyToClipboard } from '../utils/copyToClipboard';
import { progressPercent } from '../utils/regionProgress';
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
  const { user } = useAuth();
  const count = useRegionEventCount(region?.id ?? null);
  const [copied, setCopied] = useState(false);
  const percent = progressPercent(count);
  const viewTexts = combinedViewTexts(view);
  const name = region ? region.name : (view?.label ?? 'Österreich');
  const path = region ? regionPath(region) : regionPath(view?.slug ?? 'oesterreich');
  const text = region
    ? `Wir bereiten gerade einen Kalender für bewusste Events und Menschen ${regionLocative(region)} vor.`
    : viewTexts.comingSoon;

  const invite = async () => {
    const inviteUrl = `${window.location.origin}${path}`;
    const title = `${BRAND_NAME} – ${name}`;
    const message = `Hilf mit, bewusste Events in ${name} zu sammeln: `;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: message, url: inviteUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (await copyToClipboard(inviteUrl)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

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
        {region && (
          <>
            <div className="coming-soon-progress" data-testid="region-progress">
              <div
                className="coming-soon-progress-bar"
                role="progressbar"
                aria-label={`Fortschritt: so weit ist ${name} schon`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="coming-soon-progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="coming-soon-progress-label">
                {percent} % der Events für den Start sind schon gesammelt
              </span>
            </div>
            <p className="error-page-message">
              Du kennst bewusste Events in {name}? Trag sie jetzt ein, damit wir bald starten
              können.
            </p>
            <div className="error-page-actions">
              <Link
                to={user ? '/admin/new' : '/login'}
                className="btn btn-primary"
                data-testid="region-add-event"
              >
                <CalendarPlus size={18} aria-hidden="true" /> Event eintragen
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={invite}
                data-testid="region-invite"
              >
                {copied ? (
                  <Check size={18} aria-hidden="true" />
                ) : (
                  <Share2 size={18} aria-hidden="true" />
                )}{' '}
                {copied ? 'Link kopiert' : 'Veranstalter:innen einladen'}
              </button>
            </div>
          </>
        )}
        {!region && <p className="error-page-message">Schau bald wieder vorbei!</p>}
        {canPreview && region && (
          <p className="error-page-redirect" data-testid="region-preview-note">
            Nur für Admins sichtbar: {region.name} ist noch nicht freigeschaltet.
          </p>
        )}
        <Link to="/" className="coming-soon-explore" data-testid="region-explore">
          Andere Regionen erkunden
        </Link>
      </div>
    </div>
  );
}
