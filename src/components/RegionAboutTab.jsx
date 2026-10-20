import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Upload } from 'lucide-react';
import { db } from '../lib/firebase';
import { uploadRegionImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import { refreshRegions, useRegions } from '../hooks/useRegions';
import { getStaffAccess } from '../utils/staffRoles';
import {
  ABOUT_TEXT_MAX_LENGTH,
  customAboutText,
  defaultAboutBodyHtml,
} from '../utils/regionAboutText';
import RichTextEditorLazy from './RichTextEditorLazy';
import './ModerationTab.css';
import './RegionAboutTab.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const placePhraseOf = (region) => region?.inPhrase || `in ${region?.name ?? ''}`;

// Parts of the page a moderator cannot change; shown so it is clear what is fixed.
const FIXED_PARTS = [
  'Titel „Dein Tribe ruft dich.“ mit Einleitung und Schaltflächen',
  'Kalender',
  'Unsere Werte',
  'Wer wir sind',
  'Helfer:innen',
  'Spenden',
];

// "Über uns" of a region: its moderators (and Super-Admins) upload the header
// photo and write the text of the "Deine Heimat ... ruft dich" section; the rest
// of the page is fixed. Helpers are managed in the tab "Helfer". Saved on
// `regions/{id}` (aboutHeaderImage, aboutText); firestore.rules let a moderator
// write exactly these fields of her own regions.
export default function RegionAboutTab() {
  const { role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const { regions } = useRegions();
  const options = useMemo(
    () => regions.filter((r) => access.canModerateRegion(r.id)),
    [regions, access]
  );

  const [regionId, setRegionId] = useState('');
  const current = options.find((r) => r.id === regionId) ?? options[0] ?? null;
  const [aboutText, setAboutText] = useState('');
  const [headerImage, setHeaderImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileInputRef = useRef(null);

  // Load the stored values whenever another region is picked.
  const currentId = current?.id ?? '';
  useEffect(() => {
    const region = options.find((r) => r.id === currentId);
    setAboutText(customAboutText(region) || defaultAboutBodyHtml(placePhraseOf(region)));
    setHeaderImage(region?.aboutHeaderImage ?? '');
    setNotice(null);
    // Only on region switch: a refresh after saving must not reset unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (!current) return null;

  const handleSelectFile = async (file) => {
    if (!file) return;
    setNotice(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setNotice({ kind: 'error', text: 'Nur JPEG, PNG und WebP sind erlaubt.' });
      return;
    }
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      setNotice({
        kind: 'error',
        text: `Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)} MB).`,
      });
      return;
    }
    setUploading(true);
    try {
      setHeaderImage(await uploadRegionImage(file, current.id));
    } catch (err) {
      console.error('Region header upload failed:', err);
      setNotice({ kind: 'error', text: 'Foto konnte nicht hochgeladen werden.' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const isDefault = aboutText.trim() === defaultAboutBodyHtml(placePhraseOf(current));
      await updateDoc(doc(db, 'regions', current.id), {
        aboutText: aboutText.trim() && !isDefault ? aboutText.trim() : null,
        aboutHeaderImage: headerImage || null,
        updatedAt: serverTimestamp(),
      });
      await refreshRegions();
      setNotice({ kind: 'success', text: `„Über uns“ für ${current.name} ist gespeichert.` });
    } catch (err) {
      console.error('Region about save failed:', err);
      setNotice({ kind: 'error', text: 'Speichern hat nicht geklappt. Bitte versuche es erneut.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="moderation-tab region-about-tab" data-testid="region-about-tab">
      <p className="moderation-intro">
        Hier gestaltest du die „Über uns“-Seite deiner Region. Veränderbar sind das Titelbild und
        der Text im Abschnitt „Deine Heimat {current.name} ruft dich.“ Alles andere ist fest
        vorgegeben. Die Helfer:innen pflegst du im Tab „Helfer“.
      </p>

      {notice && (
        <p
          className={notice.kind === 'error' ? 'moderation-error' : 'moderation-notice'}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      {options.length > 1 && (
        <label className="region-about-field">
          <span>Region</span>
          <select
            value={current.id}
            onChange={(e) => setRegionId(e.target.value)}
            data-testid="region-about-region"
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="region-about-section">
        <h3>Titelbild</h3>
        <div className="region-about-header">
          {headerImage ? (
            <img src={headerImage} alt="Titelbild" data-testid="region-about-header-preview" />
          ) : (
            <span className="region-about-header-empty">Kein Titelbild (Standardbild)</span>
          )}
        </div>
        <div className="region-about-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving}
            data-testid="region-about-upload"
          >
            <Upload size={16} aria-hidden="true" />{' '}
            {uploading ? 'Wird hochgeladen…' : headerImage ? 'Bild ersetzen' : 'Bild hochladen'}
          </button>
          {headerImage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setHeaderImage('')}
              disabled={uploading || saving}
              data-testid="region-about-remove"
            >
              Bild entfernen
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            hidden
            onChange={(e) => {
              handleSelectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="region-about-section">
        <h3>Text „Deine Heimat {current.name} ruft dich.“</h3>
        <p className="region-about-fixed-note">
          Die Überschrift bleibt gleich, den Text darunter kannst du frei gestalten.
        </p>
        <RichTextEditorLazy
          value={aboutText}
          onChange={setAboutText}
          placeholder="Schreibe hier deinen Text…"
          maxLength={ABOUT_TEXT_MAX_LENGTH}
          testId="region-about-text"
          uploadImage={(file) => uploadRegionImage(file, current.id)}
        />
        <button
          type="button"
          className="btn btn-secondary region-about-reset"
          onClick={() => setAboutText(defaultAboutBodyHtml(placePhraseOf(current)))}
          disabled={saving}
          data-testid="region-about-reset"
        >
          Standardtext wiederherstellen
        </button>
      </section>

      <section className="region-about-section">
        <h3>Fest vorgegeben</h3>
        <p className="region-about-fixed-note">Diese Teile der Seite sind nicht veränderbar:</p>
        <ul className="region-about-fixed" data-testid="region-about-fixed">
          {FIXED_PARTS.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className="btn btn-primary"
        onClick={save}
        disabled={saving || uploading}
        data-testid="region-about-save"
      >
        {saving ? 'Wird gespeichert…' : 'Speichern'}
      </button>
    </div>
  );
}
