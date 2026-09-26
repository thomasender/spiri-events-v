import { User } from 'lucide-react';
import { useHelpers } from '../hooks/useHelpers';
import './HelpersList.css';

function isExternalUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

// Public list of helpers rendered on the "Über uns" page. Live-fetches via
// useAdmin (admin-only) hooks which manage their own data. Renders an
// empty-state so the section gracefully hides its helper prompts.
export default function HelpersList() {
  const { helpers, loading, error } = useHelpers();

  if (loading) {
    return (
      <div className="helpers-list-loading" data-testid="helpers-list-loading">
        Lade Helfer…
      </div>
    );
  }

  if (error) {
    return (
      <div className="helpers-list-error" role="status" data-testid="helpers-list-error">
        Helfer konnten gerade nicht geladen werden.
      </div>
    );
  }

  if (!helpers.length) {
    return (
      <div className="helpers-list-empty" data-testid="helpers-list-empty">
        <p>
          Sobald Admins Helfer:innen hinzufügen, erscheinen sie hier — jede:r, die/der tribe
          Vorarlberg mitträgt, ist eingeladen, Teil dieser Liste zu werden.
        </p>
      </div>
    );
  }

  return (
    <ul className="helpers-list" data-testid="helpers-list">
      {helpers.map((helper) => {
        const profileLink =
          helper.profileSlug && helper.profileSlug.startsWith('#') ? null : helper.profileSlug;
        const showWebsite = helper.website && isExternalUrl(helper.website);
        return (
          <li key={helper.id} className="helpers-list-card" data-testid="helpers-list-card">
            <div className="helpers-list-photo-wrap" aria-hidden="true">
              {helper.photoURL ? (
                <img src={helper.photoURL} alt="" className="helpers-list-photo" loading="lazy" />
              ) : (
                <span className="helpers-list-photo-placeholder">
                  <User size={32} strokeWidth={2} aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="helpers-list-body">
              <h3 className="helpers-list-name">{helper.name}</h3>
              {helper.description && (
                <p className="helpers-list-description">{helper.description}</p>
              )}
              {(profileLink || showWebsite) && (
                <div className="helpers-list-links">
                  {profileLink && (
                    <a
                      href={profileLink}
                      className="helpers-list-link"
                      data-testid="helpers-list-profile-link"
                    >
                      Profil ansehen
                    </a>
                  )}
                  {showWebsite && (
                    <a
                      href={helper.website}
                      className="helpers-list-link helpers-list-link--external"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="helpers-list-website-link"
                    >
                      Website besuchen
                    </a>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
