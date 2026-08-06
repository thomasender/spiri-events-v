import { Link } from 'react-router-dom';
import { useEvents, usePendingEvents } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import {
  PlusCircle,
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  Eye,
  CheckCircle,
  Mail,
  Repeat,
  Info,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import OccurrencePickerDialog from './OccurrencePickerDialog';
import StatusBadge from './StatusBadge';
import { useState } from 'react';
import { arrayUnion } from 'firebase/firestore';
import {
  getNextUpcomingOccurrence,
  getOccurrenceCount,
  getRecurrenceLabel,
} from '../utils/eventOccurrences';
import './EventList.css';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
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
    month: 'short',
    year: 'numeric',
  });
}

export default function EventList() {
  const { user } = useAuth();
  const { role } = useAuth();
  const { events, loading, deleteEvent, updateEvent } = useEvents(user);
  const { pendingEvents, loading: pendingLoading, approveEvent } = usePendingEvents();
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState(null);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState(null);

  const isAdmin = role === 'Admin';

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteId);
      setDeleteId(null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async (eventId) => {
    setApproving(eventId);
    try {
      await approveEvent(eventId);
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApproving(null);
    }
  };

  const handleDeleteRecurringThis = async () => {
    if (!recurringDeleteTarget) return;
    const { id, occurrenceDate } = recurringDeleteTarget;
    setDeleting(true);
    try {
      await updateEvent(id, {
        exceptionDates: arrayUnion(occurrenceDate),
      });
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring this failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRecurringThisAndFuture = async () => {
    if (!recurringDeleteTarget) return;
    const { id, occurrenceDate } = recurringDeleteTarget;
    setDeleting(true);
    try {
      const [year, month, day] = occurrenceDate.split('-');
      const prevDate = new Date(year, month - 1, day);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      await updateEvent(id, {
        recurrenceEndDate: prevDateStr,
      });
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring this and future failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRecurringAll = async () => {
    if (!recurringDeleteTarget) return;
    const { id } = recurringDeleteTarget;
    setDeleting(true);
    try {
      await deleteEvent(id);
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring all failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const openRecurringDelete = (event) => {
    const nextOccurrence = getNextUpcomingOccurrence(event);
    setPendingRecurringDelete({
      id: event.id,
      event,
      initialOccurrenceDate: nextOccurrence || event.date,
    });
  };

  const handleOccurrenceConfirmed = (selectedDate) => {
    if (!pendingRecurringDelete) return;
    setRecurringDeleteTarget({
      id: pendingRecurringDelete.id,
      occurrenceDate: selectedDate,
      eventTitle: pendingRecurringDelete.event.title,
    });
    setPendingRecurringDelete(null);
  };

  if (loading || pendingLoading) {
    return <div className="loading-spinner"></div>;
  }

  const renderEventCard = (event, showStatus = false, showApprove = false) => {
    const isRecurring = event.recurrence && event.recurrence !== 'none';
    const recurrenceLabel = getRecurrenceLabel(event);
    const nextOccurrence = isRecurring ? getNextUpcomingOccurrence(event) : null;
    const occurrenceCount = isRecurring ? getOccurrenceCount(event) : 0;

    const nextOccurrenceDisplay = nextOccurrence
      ? (() => {
          const [year, month, day] = nextOccurrence.split('-');
          const d = new Date(year, month - 1, day);
          return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
        })()
      : null;

    return (
      <div key={event.id} className="event-card">
        <Link
          to={
            isRecurring && nextOccurrence
              ? `/event/${event.slug || event.id}?occurrenceDate=${nextOccurrence}`
              : `/event/${event.slug || event.id}`
          }
          state={{ from: '/admin' }}
          className="event-card-content"
        >
          <div className="event-card-header">
            <h3>{event.title}</h3>
            <div className="event-card-badges">
              {showStatus && <StatusBadge status={event.status} />}
              {isRecurring && (
                <span className="badge badge--recurring" title="Wiederholende Veranstaltung">
                  <Repeat size={12} />
                  <span>Serie</span>
                </span>
              )}
              {(event.contribution === 'free' || event.fee) && (
                <span
                  className={`badge ${event.contribution === 'free' ? 'badge--free' : 'badge--fee'}`}
                >
                  {event.contribution === 'free' ? 'Kostenlos' : `${event.fee} €`}
                </span>
              )}
            </div>
          </div>

          {event.category && (
            <div className="event-card-categories">
              <span className="category-chip">{event.category}</span>
            </div>
          )}

          <div className="event-card-meta">
            <div className="meta-item">
              <Calendar size={14} />
              <span>
                {isRecurring
                  ? nextOccurrenceDisplay || formatDate(event.date)
                  : formatDate(event.date)}
                {formatEndDate(event.date, event.endDate) &&
                  ` — ${formatEndDate(event.date, event.endDate)}`}
                {event.time && ` • ${event.time}`}
              </span>
            </div>
            {event.bezirk && (
              <div className="meta-item">
                <MapPin size={14} />
                <span>{event.bezirk}</span>
              </div>
            )}
            <div className="meta-item">
              <MapPin size={14} />
              <span>{event.place}</span>
            </div>
            {event.organizer && event.organizer.email && (
              <div className="meta-item" data-testid="event-owner-email">
                <Mail size={14} />
                <span>{event.organizer.email}</span>
              </div>
            )}
          </div>

          {isRecurring && recurrenceLabel && (
            <div className="event-card-recurrence">
              <span className="recurrence-pattern">
                <Repeat size={12} />
                {recurrenceLabel}
                {occurrenceCount > 0 && ` · ${occurrenceCount} Termine`}
              </span>
              {nextOccurrence && nextOccurrence !== event.date && (
                <span className="next-occurrence">· Nächster: {nextOccurrenceDisplay}</span>
              )}
            </div>
          )}

          {event.description && (
            <p className="event-card-description">
              {event.description.length > 120
                ? event.description.substring(0, 120) + '...'
                : event.description}
            </p>
          )}

          {event.status === 'pending' && !isAdmin && (
            <p className="event-card-pending-note">Wartet auf Genehmigung durch einen Admin</p>
          )}
        </Link>

        <div className="event-card-actions">
          <Link
            to={
              isRecurring && nextOccurrence
                ? `/event/${event.slug || event.id}?occurrenceDate=${nextOccurrence}`
                : `/event/${event.slug || event.id}`
            }
            state={{ from: '/admin' }}
            className="btn btn-secondary btn-sm"
          >
            <Eye size={16} />
            <span>Ansehen</span>
          </Link>
          {showApprove && (
            <button
              onClick={() => handleApprove(event.id)}
              className="btn btn-success btn-sm"
              disabled={approving === event.id}
            >
              <CheckCircle size={16} />
              <span>{approving === event.id ? 'Genehmige...' : 'Genehmigen'}</span>
            </button>
          )}
          <Link
            to={`/admin/edit/${event.id}`}
            className="btn btn-secondary btn-sm"
            title={
              isRecurring
                ? 'Du bearbeitest die Seriendefinition. Wiederholung, Uhrzeit, Ort etc. gelten für alle Termine.'
                : undefined
            }
          >
            <Edit2 size={16} />
            <span>{isRecurring ? 'Serie bearbeiten' : 'Bearbeiten'}</span>
          </Link>
          <button
            onClick={() => (isRecurring ? openRecurringDelete(event) : setDeleteId(event.id))}
            className="btn btn-subtle-danger btn-sm"
            aria-label={isRecurring ? 'Serie löschen' : 'Event löschen'}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  const renderEmptyState = (title, message, showCreateButton = true) => (
    <div className="event-list-empty">
      <div className="empty-icon">
        <Calendar size={48} />
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {showCreateButton && (
        <Link to="/admin/new" className="btn btn-primary">
          <PlusCircle size={18} />
          <span>Event erstellen</span>
        </Link>
      )}
    </div>
  );

  if (isAdmin) {
    const myEvents = events.filter((e) => e.createdBy === user.uid);
    const allPending = pendingEvents;

    return (
      <div className="event-list-page">
        <div className="event-list-header">
          <div>
            <h1>Event-Verwaltung</h1>
            <p>Verwalte deine Events und Genehmigungen</p>
          </div>
          <Link to="/admin/new" className="btn btn-primary">
            <PlusCircle size={18} />
            <span>Neues Event</span>
          </Link>
        </div>

        {allPending.length > 0 && (
          <section className="event-list-section">
            <h2>Ausstehende Genehmigungen</h2>
            <div className="event-list-grid">
              {allPending.map((event) => renderEventCard(event, true, true))}
            </div>
          </section>
        )}

        {allPending.length === 0 && (
          <section className="event-list-section">
            <h2>Ausstehende Genehmigungen</h2>
            <div className="event-list-empty-small">
              <p>Keine ausstehenden Events zur Genehmigung</p>
            </div>
          </section>
        )}

        <section className="event-list-section">
          <h2>Meine Events</h2>
          {myEvents.length === 0 ? (
            renderEmptyState(
              'Noch keine Events',
              'Erstelle dein erstes Event und teile es mit der Community.'
            )
          ) : (
            <div className="event-list-grid">
              {[...myEvents]
                .sort((a, b) => (a.status === 'pending' ? -1 : 1))
                .map((event) => renderEventCard(event, true))}
            </div>
          )}
        </section>

        <ConfirmDialog
          isOpen={Boolean(deleteId)}
          title="Event löschen"
          message="Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
          confirmLabel="Löschen"
          cancelLabel="Abbrechen"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />

        <RecurringDeleteDialog
          isOpen={Boolean(recurringDeleteTarget)}
          eventTitle={recurringDeleteTarget?.eventTitle}
          occurrenceDate={recurringDeleteTarget?.occurrenceDate}
          onDeleteThisOnly={handleDeleteRecurringThis}
          onDeleteThisAndFuture={handleDeleteRecurringThisAndFuture}
          onDeleteAll={handleDeleteRecurringAll}
          onCancel={() => setRecurringDeleteTarget(null)}
          loading={deleting}
        />

        <OccurrencePickerDialog
          isOpen={Boolean(pendingRecurringDelete)}
          event={pendingRecurringDelete?.event}
          initialOccurrenceDate={pendingRecurringDelete?.initialOccurrenceDate}
          onConfirm={handleOccurrenceConfirmed}
          onCancel={() => setPendingRecurringDelete(null)}
        />
      </div>
    );
  }

  return (
    <div className="event-list-page">
      <div className="event-list-header">
        <div>
          <h1>Meine Events</h1>
          <p>Verwalte deine Events</p>
        </div>
        <Link to="/admin/new" className="btn btn-primary">
          <PlusCircle size={18} />
          <span>Neues Event</span>
        </Link>
      </div>

      {events.length === 0 ? (
        renderEmptyState(
          'Noch keine Events',
          'Erstelle dein erstes Event und teile es mit der Community.'
        )
      ) : (
        <div className="event-list-grid">
          {[...events]
            .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
            .map((event) => renderEventCard(event, true))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Event löschen"
        message="Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <RecurringDeleteDialog
        isOpen={Boolean(recurringDeleteTarget)}
        eventTitle={recurringDeleteTarget?.eventTitle}
        occurrenceDate={recurringDeleteTarget?.occurrenceDate}
        onDeleteThisOnly={handleDeleteRecurringThis}
        onDeleteThisAndFuture={handleDeleteRecurringThisAndFuture}
        onDeleteAll={handleDeleteRecurringAll}
        onCancel={() => setRecurringDeleteTarget(null)}
        loading={deleting}
      />

      <OccurrencePickerDialog
        isOpen={Boolean(pendingRecurringDelete)}
        event={pendingRecurringDelete?.event}
        initialOccurrenceDate={pendingRecurringDelete?.initialOccurrenceDate}
        onConfirm={handleOccurrenceConfirmed}
        onCancel={() => setPendingRecurringDelete(null)}
      />
    </div>
  );
}
