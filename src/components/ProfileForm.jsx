import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Facebook, Instagram, Save } from 'lucide-react';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import ProfileIncompleteDialog from './ProfileIncompleteDialog';
import RichTextEditorLazy from './RichTextEditorLazy';
import { uploadProfileDescriptionImage } from '../lib/imageUpload';
import { getPlainTextLength, stripHtml } from '../utils/sanitize';
import { getMissingProfileFields, BIO_MAX } from '../utils/profile';
import { slugifyName } from '../lib/slug';
import { validateUsername, normalizeUsername, USERNAME_MIN, USERNAME_MAX } from '../utils/username';
import { isUsernameAvailable } from '../lib/slug';
import './ProfileForm.css';

const NAME_MAX = 80;
const SOCIAL_MAX = 200;

const normalizeWebsite = (raw) => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return `https://${trimmed}`;
};

const isValidWebsite = (raw) => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return true;
  try {
    new URL(normalizeWebsite(trimmed));
    return true;
  } catch {
    return false;
  }
};

const USERNAME_ERROR_MESSAGES = {
  EMPTY: '',
  TOO_SHORT: `Benutzername muss mindestens ${USERNAME_MIN} Zeichen haben.`,
  TOO_LONG: `Benutzername darf maximal ${USERNAME_MAX} Zeichen haben.`,
  INVALID_CHARS:
    'Nur Kleinbuchstaben, Zahlen, Punkt, Unterstrich und Bindestrich. Beginne und ende mit Buchstabe oder Zahl.',
  RESERVED: 'Dieser Benutzername ist reserviert und kann nicht verwendet werden.',
  TAKEN: 'Dieser Benutzername ist bereits vergeben.',
};

const AVAILABILITY_DEBOUNCE_MS = 350;

