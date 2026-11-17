import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRegionLabels } from '../hooks/useRegionLabels';
import {
  inviteModeratorApplicant,
  useModeratorApplication,
  useStaffNotifications,
} from '../hooks/useStaffNotifications';
import { getStaffAccess } from '../utils/staffRoles';
import {
  applicantInviteButton,
  applicantInviteErrorMessage,
  staffNotificationRegionLabel,
  staffNotificationText,
  toMillis,
} from '../utils/staffNotifications';
import './StaffNotificationsTab.css';

function formatWhen(value) {
  const ms = toMillis(value);
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * One note. Presentational: the application status and the invite action come
 * in as props, so the button states are tested without Firebase
 * (tests/components/StaffNotificationsTab.spec.tsx).
 *   applicationStatus  'open' | 'invited' | 'done' | null (unknown)
 *   regionChoices      [{ id, name }] when the application has no region and a
 *                      Super-Admin must pick one (one entry = no visible picker)
 */
export function StaffNotificationCard({
  notification,
  regionLabel = null,
  applicationStatus = null,
  regionChoices = [],
  onInvite,
}) {
  const { title, body, hint } = staffNotificationText(notification, regionLabel);
  const isApplication =
    notification.kind === 'application' || notification.kind === 'applicationReminder';
  const button = applicantInviteButton(applicationStatus, notification.name);
  const [pickedRegionId, setRegionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const needsRegion = regionChoices.length > 0;
  // One active region (dark launch): no picker, that region is meant.
  const regionId = regionChoices.length === 1 ? regionChoices[0].id : pickedRegionId;

  const invite = async () => {
    if (needsRegion && !regionId) {
      setResult({ error: true, text: 'Bitte wähle zuerst eine Region aus.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await onInvite(needsRegion ? regionId : undefined);
      setResult(
        data?.emailSent === false
          ? {
              error: true,
              text: 'Die Einladung ist angelegt, aber die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.',
            }
          : {
              error: false,
              text: `Einladung verschickt. ${notification.name} bekommt eine E-Mail mit dem Link zur Einführung.`,
            }
      );
    } catch (err) {
      setResult({ error: true, text: applicantInviteErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`staff-note${notification.readAt == null ? ' staff-note--unread' : ''}`}
      data-testid="staff-note"
    >
      <div className="staff-note-head">
        <h3 className="staff-note-title">{title}</h3>
        <span className="staff-note-date">{formatWhen(notification.createdAt)}</span>
      </div>
      {body && <p className="staff-note-body">{body}</p>}

      {isApplication && (
        <>
          <dl className="staff-note-details">
            {notification.email && (
              <>
                <dt>E-Mail</dt>
                <dd>
                  <a href={`mailto:${notification.email}`}>{notification.email}</a>
                </dd>
              </>
            )}
            {notification.hasPhoto && (
              <>
                <dt>Foto</dt>
                <dd>
                  {notification.audience === 'superAdmin'
                    ? 'Liegt der E-Mail an die Super-Admins bei.'
                    : 'Wurde mitgeschickt (liegt den Super-Admins per E-Mail vor).'}
                </dd>
              </>
            )}
          </dl>
          {notification.message && <p className="staff-note-message">{notification.message}</p>}
          {applicationStatus === 'invited' && (
            <p className="staff-note-status" data-testid="staff-note-invited">
              Die Einladung ist verschickt. Sobald {notification.name} die Einführung abgeschlossen
              hat, ist die Person Moderator:in.
            </p>
          )}
          <div className="staff-note-actions">
            {needsRegion && regionChoices.length > 1 && !button.disabled && (
              <select
                aria-label="Region für die Einladung"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                data-testid="staff-note-region"
              >
                <option value="">Region wählen …</option>
                {regionChoices.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={button.disabled || busy}
              onClick={invite}
              data-testid="staff-note-invite"
            >
              {button.label}
            </button>
          </div>
          {result && (
            <p
              className={result.error ? 'staff-note-error' : 'staff-note-status'}
              role={result.error ? 'alert' : 'status'}
            >
              {result.text}
            </p>
          )}
        </>
      )}

      {hint && <p className="staff-note-hint">{hint}</p>}
    </li>
  );
}

/** Wires one note to its application's live status. */
function StaffNotificationItem({ notification, isSuperAdmin, multiRegion, nameOf, activeRegions }) {
  const isApplication =
    notification.kind === 'application' || notification.kind === 'applicationReminder';
  const application = useModeratorApplication(isApplication ? notification.applicationId : null);
  const status = application ? application.status || 'open' : null;
  const regionChoices =
    isSuperAdmin && isApplication && application && !application.regionId ? activeRegions : [];
  return (
    <StaffNotificationCard
      notification={notification}
      regionLabel={staffNotificationRegionLabel(notification, { multiRegion, nameOf })}
      applicationStatus={status}
      regionChoices={regionChoices}
      onInvite={(regionId) => inviteModeratorApplicant(notification.applicationId, regionId)}
    />
  );
}

/**
 * Admin tab "Team-Hinweise" (Trello 6afc59ed): moderator applications of the
 * own regions (Super-Admins: all), the three-day reminder and new moderators.
 * Opening the tab marks the notes as read.
 */
export default function StaffNotificationsTab() {
  const { user, role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const { notifications, loading, unreadCount, markAllRead } = useStaffNotifications(
    user?.uid,
    access.isStaff
  );
  const { multiRegion, nameOf, regions } = useRegionLabels();
  const activeRegions = useMemo(
    () => regions.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name })),
    [regions]
  );

  useEffect(() => {
    if (unreadCount === 0) return;
    markAllRead().catch((err) => console.warn('Team notes not marked read:', err?.code || err));
  }, [unreadCount, markAllRead]);

  return (
    <section className="staff-notes-tab">
      <p className="staff-notes-intro">
        Hier landen Bewerbungen als Moderator:in
        {access.isSuperAdmin ? '' : ' aus deiner Region'} und Neuigkeiten aus dem Team.
      </p>
      {loading && <div className="loading-spinner"></div>}
      {!loading && notifications.length === 0 && (
        <p className="staff-notes-empty">Gerade gibt es nichts Neues.</p>
      )}
      {notifications.length > 0 && (
        <ul className="staff-notes-list">
          {notifications.map((n) => (
            <StaffNotificationItem
              key={n.id}
              notification={n}
              isSuperAdmin={access.isSuperAdmin}
              multiRegion={multiRegion}
              nameOf={nameOf}
              activeRegions={activeRegions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
