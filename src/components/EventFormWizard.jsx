import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { useEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import {
  uploadImage,
  deleteImageByUrl,
  getImageDimensions,
  getAspectRatioRecommendation,
  MAX_INPUT_SIZE_BYTES,
} from '../lib/imageUpload';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Image,
  X,
  Info,
  Check,
  Calendar,
  User,
  FileText,
  List,
  Plus,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import SuccessDialog from './SuccessDialog';
import { formatEventDateShort } from '../utils/eventFormat';
import RichTextEditor from './RichTextEditorLazy';
import RichTextView from './RichTextView';
import { isHtmlEmpty } from '../utils/sanitize';
import { normalizeLink } from '../utils/link';
import { CURRENCIES, DEFAULT_CURRENCY, formatPriceWithCurrency } from '../utils/currency';
import './EventForm.css';
import './EventFormWizard.css';

const INITIAL_STATE = {
  title: '',
  date: '',
  time: '',
  endDate: '',
  place: '',
  contribution: 'free',
  fee: '',
  priceCurrency: DEFAULT_CURRENCY,
  description: '',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  customDates: [],
  category: '',
  bezirk: '',
  isOnline: false,
  organizer: { firstName: '', lastName: '', email: '' },
  kontakt: '',
};

const STEPS = [
  { id: 1, key: 'organizer', title: 'Veranstalter & Kontakt', icon: User },
  { id: 2, key: 'eventInfo', title: 'Event-Infos', icon: FileText },
  { id: 3, key: 'details', title: 'Details', icon: Calendar },
  { id: 4, key: 'summary', title: 'Zusammenfassung', icon: List },
];

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

export default function EventFormWizard() {
  const { user } = useAuth();
  const { role } = useAuth();
  const { profile } = useProfile(user?.uid);
  const { addEvent, updateEvent } = useEvents(user);

  const { firstName, lastName } = splitDisplayName(user?.displayName, user?.email);
  const [formData, setFormData] = useState({
    ...INITIAL_STATE,
    organizer: {
      firstName,
      lastName,
      email: user?.email || '',
    },
    kontakt: user?.email || '',
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successState, setSuccessState] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef(null);
  const wizardContainerRef = useRef(null);
  const isInitialStepMount = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitialStepMount.current) {
      isInitialStepMount.current = false;
      return;
    }
    if (wizardContainerRef.current) {
      wizardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentStep]);

  const isAdmin = role === 'Admin';

  const hasRecurrence = formData.recurrence !== 'none';

  const handleRecurrenceToggle = (value) => {
    if (value === 'yes') {
      setFormData((prev) => ({
        ...prev,
        recurrence: prev.recurrence === 'none' ? 'weekly' : prev.recurrence,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        recurrence: 'none',
        recurrenceEndDate: '',
        customDates: [],
      }));
      setErrors((prev) => ({
        ...prev,
        recurrenceEndDate: null,
        customDates: null,
      }));
    }
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

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
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
    } else if (step === 2) {
      if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich';
      if (isHtmlEmpty(formData.description))
        newErrors.description = 'Beschreibung ist erforderlich';
    } else if (step === 3) {
      if (!formData.date) newErrors.date = 'Datum ist erforderlich';
      if (!formData.time) newErrors.time = 'Uhrzeit ist erforderlich';
      if (!formData.isOnline && !formData.bezirk) {
        newErrors.bezirk = 'Bitte Bezirk auswählen oder als Online-Event markieren';
      }
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
      if (
        formData.recurrence === 'custom' &&
        (!formData.customDates || formData.customDates.length === 0)
      ) {
        newErrors.customDates = 'Bitte mindestens ein Datum hinzufügen';
      }
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
          'Tipp: Für beste Darstellung empfehlen wir 16:9 (Querformat) oder 9:16 (Hochformat).',
      }));
    } else {
      setErrors((prev) => ({ ...prev, image: null }));
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        ...(name === 'isOnline' && checked ? { bezirk: '' } : {}),
      }));
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: null }));
      }
      if (name === 'isOnline' && errors.bezirk) {
        setErrors((prev) => ({ ...prev, bezirk: null }));
      }
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'bezirk' && value ? { isOnline: false } : {}),
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (name === 'bezirk' && errors.isOnline) {
      setErrors((prev) => ({ ...prev, isOnline: null }));
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

  const handleAddCustomDate = () => {
    setFormData((prev) => {
      const existing = prev.customDates || [];
      const last = existing[existing.length - 1];
      const baseDate = last || prev.date;
      let nextDate = '';
      if (baseDate) {
        const d = new Date(baseDate + 'T12:00:00');
        d.setDate(d.getDate() + 7);
        nextDate = d.toISOString().split('T')[0];
      }
      return { ...prev, customDates: [...existing, nextDate] };
    });
    if (errors.customDates) {
      setErrors((prev) => ({ ...prev, customDates: null }));
    }
  };

  const handleRemoveCustomDate = (index) => {
    setFormData((prev) => ({
      ...prev,
      customDates: (prev.customDates || []).filter((_, i) => i !== index),
    }));
  };

  const handleCustomDateChange = (index, value) => {
    setFormData((prev) => ({
      ...prev,
      customDates: (prev.customDates || []).map((d, i) => (i === index ? value : d)),
    }));
    if (errors.customDates) {
      setErrors((prev) => ({ ...prev, customDates: null }));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;

    const target = e.target;
    if (target && (target.isContentEditable || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (currentStep < 4) {
      e.preventDefault();
      nextStep();
    } else if (currentStep === 4) {
      e.preventDefault();
    }
  };

  const nextStep = () => {
    const stepErrors = validateStep(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }
    setErrors({});
    setValidationError('');
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const buildEventData = (status) => ({
    title: formData.title.trim(),
    date: formData.date,
    time: formData.time || '',
    endTime: '',
    endDate: formData.endDate || '',
    place: formData.isOnline ? '' : formData.place.trim(),
    contribution: formData.contribution,
    fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
    priceCurrency: formData.contribution === 'fee' ? formData.priceCurrency : null,
    description: formData.description,
    link: normalizeLink(formData.link),
    recurrence: formData.recurrence || 'none',
    recurrenceEndDate:
      formData.recurrence === 'none' || formData.recurrence === 'custom'
        ? ''
        : formData.recurrenceEndDate || '',
    customDates:
      formData.recurrence === 'custom'
        ? [
            ...new Set(
              [formData.date, ...(formData.customDates || [])].filter((d) => d && d.length > 0)
            ),
          ].sort()
        : [],
    category: formData.category || 'Sonstiges',
    bezirk: formData.isOnline ? '' : formData.bezirk,
    isOnline: Boolean(formData.isOnline),
    organizer: {
      firstName: formData.organizer.firstName.trim(),
      lastName: formData.organizer.lastName.trim(),
      email: formData.organizer.email.trim(),
      photoURL: profile?.photoURL || null,
    },
    kontakt: formData.kontakt.trim(),
    imageUrl: null,
    status,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentStep < 4) {
      return;
    }
    setSubmitError('');
    setValidationError('');

    const newErrors = validateStep(3);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleSaveAsDraft = async () => {
    setSubmitError('');
    setValidationError('');

    const newErrors = validateStep(3);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    await saveEvent(buildEventData('draft'));
  };

  const saveEvent = async (eventData) => {
    setLoading(true);
    setShowConfirmModal(false);

    try {
      const docRef = await addEvent(eventData, eventData.status || 'pending');

      if (imageFile) {
        const newImageUrl = await handleImageUpload(docRef.id);
        await updateEvent(docRef.id, { imageUrl: newImageUrl });
      }

      if (eventData.status === 'draft') {
        navigate('/admin');
        return;
      }

      setSuccessState({
        title: 'Vielen Dank!',
        eventTitle: eventData.title,
      });
    } catch (err) {
      console.error('Event save failed:', err.code, err.message);
      setSubmitError('Event konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setLoading(false);
    }
  };

  const handleSuccessConfirm = () => {
    setSuccessState(null);
    setLoading(false);
    navigate('/admin');
  };

  const confirmSubmit = () => {
    saveEvent(buildEventData('pending'));
  };

  const renderStepIndicator = () => (
    <div className="wizard-step-indicator">
      {STEPS.map((step) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;
        return (
          <div
            key={step.id}
            className={`wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
          >
            <div className="wizard-step-icon">
              {isCompleted ? <Check size={16} /> : <Icon size={16} />}
            </div>
            <span className="wizard-step-title">{step.title}</span>
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <div className="wizard-step-content">
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
    </div>
  );

  const renderStep2 = () => (
    <div className="wizard-step-content">
      <div className="form-section-header">
        <h3 className="form-section-title">Event-Infos</h3>
        <p className="form-section-hint">Beschreibe dein Event und füge optionale Infos hinzu.</p>
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
        <label htmlFor="description">Beschreibung *</label>
        <RichTextEditor
          id="description"
          value={formData.description}
          onChange={(html) => {
            setFormData((prev) => ({ ...prev, description: html }));
            if (errors.description && !isHtmlEmpty(html)) {
              setErrors((prev) => ({ ...prev, description: null }));
            }
          }}
          placeholder="Beschreibe das Event… (Was erwartet die Teilnehmer? Für wen ist es geeignet? Was sollte man mitbringen?)"
          hasError={Boolean(errors.description)}
          describedBy={errors.description ? 'description-error' : undefined}
        />
        {errors.description && (
          <span className="error-text" id="description-error" data-testid="description-error">
            {errors.description}
          </span>
        )}
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
          className={errors.link ? 'input-error' : ''}
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
    </div>
  );

  const renderStep3 = () => (
    <div className="wizard-step-content">
      <div className="form-section-header">
        <h3 className="form-section-title">Details</h3>
        <p className="form-section-hint">Wann und wo findet das Event statt?</p>
      </div>

      <div className="form-row">
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

        <div className="form-group">
          <label htmlFor="time">Uhrzeit *</label>
          <input
            id="time"
            name="time"
            type="time"
            value={formData.time}
            onChange={handleChange}
            className={errors.time ? 'input-error' : ''}
          />
          {errors.time && <span className="error-text">{errors.time}</span>}
        </div>
      </div>

      <div className="form-group">
        <div className="input-label-row">
          <label htmlFor="endDate">Enddatum (optional)</label>
          <span className="input-info">
            <Info size={14} />
            <span>Nur bei mehrtätigen Events (z.B. Retreats, Festivals, etc.) notwendig</span>
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

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="bezirk">Ort *</label>
          <select
            id="bezirk"
            name="bezirk"
            value={formData.bezirk}
            onChange={handleChange}
            disabled={formData.isOnline}
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
          <label htmlFor="place">Ort / Adresse</label>
          <input
            id="place"
            name="place"
            type="text"
            value={formData.place}
            onChange={handleChange}
            placeholder={
              formData.isOnline
                ? 'Nicht relevant für Online-Events'
                : 'z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz'
            }
            disabled={formData.isOnline}
            className={errors.place ? 'input-error' : ''}
          />
          {errors.place && <span className="error-text">{errors.place}</span>}
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-label checkbox-label--inline">
          <input
            type="checkbox"
            name="isOnline"
            checked={formData.isOnline}
            onChange={handleChange}
            data-testid="is-online-checkbox"
          />
          <span>Online-Event (kein Bezirk und keine Adresse nötig)</span>
        </label>
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
          <label className={`radio-label ${formData.contribution === 'donation' ? 'active' : ''}`}>
            <input
              type="radio"
              name="contribution"
              value="donation"
              checked={formData.contribution === 'donation'}
              onChange={handleChange}
            />
            <span>Freie Spende</span>
          </label>
        </div>
      </div>

      {formData.contribution === 'fee' && (
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="fee">Betrag *</label>
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
          <div className="form-group">
            <label htmlFor="priceCurrency">Währung *</label>
            <select
              id="priceCurrency"
              name="priceCurrency"
              value={formData.priceCurrency}
              onChange={handleChange}
              data-testid="price-currency-select"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>Wiederholung</label>
        <div className="radio-group">
          <label className={`radio-label ${!hasRecurrence ? 'active' : ''}`}>
            <input
              type="radio"
              name="hasRecurrence"
              value="no"
              checked={!hasRecurrence}
              onChange={() => handleRecurrenceToggle('no')}
              data-testid="recurrence-no-radio"
            />
            <span>Nein</span>
          </label>
          <label className={`radio-label ${hasRecurrence ? 'active' : ''}`}>
            <input
              type="radio"
              name="hasRecurrence"
              value="yes"
              checked={hasRecurrence}
              onChange={() => handleRecurrenceToggle('yes')}
              data-testid="recurrence-yes-radio"
            />
            <span>Ja</span>
          </label>
        </div>
      </div>

      {hasRecurrence && (
        <div className="form-group" data-testid="recurrence-options">
          <label>Art der Wiederholung</label>
          <div className="radio-group">
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
            <label className={`radio-label ${formData.recurrence === 'biweekly' ? 'active' : ''}`}>
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
            <label className={`radio-label ${formData.recurrence === 'custom' ? 'active' : ''}`}>
              <input
                type="radio"
                name="recurrence"
                value="custom"
                checked={formData.recurrence === 'custom'}
                onChange={handleChange}
              />
              <span>Benutzerdefinierte Termine</span>
            </label>
          </div>
        </div>
      )}

      {formData.recurrence === 'custom' && (
        <div className="form-group">
          <div className="input-label-row">
            <label>Termine</label>
            <span className="input-info">
              <Info size={14} />
              <span>Füge einzelne Termine hinzu</span>
            </span>
          </div>
          <div className="custom-dates-list" data-testid="custom-dates-list">
            {(formData.customDates || []).map((date, index) => (
              <div key={index} className="custom-date-row">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => handleCustomDateChange(index, e.target.value)}
                  data-testid={`custom-date-input-${index}`}
                  aria-label={`Termin ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveCustomDate(index)}
                  className="custom-date-remove-btn"
                  aria-label={`Termin ${index + 1} entfernen`}
                  data-testid={`custom-date-remove-${index}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddCustomDate}
            className="btn btn-secondary btn-sm custom-date-add-btn"
            data-testid="custom-date-add-button"
          >
            <Plus size={16} />
            <span>Weiteres Datum hinzufügen</span>
          </button>
          {errors.customDates && (
            <span className="error-text" data-testid="custom-dates-error">
              {errors.customDates}
            </span>
          )}
        </div>
      )}

      {formData.recurrence !== 'none' && formData.recurrence !== 'custom' && (
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
    </div>
  );

  const renderStep4 = () => (
    <div className="wizard-step-content">
      <div className="form-section-header">
        <h3 className="form-section-title">Zusammenfassung</h3>
        <p className="form-section-hint">Prüfe deine Angaben vor dem Absenden.</p>
      </div>

      <div className="summary-card">
        <div className="summary-section">
          <h4>Veranstalter & Kontakt</h4>
          <p>
            <strong>
              {formData.organizer.firstName} {formData.organizer.lastName}
            </strong>
          </p>
          <p>{formData.kontakt}</p>
        </div>

        <div className="summary-section">
          <h4>Event-Infos</h4>
          <p>
            <strong>{formData.title}</strong>
          </p>
          {formData.description && (
            <RichTextView html={formData.description} className="summary-description" />
          )}
          {formData.link && <p>Link: {formData.link}</p>}
          {imagePreview && (
            <div className="summary-image">
              <img src={imagePreview} alt="Event" />
            </div>
          )}
        </div>

        <div className="summary-section">
          <h4>Details</h4>
          <p>
            <strong>{formData.category}</strong> • {formData.isOnline ? 'Online' : formData.bezirk}
          </p>
          {!formData.isOnline && formData.place && <p>📍 {formData.place}</p>}
          <p>
            📅 {formatEventDateShort(formData.date)} um {formData.time}
          </p>
          {formData.endDate && <p>Bis: {formatEventDateShort(formData.endDate)}</p>}
          {formData.recurrence !== 'none' && (
            <p>
              🔁{' '}
              {formData.recurrence === 'weekly'
                ? 'Wöchentlich'
                : formData.recurrence === 'biweekly'
                  ? 'Zweiwöchentlich'
                  : formData.recurrence === 'monthly'
                    ? 'Monatlich'
                    : `An einzelnen Terminen (${formData.customDates?.length || 0} Termine)`}
            </p>
          )}
          <p>
            {formData.contribution === 'free'
              ? 'Kostenlos'
              : formData.contribution === 'donation'
                ? 'Freie Spende'
                : `Gebühr: ${formatPriceWithCurrency(formData.fee, formData.priceCurrency) || `${formData.fee}`}`}
          </p>
        </div>
      </div>

      {submitError && <p className="error-text submit-error">{submitError}</p>}
      {validationError && <p className="error-text submit-error">{validationError}</p>}
    </div>
  );

  return (
    <div className="event-form-page">
      <div className="event-form-container" ref={wizardContainerRef}>
        <div className="event-form-header">
          <button onClick={() => navigate('/admin')} className="btn btn-secondary back-btn">
            <ArrowLeft size={18} />
            <span>Zurück zur Verwaltung</span>
          </button>
          <h1>{isAdmin ? 'Neues Event erstellen' : 'Event zur Genehmigung einreichen'}</h1>
        </div>

        {renderStepIndicator()}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}

          <div className="wizard-actions">
            {currentStep > 1 && (
              <button type="button" onClick={prevStep} className="btn btn-secondary">
                <ArrowLeft size={18} />
                <span>Zurück</span>
              </button>
            )}
            {currentStep === 4 && (
              <button
                type="button"
                onClick={handleSaveAsDraft}
                className="btn btn-secondary"
                disabled={loading || imageUploading}
                data-testid="save-as-draft-button"
              >
                <Save size={18} />
                <span>
                  {imageUploading
                    ? `Wird hochgeladen… (${imageProgress}%)`
                    : loading
                      ? 'Speichern...'
                      : 'Als Entwurf speichern'}
                </span>
              </button>
            )}
            {currentStep < 4 ? (
              <button type="button" onClick={nextStep} className="btn btn-primary">
                <span>Weiter</span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="btn btn-primary"
                disabled={loading || imageUploading}
              >
                <Save size={18} />
                <span>
                  {imageUploading
                    ? `Wird hochgeladen… (${imageProgress}%)`
                    : loading
                      ? 'Speichern...'
                      : isAdmin
                        ? 'Event erstellen'
                        : 'Einreichen zur Genehmigung'}
                </span>
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

      <SuccessDialog
        isOpen={successState !== null}
        title={successState?.title}
        message={
          successState
            ? `Dein Event „${successState.eventTitle}” wurde erfolgreich eingereicht und wartet nun auf die Prüfung durch einen Admin.`
            : ''
        }
        details={
          'Da die Prüfung durch eine Person erfolgt, kann es etwas dauern, bis dein Event öffentlich sichtbar wird. Du kannst den Status jederzeit in deiner Verwaltung einsehen.'
        }
        confirmLabel="Zur Verwaltung"
        onConfirm={handleSuccessConfirm}
      />
    </div>
  );
}
