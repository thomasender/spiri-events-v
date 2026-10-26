import { useEffect, useId, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import HelperPhotoUpload from './HelperPhotoUpload';
import { useRegion } from '../hooks/useRegion';
import { COUNTRIES, COUNTRY_LABELS } from '../utils/regions';
import {
  APPLICATION_MESSAGE_MAX,
  sendModeratorApplication,
  validateApplicationForm,
} from '../lib/moderatorApplication';
import './ModeratorApplyCard.css';

/**
 * Invitation to become a Regions-Moderator:in with a short application form
 * (name, reply address, a few lines, optional photo). The application is mailed
 * to the admins. Shown on the region page and on the coming-soon pages.
 * `regionId` preselects the region the visitor is looking at.
 */
export default function ModeratorApplyCard({ regionId = '', className = '' }) {
  const { allRegions = [] } = useRegion();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [region, setRegion] = useState(regionId);
  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent | failed

  const [photoPreview, setPhotoPreview] = useState('');
  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== 'function') {
      setPhotoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validateApplicationForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStatus('sending');
    try {
      await sendModeratorApplication({ ...form, regionId: region, photo });
      setStatus('sent');
    } catch (err) {
      console.error('Moderator application failed:', err);
      setStatus('failed');
    }
  };

  const regionOptions = COUNTRIES.map((country) => ({
    country,
    regions: allRegions.filter((r) => r.country === country),
  })).filter((g) => g.regions.length > 0);

  return (
    <section
      className={`moderator-apply ${className}`.trim()}
      data-testid="moderator-apply"
      aria-labelledby={`${uid}-title`}
    >
      <div className="moderator-apply-intro">
        <HeartHandshake size={28} aria-hidden="true" className="moderator-apply-icon" />
        <div>
          <h3 id={`${uid}-title`} className="moderator-apply-title">
            Du möchtest deine Region mitgestalten?
          </h3>
          <p className="moderator-apply-text">
            Wir suchen Moderator:innen, die in ihrer Region bewusste Events sammeln, freigeben und
            die Community lebendig halten. Melde dich bei uns: ein paar Zeilen über dich und ein
            Foto genügen.
          </p>
        </div>
      </div>

      {status === 'sent' ? (
        <p className="moderator-apply-success" role="status" data-testid="moderator-apply-sent">
          Danke für deine Nachricht! Wir haben sie erhalten und melden uns bald bei dir.
        </p>
      ) : !open ? (
        <button
          type="button"
          className="btn btn-primary moderator-apply-open"
          onClick={() => setOpen(true)}
          aria-expanded="false"
        >
          Moderator:in werden
        </button>
      ) : (
        <form className="moderator-apply-form" onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor={`${uid}-name`}>Dein Name *</label>
            <input
              id={`${uid}-name`}
              type="text"
              value={form.name}
              onChange={set('name')}
              autoComplete="name"
              className={errors.name ? 'input-error' : ''}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          <div className="form-group">
            <label htmlFor={`${uid}-email`}>Deine E-Mail-Adresse für die Antwort *</label>
            <input
              id={`${uid}-email`}
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              className={errors.email ? 'input-error' : ''}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>
          <div className="form-group">
            <label htmlFor={`${uid}-region`}>Region (optional)</label>
            <select id={`${uid}-region`} value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Keine bestimmte Region</option>
              {regionOptions.map((g) => (
                <optgroup key={g.country} label={COUNTRY_LABELS[g.country]}>
                  {g.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={`${uid}-message`}>Erzähl uns kurz von dir *</label>
            <textarea
              id={`${uid}-message`}
              rows={5}
              value={form.message}
              onChange={set('message')}
              maxLength={APPLICATION_MESSAGE_MAX}
              placeholder="Wer bist du, was verbindet dich mit deiner Region und warum möchtest du Moderator:in werden?"
              className={errors.message ? 'input-error' : ''}
            />
            {errors.message && <span className="error-text">{errors.message}</span>}
          </div>
          <div className="form-group">
            <label htmlFor={`${uid}-photo`}>Foto (optional)</label>
            <HelperPhotoUpload
              photoURL={photoPreview}
              alt="Dein Foto"
              inputId={`${uid}-photo`}
              onFileSelected={setPhoto}
              onRemoved={() => setPhoto(null)}
              disabled={status === 'sending'}
            />
          </div>
          {/* Honeypot: invisible for people, bots fill it in. */}
          <div className="moderator-apply-hp" aria-hidden="true">
            <label htmlFor={`${uid}-website`}>Website</label>
            <input
              id={`${uid}-website`}
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={set('website')}
            />
          </div>
          {status === 'failed' && (
            <p className="error-text" role="alert">
              Das Senden hat leider nicht geklappt. Bitte versuche es später noch einmal.
            </p>
          )}
          <div className="moderator-apply-actions">
            <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Wird gesendet …' : 'Bewerbung senden'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
              disabled={status === 'sending'}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
