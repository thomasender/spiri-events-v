import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  getDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deleteImageByUrl } from '../lib/imageUpload';
import { useTrashedEvents } from '../hooks/useTrashedEvents';
import { useAuth } from '../hooks/useAuth';
import ConfirmDialog from './ConfirmDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import OccurrencePickerDialog from './OccurrencePickerDialog';
import EventAdminListRow from './EventAdminListRow';
import { getNextUpcomingOccurrence } from '../utils/eventOccurrences';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
} from '../utils/customSeriesUpdates';

async function refreshToken() {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
}

async function restoreEventById(id) {
  await refreshToken();
  const ref = doc(db, 'events', id);
  await updateDoc(ref, {
    status: 'draft',
    trashedAt: null,
    updatedAt: serverTimestamp(),
  });
}

async function permanentDeleteEventById(id) {
  await refreshToken();
  const ref = doc(db, 'events', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const eventData = snap.data();
  if (eventData.imageUrl) {
    await deleteImageByUrl(eventData.imageUrl);
  }
  const messagesRef = collection(db, 'events', id, 'messages');
  const messagesSnapshot = await getDocs(messagesRef);
  await Promise.all(messagesSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
  await deleteDoc(ref);
}

export default function TrashTab() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const { events: trashedEvents, loading } = useTrashedEvents(isAdmin);

  const [restoreId, setRestoreId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [permanentDeleteId, setPermanentDeleteId] = useState(null);
  const [permanentDeleting, setPermanentDeleting] = useState(false);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState(null);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState(null);

  const handleRestore = async () => {
    if (!restoreId) return;
    setRestoring(true);
    try {
      await restoreEventById(restoreId);
      setRestoreId(null);
    } catch (err) {
      console.error('Restore failed:', err);
    } finally {
      setRestoring(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    setPermanentDeleting(true);
    try {
      await permanentDeleteEventById(permanentDeleteId);
      setPermanentDeleteId(null);
    } catch (err) {
      console.error('Permanent delete failed:', err);
    } finally {
      setPermanentDeleting(false);
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
    setPermanentDeleting(true);
    try {
      await refreshToken();
      const ref = doc(db, 'events', id);
      if (targetEvent?.recurrence === 'custom') {
        await updateDoc(ref, buildCustomDeleteOccurrenceUpdate(targetEvent, occurrenceDate));
      } else {
        await updateDoc(ref, {
          exceptionDates: arrayUnion(occurrenceDate),
        });
      }
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring this failed:', err);
    } finally {
      setPermanentDeleting(false);
    }
  };

  const handleDeleteRecurringThisAndFuture = async () => {
    if (!recurringDeleteTarget) return;
    const { id, occurrenceDate, event: targetEvent } = recurringDeleteTarget;
    setPermanentDeleting(true);
    try {
      await refreshToken();
      const ref = doc(db, 'events', id);
      if (targetEvent?.recurrence === 'custom') {
        await updateDoc(ref, buildCustomDeleteFromDateUpdate(targetEvent, occurrenceDate));
      } else {
        const [year, month, day] = occurrenceDate.split('-');
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
        await updateDoc(ref, {
          recurrenceEndDate: prevDateStr,
        });
      }
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring this and future failed:', err);
    } finally {
      setPermanentDeleting(false);
    }
  };

  const handleDeleteRecurringAll = async () => {
    if (!recurringDeleteTarget) return;
    const { id } = recurringDeleteTarget;
    setPermanentDeleting(true);
    try {
      await permanentDeleteEventById(id);
      setRecurringDeleteTarget(null);
    } catch (err) {
      console.error('Delete recurring all failed:', err);
    } finally {
      setPermanentDeleting(false);
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

  if (trashedEvents.length === 0) {
    return (
      <div className="event-list-page">
        <div className="event-list-header">
          <div>
            <h1>Papierkorb</h1>
            <p>Hier landen Events, die du gelöscht hast</p>
          </div>
        </div>

        <div className="event-list-empty" data-testid="trash-empty-state">
          <div className="empty-icon">
            <Trash2 size={48} />
          </div>
          <h2>Papierkorb ist leer</h2>
          <p>
            Gelöschte Events bleiben 30 Tage im Papierkorb und werden danach endgültig entfernt. In
            dieser Zeit kannst du sie hier wiederherstellen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="event-list-page">
      <div className="event-list-header">
        <div>
          <h1>Papierkorb</h1>
          <p>
            {isAdmin
              ? 'Alle gelöschten Events. Sie werden nach 30 Tagen endgültig entfernt.'
              : 'Deine gelöschten Events. Sie werden nach 30 Tagen endgültig entfernt.'}
          </p>
        </div>
      </div>

      <section className="event-list-section">
        <div className="event-list-section-header">
          <h2>
            {trashedEvents.length === 1
              ? '1 Event im Papierkorb'
              : `${trashedEvents.length} Events im Papierkorb`}
          </h2>
        </div>
        <div className="event-list-rows">
          {trashedEvents.map((event) => {
            const isRecurring = event.recurrence && event.recurrence !== 'none';
            const onPermanentDeleteClick = (evt) => {
              if (isRecurring) {
                openRecurringDelete(evt);
              } else {
                setPermanentDeleteId(evt.id);
              }
            };
            return (
              <div key={event.id} data-testid={`trash-event-card-${event.id}`}>
                <EventAdminListRow
                  event={event}
                  showStatus
                  showTrashedAt
                  fromPath="/admin?tab=trash"
                  onRestore={(evt) => setRestoreId(evt.id)}
                  onPermanentDelete={onPermanentDeleteClick}
                />
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(restoreId)}
        title="Event wiederherstellen"
        message="Das Event wird wieder als Entwurf in deiner Verwaltung angezeigt. Du kannst es danach bearbeiten und erneut einreichen."
        confirmLabel="Wiederherstellen"
        cancelLabel="Abbrechen"
        onConfirm={handleRestore}
        onCancel={() => setRestoreId(null)}
        loading={restoring}
      />

      <ConfirmDialog
        isOpen={Boolean(permanentDeleteId)}
        title="Event endgültig löschen"
        message={
          <span>
            <AlertTriangle
              size={16}
              style={{ verticalAlign: 'middle', marginRight: 6 }}
              aria-hidden="true"
            />
            Dieses Event wird sofort und unwiderruflich aus der Datenbank entfernt — inklusive Bild
            und Nachrichten. Bist du sicher?
          </span>
        }
        confirmLabel="Endgültig löschen"
        cancelLabel="Abbrechen"
        onConfirm={handlePermanentDelete}
        onCancel={() => setPermanentDeleteId(null)}
        loading={permanentDeleting}
        danger
      />

      <RecurringDeleteDialog
        isOpen={Boolean(recurringDeleteTarget)}
        eventTitle={recurringDeleteTarget?.eventTitle}
        occurrenceDate={recurringDeleteTarget?.occurrenceDate}
        onDeleteThisOnly={handleDeleteRecurringThis}
        onDeleteThisAndFuture={handleDeleteRecurringThisAndFuture}
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
        loading={permanentDeleting}
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
