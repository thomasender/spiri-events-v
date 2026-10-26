import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Check, Loader2, X } from 'lucide-react';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import DirectoryListingFields from './DirectoryListingFields';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { deleteImageByUrl } from '../lib/imageUpload';
import { validateDirectoryListing } from '../utils/directory';
import { normalizeInstagramHandle } from '../utils/instagramHandle';
import {
  ONBOARDING_BIO_STARTERS,
  ONBOARDING_STEPS,
  getOnboardingProgress,
} from '../utils/onboarding';
import { BIO_MAX } from '../utils/profile';
import { messageToHtml } from '../utils/sanitize';
import './ConfirmDialog.css';
import './ProfileForm.css';
import './ProfileOnboarding.css';

// `hint` is an invitation, not a claim: no numbers, no promises.
const STEP_COPY = [
  {
    title: 'Zeig dein Gesicht',
    text: 'Mit einem Foto erkennen dich andere in der Community sofort wieder.',
    hint: 'Ein freundliches Gesicht lädt dazu ein, dein Profil anzuschauen.',
  },
  {
    title: 'Sag kurz, wer du bist',
    text: 'Ein, zwei Sätze genügen. Das macht den Anfang leicht für alle, die dir begegnen.',
    hint: 'Schon ein paar Worte helfen anderen, dich kennenzulernen.',
  },
  {
    title: 'Lass dich finden',
    text: 'Im Verzeichnis finden Menschen, was du anbietest. Das ist freiwillig, du kannst es jederzeit ändern.',
    hint: 'So können Menschen dich entdecken, wenn sie nach dem suchen, was du anbietest.',
  },
  {
    title: 'Bist du auf Instagram?',
    text: 'Wenn wir deine Events auf unserem Instagram-Kanal @tribevorarlberg vorstellen, markieren wir dich gern mit deinem Instagram-Namen.',
    hint: 'Beides ist freiwillig und lässt sich jederzeit in deinem Profil ändern.',
  },
];

