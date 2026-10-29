import { useCallback, useMemo, useState } from 'react';
import {
  Pencil,
  Search,
  Download,
  Printer,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  CheckCircle2,
  Plus,
  Trash2,
  X,
  CalendarDays,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminMembers } from '../hooks/useAdminMembers';
import { useMemberLists } from '../hooks/useMemberLists';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../hooks/useAuth';
import { getStaffAccess } from '../utils/staffRoles';
import { BEZIRKE, ONLINE_LOCATION } from '../utils/regions';
import { useRegionChoices } from '../hooks/useRegionChoices';
import { directoryDistrictGroups } from '../utils/regionChoices';
import { useMemberEvents } from '../hooks/useMemberEvents';
import {
  filterMembers,
  sortMembers,
  memberProfilePath,
  downloadCsv,
  printMembers,
} from '../utils/members';
import ConfirmDialog from './ConfirmDialog';
import StatusBadge from './StatusBadge';
import './MembersTab.css';

const COLUMNS = [
  { key: 'displayName', label: 'Name' },
  { key: 'username', label: 'Benutzername' },
  { key: 'email', label: 'E-Mail' },
  { key: 'createdAt', label: 'Registriert' },
];

function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-AT');
}

// Fields a Regions-Moderator:in may change (mirrors MODERATOR_MEMBER_FIELDS
// in functions/src/adminMembers.ts): directory curation, not the identity.
const MODERATOR_FIELDS = ['listedInDirectory', 'directoryCategories', 'directoryRegions'];

function memberSaveErrorMessage(err, moderatorMode) {
  if (moderatorMode && err?.code === 'functions/permission-denied') {
    return 'Dieses Mitglied kannst du nicht ändern: Es ist auch in einer anderen Region eingetragen oder gehört zum Team.';
  }
  return `Speichern fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte erneut versuchen.`;
}

