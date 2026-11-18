import { EVENTS, trackEvent } from '../lib/analytics';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useEvents, BEZIRKE } from '../hooks/useEvents';
import CityField from './CityField';
import { validatePlaceChoice } from '../utils/placeDistrict';
import {
  applyEventFormDefaults,
  isRememberableVenue,
  knownCategory,
  mergeVenue,
  pickDefaults,
  venueLabel,
  venuesForRegion,
} from '../utils/eventFormDefaults';
import { canonicalCity, formatCityWithBezirk } from '../utils/gemeinden';
import { applyAdminPrefill, shouldPrefillForAdmin } from '../utils/adminPrefill';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import {
  uploadImage,
  CoverUploadError,
  COVER_UPLOAD_ERROR,
  deleteImageByUrl,
  getImageDimensions,
  getAspectRatioRecommendation,
  MAX_INPUT_SIZE_BYTES,
} from '../lib/imageUpload';
import { IMAGE_FORMAT_HINT } from '../utils/imageFormatHint';
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
import DuplicateEventDialog from './DuplicateEventDialog';
import { useDuplicateCheck } from '../hooks/useDuplicateCheck';
import SuccessDialog from './SuccessDialog';
import { formatEventDateShort } from '../utils/eventFormat';
import RichTextEditor from './RichTextEditorLazy';
import RichTextView from './RichTextView';
import FocalPointPicker from './FocalPointPicker';
import EventCard from './EventCard';
import { isHtmlEmpty } from '../utils/sanitize';
import { normalizeLink } from '../utils/link';
import { FAQ_EVENT_GUIDE_PATH } from '../utils/faqs';
import { newEventId } from '../utils/eventId';
import { useBackgroundCoverUpload } from '../hooks/useBackgroundCoverUpload';
import {
  DEFAULT_FOCAL_POINT,
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  isDefaultFocalPoint,
} from '../lib/eventImage';
import { CURRENCIES, DEFAULT_CURRENCY, formatPriceWithCurrency } from '../utils/currency';
import {
  bezirkLabel,
  DEFAULT_REGION_ID,
  getSubdivisionLabel,
  isRegionSlug,
  pickEventRegionId,
  selectableBezirke,
} from '../utils/regions';
import { useRegionChoices } from '../hooks/useRegionChoices';
import { useOnlineEventGate } from '../hooks/useOnlineEventGate';
import { useConfettiCelebration } from '../hooks/useConfettiCelebration';
import { formExamples } from '../utils/regionExamples';
import { keepIfInRegion, selectedRegionId, subdivisionFor } from '../utils/regionChoices';
import EventRegionDialog, { BEZIRK_NOT_FOUND } from './EventRegionDialog';
import MonthlyModeOptions from './MonthlyModeOptions';
import {
  getMonthlyWeekdayPhrase,
  getSeriesStartDates,
  pruneExceptionDates,
} from '../utils/eventOccurrences';
import SeriesDatesOverview from './SeriesDatesOverview';
import CustomDateTimeInputs from './CustomDateTimeInputs';
import {
  buildCustomTimesPayload,
  invalidCustomTimeDates,
  moveFormCustomTime,
  setFormCustomTime,
} from '../utils/customSeriesUpdates';
import {
  saveWizardDraft,
  loadWizardDraft,
  clearWizardDraft,
  adoptGuestWizardDraft,
  wizardDraftOwner,
} from '../utils/wizardDraftStorage';
import {
  adoptGuestWizardDraftFiles,
  clearWizardDraftFiles,
  loadWizardDraftFiles,
  peekWizardDraftFiles,
  pruneWizardDraftFiles,
  saveWizardDraftFiles,
} from '../utils/wizardDraftFiles';
import EmailVerificationBanner from './EmailVerificationBanner';
import { normalizeCategoryInput, isValidCategoryInput } from '../utils/categoryInput';
import { getCategoryColor } from '../utils/categoryColors';
import { getMissingProfileFields } from '../utils/profile';
import InstagramConsentField from './InstagramConsentField';
import {
  normalizeExtraHandles,
  normalizeInstagramHandle,
  resolveInstagramHandleOverride,
} from '../utils/instagramHandle';
import InstagramImagePicker from './InstagramImagePicker';
import {
  COVER_SOURCE,
  INSTAGRAM_UPLOAD_SOURCE,
  buildInstagramImageCandidates,
  needsUploadedUrl,
  resolveInstagramImage,
} from '../utils/instagramImageChoice';
import {
  REGISTRATION_MAX_LENGTH,
  KONTAKT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  messengerLinks,
  contactPhone,
  normalizeMessengerSelection,
} from '../utils/contactFormat';
import ContactMessengerChoice from './ContactMessengerChoice';
import './EventForm.css';
import './EventFormWizard.css';

const isMonthly = (recurrence) => recurrence === 'monthly' || recurrence === 'monthlyWeekday';

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
  // Own times of single dates ({ 'YYYY-MM-DD': { time?, endTime? } }), see CustomDateTimeInputs.
  customTimes: {},
  exceptionDates: [],
  category: '',
  bezirk: '',
  city: '',
  // Region the Ort belongs to (set when a place is picked, '' = unknown): it wins over the
  // current region when saving (Trello dx8dCQJc). Not stored as such.
  placeRegionId: '',
  // The Ort was chosen from the list (not typed free); see validatePlaceChoice.
  cityPicked: false,
  isOnline: false,
  organizer: { name: '', email: '' },
  kontakt: '',
  // Messengers for the phone number in `kontakt` (Trello 6af6d067).
  kontaktMessenger: [],
  registration: '',
};

const STEPS = [
  { id: 1, key: 'organizer', title: 'Veranstalter & Kontakt', icon: User },
  { id: 2, key: 'eventInfo', title: 'Event-Infos', icon: FileText },
  { id: 3, key: 'details', title: 'Details', icon: Calendar },
  { id: 4, key: 'summary', title: 'Zusammenfassung', icon: List },
];

// " (12 Termine, 2 entfernt)" for a series with an end date, '' otherwise.
function summarySeriesCount(formData) {
  const total = getSeriesStartDates(formData).length;
  if (total === 0) return '';
  const removed = pruneExceptionDates(formData).length;
  const text = `${total - removed} Termine${removed > 0 ? `, ${removed} entfernt` : ''}`;
  return ` (${text})`;
}

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

