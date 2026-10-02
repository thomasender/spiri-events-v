import { useMemo, useState } from 'react';
import { doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { ClipboardCheck, Inbox, MessageCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { usePendingEvents, useAllEvents } from '../hooks/useEvents';
import { useEventsWithMessages } from '../hooks/useEventsWithMessages';
import { useUserDisplayNames } from '../hooks/useUserDisplayNames';
import EventAdminListRow from './EventAdminListRow';
import ConfirmDialog from './ConfirmDialog';
import SuccessDialog from './SuccessDialog';
import './ReviewTab.css';

const APPROVED_WINDOW_DAYS = 7;

function getApprovedAtMillis(value) {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (typeof value === 'number') return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function CollapseToggle({ id, open, onToggle, testId, children }) {
  return (
    <button
      type="button"
      className="review-toggle"
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
      data-testid={testId}
    >
      {children}
      <ChevronDown
        size={18}
        aria-hidden="true"
        className={`review-toggle-chevron${open ? ' is-open' : ''}`}
      />
    </button>
  );
}

export default function ReviewTab() {
  const { pendingEvents, loading: pendingLoading, approveEvent } = usePendingEvents();
  const { events: allApprovedEvents, loading: approvedLoading } = useAllEvents();
  const { unreadCountByEvent, hasMessagesByEvent, inKlaerungAuthorNameByEvent } =
    useEventsWithMessages();

  const [approvingId, setApprovingId] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [approveSuccess, setApproveSuccess] = useState(null);
  const [mutating, setMutating] = useState(false);
  // Pending (needs action) and "In Klärung" start open; the approved history starts closed.
  const [openSections, setOpenSections] = useState({
    pending: true,
    klaerung: true,
    approved: false,
  });
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const recentlyApproved = useMemo(() => {
    // Reading Date.now() during render is intentional — we want the rolling
    // 7-day window to track real time, not a value captured at mount. The
    // review tab refreshes whenever the approved-events snapshot does, so
    // the cutoff stays current without any state plumbing.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - APPROVED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return allApprovedEvents
      .map((event) => ({ event, approvedAtMs: getApprovedAtMillis(event.approvedAt) }))
      .filter(({ approvedAtMs }) => approvedAtMs != null && approvedAtMs >= cutoff)
      .sort((a, b) => b.approvedAtMs - a.approvedAtMs)
      .map(({ event }) => event);
  }, [allApprovedEvents]);

  const { pendingInKlaerung, pendingNeu } = useMemo(() => {
    const inK = [];
    const neu = [];
    pendingEvents.forEach((event) => {
      if (hasMessagesByEvent[event.id]) {
        inK.push(event);
      } else {
        neu.push(event);
      }
    });
    return { pendingInKlaerung: inK, pendingNeu: neu };
  }, [pendingEvents, hasMessagesByEvent]);

  const reviewerUids = useMemo(() => {
    const uids = new Set();
    recentlyApproved.forEach((event) => {
      if (event.approvedBy) uids.add(event.approvedBy);
    });
    return Array.from(uids);
  }, [recentlyApproved]);

  const { namesByUid } = useUserDisplayNames(reviewerUids);

  if (pendingLoading || approvedLoading) {
    return <div className="loading-spinner"></div>;
  }

  const hasAnyContent = pendingEvents.length > 0 || recentlyApproved.length > 0;

  if (!hasAnyContent) {
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

      {pendingEvents.length > 0 && (
        <section
          className="review-section review-section--pending"
          data-testid="review-section-pending"
        >
          <div className="review-section-header">
            <h2 className="review-section-title">
              <CollapseToggle
                id="review-section-pending-body"
                open={openSections.pending}
                onToggle={() => toggleSection('pending')}
                testId="review-toggle-pending"
              >
                <Inbox size={20} aria-hidden="true" />
                <span>Wartend auf Genehmigung</span>
                <span className="review-section-count" data-testid="review-section-pending-count">
                  {pendingEvents.length}
                </span>
              </CollapseToggle>
            </h2>
            <p className="review-section-hint">Events, die das Team noch entscheiden muss.</p>
          </div>

          <div id="review-section-pending-body" hidden={!openSections.pending}>
            <div className="review-subsection" data-testid="review-subsection-neu-block">
              <h3 className="review-subsection-title" data-testid="review-subsection-neu">
                Neu eingereicht
                <span className="review-subsection-count" data-testid="review-subsection-neu-count">
                  {pendingNeu.length}
                </span>
              </h3>
              {pendingNeu.length === 0 ? (
                <p className="review-subsection-empty">Aktuell keine neuen Einreichungen.</p>
              ) : (
                <div className="event-list-rows">
                  {pendingNeu.map((event) => (
                    <div key={event.id}>
                      <EventAdminListRow
                        event={event}
                        showStatus
                        showApprove
                        showRevert
                        showDuplicate={false}
                        showSubmittedAt
                        fromPath="/admin?tab=review"
                        isAdmin
                        approving={approvingId}
                        unreadCount={unreadCountByEvent[event.id] || 0}
                        hasMessages={Boolean(hasMessagesByEvent[event.id])}
                        onApprove={handleApprove}
                        onRevert={(evt) => setRevertTarget({ id: evt.id, eventTitle: evt.title })}
                        onDeleteClick={(evt) =>
                          setDeleteTarget({ id: evt.id, eventTitle: evt.title })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pendingInKlaerung.length > 0 && (
              <div className="review-subsection" data-testid="review-subsection-klaerung-block">
                <h3
                  className="review-subsection-title review-subsection-title--klaerung"
                  data-testid="review-subsection-klaerung"
                >
                  <CollapseToggle
                    id="review-subsection-klaerung-body"
                    open={openSections.klaerung}
                    onToggle={() => toggleSection('klaerung')}
                    testId="review-toggle-klaerung"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    <span>In Klärung</span>
                    <span
                      className="review-subsection-count"
                      data-testid="review-subsection-klaerung-count"
                    >
                      {pendingInKlaerung.length}
                    </span>
                  </CollapseToggle>
                </h3>
                <div id="review-subsection-klaerung-body" hidden={!openSections.klaerung}>
                  <p className="review-subsection-hint">
                    Hier hat das Team dem Ersteller schon eine Rückfrage geschickt. Bitte nicht ohne
                    Rücksprache erneut entscheiden.
                  </p>
                  <div className="event-list-rows">
                    {pendingInKlaerung.map((event) => (
                      <div key={event.id}>
                        <EventAdminListRow
                          event={event}
                          showStatus
                          showApprove
                          showRevert
                          showDuplicate={false}
                          showSubmittedAt
                          showInKlaerungBy
                          inKlaerungByName={inKlaerungAuthorNameByEvent[event.id] || null}
                          fromPath="/admin?tab=review"
                          isAdmin
                          approving={approvingId}
                          unreadCount={unreadCountByEvent[event.id] || 0}
                          hasMessages={Boolean(hasMessagesByEvent[event.id])}
                          onApprove={handleApprove}
                          onRevert={(evt) => setRevertTarget({ id: evt.id, eventTitle: evt.title })}
                          onDeleteClick={(evt) =>
                            setDeleteTarget({ id: evt.id, eventTitle: evt.title })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {recentlyApproved.length > 0 && (
        <section
          className="review-section review-section--approved"
          data-testid="review-section-approved"
        >
          <div className="review-section-header">
            <h2 className="review-section-title">
              <CollapseToggle
                id="review-section-approved-body"
                open={openSections.approved}
                onToggle={() => toggleSection('approved')}
                testId="review-toggle-approved"
              >
                <CheckCircle2 size={20} aria-hidden="true" />
                <span>{`Genehmigt in den letzten ${APPROVED_WINDOW_DAYS} Tagen`}</span>
                <span className="review-section-count" data-testid="review-section-approved-count">
                  {recentlyApproved.length}
                </span>
              </CollapseToggle>
            </h2>
            <p className="review-section-hint">
              Zur Übersicht, wer im Team was wann freigegeben hat.
            </p>
          </div>
          <div
            id="review-section-approved-body"
            className="event-list-rows"
            hidden={!openSections.approved}
          >
            {recentlyApproved.map((event) => (
              <div key={event.id}>
                <EventAdminListRow
                  event={event}
                  showStatus
                  showDuplicate={false}
                  showApprovedBy
                  approvedByName={namesByUid[event.approvedBy] || null}
                  fromPath="/admin?tab=review"
                  isAdmin
                  onDeleteClick={(evt) => setDeleteTarget({ id: evt.id, eventTitle: evt.title })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

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