function MemberEditDialog({ member, categories, onSave, onClose, moderatorMode = false }) {
  const [draft, setDraft] = useState({
    displayName: member.displayName,
    username: member.username,
    directoryRegions: member.directoryRegions,
    directoryCategories: member.directoryCategories,
    listedInDirectory: member.listedInDirectory,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const regionChoices = useRegionChoices();
  const districtGroups = regionChoices.enabled
    ? directoryDistrictGroups(
        regionChoices.options.map((r) => r.id),
        regionChoices
      )
    : [];

  const toggle = (field, value) =>
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(value)
        ? d[field].filter((v) => v !== value)
        : [...d[field], value],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!draft.displayName.trim()) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    if (draft.listedInDirectory && draft.directoryCategories.length < 1) {
      setError('Für einen Verzeichnis-Eintrag ist mindestens eine Kategorie nötig.');
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch (err) {
      console.error('Member update failed:', err?.code, err?.message, err);
      setError(memberSaveErrorMessage(err, moderatorMode));
      setSaving(false);
    }
  };

  return (
    <div className="members-dialog-backdrop" role="presentation">
      <form
        className="members-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Mitglied bearbeiten"
        onSubmit={submit}
        data-testid="member-edit-dialog"
      >
        <h2>Mitglied bearbeiten</h2>
        {moderatorMode ? (
          <p className="members-dialog-hint">
            Du kannst den Verzeichnis-Eintrag anpassen. Name und Benutzername ändert nur das
            Kernteam.
          </p>
        ) : (
          <p className="members-dialog-hint">
            E-Mail: <strong>{member.email || '–'}</strong> (kann hier nicht geändert werden)
          </p>
        )}
        <label>
          Name
          <input
            type="text"
            maxLength={80}
            readOnly={moderatorMode}
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          />
        </label>
        <label>
          Benutzername
          <input
            type="text"
            maxLength={40}
            readOnly={moderatorMode}
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
          />
        </label>
        {regionChoices.enabled ? (
          <>
            {districtGroups.map((group) => (
              <fieldset key={group.regionId}>
                <legend>
                  {group.label} {group.regionName}
                </legend>
                {group.districts.map((b) => (
                  <label key={b} className="members-check">
                    <input
                      type="checkbox"
                      checked={draft.directoryRegions.includes(b)}
                      onChange={() => toggle('directoryRegions', b)}
                    />
                    {b}
                  </label>
                ))}
              </fieldset>
            ))}
            <fieldset>
              <legend>Online</legend>
              <label className="members-check">
                <input
                  type="checkbox"
                  checked={draft.directoryRegions.includes(ONLINE_LOCATION)}
                  onChange={() => toggle('directoryRegions', ONLINE_LOCATION)}
                />
                {ONLINE_LOCATION}
              </label>
            </fieldset>
          </>
        ) : (
          <fieldset>
            <legend>Bezirke</legend>
            {[...BEZIRKE, ONLINE_LOCATION].map((b) => (
              <label key={b} className="members-check">
                <input
                  type="checkbox"
                  checked={draft.directoryRegions.includes(b)}
                  onChange={() => toggle('directoryRegions', b)}
                />
                {b}
              </label>
            ))}
          </fieldset>
        )}
        <fieldset>
          <legend>Kategorien (max. 5)</legend>
          {categories.map((c) => (
            <label key={c} className="members-check">
              <input
                type="checkbox"
                checked={draft.directoryCategories.includes(c)}
                disabled={
                  !draft.directoryCategories.includes(c) && draft.directoryCategories.length >= 5
                }
                onChange={() => toggle('directoryCategories', c)}
              />
              {c}
            </label>
          ))}
        </fieldset>
        <label className="members-check">
          <input
            type="checkbox"
            checked={draft.listedInDirectory}
            onChange={(e) => setDraft({ ...draft, listedInDirectory: e.target.checked })}
          />
          Im Verzeichnis sichtbar
        </label>
        {error && (
          <p className="members-error" role="alert">
            {error}
          </p>
        )}
        <div className="members-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}

function MemberEventsDialog({ member, onClose }) {
  const { events, loading, error } = useMemberEvents(member.uid);

  return (
    <div className="members-dialog-backdrop" role="presentation">
      <div
        className="members-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Events des Mitglieds"
        data-testid="member-events-dialog"
      >
        <h2>Events von {member.displayName || member.email}</h2>
        <p className="members-dialog-hint">
          So sieht das Mitglied „Meine Events“, inklusive Entwürfen und gelöschten Events.
        </p>
        {loading && <p>Events werden geladen …</p>}
        {error && (
          <p className="members-error" role="alert">
            Events konnten nicht geladen werden.
          </p>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="members-empty">Dieses Mitglied hat noch keine Events.</p>
        )}
        {events.length > 0 && (
          <ul className="members-events">
            {events.map((e) => (
              <li key={e.id} className="members-events-item" data-testid="member-event-row">
                <div className="members-events-main">
                  <strong>{e.title || '(ohne Titel)'}</strong>
                  <span>{e.date ? formatDate(e.date) : '–'}</span>
                </div>
                <StatusBadge status={e.status || 'pending'} />
                <Link to={`/admin/edit/${e.id}`} state={{ from: '/admin?tab=members' }}>
                  Öffnen
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="members-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// Admin tab: member management. Search, filter by Bezirk / Kategorie, edit
// public profile fields, group members into lists and export CSV / PDF.
export default function MembersTab() {
  const { role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const isAdmin = access.isSuperAdmin;
  // Moderator:innen get the list of their regions from the same callable
  // (filtered server side, without e-mail or Instagram data); member lists and
  // exports stay with the Super-Admins.
  const isModerator = access.isRegionModerator;
  const { members, loading, error, reload, updateMember } = useAdminMembers(access.isStaff);
  const { lists, createList, setMemberUids, renameList, deleteList } = useMemberLists(isAdmin);
  const categories = useCategories();

  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [regionId, setRegionId] = useState('');
  const regionChoices = useRegionChoices();
  const districtGroups = regionChoices.enabled
    ? directoryDistrictGroups(
        regionChoices.options.map((r) => r.id),
        regionChoices
      )
    : [];
  const [category, setCategory] = useState('');
  const [activeListId, setActiveListId] = useState('');
  const [clubOnly, setClubOnly] = useState(false);
  const [clubSaving, setClubSaving] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [viewingEvents, setViewingEvents] = useState(null);
  const [deletingList, setDeletingList] = useState(false);
  const [actionError, setActionError] = useState(null);

  const activeList = lists.find((l) => l.id === activeListId) || null;

  const visible = useMemo(() => {
    const filtered = filterMembers(members, {
      search,
      region,
      regionId,
      category,
      listUids: activeList ? new Set(activeList.memberUids || []) : null,
      clubOnly: isAdmin && clubOnly,
    });
    return sortMembers(filtered, sort.key, sort.direction);
  }, [members, search, region, regionId, category, activeList, sort, isAdmin, clubOnly]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );

  const toggleSelected = (uid) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.uid));
  const toggleAllVisible = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((m) => m.uid)));

  const run = useCallback(async (fn) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      console.error('Member list action failed:', err);
      setActionError('Aktion fehlgeschlagen. Bitte erneut versuchen.');
    }
  }, []);

  const handleCreateList = () =>
    run(async () => {
      const name = window.prompt('Name der neuen Liste:');
      if (!name || !name.trim()) return;
      const id = await createList(name, Array.from(selected));
      setActiveListId(id);
    });

  const handleRenameList = () =>
    run(async () => {
      const name = window.prompt('Neuer Name der Liste:', activeList.name);
      if (!name || !name.trim()) return;
      await renameList(activeList.id, name);
    });

  const handleAddSelected = (listId) =>
    run(async () => {
      const list = lists.find((l) => l.id === listId);
      if (!list) return;
      const merged = Array.from(new Set([...(list.memberUids || []), ...selected]));
      await setMemberUids(list.id, merged);
      setSelected(new Set());
    });

  const handleRemoveFromList = (uid) =>
    run(() =>
      setMemberUids(
        activeList.id,
        (activeList.memberUids || []).filter((id) => id !== uid)
      )
    );

  // Vereinsmitglied (badge on the profile photo): Super-Admins only, saved
  // straight from the row.
  const handleClubMember = (member, clubMember) =>
    run(async () => {
      setClubSaving((prev) => new Set(prev).add(member.uid));
      try {
        await updateMember(member.uid, { clubMember });
      } finally {
        setClubSaving((prev) => {
          const next = new Set(prev);
          next.delete(member.uid);
          return next;
        });
      }
    });

  const handleDeleteList = () =>
    run(async () => {
      await deleteList(activeList.id);
      setActiveListId('');
      setDeletingList(false);
    });

  if (!isAdmin && !isModerator) return null;

  const columns = isAdmin
    ? COLUMNS
    : COLUMNS.filter(
        (c) => c.key === 'displayName' || c.key === 'username' || c.key === 'createdAt'
      );

  const exportTitle = activeList ? `Mitglieder – ${activeList.name}` : 'Mitglieder';

  return (
    <div className="members-tab" data-testid="members-tab">
      <p className="members-tab-description">
        {isModerator
          ? 'Mitglieder, die im Verzeichnis deiner Region eingetragen sind.'
          : 'Alle registrierten Mitglieder. Dieser Bereich ist nur für Admins sichtbar.'}
      </p>

      <div className="members-toolbar">
        <label className="members-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder={
              isAdmin ? 'Name, Benutzername oder E-Mail suchen' : 'Name oder Benutzername suchen'
            }
            aria-label="Mitglieder suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {regionChoices.enabled && (
          <select
            aria-label="Nach Region filtern"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            data-testid="members-region-filter"
          >
            <option value="">Alle Regionen</option>
            {regionChoices.options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label={
            regionChoices.enabled ? 'Nach Bezirk oder Landkreis filtern' : 'Nach Bezirk filtern'
          }
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">
            {regionChoices.enabled ? 'Alle Bezirke und Landkreise' : 'Alle Bezirke'}
          </option>
          {regionChoices.enabled ? (
            <>
              {districtGroups.map((group) => (
                <optgroup key={group.regionId} label={`${group.label} ${group.regionName}`}>
                  {group.districts.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={ONLINE_LOCATION}>{ONLINE_LOCATION}</option>
            </>
          ) : (
            [...BEZIRKE, ONLINE_LOCATION].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))
          )}
        </select>
        <select
          aria-label="Nach Kategorie filtern"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {isAdmin && (
          <label className="members-club-filter">
            <input
              type="checkbox"
              checked={clubOnly}
              onChange={(e) => setClubOnly(e.target.checked)}
              data-testid="members-club-filter"
            />
            Nur Vereinsmitglieder
          </label>
        )}
        {isAdmin && (
          <select
            aria-label="Liste wählen"
            value={activeListId}
            onChange={(e) => setActiveListId(e.target.value)}
          >
            <option value="">Alle Mitglieder</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({(l.memberUids || []).length})
              </option>
            ))}
          </select>
        )}
      </div>

      {isAdmin && (
        <div className="members-toolbar">
          <button type="button" className="btn btn-secondary" onClick={handleCreateList}>
            <Plus size={16} aria-hidden="true" />
            <span>Neue Liste{selected.size > 0 ? ` (${selected.size} Mitglieder)` : ''}</span>
          </button>
          {activeList && (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleRenameList}>
                <Pencil size={16} aria-hidden="true" />
                <span>Liste umbenennen</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingList(true)}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span>Liste löschen</span>
              </button>
            </>
          )}
          {selected.size > 0 && lists.length > 0 && (
            <select
              aria-label="Auswahl zu Liste hinzufügen"
              value=""
              onChange={(e) => e.target.value && handleAddSelected(e.target.value)}
            >
              <option value="">{selected.size} ausgewählt: zu Liste hinzufügen …</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <span className="members-toolbar-spacer" />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadCsv(visible, 'mitglieder.csv')}
            disabled={visible.length === 0}
            data-testid="members-export-csv"
          >
            <Download size={16} aria-hidden="true" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => printMembers(visible, exportTitle)}
            disabled={visible.length === 0}
            data-testid="members-export-pdf"
          >
            <Printer size={16} aria-hidden="true" />
            <span>PDF</span>
          </button>
        </div>
      )}

      {actionError && (
        <p className="members-error" role="alert">
          {actionError}
        </p>
      )}

      {loading && <p>Mitglieder werden geladen …</p>}
      {error && (
        <div className="members-error" role="alert">
          Mitglieder konnten nicht geladen werden.{' '}
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Erneut versuchen
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="members-count" data-testid="members-count">
            {visible.length} von {members.length} Mitgliedern
          </p>
          {visible.length === 0 ? (
            <p className="members-empty">Keine Mitglieder gefunden.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    {isAdmin && (
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Alle sichtbaren auswählen"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                        />
                      </th>
                    )}
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        aria-sort={
                          sort.key === c.key
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button
                          type="button"
                          className="members-sort"
                          onClick={() => toggleSort(c.key)}
                        >
                          {c.label}
                          {sort.key === c.key &&
                            (sort.direction === 'asc' ? (
                              <ArrowUp size={14} aria-hidden="true" />
                            ) : (
                              <ArrowDown size={14} aria-hidden="true" />
                            ))}
                        </button>
                      </th>
                    ))}
                    <th>Profil</th>
                    {isAdmin && <th title="Vereinsmitglied: Abzeichen am Profilfoto">Verein</th>}
                    <th>Verzeichnis</th>
                    <th>Instagram teilen</th>
                    <th>Instagram-Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => {
                    const profilePath = memberProfilePath(m);
                    return (
                      <tr key={m.uid} data-testid="member-row">
                        {isAdmin && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${m.displayName || m.email} auswählen`}
                              checked={selected.has(m.uid)}
                              onChange={() => toggleSelected(m.uid)}
                            />
                          </td>
                        )}
                        <td>{m.displayName || '–'}</td>
                        <td>{m.username || '–'}</td>
                        {isAdmin && (
                          <td>
                            {m.email || '–'}
                            {m.emailVerified && (
                              <CheckCircle2
                                size={14}
                                className="members-verified"
                                aria-label="E-Mail bestätigt"
                              />
                            )}
                          </td>
                        )}
                        <td>{formatDate(m.createdAt)}</td>
                        <td>
                          {profilePath ? (
                            <a href={profilePath} target="_blank" rel="noreferrer">
                              <ExternalLink size={14} aria-hidden="true" /> Profil
                            </a>
                          ) : (
                            '–'
                          )}
                        </td>
                        {isAdmin && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${m.displayName || m.email} ist Vereinsmitglied`}
                              checked={m.clubMember === true}
                              disabled={clubSaving.has(m.uid)}
                              onChange={(e) => handleClubMember(m, e.target.checked)}
                              data-testid="member-club-toggle"
                            />
                          </td>
                        )}
                        <td>
                          {m.listedInDirectory ? (m.directoryHidden ? 'Versteckt' : 'Ja') : 'Nein'}
                        </td>
                        <td>{m.instagramConsent ? 'Ja' : 'Nein'}</td>
                        <td>{m.instagramHandle || '–'}</td>
                        <td className="members-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-label={`Events von ${m.displayName || m.email} ansehen`}
                            title="Events ansehen"
                            onClick={() => setViewingEvents(m)}
                          >
                            <CalendarDays size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-label={`${m.displayName || m.email} bearbeiten`}
                            onClick={() => setEditing(m)}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          {activeList && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              aria-label={`${m.displayName || m.email} aus Liste entfernen`}
                              onClick={() => handleRemoveFromList(m.uid)}
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && (
        <MemberEditDialog
          member={editing}
          categories={categories}
          moderatorMode={isModerator}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const changes = isModerator
              ? Object.fromEntries(MODERATOR_FIELDS.map((k) => [k, draft[k]]))
              : draft;
            await updateMember(editing.uid, changes);
            setEditing(null);
          }}
        />
      )}

      {viewingEvents && (
        <MemberEventsDialog member={viewingEvents} onClose={() => setViewingEvents(null)} />
      )}

      <ConfirmDialog
        isOpen={deletingList}
        danger
        title="Liste löschen?"
        message={
          activeList
            ? `Die Liste "${activeList.name}" wird gelöscht. Die Mitglieder bleiben erhalten.`
            : ''
        }
        confirmLabel="Löschen"
        onConfirm={handleDeleteList}
        onCancel={() => setDeletingList(false)}
      />
    </div>
  );
}
