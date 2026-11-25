import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  ClipboardCheck,
  Inbox,
  MessageCircle,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react';
import { useRegionLabels } from '../hooks/useRegionLabels';
import { usePendingEvents, useAllEvents } from '../hooks/useEvents';
import { useEventsWithMessages } from '../hooks/useEventsWithMessages';
import { useUserDisplayNames } from '../hooks/useUserDisplayNames';
import { useAuth } from '../hooks/useAuth';
import { useAdminAlerts } from '../hooks/useAdminAlerts';
import { requiresDeleteReason } from '../utils/eventPermissions';
import { getStaffAccess } from '../utils/staffRoles';
import { resolveRegionId } from '../utils/regions';
import { buildRejectUpdate, buildTrashUpdate } from '../utils/trashUpdates';
import { rejectionReasonFromMessage } from '../utils/rejectionTemplates';
import EventAdminListRow from './EventAdminListRow';
import {
  NO_CONSENT_APPROVE_MESSAGE,
  approveBlockedReason,
  isCuratedEvent,
  isCuratedWithoutConsent,
  isUnclaimedCuratedEvent,
} from '../utils/eventImport';
import AdminCoverPreview from './AdminCoverPreview';
import { AdminInstagramPreview } from './InstagramPostPreview';
import ConfirmDialog from './ConfirmDialog';
import SuccessDialog from './SuccessDialog';
import ModerationGuidanceNotice from './ModerationGuidanceNotice';
import ReviewImportAwaiting from './ReviewImportAwaiting';
import ReviewInstagramOutdated from './ReviewInstagramOutdated';
import { useOutdatedInstagramPosts } from '../hooks/useInstagramAdmin';
import { useAllImportOrganizers } from '../hooks/useImportData';
import './ReviewTab.css';

const APPROVED_WINDOW_DAYS = 7;

