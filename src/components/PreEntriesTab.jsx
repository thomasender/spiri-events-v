import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronUp, PlusCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { preEntryAdmin, usePreEntryAccess, usePreEntryList } from '../hooks/usePreEntries';
import ConfirmDialog from './ConfirmDialog';
import PreEntryContactPanel from './PreEntryContactPanel';
import PreEntrySettingsSection from './PreEntrySettingsSection';
import { PreEntryContactFields } from './PreEntryContactFields';
import { ensureCategoryExists } from '../utils/ensureCategoryExists';
import {
  DISPLAY_STATUSES,
  EMPTY_CONTACT,
  EMPTY_FILTERS,
  NOTE_MAX,
  SORT_OPTIONS,
  STATUS_LABELS,
  STATUS_TONES,
  TEMPLATE_LABELS,
  daysLeft,
  derivePreEntryStatus,
  filterRows,
  formatDateDe,
  formatDayDe,
  isExpiringSoon,
  isReminderDue,
  isStillWithSystem,
  moderatorOptions,
  preEntryErrorMessage,
  sortRows,
  validateContact,
  wasEditedAfterClaim,
} from '../utils/preEntries';
import './PreEntriesTab.css';

const CHANNEL_LABELS = { email: 'E-Mail', whatsapp: 'WhatsApp', other: 'Andere' };

const LOG_LABELS = {
  created: 'Vorab eingetragen',
  contact_updated: 'Kontaktdaten geändert',
  link_issued: 'Link erzeugt',
  extended: 'Link verlängert',
  revoked: 'Links widerrufen',
  contacted: 'Kontaktiert',
  status_set: 'Status gesetzt',
  viewed: 'Vorschau geöffnet',
  published: 'Veröffentlicht',
  rejected: 'Abgelehnt',
  claimed: 'Übernommen',
  owner_changed: 'Eigentümer gewechselt',
  checked_out: 'Zum Bearbeiten geholt',
  checked_in: 'Bearbeitung beendet',
  expired: 'Link abgelaufen',
};

