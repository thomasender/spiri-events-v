import { useState } from 'react';
import { doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { ClipboardCheck } from 'lucide-react';
import { usePendingEvents } from '../hooks/useEvents';
import EventAdminListRow from './EventAdminListRow';
import ConfirmDialog from './ConfirmDialog';
import SuccessDialog from './SuccessDialog';

export default function ReviewTab() {
  const { pendingEvents, loading, approveEvent } = usePendingEvents();
  const [approvingId, setApprovingId] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [approveSuccess, setApproveSuccess] = useState(null);
  const [mutating, setMutating] = useState(false);

  const handleApprove = async (eventId) => {
    const target = pendingEvents.find((e) => e.id === eventId);
    setApprovingId(eventId);
    try {
      await approveEvent(eventId);
      setApproveSuccess(target ? { eventTitle: target.title } : null);
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApprovingId(null);
    }
  };

  const handleRevert = async () => {
    if (!revertTarget) return;
    setMutating(true);
    try {
      const db = getFirestore(getApp());
      const ref = doc(db, 'events', revertTarget.id);
      await updateDoc(ref, {
        status: 'draft',
        updatedAt: serverTimestamp(),
      });
      setRevertTarget(null);
    } catch (err) {
      console.error('Revert failed:', err);
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setMutating(true);
    try {
      const db = getFirestore(getApp());
      const ref = doc(db, 'events', deleteTarget.id);
      await updateDoc(ref, {
        status: 'trashed',
        trashedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setMutating(false);
    }
  };

  if (loading) {
    return <div className="loading-spinner"></div>;
  }

  if (pendingEvents.length === 0) {
    return (
      <div className="event-list-page">
        <div className="event-list-header">
          <div>
            <h1>Review</h1>
            <p>Hier landen alle Events, die auf deine Freigabe warten</p>
          </div>
        </div>

        <div className="event-list-empty" data-testid="review-empty-state">
          <div className="empty-icon">
            <ClipboardCheck size={48} />
          </div>
          <h2>Keine ausstehenden Events</h2>
          <p>
            Aktuell warten keine Events auf eine Freigabe. Sobald jemand ein neues Event einreicht,
            erscheint es hier zur Überprüfung.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="event-list-page">
      <div className="event-list-header">
        <div>
          <h1>Review</h1>
          <p>Hier landen alle Events, die auf deine Freigabe warten</p>
        </div>
      </div>

      <section className="event-list-section">
        <div className="event-list-section-header">
          <h2>
            {pendingEvents.length === 1
              ? '1 ausstehende Genehmigung'
              : `${pendingEvents.length} ausstehende Genehmigungen`}
          </h2>
        </div>
        <div className="event-list-rows">
          {pendingEvents.map((event) => (
            <div key={event.id}>
              <EventAdminListRow
                event={event}
                showStatus
                showApprove
                showRevert
                showDuplicate={false}
                fromPath="/admin?tab=review"
                isAdmin
                approving={approvingId}
                unreadCount={0}
                onApprove={handleApprove}
                onRevert={(evt) => setRevertTarget({ id: evt.id, eventTitle: evt.title })}
                onDeleteClick={(evt) => setDeleteTarget({ id: evt.id, eventTitle: evt.title })}
              />
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(revertTarget)}
        title="Event zurück zu Entwurf"
        message={
          revertTarget
            ? `Das Event „${revertTarget.eventTitle}" wird auf "Entwurf" zurückgesetzt. Die einreichende Person kann es danach erneut bearbeiten und einreichen.`
            : ''
        }
        confirmLabel="Zu Entwurf"
        cancelLabel="Abbrechen"
        onConfirm={handleRevert}
        onCancel={() => setRevertTarget(null)}
        loading={mutating}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="In Papierkorb verschieben"
        message={
          deleteTarget
            ? `Das Event „${deleteTarget.eventTitle}" wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht.`
            : ''
        }
        confirmLabel="In Papierkorb"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={mutating}
      />

      <SuccessDialog
        isOpen={Boolean(approveSuccess)}
        title="Event genehmigt"
        message={
          approveSuccess
            ? `„${approveSuccess.eventTitle}" wurde genehmigt und ist jetzt öffentlich sichtbar.`
            : ''
        }
        confirmLabel="Schließen"
        onConfirm={() => setApproveSuccess(null)}
      />
    </div>
  );
}
