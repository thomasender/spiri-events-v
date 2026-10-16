import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Upload } from 'lucide-react';
import { db } from '../lib/firebase';
import { uploadRegionImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import { useHelpers } from '../hooks/useHelpers';
import { refreshRegions, useRegions } from '../hooks/useRegions';
import { getStaffAccess } from '../utils/staffRoles';
import './ModerationTab.css';
import './RegionAboutTab.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// "Über uns" of a region: its moderators (and Super-Admins) pick which of the
// helpers appear there and upload the header photo. Saved on `regions/{id}`
// (aboutHelperIds, aboutHeaderImage); firestore.rules let a moderator write
// exactly these two fields of her own regions.
export default function RegionAboutTab() {
  const { role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const { regions } = useRegions();
  const { helpers, loading: helpersLoading } = useHelpers();
  const options = useMemo(
    () => regions.filter((r) => access.canModerateRegion(r.id)),
    [regions, access]
  );

  const [regionId, setRegionId] = useState('');
  const current = options.find((r) => r.id === regionId) ?? options[0] ?? null;
  const [helperIds, setHelperIds] = useState([]);
  const [headerImage, setHeaderImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileInputRef = useRef(null);

  // Load the stored values whenever another region is picked.
  const currentId = current?.id ?? '';
  useEffect(() => {
    const region = options.find((r) => r.id === currentId);
    setHelperIds(Array.isArray(region?.aboutHelperIds) ? region.aboutHelperIds : []);
    setHeaderImage(region?.aboutHeaderImage ?? '');
    setNotice(null);
    // Only on region switch: a refresh after saving must not reset unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (!current) return null;

  const toggleHelper = (id) =>
    setHelperIds((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));

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
      // In the order of the helpers list, not of the clicks.
      const ordered = helpers.map((h) => h.id).filter((id) => helperIds.includes(id));
      await updateDoc(doc(db, 'regions', current.id), {
        aboutHelperIds: ordered,
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
        Hier gestaltest du die „Über uns“-Seite deiner Region: Wähle das Titelbild und die
        Helfer:innen, die dort gezeigt werden.
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
        <h3>Helfer:innen</h3>
        {helpersLoading ? (
          <p>Lade Helfer:innen…</p>
        ) : helpers.length === 0 ? (
          <p>Es sind noch keine Helfer:innen angelegt.</p>
        ) : (
          <ul className="region-about-helpers" data-testid="region-about-helpers">
            {helpers.map((h) => (
              <li key={h.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={helperIds.includes(h.id)}
                    onChange={() => toggleHelper(h.id)}
                    data-testid={`region-about-helper-${h.id}`}
                  />{' '}
                  {h.name}
                </label>
              </li>
            ))}
          </ul>
        )}
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
