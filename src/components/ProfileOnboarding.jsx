import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import DirectoryListingFields from './DirectoryListingFields';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { validateDirectoryListing } from '../utils/directory';
import {
  ONBOARDING_BIO_STARTERS,
  ONBOARDING_STEPS,
  getOnboardingProgress,
} from '../utils/onboarding';
import { BIO_MAX } from '../utils/profile';
import { messageToHtml } from '../utils/sanitize';
import './ConfirmDialog.css';
import './ProfileOnboarding.css';

const STEP_COPY = [
  {
    title: 'Zeig dein Gesicht',
    text: 'Mit einem Foto erkennen dich andere im Lagerfeuer, in den Kerzenräumen und im Verzeichnis sofort wieder.',
  },
  {
    title: 'Sag kurz, wer du bist',
    text: 'Ein, zwei Sätze genügen. Das macht den Anfang leicht für alle, die dir begegnen.',
  },
  {
    title: 'Lass dich finden',
    text: 'Im Verzeichnis finden Menschen, was du anbietest. Das ist freiwillig, du kannst es jederzeit ändern.',
  },
];

// Wizard in three small steps (photo, description, directory). Every step saves
// on its own, so closing midway never loses what is done. `profile` is the live
// profile doc, which drives the progress bar.
export default function ProfileOnboarding({ profile, uid, defaultName = '', onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [photoURL, setPhotoURL] = useState(profile?.photoURL || null);
  const [photoFocalPoint, setPhotoFocalPoint] = useState(profile?.photoFocalPoint || null);
  const [photoZoom, setPhotoZoom] = useState(profile?.photoZoom || 1);
  const [bio, setBio] = useState(profile?.bio || '');

  const { categories: registryCategories } = useCategoryRegistry();
  const [listed, setListed] = useState(profile?.listedInDirectory === true);
  const [categories, setCategories] = useState(profile?.directoryCategories || []);
  const [regions, setRegions] = useState(profile?.directoryRegions || []);
  const [directoryErrors, setDirectoryErrors] = useState({});

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const progress = getOnboardingProgress(profile);
  const finished = step >= ONBOARDING_STEPS.length;
  const categoryOptions = [
    ...registryCategories.map((cat) => cat.name),
    ...categories.filter((name) => !registryCategories.some((cat) => cat.name === name)),
  ];

  // The users doc requires displayName and bio on every write.
  const base = { displayName: profile?.displayName || defaultName || '', bio: profile?.bio || '' };

  const persist = async (updates) => {
    setSaving(true);
    setError('');
    try {
      await onSave({ ...base, ...updates });
      return true;
    } catch (err) {
      console.error('Onboarding save failed:', err);
      setError('Das hat leider nicht geklappt. Bitte versuche es noch einmal.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    setError('');
    setStep((current) => current + 1);
  };

  const handleNext = async () => {
    if (step === 0) {
      const changed = (photoURL || null) !== (profile?.photoURL || null);
      if (changed) {
        const ok = await persist({
          photoURL: photoURL || null,
          photoFocalPoint: photoURL ? photoFocalPoint : null,
          photoZoom: photoURL && photoZoom > 1 ? photoZoom : null,
        });
        if (!ok) return;
      }
      next();
    } else if (step === 1) {
      const text = bio.trim();
      if (text !== (profile?.bio || '').trim()) {
        const ok = await persist({ bio: text, bioHtml: messageToHtml(text) });
        if (!ok) return;
      }
      next();
    } else if (step === 2) {
      if (listed) {
        const errors = validateDirectoryListing({
          listed,
          categories,
          regions,
          hasBio: Boolean(profile?.bio?.trim()),
        });
        const result = {};
        if (errors.categories) result.categories = errors.categories;
        if (errors.regions) result.regions = errors.regions;
        if (errors.bio) {
          setError(
            'Für den Verzeichnis-Eintrag braucht es eine Kurzbeschreibung. Geh bitte einen Schritt zurück.'
          );
          return;
        }
        setDirectoryErrors(result);
        if (Object.keys(result).length > 0) return;
      }
      setDirectoryErrors({});
      if (listed || profile?.listedInDirectory === true) {
        const ok = await persist({
          listedInDirectory: listed,
          directoryCategories: listed ? categories : profile?.directoryCategories || [],
          directoryRegions: listed ? regions : profile?.directoryRegions || [],
        });
        if (!ok) return;
      }
      next();
    }
  };

  return (
    <div className="confirm-overlay fade-enter" data-testid="profile-onboarding">
      <div
        className="confirm-dialog onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
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
            <div className="onboarding-progress-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="onboarding-progress-label" data-testid="onboarding-percent">
            Dein Profil ist zu {progress.percent} % fertig
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
            <Sparkles size={36} className="onboarding-sparkle" aria-hidden="true" />
            <h2 id="onboarding-title">
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
            <h2 id="onboarding-title">{STEP_COPY[step].title}</h2>
            <p>{STEP_COPY[step].text}</p>

            {step === 0 && (
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
                onClick={next}
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
