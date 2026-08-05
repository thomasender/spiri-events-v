import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, doc, getDoc, query, where, getDocs, arrayUnion } from 'firebase/firestore';
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
  User,
  Mail,
  Phone,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { canEditEvent, canDeleteEvent } from '../utils/eventPermissions';
import { parseContactText } from '../utils/contactFormat';
import ConfirmDialog from '../components/ConfirmDialog';
import RecurringDeleteDialog from '../components/RecurringDeleteDialog';
import EventMessages from '../components/EventMessages';
import './EventDetailPage.css';

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

function generateEventJsonLd(event) {
  const location = {
    '@type': 'Place',
    name: event.place || event.bezirk,
    address: {
      '@type': 'PostalAddress',
      addressLocality: event.bezirk || 'Vorarlberg',
      addressRegion: 'Vorarlberg',
      addressCountry: 'AT',
    },
  };

  const offer =
    event.contribution === 'free'
      ? {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        }
      : event.fee
        ? {
            '@type': 'Offer',
            price: event.fee.toString(),
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
          }
        : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date,
    endDate: event.endDate || event.date,
    location,
    description: event.description || '',
    image: event.imageUrl || getEventFallbackImage(event),
    eventStatus: 'https://schema.org/EventScheduled',
    ...(offer && { offer }),
  };
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const occurrenceDate = searchParams.get('occurrenceDate');
  const { user, loading: authLoading, role } = useAuth();
  const { deleteEvent, updateEvent } = useEvents(user);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRecurringDeleteDialog, setShowRecurringDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setError('Event nicht gefunden');
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
              docSnap = anySnapshot.docs[0];
            }
          } else if (user) {
            const ownQuery = query(
              collection(db, 'events'),
              where('slug', '==', slug),
              where('createdBy', '==', user.uid)
            );
            const ownSnapshot = await getDocs(ownQuery);
            if (!ownSnapshot.empty) {
              docSnap = ownSnapshot.docs[0];
            }
          }
        }

        if (docSnap) {
          setEvent({ id: docSnap.id, ...docSnap.data() });
          setError(null);
        } else {
          setEvent(null);
          setError('Event nicht gefunden');
        }
      } catch (err) {
        console.error('Error fetching event:', err);
        if (err.code === 'permission-denied' || err.message?.includes('permission-denied')) {
          setError('Du hast keine Berechtigung dieses Event anzusehen');
        } else {
          setError('Event konnte nicht geladen werden');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [slug, user, role, authLoading]);

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
          <h2>{error || 'Event nicht gefunden'}</h2>
          <Link to="/" className="btn btn-primary">
            <ArrowLeft size={16} />
            <span>Zurück zum Kalender</span>
          </Link>
        </div>
      </div>
    );
  }

  const isFree = event.contribution === 'free';
  const jsonLd = generateEventJsonLd(event);
  const isAdmin = role === 'Admin';
  const isOwner = user && event.createdBy === user.uid;
  const showEditButton = canEditEvent(user, event, role);
  const showDeleteButton = canDeleteEvent(user, event, role);
  const fallbackImage = getEventFallbackImage(event);
  const showRemoteImage = Boolean(event.imageUrl) && !imageError;
  const imageSrc = showRemoteImage ? event.imageUrl : fallbackImage;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      setShowDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteThisOnly = async () => {
    setDeleting(true);
    try {
      const dateToDelete = occurrenceDate || event.date;
      await updateEvent(event.id, {
        exceptionDates: arrayUnion(dateToDelete),
      });
      setShowRecurringDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete this only failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteThisAndFuture = async () => {
    setDeleting(true);
    try {
      let deleteDate = occurrenceDate;
      if (!deleteDate) {
        const today = new Date();
        deleteDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      const [year, month, day] = deleteDate.split('-');
      const prevDate = new Date(year, month - 1, day);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      await updateEvent(event.id, {
        recurrenceEndDate: prevDateStr,
      });
      setShowRecurringDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete this and future failed:', err);
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      setShowRecurringDeleteDialog(false);
      navigate('/');
    } catch (err) {
      console.error('Delete all failed:', err);
      setDeleting(false);
    }
  };

  const backPath = location.state?.from || '/';
  const backLabel = backPath === '/admin' ? 'Zurück zur Verwaltung' : 'Zurück zum Kalender';

  return (
    <div className="event-detail-page">
      <Helmet>
        <title>{event.title} | tribe Vorarlberg</title>
        <meta
          name="description"
          content={
            event.description
              ? event.description.substring(0, 160)
              : `${event.title} - ${event.category} in ${event.bezirk}`
          }
        />
        <link rel="canonical" href={`/event/${event.slug || event.id}`} />
        <meta property="og:type" content="event" />
        <meta property="og:title" content={event.title} />
        <meta
          property="og:description"
          content={
            event.description
              ? event.description.substring(0, 160)
              : `${event.title} - ${event.category} in ${event.bezirk}`
          }
        />
        <meta property="og:url" content={`/event/${event.slug || event.id}`} />
        <meta property="og:locale" content="de_AT" />
        {event.imageUrl && <meta property="og:image" content={event.imageUrl} />}
        {!event.imageUrl && <meta property="og:image" content={fallbackImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={event.title} />
        <meta
          name="twitter:description"
          content={
            event.description
              ? event.description.substring(0, 160)
              : `${event.title} - ${event.category} in ${event.bezirk}`
          }
        />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <Link to={backPath} className="back-link">
        <ArrowLeft size={16} />
        <span>{backLabel}</span>
      </Link>

      {(showEditButton || showDeleteButton) && (
        <div className="owner-actions">
          {showEditButton && (
            <Link to={`/admin/edit/${event.id}`} className="btn btn-secondary">
              <Edit2 size={16} />
              <span>Event bearbeiten</span>
            </Link>
          )}
          {showDeleteButton && (
            <button
              type="button"
              onClick={() => {
                if (event.recurrence && event.recurrence !== 'none') {
                  setShowRecurringDeleteDialog(true);
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
        <h1 className="event-title">{event.title}</h1>
        <div className="event-meta-row">
          {event.category && (
            <div className="event-categories">
              <span className="category-chip">{event.category}</span>
            </div>
          )}
          <div className={`event-badge ${isFree ? 'badge--free' : 'badge--fee'}`}>
            <Ticket size={14} />
            <span>{isFree ? 'Kostenlos' : event.fee ? `${event.fee} €` : 'Gebühr'}</span>
          </div>
        </div>
      </header>

      <div className="event-details">
        <div className="detail-item">
          <Calendar size={18} className="detail-icon" />
          <div>
            <span className="detail-label">Datum</span>
            <span className="detail-value">
              {formatDate(event.date)}
              {formatEndDate(event.date, event.endDate) &&
                ` — ${formatEndDate(event.date, event.endDate)}`}
            </span>
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
            <span className="detail-value">{event.bezirk || 'Vorarlberg'}</span>
          </div>
        </div>

        <div className="detail-item">
          <MapPin size={18} className="detail-icon" />
          <div>
            <span className="detail-label">Ort</span>
            <span className="detail-value">{event.place || 'Noch nicht angegeben'}</span>
          </div>
        </div>

        {event.organizer && (event.organizer.firstName || event.organizer.lastName) && (
          <div className="detail-item" data-testid="event-organizer">
            <User size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Veranstalter</span>
              <span className="detail-value">
                {event.organizer.firstName} {event.organizer.lastName}
              </span>
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
      </div>

      {event.description && (
        <div className="event-description">
          <h3>Über das Event</h3>
          <p>{event.description}</p>
        </div>
      )}

      {event.status === 'pending' && user && (isAdmin || isOwner) && (
        <EventMessages eventId={event.id} />
      )}

      {event.link && (
        <a
          href={event.link}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary event-link"
        >
          <span>Mehr Infos & Tickets</span>
          <ExternalLink size={16} />
        </a>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Event löschen"
        message="Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        loading={deleting}
        danger
      />

      <RecurringDeleteDialog
        isOpen={showRecurringDeleteDialog}
        eventTitle={event.title}
        occurrenceDate={occurrenceDate}
        onDeleteThisOnly={handleDeleteThisOnly}
        onDeleteThisAndFuture={handleDeleteThisAndFuture}
        onDeleteAll={handleDeleteAll}
        onCancel={() => setShowRecurringDeleteDialog(false)}
        loading={deleting}
      />
    </div>
  );
}
