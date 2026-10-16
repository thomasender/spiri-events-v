import { useState, useEffect, useRef } from 'react';
import { bezirkLabel } from '../utils/regions';
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import SeoMeta from '../components/SeoMeta';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isLegacyId } from '../lib/slug';
import {
  Calendar,
  Clock,
  MapPin,
  Ticket,
  ExternalLink,
  ArrowLeft,
  Edit2,
  Trash2,
  CheckCircle,
  Undo2,
  User,
  Mail,
  Phone,
  Ban,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { useEventRegionContext } from '../hooks/useRegion';
import { useOrganizerProfile } from '../hooks/useOrganizerProfile';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { buildEventJsonLd } from '../utils/eventJsonLd';
import { getRegionBySlug, resolveRegionId } from '../utils/regions';
import { pickEventDoc } from '../utils/pickEventDoc';
import { getOrganizerName } from '../utils/eventFormat';
import { resolveOrganizerProfilePath } from '../utils/profile';
import { canEditEvent, canDeleteEvent, requiresDeleteReason } from '../utils/eventPermissions';
import { getStaffAccess, isModeratorForEvent } from '../utils/staffRoles';
import { parseContactText } from '../utils/contactFormat';
import { getNextUpcomingOccurrence, getRecurrenceDatesForDetail } from '../utils/eventOccurrences';
import { isEventCancelled, isOccurrenceCancelled } from '../utils/eventCancellation';
import CancelledBadge from '../components/CancelledBadge';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
} from '../utils/customSeriesUpdates';
import ConfirmDialog from '../components/ConfirmDialog';
import RecurringDeleteDialog from '../components/RecurringDeleteDialog';
import OccurrencePickerDialog from '../components/OccurrencePickerDialog';
import EventMessages from '../components/EventMessages';
import FavoriteButton from '../components/FavoriteButton';
import LoginPromptModal from '../components/LoginPromptModal';
import { requestCalendarFeedToken, startCalendarDownload } from '../hooks/useCalendarFeedToken';
import ShareButton from '../components/ShareButton';
import { AdminInstagramPreview } from '../components/InstagramPostPreview';
import RichTextView from '../components/RichTextView';
import SimilarEvents from '../components/SimilarEvents';
import { stripHtml, truncateHtmlText } from '../utils/sanitize';
import { normalizeLink } from '../utils/link';
import { formatPriceWithCurrency } from '../utils/currency';
import './EventDetailPage.css';

function OrganizerLine({ event }) {
  const { profile: organizerProfile } = useOrganizerProfile(event?.createdBy);
  const profilePath = resolveOrganizerProfilePath(event, organizerProfile);
  const showLink = Boolean(profilePath);
  const organizerContent = (
    <>
      {event.organizer.photoURL && (
        <img
          src={event.organizer.photoURL}
          alt=""
          className="organizer-photo"
          data-testid="organizer-photo"
        />
      )}
      <span>{getOrganizerName(event)}</span>
    </>
  );
  if (showLink) {
    return (
      <Link
        to={profilePath}
        className="detail-value organizer-value organizer-link detail-link"
        data-testid="organizer-link"
      >
        {organizerContent}
      </Link>
    );
  }
  return (
    <span className="detail-value organizer-value" data-testid="organizer-text">
      {organizerContent}
    </span>
  );
}