function regionNames(ids, nameOf) {
  const names = ids.map((id) => nameOf(id));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

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

const REGION_FILTER_KEY = 'review:regionFilter';

function readStoredRegionFilter() {
  try {
    return sessionStorage.getItem(REGION_FILTER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

/**
 * "Bild prüfen" under a pending row: opens the cover crop and, when the
 * organizer enabled the Instagram post, the Instagram crop, so admins can
 * check and adjust both before approving. The pending list is a live
 * snapshot, so a saved crop shows up in the row without extra state.
 */
function ReviewImageCheck({ event }) {
  const [open, setOpen] = useState(false);
  if (!event.imageUrl) return null;
  const bodyId = `review-image-check-${event.id}`;
  return (
    <div className="review-image-check">
      <button
        type="button"
        className="btn btn-secondary btn-sm review-image-check-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        data-testid={`review-image-check-toggle-${event.id}`}
      >
        <ImageIcon size={14} aria-hidden="true" />
        Bild prüfen
      </button>
      {open && (
        <div id={bodyId} data-testid={`review-image-check-${event.id}`}>
          <AdminCoverPreview event={event} isAdmin />
          <AdminInstagramPreview event={event} isAdmin />
        </div>
      )}
    </div>
  );
}

// Badges for imported (curated) events; rendered inside the card, next to the other badges.
function CurationBadges({ event }) {
  if (!isCuratedEvent(event)) return null;
  return (
    <span className="review-curation-badges" data-testid={`review-curation-${event.id}`}>
      <span className="badge">importiert</span>
      {isCuratedWithoutConsent(event) && <span className="badge">ohne Consent</span>}
    </span>
  );
}

const NO_CONSENT_MESSAGE = NO_CONSENT_APPROVE_MESSAGE;

export default function ReviewTab() {
  const { user, role, staffRegionIds } = useAuth();
  const { labelFor, nameOf, regions } = useRegionLabels();
  const [storedRegionFilter, setStoredRegionFilter] = useState(readStoredRegionFilter);
  const access = useMemo(() => getStaffAccess(role, staffRegionIds), [role, staffRegionIds]);
  const moderatorRegionKey = access.isRegionModerator ? access.moderatorRegionIds.join(',') : '';
  // Super-Admins may edit any event; a Regions-Moderator:in only reviews
  // (the rules forbid her content edits), so she gets no edit link on
  // other people's events.
  const canEdit = (evt) => access.isSuperAdmin || evt.createdBy === user?.uid;
  const {
    pendingEvents: allPendingEvents,
    loading: pendingLoading,
    approveEvent,
  } = usePendingEvents();
  // Imported events still waiting for the organizer's consent get their own section: the team
  // cannot decide them (docs/event-import.md).
  const pendingEvents = useMemo(
    () => allPendingEvents.filter((e) => !isCuratedWithoutConsent(e)),
    [allPendingEvents]
  );
  const awaitingOrganizer = useMemo(
    () => allPendingEvents.filter((e) => isCuratedWithoutConsent(e)),
    [allPendingEvents]
  );
  const organizerDocs = useAllImportOrganizers(access.isSuperAdmin && awaitingOrganizer.length > 0);
  const organizersById = useMemo(
    () => Object.fromEntries(organizerDocs.items.map((o) => [o.id, o])),
    [organizerDocs.items]
  );
  const { events: allApprovedEvents, loading: approvedLoading } = useAllEvents();
  const {
    unreadCountByEvent,
    hasMessagesByEvent,
    inKlaerungAuthorNameByEvent,
    lastStaffMessageByEvent = {},
  } = useEventsWithMessages();

  // Region filter: only for staff who can see more than one region (a
  // Super-Admin: every region that is active or has items; a moderator: hers).
  const regionOptions = useMemo(() => {
    const counts = {};
    const importCounts = {};
    pendingEvents.forEach((event) => {
      const id = resolveRegionId(event);
      counts[id] = (counts[id] || 0) + 1;
    });
    awaitingOrganizer.forEach((event) => {
      const id = resolveRegionId(event);
      importCounts[id] = (importCounts[id] || 0) + 1;
    });
    let ids;
    if (access.isRegionModerator) {
      ids = access.moderatorRegionIds;
    } else {
      const withItems = new Set([
        ...Object.keys(counts),
        ...Object.keys(importCounts),
        ...allApprovedEvents.map((e) => resolveRegionId(e)),
      ]);
      ids = regions.filter((r) => r.active || withItems.has(r.id)).map((r) => r.id);
      withItems.forEach((id) => {
        if (!ids.includes(id)) ids.push(id);
      });
    }
    return ids.map((id) => ({
      id,
      name: nameOf(id),
      count: counts[id] || 0,
      importCount: importCounts[id] || 0,
    }));
  }, [access, pendingEvents, awaitingOrganizer, allApprovedEvents, regions, nameOf]);
  const showRegionFilter = regionOptions.length > 1;
  const regionFilter =
    showRegionFilter && regionOptions.some((o) => o.id === storedRegionFilter)
      ? storedRegionFilter
      : 'all';
  const onRegionFilterChange = (value) => {
    setStoredRegionFilter(value);
    try {
      sessionStorage.setItem(REGION_FILTER_KEY, value);
    } catch {
      // storage unavailable: the choice just is not remembered
    }
  };
  const inFilter = (event) => regionFilter === 'all' || resolveRegionId(event) === regionFilter;
  const { unreadByEvent: editAlerts, markRead: markAlertRead } = useAdminAlerts(user?.uid, true);
  // Published Instagram posts of edited events (Trello 6af4ca87): a Super-Admin reads all,
  // a moderator those of her regions.
  const outdatedPosts = useOutdatedInstagramPosts(access.isStaff, moderatorRegionKey || null);

  const [approvingId, setApprovingId] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [approveSuccess, setApproveSuccess] = useState(null);
  const [approveError, setApproveError] = useState(null);
  const [mutating, setMutating] = useState(false);
  // Pending (needs action) and "In Klärung" start open; the approved history starts closed.
  const [openSections, setOpenSections] = useState({
    pending: true,
    klaerung: true,
    approved: false,
    importAwaiting: false,
    instagram: true,
  });
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleApprove = async (eventId) => {
    const target = pendingEvents.find((e) => e.id === eventId);
    setApproveError(null);
    if (target && isCuratedWithoutConsent(target)) {
      setApproveError(NO_CONSENT_MESSAGE);
      return;
    }
    setApprovingId(eventId);
    try {
      await approveEvent(eventId);
      markAlertRead(eventId).catch(() => {});
      setApproveSuccess(target ? { eventTitle: target.title } : null);
    } catch (err) {
      console.error('Approve failed:', err);
      setApproveError(
        err?.code === 'permission-denied' && target && isCuratedEvent(target)
          ? NO_CONSENT_MESSAGE
          : 'Das Event konnte nicht genehmigt werden. Bitte versuche es noch einmal.'
      );
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
      markAlertRead(revertTarget.id).catch(() => {});
      setRevertTarget(null);
    } catch (err) {
      console.error('Revert failed:', err);
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async (reason) => {
    if (!deleteTarget) return;
    setMutating(true);
    try {
      const db = getFirestore(getApp());
      const ref = doc(db, 'events', deleteTarget.id);
      await updateDoc(ref, buildTrashUpdate(user?.uid, reason));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setMutating(false);
    }
  };

  // Rejecting needs a reason: the newest staff message in the event's thread.
  // It is read when the dialog opens and goes into the owner's mail.
  const openReject = (evt) =>
    setRejectTarget({
      id: evt.id,
      eventTitle: evt.title,
      eventPath: `/event/${evt.slug || evt.id}`,
      // Unclaimed curated events have no organizer to mail: no reason needed,
      // and the backend sends nothing (docs/event-import.md).
      internal: isUnclaimedCuratedEvent(evt),
      reason: isUnclaimedCuratedEvent(evt)
        ? ''
        : rejectionReasonFromMessage(lastStaffMessageByEvent[evt.id]?.text),
    });

  const handleReject = async () => {
    if (!rejectTarget || (!rejectTarget.reason && !rejectTarget.internal)) return;
    setMutating(true);
    try {
      const db = getFirestore(getApp());
      const ref = doc(db, 'events', rejectTarget.id);
      await updateDoc(ref, buildRejectUpdate(user?.uid, rejectTarget.reason));
      markAlertRead(rejectTarget.id).catch(() => {});
      setRejectTarget(null);
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setMutating(false);
    }
  };

  // Only someone else's pending event; an own event is simply deleted.
  const canReject = (evt) => evt.status === 'pending' && evt.createdBy !== user?.uid;

  const openDelete = (evt) =>
    setDeleteTarget({
      id: evt.id,
      eventTitle: evt.title,
      reasonRequired: requiresDeleteReason(user, evt, role, staffRegionIds),
      internal: isUnclaimedCuratedEvent(evt),
    });

  const recentlyApproved = useMemo(() => {
    // Reading Date.now() during render is intentional — we want the rolling
    // 7-day window to track real time, not a value captured at mount. The
    // review tab refreshes whenever the approved-events snapshot does, so
    // the cutoff stays current without any state plumbing.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - APPROVED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const regionIds = moderatorRegionKey ? moderatorRegionKey.split(',') : null;
    return allApprovedEvents
      .filter((event) => !regionIds || regionIds.includes(resolveRegionId(event)))
      .filter(inFilter)
      .map((event) => ({ event, approvedAtMs: getApprovedAtMillis(event.approvedAt) }))
      .filter(({ approvedAtMs }) => approvedAtMs != null && approvedAtMs >= cutoff)
      .sort((a, b) => b.approvedAtMs - a.approvedAtMs)
      .map(({ event }) => event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allApprovedEvents, moderatorRegionKey, regionFilter]);

  const { pendingInKlaerung, pendingNeu } = useMemo(() => {
    const inK = [];
    const neu = [];
    pendingEvents.filter(inFilter).forEach((event) => {
      if (hasMessagesByEvent[event.id]) {
        inK.push(event);
      } else {
        neu.push(event);
      }
    });
    return { pendingInKlaerung: inK, pendingNeu: neu };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEvents, hasMessagesByEvent, regionFilter]);

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

  const subtitle = access.isRegionModerator
    ? `Hier landen die Events aus ${regionNames(access.moderatorRegionIds, nameOf)}, die auf deine Freigabe warten`
    : 'Hier landen alle Events, die auf deine Freigabe warten';

  const pendingShown = pendingInKlaerung.length + pendingNeu.length;
  const awaitingShown = awaitingOrganizer.filter(inFilter);
  const outdatedShown = outdatedPosts.filter(
    (post) => regionFilter === 'all' || post.regionId === regionFilter
  );
  const hasAnyContent =
    allPendingEvents.length > 0 ||
    recentlyApproved.length > 0 ||
    outdatedPosts.length > 0 ||
    regionFilter !== 'all';

  if (!hasAnyContent) {
    return (
      <div className="event-list-page">
        <div className="event-list-header">
          <div>
            <h1>Review</h1>
            <p>{subtitle}</p>
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
          <p>{subtitle}</p>
        </div>
      </div>

      {pendingEvents.length > 0 && <ModerationGuidanceNotice />}
      {approveError && (
        <p className="review-approve-error" role="alert" data-testid="review-approve-error">
          {approveError}
        </p>
      )}

      {showRegionFilter && (
        <div className="review-region-filter">
          <label htmlFor="review-region-filter">Region</label>
          <select
            id="review-region-filter"
            data-testid="review-region-filter"
            value={regionFilter}
            onChange={(e) => onRegionFilterChange(e.target.value)}
          >
            <option value="all">{`Alle (${pendingEvents.length})`}</option>
            {regionOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {`${o.name} (${o.count})`}
                {o.importCount > 0 ? ` · ${o.importCount} Import` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {pendingShown === 0 &&
        awaitingShown.length === 0 &&
        recentlyApproved.length === 0 &&
        outdatedShown.length === 0 && (
          <p className="review-subsection-empty" data-testid="review-region-empty">
            Für diese Region gibt es aktuell nichts zu prüfen.
          </p>
        )}

      {pendingShown > 0 && (
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
                  {pendingShown}
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
                        regionLabel={labelFor(event)}
                        showStatus
                        showApprove
                        showRevert
                        showReject={canReject(event)}
                        showDuplicate={false}
                        showSubmittedAt
                        showRevisionHint
                        editAlert={editAlerts[event.id] || null}
                        fromPath="/admin?tab=review"
                        isAdmin
                        showEdit={canEdit(event)}
                        extraBadges={<CurationBadges event={event} />}
                        approveBlockedReason={approveBlockedReason(event)}
                        approving={approvingId}
                        unreadCount={unreadCountByEvent[event.id] || 0}
                        hasMessages={Boolean(hasMessagesByEvent[event.id])}
                        onApprove={handleApprove}
                        onRevert={(evt) => setRevertTarget({ id: evt.id, eventTitle: evt.title })}
                        onReject={openReject}
                        onDeleteClick={(evt) => openDelete(evt)}
                      />
                      {canEdit(event) && <ReviewImageCheck event={event} />}
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
                          regionLabel={labelFor(event)}
                          showStatus
                          showApprove
                          showRevert
                          showReject={canReject(event)}
                          showDuplicate={false}
                          showSubmittedAt
                          showRevisionHint
                          editAlert={editAlerts[event.id] || null}
                          showInKlaerungBy
                          inKlaerungByName={inKlaerungAuthorNameByEvent[event.id] || null}
                          fromPath="/admin?tab=review"
                          isAdmin
                          showEdit={canEdit(event)}
                          extraBadges={<CurationBadges event={event} />}
                          approveBlockedReason={approveBlockedReason(event)}
                          approving={approvingId}
                          unreadCount={unreadCountByEvent[event.id] || 0}
                          hasMessages={Boolean(hasMessagesByEvent[event.id])}
                          onApprove={handleApprove}
                          onRevert={(evt) => setRevertTarget({ id: evt.id, eventTitle: evt.title })}
                          onReject={openReject}
                          onDeleteClick={(evt) => openDelete(evt)}
                        />
                        {canEdit(event) && <ReviewImageCheck event={event} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {awaitingShown.length > 0 && (
        <ReviewImportAwaiting
          events={awaitingShown}
          organizers={organizersById}
          isSuperAdmin={access.isSuperAdmin}
          open={openSections.importAwaiting}
          onToggle={() => toggleSection('importAwaiting')}
          renderRow={(event) => (
            <div key={event.id}>
              <EventAdminListRow
                event={event}
                regionLabel={labelFor(event)}
                showStatus
                showDuplicate={false}
                showSubmittedAt
                fromPath="/admin?tab=review"
                isAdmin
                showReject={canReject(event)}
                showEdit={canEdit(event)}
                extraBadges={<CurationBadges event={event} />}
                unreadCount={unreadCountByEvent[event.id] || 0}
                hasMessages={Boolean(hasMessagesByEvent[event.id])}
                onReject={openReject}
                onDeleteClick={(evt) => openDelete(evt)}
              />
            </div>
          )}
        />
      )}

      {outdatedShown.length > 0 && (
        <ReviewInstagramOutdated
          posts={outdatedShown}
          open={openSections.instagram}
          onToggle={() => toggleSection('instagram')}
          nameOf={nameOf}
          showRegion={showRegionFilter}
        />
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
                  regionLabel={labelFor(event)}
                  showStatus
                  showDuplicate={false}
                  showApprovedBy
                  approvedByName={namesByUid[event.approvedBy] || null}
                  fromPath="/admin?tab=review"
                  isAdmin
                  showEdit={canEdit(event)}
                  onDeleteClick={(evt) => openDelete(evt)}
                />
                <CurationBadges event={event} />
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
            ? `Das Event „${deleteTarget.eventTitle}" wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht.${deleteTarget.internal ? ' Es wird keine E-Mail verschickt.' : ''}`
            : ''
        }
        confirmLabel="In Papierkorb"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={mutating}
        reasonRequired={Boolean(deleteTarget?.reasonRequired)}
      />

      <ConfirmDialog
        isOpen={Boolean(rejectTarget)}
        title="Event ablehnen"
        confirmLabel="Ablehnen"
        cancelLabel="Abbrechen"
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={mutating}
        danger
        confirmDisabled={!rejectTarget?.reason && !rejectTarget?.internal}
      >
        {rejectTarget?.internal ? (
          <p data-testid="review-reject-internal">
            {`Das Event „${rejectTarget.eventTitle}" wird abgelehnt und in den Papierkorb verschoben. Es gehört noch der Redaktion und hat keine Veranstalter:in, deshalb wird keine E-Mail verschickt.`}
          </p>
        ) : rejectTarget?.reason ? (
          <>
            <p>
              {`Das Event „${rejectTarget.eventTitle}" wird abgelehnt und in den Papierkorb der einreichenden Person verschoben. Sie bekommt eine E-Mail mit dieser Nachricht als Grund:`}
            </p>
            <blockquote className="review-reject-reason" data-testid="review-reject-reason">
              {rejectTarget.reason}
            </blockquote>
          </>
        ) : rejectTarget ? (
          <p data-testid="review-reject-needs-reason">
            Bitte zuerst im Nachrichtenbereich einen Grund schreiben.{' '}
            <Link
              to={`${rejectTarget.eventPath}#event-messages`}
              state={{ from: '/admin?tab=review' }}
            >
              Zum Event
            </Link>
          </p>
        ) : null}
      </ConfirmDialog>

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
