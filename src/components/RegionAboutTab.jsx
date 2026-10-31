import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Upload } from 'lucide-react';
import { db } from '../lib/firebase';
import { uploadRegionImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import { refreshRegions, useRegions } from '../hooks/useRegions';
import { getStaffAccess } from '../utils/staffRoles';
import { normalizeInstagramHandle } from '../utils/instagramHandle';
import { DEFAULT_REGION_ID, regionInstagramAccount } from '../utils/regions';
import {
  ABOUT_TEXT_MAX_LENGTH,
  customAboutText,
  customSlogan,
  defaultSlogan,
  SLOGAN_LINE1_MAX_LENGTH,
  SLOGAN_LINE2_MAX_LENGTH,
  defaultAboutBodyHtml,
} from '../utils/regionAboutText';
import {
  EXAMPLE_KEYS,
  EXAMPLE_MAX_LENGTH,
  customExample,
  formExamples,
  sanitizeTexts,
} from '../utils/regionExamples';
import RichTextEditorLazy from './RichTextEditorLazy';
import './ModerationTab.css';
import './RegionAboutTab.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Labels of the example fields (what the person sees greyed out in the event form).
const EXAMPLE_FIELDS = [
  { key: 'place', label: 'Ort' },
  { key: 'organizer', label: 'Veranstalter:in' },
  { key: 'address', label: 'Adresse / Veranstaltungsort' },
  { key: 'contact', label: 'Kontakt' },
];

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
  const current =
    options.find((r) => r.id === regionId) ??
    options.find((r) => r.id === DEFAULT_REGION_ID) ??
    options[0] ??
    null;
  const [aboutText, setAboutText] = useState('');
  const [headerImage, setHeaderImage] = useState('');
  const [slogan1, setSlogan1] = useState('');
  const [slogan2, setSlogan2] = useState('');
  const [unlockSlogan, setUnlockSlogan] = useState(false);
  const [instagramInput, setInstagramInput] = useState('');
  const [examples, setExamples] = useState({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileInputRef = useRef(null);

  const activeCount = regions.filter((r) => r.active).length;

  // Load the stored values whenever another region is picked.
  const currentId = current?.id ?? '';
  useEffect(() => {
    const region = options.find((r) => r.id === currentId);
    setAboutText(customAboutText(region) || defaultAboutBodyHtml(placePhraseOf(region)));
    setHeaderImage(region?.aboutHeaderImage ?? '');
    // Nothing saved: show the slogan the header uses today, so it can be edited directly.
    const slogan = customSlogan(region);
    const fallback = defaultSlogan(region, { activeCount });
    setSlogan1(slogan.line1 || fallback.line1);
    setSlogan2(slogan.line2 || fallback.line2);
    setUnlockSlogan(false);
    setInstagramInput(region?.instagramHandle ?? '');
    setExamples(Object.fromEntries(EXAMPLE_KEYS.map((k) => [k, customExample(region, k)])));
    setNotice(null);
    // Only on region switch: a refresh after saving must not reset unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (!current) return null;

  // Once a Super-Admin saved the slogan, a moderator needs a Super-Admin to change it.
  const sloganLocked = current.aboutSloganLocked === true && !access.isSuperAdmin;

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

  const instagramTrimmed = instagramInput.trim();
  const instagramInvalid = instagramTrimmed !== '' && !normalizeInstagramHandle(instagramTrimmed);
  const shownInstagram = regionInstagramAccount(current);

  // Greyed-out defaults of the example fields (without the automatic "z.B. ").
  const defaultExamples = formExamples({ ...current, texts: undefined }, { regionSpecific: true });
  const examplesDark = current.id === 'vorarlberg' && activeCount < 2;

  const save = async () => {
    if (access.isSuperAdmin && instagramInvalid) {
      setNotice({
        kind: 'error',
        text: 'Der Instagram-Name ist ungültig. Erlaubt sind Buchstaben, Zahlen, Punkt und Unterstrich (max. 30 Zeichen).',
      });
      return;
    }
    // An unchanged default is saved as "nothing saved", so the header keeps following it.
    const sloganDefault = defaultSlogan(current, { activeCount });
    const sloganValue = (value, fallback) =>
      value.trim() && value.trim() !== fallback ? value.trim() : null;
    const savedSlogan1 = sloganValue(slogan1, sloganDefault.line1);
    const savedSlogan2 = sloganValue(slogan2, sloganDefault.line2);
    // Some default lines are longer than the limit; an edited line must fit.
    if (
      !sloganLocked &&
      ((savedSlogan1 ?? '').length > SLOGAN_LINE1_MAX_LENGTH ||
        (savedSlogan2 ?? '').length > SLOGAN_LINE2_MAX_LENGTH)
    ) {
      setNotice({
        kind: 'error',
        text: `Der Slogan ist zu lang. Pro Zeile sind höchstens ${SLOGAN_LINE1_MAX_LENGTH} Zeichen erlaubt.`,
      });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const isDefault = aboutText.trim() === defaultAboutBodyHtml(placePhraseOf(current));
      const newTexts = sanitizeTexts({ examples });
      const textsChanged =
        access.isSuperAdmin &&
        JSON.stringify(newTexts ?? null) !== JSON.stringify(sanitizeTexts(current.texts) ?? null);
      await updateDoc(doc(db, 'regions', current.id), {
        ...(textsChanged ? { texts: newTexts ?? deleteField() } : {}),
        aboutText: aboutText.trim() && !isDefault ? aboutText.trim() : null,
        aboutHeaderImage: headerImage || null,
        ...(sloganLocked
          ? {}
          : {
              aboutSlogan1: savedSlogan1,
              aboutSlogan2: savedSlogan2,
              ...(access.isSuperAdmin ? { aboutSloganLocked: !unlockSlogan } : {}),
            }),
        // Display-only name; only Super-Admins may write it (firestore.rules).
        ...(access.isSuperAdmin
          ? { instagramHandle: normalizeInstagramHandle(instagramTrimmed) }
          : {}),
        updatedAt: serverTimestamp(),
      });
      if (access.isSuperAdmin) setInstagramInput(normalizeInstagramHandle(instagramTrimmed) ?? '');
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
        <h3>Slogan in der Kopfzeile</h3>
        {sloganLocked && (
          <p className="region-about-fixed-note" data-testid="region-about-slogan-locked">
            Der Slogan wurde von einem Admin festgelegt. Zum Ändern braucht es die Freigabe eines
            Admins.
          </p>
        )}
        <label className="region-about-field">
          <span>Zeile 1</span>
          <input
            type="text"
            value={slogan1}
            maxLength={SLOGAN_LINE1_MAX_LENGTH}
            onChange={(e) => setSlogan1(e.target.value)}
            disabled={sloganLocked || saving}
            data-testid="region-about-slogan1"
          />
        </label>
        <label className="region-about-field">
          <span>Zeile 2</span>
          <input
            type="text"
            value={slogan2}
            maxLength={SLOGAN_LINE2_MAX_LENGTH}
            onChange={(e) => setSlogan2(e.target.value)}
            disabled={sloganLocked || saving}
            data-testid="region-about-slogan2"
          />
        </label>
        {access.isSuperAdmin && (
          <label className="region-about-field">
            <span>
              <input
                type="checkbox"
                checked={unlockSlogan}
                onChange={(e) => setUnlockSlogan(e.target.checked)}
                data-testid="region-about-slogan-unlock"
              />{' '}
              Moderator:innen dürfen den Slogan ändern (sonst gesperrt, sobald du speicherst)
            </span>
          </label>
        )}
      </section>

      {(access.isSuperAdmin || shownInstagram) && (
        <section className="region-about-section" data-testid="region-about-instagram">
          <h3>Instagram-Name der Region</h3>
          {access.isSuperAdmin ? (
            <>
              <p className="region-about-fixed-note">
                Der Name wird nur angezeigt (Event-Formular, „Über uns“, Datenschutzerklärung). Er
                richtet kein Konto ein und verbindet nichts mit Instagram.
                {current.id === 'vorarlberg' && ' Leer = @tribevorarlberg.'}
              </p>
              <label className="region-about-field">
                <span>Instagram-Name</span>
                <input
                  type="text"
                  value={instagramInput}
                  maxLength={60}
                  placeholder="@tribename"
                  onChange={(e) => setInstagramInput(e.target.value)}
                  disabled={saving}
                  aria-invalid={instagramInvalid}
                  data-testid="region-about-instagram-input"
                />
              </label>
              {instagramInvalid && (
                <p
                  className="moderation-error"
                  role="alert"
                  data-testid="region-about-instagram-error"
                >
                  Bitte einen gültigen Instagram-Namen eingeben, z. B. @tribetirol.
                </p>
              )}
            </>
          ) : (
            <p className="region-about-fixed-note" data-testid="region-about-instagram-readonly">
              {shownInstagram} (wird von einem Admin festgelegt)
            </p>
          )}
        </section>
      )}

      {access.isSuperAdmin && (
        <section className="region-about-section" data-testid="region-about-examples">
          <h3>Beispieltexte im Formular „Event erstellen“</h3>
          <p className="region-about-fixed-note">
            Diese Beispiele stehen grau in den Feldern, wenn jemand ein Event für {current.name}{' '}
            anlegt. „z.B.“ wird automatisch davor gesetzt. Leer lassen für den Standardtext.
          </p>
          {examplesDark && (
            <p className="region-about-fixed-note" data-testid="region-about-examples-dark">
              Für Vorarlberg gelten diese Beispiele erst, sobald eine weitere Region freigeschaltet
              ist. Bis dahin bleiben die bisherigen Beispiele.
            </p>
          )}
          {EXAMPLE_FIELDS.map(({ key, label }) => (
            <div className="region-about-field" key={key}>
              <label htmlFor={`region-about-example-${key}`}>
                <span>{label}</span>
              </label>
              <input
                id={`region-about-example-${key}`}
                type="text"
                value={examples[key] ?? ''}
                maxLength={EXAMPLE_MAX_LENGTH}
                placeholder={defaultExamples[key].replace(/^z\.B\. /, '')}
                onChange={(e) => setExamples((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={saving}
                data-testid={`region-about-example-${key}`}
              />
              <span className="region-about-fixed-note">
                {(examples[key] ?? '').length}/{EXAMPLE_MAX_LENGTH}
              </span>
              <button
                type="button"
                className="btn btn-secondary region-about-reset"
                onClick={() => setExamples((prev) => ({ ...prev, [key]: '' }))}
                disabled={saving || !examples[key]}
                data-testid={`region-about-example-${key}-reset`}
              >
                Auf Standard zurücksetzen
              </button>
            </div>
          ))}
        </section>
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

      {access.isSuperAdmin && (
        <section className="region-about-section">
          <h3>Fest vorgegeben</h3>
          <p className="region-about-fixed-note">Diese Teile der Seite sind nicht veränderbar:</p>
          <ul className="region-about-fixed" data-testid="region-about-fixed">
            {FIXED_PARTS.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </section>
      )}

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