// Opens the FAQ guide ("Welche Events passen in unseren Kalender?") in a new tab so the draft stays open.
function EventGuideLink({ children, testId }) {
  return (
    <a
      className="wizard-guide-link"
      href={FAQ_EVENT_GUIDE_PATH}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
    >
      {children}
    </a>
  );
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

// Guests cannot upload into Storage (rules): description photos come after the login.
const guestDescriptionImageUpload = async () => {
  const err = new Error('guest description image');
  err.userMessage = 'Bilder in der Beschreibung kannst du nach der Anmeldung einfügen.';
  throw err;
};

export default function EventFormWizard() {
  // Guests and members whose e-mail is not confirmed yet fill in the wizard too;
  // only submitting needs a confirmed account (docs/guest-event-draft.md).
  const { user, role, canCreateEvents, refreshEmailVerified } = useAuth();
  const location = useLocation();
  const draftOwner = wizardDraftOwner(user);
  const { profile } = useProfile(user?.uid);
  const { addEvent, updateEvent } = useEvents(user);
  const allCategories = useCategories();
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

  const organizerDefault = getOrganizerDefault(
    profile?.displayName || user?.displayName,
    user?.email
  );
  const profileDefaults = {
    organizer: {
      name: organizerDefault,
      email: user?.email || '',
    },
    kontakt: user?.email || '',
  };
  // Read once: after a login the guest draft moves onto the account first.
  const [restoredDraft] = useState(() => {
    if (user) {
      adoptGuestWizardDraft(user.uid);
      // Moves the in-memory photos at once; IndexedDB follows asynchronously.
      adoptGuestWizardDraftFiles(user.uid);
    }
    return loadWizardDraft(draftOwner);
  });
  // Photos still in memory (back from /login without a reload): restored at once.
  const [memoryFiles] = useState(() => (restoredDraft ? peekWizardDraftFiles(draftOwner) : null));
  // Coming back from the confirmation link (AuthActionPage, `next=/admin/new`).
  const cameFromVerification = location.state?.afterVerify === true;
  // `?region=tirol` (coming-soon page "Event eintragen"): the event is for that
  // region even though it is not open yet.
  const [searchParams] = useSearchParams();
  const requestedRegion = isRegionSlug(searchParams.get('region'))
    ? searchParams.get('region')
    : '';

  const [formData, setFormData] = useState(() => {
    if (restoredDraft && restoredDraft.formData) {
      return {
        ...INITIAL_STATE,
        ...restoredDraft.formData,
        ...(requestedRegion && { regionId: requestedRegion }),
        organizer: {
          ...INITIAL_STATE.organizer,
          ...(restoredDraft.formData.organizer || {}),
        },
        customDates: Array.isArray(restoredDraft.formData.customDates)
          ? restoredDraft.formData.customDates
          : [],
        customTimes:
          restoredDraft.formData.customTimes &&
          typeof restoredDraft.formData.customTimes === 'object' &&
          !Array.isArray(restoredDraft.formData.customTimes)
            ? restoredDraft.formData.customTimes
            : {},
        exceptionDates: Array.isArray(restoredDraft.formData.exceptionDates)
          ? restoredDraft.formData.exceptionDates
          : [],
        kontaktMessenger: normalizeMessengerSelection(restoredDraft.formData.kontaktMessenger),
      };
    }
    return {
      ...INITIAL_STATE,
      ...profileDefaults,
      ...(requestedRegion && { regionId: requestedRegion }),
    };
  });

  // Region field: only with two or more active regions (otherwise nothing
  // changes). The preselection is the current region.
  const regionChoices = useRegionChoices({ keepRegionId: requestedRegion });
  const selectedRegion = regionChoices.enabled
    ? selectedRegionId(formData.regionId, regionChoices)
    : '';
  const subdivision = subdivisionFor(selectedRegion, regionChoices);
  const selectedRegionObj = regionChoices.allRegions?.find((r) => r.id === selectedRegion) ?? null;
  // Online events need a directory listing in the event's region (only with two
  // or more active regions, never for staff; useOnlineEventGate).
  const onlineGate = useOnlineEventGate({
    enabled: regionChoices.enabled,
    region: selectedRegionObj ?? { id: selectedRegion },
    regions: regionChoices.allRegions,
  });
  const examples = formExamples(selectedRegionObj, { regionSpecific: regionChoices.enabled });
  const subdivisionLabel = subdivision.label;
  const bezirkOptions = subdivision.options ?? selectableBezirke(BEZIRKE);
  // Vorarlberg (and every event while only one region is active): the Gemeinde picker, which
  // also offers places of other regions. Other regions have no Gemeinde list: free-text Ort
  // plus the Bezirk / Landkreis select.
  const useGemeinden = !regionChoices.enabled || selectedRegion === DEFAULT_REGION_ID;
  // The region the event is saved in: the Ort's region when a place was picked, else the
  // region field / the requested region / the default.
  const eventRegionId = pickEventRegionId(
    formData.placeRegionId || (regionChoices.enabled ? selectedRegion : formData.regionId)
  );
  // The region the person is in (for the "other region" hint next to the Ort).
  const homeRegionId = regionChoices.enabled
    ? selectedRegion
    : pickEventRegionId(formData.regionId || regionChoices.defaultRegionId);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [wobblingAction, setWobblingAction] = useState(null);
  const wobbleTimersRef = useRef({});
  const [imageFile, setImageFile] = useState(() => memoryFiles?.cover ?? null);
  const [imagePreview, setImagePreview] = useState(() =>
    memoryFiles?.cover ? URL.createObjectURL(memoryFiles.cover) : ''
  );
  const [imageFocalPoint, setImageFocalPoint] = useState(() =>
    memoryFiles?.cover && restoredDraft?.imageFocalPoint
      ? restoredDraft.imageFocalPoint
      : DEFAULT_FOCAL_POINT
  );
  const [imageZoom, setImageZoom] = useState(() =>
    memoryFiles?.cover && typeof restoredDraft?.imageZoom === 'number'
      ? restoredDraft.imageZoom
      : MIN_IMAGE_ZOOM
  );
  const createdEventRef = useRef(null);
  const eventIdRef = useRef(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Similar approved events found before saving (Trello 6afdc0ce); [] = dialog closed.
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const { findDuplicates } = useDuplicateCheck();
  const [showMultiDayRecurrenceConfirm, setShowMultiDayRecurrenceConfirm] = useState(false);
  const [endDateConflictMarked, setEndDateConflictMarked] = useState(false);
  const [successState, setSuccessState] = useState(null);
  useConfettiCelebration(successState !== null);
  const [showFocalPointInSummary, setShowFocalPointInSummary] = useState(false);
  const [currentStep, setCurrentStep] = useState(() => {
    if (!restoredDraft) return 1;
    // Confirmed the e-mail: straight to the last page to submit.
    if (cameFromVerification) return STEPS.length;
    return Number.isInteger(restoredDraft.currentStep)
      ? Math.min(Math.max(restoredDraft.currentStep, 1), STEPS.length)
      : 1;
  });
  const [rightsConfirmed, setRightsConfirmed] = useState(
    Boolean(restoredDraft && restoredDraft.rightsConfirmed)
  );
  // Default comes from the profile (which may load after the first render);
  // once the user clicks the box or a draft supplies a value, it is theirs.
  const [instagramConsent, setInstagramConsent] = useState(
    restoredDraft && typeof restoredDraft.instagramConsent === 'boolean'
      ? restoredDraft.instagramConsent
      : profile?.instagramConsentDefault === true
  );
  const instagramConsentTouched = useRef(
    Boolean(restoredDraft && typeof restoredDraft.instagramConsent === 'boolean')
  );
  const [instagramNoTextConfirmed, setInstagramNoTextConfirmed] = useState(
    Boolean(restoredDraft && restoredDraft.instagramNoTextConfirmed)
  );
  // Handle used for tag/collab on this event only; the profile stays unchanged.
  const [instagramHandleOverride, setInstagramHandleOverride] = useState(
    typeof restoredDraft?.instagramHandleOverride === 'string'
      ? restoredDraft.instagramHandleOverride
      : ''
  );
  // Further names to tag on this event (max. 2), also restored from a draft.
  const [instagramExtraHandles, setInstagramExtraHandles] = useState(
    Array.isArray(restoredDraft?.instagramExtraHandles) ? restoredDraft.instagramExtraHandles : []
  );
  const profileInstagramDefault = profile?.instagramConsentDefault === true;
  // The profile may load after the first render: swap the e-mail fallback in the
  // organizer field for the profile name, as long as nobody has typed over it.
  const emailFallbackName = getOrganizerDefault('', user?.email);
  const profileDisplayName = (profile?.displayName || '').trim();
  useEffect(() => {
    if (!profileDisplayName) return;
    setFormData((prev) =>
      prev.organizer.name === '' || prev.organizer.name === emailFallbackName
        ? { ...prev, organizer: { ...prev.organizer, name: profileDisplayName } }
        : prev
    );
  }, [profileDisplayName, emailFallbackName]);

  // A guest has no account e-mail yet: once signed in, it fills the (hidden)
  // organizer e-mail, but only while that is still empty.
  const accountEmail = user?.email || '';
  useEffect(() => {
    if (!accountEmail) return;
    setFormData((prev) =>
      prev.organizer.email.trim()
        ? prev
        : { ...prev, organizer: { ...prev.organizer, email: accountEmail } }
    );
  }, [accountEmail]);

  useEffect(() => {
    if (!instagramConsentTouched.current) setInstagramConsent(profileInstagramDefault);
  }, [profileInstagramDefault]);
  // Which photo + 4:5 crop the Instagram post uses ({ source, focalPoint, zoom }).
  const [instagramImageChoice, setInstagramImageChoice] = useState(() =>
    restoredDraft?.instagramImageChoice && typeof restoredDraft.instagramImageChoice === 'object'
      ? restoredDraft.instagramImageChoice
      : null
  );
  // Extra photo uploaded only for Instagram (e.g. portrait format).
  const [instagramFile, setInstagramFile] = useState(() => memoryFiles?.instagram ?? null);
  const [instagramPreview, setInstagramPreview] = useState(() =>
    memoryFiles?.instagram ? URL.createObjectURL(memoryFiles.instagram) : ''
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
  // The choice in effect: the stored one while its image still exists, else
  // the first candidate centred and unzoomed.
  const effectiveInstagramImageChoice = useMemo(() => {
    const stillThere = instagramImageCandidates.some(
      (c) => c.source === instagramImageChoice?.source
    );
    if (stillThere) return instagramImageChoice;
    const first = instagramImageCandidates[0];
    return first ? { source: first.source, focalPoint: { ...DEFAULT_FOCAL_POINT }, zoom: 1 } : null;
  }, [instagramImageCandidates, instagramImageChoice]);
  const fileInputRef = useRef(null);
  const wizardContainerRef = useRef(null);
  const isInitialStepMount = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    trackEvent(EVENTS.EVENT_CREATE_START);
  }, []);

  useEffect(() => {
    if (isInitialStepMount.current) {
      isInitialStepMount.current = false;
      return;
    }
    if (wizardContainerRef.current) {
      wizardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentStep]);

  const persistDraft = () =>
    saveWizardDraft(draftOwner, {
      formData,
      currentStep,
      rightsConfirmed,
      instagramConsent,
      instagramNoTextConfirmed,
      instagramHandleOverride,
      instagramExtraHandles,
      imageFocalPoint,
      imageZoom,
      instagramImageChoice,
    });

  // Set once the event is saved: the draft is gone and must not come back.
  const draftDoneRef = useRef(false);
  useEffect(() => {
    if (loading || draftDoneRef.current) return;
    const timeoutId = setTimeout(persistDraft, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftOwner,
    formData,
    currentStep,
    rightsConfirmed,
    instagramConsent,
    instagramNoTextConfirmed,
    instagramHandleOverride,
    instagramExtraHandles,
    imageFocalPoint,
    imageZoom,
    instagramImageChoice,
    loading,
  ]);

  // Photos of the draft (IndexedDB, best-effort): restore once, then keep in sync.
  const [draftFilesReady, setDraftFilesReady] = useState(false);
  const coverTouchedRef = useRef(false);
  const instagramTouchedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user) await adoptGuestWizardDraftFiles(user.uid);
      await pruneWizardDraftFiles();
      const files = restoredDraft && !memoryFiles ? await loadWizardDraftFiles(draftOwner) : null;
      if (cancelled) return;
      if (files?.cover && !coverTouchedRef.current) {
        setImageFile(files.cover);
        setImagePreview(URL.createObjectURL(files.cover));
        if (restoredDraft?.imageFocalPoint) setImageFocalPoint(restoredDraft.imageFocalPoint);
        if (typeof restoredDraft?.imageZoom === 'number') setImageZoom(restoredDraft.imageZoom);
      }
      if (files?.instagram && !instagramTouchedRef.current) {
        setInstagramFile(files.instagram);
        setInstagramPreview(URL.createObjectURL(files.instagram));
      }
      setDraftFilesReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Once per mount; the page remounts the wizard when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftFilesReady || loading || draftDoneRef.current) return;
    saveWizardDraftFiles(draftOwner, { cover: imageFile, instagram: instagramFile });
  }, [draftFilesReady, draftOwner, imageFile, instagramFile, loading]);

  // Not confirmed yet: notice the click on the link (other tab, phone) as soon
  // as the person looks at this page again, and unlock "Einreichen".
  const awaitingVerification = Boolean(user) && !canCreateEvents && currentStep === STEPS.length;
  useEffect(() => {
    if (!awaitingVerification || typeof refreshEmailVerified !== 'function') return undefined;
    const check = () => {
      if (document.visibilityState !== 'hidden') refreshEmailVerified();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const intervalId = setInterval(check, 15000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(intervalId);
    };
  }, [awaitingVerification, refreshEmailVerified]);

  const isAdmin = role === 'Admin';

  // Admins get the mandatory fields pre-filled for testing (new events only;
  // a restored draft is left untouched). The role may arrive after first render.
  const adminPrefillDone = useRef(false);
  useEffect(() => {
    if (adminPrefillDone.current || restoredDraft || !shouldPrefillForAdmin(role)) return;
    adminPrefillDone.current = true;
    setFormData((prev) => applyAdminPrefill(prev));
    setExtraCategories((prev) => (prev.includes('Sonstiges') ? prev : [...prev, 'Sonstiges']));
    setRightsConfirmed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // A new event of a signed-in person starts with the answers of the last one (Trello
  // 6afd8505): once, when the profile has arrived. A restored draft wins, what was typed
  // meanwhile stays. The category follows as soon as the category list is there.
  const defaultsApplied = useRef(false);
  const categoryDefaultApplied = useRef(false);
  const remembered = profile?.eventFormDefaults ?? null;
  useEffect(() => {
    if (defaultsApplied.current || restoredDraft || !user || !profile) return;
    defaultsApplied.current = true;
    if (!remembered) return;
    setFormData((prev) =>
      applyEventFormDefaults(prev, remembered, {
        organizerDefaults: [emailFallbackName, profileDisplayName],
        kontaktDefault: user.email || '',
        // With several regions only a place of the chosen region is taken over.
        placeAllowed: (placeRegionId) =>
          !regionChoices.enabled || (placeRegionId || DEFAULT_REGION_ID) === selectedRegion,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  useEffect(() => {
    if (categoryDefaultApplied.current || restoredDraft || !user || !remembered) return;
    if (!allCategories.length) return;
    categoryDefaultApplied.current = true;
    const category = knownCategory(remembered.category, allCategories);
    if (category) setFormData((prev) => (prev.category ? prev : { ...prev, category }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remembered, allCategories]);

  const hasRecurrence = formData.recurrence !== 'none';
  const hasEndDateRecurrenceConflict = Boolean(formData.endDate) && hasRecurrence;
  // Red marking only while the conflict still exists (clears once resolved).
  const showEndDateConflict = endDateConflictMarked && hasEndDateRecurrenceConflict;

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
        customTimes: {},
        exceptionDates: [],
      }));
      setErrors((prev) => ({
        ...prev,
        recurrenceEndDate: null,
        customDates: null,
        customTimes: null,
      }));
    }
  };

  // Dates taken out of the series fall away when start date, kind or end date change
  // so that they no longer lie in the series.
  useEffect(() => {
    setFormData((prev) => {
      const before = prev.exceptionDates || [];
      if (before.length === 0) return prev;
      const kept = pruneExceptionDates(prev);
      return kept.length === before.length ? prev : { ...prev, exceptionDates: kept };
    });
  }, [formData.date, formData.recurrence, formData.recurrenceEndDate]);

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

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
      if (!formData.organizer.name.trim()) {
        newErrors['organizer.name'] = 'Veranstalter ist erforderlich';
      }
      // The organizer e-mail has no field: it is the account e-mail, so a guest
      // gets it only after signing in.
      if (user) {
        if (!formData.organizer.email.trim()) {
          newErrors['organizer.email'] = 'E-Mail ist erforderlich';
        } else if (!isValidEmail(formData.organizer.email)) {
          newErrors['organizer.email'] = 'Bitte gib eine gültige E-Mail-Adresse ein';
        }
      }
      if (!formData.kontakt.trim()) {
        newErrors.kontakt = 'Kontakt ist erforderlich';
      }
    } else if (step === 2) {
      if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich';
      else if (formData.title.trim().length > TITLE_MAX_LENGTH)
        newErrors.title = `Der Titel darf höchstens ${TITLE_MAX_LENGTH} Zeichen lang sein`;
      if (isHtmlEmpty(formData.description))
        newErrors.description = 'Beschreibung ist erforderlich';
      if (!imageFile) newErrors.image = 'Bitte lade ein Titelbild hoch';
    } else if (step === 3) {
      if (!formData.date) newErrors.date = 'Datum ist erforderlich';
      if (!formData.time) newErrors.time = 'Uhrzeit ist erforderlich';
      if (
        formData.time &&
        formData.endTime &&
        (!formData.endDate || formData.endDate === formData.date) &&
        formData.endTime <= formData.time
      ) {
        newErrors.endTime = 'Die Endzeit muss nach der Startzeit liegen';
      }
      if (!formData.isOnline) {
        // The Ort must be chosen from the list (Trello QG0GR5lv).
        const cityError = validatePlaceChoice({
          city: formData.city,
          picked: formData.cityPicked || Boolean(formData.placeRegionId),
          original: '',
        });
        if (cityError) newErrors.city = cityError;
      } else if (!onlineGate.offered) {
        newErrors.isOnline = onlineGate.hint || 'Online-Events sind hier gerade nicht möglich.';
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
      if (
        formData.recurrence !== 'none' &&
        formData.recurrence !== 'custom' &&
        !formData.recurrenceEndDate
      ) {
        newErrors.recurrenceEndDate = 'Bitte gib ein Enddatum für die Wiederholung an';
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
      if (
        formData.recurrence === 'custom' &&
        !formData.endDate &&
        invalidCustomTimeDates(
          formData.customTimes,
          (formData.customDates || []).filter((d) => d !== formData.date),
          formData
        ).length > 0
      ) {
        newErrors.customTimes = 'Die Endzeit muss nach der Startzeit liegen';
      }
    } else if (step === 4) {
      if (!rightsConfirmed) {
        newErrors.rightsConfirmed = 'Bitte bestätige die Nutzungsrechte';
      }
      if (instagramConsent && instagramImageCandidates.length === 0) {
        newErrors.instagramImage =
          'Für das Teilen auf Instagram brauchst du ein Foto. Bitte lade ein Titelbild hoch oder deaktiviere „auf Instagram teilen“';
      }
      if (instagramConsent && instagramImageCandidates.length > 0 && !instagramNoTextConfirmed) {
        newErrors.instagramNoText = 'Bitte bestätige, dass dein Foto keinen Text enthält';
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
        image: IMAGE_FORMAT_HINT,
      }));
    } else {
      setErrors((prev) => ({ ...prev, image: null }));
    }

    coverTouchedRef.current = true;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageFocalPoint(DEFAULT_FOCAL_POINT);
    setImageZoom(MIN_IMAGE_ZOOM);
    setInstagramImageChoice((prev) => (prev?.source === COVER_SOURCE ? null : prev));
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
    coverTouchedRef.current = true;
    setImageFile(null);
    setImagePreview('');
    setImageFocalPoint(DEFAULT_FOCAL_POINT);
    setImageZoom(MIN_IMAGE_ZOOM);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    instagramTouchedRef.current = true;
    setInstagramFile(file);
    setInstagramPreview(URL.createObjectURL(file));
    setInstagramImageChoice({
      source: INSTAGRAM_UPLOAD_SOURCE,
      focalPoint: { ...DEFAULT_FOCAL_POINT },
      zoom: 1,
    });
  };

  const removeInstagramImage = () => {
    instagramTouchedRef.current = true;
    setInstagramFile(null);
    setInstagramPreview('');
    setInstagramUploadError('');
    setInstagramImageChoice((prev) => (prev?.source === INSTAGRAM_UPLOAD_SOURCE ? null : prev));
  };

  // The Titelbild starts uploading in the background as soon as it is picked
  // (or restored from the wizard draft); saving only waits for that upload.
  const { awaitCover, markCoverSaved } = useBackgroundCoverUpload({
    file: imageFile,
    enabled: Boolean(user),
    getEventId: () => (eventIdRef.current ??= createdEventRef.current?.id ?? newEventId()),
  });

  const handleImageUpload = async (eventId) => {
    if (!imageFile) return null;

    setImageUploading(true);
    setImageProgress(0);
    try {
      return await awaitCover(imageFile, eventId, setImageProgress);
    } finally {
      setImageUploading(false);
    }
  };

  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  // The Bezirk / Landkreis select is hidden by default. It shows only once an Ort was entered
  // that did not decide it (Trello NA3phFDy), or once the person picked one in it themselves.
  const [bezirkPicked, setBezirkPicked] = useState(false);
  // "Finde meinen Bezirk nicht" opens the region dialog instead of setting a value.
  const handleBezirkChange = (e) => {
    if (e.target.value === BEZIRK_NOT_FOUND) {
      setRegionDialogOpen(true);
      return;
    }
    handleChange(e);
  };

  const handleChange = (e) => {
    if (e.target.name === 'bezirk' && e.target.value) setBezirkPicked(true);
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        ...(name === 'isOnline' && checked
          ? { bezirk: '', city: '', placeRegionId: '', cityPicked: false }
          : {}),
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
      // A Bezirk / Landkreis chosen in the select belongs to the region of the form.
      ...(name === 'bezirk' ? { placeRegionId: '' } : {}),
      // Own times of single dates only belong to "An einzelnen Terminen".
      ...(name === 'recurrence' && value !== 'custom' ? { customTimes: {} } : {}),
      // A new region has its own Bezirke / Landkreise (and Orte): drop what no longer fits.
      ...(name === 'regionId'
        ? {
            bezirk: keepIfInRegion(prev.bezirk, value, regionChoices),
            city: '',
            placeRegionId: '',
            cityPicked: false,
          }
        : {}),
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // The Ort decides Bezirk and region. With a region field, an offered region follows the
  // place (its Bezirke / Landkreise show in the select); a region that is not open yet is
  // only remembered as `placeRegionId` (hint next to the Ort).
  const handleCityChange = ({ city, bezirk, regionId = null, picked = false }) => {
    if (bezirk !== formData.bezirk) setBezirkPicked(false);
    const followRegion =
      regionChoices.enabled && regionId && regionChoices.options.some((r) => r.id === regionId);
    setFormData((prev) => ({
      ...prev,
      city,
      bezirk,
      placeRegionId: regionId || '',
      cityPicked: picked,
      ...(followRegion ? { regionId } : {}),
      ...(city.trim() ? { isOnline: false } : {}),
    }));
    if (bezirk && errors.bezirk) setErrors((prev) => ({ ...prev, bezirk: null }));
    if (errors.city) setErrors((prev) => ({ ...prev, city: null }));
    if (errors.isOnline) setErrors((prev) => ({ ...prev, isOnline: null }));
  };

  // "Frühere Orte": one choice sets Ort, Bezirk / Landkreis, region of the place and Adresse
  // together, as if the Ort had been picked from the list.
  const savedVenueChoices = user
    ? venuesForRegion(profile?.savedVenues, {
        regionId: regionChoices.enabled ? selectedRegion : '',
        defaultRegionId: DEFAULT_REGION_ID,
      })
    : [];
  const handleSavedVenuePick = (e) => {
    const venue = savedVenueChoices[Number(e.target.value)];
    if (!venue) return;
    handleCityChange({
      city: venue.city,
      bezirk: venue.bezirk,
      regionId: venue.placeRegionId || null,
      picked: true,
    });
    setFormData((prev) => ({ ...prev, place: venue.place }));
    if (errors.place) setErrors((prev) => ({ ...prev, place: null }));
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
        if (!Number.isNaN(d.getTime())) nextDate = d.toISOString().split('T')[0];
      }
      return { ...prev, customDates: [...existing, nextDate] };
    });
    if (errors.customDates) {
      setErrors((prev) => ({ ...prev, customDates: null }));
    }
  };

  const handleRemoveCustomDate = (index) => {
    setFormData((prev) => {
      const customDates = (prev.customDates || []).filter((_, i) => i !== index);
      const removed = (prev.customDates || [])[index];
      return {
        ...prev,
        customDates,
        customTimes: moveFormCustomTime(prev.customTimes, removed, '', customDates),
      };
    });
  };

  const handleCustomDateChange = (index, value) => {
    setFormData((prev) => {
      const customDates = (prev.customDates || []).map((d, i) => (i === index ? value : d));
      const changed = (prev.customDates || [])[index];
      return {
        ...prev,
        customDates,
        customTimes: moveFormCustomTime(prev.customTimes, changed, value, customDates),
      };
    });
    if (errors.customDates) {
      setErrors((prev) => ({ ...prev, customDates: null }));
    }
  };

  const handleCustomTimeChange = (date, field, value) => {
    setFormData((prev) => ({
      ...prev,
      customTimes: setFormCustomTime(prev.customTimes, date, field, value),
    }));
    if (errors.customTimes) {
      setErrors((prev) => ({ ...prev, customTimes: null }));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;

    const target = e.target;
    if (!target) return;

    // react-select's CreatableSelect renders a real <input> that listens for
    // Enter to confirm the highlighted "create new option" entry. If we let the
    // form's keydown handler fire on Enter too, the wizard would advance to the
    // next step before react-select had a chance to commit the new category.
    // Skip the advance when the keypress originated inside a CreatableSelect (Kategorie, Ort).
    if (target.closest && target.closest('.kategorie-select, .city-select')) {
      return;
    }

    if (target.isContentEditable || target.tagName === 'TEXTAREA') {
      return;
    }

    if (currentStep < 4) {
      e.preventDefault();
      nextStep();
    } else if (currentStep === 4) {
      e.preventDefault();
    }
  };

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

  const nextStep = () => {
    const stepErrors = validateStep(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setValidationError('Bitte fülle alle Pflichtfelder aus.');
      triggerWobble('next');
      return;
    }
    // The endDate field is meant for multi-day events (Retreats, Festivals).
    // Combining it with a recurrence (e.g. "Jeden Donnerstag") is almost
    // always a mistake — the recurrence would re-apply the multi-day span
    // every week. Ask the user to confirm before leaving the Details step.
    if (currentStep === 3 && hasEndDateRecurrenceConflict) {
      setErrors({});
      setValidationError('');
      setEndDateConflictMarked(true);
      setShowMultiDayRecurrenceConfirm(true);
      return;
    }
    setErrors({});
    setValidationError('');
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const extraInstagramHandles = normalizeExtraHandles(
    instagramExtraHandles,
    normalizeInstagramHandle(instagramHandleOverride) ||
      normalizeInstagramHandle(profile?.socialMedia?.instagram)
  );

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
    // Only the dates whose time differs from the one above (Trello 6afd86b4).
    customTimes:
      formData.recurrence === 'custom'
        ? buildCustomTimesPayload(
            formData.customTimes,
            (formData.customDates || []).filter((d) => d !== formData.date),
            formData
          )
        : {},
    exceptionDates: pruneExceptionDates(formData),
    category: formData.category || 'Sonstiges',
    bezirk: formData.isOnline ? '' : formData.bezirk,
    city: formData.isOnline ? '' : canonicalCity(formData.city),
    isOnline: Boolean(formData.isOnline),
    regionId: eventRegionId,
    organizer: {
      firstName: splitOrganizerName(formData.organizer.name).firstName,
      lastName: splitOrganizerName(formData.organizer.name).lastName,
      email: formData.organizer.email.trim(),
      photoURL: profile?.photoURL || null,
    },
    kontakt: formData.kontakt.trim(),
    // Only with a phone number in the contact; otherwise the choice is dropped.
    kontaktMessenger: contactPhone(formData.kontakt)
      ? normalizeMessengerSelection(formData.kontaktMessenger)
      : [],
    registration: formData.registration.trim(),
    imageUrl: null,
    imageThumbUrl: null,
    status,
    rightsConfirmed,
    rightsConfirmedAt: rightsConfirmed ? serverTimestamp() : null,
    instagramConsent,
    ...(instagramConsent &&
    resolveInstagramHandleOverride(instagramHandleOverride, profile?.socialMedia?.instagram)
      ? {
          instagramHandleOverride: resolveInstagramHandleOverride(
            instagramHandleOverride,
            profile?.socialMedia?.instagram
          ),
        }
      : {}),
    ...(instagramConsent && extraInstagramHandles.length > 0
      ? { instagramExtraHandles: extraInstagramHandles }
      : {}),
    // Description images already have their final URL; a picked cover photo
    // or extra Instagram photo is added after its upload in saveEvent().
    ...(instagramConsent && !needsUploadedUrl(effectiveInstagramImageChoice)
      ? { instagramImage: resolveInstagramImage(effectiveInstagramImageChoice) }
      : {}),
  });

  // Everything a save needs (steps 2–4). Step 2 is checked again because a
  // reloaded draft may have lost its Titelbild (no IndexedDB): then the person
  // is sent back to step 2 instead of submitting without a photo.
  const validateBeforeSave = (action) => {
    setSubmitError('');
    setValidationError('');
    const step2Errors = validateStep(2);
    if (Object.keys(step2Errors).length > 0) {
      setErrors(step2Errors);
      setCurrentStep(2);
      setValidationError(
        step2Errors.image
          ? 'Bitte lade dein Titelbild (noch einmal) hoch.'
          : 'Bitte fülle alle Pflichtfelder aus.'
      );
      return false;
    }
    const step3Errors = validateStep(3);
    const step4Errors = validateStep(4);
    const newErrors = { ...step3Errors, ...step4Errors };
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (step4Errors.rightsConfirmed) {
        setValidationError('Bitte bestätige die Nutzungsrechte.');
      } else if (step4Errors.instagramImage) {
        setValidationError(step4Errors.instagramImage + '.');
      } else if (step4Errors.instagramNoText) {
        setValidationError(step4Errors.instagramNoText + '.');
      } else {
        setValidationError('Bitte fülle alle Pflichtfelder aus.');
      }
      triggerWobble(action);
      return false;
    }
    return true;
  };

  // Similar approved events for the event as it would be saved; [] when none or the check
  // failed (never blocks saving). The event being retried after a failed save is left out.
  const lookUpDuplicates = async () => {
    setLoading(true);
    try {
      const data = buildEventData('pending');
      const hits = await findDuplicates({
        ...data,
        id: eventIdRef.current ?? createdEventRef.current?.id,
      });
      return hits.map((hit) => hit.event);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentStep < 4) {
      return;
    }
    if (!canCreateEvents) return;
    if (!validateBeforeSave('submit')) return;
    const duplicates = await lookUpDuplicates();
    if (duplicates.length > 0) {
      setDuplicateCandidates(duplicates);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleSaveAsDraft = async () => {
    if (!canCreateEvents) return;
    if (!validateBeforeSave('draft')) return;
    const duplicates = await lookUpDuplicates();
    if (duplicates.length > 0) {
      setDuplicateCandidates(duplicates);
      return;
    }
    await saveEvent(buildEventData('draft'));
  };

  const handleDuplicateSubmitAnyway = () => {
    setDuplicateCandidates([]);
    saveEvent(buildEventData('pending'));
  };

  const handleDuplicateSaveDraft = () => {
    setDuplicateCandidates([]);
    saveEvent(buildEventData('draft'));
  };

  // Drops only the wizard draft (saved answers and files); nothing is written to Firestore.
  const handleDuplicateDiscard = () => {
    setShowDiscardConfirm(false);
    setDuplicateCandidates([]);
    draftDoneRef.current = true;
    clearWizardDraft(draftOwner);
    clearWizardDraftFiles(draftOwner);
    navigate('/admin');
  };

  // Guest at the end of the wizard: check the draft, keep it, then log in or
  // create the account; the login page brings the person back here (step 4).
  const handleGuestAuth = (authMode) => {
    if (!validateBeforeSave(authMode)) return;
    persistDraft();
    const organizerName = formData.organizer.name.trim();
    const contactEmail = isValidEmail(formData.kontakt) ? formData.kontakt.trim() : '';
    navigate('/login', {
      state: {
        from: `/admin/new${location.search}`,
        authMode,
        createEventDraft: true,
        ...(authMode === 'register' && organizerName && { displayName: organizerName }),
        ...(contactEmail && { email: contactEmail }),
      },
    });
  };

  // Keeps the answers of this save for the next new event (profile doc, best effort: a
  // failure never blocks saving, and a slow connection is not waited for).
  const rememberFormAnswers = () => {
    if (!user?.uid) return;
    try {
      const update = {
        eventFormDefaults: pickDefaults(formData, profile?.eventFormDefaults ?? {}),
      };
      if (isRememberableVenue(formData)) {
        update.savedVenues = mergeVenue(profile?.savedVenues, formData);
      }
      Promise.resolve(updateDoc(doc(db, 'users', user.uid), update)).catch((err) => {
        console.warn('Event form defaults not saved:', err?.code || err?.message);
      });
    } catch (err) {
      console.warn('Event form defaults not saved:', err?.code || err?.message);
    }
  };

  const saveEvent = async (eventData) => {
    setLoading(true);
    setShowConfirmModal(false);
    setSubmitError('');

    try {
      const instagramSource = eventData.instagramConsent
        ? effectiveInstagramImageChoice?.source
        : null;
      // The Titelbild is uploaded BEFORE the event is written, so an event never
      // exists (and is never reviewed / approved) without it (Trello 7iDvAj4U).
      // A retry after a failed upload reuses the same id / existing event.
      let docRef = createdEventRef.current;
      if (!eventIdRef.current) eventIdRef.current = docRef?.id ?? newEventId();
      const eventId = eventIdRef.current;
      const data = { ...eventData };
      if (imageFile) {
        const { url: newImageUrl, thumbUrl: newThumbUrl } = await handleImageUpload(eventId);
        data.imageUrl = newImageUrl;
        data.imageThumbUrl = newThumbUrl;
        if (!isDefaultFocalPoint(imageFocalPoint)) {
          data.imageFocalPoint = imageFocalPoint;
        }
        if (imageZoom > MIN_IMAGE_ZOOM) {
          data.imageZoom = imageZoom;
        }
        if (instagramSource === COVER_SOURCE) {
          data.instagramImage = resolveInstagramImage(effectiveInstagramImageChoice, {
            coverUrl: newImageUrl,
          });
        }
      }

      if (docRef) {
        await updateEvent(docRef.id, data);
      } else {
        docRef = await addEvent(data, data.status || 'pending', eventId);
        createdEventRef.current = docRef;
      }
      if (imageFile) markCoverSaved();
      rememberFormAnswers();
      if (eventData.status !== 'draft') trackEvent(EVENTS.EVENT_CREATE_SUBMIT);

      if (instagramSource === INSTAGRAM_UPLOAD_SOURCE && instagramFile) {
        const instagramUploadUrl = await uploadImage(instagramFile, { eventId: docRef.id });
        await updateEvent(docRef.id, {
          instagramImage: resolveInstagramImage(effectiveInstagramImageChoice, {
            instagramUploadUrl,
          }),
        });
      }

      draftDoneRef.current = true;
      clearWizardDraft(draftOwner);
      clearWizardDraftFiles(draftOwner);

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
      setSubmitError(
        err instanceof CoverUploadError
          ? COVER_UPLOAD_ERROR
          : 'Event konnte nicht gespeichert werden. Bitte versuche es erneut.'
      );
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

      <div className="form-group">
        <label htmlFor="organizer.name">Veranstalter *</label>
        <input
          id="organizer.name"
          name="name"
          type="text"
          value={formData.organizer.name}
          onChange={handleOrganizerChange}
          placeholder={examples.organizer}
          autoComplete="organization"
          className={errors['organizer.name'] ? 'input-error' : ''}
        />
        {errors['organizer.name'] && <span className="error-text">{errors['organizer.name']}</span>}
      </div>

      <div className="form-group">
        <div className="input-label-row">
          <label htmlFor="kontakt">Kontakt für Teilnehmer:innen *</label>
          <span className="input-info">
            <Info size={14} />
            <span>Telefonnummer oder E-Mail</span>
          </span>
        </div>
        <input
          id="kontakt"
          name="kontakt"
          type="text"
          value={formData.kontakt}
          onChange={handleChange}
          maxLength={KONTAKT_MAX_LENGTH}
          placeholder={examples.contact}
          className={errors.kontakt ? 'input-error' : ''}
        />
        {errors.kontakt && <span className="error-text">{errors.kontakt}</span>}
        <ContactMessengerChoice
          kontakt={formData.kontakt}
          value={formData.kontaktMessenger}
          onChange={(kontaktMessenger) => setFormData((prev) => ({ ...prev, kontaktMessenger }))}
        />
      </div>

      <div className="form-group">
        <div className="input-label-row">
          <label htmlFor="registration">Anmeldung (optional)</label>
          <span className="input-info">
            <Info size={14} />
            <span>Wie melden sich Teilnehmer:innen an?</span>
          </span>
        </div>
        <input
          id="registration"
          name="registration"
          type="text"
          value={formData.registration}
          onChange={handleChange}
          maxLength={REGISTRATION_MAX_LENGTH}
          placeholder="z.B. Buchungslink, Telefonnummer oder E-Mail"
        />
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
          maxLength={TITLE_MAX_LENGTH}
          placeholder="z.B. Morgen-Yoga im Park"
          className={errors.title || formData.title.length >= TITLE_MAX_LENGTH ? 'input-error' : ''}
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
          uploadImage={user ? undefined : guestDescriptionImageUpload}
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
        <label>Titelbild</label>
        <p className="image-hint" data-testid="title-image-hint">
          Das Titelbild sollte ein ausdrucksstarkes Symbolfoto sein. Flyer eignen sich dafür weniger
          – lade sie lieber in die Beschreibung hoch. Bitte verwende möglichst kein KI-generiertes
          Foto: Viele Menschen empfinden solche Bilder als abstoßend, was zu weniger Interaktion
          führt.
          <br />
          {IMAGE_FORMAT_HINT}
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
          data-testid="title-image-input"
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
            required
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
            required
          />
          {errors.time && <span className="error-text">{errors.time}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="endTime">Bis (optional)</label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            value={formData.endTime}
            onChange={handleChange}
            className={errors.endTime ? 'input-error' : ''}
          />
          {errors.endTime && <span className="error-text">{errors.endTime}</span>}
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
          className={showEndDateConflict ? 'input-error' : ''}
        />
      </div>

      {savedVenueChoices.length > 0 && !formData.isOnline && (
        <div className="form-group">
          <label htmlFor="saved-venues">Frühere Orte</label>
          <select
            id="saved-venues"
            value=""
            onChange={handleSavedVenuePick}
            data-testid="saved-venues-select"
          >
            <option value="">Früheren Ort übernehmen...</option>
            {savedVenueChoices.map((venue, index) => (
              <option key={`${venue.city}|${venue.place}`} value={index}>
                {venueLabel(venue)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-row">
        {useGemeinden ? (
          <CityField
            city={formData.city}
            bezirk={formData.bezirk}
            disabled={formData.isOnline}
            error={errors.city}
            onChange={handleCityChange}
            regions={regionChoices.allRegions}
            placeRegionId={eventRegionId}
            homeRegionId={homeRegionId}
            onOtherRegion={regionChoices.enabled ? () => setRegionDialogOpen(true) : undefined}
          />
        ) : (
          <div>
            <CityField
              free
              region={selectedRegionObj}
              regions={regionChoices.allRegions}
              placeRegionId={formData.placeRegionId}
              homeRegionId={homeRegionId}
              placeholder={examples.place}
              city={formData.city}
              bezirk={formData.bezirk}
              disabled={formData.isOnline}
              error={errors.city}
              onChange={handleCityChange}
            />
            {((formData.city.trim() && !formData.bezirk) || bezirkPicked || errors.bezirk) && (
              <div className="form-group">
                <label htmlFor="bezirk">{subdivisionLabel}</label>
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
                  {/* The place's own Bezirk / Landkreis of another region, or a legacy value. */}
                  {formData.bezirk && !bezirkOptions.includes(formData.bezirk) && (
                    <option value={formData.bezirk}>{bezirkLabel(formData.bezirk)}</option>
                  )}
                  <option value={BEZIRK_NOT_FOUND}>Finde meinen {subdivisionLabel} nicht</option>
                </select>
                {errors.bezirk && <span className="error-text">{errors.bezirk}</span>}
              </div>
            )}
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
            placeholder={formData.isOnline ? 'Nicht relevant für Online-Events' : examples.address}
            disabled={formData.isOnline}
            className={errors.place ? 'input-error' : ''}
          />
          {errors.place && <span className="error-text">{errors.place}</span>}
        </div>
      </div>

      {(onlineGate.offered || formData.isOnline) && (
        <div className="form-group">
          <label className="checkbox-label checkbox-label--inline">
            <input
              type="checkbox"
              name="isOnline"
              checked={formData.isOnline}
              onChange={handleChange}
              disabled={!onlineGate.offered && !formData.isOnline}
              data-testid="is-online-checkbox"
            />
            <span>Online-Event (kein Ort und keine Adresse nötig)</span>
          </label>
          {onlineGate.hint && (
            <span className="input-hint" data-testid="online-event-hint">
              {onlineGate.hint}
            </span>
          )}
          {errors.isOnline && <span className="error-text">{errors.isOnline}</span>}
        </div>
      )}

      <div className="form-group">
        <div className="input-label-row">
          <label htmlFor="category">Kategorie *</label>
          <span className="input-info">
            <Info size={14} />
            <EventGuideLink testId="faq-guide-link-category">
              Welche Events passen in unseren Kalender?
            </EventGuideLink>
          </span>
        </div>
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
        <div className="fee-section">
          <div className="fee-amount-row">
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
              <label htmlFor="feeMax">Betrag bis</label>
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
            <p className="fee-hint">Optional. Wenn leer, gilt nur der Betrag.</p>
          </div>
          <div className="fee-unit-block">
            <label htmlFor="feeNote">Einheit</label>
            <span className="input-info">
              <Info size={18} />
              <span>z.B. Einzelstunde, 10er-Block, ganzer Kurs</span>
            </span>
            <div className="fee-unit-row">
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
              <select
                id="priceCurrency"
                name="priceCurrency"
                aria-label="Währung"
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
      )}

      <div className="form-group">
        <label>Wiederholt sich dein Event oder ist es einmalig?</label>
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
            <span>Einmalig</span>
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
            <span>Wiederholung</span>
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
            <label className={`radio-label ${isMonthly(formData.recurrence) ? 'active' : ''}`}>
              <input
                type="radio"
                name="recurrence"
                value="monthly"
                checked={isMonthly(formData.recurrence)}
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

      {hasRecurrence && (
        <MonthlyModeOptions
          recurrence={formData.recurrence}
          date={formData.date}
          onSelect={(value) => handleChange({ target: { name: 'recurrence', value } })}
        />
      )}

      {formData.recurrence === 'custom' && (
        <div className="form-group">
          <div className="input-label-row">
            <label>Termine</label>
            <span className="input-info">
              <Info size={14} />
              <span>Füge einzelne Termine hinzu, die Uhrzeit kannst du pro Termin ändern</span>
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
                <CustomDateTimeInputs
                  index={index}
                  date={date}
                  customTimes={formData.customTimes}
                  defaults={formData}
                  fixed={Boolean(date) && date === formData.date}
                  invalid={
                    !formData.endDate &&
                    date !== formData.date &&
                    invalidCustomTimeDates(formData.customTimes, [date], formData).length > 0
                  }
                  onChange={handleCustomTimeChange}
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
          {errors.customTimes && (
            <span className="error-text" data-testid="custom-times-error">
              {errors.customTimes}
            </span>
          )}
        </div>
      )}

      {formData.recurrence !== 'none' && formData.recurrence !== 'custom' && (
        <div className="form-group">
          <div className="input-label-row">
            <label htmlFor="recurrenceEndDate">Wiederholung bis *</label>
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
            required
            aria-required="true"
            className={showEndDateConflict || errors.recurrenceEndDate ? 'input-error' : ''}
          />
          {errors.recurrenceEndDate && (
            <span className="error-text">{errors.recurrenceEndDate}</span>
          )}
        </div>
      )}

      {formData.recurrence !== 'none' && formData.recurrence !== 'custom' && (
        <SeriesDatesOverview
          date={formData.date}
          recurrence={formData.recurrence}
          recurrenceEndDate={formData.recurrenceEndDate}
          exceptionDates={formData.exceptionDates}
          onChange={(exceptionDates) => setFormData((prev) => ({ ...prev, exceptionDates }))}
        />
      )}
    </div>
  );

  const summaryMessengers = messengerLinks(
    contactPhone(formData.kontakt),
    formData.kontaktMessenger
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
            <strong>{formData.organizer.name}</strong>
          </p>
          <p>{formData.kontakt}</p>
          {summaryMessengers.length > 0 && (
            <p data-testid="summary-kontakt-messenger">
              Auch erreichbar über: {summaryMessengers.map((m) => m.label).join(', ')}
            </p>
          )}
          {formData.registration.trim() && <p>Anmeldung: {formData.registration.trim()}</p>}
        </div>

        <div className="summary-section">
          <h4>Event-Infos</h4>
          {formData.title && (
            <p>
              <strong>{formData.title}</strong>
            </p>
          )}
          {formData.description && (
            <RichTextView html={formData.description} className="summary-description" />
          )}
          {formData.link && <p>Link: {formData.link}</p>}
          {imagePreview && (
            <div className="summary-image" data-testid="summary-image-preview">
              <p className="summary-image-label">So sieht das Event in der Kalender-Kachel aus:</p>
              <EventCard
                event={{
                  title: formData.title || 'Event-Vorschau',
                  date: formData.date || '',
                  time: formData.time || '',
                  endDate: formData.endDate || '',
                  place: formData.isOnline ? '' : formData.place,
                  bezirk: formData.isOnline ? '' : formData.bezirk,
                  city: formData.isOnline ? '' : canonicalCity(formData.city),
                  regionId: eventRegionId,
                  isOnline: Boolean(formData.isOnline),
                  category: formData.category,
                  imageUrl: imagePreview,
                  imageFocalPoint,
                  imageZoom,
                  organizer: { firstName: formData.organizer.name, lastName: '' },
                }}
                categoryColor={getCategoryColor(formData.category)}
                onClick={(e) => e.preventDefault()}
              />
              <div className="summary-focal-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowFocalPointInSummary((prev) => !prev)}
                  data-testid="summary-photo-cta"
                >
                  {showFocalPointInSummary ? 'Schließen' : 'Foto verschieben'}
                </button>
              </div>
              {showFocalPointInSummary && (
                <div className="summary-focal-picker">
                  <FocalPointPicker
                    imageUrl={imagePreview}
                    value={imageFocalPoint}
                    onChange={setImageFocalPoint}
                    zoom={imageZoom}
                    onZoomChange={setImageZoom}
                    showZoomSlider
                    minZoom={MIN_IMAGE_ZOOM}
                    maxZoom={MAX_IMAGE_ZOOM}
                    ariaLabel="Fokuspunkt in der Zusammenfassung anpassen"
                    testId="summary-image-focal-picker"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="summary-section">
          <h4>Details</h4>
          <p>
            <strong>{formData.category}</strong> •{' '}
            {formData.isOnline
              ? 'Online'
              : formatCityWithBezirk(
                  formData.city,
                  formData.bezirk,
                  getSubdivisionLabel(eventRegionId, regionChoices.allRegions)
                )}
          </p>
          {!formData.isOnline && formData.place && <p>📍 {formData.place}</p>}
          <p>
            📅 {formatEventDateShort(formData.date)} um {formData.time}
            {formData.endTime ? ` — ${formData.endTime}` : ''}
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
                    : formData.recurrence === 'monthlyWeekday'
                      ? `Monatlich am ${getMonthlyWeekdayPhrase(formData.date)}`
                      : `An einzelnen Terminen (${formData.customDates?.length || 0} Termine)`}
              {formData.recurrence !== 'custom' && summarySeriesCount(formData)}
            </p>
          )}
          <p>
            {formData.contribution === 'free'
              ? 'Kostenlos'
              : formData.contribution === 'donation'
                ? 'Freie Spende'
                : formData.fee
                  ? `Gebühr: ${formatPriceWithCurrency(formData.fee, formData.priceCurrency, formData.feeMax) || formData.fee}${
                      formData.feeNote ? ` / ${formData.feeNote}` : ''
                    }`
                  : formData.feeNote
                    ? `Gebühr: ${formData.feeNote}`
                    : 'Kostenpflichtig'}
          </p>
          {formData.contribution === 'fee' && formData.firstSessionFree && <p>1. Einheit gratis</p>}
        </div>
      </div>

      <div className="form-group rights-confirmation">
        <label className="checkbox-label checkbox-label--block" htmlFor="rightsConfirmed">
          <input
            id="rightsConfirmed"
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => {
              setRightsConfirmed(e.target.checked);
              if (e.target.checked && errors.rightsConfirmed) {
                setErrors((prev) => ({ ...prev, rightsConfirmed: null }));
              }
            }}
            data-testid="rights-confirmed-checkbox"
          />
          <span>
            Ich bestätige, dass ich die Rechte an dem hochgeladenen Bild (falls vorhanden) und am
            Text besitze bzw. diese verwenden darf.
          </span>
        </label>
        {errors.rightsConfirmed && (
          <span className="error-text" data-testid="rights-confirmed-error">
            {errors.rightsConfirmed}
          </span>
        )}
      </div>

      <InstagramConsentField
        checked={instagramConsent}
        onChange={(value) => {
          instagramConsentTouched.current = true;
          setInstagramConsent(value);
        }}
        instagramHandle={profile?.socialMedia?.instagram}
        handleOverride={instagramHandleOverride}
        onHandleOverrideChange={setInstagramHandleOverride}
        extraHandles={instagramExtraHandles}
        onExtraHandlesChange={setInstagramExtraHandles}
        regionId={eventRegionId}
      />

      {instagramConsent && (
        <details className="instagram-image-accordion" open data-testid="instagram-image-accordion">
          <summary>Foto und Bildausschnitt für Instagram wählen</summary>
          {errors.instagramImage && (
            <span className="error-text" data-testid="instagram-image-error">
              {errors.instagramImage}
            </span>
          )}
          <InstagramImagePicker
            candidates={instagramImageCandidates}
            value={effectiveInstagramImageChoice}
            onChange={setInstagramImageChoice}
            onUpload={handleInstagramImageSelect}
            onRemoveUpload={removeInstagramImage}
            uploadError={instagramUploadError}
            noTextConfirmed={instagramNoTextConfirmed}
            onNoTextConfirmedChange={(checked) => {
              setInstagramNoTextConfirmed(checked);
              if (checked && errors.instagramNoText) {
                setErrors((prev) => ({ ...prev, instagramNoText: null }));
              }
            }}
            noTextError={errors.instagramNoText}
            event={{
              title: formData.title.trim(),
              category: formData.category,
              date: formData.date,
              time: formData.time,
              place: formData.isOnline ? 'Online' : formData.place.trim(),
              organizer: formData.organizer.name.trim(),
            }}
          />
        </details>
      )}

      {submitError && <p className="error-text submit-error">{submitError}</p>}
    </div>
  );

  return (
    <div className="event-form-page">
      <div className="event-form-container" ref={wizardContainerRef}>
        <div className="event-form-header">
          {user ? (
            <button onClick={() => navigate('/admin')} className="btn btn-secondary back-btn">
              <ArrowLeft size={18} />
              <span>Zurück zur Verwaltung</span>
            </button>
          ) : (
            <button onClick={() => navigate('/')} className="btn btn-secondary back-btn">
              <ArrowLeft size={18} />
              <span>Zurück zum Kalender</span>
            </button>
          )}
          <h1>{isAdmin ? 'Neues Event erstellen' : 'Event zur Genehmigung einreichen'}</h1>
        </div>

        {cameFromVerification && !restoredDraft && (
          <div
            className="wizard-draft-elsewhere"
            role="status"
            data-testid="wizard-draft-elsewhere"
          >
            <strong>Deine E-Mail-Adresse ist bestätigt.</strong>
            <span>
              Dein Event-Entwurf liegt im ursprünglichen Browser, in dem du ihn angefangen hast.
              Öffne die Seite dort wieder, um ihn einzureichen – oder beginne hier neu.
            </span>
          </div>
        )}

        {renderStepIndicator()}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}

          {validationError && (
            <p className="wizard-actions-error" data-testid="wizard-validation-error" role="alert">
              {validationError}
            </p>
          )}

          <div className="wizard-actions">
            {currentStep > 1 && (
              <button type="button" onClick={prevStep} className="btn btn-secondary">
                <ArrowLeft size={18} />
                <span>Zurück</span>
              </button>
            )}
            {currentStep === 4 && canCreateEvents && (
              <button
                type="button"
                onClick={handleSaveAsDraft}
                className={`btn btn-secondary ${!rightsConfirmed ? 'btn-greyed-out' : ''} ${
                  wobblingAction === 'draft' ? 'btn-wobble' : ''
                }`}
                disabled={loading || imageUploading}
                aria-disabled={!rightsConfirmed}
                data-testid="save-as-draft-button"
                onAnimationEnd={() => {
                  if (wobblingAction === 'draft') {
                    setWobblingAction(null);
                  }
                }}
              >
                <Save size={22} />
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
              <button
                type="button"
                onClick={nextStep}
                className={`btn btn-primary ${wobblingAction === 'next' ? 'btn-wobble' : ''}`}
                data-testid="continue-button"
                onAnimationEnd={() => {
                  if (wobblingAction === 'next') {
                    setWobblingAction(null);
                  }
                }}
              >
                <span>Weiter</span>
                <ArrowRight size={18} />
              </button>
            ) : canCreateEvents ? (
              <button
                type="button"
                onClick={handleSubmit}
                className={`btn btn-primary ${!rightsConfirmed ? 'btn-greyed-out' : ''} ${
                  wobblingAction === 'submit' ? 'btn-wobble' : ''
                }`}
                disabled={loading || imageUploading}
                aria-disabled={!rightsConfirmed}
                data-testid="submit-event-button"
                onAnimationEnd={() => {
                  if (wobblingAction === 'submit') {
                    setWobblingAction(null);
                  }
                }}
              >
                <Save size={22} />
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
            ) : null}
          </div>

          {(currentStep === 1 || currentStep === 4) && (
            <p className="wizard-guide-hint">
              <EventGuideLink testId="faq-guide-link-step">
                Welche Events passen in unseren Kalender?
              </EventGuideLink>
            </p>
          )}

          {currentStep === 4 && !user && (
            <div
              className="wizard-auth-gate wizard-auth-gate--guest"
              data-testid="wizard-guest-gate"
            >
              <p className="wizard-auth-gate-title">
                Fast geschafft! Zum Einreichen melde dich an oder erstelle ein Konto.
              </p>
              <p className="wizard-auth-gate-text">
                Dein Event bleibt in diesem Browser gespeichert. Danach kommst du direkt hierher
                zurück und kannst es einreichen.
              </p>
              <div className="wizard-auth-gate-actions">
                <button
                  type="button"
                  className={`btn btn-primary ${wobblingAction === 'register' ? 'btn-wobble' : ''}`}
                  onClick={() => handleGuestAuth('register')}
                  data-testid="wizard-guest-register"
                >
                  Konto erstellen
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary ${wobblingAction === 'login' ? 'btn-wobble' : ''}`}
                  onClick={() => handleGuestAuth('login')}
                  data-testid="wizard-guest-login"
                >
                  Ich habe schon ein Konto
                </button>
              </div>
            </div>
          )}

          {awaitingVerification && (
            <div className="wizard-auth-gate" data-testid="wizard-verify-gate">
              <EmailVerificationBanner
                title="Fast geschafft! Bitte bestätige noch deine E-Mail-Adresse."
                text="Wir haben dir einen Bestätigungslink geschickt. Sobald du ihn angeklickt hast, kannst du dein Event hier einreichen – dein Entwurf bleibt gespeichert."
                afterVerify="createEvent"
                showProfileLink={false}
              />
            </div>
          )}
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

      <DuplicateEventDialog
        isOpen={duplicateCandidates.length > 0 && !showDiscardConfirm}
        candidates={duplicateCandidates}
        loading={loading}
        onSubmitAnyway={handleDuplicateSubmitAnyway}
        onSaveDraft={handleDuplicateSaveDraft}
        onBack={() => setDuplicateCandidates([])}
        onDiscard={() => setShowDiscardConfirm(true)}
      />

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Event verwerfen?"
        message="Dein Entwurf wird gelöscht. Das kann nicht rückgängig gemacht werden."
        confirmLabel="Ja, verwerfen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleDuplicateDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showMultiDayRecurrenceConfirm}
        title="Enddatum und Wiederholung kombiniert"
        message="Du hast sowohl ein Enddatum (mehrtägiges Event) als auch eine Wiederholung angegeben. Bist du sicher, dass das beabsichtigt ist? Für mehrtägige Events wie Retreats oder Festivals ist normalerweise keine Wiederholung nötig."
        confirmLabel="Ja, beides ist korrekt"
        cancelLabel="Abbrechen und korrigieren"
        onConfirm={() => {
          setShowMultiDayRecurrenceConfirm(false);
          setEndDateConflictMarked(false);
          setCurrentStep(4);
        }}
        onCancel={() => setShowMultiDayRecurrenceConfirm(false)}
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
        cta={
          successState && getMissingProfileFields(profile).length > 0
            ? {
                text: 'Lege jetzt dein Profil an, damit andere dich als Veranstalter:in finden können.',
                label: 'Profil ausfüllen',
                onClick: () => {
                  setSuccessState(null);
                  setLoading(false);
                  navigate('/profil');
                },
              }
            : null
        }
        confirmLabel="Zur Verwaltung"
        onConfirm={handleSuccessConfirm}
      />
    </div>
  );
}
