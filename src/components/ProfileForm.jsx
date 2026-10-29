import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Facebook, Instagram, Save } from 'lucide-react';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import ProfileIncompleteDialog from './ProfileIncompleteDialog';
import DirectoryListingFields from './DirectoryListingFields';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { validateDirectoryListing } from '../utils/directory';
import RichTextEditorLazy from './RichTextEditorLazy';
import { uploadProfileDescriptionImage } from '../lib/imageUpload';
import { getPlainTextLength, stripHtml } from '../utils/sanitize';
import { getMissingProfileFields, BIO_MAX } from '../utils/profile';
import { slugifyName } from '../lib/slug';
import { validateUsername, normalizeUsername, USERNAME_MIN, USERNAME_MAX } from '../utils/username';
import { isUsernameAvailable } from '../lib/slug';
import { resolveDirectoryRegionIds } from '../utils/regions';
import { useRegionChoices } from '../hooks/useRegionChoices';
import { districtsAfterRegionChange } from '../utils/regionChoices';
import { getAllDistricts } from '../utils/regions';
import { useChatAccess, useOnlineStatusAccess } from '../hooks/useChatSettings';
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
  const [photoFocalPoint, setPhotoFocalPoint] = useState(profile?.photoFocalPoint || null);
  const [photoZoom, setPhotoZoom] = useState(profile?.photoZoom || 1);
  const [facebook, setFacebook] = useState(profile?.socialMedia?.facebook || '');
  const [instagram, setInstagram] = useState(profile?.socialMedia?.instagram || '');
  const [sharePublicly, setSharePublicly] = useState(profile?.socialMedia?.sharePublicly === true);
  const [listedInDirectory, setListedInDirectory] = useState(profile?.listedInDirectory === true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(profile?.showOnlineStatus === true);
  const [allowMentions, setAllowMentions] = useState(profile?.allowMentions === true);
  const [directoryCategories, setDirectoryCategories] = useState(
    profile?.directoryCategories || []
  );
  const [directoryRegions, setDirectoryRegions] = useState(profile?.directoryRegions || []);
  // Region choice for the directory: only with two or more active regions.
  // Keeps regions the profile already has even if they are not selectable.
  const regionChoices = useRegionChoices({ keepRegionId: resolveDirectoryRegionIds(profile) });
  const initialRegionIds = () =>
    profile?.directoryRegionIds?.length || profile?.listedInDirectory === true
      ? resolveDirectoryRegionIds(profile)
      : [regionChoices.defaultRegionId];
  const [directoryRegionIds, setDirectoryRegionIds] = useState(initialRegionIds);
  const handleRegionIdsChange = (ids) => {
    setDirectoryRegionIds(ids);
    setDirectoryRegions((current) => districtsAfterRegionChange(current, ids, regionChoices));
  };
  const { categories: registryCategories } = useCategoryRegistry();
  const { available: onlineStatusAvailable } = useOnlineStatusAccess();
  const { available: chatAvailable } = useChatAccess();

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [wobbling, setWobbling] = useState(false);
  const [invalidTick, setInvalidTick] = useState(0);
  const formRef = useRef(null);
  const wobbleTimerRef = useRef(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMissingFields, setDialogMissingFields] = useState([]);
  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle',
    message: '',
  });

  const navigate = useNavigate();
  // Offer the registry's categories, plus any already-saved one an admin has
  // since renamed/removed so the user can still see and deselect it.
  const directoryCategoryOptions = [
    ...registryCategories.map((cat) => cat.name),
    ...directoryCategories.filter((name) => !registryCategories.some((cat) => cat.name === name)),
  ];
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
    setPhotoFocalPoint(profile.photoFocalPoint || null);
    setPhotoZoom(profile.photoZoom || 1);
    setFacebook(profile.socialMedia?.facebook || '');
    setInstagram(profile.socialMedia?.instagram || '');
    setSharePublicly(profile.socialMedia?.sharePublicly === true);
    setListedInDirectory(profile.listedInDirectory === true);
    setShowOnlineStatus(profile.showOnlineStatus === true);
    setAllowMentions(profile.allowMentions === true);
    setDirectoryCategories(profile.directoryCategories || []);
    setDirectoryRegions(profile.directoryRegions || []);
    setDirectoryRegionIds(
      profile.directoryRegionIds?.length || profile.listedInDirectory === true
        ? resolveDirectoryRegionIds(profile)
        : [regionChoices.defaultRegionId]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const directoryErrors = validateDirectoryListing({
      listed: listedInDirectory,
      categories: directoryCategories,
      regions: directoryRegions,
      hasBio: getPlainTextLength(bioHtml) > 0,
      // Districts that only exist in Firestore (e.g. Tirol) are valid too.
      extraRegions: getAllDistricts(regionChoices.allRegions),
    });
    if (regionChoices.enabled && listedInDirectory && directoryRegionIds.length === 0) {
      newErrors.directoryRegionIds =
        'Bitte wähle mindestens eine Region, damit du im Verzeichnis erscheinst.';
    }
    if (directoryErrors.categories) newErrors.directoryCategories = directoryErrors.categories;
    if (directoryErrors.regions) newErrors.directoryRegions = directoryErrors.regions;
    if (directoryErrors.bio && !newErrors.bio) newErrors.bio = directoryErrors.bio;
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
    photoFocalPoint: photoURL ? photoFocalPoint : null,
    photoZoom: photoURL && photoZoom > 1 ? photoZoom : null,
    socialMedia: {
      facebook: facebook.trim(),
      instagram: instagram.trim(),
      sharePublicly,
    },
    listedInDirectory,
    directoryCategories,
    directoryRegions,
    // Without a region picker (one active region) the stored ids stay, default Vorarlberg.
    directoryRegionIds: regionChoices.enabled
      ? directoryRegionIds
      : resolveDirectoryRegionIds(profile),
    showOnlineStatus,
    allowMentions,
  });

  // Same feedback as the event wizard: wobbling button, hint text above it and
  // the first invalid field scrolled into view and focused.
  const showInvalidFeedback = (newErrors) => {
    setErrors(newErrors);
    setSubmitError('Bitte fülle alle Pflichtfelder aus.');
    setWobbling(false);
    clearTimeout(wobbleTimerRef.current);
    requestAnimationFrame(() => {
      setWobbling(true);
      wobbleTimerRef.current = setTimeout(() => setWobbling(false), 850);
    });
    setInvalidTick((t) => t + 1);
  };

  useEffect(() => {
    if (invalidTick === 0) return;
    const target =
      formRef.current?.querySelector('.input-error, .rte-wrapper--error') ||
      formRef.current?.querySelector('.error-text');
    if (!target) return;
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const focusable = target.matches('input, textarea, select')
      ? target
      : target.querySelector('input, textarea, select, [contenteditable="true"]');
    focusable?.focus?.({ preventScroll: true });
  }, [invalidTick]);

  useEffect(() => () => clearTimeout(wobbleTimerRef.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSuccess(false);

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      showInvalidFeedback(newErrors);
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
      showInvalidFeedback(newErrors);
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
        focalPoint={photoFocalPoint}
        onFocalPointChange={setPhotoFocalPoint}
        zoom={photoZoom}
        onZoomChange={setPhotoZoom}
        onUploaded={(url) => {
          setPhotoURL(url);
          setPhotoFocalPoint(null);
          setPhotoZoom(1);
        }}
        onRemoved={() => {
          setPhotoURL(null);
          setPhotoFocalPoint(null);
          setPhotoZoom(1);
        }}
      />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="profile-form"
        data-testid="profile-form"
      >
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

        {onlineStatusAvailable && (
          <div className="form-group profile-online-status">
            <label
              className="profile-social-media-checkbox"
              data-testid="profile-online-status-label"
            >
              <input
                type="checkbox"
                checked={showOnlineStatus}
                onChange={(e) => setShowOnlineStatus(e.target.checked)}
                data-testid="profile-online-status"
              />
              <span>Meinen Online-Status anzeigen</span>
            </label>
            <p className="profile-social-media-hint">
              Andere angemeldete Mitglieder sehen dann neben deinem Foto einen grünen Punkt, wenn du
              gerade auf der Seite bist, sonst einen roten. Zum Beispiel im Verzeichnis und im
              Postfach. Ist die Option aus (Standard), gibt es keinen Punkt. Im Lagerfeuer sieht man
              aber immer, wer gerade im Chat ist.
            </p>
          </div>
        )}

        {chatAvailable && (
          <div className="form-group profile-allow-mentions">
            <label
              className="profile-social-media-checkbox"
              data-testid="profile-allow-mentions-label"
            >
              <input
                type="checkbox"
                checked={allowMentions}
                onChange={(e) => setAllowMentions(e.target.checked)}
                data-testid="profile-allow-mentions"
              />
              <span>Andere dürfen mich erwähnen</span>
            </label>
            <p className="profile-social-media-hint">
              Im Lagerfeuer und in den Kerzenräumen können dich andere mit @Name erwähnen. Du siehst
              das dann oben in der Glocke und kommst mit einem Klick zur Nachricht. Dein Name taucht
              dafür in der Namenssuche auf. Ist die Option aus (Standard), kann dich niemand
              erwähnen. Erwähnungen gibt es nur in öffentlichen Räumen, nicht im Postfach, und es
              werden keine E-Mails verschickt.
            </p>
          </div>
        )}

        <DirectoryListingFields
          listed={listedInDirectory}
          onListedChange={setListedInDirectory}
          categories={directoryCategories}
          onCategoriesChange={setDirectoryCategories}
          regions={directoryRegions}
          onRegionsChange={setDirectoryRegions}
          availableCategories={directoryCategoryOptions}
          regionChoices={regionChoices}
          regionIds={directoryRegionIds}
          onRegionIdsChange={handleRegionIdsChange}
          errors={{
            categories: errors.directoryCategories,
            regions: errors.directoryRegions,
            regionIds: errors.directoryRegionIds,
          }}
        />

        {submitError && (
          <p className="submit-error" role="alert" data-testid="profile-submit-error">
            {submitError}
          </p>
        )}
        {success && (
          <p className="success-text" data-testid="profile-save-success">
            Profil gespeichert.
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className={`btn btn-secondary ${wobbling ? 'btn-wobble' : ''}`}
            onClick={handleSaveAndView}
            disabled={saving}
            data-testid="profile-save-and-view"
          >
            <ExternalLink size={18} aria-hidden="true" />
            <span>{saving ? 'Speichern…' : 'Speichern & Profil anzeigen'}</span>
          </button>
          <button
            type="submit"
            className={`btn btn-primary ${wobbling ? 'btn-wobble' : ''}`}
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
