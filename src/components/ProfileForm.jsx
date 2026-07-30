import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import './ProfileForm.css';

const BIO_MAX = 500;
const NAME_MAX = 80;

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

export default function ProfileForm({ profile, uid, onSave }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [website, setWebsite] = useState(profile?.website || '');
  const [contact, setContact] = useState(profile?.contact || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || null);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setWebsite(profile.website || '');
    setContact(profile.contact || '');
    setPhotoURL(profile.photoURL || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName, profile?.bio, profile?.website, profile?.contact, profile?.photoURL]);

  const validate = () => {
    const newErrors = {};
    if (!displayName.trim()) {
      newErrors.displayName = 'Name ist erforderlich.';
    } else if (displayName.trim().length > NAME_MAX) {
      newErrors.displayName = `Name darf maximal ${NAME_MAX} Zeichen haben.`;
    }
    if (bio.length > BIO_MAX) {
      newErrors.bio = `Bio darf maximal ${BIO_MAX} Zeichen haben.`;
    }
    if (!isValidWebsite(website)) {
      newErrors.website = 'Bitte gib eine gültige URL ein.';
    }
    return newErrors;
  };

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
      await onSave({
        displayName: displayName.trim(),
        bio: bio.trim(),
        website: normalizeWebsite(website),
        contact: contact.trim(),
        photoURL: photoURL || null,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Profile save failed:', err);
      setSubmitError('Profil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card" data-testid="profile-form-card">
      <h2 className="profile-card-title">Profil</h2>
      <p className="profile-card-hint">Diese Informationen werden in deinem Profil angezeigt.</p>

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
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={NAME_MAX}
            className={errors.displayName ? 'input-error' : ''}
            data-testid="profile-displayName"
            autoComplete="name"
          />
          {errors.displayName && <span className="error-text">{errors.displayName}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="profile-bio">Kurze Beschreibung</label>
          <textarea
            id="profile-bio"
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={BIO_MAX}
            rows={4}
            className={errors.bio ? 'input-error' : ''}
            data-testid="profile-bio"
            placeholder="Erzähl etwas über dich (max. 500 Zeichen)"
          />
          <span
            className={`field-counter ${bio.length >= BIO_MAX ? 'over-limit' : ''}`}
            data-testid="profile-bio-counter"
          >
            {bio.length} / {BIO_MAX}
          </span>
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

        {submitError && <p className="submit-error">{submitError}</p>}
        {success && (
          <p className="success-text" data-testid="profile-save-success">
            Profil gespeichert.
          </p>
        )}

        <div className="form-actions">
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
    </div>
  );
}
