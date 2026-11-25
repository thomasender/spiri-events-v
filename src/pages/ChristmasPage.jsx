import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  CalendarDays,
  Car,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TrainFront,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useStaffRole } from '../hooks/useStaffRole';
import {
  saveChristmasContent,
  useChristmasBringSummary,
  useChristmasPage,
  useMyChristmasRegistration,
} from '../hooks/useChristmasPage';
import { uploadPageImage } from '../lib/imageUpload';
import {
  CHRISTMAS_PAGE_ID,
  MAX_IDEAS,
  MAX_STEPS,
  contentEquals,
  sanitizeContent,
  seatStatus,
} from '../lib/christmasPage';
import EditableText from '../components/christmas/EditableText';
import CandleRoom from '../components/chat/CandleRoom';
import SeatsHint from '../components/christmas/SeatsHint';
import Attendees from '../components/christmas/Attendees';
import RouteSketch from '../components/christmas/RouteSketch';
import FlyerLightbox from '../components/christmas/FlyerLightbox';
import ChristmasRegistrationForm from '../components/christmas/ChristmasRegistrationForm';
import ErrorPage from './ErrorPage';
import './ChristmasPage.css';

const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Die+Gelbe+Fabrik+Widagasse+11+6850+Dornbirn';

// Tribe-Weihnachtsfeier. Not linked anywhere. While the page is not published only
// Super-Admins see it (everybody else gets the normal "not found" page); they edit
// every text, the flyer and the lists right on the page. Verwaltung -> "Weihnachtsfeier"
// has the publish switch and the registrations.
export default function ChristmasPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useStaffRole();
  const page = useChristmasPage();
  const seats = useChristmasBringSummary();
  const bringSummary = seats.items;
  const mine = useMyChristmasRegistration(user?.uid);
  const seatsFull = seatStatus(seats.persons) === 'full';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | failed
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef(null);

  const content = editing && draft ? draft : page.content;
  const dirty = useMemo(
    () => editing && draft != null && !contentEquals(draft, page.content),
    [editing, draft, page.content]
  );

  // Unsaved edits are never lost silently on reload or tab close.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (roleLoading || page.loading) return <div className="loading-spinner"></div>;
  if (!isSuperAdmin && (page.denied || !page.published)) return <ErrorPage type="not-found" />;

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const startEdit = () => {
    setDraft(structuredClone(page.content));
    setSaveState('idle');
    setEditing(true);
  };
  const stopEdit = () => {
    if (dirty && !window.confirm('Änderungen verwerfen?')) return;
    setEditing(false);
    setDraft(null);
  };
  const save = async () => {
    setSaveState('saving');
    try {
      await saveChristmasContent({ content: draft, published: page.published, uid: user.uid });
      setDraft(sanitizeContent(draft));
      setSaveState('saved');
    } catch (err) {
      console.warn('Weihnachtsfeier save failed:', err?.code || err);
      setSaveState('failed');
    }
  };

  const setStep = (i, patch) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const moveStep = (i, dir) =>
    setDraft((d) => {
      const steps = [...d.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return d;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, steps };
    });

  const uploadFlyer = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Bitte ziehe ein Bild hinein (JPG oder PNG).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPageImage(file, CHRISTMAS_PAGE_ID);
      setDraft((d) => ({ ...d, flyerUrl: url }));
    } catch (err) {
      console.warn('Flyer upload failed:', err?.code || err);
      setUploadError('Das Bild konnte nicht hochgeladen werden. Bitte versuche es noch einmal.');
    } finally {
      setUploading(false);
    }
  };
  const onFlyer = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    uploadFlyer(file);
  };
  const dropProps = editing
    ? {
        onDragOver: (e) => {
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e) => {
          e.preventDefault();
          setDragging(false);
          uploadFlyer(e.dataTransfer.files?.[0]);
        },
      }
    : {};

  const T = (key, props = {}) => (
    <EditableText value={content[key]} onChange={set(key)} editing={editing} {...props} />
  );

  return (
    <div className={`xmas${editing ? ' xmas--editing' : ''}`}>
      <Helmet>
        <title>{content.title} | Dein Tribe</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {isSuperAdmin && (
        <div className="xmas-admin-bar" data-testid="xmas-admin-bar">
          <span className="xmas-admin-status">
            <Sparkles size={16} aria-hidden="true" />
            {page.published
              ? 'Die Seite ist veröffentlicht (kein Link auf der Website).'
              : 'Vorschau: nur für Admins sichtbar.'}
          </span>
          {!editing && (
            <button type="button" className="xmas-btn xmas-btn--small" onClick={startEdit}>
              <Pencil size={15} aria-hidden="true" /> Seite bearbeiten
            </button>
          )}
        </div>
      )}

      <header className="xmas-hero">
        <div className="xmas-hero-copy">
          {T('eyebrow', {
            as: 'p',
            className: 'xmas-eyebrow',
            placeholder: 'Zeile über dem Titel',
          })}
          {T('title', { as: 'h1', className: 'xmas-title', placeholder: 'Titel' })}
          {T('intro', {
            as: 'p',
            className: 'xmas-lead',
            multiline: true,
            placeholder: 'Einleitung',
          })}
          <a className="xmas-btn xmas-btn--light" href="#anmeldung">
            Jetzt anmelden
          </a>
        </div>

        <div className="xmas-flyer-wrap">
          <figure
            className={`xmas-flyer${editing ? ' xmas-flyer--drop' : content.flyerUrl ? ' xmas-flyer--zoom' : ''}${dragging ? ' xmas-flyer--over' : ''}`}
            data-testid="xmas-flyer-drop"
            {...dropProps}
            {...(editing
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': 'Flyer hochladen: Bild hierher ziehen oder klicken zum Auswählen',
                  onClick: () => !uploading && fileRef.current?.click(),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!uploading) fileRef.current?.click();
                    }
                  },
                }
              : content.flyerUrl
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': 'Flyer vergrößern',
                    onClick: () => setLightbox(true),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLightbox(true);
                      }
                    },
                  }
                : {})}
          >
            {content.flyerUrl ? (
              <img src={content.flyerUrl} alt={`Flyer: ${content.title}`} />
            ) : (
              <div className="xmas-flyer-placeholder" data-testid="xmas-flyer-placeholder">
                <Sparkles size={34} aria-hidden="true" />
                <strong>Flyer folgt</strong>
                <span>Hier erscheint bald unser Flyer.</span>
              </div>
            )}
            {editing && (
              <figcaption className="xmas-flyer-hint">
                {uploading ? 'Lädt hoch …' : 'Bild hierher ziehen oder klicken zum Auswählen'}
              </figcaption>
            )}
          </figure>
          {editing && (
            <div className="xmas-flyer-tools">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onFlyer}
                data-testid="xmas-flyer-input"
              />
              {content.flyerUrl && (
                <button
                  type="button"
                  className="xmas-btn xmas-btn--small xmas-btn--ghost"
                  onClick={() => set('flyerUrl')('')}
                >
                  <Trash2 size={15} aria-hidden="true" /> Entfernen
                </button>
              )}
              {uploadError && <p className="xmas-error">{uploadError}</p>}
            </div>
          )}
        </div>
      </header>

      <section className="xmas-facts" aria-label="Eckdaten">
        <div className="xmas-fact">
          <CalendarDays aria-hidden="true" />
          <h2>Wann</h2>
          {T('dateLabel', { as: 'p', className: 'xmas-fact-main', placeholder: 'Datum' })}
        </div>
        <div className="xmas-fact">
          <Clock aria-hidden="true" />
          <h2>Uhrzeit</h2>
          {T('timeLabel', { as: 'p', className: 'xmas-fact-main', placeholder: 'Uhrzeit' })}
        </div>
        <div className="xmas-fact">
          <MapPin aria-hidden="true" />
          <h2>Wo</h2>
          {T('place', { as: 'p', className: 'xmas-fact-main', placeholder: 'Ort' })}
          {T('placeNote', {
            as: 'p',
            className: 'xmas-fact-note',
            multiline: true,
            placeholder: 'Hinweis zum Ort',
          })}
        </div>
        <div className="xmas-fact">
          <Users aria-hidden="true" />
          <h2>Teilnahme</h2>
          {T('capacityLabel', {
            as: 'p',
            className: 'xmas-fact-main',
            placeholder: 'Teilnehmerzahl',
          })}
          {T('capacityNote', {
            as: 'p',
            className: 'xmas-fact-note',
            multiline: true,
            placeholder: 'Hinweis',
          })}
          <SeatsHint persons={seats.persons} />
        </div>
      </section>

      <section className="xmas-section xmas-bring">
        {T('bringTitle', { as: 'h2', placeholder: 'Überschrift' })}
        {T('bringText', { as: 'p', className: 'xmas-body', multiline: true, placeholder: 'Text' })}
        <div className="xmas-chips" aria-label="Vorschläge">
          {content.bringIdeas.map((idea, i) => (
            <span className="xmas-chip xmas-chip--static" key={`${i}-${idea}`}>
              {editing ? (
                <EditableText
                  value={idea}
                  editing
                  maxLength={60}
                  placeholder="Idee"
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      bringIdeas: d.bringIdeas.map((x, j) => (j === i ? v : x)),
                    }))
                  }
                />
              ) : (
                idea
              )}
              {editing && (
                <button
                  type="button"
                  aria-label={`${idea || 'Idee'} entfernen`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, bringIdeas: d.bringIdeas.filter((_, j) => j !== i) }))
                  }
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          {editing && content.bringIdeas.length < MAX_IDEAS && (
            <button
              type="button"
              className="xmas-chip xmas-chip--add"
              onClick={() => setDraft((d) => ({ ...d, bringIdeas: [...d.bringIdeas, ''] }))}
            >
              <Plus size={14} aria-hidden="true" /> Idee
            </button>
          )}
        </div>
      </section>

      {bringSummary.length > 0 && (
        <section className="xmas-section xmas-covered" data-testid="xmas-covered">
          <h3>Das bringen andere schon mit</h3>
          <p className="xmas-body">
            Anonym, damit du siehst, was schon da ist. Magst du etwas Anderes oder Eigenes
            mitbringen?
          </p>
          <ul className="xmas-chips">
            {bringSummary.map((item) => (
              <li className="xmas-chip xmas-chip--static" key={item.label}>
                {item.label}
                <span className="xmas-chip-count">× {item.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="xmas-section xmas-schedule">
        {T('scheduleTitle', { as: 'h2', placeholder: 'Überschrift' })}
        <ol className="xmas-steps">
          {content.steps.map((step, i) => (
            <li className="xmas-step" key={i}>
              <span className="xmas-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <div className="xmas-step-body">
                <EditableText
                  as="h3"
                  value={step.title}
                  editing={editing}
                  maxLength={120}
                  placeholder="Titel des Programmpunkts"
                  onChange={(v) => setStep(i, { title: v })}
                />
                <EditableText
                  as="p"
                  className="xmas-body"
                  value={step.text}
                  editing={editing}
                  multiline
                  placeholder="Beschreibung"
                  onChange={(v) => setStep(i, { text: v })}
                />
              </div>
              {editing && (
                <div className="xmas-step-tools">
                  <button
                    type="button"
                    aria-label="Nach oben"
                    onClick={() => moveStep(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Nach unten"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === content.steps.length - 1}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Programmpunkt löschen"
                    onClick={() =>
                      setDraft((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {editing && content.steps.length < MAX_STEPS && (
          <button
            type="button"
            className="xmas-btn xmas-btn--ghost xmas-btn--small"
            onClick={() =>
              setDraft((d) => ({ ...d, steps: [...d.steps, { title: '', text: '' }] }))
            }
          >
            <Plus size={15} aria-hidden="true" /> Programmpunkt hinzufügen
          </button>
        )}
      </section>

      <section className="xmas-travel" aria-labelledby="xmas-travel-title">
        <div className="xmas-travel-address">
          <span className="xmas-travel-pin" aria-hidden="true">
            <MapPin size={26} />
          </span>
          {T('travelTitle', {
            as: 'h2',
            className: 'xmas-travel-heading',
            placeholder: 'Überschrift',
          })}
          {T('addressText', {
            as: 'p',
            className: 'xmas-travel-lines',
            multiline: true,
            placeholder: 'Adresse',
          })}
          <a
            className="xmas-btn xmas-btn--light xmas-btn--small"
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Route planen <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="xmas-travel-ways">
          <RouteSketch />
          <div className="xmas-travel-way">
            <TrainFront aria-hidden="true" />
            {T('trainTitle', { as: 'h3', placeholder: 'Titel' })}
            {T('trainText', { as: 'p', multiline: true, placeholder: 'Text' })}
          </div>
          <div className="xmas-travel-way">
            <Car aria-hidden="true" />
            {T('carTitle', { as: 'h3', placeholder: 'Titel' })}
            {T('carText', { as: 'p', multiline: true, placeholder: 'Text' })}
          </div>
          {(content.travelNote || editing) && (
            <div className="xmas-travel-note">
              {T('travelNote', { as: 'p', multiline: true, placeholder: 'Zusätzlicher Hinweis' })}
            </div>
          )}
        </div>
      </section>

      <Attendees
        attendees={seats.attendees}
        hasMore={seats.registrations > seats.attendees.length}
      />

      <section className="xmas-section xmas-register" id="anmeldung">
        {T('formTitle', { as: 'h2', placeholder: 'Überschrift' })}
        {T('formIntro', {
          as: 'p',
          className: 'xmas-body',
          multiline: true,
          placeholder: 'Einleitung',
        })}
        {editing && (
          <div className="xmas-thanks-edit">
            <p className="xmas-edit-label">
              Nach der Anmeldung gezeigt (steht nicht auf der Seite davor):
            </p>
            {T('thanksTitle', { as: 'h3', placeholder: 'Danke-Überschrift' })}
            {T('thanksText', {
              as: 'p',
              className: 'xmas-body',
              multiline: true,
              placeholder: 'Danke-Text',
            })}
          </div>
        )}
        <SeatsHint persons={seats.persons} />
        <ChristmasRegistrationForm
          content={content}
          covered={bringSummary}
          adminPreview={isSuperAdmin}
          user={user}
          myRegistration={mine.registration}
          seatsFull={seatsFull}
        />
      </section>

      <div className="xmas-chat">
        <CandleRoom eventId={CHRISTMAS_PAGE_ID} alwaysOpen />
      </div>

      {lightbox && content.flyerUrl && (
        <FlyerLightbox
          src={content.flyerUrl}
          alt={`Flyer: ${content.title}`}
          onClose={() => setLightbox(false)}
        />
      )}

      {editing && (
        <div className="xmas-savebar" role="region" aria-label="Bearbeiten">
          <span className="xmas-savebar-status" aria-live="polite">
            {saveState === 'saving' && 'Speichert …'}
            {saveState === 'failed' && 'Speichern hat nicht geklappt.'}
            {saveState === 'saved' && !dirty && 'Gespeichert ✓'}
            {saveState !== 'saving' &&
              saveState !== 'failed' &&
              dirty &&
              'Ungespeicherte Änderungen'}
            {saveState === 'idle' && !dirty && 'Klicke auf einen Text, um ihn zu ändern.'}
          </span>
          <button
            type="button"
            className="xmas-btn xmas-btn--ghost xmas-btn--small"
            onClick={stopEdit}
          >
            {dirty ? 'Verwerfen' : 'Fertig'}
          </button>
          <button
            type="button"
            className="xmas-btn xmas-btn--small"
            onClick={save}
            disabled={!dirty || saveState === 'saving'}
          >
            <Save size={15} aria-hidden="true" /> Speichern
          </button>
        </div>
      )}
    </div>
  );
}