export default function ProfileForm({ profile, uid, onSave, checkAvailability }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || profile?.slug || '');
  const [usernameTouched, setUsernameTouched] = useState(
    Boolean(profile?.username || profile?.slug)
  );
  const [bioHtml, setBioHtml] = useState(profile?.bioHtml || '');
  const [website, setWebsite] = useState(profile?.website || '');
  const [contact, setContact] = useState(profile?.contact || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || null);
  const [facebook, setFacebook] = useState(profile?.socialMedia?.facebook || '');
  const [instagram, setInstagram] = useState(profile?.socialMedia?.instagram || '');
  const [sharePublicly, setSharePublicly] = useState(profile?.socialMedia?.sharePublicly === true);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMissingFields, setDialogMissingFields] = useState([]);
  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle',
    message: '',
  });

  const navigate = useNavigate();
  const plainBioLength = getPlainTextLength(bioHtml);
  const bioOverLimit = plainBioLength > BIO_MAX;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setUsername(profile.username || profile.slug || '');
    setUsernameTouched(Boolean(profile.username || profile.slug));
    setBioHtml(profile.bioHtml || '');
    setWebsite(profile.website || '');
    setContact(profile.contact || '');
    setPhotoURL(profile.photoURL || null);
    setFacebook(profile.socialMedia?.facebook || '');
    setInstagram(profile.socialMedia?.instagram || '');
    setSharePublicly(profile.socialMedia?.sharePublicly === true);
  }, [profile]);

  const usernameCheckSeqRef = useRef(0);
  const checkAvailabilityRef = useRef(checkAvailability);
  useEffect(() => {
    checkAvailabilityRef.current = checkAvailability;
  }, [checkAvailability]);

  const runAvailabilityCheck = useCallback(async (normalized, currentUid, currentUsername) => {
    const seq = ++usernameCheckSeqRef.current;
    const result = validateUsername(normalized, { currentUsername });
    if (!result.valid) {
      setUsernameStatus({ state: 'invalid', message: USERNAME_ERROR_MESSAGES[result.error] });
      return result;
    }
    setUsernameStatus({ state: 'checking', message: 'Verfügbarkeit wird geprüft…' });
    try {
      const probe = checkAvailabilityRef.current || isUsernameAvailable;
      const available = await probe(result.normalized, currentUid);
      if (seq !== usernameCheckSeqRef.current) return result;
      if (!available) {
        setUsernameStatus({ state: 'taken', message: USERNAME_ERROR_MESSAGES.TAKEN });
        return { valid: false, error: 'TAKEN', normalized: result.normalized };
      }
      setUsernameStatus({ state: 'available', message: 'Benutzername ist verfügbar.' });
      return result;
    } catch (err) {
      console.warn('Username availability check failed:', err);
      if (seq !== usernameCheckSeqRef.current) return result;
      setUsernameStatus({ state: 'idle', message: '' });
      return result;
    }
  }, []);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      usernameCheckSeqRef.current += 1;
      setUsernameStatus({ state: 'idle', message: '' });
      return undefined;
    }
    const normalized = normalizeUsername(trimmed);
    const sameAsSaved = normalized && normalized === normalizeUsername(profile?.username || '');
    const formatCheck = validateUsername(normalized, { currentUsername: profile?.username || '' });
    if (!formatCheck.valid) {
      usernameCheckSeqRef.current += 1;
      setUsernameStatus({
        state: 'invalid',
        message: USERNAME_ERROR_MESSAGES[formatCheck.error],
      });
      return undefined;
    }
    if (sameAsSaved) {
      usernameCheckSeqRef.current += 1;
      setUsernameStatus({ state: 'available', message: 'Benutzername ist verfügbar.' });
      return undefined;
    }
    const handle = setTimeout(() => {
      runAvailabilityCheck(normalized, uid, profile?.username || '');
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [uid, username, profile?.username, runAvailabilityCheck]);

  const validate = () => {
    const newErrors = {};
    if (!displayName.trim()) {
      newErrors.displayName = 'Name ist erforderlich.';
    } else if (displayName.trim().length > NAME_MAX) {
      newErrors.displayName = `Name darf maximal ${NAME_MAX} Zeichen haben.`;
    }
    const usernameTrimmed = username.trim();
    if (usernameTrimmed) {
      const format = validateUsername(usernameTrimmed, {
        currentUsername: profile?.username || '',
      });
      if (!format.valid) {
        newErrors.username = USERNAME_ERROR_MESSAGES[format.error] || 'Ungültiger Benutzername.';
      } else if (usernameStatus.state === 'taken') {
        newErrors.username = USERNAME_ERROR_MESSAGES.TAKEN;
      }
    }
    if (plainBioLength > BIO_MAX) {
      newErrors.bio = `Bio darf maximal ${BIO_MAX} Zeichen haben.`;
    }
    if (!isValidWebsite(website)) {
      newErrors.website = 'Bitte gib eine gültige URL ein.';
    }
    return newErrors;
  };

  const buildPayload = () => ({
    displayName: displayName.trim(),
    username: normalizeUsername(username),
    bio: stripHtml(bioHtml).trim(),
    bioHtml,
    website: normalizeWebsite(website),
    contact: contact.trim(),
    photoURL: photoURL || null,
    socialMedia: {
      facebook: facebook.trim(),
      instagram: instagram.trim(),
      sharePublicly,
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSuccess(false);

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      await onSave(buildPayload());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Profile save failed:', err);
      setSubmitError('Profil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndView = async () => {
    setSubmitError('');
    setSuccess(false);

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    setDialogOpen(false);
    setDialogMissingFields([]);

    try {
      const payload = buildPayload();
      const newSlug = await onSave(payload);

      const savedProfile = {
        ...profile,
        ...payload,
        slug: newSlug || profile?.slug || '',
        username: payload.username,
      };
      const missing = getMissingProfileFields(savedProfile);

      if (missing.length === 0 && savedProfile.slug) {
        navigate(`/${savedProfile.slug}`);
        return;
      }

      setDialogMissingFields(missing);
      setDialogOpen(true);
    } catch (err) {
      console.error('Profile save failed:', err);
      setSubmitError('Profil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogMissingFields([]);
  };

  const handleBioUpload = (file) => uploadProfileDescriptionImage(file, uid);

  const usernameStatusData =
    usernameStatus.state === 'available'
      ? { kind: 'success', text: usernameStatus.message }
      : usernameStatus.state === 'taken' || usernameStatus.state === 'invalid'
        ? { kind: 'error', text: usernameStatus.message }
        : usernameStatus.state === 'checking'
          ? { kind: 'muted', text: usernameStatus.message }
          : { kind: 'muted', text: 'thetribe.at/' };
  const usernamePreview = username.trim() ? `thetribe.at/${normalizeUsername(username)}` : null;

  return (
    <div className="profile-card" data-testid="profile-form-card">
      <div className="profile-card-header">
        <div className="profile-card-header-text">
          <h2 className="profile-card-title">Profil</h2>
          <p className="profile-card-hint">
            Diese Informationen werden in deinem Profil angezeigt.
          </p>
        </div>
      </div>

      <ProfilePhotoUpload
        uid={uid}
        photoURL={photoURL}
        onUploaded={(url) => setPhotoURL(url)}
        onRemoved={() => setPhotoURL(null)}
      />

      <form onSubmit={handleSubmit} className="profile-form" data-testid="profile-form">
        <div className="form-group">
          <label htmlFor="profile-displayName">Name *</label>
          <input
            id="profile-displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => {
              const next = e.target.value;
              setDisplayName(next);
              // Pre-fill the username from the display name until the user
              // touches the field. After that, leave their typed value alone.
              if (!usernameTouched) {
                setUsername(slugifyName(next));
              }
            }}
            maxLength={NAME_MAX}
            className={errors.displayName ? 'input-error' : ''}
            data-testid="profile-displayName"
            autoComplete="name"
          />
          {errors.displayName && <span className="error-text">{errors.displayName}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="profile-username">Benutzername</label>
          <p className="profile-username-hint">
            Bestimmt die URL deines öffentlichen Profils, z.B. thetribe.at/jane-doe. Wird
            automatisch aus deinem Namen vorgeschlagen — kann aber angepasst werden.
          </p>
          <input
            id="profile-username"
            name="username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsernameTouched(true);
              setUsername(e.target.value);
            }}
            maxLength={USERNAME_MAX}
            spellCheck="false"
            autoCapitalize="none"
            autoCorrect="off"
            className={errors.username ? 'input-error' : ''}
            data-testid="profile-username"
            autoComplete="off"
          />
          <div
            className={`profile-username-status profile-username-status--${usernameStatusData.kind}`}
            data-testid="profile-username-status"
            data-status={usernameStatus.state}
          >
            {usernamePreview && (
              <span className="profile-username-preview" data-testid="profile-username-preview">
                {usernamePreview}
              </span>
            )}
            <span className="profile-username-message">{usernameStatusData.text}</span>
          </div>
          {errors.username && <span className="error-text">{errors.username}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="profile-bio-editor">Kurze Beschreibung</label>
          <RichTextEditorLazy
            id="profile-bio-editor"
            testId="profile-bio-editor"
            value={bioHtml}
            onChange={setBioHtml}
            placeholder="Erzähl etwas über dich (max. 500 Zeichen)"
            maxLength={BIO_MAX}
            hasError={bioOverLimit || Boolean(errors.bio)}
            uploadImage={handleBioUpload}
          />
          {errors.bio && <span className="error-text">{errors.bio}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="profile-website">Link zur Website</label>
          <input
            id="profile-website"
            name="website"
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="www.example.com"
            className={errors.website ? 'input-error' : ''}
            data-testid="profile-website"
            autoComplete="url"
          />
          {errors.website && <span className="error-text">{errors.website}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="profile-contact">Kontaktmöglichkeit</label>
          <input
            id="profile-contact"
            name="contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="z.B. E-Mail oder Telefonnummer"
            data-testid="profile-contact"
            autoComplete="email"
          />
        </div>

        <div className="profile-social-media" data-testid="profile-social-media-section">
          <h3 className="profile-social-media-title">Social Media</h3>
          <p className="profile-social-media-hint">
            Teile gerne deine Social Media Handles mit uns, damit wir dich beim Promoten deiner
            Events leichter finden und taggen können.
          </p>

          <div className="form-group">
            <label htmlFor="profile-facebook">
              <Facebook size={16} aria-hidden="true" />
              <span>Facebook</span>
            </label>
            <input
              id="profile-facebook"
              name="facebook"
              type="text"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              maxLength={SOCIAL_MAX}
              placeholder="Name oder Profil-URL"
              data-testid="profile-facebook"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="profile-instagram">
              <Instagram size={16} aria-hidden="true" />
              <span>Instagram</span>
            </label>
            <input
              id="profile-instagram"
              name="instagram"
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              maxLength={SOCIAL_MAX}
              placeholder="Name oder Profil-URL"
              data-testid="profile-instagram"
              autoComplete="off"
            />
          </div>

          <label
            className="profile-social-media-checkbox"
            data-testid="profile-share-publicly-label"
          >
            <input
              type="checkbox"
              checked={sharePublicly}
              onChange={(e) => setSharePublicly(e.target.checked)}
              data-testid="profile-share-publicly"
            />
            <span>Meine Social Media Links auch öffentlich auf meinem Profil anzeigen.</span>
          </label>
        </div>

        {submitError && <p className="submit-error">{submitError}</p>}
        {success && (
          <p className="success-text" data-testid="profile-save-success">
            Profil gespeichert.
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveAndView}
            disabled={saving}
            data-testid="profile-save-and-view"
          >
            <ExternalLink size={18} aria-hidden="true" />
            <span>{saving ? 'Speichern…' : 'Speichern & Profil anzeigen'}</span>
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            data-testid="profile-save"
          >
            <Save size={18} />
            <span>{saving ? 'Speichern…' : 'Speichern'}</span>
          </button>
        </div>
      </form>

      <ProfileIncompleteDialog
        isOpen={dialogOpen}
        missingFields={dialogMissingFields}
        onClose={closeDialog}
      />
    </div>
  );
}
