import { User } from 'lucide-react';
import './HelpersList.css';

function isExternalUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

// Public list of a region's helpers on the "Über uns" page. AboutPage loads
// them (useHelpers) and renders the whole section only when there is at least
// one, so this list has no loading, error or empty state of its own.
export default function HelpersList({ helpers }) {
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
