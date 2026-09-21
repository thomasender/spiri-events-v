import { Link, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import { usePublicProfile } from '../hooks/usePublicProfile';
import './PublicProfilePage.css';

function normalizeWebsite(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function PublicProfilePage() {
  const { uid } = useParams();
  const { profile, loading, exists } = usePublicProfile(uid);

  const seoTitle = profile?.displayName ? `${profile.displayName} – Veranstalter` : 'Veranstalter';
  const seoDescription = profile?.bio
    ? profile.bio.slice(0, 160)
    : 'Profilseite des Veranstalters auf tribe Vorarlberg.';

  if (loading) {
    return (
      <>
        <SeoMeta title={seoTitle} description={seoDescription} path={`/veranstalter/${uid}`} />
        <div className="page-container public-profile-page" data-testid="public-profile-loading">
          <div className="loading-spinner" />
        </div>
      </>
    );
  }

  if (!exists) {
    return (
      <>
        <SeoMeta
          title="Veranstalter-Profil nicht verfügbar"
          description="Für diesen Veranstalter ist kein öffentliches Profil hinterlegt."
          path={`/veranstalter/${uid}`}
        />
        <div className="page-container public-profile-page" data-testid="public-profile-not-found">
          <div className="public-profile-card">
            <span className="public-profile-eyebrow">Veranstalter</span>
            <h1 className="public-profile-title">Profil nicht verfügbar</h1>
            <p className="public-profile-message">
              Für diesen Veranstalter ist aktuell kein öffentliches Profil hinterlegt.
            </p>
            <Link to="/" className="btn btn-primary" data-testid="public-profile-back">
              Zurück zur Startseite
            </Link>
          </div>
        </div>
      </>
    );
  }

  const website = normalizeWebsite(profile.website);
  const hasBio = profile.bio && profile.bio.trim().length > 0;
  const hasWebsite = website.length > 0;

  return (
    <>
      <SeoMeta
        title={seoTitle}
        description={seoDescription}
        path={`/veranstalter/${uid}`}
        type="profile"
      />
      <div className="page-container public-profile-page" data-testid="public-profile-page">
        <article className="public-profile-card">
          <span className="public-profile-eyebrow">Veranstalter</span>

          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              className="public-profile-photo"
              data-testid="public-profile-photo"
            />
          ) : (
            <div
              className="public-profile-photo public-profile-photo--placeholder"
              data-testid="public-profile-photo-placeholder"
              aria-hidden="true"
            >
              {(profile.displayName || '?').charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="public-profile-name" data-testid="public-profile-name">
            {profile.displayName}
          </h1>

          {hasBio && (
            <p className="public-profile-bio" data-testid="public-profile-bio">
              {profile.bio}
            </p>
          )}

          {hasWebsite && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="public-profile-website detail-link"
              data-testid="public-profile-website"
            >
              <ExternalLink size={16} aria-hidden="true" />
              <span>{profile.website}</span>
            </a>
          )}
        </article>
      </div>
    </>
  );
}