const INSTAGRAM_INVALID = 'Bitte gib einen gültigen Instagram-Namen ein, z. B. @deinname.';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Wizard in four small steps (photo, description, directory, Instagram). Every step saves
// on its own, so closing midway never loses what is done. `profile` is the live
// profile doc; the progress bar additionally counts what is typed or picked but
// not saved yet. "Überspringen" drops the draft of the current step, so the bar
// never promises more than what is stored.
export default function ProfileOnboarding({ profile, uid, defaultName = '', onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [gain, setGain] = useState(null);

  // What is stored right now (starts from the profile, follows our own saves).
  const [saved, setSaved] = useState(() => ({
    photoURL: profile?.photoURL || null,
    photoFocalPoint: profile?.photoFocalPoint || null,
    photoZoom: profile?.photoZoom || 1,
    bio: profile?.bio || '',
    listed: profile?.listedInDirectory === true,
    categories: profile?.directoryCategories || [],
    regions: profile?.directoryRegions || [],
    instagram: profile?.socialMedia?.instagram || '',
  }));
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const [photoURL, setPhotoURL] = useState(saved.photoURL);
  const [photoFocalPoint, setPhotoFocalPoint] = useState(saved.photoFocalPoint);
  const [photoZoom, setPhotoZoom] = useState(saved.photoZoom);
  const [bio, setBio] = useState(saved.bio);

  const { categories: registryCategories } = useCategoryRegistry();
  const [listed, setListed] = useState(saved.listed);
  const [categories, setCategories] = useState(saved.categories);
  const [regions, setRegions] = useState(saved.regions);
  const [directoryErrors, setDirectoryErrors] = useState({});

  const [instagram, setInstagram] = useState(saved.instagram);
  // Checked by default: the step asks for permission to promote the events.
  const [instagramConsent, setInstagramConsent] = useState(true);
  const [instagramError, setInstagramError] = useState('');
  const completedRef = useRef(false);

  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const stepMounted = useRef(false);
  // Photos uploaded in this session. Storage gets the file on upload, but the
  // profile only on "Weiter"; whatever never reaches the profile is deleted.
  const uploadedRef = useRef(new Set());

  // Deletes every upload of this session except `keepUrl` and what the profile stores.
  const discardUnsavedUploads = (keepUrl) => {
    for (const url of [...uploadedRef.current]) {
      if (url === keepUrl || url === savedRef.current.photoURL) continue;
      uploadedRef.current.delete(url);
      deleteImageByUrl(url);
    }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      discardUnsavedUploads(null);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  // Screen readers should hear the new step; sighted users keep their place.
  useEffect(() => {
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    titleRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!gain) return undefined;
    const timer = setTimeout(() => setGain(null), 2500);
    return () => clearTimeout(timer);
  }, [gain]);

  const draft = {
    photoURL,
    bio,
    listedInDirectory: listed && categories.length > 0,
    socialMedia: { instagram },
  };
  const progress = getOnboardingProgress(draft);
  const finished = step >= ONBOARDING_STEPS.length;
  const categoryOptions = [
    ...registryCategories.map((cat) => cat.name),
    ...categories.filter((name) => !registryCategories.some((cat) => cat.name === name)),
  ];
  // Listing needs a description: offer the field right here instead of sending
  // people back a step.
  const needsBioHere = listed && !saved.bio.trim();

  // The users doc requires displayName and bio on every write.
  const base = { displayName: profile?.displayName || defaultName || '', bio: saved.bio };

  const persist = async (updates, nextSaved) => {
    setSaving(true);
    setError('');
    try {
      await onSave({ ...base, ...updates });
      setSaved((current) => ({ ...current, ...nextSaved }));
      return true;
    } catch (err) {
      console.error('Onboarding save failed:', err);
      setError('Das hat leider nicht geklappt. Bitte versuche es noch einmal.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Reaching the end (whatever was skipped) finishes the onboarding for good,
  // on every device. Closing earlier does not. The last step never changes the
  // description, so `base` is current here.
  const next = () => {
    setError('');
    if (step === ONBOARDING_STEPS.length - 1 && !completedRef.current) {
      completedRef.current = true;
      Promise.resolve(onSave({ ...base, onboardingCompleted: true })).catch((err) =>
        console.warn('Could not store onboarding completion:', err)
      );
    }
    setStep((current) => current + 1);
  };

  // Gentle "+33 %" after a step that added something.
  const celebrate = (before, afterDraft) => {
    const delta = getOnboardingProgress(afterDraft).percent - getOnboardingProgress(before).percent;
    if (delta > 0) setGain({ delta, id: Date.now() });
  };

  const savedAsProfile = () => ({
    photoURL: saved.photoURL,
    bio: saved.bio,
    listedInDirectory: saved.listed && saved.categories.length > 0,
    socialMedia: { instagram: saved.instagram },
  });

  const handleSkip = () => {
    // Drop the draft of this step.
    if (step === 0) {
      discardUnsavedUploads(null);
      setPhotoURL(saved.photoURL);
      setPhotoFocalPoint(saved.photoFocalPoint);
      setPhotoZoom(saved.photoZoom);
    } else if (step === 1) {
      setBio(saved.bio);
    } else if (step === 2) {
      setListed(saved.listed);
      setCategories(saved.categories);
      setRegions(saved.regions);
      setBio(saved.bio);
      setDirectoryErrors({});
    } else if (step === 3) {
      setInstagram(saved.instagram);
      setInstagramError('');
    }
    next();
  };

  const handleNext = async () => {
    if (step === 0) {
      const changed = (photoURL || null) !== (saved.photoURL || null);
      if (changed) {
        const zoom = photoURL && photoZoom > 1 ? photoZoom : null;
        const focal = photoURL ? photoFocalPoint : null;
        const ok = await persist(
          { photoURL: photoURL || null, photoFocalPoint: focal, photoZoom: zoom },
          { photoURL: photoURL || null, photoFocalPoint: focal, photoZoom: zoom || 1 }
        );
        if (!ok) return;
        // The replaced upload is no longer referenced by the profile.
        discardUnsavedUploads(photoURL);
        celebrate(savedAsProfile(), { ...savedAsProfile(), photoURL });
      }
      next();
    } else if (step === 1) {
      const text = bio.trim();
      if (text !== saved.bio.trim()) {
        const ok = await persist({ bio: text, bioHtml: messageToHtml(text) }, { bio: text });
        if (!ok) return;
        celebrate(savedAsProfile(), { ...savedAsProfile(), bio: text });
      }
      next();
    } else if (step === 2) {
      const text = bio.trim();
      if (listed) {
        const errors = validateDirectoryListing({
          listed,
          categories,
          regions,
          hasBio: Boolean(text),
        });
        const result = {};
        if (errors.categories) result.categories = errors.categories;
        if (errors.regions) result.regions = errors.regions;
        if (errors.bio) result.bio = errors.bio;
        setDirectoryErrors(result);
        if (Object.keys(result).length > 0) return;
      }
      setDirectoryErrors({});
      if (listed || saved.listed) {
        const bioChanged = text !== saved.bio.trim();
        const ok = await persist(
          {
            ...(bioChanged ? { bio: text, bioHtml: messageToHtml(text) } : {}),
            listedInDirectory: listed,
            directoryCategories: listed ? categories : saved.categories,
            directoryRegions: listed ? regions : saved.regions,
          },
          {
            ...(bioChanged ? { bio: text } : {}),
            listed,
            categories: listed ? categories : saved.categories,
            regions: listed ? regions : saved.regions,
          }
        );
        if (!ok) return;
        celebrate(savedAsProfile(), {
          ...savedAsProfile(),
          bio: text,
          listedInDirectory: listed && categories.length > 0,
        });
      }
      next();
    } else if (step === 3) {
      const raw = instagram.trim();
      const handle = raw ? normalizeInstagramHandle(raw) : '';
      if (handle === null) {
        setInstagramError(INSTAGRAM_INVALID);
        return;
      }
      setInstagramError('');
      const handleChanged = handle !== (normalizeInstagramHandle(saved.instagram) || '');
      const ok = await persist(
        {
          instagramConsentDefault: instagramConsent,
          ...(handleChanged
            ? {
                // Same shape as the profile form; facebook and the public
                // sharing choice stay as they are.
                socialMedia: {
                  facebook: profile?.socialMedia?.facebook || '',
                  instagram: handle,
                  sharePublicly: profile?.socialMedia?.sharePublicly === true,
                },
              }
            : {}),
        },
        handleChanged ? { instagram: handle } : {}
      );
      if (!ok) return;
      setInstagram(handle);
      if (handleChanged) {
        celebrate(savedAsProfile(), { ...savedAsProfile(), socialMedia: { instagram: handle } });
      }
      next();
    }
  };

  // Escape closes like the X; Tab stays inside the dialog. The native photo
  // adjust dialog (a <dialog> inside) handles both for itself.
  const handleKeyDown = (event) => {
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.closest('dialog')
    );
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="confirm-overlay fade-enter" data-testid="profile-onboarding">
      <div
        ref={dialogRef}
        className="confirm-dialog onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className="confirm-close"
          onClick={onClose}
          aria-label="Schließen"
          data-testid="onboarding-close"
        >
          <X size={20} />
        </button>

        <div
          className="onboarding-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label="Fortschritt deines Profils"
        >
          <div className="onboarding-progress-track">
            <div
              className={`onboarding-progress-bar${
                progress.count === progress.total ? ' onboarding-progress-bar--full' : ''
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="onboarding-progress-label" data-testid="onboarding-percent">
            Dein Profil ist zu {progress.percent} % fertig
            {gain && (
              <span key={gain.id} className="onboarding-gain" data-testid="onboarding-gain">
                +{gain.delta} %
              </span>
            )}
          </span>
        </div>

        <ol className="onboarding-steps" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, index) => (
            <li
              key={s.id}
              className={`onboarding-step${index === step ? ' onboarding-step--current' : ''}${
                progress.done[s.id] ? ' onboarding-step--done' : ''
              }`}
            >
              <span className="onboarding-step-dot">
                {progress.done[s.id] ? <Check size={14} /> : index + 1}
              </span>
              {s.label}
            </li>
          ))}
        </ol>

        {finished ? (
          <div className="onboarding-body onboarding-finish" data-testid="onboarding-finish">
            {progress.count === progress.total && (
              <div className="onboarding-badge" data-testid="onboarding-badge">
                <Award size={20} aria-hidden="true" />
                <span>Profil vollständig</span>
              </div>
            )}
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              {progress.count === progress.total ? 'Wunderbar, du bist komplett!' : 'Danke dir!'}
            </h2>
            <p>
              {progress.count === progress.total
                ? 'Dein Profil ist vollständig. Schön, dass du da bist.'
                : 'Den Rest kannst du jederzeit in deinem Profil ergänzen.'}
            </p>
            <div className="confirm-actions">
              <Link to="/profil" className="btn btn-secondary" onClick={onClose}>
                Mein Profil
              </Link>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Fertig
              </button>
            </div>
          </div>
        ) : (
          <div className="onboarding-body">
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              {STEP_COPY[step].title}
            </h2>
            <p>{STEP_COPY[step].text}</p>
            <p className="onboarding-hint" data-testid="onboarding-hint">
              {STEP_COPY[step].hint}
            </p>

            {step === 0 && (
              <ProfilePhotoUpload
                uid={uid}
                photoURL={photoURL}
                focalPoint={photoFocalPoint}
                onFocalPointChange={setPhotoFocalPoint}
                zoom={photoZoom}
                onZoomChange={setPhotoZoom}
                onUploaded={(url) => {
                  uploadedRef.current.add(url);
                  discardUnsavedUploads(url);
                  setPhotoURL(url);
                  setPhotoFocalPoint(null);
                  setPhotoZoom(1);
                }}
                onRemoved={() => {
                  discardUnsavedUploads(null);
                  setPhotoURL(null);
                  setPhotoFocalPoint(null);
                  setPhotoZoom(1);
                }}
              />
            )}

            {step === 1 && (
              <div className="form-group">
                <textarea
                  id="onboarding-bio"
                  aria-label="Kurze Beschreibung"
                  data-testid="onboarding-bio"
                  rows={4}
                  maxLength={BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Erzähl etwas über dich"
                />
                <div className="onboarding-starters">
                  <span>Als Anregung:</span>
                  {ONBOARDING_BIO_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      className="directory-chip"
                      onClick={() => setBio((current) => (current.trim() ? current : starter))}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && needsBioHere && (
              <div className="form-group onboarding-bio-inline">
                <label htmlFor="onboarding-bio-directory">
                  Kurzbeschreibung für dein Verzeichnis-Profil
                </label>
                <textarea
                  id="onboarding-bio-directory"
                  data-testid="onboarding-bio-directory"
                  rows={3}
                  maxLength={BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ein, zwei Sätze zu dir und deinem Angebot"
                  aria-invalid={directoryErrors.bio ? 'true' : undefined}
                />
                {directoryErrors.bio && (
                  <p className="submit-error" role="alert">
                    {directoryErrors.bio}
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <DirectoryListingFields
                listed={listed}
                onListedChange={setListed}
                categories={categories}
                onCategoriesChange={setCategories}
                regions={regions}
                onRegionsChange={setRegions}
                availableCategories={categoryOptions}
                errors={directoryErrors}
              />
            )}

            {step === 3 && (
              <>
                <div className="form-group">
                  <label htmlFor="onboarding-instagram">Dein Instagram-Name</label>
                  <input
                    id="onboarding-instagram"
                    type="text"
                    data-testid="onboarding-instagram"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@deinname"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={instagramError ? 'true' : undefined}
                  />
                  {instagramError && (
                    <p className="submit-error" role="alert">
                      {instagramError}
                    </p>
                  )}
                </div>
                <label className="notification-preference-label">
                  <input
                    type="checkbox"
                    checked={instagramConsent}
                    onChange={(e) => setInstagramConsent(e.target.checked)}
                    data-testid="onboarding-instagram-consent"
                  />
                  <span className="notification-preference-text">
                    <span className="notification-preference-name">
                      Ihr dürft meine Events auf Instagram vorstellen
                    </span>
                    <span className="notification-preference-description">
                      Das Häkchen ist dann bei jedem neuen Event schon gesetzt. Du kannst es pro
                      Event ändern.
                    </span>
                  </span>
                </label>
              </>
            )}

            {error && (
              <p className="submit-error" role="alert">
                {error}
              </p>
            )}

            <div className="confirm-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(step - 1)}
                  disabled={saving}
                >
                  Zurück
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSkip}
                disabled={saving}
                data-testid="onboarding-skip"
              >
                Überspringen
              </button>
              <button
                type="button"
                className="btn btn-primary confirm-confirm"
                onClick={handleNext}
                disabled={saving}
                data-testid="onboarding-next"
              >
                {saving && <Loader2 size={16} className="spin" aria-hidden="true" />}
                <span>{step === ONBOARDING_STEPS.length - 1 ? 'Fertig' : 'Weiter'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
