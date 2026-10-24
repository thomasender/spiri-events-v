import { useState, useRef, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';
import { useEvents, BEZIRKE } from '../hooks/useEvents';
import CityField from './CityField';
import { validateCity, canonicalCity } from '../utils/gemeinden';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { resolveOrganizerPhotoURL } from '../utils/organizerPhoto';
import {
  uploadImage,
  uploadEventCover,
  deleteImageByUrl,
  getImageDimensions,
  getAspectRatioRecommendation,
  MAX_INPUT_SIZE_BYTES,
} from '../lib/imageUpload';
import { ArrowLeft, Save, Image, X, Info, Trash2, Plus } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import { arrayUnion } from 'firebase/firestore';
import { canDeleteEvent, requiresDeleteReason } from '../utils/eventPermissions';
import RichTextEditor from './RichTextEditorLazy';
import FocalPointPicker from './FocalPointPicker';
import { isHtmlEmpty } from '../utils/sanitize';
import { normalizeLink } from '../utils/link';
import {
  DEFAULT_FOCAL_POINT,
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  isDefaultFocalPoint,
  normalizeFocalPoint,
  normalizeImageZoom,
} from '../lib/eventImage';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
} from '../utils/customSeriesUpdates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import {
  bezirkLabel,
  DEFAULT_REGION_ID,
  pickEventRegionId,
  resolveRegionId,
} from '../utils/regions';
import { useRegionChoices } from '../hooks/useRegionChoices';
import { keepIfInRegion, selectedRegionId, subdivisionFor } from '../utils/regionChoices';
import EventRegionDialog, { BEZIRK_NOT_FOUND } from './EventRegionDialog';
import { normalizeCategoryInput, isValidCategoryInput } from '../utils/categoryInput';
import InstagramConsentField from './InstagramConsentField';
import {
  buildInstagramHandleOverridePatch,
  isEditingForeignEvent,
  resolveOrganizerProfileHandle,
} from '../utils/instagramHandle';
import { useOrganizerProfile } from '../hooks/useOrganizerProfile';
import InstagramImagePicker from './InstagramImagePicker';
import {
  COVER_SOURCE,
  INSTAGRAM_UPLOAD_SOURCE,
  buildInstagramImageCandidates,
  extractDescriptionImageUrls,
  resolveInstagramImage,
} from '../utils/instagramImageChoice';
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
  feeMax: '',
  priceCurrency: DEFAULT_CURRENCY,
  feeNote: '',
  firstSessionFree: false,
  description: '',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  customDates: [],
  category: '',
  bezirk: '',
  city: '',
  isOnline: false,
  organizer: { name: '', email: '' },
  kontakt: '',
};

function getOrganizerDefault(displayName, email) {
  const trimmed = (displayName || '').trim();
  if (trimmed) return trimmed;
  if (email) return email.split('@')[0];
  return '';
}

