import './InstagramConsentField.css';
import { normalizeInstagramHandle } from '../utils/instagramHandle';

export const INSTAGRAM_ACCOUNT = '@tribevorarlberg_';

/**
 * Opt-in checkbox for posting an event on the Instagram channel and tagging
 * the organizer. Controlled; the parent owns the value.
 */
export default function InstagramConsentField({ checked, onChange, instagramHandle }) {
  const handle = normalizeInstagramHandle(instagramHandle);
  return (
    <div className="form-group instagram-consent" data-testid="instagram-consent">
      <label className="checkbox-label checkbox-label--block" htmlFor="instagramConsent">
        <input
          id="instagramConsent"
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          data-testid="instagram-consent-checkbox"
        />
        <span>
          Mein Event darf auf dem Instagram-Kanal {INSTAGRAM_ACCOUNT} veröffentlicht werden. Mein
          Instagram-Profil darf dabei markiert und als Co-Autor (Collab) zum Beitrag eingeladen
          werden.
        </span>
      </label>
      <p className="instagram-consent-hint" data-testid="instagram-consent-hint">
        {handle
          ? `Zum Markieren und Einladen verwenden wir deinen Instagram-Namen aus deinem Profil (${handle}). Du musst die Collab-Einladung in Instagram noch annehmen.`
          : 'Tipp: Trage in deinem Profil deinen Instagram-Namen ein, dann können wir dich markieren und als Co-Autor einladen.'}
      </p>
    </div>
  );
}
