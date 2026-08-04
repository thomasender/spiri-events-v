import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { useEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import {
  uploadImage,
  deleteImageByUrl,
  getImageDimensions,
  getAspectRatioRecommendation,
  MAX_INPUT_SIZE_BYTES,
} from '../lib/imageUpload';
import { ArrowLeft, Save, Image, X, Info, Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { canDeleteEvent } from '../utils/eventPermissions';
import './EventForm.css';

const INITIAL_STATE = {
  title: '',
  date: '',
  time: '',
  endTime: '',
  endDate: '',
  place: '',
  contribution: 'free',
  fee: '',
  description: '',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  category: '',
  bezirk: '',
  organizer: { firstName: '', lastName: '', email: '' },
  kontakt: '',
};

function splitDisplayName(displayName, email) {
  const trimmed = (displayName || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
  if (email) {
    const local = email.split('@')[0];
    return { firstName: local, lastName: '' };
  }
  return { firstName: '', lastName: '' };
}

const normalizeLink = (link) => {
  const trimmed = link.trim();
  if (!trimmed) return '';
  const withProtocol = trimmed.match(/^https?:\/\//i) ? trimmed : 'https://' + trimmed;
  return withProtocol.replace(/^http:\/\//i, 'https://');
};

const isValidLink = (link) => {
  const trimmed = link.trim();
  if (!trimmed) return true;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  const domainLike = /^www\..+\..+/i.test(trimmed) || /^[^/]+\.[^/]+/.test(trimmed);
  return domainLike;
};

const isValidEmail = (email) => {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

const kategorieOptions = KATEGORIEN.map((k) => ({ value: k, label: k }));

export default function EventForm({ event }) {
  const { user } = useAuth();
  const { role } = useAuth();
  const { addEvent, updateEvent, deleteEvent } = useEvents(user);

  const buildInitialState = () => {
    if (event) {
      const storedOrganizer = event.organizer || {};
      return {
        title: event.title || '',
        date: event.date || '',
        time: event.time || '',
        endTime: event.endTime || '',
        endDate: event.endDate || '',
        place: event.place || '',
        contribution: event.contribution || 'free',
        fee: event.fee || '',
        description: event.description || '',
        link: event.link || '',
        recurrence: event.recurrence || 'none',
        recurrenceEndDate: event.recurrenceEndDate || '',
        category: event.category || '',
        bezirk: event.bezirk || '',
        organizer: {
          firstName: storedOrganizer.firstName || '',
          lastName: storedOrganizer.lastName || '',
          email: storedOrganizer.email || '',
        },
        kontakt: event.kontakt || '',
      };
    }
    const { firstName, lastName } = splitDisplayName(user?.displayName, user?.email);
    return {
      ...INITIAL_STATE,
      organizer: {
        firstName,
        lastName,
        email: user?.email || '',
      },
      kontakt: user?.email || '',
    };
  };

  const [formData, setFormData] = useState(buildInitialState);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(event?.imageUrl || '');
  const [originalImageUrl] = useState(event?.imageUrl || '');
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResubmitConfirmModal, setShowResubmitConfirmModal] = useState(false);
  const [resubmitWarning, setResubmitWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const isAdmin = role === 'Admin';
  const isEdit = Boolean(event);
  const wasApproved = event?.status === 'approved';
  const canDelete = isEdit && canDeleteEvent(user, event, role);

  const getFormTitle = () => {
    if (isEdit) return 'Event bearbeiten';
    return isAdmin ? 'Neues Event erstellen' : 'Event zur Genehmigung einreichen';
  };

  const getSubmitButtonText = () => {
    if (imageUploading) return `Wird hochgeladen… (${imageProgress}%)`;
    if (loading) return 'Speichern...';
    if (isEdit) return wasApproved && !isAdmin ? 'Erneut einreichen' : 'Änderungen speichern';
    return isAdmin ? 'Event erstellen' : 'Einreichen zur Genehmigung';
  };

  const recurrenceMinDate = useMemo(() => {
    return formData.date || '';
  }, [formData.date]);

  const recurrenceMaxDate = useMemo(() => {
    if (!formData.date) return '';
    const eventDate = new Date(formData.date + 'T12:00:00');
    eventDate.setFullYear(eventDate.getFullYear() + 1);
    return eventDate.toISOString().split('T')[0];
  }, [formData.date]);

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich';
    if (!formData.date) newErrors.date = 'Datum ist erforderlich';
    if (!formData.place.trim()) newErrors.place = 'Ort ist erforderlich';
    if (!formData.bezirk) newErrors.bezirk = 'Bezirk ist erforderlich';
    if (!formData.category) {
      newErrors.category = 'Kategorie ist erforderlich';
    }
    if (formData.contribution === 'fee' && (!formData.fee || formData.fee <= 0)) {
      newErrors.fee = 'Bitte gib einen gültigen Betrag ein';
    }
    if (formData.recurrence !== 'none' && formData.recurrenceEndDate && recurrenceMaxDate) {
      const endRecurrenceDate = new Date(formData.recurrenceEndDate + 'T12:00:00');
      const maxDate = new Date(recurrenceMaxDate + 'T12:00:00');
      if (endRecurrenceDate > maxDate) {
        newErrors.recurrenceEndDate = 'Wiederholung darf maximal 1 Jahr betragen';
      }
    }
    if (!isValidLink(formData.link)) {
      newErrors.link = 'Bitte gib eine gültige URL ein';
    }
    if (!formData.organizer.firstName.trim()) {
      newErrors['organizer.firstName'] = 'Vorname ist erforderlich';
    }
    if (!formData.organizer.lastName.trim()) {
      newErrors['organizer.lastName'] = 'Nachname ist erforderlich';
    }
    if (!formData.organizer.email.trim()) {
      newErrors['organizer.email'] = 'E-Mail ist erforderlich';
    } else if (!isValidEmail(formData.organizer.email)) {
      newErrors['organizer.email'] = 'Bitte gib eine gültige E-Mail-Adresse ein';
    }
    if (!formData.kontakt.trim()) {
      newErrors.kontakt = 'Kontakt ist erforderlich';
    }
    return newErrors;
  };

  const handleImageSelect = async (file) => {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((prev) => ({ ...prev, image: 'Nur JPEG, PNG und WebP erlaubt' }));
      return;
    }

    if (file.size > MAX_INPUT_SIZE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        image: `Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)}MB)`,
      }));
      return;
    }

    const dimensions = await getImageDimensions(file);
    const recommendation = getAspectRatioRecommendation(dimensions.width, dimensions.height);
    if (!recommendation.isRecommended) {
      setErrors((prev) => ({
        ...prev,
        image:
          'Tipp: Für beste Darstellung empfehlen wir 16:9 (Querformat) oder 9:16 (Hochformat). Andere Formate funktionieren auch, können aber abgeschnitten angezeigt werden.',
      }));
    } else {
      setErrors((prev) => ({ ...prev, image: null }));
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  };

  const handleImageSelectFromInput = (e) => {
    handleImageSelect(e.target.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (eventId) => {
    if (!imageFile) return null;

    setImageUploading(true);
    setImageProgress(0);
    try {
      const url = await uploadImage(imageFile, {
        eventId,
        onProgress: setImageProgress,
      });
      return url;
    } catch (err) {
      console.error('Image upload failed:', err);
      throw new Error('Bild-Upload fehlgeschlagen');
    } finally {
      setImageUploading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleOrganizerChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      organizer: { ...prev.organizer, [name]: value },
    }));
    if (errors[`organizer.${name}`]) {
      setErrors((prev) => ({ ...prev, [`organizer.${name}`]: null }));
    }
  };

  const handleCategoryChange = (selectedOption) => {
    setFormData((prev) => ({
      ...prev,
      category: selectedOption ? selectedOption.value : '',
    }));
    if (errors.category) {
      setErrors((prev) => ({ ...prev, category: null }));
    }
  };

  const buildEventData = (status) => ({
    title: formData.title.trim(),
    date: formData.date,
    time: formData.time || '',
    endTime: formData.endTime || '',
    endDate: formData.endDate || '',
    place: formData.place.trim(),
    contribution: formData.contribution,
    fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
    description: formData.description.trim(),
    link: normalizeLink(formData.link),
    recurrence: formData.recurrence || 'none',
    recurrenceEndDate: formData.recurrence === 'none' ? '' : formData.recurrenceEndDate || '',
    category: formData.category || 'Sonstiges',
    bezirk: formData.bezirk,
    organizer: {
      firstName: formData.organizer.firstName.trim(),
      lastName: formData.organizer.lastName.trim(),
      email: formData.organizer.email.trim(),
    },
    kontakt: formData.kontakt.trim(),
    imageUrl: null,
    status,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setValidationError('');

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    if (!isAdmin) {
      if (isEdit && wasApproved) {
        setShowResubmitConfirmModal(true);
        return;
      } else if (!isEdit) {
        setShowConfirmModal(true);
        return;
      }
    }

    const status = isEdit ? event.status : isAdmin ? 'approved' : 'pending';
    await saveEvent(buildEventData(status));
  };

  const saveEvent = async (eventData) => {
    setLoading(true);
    setShowConfirmModal(false);
    setResubmitWarning(false);

    try {
      let docRef;
      if (event) {
        await updateEvent(event.id, eventData);
        docRef = { id: event.id };
      } else {
        docRef = await addEvent(eventData, eventData.status || 'pending');
      }

      if (imageFile) {
        const newImageUrl = await handleImageUpload(docRef.id);
        await updateEvent(docRef.id, { imageUrl: newImageUrl });
        if (originalImageUrl && originalImageUrl !== newImageUrl) {
          await deleteImageByUrl(originalImageUrl);
        }
      } else if (imageRemoved && originalImageUrl) {
        await deleteImageByUrl(originalImageUrl);
      }
      navigate('/admin');
    } catch (err) {
      console.error('Event save failed:', err.code, err.message);
      setSubmitError('Event konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setLoading(false);
    }
  };

  const confirmSubmit = () => {
    saveEvent(buildEventData('pending'));
  };

  const confirmResubmit = () => {
    setShowResubmitConfirmModal(false);
    setResubmitWarning(true);
    saveEvent(buildEventData('pending'));
  };

  const handleDelete = async () => {
    if (!event?.id) return;
    setDeleting(true);
    try {
      if (event.imageUrl) {
        await deleteImageByUrl(event.imageUrl).catch(() => {});
      }
      await deleteEvent(event.id);
      setShowDeleteModal(false);
      navigate('/');
    } catch (err) {
      console.error('Event delete failed:', err.code, err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="event-form-page">
      <div className="event-form-container">
        <div className="event-form-header">
          <button onClick={() => navigate('/admin')} className="btn btn-secondary back-btn">
            <ArrowLeft size={18} />
            <span>Zurück</span>
          </button>
          <h1>{getFormTitle()}</h1>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-section-header">
            <h3 className="form-section-title">Veranstalter & Kontakt</h3>
            <p className="form-section-hint">
              Diese Infos werden den Teilnehmer:innen auf der Event-Seite angezeigt.
            </p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="organizer.firstName">Vorname *</label>
              <input
                id="organizer.firstName"
                name="firstName"
                type="text"
                value={formData.organizer.firstName}
                onChange={handleOrganizerChange}
                placeholder="Vorname"
                autoComplete="given-name"
                className={errors['organizer.firstName'] ? 'input-error' : ''}
              />
              {errors['organizer.firstName'] && (
                <span className="error-text">{errors['organizer.firstName']}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="organizer.lastName">Nachname *</label>
              <input
                id="organizer.lastName"
                name="lastName"
                type="text"
                value={formData.organizer.lastName}
                onChange={handleOrganizerChange}
                placeholder="Nachname"
                autoComplete="family-name"
                className={errors['organizer.lastName'] ? 'input-error' : ''}
              />
              {errors['organizer.lastName'] && (
                <span className="error-text">{errors['organizer.lastName']}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="organizer.email">E-Mail Veranstalter *</label>
            <input
              id="organizer.email"
              name="email"
              type="text"
              inputMode="email"
              value={formData.organizer.email}
              onChange={handleOrganizerChange}
              placeholder="veranstalter@email.de"
              autoComplete="email"
              className={errors['organizer.email'] ? 'input-error' : ''}
            />
            {errors['organizer.email'] && (
              <span className="error-text">{errors['organizer.email']}</span>
            )}
          </div>

          <div className="form-group">
            <div className="input-label-row">
              <label htmlFor="kontakt">Kontakt für Teilnehmer:innen *</label>
              <span className="input-info">
                <Info size={14} />
                <span>E-Mail oder Telefonnummer</span>
              </span>
            </div>
            <input
              id="kontakt"
              name="kontakt"
              type="text"
              value={formData.kontakt}
              onChange={handleChange}
              placeholder="z.B. 0676 1234567 oder kontakt@email.de"
              className={errors.kontakt ? 'input-error' : ''}
            />
            {errors.kontakt && <span className="error-text">{errors.kontakt}</span>}
          </div>

          <div className="form-section-divider">
            <h3 className="form-section-title">Event-Details</h3>
          </div>

          <div className="form-group">
            <label htmlFor="title">Titel *</label>
            <input
              id="title"
              name="title"
              type="text"
              value={formData.title}
              onChange={handleChange}
              placeholder="z.B. Morgen-Yoga im Park"
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="category">Kategorie *</label>
            <Select
              id="category"
              options={kategorieOptions}
              value={kategorieOptions.find((opt) => opt.value === formData.category) || null}
              onChange={handleCategoryChange}
              placeholder="Kategorie auswählen..."
              className="kategorie-select"
              classNamePrefix="kategorie"
            />
            {errors.category && <span className="error-text">{errors.category}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="date">Datum *</label>
            <input
              id="date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              className={errors.date ? 'input-error' : ''}
            />
            {errors.date && <span className="error-text">{errors.date}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="bezirk">Bezirk *</label>
              <select
                id="bezirk"
                name="bezirk"
                value={formData.bezirk}
                onChange={handleChange}
                className={errors.bezirk ? 'input-error' : ''}
              >
                <option value="">Bezirk auswählen...</option>
                {BEZIRKE.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              {errors.bezirk && <span className="error-text">{errors.bezirk}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="place">Ort / Adresse *</label>
              <input
                id="place"
                name="place"
                type="text"
                value={formData.place}
                onChange={handleChange}
                placeholder="z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz"
                className={errors.place ? 'input-error' : ''}
              />
              {errors.place && <span className="error-text">{errors.place}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Beitrag</label>
            <div className="radio-group">
              <label className={`radio-label ${formData.contribution === 'free' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="contribution"
                  value="free"
                  checked={formData.contribution === 'free'}
                  onChange={handleChange}
                />
                <span>Kostenlos</span>
              </label>
              <label className={`radio-label ${formData.contribution === 'fee' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="contribution"
                  value="fee"
                  checked={formData.contribution === 'fee'}
                  onChange={handleChange}
                />
                <span>Gebühr</span>
              </label>
            </div>
          </div>

          {formData.contribution === 'fee' && (
            <div className="form-group">
              <label htmlFor="fee">Betrag (€) *</label>
              <input
                id="fee"
                name="fee"
                type="number"
                min="0"
                step="0.01"
                value={formData.fee}
                onChange={handleChange}
                placeholder="z.B. 15.00"
                className={errors.fee ? 'input-error' : ''}
              />
              {errors.fee && <span className="error-text">{errors.fee}</span>}
            </div>
          )}

          <div className="form-section-divider">
            <h3 className="form-section-title">Optionale Angaben</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="time">Uhrzeit</label>
              <input
                id="time"
                name="time"
                type="time"
                value={formData.time}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="endTime">Bis (optional)</label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                value={formData.endTime}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <div className="input-label-row">
              <label htmlFor="endDate">Enddatum (optional)</label>
              <span className="input-info">
                <Info size={14} />
                <span>Nur bei mehrtägigen Veranstaltungen (Retreats, Festivals)</span>
              </span>
            </div>
            <input
              id="endDate"
              name="endDate"
              type="date"
              value={formData.endDate}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Wiederholung</label>
            <div className="radio-group">
              <label className={`radio-label ${formData.recurrence === 'none' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="none"
                  checked={formData.recurrence === 'none'}
                  onChange={handleChange}
                />
                <span>Keine</span>
              </label>
              <label className={`radio-label ${formData.recurrence === 'weekly' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="weekly"
                  checked={formData.recurrence === 'weekly'}
                  onChange={handleChange}
                />
                <span>Wöchentlich</span>
              </label>
              <label
                className={`radio-label ${formData.recurrence === 'biweekly' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="recurrence"
                  value="biweekly"
                  checked={formData.recurrence === 'biweekly'}
                  onChange={handleChange}
                />
                <span>Zweiwöchentlich</span>
              </label>
              <label className={`radio-label ${formData.recurrence === 'monthly' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="monthly"
                  checked={formData.recurrence === 'monthly'}
                  onChange={handleChange}
                />
                <span>Monatlich</span>
              </label>
            </div>
          </div>

          {formData.recurrence !== 'none' && (
            <div className="form-group">
              <div className="input-label-row">
                <label htmlFor="recurrenceEndDate">Wiederholung bis</label>
                <span className="input-info">
                  <Info size={14} />
                  <span>Max. 1 Jahr</span>
                </span>
              </div>
              <input
                id="recurrenceEndDate"
                name="recurrenceEndDate"
                type="date"
                value={formData.recurrenceEndDate}
                onChange={handleChange}
                min={recurrenceMinDate}
                max={recurrenceMaxDate}
              />
              {errors.recurrenceEndDate && (
                <span className="error-text">{errors.recurrenceEndDate}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="description">Beschreibung</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Beschreibe das Event... (Was erwartet die Teilnehmer? Für wen ist es geeignet? Was sollte man mitbringen?)"
              rows={5}
            />
          </div>

          <div className="form-group">
            <label htmlFor="link">Link (optional)</label>
            <input
              id="link"
              name="link"
              type="text"
              value={formData.link}
              onChange={handleChange}
              placeholder="www.deineurl.com"
            />
            {errors.link && <span className="error-text">{errors.link}</span>}
          </div>

          <div className="form-group">
            <label>Bild (optional)</label>
            {imagePreview ? (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Vorschau" className="image-preview" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="image-remove-btn"
                  aria-label="Bild entfernen"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                className={`image-upload-area ${isDraggingOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Image size={24} />
                <span>
                  {isDraggingOver
                    ? 'Datei hier ablegen'
                    : `Bild auswählen oder Datei hierher ziehen (JPEG, PNG, WebP, max. ${Math.round(
                        MAX_INPUT_SIZE_BYTES / 1024 / 1024
                      )}MB)`}
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelectFromInput}
              style={{ display: 'none' }}
            />
            {errors.image && <span className="error-text">{errors.image}</span>}
            {imageUploading && (
              <div className="upload-progress">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${imageProgress}%` }} />
                </div>
                <span className="upload-progress-text">
                  {imageProgress < 100
                    ? `Bild wird hochgeladen… ${imageProgress}%`
                    : 'Upload abgeschlossen'}
                </span>
              </div>
            )}
          </div>

          {submitError && <p className="error-text submit-error">{submitError}</p>}

          {resubmitWarning && (
            <div className="resubmit-warning">
              <p>
                <strong>Hinweis:</strong> Durch das erneute Einreichen wird das Event wieder auf
                &quot;Ausstehend&quot; gesetzt und muss erneut durch einen Admin genehmigt werden,
                bevor es öffentlich angezeigt wird.
              </p>
            </div>
          )}

          {validationError && <p className="error-text submit-error">{validationError}</p>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-secondary">
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || imageUploading}>
              <Save size={18} />
              <span>{getSubmitButtonText()}</span>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="btn btn-subtle-danger"
                data-testid="delete-event-from-form-button"
                aria-label="Event löschen"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showConfirmModal}
        title="Event zur Genehmigung einreichen"
        message="Ihr Event wird zur Prüfung eingereicht. Erst nach Genehmigung durch einen Admin wird es öffentlich angezeigt."
        confirmLabel="Einreichen"
        cancelLabel="Abbrechen"
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        loading={loading}
      />

      <ConfirmDialog
        isOpen={showResubmitConfirmModal}
        title="Event erneut einreichen"
        message="Durch das Bearbeiten wird das Event wieder auf 'Ausstehend' gesetzt und muss erneut durch einen Admin genehmigt werden. Möchten Sie fortfahren?"
        confirmLabel="Ja, fortfahren"
        cancelLabel="Abbrechen"
        onConfirm={confirmResubmit}
        onCancel={() => setShowResubmitConfirmModal(false)}
        loading={loading}
      />

      <ConfirmDialog
        isOpen={showDeleteModal}
        title="Event löschen"
        message="Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        loading={deleting}
        danger
      />
    </div>
  );
}
