import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { PlusCircle, FileText } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import EventAdminCard from './EventAdminCard';
import ConfirmDialog from './ConfirmDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import OccurrencePickerDialog from './OccurrencePickerDialog';
import { arrayUnion } from 'firebase/firestore';
import { getNextUpcomingOccurrence } from '../utils/eventOccurrences';
import { buildCustomDeleteOccurrenceUpdate } from '../utils/customSeriesUpdates';

export default function DraftsTab() {
  const { user } = useAuth();
  const { events, loading, deleteEvent, updateEvent, submitForReview, duplicateEvent } =
    useEvents(user);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusActionTarget, setStatusActionTarget] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState(null);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState(null);

  const drafts = useMemo(() => {
    return events.filter((e) => e.status === 'draft').sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [events]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteId);
      setDeleteId(null);
    } catch (err) {
      console.error('Draft delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!statusActionTarget) return;
    try {
      await submitForReview(statusActionTarget.id);
    } catch (err) {
      console.error('Submit draft failed:', err);
    } finally {
      setStatusActionTarget(null);
    }
  };

  const handleDuplicate = async (event) => {
    setDuplicatingId(event.id);
    try {
      await duplicateEvent(event.id);
    } catch (err) {
      console.error('Duplicate draft failed:', err);
    } finally {
      setDuplicatingId(null);
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

  if (loading) {
    return <div className="loading-spinner"></div>;
  }

  const renderDraftCard = (event) => {
    const isRecurring = event.recurrence && event.recurrence !== 'none';
    const onDeleteClick = (evt) => {
      if (isRecurring) {
        openRecurringDelete(evt);
      } else {
        setDeleteId(evt.id);
      }
    };
    return (
      <EventAdminCard
        event={event}
        showStatus
        showSubmit
        showDuplicate
        duplicating={duplicatingId === event.id}
        onSubmit={(evt) => setStatusActionTarget({ id: evt.id, action: 'submit' })}
        onDuplicate={handleDuplicate}
        onDeleteClick={onDeleteClick}
      />
    );
  };

  if (drafts.length === 0) {
    return (
      <div className="event-list-page">
        <div className="event-list-header">
          <div>
            <h1>Entwürfe</h1>
            <p>Verwalte deine noch nicht eingereichten Events</p>
          </div>
          <Link to="/admin/new" className="btn btn-primary">
            <PlusCircle size={18} />
            <span>Neues Event</span>
          </Link>
        </div>

        <div className="event-list-empty" data-testid="drafts-empty-state">
          <div className="empty-icon">
            <FileText size={48} />
          </div>
          <h2>Keine Entwürfe</h2>
          <p>
            Hier landen alle Events, die du als Entwurf gespeichert, aber noch nicht zur Genehmigung
            eingereicht hast. Du kannst sie hier duplizieren, weiter bearbeiten oder einreichen.
          </p>
          <Link to="/admin/new" className="btn btn-primary">
            <PlusCircle size={18} />
            <span>Event erstellen</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="event-list-page">
      <div className="event-list-header">
        <div>
          <h1>Entwürfe</h1>
          <p>Verwalte deine noch nicht eingereichten Events</p>
        </div>
        <Link to="/admin/new" className="btn btn-primary">
          <PlusCircle size={18} />
          <span>Neues Event</span>
        </Link>
      </div>

      <section className="event-list-section">
        <div className="event-list-section-header">
          <h2>{drafts.length === 1 ? '1 Entwurf' : `${drafts.length} Entwürfe`}</h2>
        </div>
        <div className="event-list-grid">
          {drafts.map((event) => (
            <div key={event.id}>{renderDraftCard(event)}</div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Entwurf löschen"
        message="Möchtest du diesen Entwurf wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <ConfirmDialog
        isOpen={Boolean(statusActionTarget)}
        title="Entwurf einreichen"
        message="Der Entwurf wird zur Genehmigung eingereicht. Nach der Einreichung kann er nicht mehr bearbeitet werden, bis ein Admin ihn bearbeitet."
        confirmLabel="Einreichen"
        cancelLabel="Abbrechen"
        onConfirm={handleSubmitForReview}
        onCancel={() => setStatusActionTarget(null)}
        loading={false}
      />

      <RecurringDeleteDialog
        isOpen={Boolean(recurringDeleteTarget)}
        eventTitle={recurringDeleteTarget?.eventTitle}
        occurrenceDate={recurringDeleteTarget?.occurrenceDate}
        onDeleteThisOnly={handleDeleteRecurringThis}
        onDeleteThisAndFuture={handleDeleteRecurringThis}
        onDeleteAll={handleDeleteRecurringAll}
        onCancel={() => setRecurringDeleteTarget(null)}
        onChangeOccurrence={() => {
          if (!recurringDeleteTarget?.event) return;
          setPendingRecurringDelete({
            id: recurringDeleteTarget.id,
            event: recurringDeleteTarget.event,
            initialOccurrenceDate: recurringDeleteTarget.occurrenceDate,
          });
          setRecurringDeleteTarget(null);
        }}
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