const PENDING_REVIEW_MESSAGE =
  'Dieses Event wird gerade von den Admins geprüft und ist bald verfügbar.';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatEndDate(startDateStr, endDateStr) {
  if (!endDateStr) return null;
  const [syear, smonth, sday] = startDateStr.split('-');
  const [eyear, emonth, eday] = endDateStr.split('-');
  const start = new Date(syear, smonth - 1, sday);
  const end = new Date(eyear, emonth - 1, eday);
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return null;
  }
  const endDate = new Date(eyear, emonth - 1, eday);
  return endDate.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRecurrence(recurrence, recurrenceEndDate, eventDate) {
  if (!recurrence || recurrence === 'none') return null;
  if (recurrence === 'custom') return 'An einzelnen Terminen';
  let weekday = '';
  if (eventDate && (recurrence === 'weekly' || recurrence === 'biweekly')) {
    const [year, month, day] = eventDate.split('-');
    const date = new Date(year, month - 1, day);
    weekday = ` ${date.toLocaleDateString('de-DE', { weekday: 'long' })}`;
  }
  const labels = {
    weekly: `Jeden${weekday}`,
    biweekly: `Jeden zweiten${weekday}`,
    monthly: 'Jeden Monat',
  };
  let label = labels[recurrence];
  if (!label) {
    label = recurrence.charAt(0).toUpperCase() + recurrence.slice(1);
  }
  if (recurrenceEndDate) {
    const [year, month, day] = recurrenceEndDate.split('-');
    const endDate = new Date(year, month - 1, day);
    label += ` bis ${endDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  return label;
}

// Name of the event's region (Vorarlberg for events without regionId, so unchanged).
function eventRegionName(event) {
  return getRegionBySlug(resolveRegionId(event))?.name ?? 'Vorarlberg';
}

function generateEventJsonLd(event) {
  const image = event.imageUrl || getEventFallbackImage(event);
  return buildEventJsonLd(event, {
    image: /^https?:\/\//i.test(image) ? image : `https://www.thetribe.at${image}`,
    description: stripHtml(event.description || ''),
    regionName: eventRegionName(event),
  });
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const occurrenceDate = searchParams.get('occurrenceDate');
  const { user, loading: authLoading, role, staffRegionIds } = useAuth();
  const moderatorRegionKey = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';
  const staffAccess = getStaffAccess(role, staffRegionIds);
  const { deleteEvent, updateEvent, approveEvent, unpublishEvent } = useEvents(user);
  const [event, setEvent] = useState(null);
  useEventRegionContext(event);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRecurringDeleteDialog, setShowRecurringDeleteDialog] = useState(false);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState(null);
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [calendarLoginPromptOpen, setCalendarLoginPromptOpen] = useState(false);
  const [calendarDownloadState, setCalendarDownloadState] = useState('idle');
  // null | { date: null } (whole event) | { date: 'YYYY-MM-DD' } (one date of a series)
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const isAdmin = role === 'Admin';
  // A Regions-Moderator:in reviews pending/approved events of her regions
  // (approve, unpublish, messages) but never edits their content.
  const isEventModerator = isModeratorForEvent(staffAccess, event);
  const showMessagesForHash =
    event &&
    user &&
    (event.status === 'pending' || event.status === 'draft') &&
    (isAdmin || event.createdBy === user.uid || isEventModerator);

  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setError(PENDING_REVIEW_MESSAGE);
        setLoading(false);
        return;
      }

      if (authLoading) {
        return;
      }

      try {
        let docSnap = null;

        if (isLegacyId(slug)) {
          const docRef = doc(db, 'events', slug);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            docSnap = snap;
          }
        } else {
          const approvedQuery = query(
            collection(db, 'events'),
            where('slug', '==', slug),
            where('status', '==', 'approved')
          );
          const approvedSnapshot = await getDocs(approvedQuery);
          if (!approvedSnapshot.empty) {
            docSnap = approvedSnapshot.docs[0];
          } else if (user && role === 'Admin') {
            const anyQuery = query(collection(db, 'events'), where('slug', '==', slug));
            const anySnapshot = await getDocs(anyQuery);
            if (!anySnapshot.empty) {
              docSnap = pickEventDoc(anySnapshot.docs);
            }
          } else if (user) {
            // A Regions-Moderator:in may read non-draft events of her regions,
            // but only with a region filter (firestore.rules).
            const moderatorRegionIds = getStaffAccess(
              role,
              moderatorRegionKey ? moderatorRegionKey.split(',') : []
            ).moderatorRegionIds;
            if (moderatorRegionIds.length > 0) {
              const regionSnapshot = await getDocs(
                query(
                  collection(db, 'events'),
                  where('slug', '==', slug),
                  where('status', '==', 'pending'),
                  where('regionId', 'in', moderatorRegionIds)
                )
              );
              if (!regionSnapshot.empty) {
                docSnap = pickEventDoc(regionSnapshot.docs);
              }
            }
          }
          if (!docSnap && user && role !== 'Admin') {
            const ownQuery = query(
              collection(db, 'events'),
              where('slug', '==', slug),
              where('createdBy', '==', user.uid)
            );
            const ownSnapshot = await getDocs(ownQuery);
            if (!ownSnapshot.empty) {
              docSnap = pickEventDoc(ownSnapshot.docs);
            }
          }
        }

        if (docSnap) {
          setEvent({ id: docSnap.id, ...docSnap.data() });
          setError(null);
        } else {
          setEvent(null);
          setError(PENDING_REVIEW_MESSAGE);
        }
      } catch (err) {
        console.error('Error fetching event:', err);
        if (err.code === 'permission-denied' || err.message?.includes('permission-denied')) {
          setError(PENDING_REVIEW_MESSAGE);
        } else {
          setError('Event konnte nicht geladen werden');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [slug, user, role, moderatorRegionKey, authLoading]);

  const eventMessagesReadyRef = useRef(false);
  const [eventMessagesReady, setEventMessagesReady] = useState(false);

  useEffect(() => {
    if (location.hash !== '#event-messages') return;
    if (loading || !event) return;
    if (!showMessagesForHash) return;
    if (!eventMessagesReady) return;
    if (eventMessagesReadyRef.current) return;
    eventMessagesReadyRef.current = true;
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const node = document.getElementById('event-messages');
      if (!node) {
        if (attempts < 20) {
          attempts += 1;
          window.requestAnimationFrame(tryScroll);
        }
        return;
      }
      const rect = node.getBoundingClientRect();
      if (Math.abs(rect.top) < 1) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        if (cancelled) return;
        const next = node.getBoundingClientRect();
        if (Math.abs(next.top) > 1 && attempts < 10) {
          attempts += 1;
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 250);
    };
    window.requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [location.hash, loading, event, showMessagesForHash, eventMessagesReady]);

  useEffect(() => {
    eventMessagesReadyRef.current = false;
    setEventMessagesReady(false);
  }, [event?.id, location.hash]);

  if (loading) {
    return (
      <div className="event-detail-page">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="event-detail-page">
        <div className="event-not-found">
          <h2>{error || PENDING_REVIEW_MESSAGE}</h2>
          {!user && (
            <p className="event-not-found-hint">
              Hast du dieses Event erstellt? Melde dich an, um es zu sehen und zu bearbeiten.
            </p>
          )}
          <div className="event-not-found-actions">
            {!user && (
              <Link
                to="/login"
                state={{ from: `${location.pathname}${location.search}${location.hash}` }}
                className="btn btn-primary"
                data-testid="event-login-prompt"
              >
                <span>Anmelden</span>
              </Link>
            )}
            <Link to="/" className={user ? 'btn btn-primary' : 'btn btn-secondary'}>
              <ArrowLeft size={16} />
              <span>Zurück zum Kalender</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isFree = event.contribution === 'free';
  const isDonation = event.contribution === 'donation';
  const jsonLd = generateEventJsonLd(event);
  const isOwner = user && event.createdBy === user.uid;
  const showEditButton = canEditEvent(user, event, role);
  const showDeleteButton = canDeleteEvent(user, event, role);
  const deleteReasonRequired = requiresDeleteReason(user, event, role, staffRegionIds);
  const fallbackImage = getEventFallbackImage(event);
  const showRemoteImage = Boolean(event.imageUrl) && !imageError;
  const imageSrc = showRemoteImage ? event.imageUrl : fallbackImage;

  const showApproveButton = (isAdmin || isEventModerator) && event.status === 'pending';

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveEvent(event.id);
      setEvent((prev) => (prev ? { ...prev, status: 'approved' } : prev));
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApproving(false);
    }
  };

  const showUnpublishButton = (isAdmin || isEventModerator) && event.status === 'approved';

  const handleUnpublish = async () => {
    setUnpublishing(true);
    try {
      await unpublishEvent(event.id);
      setEvent((prev) => (prev ? { ...prev, status: 'draft' } : prev));
      setShowUnpublishDialog(false);
    } catch (err) {
      console.error('Unpublish failed:', err);
    } finally {
      setUnpublishing(false);
    }
  };

  const handleDelete = async (reason) => {
    setDeleting(true);
    try {
      await deleteEvent(event.id, { reason });
      setShowDeleteDialog(false);
      navigate(backPath);
    } catch (err) {
      console.error('Trash failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteThisOnly = async () => {
    setDeleting(true);
    try {
      const dateToDelete = selectedOccurrenceDate || event.date;
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
    const deleteDate = selectedOccurrenceDate || event.date;
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
      navigate('/');
    } catch (err) {
      console.error('Delete all failed:', err);
      setDeleting(false);
    }
  };

  const handleOccurrenceConfirmed = (date) => {
    setSelectedOccurrenceDate(date);
    setPendingRecurringDelete(null);
    setShowRecurringDeleteDialog(true);
  };

  const handleRecurringDeleteChangeOccurrence = () => {
    setShowRecurringDeleteDialog(false);
    setPendingRecurringDelete({ event });
  };

  // The .ics download is for signed-in users only (like Favoriten). The URL needs
  // the user's personal calendar token, which is fetched on click, so it never
  // sits in the page for visitors.
  const handleAddToCalendar = async () => {
    if (!user) {
      setCalendarLoginPromptOpen(true);
      return;
    }
    setCalendarDownloadState('loading');
    try {
      const token = await requestCalendarFeedToken();
      const slug = encodeURIComponent(event.slug || event.id);
      startCalendarDownload(`/calendar/event/${slug}.ics?token=${encodeURIComponent(token)}`);
      setCalendarDownloadState('idle');
    } catch (err) {
      console.warn('Calendar download failed:', err);
      setCalendarDownloadState('error');
    }
  };

  // Owners (and admins) can call off a published event or single dates of a
  // series. The event stays visible with an "Abgesagt" label; people who saved
  // it as a favorite get an e-mail (Cloud Function on the event update).
  const canManageCancellation = showEditButton && event.status === 'approved';
  const eventCancelled = isEventCancelled(event);

  const applyCancellation = async (date, cancel) => {
    setCancelling(true);
    setCancelError('');
    try {
      const patch = date
        ? { cancelledDates: cancel ? arrayUnion(date) : arrayRemove(date) }
        : { cancelled: cancel };
      await updateEvent(event.id, patch);
      setEvent((prev) => {
        if (!prev) return prev;
        if (!date) return { ...prev, cancelled: cancel };
        const current = Array.isArray(prev.cancelledDates) ? prev.cancelledDates : [];
        const next = cancel ? [...new Set([...current, date])] : current.filter((d) => d !== date);
        return { ...prev, cancelledDates: next };
      });
      setCancelTarget(null);
    } catch (err) {
      console.error('Cancellation update failed:', err);
      setCancelError('Das hat leider nicht geklappt. Bitte versuche es noch einmal.');
    } finally {
      setCancelling(false);
    }
  };

  const todayIso = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const backPath = location.state?.from || '/';
  const backLabel =
    backPath === '/admin' || backPath.startsWith('/admin?')
      ? 'Zurück zur Verwaltung'
      : 'Zurück zum Kalender';

  const eventDescription = event.description
    ? truncateHtmlText(event.description, 160)
    : `${event.title} - ${event.category || 'Event'}${event.isOnline ? ' (Online)' : event.bezirk ? ` in ${bezirkLabel(event.bezirk)}` : ''}`;
  const eventPath = `/event/${event.slug || event.id}`;
  const recurrenceDates = getRecurrenceDatesForDetail(event);
  const showRecurrenceDatesList = recurrenceDates.length > 0;

  return (
    <div className="event-detail-page">
      <SeoMeta
        title={event.title}
        description={eventDescription}
        path={eventPath}
        type="event"
        event={event}
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <Link to={backPath} className="back-link">
        <ArrowLeft size={16} />
        <span>{backLabel}</span>
      </Link>

      {(showEditButton ||
        showDeleteButton ||
        showApproveButton ||
        showUnpublishButton ||
        canManageCancellation) && (
        <div className="owner-actions">
          {showEditButton && (
            <Link to={`/admin/edit/${event.id}`} className="btn btn-secondary">
              <Edit2 size={16} />
              <span>Event bearbeiten</span>
            </Link>
          )}
          {showApproveButton && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="btn btn-success"
              data-testid="approve-event-button"
            >
              <CheckCircle size={16} />
              <span>{approving ? 'Genehmige…' : 'Event genehmigen'}</span>
            </button>
          )}
          {showUnpublishButton && (
            <button
              type="button"
              onClick={() => setShowUnpublishDialog(true)}
              className="btn btn-secondary"
              data-testid="unpublish-event-button"
            >
              <Undo2 size={16} />
              <span>Zurück zu Entwurf</span>
            </button>
          )}
          {canManageCancellation &&
            (eventCancelled ? (
              <button
                type="button"
                onClick={() => applyCancellation(null, false)}
                disabled={cancelling}
                className="btn btn-secondary"
                data-testid="uncancel-event-button"
              >
                <Undo2 size={16} />
                <span>Absage zurücknehmen</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCancelTarget({ date: null })}
                className="btn btn-secondary"
                data-testid="cancel-event-button"
              >
                <Ban size={16} />
                <span>{showRecurrenceDatesList ? 'Alle Termine absagen' : 'Event absagen'}</span>
              </button>
            ))}
          {showDeleteButton && (
            <button
              type="button"
              onClick={() => {
                if (event.recurrence && event.recurrence !== 'none') {
                  const initial = occurrenceDate || getNextUpcomingOccurrence(event) || event.date;
                  setPendingRecurringDelete({ event });
                  setSelectedOccurrenceDate(initial);
                } else {
                  setShowDeleteDialog(true);
                }
              }}
              className="btn btn-subtle-danger"
              data-testid="delete-event-button"
              aria-label="Event löschen"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {(eventCancelled || (occurrenceDate && isOccurrenceCancelled(event, occurrenceDate))) && (
        <div className="event-cancelled-banner" role="status" data-testid="event-cancelled-banner">
          <CancelledBadge />
          <span>
            {eventCancelled
              ? 'Dieses Event wurde abgesagt und findet nicht statt.'
              : `Der Termin am ${formatDate(occurrenceDate)} wurde abgesagt und findet nicht statt.`}
          </span>
        </div>
      )}
      {cancelError && (
        <p className="event-cancel-error" role="alert">
          {cancelError}
        </p>
      )}

      <header className="event-header">
        <div className="event-image-wrapper">
          {showRemoteImage && !imageLoaded && <div className="event-image-skeleton" />}
          <img
            src={imageSrc}
            alt={event.title}
            className={`event-image ${imageLoaded || !showRemoteImage ? 'loaded' : ''}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
        <div className="event-title-row">
          <h1 className="event-title">{event.title}</h1>
          <FavoriteButton eventId={event.id} />
          <ShareButton event={event} />
        </div>
        <div className="event-meta-row">
          {event.category && (
            <div className="event-categories">
              <span className="category-chip">{event.category}</span>
            </div>
          )}
          <div
            className={`event-badge ${isFree ? 'badge--free' : isDonation ? 'badge--donation' : 'badge--fee'}`}
          >
            <Ticket size={14} />
            <span>
              {isFree
                ? 'Kostenlos'
                : isDonation
                  ? 'Freie Spende'
                  : event.fee
                    ? `${formatPriceWithCurrency(event.fee, event.priceCurrency, event.feeMax)}${
                        event.feeNote ? ` / ${event.feeNote}` : ''
                      }`
                    : event.feeNote || 'Kostenpflichtig'}
            </span>
          </div>
          {event.firstSessionFree && !isFree && !isDonation && (
            <div className="event-badge badge--free" data-testid="first-session-free-badge">
              <span>1. Einheit gratis</span>
            </div>
          )}
        </div>
      </header>

      <div className="event-details">
        <div className="detail-item">
          <Calendar size={18} className="detail-icon" />
          <div>
            <span className="detail-label">Datum</span>
            {showRecurrenceDatesList ? (
              <ul
                className="detail-value event-detail-dates-list"
                data-testid="event-detail-dates-list"
              >
                {recurrenceDates.map((date) => {
                  const isCurrent = date === occurrenceDate;
                  const dateCancelled = isOccurrenceCancelled(event, date);
                  const dateIsCancelledSingly =
                    Array.isArray(event.cancelledDates) && event.cancelledDates.includes(date);
                  const showDateToggle =
                    canManageCancellation && !eventCancelled && date >= todayIso;
                  return (
                    <li key={date} data-testid="event-detail-date-item">
                      <span
                        className={isCurrent ? 'event-detail-date-current' : undefined}
                        data-testid={isCurrent ? 'event-detail-date-current' : undefined}
                      >
                        {formatDate(date)}
                      </span>
                      {dateCancelled && <CancelledBadge className="event-detail-date-badge" />}
                      {showDateToggle &&
                        (dateIsCancelledSingly ? (
                          <button
                            type="button"
                            className="detail-link detail-link--button event-detail-date-action"
                            onClick={() => applyCancellation(date, false)}
                            disabled={cancelling}
                            data-testid="uncancel-date-button"
                          >
                            Absage zurücknehmen
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="detail-link detail-link--button event-detail-date-action"
                            onClick={() => setCancelTarget({ date })}
                            data-testid="cancel-date-button"
                          >
                            Termin absagen
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="detail-value">
                {formatDate(occurrenceDate || event.date)}
                {formatEndDate(occurrenceDate || event.date, event.endDate) &&
                  ` — ${formatEndDate(occurrenceDate || event.date, event.endDate)}`}
                {isOccurrenceCancelled(event, occurrenceDate || event.date) && (
                  <CancelledBadge className="event-detail-date-badge" />
                )}
              </span>
            )}
            {event.status === 'approved' && (
              <>
                <button
                  type="button"
                  className="detail-link detail-link--button"
                  onClick={handleAddToCalendar}
                  disabled={calendarDownloadState === 'loading'}
                  data-testid="add-to-calendar-link"
                >
                  {showRecurrenceDatesList
                    ? 'Alle Termine zum Kalender hinzufügen'
                    : 'Zum Kalender hinzufügen'}
                </button>
                {calendarDownloadState === 'error' && (
                  <span className="detail-value" role="alert" data-testid="add-to-calendar-error">
                    Der Kalender-Download hat nicht geklappt. Bitte versuche es noch einmal.
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {event.time && (
          <div className="detail-item">
            <Clock size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Uhrzeit</span>
              <span className="detail-value">
                {event.time}
                {event.endTime ? ` — ${event.endTime} Uhr` : ' Uhr'}
              </span>
            </div>
          </div>
        )}

        {formatRecurrence(event.recurrence, event.recurrenceEndDate, event.date) && (
          <div className="detail-item">
            <Calendar size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Wiederholung</span>
              <span className="detail-value">
                {formatRecurrence(event.recurrence, event.recurrenceEndDate, event.date)}
              </span>
            </div>
          </div>
        )}

        <div className="detail-item">
          <MapPin size={18} className="detail-icon" />
          <div>
            <span className="detail-label">Bezirk</span>
            <span
              className="detail-value"
              data-testid={event.isOnline ? 'event-detail-location-online' : undefined}
            >
              {event.isOnline ? 'Online' : bezirkLabel(event.bezirk) || eventRegionName(event)}
            </span>
          </div>
        </div>

        {!event.isOnline && (
          <div className="detail-item">
            <MapPin size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Adresse</span>
              <span className="detail-value">{event.place || 'Noch nicht angegeben'}</span>
            </div>
          </div>
        )}

        {event.organizer && getOrganizerName(event) && (
          <div className="detail-item" data-testid="event-organizer">
            <User size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Veranstalter</span>
              <OrganizerLine event={event} />
            </div>
          </div>
        )}

        {isAdmin && event.organizer?.email && (
          <div className="detail-item" data-testid="event-owner-email">
            <Mail size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Owner</span>
              <a href={`mailto:${event.organizer.email}`} className="detail-value detail-link">
                {event.organizer.email}
              </a>
            </div>
          </div>
        )}

        {event.kontakt && (
          <div className="detail-item" data-testid="event-kontakt">
            {(() => {
              const segments = parseContactText(event.kontakt);
              const hasEmail = segments.some((s) => s.type === 'email');
              const hasPhone = segments.some((s) => s.type === 'phone');
              return hasEmail || hasPhone ? (
                hasEmail ? (
                  <Mail size={18} className="detail-icon" />
                ) : (
                  <Phone size={18} className="detail-icon" />
                )
              ) : (
                <Phone size={18} className="detail-icon" />
              );
            })()}
            <div>
              <span className="detail-label">Kontakt</span>
              <span className="detail-value">
                {parseContactText(event.kontakt).map((segment, index) => {
                  if (segment.type === 'email') {
                    return (
                      <a key={index} href={`mailto:${segment.value}`} className="detail-link">
                        {segment.value}
                      </a>
                    );
                  }
                  if (segment.type === 'phone') {
                    return (
                      <a key={index} href={`tel:${segment.value}`} className="detail-link">
                        {segment.value}
                      </a>
                    );
                  }
                  return <span key={index}>{segment.value}</span>;
                })}
              </span>
            </div>
          </div>
        )}

        {event.link && (
          <div className="detail-item" data-testid="event-detail-link">
            <ExternalLink size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Webseite</span>
              <a
                href={normalizeLink(event.link)}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-value detail-link detail-link--break"
              >
                {event.link}
              </a>
            </div>
          </div>
        )}
      </div>

      {event.description && (
        <div className="event-description">
          <h3>Über das Event</h3>
          <RichTextView html={event.description} />
        </div>
      )}

      <AdminInstagramPreview
        event={event}
        isAdmin={isAdmin}
        onCropSaved={(instagramImage) =>
          setEvent((prev) => (prev ? { ...prev, instagramImage } : prev))
        }
      />

      {event.link && (
        <a
          href={normalizeLink(event.link)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary event-link"
        >
          <span>Mehr Infos & Tickets</span>
          <ExternalLink size={16} />
        </a>
      )}

      {(event.status === 'pending' || event.status === 'draft') &&
        user &&
        (isAdmin || isOwner || isEventModerator) && (
          <EventMessages
            eventId={event.id}
            eventOwnerUid={event.createdBy || null}
            onReady={() => setEventMessagesReady(true)}
          />
        )}

      <SimilarEvents currentEvent={event} />

      <LoginPromptModal
        open={calendarLoginPromptOpen}
        variant="calendar"
        onClose={() => setCalendarLoginPromptOpen(false)}
        returnTo={`${location.pathname}${location.search}${location.hash}`}
        onLogin={() => setCalendarLoginPromptOpen(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="In Papierkorb verschieben"
        message="Das Event wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht. Du kannst es innerhalb dieser 30 Tage im Papierkorb wiederherstellen."
        confirmLabel="In Papierkorb"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        loading={deleting}
        reasonRequired={deleteReasonRequired}
      />

      <ConfirmDialog
        isOpen={showUnpublishDialog}
        title="Zurück zu Entwurf"
        message="Das Event wird offline genommen und ist nicht mehr öffentlich sichtbar. Es erscheint wieder als Entwurf beim Veranstalter, der per E-Mail darüber informiert wird und es überarbeiten und erneut einreichen kann."
        confirmLabel="Zurück zu Entwurf"
        cancelLabel="Abbrechen"
        onConfirm={handleUnpublish}
        onCancel={() => setShowUnpublishDialog(false)}
        loading={unpublishing}
      />

      <ConfirmDialog
        isOpen={Boolean(cancelTarget)}
        title={cancelTarget?.date ? 'Termin absagen' : 'Event absagen'}
        message={
          cancelTarget?.date
            ? `Der Termin am ${formatDate(cancelTarget.date)} bleibt sichtbar, wird aber als „Abgesagt" markiert. Alle, die dieses Event als Favorit gespeichert haben, bekommen eine E-Mail.`
            : 'Das Event bleibt sichtbar, wird aber als „Abgesagt" markiert. Alle, die es als Favorit gespeichert haben, bekommen eine E-Mail. Du kannst die Absage später zurücknehmen.'
        }
        confirmLabel={cancelTarget?.date ? 'Termin absagen' : 'Event absagen'}
        cancelLabel="Abbrechen"
        onConfirm={() => applyCancellation(cancelTarget?.date ?? null, true)}
        onCancel={() => setCancelTarget(null)}
        loading={cancelling}
        danger
      />

      <RecurringDeleteDialog
        isOpen={showRecurringDeleteDialog}
        eventTitle={event.title}
        occurrenceDate={selectedOccurrenceDate}
        onDeleteThisOnly={handleDeleteThisOnly}
        onDeleteThisAndFuture={handleDeleteThisAndFuture}
        onDeleteAll={handleDeleteAll}
        onCancel={() => setShowRecurringDeleteDialog(false)}
        onChangeOccurrence={handleRecurringDeleteChangeOccurrence}
        loading={deleting}
        reasonRequired={deleteReasonRequired}
      />

      <OccurrencePickerDialog
        isOpen={Boolean(pendingRecurringDelete)}
        event={pendingRecurringDelete?.event}
        initialOccurrenceDate={selectedOccurrenceDate}
        onConfirm={handleOccurrenceConfirmed}
        onCancel={() => {
          setPendingRecurringDelete(null);
          setSelectedOccurrenceDate(null);
        }}
      />
    </div>
  );
}
