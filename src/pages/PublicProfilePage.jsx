import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Facebook, Instagram, Pencil } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import ShareButton from '../components/ShareButton';
import OrganizerEvents from '../components/OrganizerEvents';
import RichTextView from '../components/RichTextView';
import { usePublicProfile } from '../hooks/usePublicProfile';
import { useAuth } from '../hooks/useAuth';
import { stripHtml } from '../utils/sanitize';
import './PublicProfilePage.css';

function normalizeWebsite(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeSocialHandle(value, platform) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  const handle = trimmed.replace(/^@/, '').split('/').filter(Boolean).pop();
  if (!handle) return '';
  return `https://www.${platform}.com/${handle}`;
}

function buildProfileShareUrl(slug) {
  if (typeof window === 'undefined' || !slug) return '';
  return `${window.location.origin}/${slug}`;
}

export default function PublicProfilePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading, exists, uid } = usePublicProfile(slug);

  const isOwnProfile = Boolean(user && uid && user.uid === uid);
  const showOrganizerEvents = Boolean(exists && uid);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo(0, 0);
  }, [slug]);
  const seoTitle = profile?.displayName ? `${profile.displayName} – Veranstalter` : 'Veranstalter';
  const seoSourceText = profile?.bioHtml ? stripHtml(profile.bioHtml) : profile?.bio || '';
  const seoDescription = seoSourceText.trim()
    ? seoSourceText.slice(0, 160)
    : 'Profilseite des Veranstalters auf tribe Vorarlberg.';
  const seoPath = `/${slug}`;
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  if (loading) {
    return (
      <>
        <SeoMeta title={seoTitle} description={seoDescription} path={seoPath} />
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
          path={seoPath}
        />
        <div className="page-container public-profile-page" data-testid="public-profile-not-found">
          <div className="public-profile-card">
            <span className="public-profile-eyebrow">Veranstalter</span>
            <h1 className="public-profile-title">Profil nicht verfügbar</h1>
            <p className="public-profile-message">
              Für diesen Veranstalter ist aktuell kein öffentliches Profil hinterlegt.
            </p>
            <div className="public-profile-actions">
              <button
                type="button"
                className="btn btn-secondary public-profile-back-btn"
                onClick={handleBack}
                data-testid="public-profile-back"
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span>Zurück</span>
              </button>
              <Link to="/" className="btn btn-primary" data-testid="public-profile-home">
                Zur Startseite
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const website = normalizeWebsite(profile.website);
  const richBioText = profile.bioHtml ? stripHtml(profile.bioHtml) : '';
  const hasRichBio = richBioText.trim().length > 0;
  const hasPlainBio = !hasRichBio && profile.bio && profile.bio.trim().length > 0;
  const hasBio = hasRichBio || hasPlainBio;
  const hasWebsite = website.length > 0;
  const socialMedia = profile.socialMedia || {};
  const showSocialMedia = socialMedia.sharePublicly === true;
  const facebookUrl = showSocialMedia
    ? normalizeSocialHandle(socialMedia.facebook, 'facebook')
    : '';
  const instagramUrl = showSocialMedia
    ? normalizeSocialHandle(socialMedia.instagram, 'instagram')
    : '';
  const hasSocialLinks = Boolean(facebookUrl || instagramUrl);
  const shareUrl = buildProfileShareUrl(slug);

  return (
    <>
      <SeoMeta title={seoTitle} description={seoDescription} path={seoPath} type="profile" />
      <div className="page-container public-profile-page" data-testid="public-profile-page">
        <div className="public-profile-toolbar">
          <button
            type="button"
            className="public-profile-toolbar-btn"
            onClick={handleBack}
            aria-label="Zurück zur vorherigen Seite"
            data-testid="public-profile-back-top"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Zurück</span>
          </button>
          <div className="public-profile-toolbar-actions">
            {isOwnProfile && (
              <Link
                to="/profil"
                className="public-profile-toolbar-btn"
                aria-label="Profil bearbeiten"
                data-testid="public-profile-edit"
              >
                <Pencil size={18} aria-hidden="true" />
                <span>Bearbeiten</span>
              </Link>
            )}
            <ShareButton
              url={shareUrl}
              title={profile.displayName}
              dialogTitle="Profil teilen"
              triggerLabel="Teilen"
              ariaLabel="Profil teilen"
              testId="public-profile-share"
              subtle
            />
          </div>
        </div>

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

          {hasRichBio && (
            <div className="public-profile-bio" data-testid="public-profile-bio">
              <RichTextView html={profile.bioHtml} className="public-profile-bio-content" />
            </div>
          )}
          {hasPlainBio && (
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

          {hasSocialLinks && (
            <div className="public-profile-social-media" data-testid="public-profile-social-media">
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-profile-social-link"
                  aria-label="Facebook Profil"
                  data-testid="public-profile-facebook"
                >
                  <Facebook size={18} aria-hidden="true" />
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-profile-social-link"
                  aria-label="Instagram Profil"
                  data-testid="public-profile-instagram"
                >
                  <Instagram size={18} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </article>

        {showOrganizerEvents && (
          <div className="public-profile-events" data-testid="public-profile-events-wrapper">
            <OrganizerEvents organizerUid={uid} organizerName={profile.displayName} />
          </div>
        )}
      </div>
    </>
  );
}