function formatDateTime(ms) {
  if (typeof ms !== 'number') return '';
  return new Date(ms).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function logDetail(entry) {
  if (entry.type === 'contacted' && entry.detail) {
    const [channel, template] = entry.detail.split(':');
    return [CHANNEL_LABELS[channel] ?? channel, TEMPLATE_LABELS[template]]
      .filter(Boolean)
      .join(', ');
  }
  if (entry.type === 'link_issued') {
    return entry.detail === 'takeover' ? 'Übernahme-Link' : 'Vorschau-Link';
  }
  if (entry.type === 'extended') return `${entry.detail} Tage`;
  if (entry.type === 'status_set') return STATUS_LABELS[entry.detail] ?? entry.detail;
  if (entry.type === 'owner_changed') return '„Dein Tribe“ → Profil der Veranstalter:in';
  if (entry.type === 'published' && entry.detail === 'moderator') return 'durch Moderation';
  return entry.detail ?? '';
}

export function PreEntryStatusBadge({ status }) {
  return (
    <span
      className={`pre-entry-badge pre-entry-badge--${STATUS_TONES[status] ?? 'neutral'}`}
      data-testid={`pre-entry-status-${status}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// Verwaltung -> Events -> "Vorab eingetragene Events" (Trello 6afb1116,
// docs/pre-entries.md). Super-Admins always see the tab (to switch the flag on);
// Regions-Moderator:innen with app_settings/preEntries.mode 'all'.
export default function PreEntriesTab() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const navigate = useNavigate();
  const { available, isSuperAdmin, settings, loading: settingsLoading } = usePreEntryAccess();
  const { rows, serverNow, loading, error, reload } = usePreEntryList(available || isSuperAdmin);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState('created');
  const [openId, setOpenId] = useState(null);
  const [panel, setPanel] = useState(null); // { id, kind: 'contact' | 'edit' }
  const [confirm, setConfirm] = useState(null); // { kind, row }
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const now = serverNow;
  const moderatorName = (profile?.displayName || user?.displayName || '').trim();

  const visible = useMemo(
    () => sortRows(filterRows(rows, filters, { uid: user?.uid, now, settings }), sortKey, now),
    [rows, filters, user?.uid, now, settings, sortKey]
  );
  const moderators = useMemo(() => moderatorOptions(rows), [rows]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const act = async (row, action, payload = {}, after) => {
    setBusyId(row.eventId);
    setActionError('');
    try {
      const result = await preEntryAdmin(action, { eventId: row.eventId, ...payload });
      if (after) await after(result);
      await reload();
    } catch (err) {
      console.error(`preEntryAdmin ${action} failed:`, err);
      setActionError(preEntryErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const edit = (row) =>
    act(row, 'checkout', {}, () =>
      navigate(`/admin/edit/${row.eventId}`, { state: { from: '/admin?tab=vorab' } })
    );

  if (settingsLoading) return <div className="loading-spinner"></div>;

  return (
    <div className="pre-entries-tab" data-testid="pre-entries-tab">
      <header className="pre-entries-header">
        <div>
          <h2>Vorab eingetragene Events</h2>
          <p className="pre-entry-muted">
            Events, die es schon gibt, für Veranstalter:innen vorbereiten: Sie bekommen einen
            geheimen Vorschau-Link und können das Event veröffentlichen, übernehmen oder ablehnen.
          </p>
        </div>
        {available && (
          <Link to="/admin/new?vorab=1" className="btn btn-primary" data-testid="pre-entry-new">
            <PlusCircle size={18} aria-hidden="true" />
            <span>Event vorab eintragen</span>
          </Link>
        )}
      </header>

      {!available && (
        <p className="pre-entry-notice" role="status">
          Diese Funktion ist gerade ausgeschaltet
          {settings.mode === 'admins' ? ' (nur für Super-Admins freigegeben)' : ''}. Unten in den
          Einstellungen kannst du sie einschalten.
        </p>
      )}

      <div className="pre-entries-toolbar" role="search">
        <input
          type="search"
          placeholder="Suche: Titel, Name, Kontakt"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          aria-label="Suche"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Status"
          data-testid="pre-entry-filter-status"
        >
          <option value="">Alle Status</option>
          {DISPLAY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.moderator}
          onChange={(e) => setFilter('moderator', e.target.value)}
          aria-label="Eingetragen von"
        >
          <option value="">Alle Moderator:innen</option>
          {moderators.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="pre-entries-date">
          <span>von</span>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter('from', e.target.value)}
          />
        </label>
        <label className="pre-entries-date">
          <span>bis</span>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label="Sortierung"
        >
          {Object.entries(SORT_OPTIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="pre-entries-check">
          <input
            type="checkbox"
            checked={filters.mine}
            onChange={(e) => setFilter('mine', e.target.checked)}
          />
          <span>Nur meine</span>
        </label>
        <label className="pre-entries-check">
          <input
            type="checkbox"
            checked={filters.stillWithSystem}
            onChange={(e) => setFilter('stillWithSystem', e.target.checked)}
            data-testid="pre-entry-filter-system"
          />
          <span>Noch bei „Dein Tribe“</span>
        </label>
        <label className="pre-entries-check">
          <input
            type="checkbox"
            checked={filters.reminderOnly}
            onChange={(e) => setFilter('reminderOnly', e.target.checked)}
          />
          <span>Erinnerung empfohlen</span>
        </label>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Aktualisieren</span>
        </button>
      </div>

      {error && (
        <p className="pre-entry-error" role="alert">
          {preEntryErrorMessage(error)}
        </p>
      )}
      {actionError && (
        <p className="pre-entry-error" role="alert">
          {actionError}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <div className="loading-spinner"></div>
      ) : visible.length === 0 ? (
        <p className="pre-entry-muted" data-testid="pre-entries-empty">
          {rows.length === 0 ? 'Noch keine vorab eingetragenen Events.' : 'Keine Treffer.'}
        </p>
      ) : (
        <div className="pre-entries-table-wrap">
          <table className="pre-entries-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Veranstalter</th>
                <th>Eingetragen von</th>
                <th>Kontaktiert</th>
                <th>Status</th>
                <th>Feedback</th>
                <th>Link gültig bis</th>
                <th>Profil</th>
                <th>
                  <span className="pre-entry-sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const status = derivePreEntryStatus(row, now);
                const reminder = isReminderDue(row, settings, now);
                const soon = isExpiringSoon(row, now);
                const open = openId === row.eventId;
                const lastAttempt = row.contactAttempts?.at?.(-1);
                return (
                  <PreEntryRows
                    key={row.eventId}
                    row={row}
                    status={status}
                    reminder={reminder}
                    soon={soon}
                    open={open}
                    lastAttempt={lastAttempt}
                    now={now}
                    uid={user?.uid}
                    busy={busyId === row.eventId}
                    panel={panel?.id === row.eventId ? panel.kind : null}
                    settings={settings}
                    moderatorName={moderatorName}
                    onToggle={() => setOpenId(open ? null : row.eventId)}
                    onPanel={(kind) => {
                      setOpenId(row.eventId);
                      setPanel(kind ? { id: row.eventId, kind } : null);
                    }}
                    onAction={(action, payload, after) => act(row, action, payload, after)}
                    onEdit={() => edit(row)}
                    onConfirm={(kind) => setConfirm({ kind, row })}
                    onReload={reload}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isSuperAdmin && (
        // Remounted when the stored settings change, so the form starts from them.
        <PreEntrySettingsSection key={JSON.stringify(settings)} settings={settings} />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Vorab-Eintrag löschen"
        message={
          confirm?.row?.status === 'claimed'
            ? 'Die Kontaktdaten und der Verlauf werden gelöscht. Das Event selbst gehört der Veranstalter:in und bleibt.'
            : 'Das Event, die Kontaktdaten der Veranstalter:in und der Verlauf werden endgültig gelöscht. Alle Links funktionieren danach nicht mehr.'
        }
        confirmLabel="Endgültig löschen"
        danger
        loading={busyId === confirm?.row?.eventId}
        onConfirm={() => {
          const row = confirm.row;
          setConfirm(null);
          act(row, 'delete');
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'publish'}
        title="Selbst veröffentlichen"
        message="Hat die Veranstalter:in zugestimmt (z. B. per WhatsApp „Passt so“)? Das Event geht dann unter „Dein Tribe“ online. Schick danach die Vorlage „Bestätigung nach Veröffentlichung“ mit dem Übernahme-Link."
        confirmLabel="Ja, veröffentlichen"
        loading={busyId === confirm?.row?.eventId}
        onConfirm={() => {
          const row = confirm.row;
          setConfirm(null);
          act(row, 'publish', {}, async () => {
            if (row.event?.category) {
              try {
                await ensureCategoryExists(row.event.category);
              } catch (err) {
                console.warn('ensureCategoryExists failed after publishing:', err);
              }
            }
          });
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function PreEntryRows({
  row,
  status,
  reminder,
  soon,
  open,
  lastAttempt,
  now,
  uid,
  busy,
  panel,
  settings,
  moderatorName,
  onToggle,
  onPanel,
  onAction,
  onEdit,
  onConfirm,
  onReload,
}) {
  const c = row.contact ?? {};
  const ev = row.event ?? {};
  const isOpenEntry = ['draft', 'contacted', 'expired'].includes(status);
  const checkedOutByMe = row.checkedOutBy && row.checkedOutBy === uid && !ev.ownedBySystem;
  const left = daysLeft(row.expiresAtMs, now);
  return (
    <>
      <tr className={reminder ? 'pre-entries-row--reminder' : undefined}>
        <td>
          <strong>{ev.title || '(gelöscht)'}</strong>
          <div className="pre-entry-muted">
            {[formatDateDe(ev.date), ev.time].filter(Boolean).join(', ')}
          </div>
          {ev.status === 'approved' && ev.slug && (
            <Link to={`/event/${ev.slug}`} className="detail-link">
              Öffentliche Seite
            </Link>
          )}
        </td>
        <td>
          <div>{c.name}</div>
          <div className="pre-entry-muted">
            {[c.contactPerson, c.organization].filter(Boolean).join(' · ')}
          </div>
          <div className="pre-entry-muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
        </td>
        <td>
          <div>{row.createdByName}</div>
          <div className="pre-entry-muted">{formatDayDe(row.createdAtMs)}</div>
        </td>
        <td>
          {lastAttempt ? (
            <>
              <div>
                {CHANNEL_LABELS[lastAttempt.channel]}, {formatDayDe(lastAttempt.atMs)}
              </div>
              <div className="pre-entry-muted">
                {lastAttempt.byName} · {row.contactAttempts.length}×
              </div>
            </>
          ) : (
            <span className="pre-entry-muted">noch nicht</span>
          )}
        </td>
        <td>
          <PreEntryStatusBadge status={status} />
          {reminder && (
            <div className="pre-entry-reminder" data-testid="pre-entry-reminder">
              <Bell size={14} aria-hidden="true" /> Erinnerung empfohlen
            </div>
          )}
        </td>
        <td>
          {row.organizerComment && (
            <div className="pre-entry-comment">„{row.organizerComment}“</div>
          )}
          {wasEditedAfterClaim(row) && <div className="pre-entry-muted">wurde bearbeitet</div>}
          {row.firstViewedAtMs && !row.organizerComment && (
            <div className="pre-entry-muted">Vorschau {row.viewCount}× geöffnet</div>
          )}
        </td>
        <td>
          {isOpenEntry ? (
            <>
              <div>{formatDayDe(row.expiresAtMs)}</div>
              <div className={soon ? 'pre-entry-soon' : 'pre-entry-muted'}>
                {status === 'expired'
                  ? 'abgelaufen'
                  : `noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`}
              </div>
            </>
          ) : (
            <span className="pre-entry-muted">–</span>
          )}
        </td>
        <td>
          {row.status === 'claimed' ? (
            <span>{row.claimedName || 'Veranstalter:in'} (übernommen)</span>
          ) : (
            <span>Dein Tribe{isStillWithSystem(row) ? ' (noch nicht übernommen)' : ''}</span>
          )}
        </td>
        <td>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onToggle}
            aria-expanded={open}
            data-testid="pre-entry-toggle"
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="pre-entry-sr-only">Details</span>
          </button>
        </td>
      </tr>
      {open && (
        <tr className="pre-entries-detail-row">
          <td colSpan={9}>
            <div className="pre-entries-detail">
              <div className="pre-entry-actions">
                {status !== 'claimed' && status !== 'editing' && status !== 'rejected' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => onPanel(panel === 'contact' ? null : 'contact')}
                    data-testid="pre-entry-contact"
                  >
                    {status === 'published' ? 'Übernahme-Link schicken' : 'Kontaktieren'}
                    {reminder ? ' (Erinnerung)' : ''}
                  </button>
                )}
                {isOpenEntry && ev.ownedBySystem && ev.status === 'draft' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={onEdit}
                  >
                    Bearbeiten
                  </button>
                )}
                {checkedOutByMe && (
                  <>
                    <Link
                      to={`/admin/edit/${row.eventId}`}
                      state={{ from: '/admin?tab=vorab' }}
                      className="btn btn-secondary"
                    >
                      Weiter bearbeiten
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => onAction('checkin')}
                    >
                      Bearbeitung beenden
                    </button>
                  </>
                )}
                {isOpenEntry && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onAction('extend', { days: settings.validDays })}
                    data-testid="pre-entry-extend"
                  >
                    Link um {settings.validDays} Tage verlängern
                  </button>
                )}
                {(isOpenEntry || status === 'published') && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onAction('revoke')}
                  >
                    Alle Links widerrufen
                  </button>
                )}
                {isOpenEntry && ev.status === 'draft' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onConfirm('publish')}
                  >
                    Selbst veröffentlichen
                  </button>
                )}
                {status === 'draft' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onAction('setStatus', { status: 'contacted' })}
                  >
                    Als kontaktiert markieren
                  </button>
                )}
                {isOpenEntry && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onAction('setStatus', { status: 'rejected' })}
                  >
                    Als abgelehnt markieren
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onPanel(panel === 'edit' ? null : 'edit')}
                >
                  Kontaktdaten ändern
                </button>
                <button
                  type="button"
                  className="btn btn-subtle-danger"
                  disabled={busy}
                  onClick={() => onConfirm('delete')}
                  data-testid="pre-entry-delete"
                >
                  Löschen
                </button>
              </div>

              {panel === 'contact' && (
                <PreEntryContactPanel
                  row={row}
                  settings={settings}
                  now={now}
                  moderatorName={moderatorName}
                  onCancel={() => onPanel(null)}
                  onDone={() => {
                    onPanel(null);
                    onReload();
                  }}
                />
              )}
              {panel === 'edit' && (
                <ContactEditForm
                  row={row}
                  onCancel={() => onPanel(null)}
                  onSave={(contact, note) =>
                    onAction('update', { contact, note }, () => onPanel(null))
                  }
                />
              )}

              <div className="pre-entries-detail-grid">
                <section>
                  <h3>Kontakt</h3>
                  <dl className="pre-entry-dl">
                    {[
                      ['Name', c.name],
                      ['Ansprechperson', c.contactPerson],
                      ['Organisation', c.organization],
                      ['E-Mail', c.email],
                      ['Telefon / WhatsApp', c.phone],
                      ['Weitere', c.other],
                    ]
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                  {row.note && (
                    <>
                      <h4>Interne Notiz</h4>
                      <p className="pre-entry-note">{row.note}</p>
                    </>
                  )}
                </section>
                <section>
                  <h3>Verlauf</h3>
                  <ol className="pre-entry-log" data-testid="pre-entry-log">
                    {[...(row.log ?? [])].reverse().map((entry, i) => (
                      <li key={`${entry.atMs}-${i}`}>
                        <span className="pre-entry-muted">{formatDateTime(entry.atMs)}</span>{' '}
                        <strong>{LOG_LABELS[entry.type] ?? entry.type}</strong>
                        {logDetail(entry) && <span> · {logDetail(entry)}</span>}
                        <span className="pre-entry-muted">
                          {' '}
                          ·{' '}
                          {entry.by === 'organizer'
                            ? 'Veranstalter:in'
                            : entry.by === 'system'
                              ? 'System'
                              : entry.byName || ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {status === 'claimed' || status === 'editing' ? (
                    <p className="pre-entry-muted">
                      Änderungen der Veranstalter:in (vorher/nachher) siehst du im Verlauf des
                      Events im Bereich „Review“, sobald sie es einreicht.{' '}
                      {ev.status === 'pending' && (
                        <Link to={`/admin?tab=review#${row.eventId}`} className="detail-link">
                          Im Review ansehen
                        </Link>
                      )}
                    </p>
                  ) : null}
                </section>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ContactEditForm({ row, onCancel, onSave }) {
  const [contact, setContact] = useState({ ...EMPTY_CONTACT, ...(row.contact ?? {}) });
  const [note, setNote] = useState(row.note ?? '');
  const errors = validateContact(contact);
  const set = (key) => (e) => setContact((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <form
      className="pre-entry-contact"
      onSubmit={(e) => {
        e.preventDefault();
        if (Object.keys(errors).length === 0) onSave(contact, note);
      }}
    >
      <PreEntryContactFields contact={contact} onChange={set} errors={errors} />
      <label className="pre-entry-contact-field">
        <span>Interne Notiz</span>
        <textarea
          rows={3}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="pre-entry-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={Object.keys(errors).length > 0}>
          Speichern
        </button>
      </div>
    </form>
  );
}