function splitOrganizerName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function combineOrganizerName(organizer) {
  if (!organizer) return '';
  if (organizer.name && organizer.name.trim()) return organizer.name.trim();
  return [organizer.firstName || '', organizer.lastName || ''].filter(Boolean).join(' ');
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

export default function EventForm({ event }) {
  const { user } = useAuth();
  const { role } = useAuth();
  const { profile } = useProfile(user?.uid);
  const { addEvent, updateEvent, deleteEvent, submitForReview, revertToDraft } = useEvents(user);
  const allCategories = useCategories();
  const [searchParams] = useSearchParams();
  const occurrenceDate = searchParams.get('occurrenceDate');
  // Categories the user has typed into the dropdown during this session.
  // They live here (and not in `useCategories`) because `useCategories` only
  // knows about categories backed by approved events — so a brand-new category
  // wouldn't be findable by `value=` until at least one event with it has
  // been approved. Holding them locally keeps the CreatableSelect's selected
  // value rendered correctly.
  const [extraCategories, setExtraCategories] = useState([]);
  const kategorieOptions = [...allCategories, ...extraCategories]
    .filter((cat, idx, arr) => arr.findIndex((c) => c.toLowerCase() === cat.toLowerCase()) === idx)
    .map((k) => ({ value: k, label: k }));

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
        feeMax: event.feeMax ?? '',
        priceCurrency: event.priceCurrency || DEFAULT_CURRENCY,
        feeNote: event.feeNote || '',
        firstSessionFree: event.firstSessionFree === true,
        description: event.description || '',
        link: event.link || '',
        recurrence: event.recurrence || 'none',
        recurrenceEndDate: event.recurrenceEndDate || '',
        customDates: Array.isArray(event.customDates) ? [...event.customDates] : [],
        category: event.category || '',
        bezirk: event.isOnline ? '' : event.bezirk || '',
        city: event.isOnline ? '' : event.city || '',
        isOnline: Boolean(event.isOnline),
        // Carried through so an edit keeps the stored region (the region field
        // only exists with two or more active regions).
        regionId: event.regionId || '',
        organizer: {
          name: combineOrganizerName(storedOrganizer),
          email: storedOrganizer.email || '',
        },
        kontakt: event.kontakt || '',
      };
    }
    const organizerDefault = getOrganizerDefault(user?.displayName, user?.email);
    return {
      ...INITIAL_STATE,
      organizer: {
        name: organizerDefault,
        email: user?.email || '',
      },
      kontakt: user?.email || '',
    };
  };

  const [formData, setFormData] = useState(buildInitialState);
  // Region field: only with two or more active regions (otherwise nothing
  // changes). An existing event keeps its stored region unless the user picks
  // another one; events without regionId count as Vorarlberg.
  const storedRegionId = event ? resolveRegionId(event) : '';
  const regionChoices = useRegionChoices({ keepRegionId: storedRegionId });
  const selectedRegion = regionChoices.enabled
    ? selectedRegionId(formData.regionId || storedRegionId, regionChoices)
    : '';
  const subdivision = subdivisionFor(selectedRegion, regionChoices);
  const subdivisionLabel = subdivision.label;
  const bezirkOptions = subdivision.options ?? BEZIRKE;
  // A region without any Bezirk / Landkreis in its register cannot require one.
  const bezirkRequired = bezirkOptions.length > 0;
  // Vorarlberg: pick the Gemeinde, the Bezirk follows. Other regions have no Gemeinde
  // list: free-text Ort plus the Bezirk / Landkreis select.
  const useGemeinden =
    (selectedRegion || storedRegionId || DEFAULT_REGION_ID) === DEFAULT_REGION_ID;
  // Edit: the stored value (absent == no consent). New: the profile default,
  // which may load after the first render, until the user touches the box.
  const [instagramConsent, setInstagramConsent] = useState(
    event ? event.instagramConsent === true : profile?.instagramConsentDefault === true
  );
  const instagramConsentTouched = useRef(Boolean(event));
  const [instagramHandleOverride, setInstagramHandleOverride] = useState(
    typeof event?.instagramHandleOverride === 'string' ? event.instagramHandleOverride : ''
  );
  // The Instagram name belongs to the event's creator: when an admin edits
  // someone else's event, never fall back to the admin's own profile handle.
  const editsForeignEvent = isEditingForeignEvent(event, user);
  const { profile: organizerPublicProfile } = useOrganizerProfile(
    editsForeignEvent ? event.createdBy : null
  );
  const organizerInstagramHandle = resolveOrganizerProfileHandle({
    event,
    user,
    ownProfile: profile,
    organizerPublicProfile,
  });
  const profileInstagramDefault = profile?.instagramConsentDefault === true;
  useEffect(() => {
    if (!instagramConsentTouched.current) setInstagramConsent(profileInstagramDefault);
  }, [profileInstagramDefault]);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [wobblingAction, setWobblingAction] = useState(null);
  const wobbleTimersRef = useRef({});
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(event?.imageUrl || '');
  const [originalImageUrl] = useState(event?.imageUrl || '');
  const [originalImageThumbUrl] = useState(event?.imageThumbUrl || '');
  const [imageZoom, setImageZoom] = useState(normalizeImageZoom(event?.imageZoom));
  const [imageFocalPoint, setImageFocalPoint] = useState(
    normalizeFocalPoint(event?.imageFocalPoint) ?? DEFAULT_FOCAL_POINT
  );
  const [imageRemoved, setImageRemoved] = useState(false);
  // Baseline for "did the user change anything besides the Instagram settings?"
  const [initialFormData] = useState(() => JSON.stringify(formData));
  const [initialImageCrop] = useState(() => JSON.stringify([imageFocalPoint, imageZoom]));

  // Instagram photo + 4:5 crop. Works for every event, including old ones
  // that have no `instagramImage` yet; a stored URL that is neither the cover
  // nor a description image is the earlier "extra photo for Instagram".
  const storedInstagramImage =
    event?.instagramImage && typeof event.instagramImage.url === 'string'
      ? event.instagramImage
      : null;
  const storedInstagramSource = (() => {
    if (!storedInstagramImage) return null;
    const url = storedInstagramImage.url;
    if (url === event?.imageUrl) return COVER_SOURCE;
    if (extractDescriptionImageUrls(event?.description).includes(url)) return url;
    return INSTAGRAM_UPLOAD_SOURCE;
  })();
  const [instagramImageChoice, setInstagramImageChoice] = useState(() =>
    storedInstagramSource
      ? {
          source: storedInstagramSource,
          focalPoint: storedInstagramImage.focalPoint,
          zoom: storedInstagramImage.zoom,
        }
      : null
  );
  const [instagramFile, setInstagramFile] = useState(null);
  const [instagramPreview, setInstagramPreview] = useState(
    storedInstagramSource === INSTAGRAM_UPLOAD_SOURCE ? storedInstagramImage.url : ''
  );
  const [instagramUploadError, setInstagramUploadError] = useState('');
  const instagramImageCandidates = useMemo(
    () =>
      buildInstagramImageCandidates({
        coverPreview: imagePreview,
        description: formData.description,
        instagramPreview,
      }),
    [imagePreview, formData.description, instagramPreview]
  );
  const effectiveInstagramImageChoice = useMemo(() => {
    const stillThere = instagramImageCandidates.some(
      (c) => c.source === instagramImageChoice?.source
    );
    if (stillThere) return instagramImageChoice;
    const first = instagramImageCandidates[0];
    return first ? { source: first.source, focalPoint: { ...DEFAULT_FOCAL_POINT }, zoom: 1 } : null;
  }, [instagramImageCandidates, instagramImageChoice]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResubmitConfirmModal, setShowResubmitConfirmModal] = useState(false);
  const [resubmitWarning, setResubmitWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRecurringDeleteDialog, setShowRecurringDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cancelTarget = location.state?.from || '/admin';

  const isAdmin = role === 'Admin';
  const isEdit = Boolean(event);
  const wasApproved = event?.status === 'approved';
  const isDraft = event?.status === 'draft';
  const isPending = event?.status === 'pending';
  const canDelete = isEdit && canDeleteEvent(user, event, role);
  const deleteReasonRequired = isEdit && requiresDeleteReason(user, event, role);
  // Changing only the Instagram consent / photo of an approved event needs
  // no new admin approval (product decision 52M1ujwr): it stays approved.
  const onlyInstagramChanged =
    isEdit &&
    !imageFile &&
    !imageRemoved &&
    JSON.stringify(formData) === initialFormData &&
    JSON.stringify([imageFocalPoint, imageZoom]) === initialImageCrop;
  const needsReapproval = isEdit && wasApproved && !isAdmin && !onlyInstagramChanged;

  const getFormTitle = () => {
    if (isEdit) return 'Event bearbeiten';
    return isAdmin ? 'Neues Event erstellen' : 'Event zur Genehmigung einreichen';
  };

  const getSubmitButtonText = () => {
    if (imageUploading) return `Wird hochgeladen… (${imageProgress}%)`;
    if (loading) return 'Speichern...';
    if (isEdit) return needsReapproval ? 'Erneut einreichen' : 'Änderungen speichern';
    return isAdmin ? 'Event erstellen' : 'Einreichen zur Genehmigung';
  };

  const getDraftButtonText = () => {
    if (imageUploading) return `Wird hochgeladen… (${imageProgress}%)`;
    if (loading) return 'Speichern...';
    if (isEdit) return 'Als Entwurf speichern';
    return 'Als Entwurf speichern';
  };

  const canSaveAsDraft = !isEdit || isDraft || (isPending && !isAdmin);

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
    // An unexpected year (e.g. 5 digits) gives an invalid date; toISOString() would throw.
    if (Number.isNaN(eventDate.getTime())) return '';
    eventDate.setDate(eventDate.getDate() + 180);
    if (Number.isNaN(eventDate.getTime())) return '';
    return eventDate.toISOString().split('T')[0];
  }, [formData.date]);

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich';
    if (isHtmlEmpty(formData.description)) newErrors.description = 'Beschreibung ist erforderlich';
    if (!formData.date) newErrors.date = 'Datum ist erforderlich';
    if (!formData.isOnline) {
      const cityError = useGemeinden
        ? validateCity(formData.city, formData.bezirk)
        : (formData.city || '').trim()
          ? null
          : 'Bitte Ort angeben oder als Online-Event markieren';
      if (cityError) newErrors.city = cityError;
      if (!useGemeinden && bezirkRequired && !formData.bezirk) {
        newErrors.bezirk = `Bitte ${subdivisionLabel} auswählen oder als Online-Event markieren`;
      }
    }
    if (!formData.category) {
      newErrors.category = 'Kategorie ist erforderlich';
    }
    if (formData.contribution === 'fee' && formData.fee && Number(formData.fee) < 0) {
      newErrors.fee = 'Bitte gib einen gültigen Betrag ein';
    }
    if (
      formData.contribution === 'fee' &&
      formData.feeMax !== '' &&
      formData.feeMax != null &&
      (!formData.fee ||
        !Number.isFinite(Number(formData.feeMax)) ||
        Number(formData.feeMax) < Number(formData.fee))
    ) {
      newErrors.feeMax = 'Maximalbetrag muss ≥ Betrag sein';
    }
    if (formData.recurrence !== 'none' && formData.recurrenceEndDate && recurrenceMaxDate) {
      const endRecurrenceDate = new Date(formData.recurrenceEndDate + 'T12:00:00');
      const maxDate = new Date(recurrenceMaxDate + 'T12:00:00');
      if (endRecurrenceDate > maxDate) {
        newErrors.recurrenceEndDate = 'Wiederholung darf maximal 180 Tage betragen';
      }
    }
    if (
      formData.recurrence === 'custom' &&
      (!formData.customDates || formData.customDates.length === 0)
    ) {
      newErrors.customDates = 'Bitte mindestens ein Datum hinzufügen';
    }
    if (!isValidLink(formData.link)) {
      newErrors.link = 'Bitte gib eine gültige URL ein';
    }
    if (!formData.organizer.name.trim()) {
      newErrors['organizer.name'] = 'Veranstalter ist erforderlich';
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
    setImageFocalPoint(DEFAULT_FOCAL_POINT);
    setImageZoom(MIN_IMAGE_ZOOM);
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
    setImageFocalPoint(DEFAULT_FOCAL_POINT);
    setImageZoom(MIN_IMAGE_ZOOM);
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
      return await uploadEventCover(imageFile, {
        eventId,
        onProgress: setImageProgress,
      });
    } catch (err) {
      console.error('Image upload failed:', err);
      throw new Error('Bild-Upload fehlgeschlagen');
    } finally {
      setImageUploading(false);
    }
  };

  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  // "Finde meinen Bezirk nicht" opens the region dialog instead of setting a value.
  const handleBezirkChange = (e) => {
    if (e.target.value === BEZIRK_NOT_FOUND) {
      setRegionDialogOpen(true);
      return;
    }
    handleChange(e);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        ...(name === 'isOnline' && checked ? { bezirk: '', city: '' } : {}),
      }));
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: null }));
      }
      if (name === 'isOnline' && errors.city) {
        setErrors((prev) => ({ ...prev, city: null }));
      }
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'bezirk' && value ? { isOnline: false } : {}),
      // A new region has its own Bezirke / Landkreise (and Orte): drop what no longer fits.
      ...(name === 'regionId'
        ? { bezirk: keepIfInRegion(prev.bezirk, value, regionChoices), city: '' }
        : {}),
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCityChange = ({ city, bezirk }) => {
    setFormData((prev) => ({ ...prev, city, bezirk, ...(city.trim() ? { isOnline: false } : {}) }));
    if (errors.city) setErrors((prev) => ({ ...prev, city: null }));
    if (errors.isOnline) setErrors((prev) => ({ ...prev, isOnline: null }));
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
    setFormData((prev) => {
      const pickedName = selectedOption ? selectedOption.value : '';
      return {
        ...prev,
        category: pickedName,
      };
    });
    if (errors.category) {
      setErrors((prev) => ({ ...prev, category: null }));
    }
  };

  const handleCreateCategory = (input) => {
    const normalized = normalizeCategoryInput(input);
    if (!isValidCategoryInput(normalized)) return;
    setExtraCategories((prev) =>
      prev.some((c) => c.toLowerCase() === normalized.toLowerCase()) ? prev : [...prev, normalized]
    );
    setFormData((prev) => ({
      ...prev,
      category: normalized,
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

  const instagramImageNeedsUpload = () => {
    const source = effectiveInstagramImageChoice?.source;
    return (
      (source === COVER_SOURCE && Boolean(imageFile)) ||
      (source === INSTAGRAM_UPLOAD_SOURCE && Boolean(instagramFile))
    );
  };

  const handleInstagramImageSelect = (file) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setInstagramUploadError('Nur JPEG, PNG und WebP erlaubt');
      return;
    }
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      setInstagramUploadError(
        `Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)}MB)`
      );
      return;
    }
    setInstagramUploadError('');
    setInstagramFile(file);
    setInstagramPreview(URL.createObjectURL(file));
    setInstagramImageChoice({
      source: INSTAGRAM_UPLOAD_SOURCE,
      focalPoint: { ...DEFAULT_FOCAL_POINT },
      zoom: 1,
    });
  };

  const removeInstagramImage = () => {
    setInstagramFile(null);
    setInstagramPreview('');
    setInstagramUploadError('');
    setInstagramImageChoice((prev) => (prev?.source === INSTAGRAM_UPLOAD_SOURCE ? null : prev));
  };

  const buildInstagramData = () => ({
    instagramConsent,
    ...buildInstagramHandleOverridePatch({
      consent: instagramConsent,
      input: instagramHandleOverride,
      organizerHandle: organizerInstagramHandle,
      stored: event?.instagramHandleOverride,
    }),
    // A newly picked cover / extra photo gets its URL after the upload in
    // saveEvent(); everything else can be resolved right away.
    ...(instagramConsent && !instagramImageNeedsUpload()
      ? {
          instagramImage: resolveInstagramImage(effectiveInstagramImageChoice, {
            coverUrl: imageFile || imageRemoved ? null : originalImageUrl,
            instagramUploadUrl: instagramFile ? null : instagramPreview,
          }),
        }
      : {}),
  });

  const buildEventData = (status) => ({
    title: formData.title.trim(),
    date: formData.date,
    time: formData.time || '',
    endTime: formData.endTime || '',
    endDate: formData.endDate || '',
    place: formData.isOnline ? '' : formData.place.trim(),
    contribution: formData.contribution,
    fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
    feeMax:
      formData.contribution === 'fee' &&
      formData.feeMax !== '' &&
      formData.feeMax != null &&
      Number.isFinite(Number(formData.feeMax)) &&
      Number(formData.feeMax) >= Number(formData.fee)
        ? Number(formData.feeMax)
        : null,
    priceCurrency: formData.contribution === 'fee' ? formData.priceCurrency : null,
    feeNote: formData.contribution === 'fee' ? formData.feeNote.trim().slice(0, 12) : '',
    firstSessionFree: formData.contribution === 'fee' && formData.firstSessionFree === true,
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
    city: formData.isOnline ? '' : canonicalCity(formData.city),
    isOnline: Boolean(formData.isOnline),
    regionId: pickEventRegionId(
      regionChoices.enabled ? selectedRegion : formData.regionId,
      isEdit ? event : null
    ),
    organizer: {
      firstName: splitOrganizerName(formData.organizer.name).firstName,
      lastName: splitOrganizerName(formData.organizer.name).lastName,
      email: isEdit ? event.organizer.email : formData.organizer.email.trim(),
      photoURL: resolveOrganizerPhotoURL({ isEdit, event, user, profile }),
    },
    kontakt: formData.kontakt.trim(),
    ...buildInstagramData(),
    imageUrl: imageFile || imageRemoved ? null : originalImageUrl || null,
    imageThumbUrl: imageFile || imageRemoved ? null : originalImageThumbUrl || null,
    imageFocalPoint:
      imageFile || imageRemoved || isDefaultFocalPoint(imageFocalPoint) ? null : imageFocalPoint,
    imageZoom: imageFile || imageRemoved || imageZoom <= MIN_IMAGE_ZOOM ? null : imageZoom,
    status,
  });

  const triggerWobble = (action) => {
    setWobblingAction(null);
    if (wobbleTimersRef.current[action]) {
      clearTimeout(wobbleTimersRef.current[action]);
    }
    requestAnimationFrame(() => {
      setWobblingAction(action);
      wobbleTimersRef.current[action] = setTimeout(() => {
        setWobblingAction((current) => (current === action ? null : current));
      }, 850);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setValidationError('');

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      triggerWobble('submit');
      return;
    }

    if (needsReapproval) {
      setShowResubmitConfirmModal(true);
      return;
    }
    if (!isEdit) {
      setShowConfirmModal(true);
      return;
    }

    // An owner's approved event stays approved only for Instagram-only edits.
    // Send just those fields: the security rules reject any other field change
    // on an approved event, and the full form payload normalises fields (e.g.
    // empty defaults on old events) that would count as changes.
    if (wasApproved && !isAdmin) {
      await saveEvent({ ...buildInstagramData(), status: 'approved' });
      return;
    }
    await saveEvent(buildEventData(event.status));
  };

  const handleSaveAsDraft = async () => {
    setSubmitError('');
    setValidationError('');

    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      triggerWobble('draft');
      return;
    }

    await saveEvent(buildEventData('draft'));
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

      const instagramSource = eventData.instagramConsent
        ? effectiveInstagramImageChoice?.source
        : null;
      if (instagramSource === INSTAGRAM_UPLOAD_SOURCE && instagramFile) {
        const instagramUploadUrl = await uploadImage(instagramFile, { eventId: docRef.id });
        await updateEvent(docRef.id, {
          instagramImage: resolveInstagramImage(effectiveInstagramImageChoice, {
            instagramUploadUrl,
          }),
        });
      }

      if (imageFile) {
        const { url: newImageUrl, thumbUrl: newThumbUrl } = await handleImageUpload(docRef.id);
        const patch = { imageUrl: newImageUrl, imageThumbUrl: newThumbUrl };
        if (!isDefaultFocalPoint(imageFocalPoint)) {
          patch.imageFocalPoint = imageFocalPoint;
        }
        if (imageZoom > MIN_IMAGE_ZOOM) {
          patch.imageZoom = imageZoom;
        }
        if (instagramSource === COVER_SOURCE) {
          patch.instagramImage = resolveInstagramImage(effectiveInstagramImageChoice, {
            coverUrl: newImageUrl,
          });
        }
        await updateEvent(docRef.id, patch);
        if (originalImageUrl && originalImageUrl !== newImageUrl) {
          await deleteImageByUrl(originalImageUrl);
          await deleteImageByUrl(originalImageThumbUrl);
        }
      } else if (imageRemoved && originalImageUrl) {
        await deleteImageByUrl(originalImageUrl);
        await deleteImageByUrl(originalImageThumbUrl);
      }
      navigate(cancelTarget);
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

  const handleDelete = async (reason) => {
    if (!event?.id) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id, { reason });
      setShowDeleteModal(false);
      navigate(cancelTarget);
    } catch (err) {
      console.error('Event trash failed:', err.code, err.message);
      setDeleting(false);
    }
  };

  const handleDeleteThisOnly = async () => {
    const dateToDelete = occurrenceDate || event.date;
    setDeleting(true);
    try {
      if (event.recurrence === 'custom') {
        await updateEvent(event.id, buildCustomDeleteOccurrenceUpdate(event, dateToDelete));
      } else {
        await updateEvent(event.id, {
          exceptionDates: arrayUnion(dateToDelete),
        });
      }
      setShowRecurringDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete this only failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteThisAndFuture = async () => {
    const deleteDate = occurrenceDate || event.date;
    setDeleting(true);
    try {
      if (event.recurrence === 'custom') {
        await updateEvent(event.id, buildCustomDeleteFromDateUpdate(event, deleteDate));
      } else {
        const [year, month, day] = deleteDate.split('-');
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
        await updateEvent(event.id, {
          recurrenceEndDate: prevDateStr,
        });
      }
      setShowRecurringDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete this and future failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteAll = async (reason) => {
    setDeleting(true);
    try {
      await deleteEvent(event.id, { reason });
      setShowRecurringDeleteDialog(false);
      navigate(cancelTarget);
    } catch (err) {
      console.error('Delete all failed:', err);
      setDeleting(false);
    }
  };

  return (
    <div className="event-form-page">
      <div className="event-form-container">
        <div className="event-form-header">
          <button onClick={() => navigate(cancelTarget)} className="btn btn-secondary back-btn">
            <ArrowLeft size={18} />
            <span>Zurück</span>
          </button>
          <h1>{getFormTitle()}</h1>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          {isEdit && event?.recurrence && event.recurrence !== 'none' && (
            <div className="recurring-info-banner">
              <Info size={16} />
              <span>
                Du bearbeitest eine Veranstaltungs-Serie. Änderungen an Wiederholung, Uhrzeit oder
                Ort gelten für alle Termine.
              </span>
            </div>
          )}

          <div className="form-section-header">
            <h3 className="form-section-title">Veranstalter & Kontakt</h3>
            <p className="form-section-hint">
              Diese Infos werden den Teilnehmer:innen auf der Event-Seite angezeigt.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="organizer.name">Veranstalter *</label>
            <input
              id="organizer.name"
              name="name"
              type="text"
              value={formData.organizer.name}
              onChange={handleOrganizerChange}
              placeholder="z.B. Peter Mathis oder Yoga Studio Dornbirn"
              autoComplete="organization"
              className={errors['organizer.name'] ? 'input-error' : ''}
            />
            {errors['organizer.name'] && (
              <span className="error-text">{errors['organizer.name']}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="organizer.email">
              E-Mail Veranstalter *{' '}
              {isEdit && <span className="input-info">(wird nicht angezeigt)</span>}
            </label>
            <input
              id="organizer.email"
              name="email"
              type="text"
              inputMode="email"
              value={formData.organizer.email}
              onChange={handleOrganizerChange}
              placeholder="veranstalter@email.de"
              autoComplete="email"
              disabled={isEdit}
              className={errors['organizer.email'] ? 'input-error' : ''}
            />
            {isEdit && (
              <span className="input-hint">
                Diese E-Mail ist gesperrt und kann nicht geändert werden.
              </span>
            )}
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
            <CreatableSelect
              id="category"
              options={kategorieOptions}
              value={kategorieOptions.find((opt) => opt.value === formData.category) || null}
              onChange={handleCategoryChange}
              onCreateOption={handleCreateCategory}
              isValidNewOption={(input) => {
                const normalized = normalizeCategoryInput(input);
                if (!isValidCategoryInput(normalized)) return false;
                return !kategorieOptions.some(
                  (o) => o.value.toLowerCase() === normalized.toLowerCase()
                );
              }}
              formatCreateLabel={(input) =>
                `"${normalizeCategoryInput(input)}" als neue Kategorie anlegen`
              }
              placeholder="Kategorie auswählen oder neu anlegen..."
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
              required
            />
            {errors.date && <span className="error-text">{errors.date}</span>}
          </div>

          <div className="form-row">
            {useGemeinden ? (
              <CityField
                city={formData.city}
                bezirk={formData.bezirk}
                disabled={formData.isOnline}
                error={errors.city}
                onChange={handleCityChange}
                onOtherRegion={regionChoices.enabled ? () => setRegionDialogOpen(true) : undefined}
              />
            ) : (
              <div>
                <CityField
                  free
                  city={formData.city}
                  bezirk={formData.bezirk}
                  disabled={formData.isOnline}
                  error={errors.city}
                  onChange={handleCityChange}
                />
                <div className="form-group">
                  <label htmlFor="bezirk">{subdivisionLabel} *</label>
                  <select
                    id="bezirk"
                    name="bezirk"
                    value={formData.bezirk}
                    onChange={handleBezirkChange}
                    disabled={formData.isOnline}
                    className={errors.bezirk ? 'input-error' : ''}
                  >
                    <option value="">{subdivisionLabel} auswählen...</option>
                    {bezirkOptions.map((b) => (
                      <option key={b} value={b}>
                        {bezirkLabel(b)}
                      </option>
                    ))}
                    <option value={BEZIRK_NOT_FOUND}>Finde meinen {subdivisionLabel} nicht</option>
                  </select>
                  {errors.bezirk && <span className="error-text">{errors.bezirk}</span>}
                </div>
              </div>
            )}
            {regionChoices.enabled && (
              <EventRegionDialog
                isOpen={regionDialogOpen}
                regionName={regionChoices.options.find((r) => r.id === selectedRegion)?.name ?? ''}
                value={selectedRegion}
                options={regionChoices.options}
                onChange={handleChange}
                onClose={() => setRegionDialogOpen(false)}
              />
            )}

            <div className="form-group">
              <label htmlFor="place">Adresse / Veranstaltungsort</label>
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
              <span>Online-Event (kein Ort und keine Adresse nötig)</span>
            </label>
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
              <label
                className={`radio-label ${formData.contribution === 'donation' ? 'active' : ''}`}
              >
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
            <div className="form-row fee-row">
              <div className="form-group">
                <label htmlFor="fee">Betrag</label>
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
                  data-testid="fee-input"
                />
                {errors.fee && <span className="error-text">{errors.fee}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="feeMax">
                  Betrag bis
                  <span className="input-info">
                    <Info size={14} />
                    <span>Optional: Wenn leer gilt der Betrag</span>
                  </span>
                </label>
                <input
                  id="feeMax"
                  name="feeMax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.feeMax}
                  onChange={handleChange}
                  placeholder="z.B. 25.00"
                  className={errors.feeMax ? 'input-error' : ''}
                  data-testid="fee-max-input"
                />
                {errors.feeMax && <span className="error-text">{errors.feeMax}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="feeNote">
                  Einheit
                  <span className="input-info">
                    <Info size={14} />
                    <span>z.B. Einzelstunde, 10er-Block, ganzer Kurs</span>
                  </span>
                </label>
                <input
                  id="feeNote"
                  name="feeNote"
                  type="text"
                  maxLength={12}
                  value={formData.feeNote}
                  onChange={handleChange}
                  placeholder="z.B. Einzelstunde"
                  data-testid="fee-note-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="priceCurrency">Währung</label>
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
              <div className="form-group">
                <label className="checkbox-label checkbox-label--inline" htmlFor="firstSessionFree">
                  <input
                    id="firstSessionFree"
                    name="firstSessionFree"
                    type="checkbox"
                    checked={formData.firstSessionFree}
                    onChange={handleChange}
                    data-testid="first-session-free-checkbox"
                  />
                  <span>1. Einheit gratis</span>
                </label>
              </div>
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
                <label
                  className={`radio-label ${formData.recurrence === 'weekly' ? 'active' : ''}`}
                >
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
                <label
                  className={`radio-label ${formData.recurrence === 'monthly' ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="recurrence"
                    value="monthly"
                    checked={formData.recurrence === 'monthly'}
                    onChange={handleChange}
                  />
                  <span>Monatlich</span>
                </label>
                <label
                  className={`radio-label ${formData.recurrence === 'custom' ? 'active' : ''}`}
                >
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
                  <span>Max. 180 Tage</span>
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
            />
            {errors.link && <span className="error-text">{errors.link}</span>}
          </div>

          <div className="form-group">
            <label>Bild (optional)</label>
            <p className="image-hint" data-testid="title-image-hint">
              Das Titelbild sollte ein ausdrucksstarkes Symbolfoto sein. Flyer eignen sich dafür
              weniger – lade sie lieber in die Beschreibung hoch.
            </p>
            {imagePreview ? (
              <div className="image-preview-container">
                <FocalPointPicker
                  imageUrl={imagePreview}
                  value={imageFocalPoint}
                  onChange={setImageFocalPoint}
                  zoom={imageZoom}
                  onZoomChange={setImageZoom}
                  showZoomSlider
                  minZoom={MIN_IMAGE_ZOOM}
                  maxZoom={MAX_IMAGE_ZOOM}
                  onRemove={removeImage}
                  ariaLabel="Fokuspunkt für das Titelbild festlegen"
                  testId="title-image-focal-picker"
                />
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

          <InstagramConsentField
            checked={instagramConsent}
            onChange={(value) => {
              instagramConsentTouched.current = true;
              setInstagramConsent(value);
            }}
            instagramHandle={organizerInstagramHandle}
            forOrganizer={editsForeignEvent}
            handleOverride={instagramHandleOverride}
            onHandleOverrideChange={setInstagramHandleOverride}
            regionId={pickEventRegionId(
              regionChoices.enabled ? selectedRegion : formData.regionId,
              event
            )}
          />

          {instagramConsent && (
            <details
              className="instagram-image-accordion"
              open
              data-testid="instagram-image-accordion"
            >
              <summary>Foto und Bildausschnitt für Instagram wählen</summary>
              <InstagramImagePicker
                candidates={instagramImageCandidates}
                value={effectiveInstagramImageChoice}
                onChange={setInstagramImageChoice}
                onUpload={handleInstagramImageSelect}
                onRemoveUpload={removeInstagramImage}
                uploadError={instagramUploadError}
                event={{
                  title: (formData.title || '').trim(),
                  category: formData.category,
                  date: formData.date,
                  time: formData.time,
                  place: formData.isOnline ? 'Online' : (formData.place || '').trim(),
                  organizer: combineOrganizerName(formData.organizer),
                }}
              />
            </details>
          )}

          {validationError && <p className="error-text submit-error">{validationError}</p>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate(cancelTarget)}
              className="btn btn-secondary"
            >
              Abbrechen
            </button>
            {canSaveAsDraft && (
              <button
                type="button"
                onClick={handleSaveAsDraft}
                className={`btn btn-secondary ${wobblingAction === 'draft' ? 'btn-wobble' : ''}`}
                disabled={loading || imageUploading}
                data-testid="save-as-draft-button"
                onAnimationEnd={() => {
                  if (wobblingAction === 'draft') {
                    setWobblingAction(null);
                  }
                }}
              >
                <Save size={22} />
                <span>{getDraftButtonText()}</span>
              </button>
            )}
            <button
              type="submit"
              className={`btn btn-primary ${wobblingAction === 'submit' ? 'btn-wobble' : ''}`}
              disabled={loading || imageUploading}
              data-testid="submit-event-button"
              onAnimationEnd={() => {
                if (wobblingAction === 'submit') {
                  setWobblingAction(null);
                }
              }}
            >
              <Save size={22} />
              <span>{getSubmitButtonText()}</span>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (event.recurrence && event.recurrence !== 'none') {
                    setShowRecurringDeleteDialog(true);
                  } else {
                    setShowDeleteModal(true);
                  }
                }}
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
        title="In Papierkorb verschieben"
        message="Das Event wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht. Du kannst es innerhalb dieser 30 Tage im Papierkorb wiederherstellen."
        confirmLabel="In Papierkorb"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        loading={deleting}
        reasonRequired={deleteReasonRequired}
      />

      <RecurringDeleteDialog
        isOpen={showRecurringDeleteDialog}
        eventTitle={event?.title}
        occurrenceDate={occurrenceDate || event?.date}
        onDeleteThisOnly={handleDeleteThisOnly}
        onDeleteThisAndFuture={handleDeleteThisAndFuture}
        onDeleteAll={handleDeleteAll}
        onCancel={() => setShowRecurringDeleteDialog(false)}
        loading={deleting}
        reasonRequired={deleteReasonRequired}
      />
    </div>
  );
}
