import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
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
  User,
  Mail,
  Phone,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
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

function isContactEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
    image: event.imageUrl || null,
    eventStatus: 'https://schema.org/EventScheduled',
    ...(offer && { offer }),
  };
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, role } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);

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
  const isOwner = user && event.createdBy === user.uid;

  return (
    <div className="event-detail-page">
      <Helmet>
        <title>{event.title} | tribe Vorarlberg</title>
        <meta
          name="description"
          content={
            event.description
              ? event.description.substring(0, 160)
              : `${event.title} - ${event.categories?.join(', ')} in ${event.bezirk}`
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
              : `${event.title} - ${event.categories?.join(', ')} in ${event.bezirk}`
          }
        />
        <meta property="og:url" content={`/event/${event.slug || event.id}`} />
        <meta property="og:locale" content="de_AT" />
        {event.imageUrl && <meta property="og:image" content={event.imageUrl} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={event.title} />
        <meta
          name="twitter:description"
          content={
            event.description
              ? event.description.substring(0, 160)
              : `${event.title} - ${event.categories?.join(', ')} in ${event.bezirk}`
          }
        />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        <span>Zurück zum Kalender</span>
      </Link>

      {isOwner && (
        <div className="owner-actions">
          <Link to={`/admin/edit/${event.id}`} className="btn btn-secondary">
            <Edit2 size={16} />
            <span>Event bearbeiten</span>
          </Link>
        </div>
      )}

      <header className="event-header">
        {event.imageUrl && (
          <div className="event-image-wrapper">
            {!imageLoaded && <div className="event-image-skeleton" />}
            <img
              src={event.imageUrl}
              alt={event.title}
              className={`event-image ${imageLoaded ? 'loaded' : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        )}
        <h1 className="event-title">{event.title}</h1>
        <div className="event-meta-row">
          {event.categories && event.categories.length > 0 && (
            <div className="event-categories">
              {event.categories.map((cat) => (
                <span key={cat} className="category-chip">
                  {cat}
                </span>
              ))}
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

        {event.kontakt && (
          <div className="detail-item" data-testid="event-kontakt">
            {isContactEmail(event.kontakt) ? (
              <Mail size={18} className="detail-icon" />
            ) : (
              <Phone size={18} className="detail-icon" />
            )}
            <div>
              <span className="detail-label">Kontakt</span>
              {isContactEmail(event.kontakt) ? (
                <a href={`mailto:${event.kontakt}`} className="detail-value detail-link">
                  {event.kontakt}
                </a>
              ) : (
                <a
                  href={`tel:${event.kontakt.replace(/\s/g, '')}`}
                  className="detail-value detail-link"
                >
                  {event.kontakt}
                </a>
              )}
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
    </div>
  );
}
