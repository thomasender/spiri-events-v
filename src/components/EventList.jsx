import { Link, useNavigate } from 'react-router-dom';
import { useEvents, usePendingEvents } from '../hooks/useEvents';
import { useEventsWithMessages } from '../hooks/useEventsWithMessages';
import { useAuth } from '../hooks/useAuth';
import { PlusCircle, Calendar } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import OccurrencePickerDialog from './OccurrencePickerDialog';
import SuccessDialog from './SuccessDialog';
import EventAdminListRow from './EventAdminListRow';
import { useState, useMemo } from 'react';
import { arrayUnion } from 'firebase/firestore';
import { getNextUpcomingOccurrence } from '../utils/eventOccurrences';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
} from '../utils/customSeriesUpdates';
import './EventList.css';

const STATUS_FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'draft', label: 'Entwürfe' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'approved', label: 'Genehmigt' },
  { value: 'trashed', label: 'Papierkorb' },
];

export default function EventList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useAuth();
  const {
    events,
    loading,
    deleteEvent,
    updateEvent,
    submitForReview,
    revertToDraft,
    duplicateEvent,
  } = useEvents(user);
  const { pendingEvents, loading: pendingLoading, approveEvent } = usePendingEvents();
  const { unreadCountByEvent } = useEventsWithMessages();
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState(null);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusActionTarget, setStatusActionTarget] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [duplicateSuccess, setDuplicateSuccess] = useState(null);

  const isAdmin = role === 'Admin';

  const filteredEvents = useMemo(() => {
    let list = events.filter((e) => e.status !== 'trashed');
    if (isAdmin) {
      list = list.filter((e) => e.status !== 'draft');
    }
    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter);
    }
    return list;
  }, [events, statusFilter, isAdmin]);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const order = { pending: 0, draft: 1, approved: 2 };
      const aOrder = order[a.status] ?? 3;
      const bOrder = order[b.status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.date > b.date ? 1 : -1;
    });
  }, [filteredEvents]);

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

  const handleSubmitForReview = async () => {
    if (!statusActionTarget) return;
    try {
      await submitForReview(statusActionTarget.id);
    } catch (err) {
      console.error('Submit for review failed:', err);
    } finally {
      setStatusActionTarget(null);
    }
  };

  const handleRevertToDraft = async () => {
    if (!statusActionTarget) return;
    try {
      await revertToDraft(statusActionTarget.id);
    } catch (err) {
      console.error('Revert to draft failed:', err);
    } finally {
      setStatusActionTarget(null);
    }
  };

  const handleDuplicate = async (event) => {
    setDuplicatingId(event.id);
    try {
      await duplicateEvent(event.id);
      setDuplicateSuccess({ eventTitle: event.title });
    } catch (err) {
      console.error('Duplicate event failed:', err);
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDuplicateSuccessConfirm = () => {
    setDuplicateSuccess(null);
    navigate('/admin?tab=drafts');
  };

  const handleDeleteRecurringThis = async () => {
    if (!recurringDeleteTarget) return;
    const { id, occurrenceDate, event: targetEvent } = recurringDeleteTarget;
    setDeleting(true);
    try {
      if (targetEvent?.recurrence === 'custom') {
        await updateEvent(id, buildCustomDeleteOccurrenceUpdate(targetEvent, occurrenceDate));
      } else {
        await updateEvent(id, {
          exceptionDates: arrayUnion(occurrenceDate),
        });
      }
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring this failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRecurringThisAndFuture = async () => {
    if (!recurringDeleteTarget) return;
    const { id, occurrenceDate, event: targetEvent } = recurringDeleteTarget;
    setDeleting(true);
    try {
      if (targetEvent?.recurrence === 'custom') {
        await updateEvent(id, buildCustomDeleteFromDateUpdate(targetEvent, occurrenceDate));
      } else {
        const [year, month, day] = occurrenceDate.split('-');
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
        await updateEvent(id, {
          recurrenceEndDate: prevDateStr,
        });
      }
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
      event: pendingRecurringDelete.event,
    });
    setPendingRecurringDelete(null);
  };

  const handleRecurringDeleteChangeOccurrence = () => {
    if (!recurringDeleteTarget?.event) return;
    setPendingRecurringDelete({
      id: recurringDeleteTarget.id,
      event: recurringDeleteTarget.event,
      initialOccurrenceDate: recurringDeleteTarget.occurrenceDate,
    });
    setRecurringDeleteTarget(null);
  };

  if (loading || pendingLoading) {
    return <div className="loading-spinner"></div>;
  }

  const renderCard = (event, showStatus = false, showApprove = false) => {
    const isRecurring = event.recurrence && event.recurrence !== 'none';
    const onDeleteClick = (evt) => {
      if (isRecurring) {
        setPendingRecurringDelete({
          id: evt.id,
          event: evt,
          initialOccurrenceDate: evt.date,
        });
      } else {
        setDeleteId(evt.id);
      }
    };
    return (
      <EventAdminListRow
        event={event}
        showStatus={showStatus}
        showApprove={showApprove}
        showSubmit={event.status === 'draft'}
        showRevert={event.status === 'pending'}
        showDuplicate={event.status !== 'draft'}
        duplicating={duplicatingId === event.id}
        unreadCount={unreadCountByEvent[event.id] || 0}
        isAdmin={isAdmin}
        approving={approving}
        onApprove={handleApprove}
        onSubmit={(evt) => setStatusActionTarget({ id: evt.id, action: 'submit' })}
        onRevert={(evt) => setStatusActionTarget({ id: evt.id, action: 'revert' })}
        onDuplicate={handleDuplicate}
        onDeleteClick={onDeleteClick}
      />
    );
  };

  const renderEventsList = (eventsList, showStatus, showApprove) => (
    <div className="event-list-rows">
      {eventsList.map((event) => (
        <div key={event.id}>{renderCard(event, showStatus, showApprove)}</div>
      ))}
    </div>
  );

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

  const renderStatusFilter = () => (
    <div className="event-list-filters">
      <label htmlFor="status-filter" className="event-list-filter-label">
        Status:
      </label>
      <select
        id="status-filter"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="event-list-filter-select"
        data-testid="status-filter"
      >
        {STATUS_FILTERS.filter((f) => {
          if (isAdmin && f.value === 'draft') return false;
          return true;
        }).map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
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
            {renderEventsList(allPending, true, true)}
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
          <div className="event-list-section-header">
            <h2>Meine Events</h2>
            {renderStatusFilter()}
          </div>
          {sortedEvents.length === 0 ? (
            statusFilter === 'all' ? (
              renderEmptyState(
                'Noch keine Events',
                'Erstelle dein erstes Event und teile es mit der Community.'
              )
            ) : (
              <div className="event-list-empty-small">
                <p>Keine Events mit diesem Status</p>
              </div>
            )
          ) : (
            renderEventsList(sortedEvents, true)
          )}
        </section>

        <ConfirmDialog
          isOpen={Boolean(deleteId)}
          title="In Papierkorb verschieben"
          message="Das Event wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht. Du kannst es innerhalb dieser 30 Tage im Papierkorb wiederherstellen."
          confirmLabel="In Papierkorb"
          cancelLabel="Abbrechen"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />

        <ConfirmDialog
          isOpen={Boolean(statusActionTarget)}
          title={
            statusActionTarget?.action === 'submit'
              ? 'Event einreichen'
              : 'Event zu Entwurf zurückziehen'
          }
          message={
            statusActionTarget?.action === 'submit'
              ? 'Das Event wird zur Genehmigung eingereicht.'
              : 'Das Event wird auf "Entwurf" zurückgesetzt und ist nicht mehr öffentlich sichtbar. Du kannst es später erneut einreichen.'
          }
          confirmLabel={statusActionTarget?.action === 'submit' ? 'Einreichen' : 'Zu Entwurf'}
          cancelLabel="Abbrechen"
          onConfirm={
            statusActionTarget?.action === 'submit' ? handleSubmitForReview : handleRevertToDraft
          }
          onCancel={() => setStatusActionTarget(null)}
          loading={false}
        />

        <RecurringDeleteDialog
          isOpen={Boolean(recurringDeleteTarget)}
          eventTitle={recurringDeleteTarget?.eventTitle}
          occurrenceDate={recurringDeleteTarget?.occurrenceDate}
          onDeleteThisOnly={handleDeleteRecurringThis}
          onDeleteThisAndFuture={handleDeleteRecurringThisAndFuture}
          onDeleteAll={handleDeleteRecurringAll}
          onCancel={() => setRecurringDeleteTarget(null)}
          onChangeOccurrence={handleRecurringDeleteChangeOccurrence}
          loading={deleting}
        />

        <OccurrencePickerDialog
          isOpen={Boolean(pendingRecurringDelete)}
          event={pendingRecurringDelete?.event}
          initialOccurrenceDate={pendingRecurringDelete?.initialOccurrenceDate}
          onConfirm={handleOccurrenceConfirmed}
          onCancel={() => setPendingRecurringDelete(null)}
        />

        <SuccessDialog
          isOpen={Boolean(duplicateSuccess)}
          title="Duplikat erstellt"
          message={
            duplicateSuccess
              ? `Dein Event „${duplicateSuccess.eventTitle}” wurde erfolgreich dupliziert.`
              : ''
          }
          details="Du findest das Duplikat in deinen Entwürfen und kannst es dort weiter bearbeiten oder einreichen."
          confirmLabel="Zu den Entwürfen"
          onConfirm={handleDuplicateSuccessConfirm}
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

      <section className="event-list-section">
        <div className="event-list-section-header">
          <h2>Events</h2>
          {renderStatusFilter()}
        </div>
        {sortedEvents.length === 0 ? (
          statusFilter === 'all' ? (
            renderEmptyState(
              'Noch keine Events',
              'Erstelle dein erstes Event und teile es mit der Community.'
            )
          ) : (
            <div className="event-list-empty-small">
              <p>Keine Events mit diesem Status</p>
            </div>
          )
        ) : (
          renderEventsList(sortedEvents, true)
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="In Papierkorb verschieben"
        message="Das Event wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht. Du kannst es innerhalb dieser 30 Tage im Papierkorb wiederherstellen."
        confirmLabel="In Papierkorb"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <ConfirmDialog
        isOpen={Boolean(statusActionTarget)}
        title={
          statusActionTarget?.action === 'submit'
            ? 'Event einreichen'
            : 'Event zu Entwurf zurückziehen'
        }
        message={
          statusActionTarget?.action === 'submit'
            ? 'Das Event wird zur Genehmigung eingereicht. Nach der Einreichung kann es nicht mehr bearbeitet werden, bis ein Admin es bearbeitet.'
            : 'Das Event wird auf "Entwurf" zurückgesetzt und ist nicht mehr öffentlich sichtbar. Du kannst es später erneut einreichen.'
        }
        confirmLabel={statusActionTarget?.action === 'submit' ? 'Einreichen' : 'Zu Entwurf'}
        cancelLabel="Abbrechen"
        onConfirm={
          statusActionTarget?.action === 'submit' ? handleSubmitForReview : handleRevertToDraft
        }
        onCancel={() => setStatusActionTarget(null)}
        loading={false}
      />

      <RecurringDeleteDialog
        isOpen={Boolean(recurringDeleteTarget)}
        eventTitle={recurringDeleteTarget?.eventTitle}
        occurrenceDate={recurringDeleteTarget?.occurrenceDate}
        onDeleteThisOnly={handleDeleteRecurringThis}
        onDeleteThisAndFuture={handleDeleteRecurringThisAndFuture}
        onDeleteAll={handleDeleteRecurringAll}
        onCancel={() => setRecurringDeleteTarget(null)}
        onChangeOccurrence={handleRecurringDeleteChangeOccurrence}
        loading={deleting}
      />

      <OccurrencePickerDialog
        isOpen={Boolean(pendingRecurringDelete)}
        event={pendingRecurringDelete?.event}
        initialOccurrenceDate={pendingRecurringDelete?.initialOccurrenceDate}
        onConfirm={handleOccurrenceConfirmed}
        onCancel={() => setPendingRecurringDelete(null)}
      />

      <SuccessDialog
        isOpen={Boolean(duplicateSuccess)}
        title="Duplikat erstellt"
        message={
          duplicateSuccess
            ? `Dein Event „${duplicateSuccess.eventTitle}” wurde erfolgreich dupliziert.`
            : ''
        }
        details="Du findest das Duplikat in deinen Entwürfen und kannst es dort weiter bearbeiten oder einreichen."
        confirmLabel="Zu den Entwürfen"
        onConfirm={handleDuplicateSuccessConfirm}
      />
    </div>
  );
}
