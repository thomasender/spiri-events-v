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
} from 'lucide-react';
import { useAdminMembers } from '../hooks/useAdminMembers';
import { useMemberLists } from '../hooks/useMemberLists';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../hooks/useAuth';
import { BEZIRKE } from '../utils/regions';
import {
  filterMembers,
  sortMembers,
  memberProfilePath,
  downloadCsv,
  printMembers,
} from '../utils/members';
import ConfirmDialog from './ConfirmDialog';
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

function MemberEditDialog({ member, categories, onSave, onClose }) {
  const [draft, setDraft] = useState({
    displayName: member.displayName,
    username: member.username,
    directoryRegions: member.directoryRegions,
    directoryCategories: member.directoryCategories,
    listedInDirectory: member.listedInDirectory,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

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
      setError(`Speichern fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte erneut versuchen.`);
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
        <p className="members-dialog-hint">
          E-Mail: <strong>{member.email || '–'}</strong> (kann hier nicht geändert werden)
        </p>
        <label>
          Name
          <input
            type="text"
            maxLength={80}
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          />
        </label>
        <label>
          Benutzername
          <input
            type="text"
            maxLength={40}
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Bezirke</legend>
          {BEZIRKE.map((b) => (
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

// Admin tab: member management. Search, filter by Bezirk / Kategorie, edit
// public profile fields, group members into lists and export CSV / PDF.
export default function MembersTab() {
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const { members, loading, error, reload, updateMember } = useAdminMembers(isAdmin);
  const { lists, createList, setMemberUids, renameList, deleteList } = useMemberLists(isAdmin);
  const categories = useCategories();

  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [activeListId, setActiveListId] = useState('');
  const [sort, setSort] = useState({ key: 'displayName', direction: 'asc' });
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [deletingList, setDeletingList] = useState(false);
  const [actionError, setActionError] = useState(null);

  const activeList = lists.find((l) => l.id === activeListId) || null;

  const visible = useMemo(() => {
    const filtered = filterMembers(members, {
      search,
      region,
      category,
      listUids: activeList ? new Set(activeList.memberUids || []) : null,
    });
    return sortMembers(filtered, sort.key, sort.direction);
  }, [members, search, region, category, activeList, sort]);

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

  const handleDeleteList = () =>
    run(async () => {
      await deleteList(activeList.id);
      setActiveListId('');
      setDeletingList(false);
    });

  if (!isAdmin) return null;

  const exportTitle = activeList ? `Mitglieder – ${activeList.name}` : 'Mitglieder';

  return (
    <div className="members-tab" data-testid="members-tab">
      <p className="members-tab-description">
        Alle registrierten Mitglieder. Dieser Bereich ist nur für Admins sichtbar.
      </p>

      <div className="members-toolbar">
        <label className="members-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Name, Benutzername oder E-Mail suchen"
            aria-label="Mitglieder suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Nach Bezirk filtern"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">Alle Bezirke</option>
          {BEZIRKE.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
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
      </div>

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
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Alle sichtbaren auswählen"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                      />
                    </th>
                    {COLUMNS.map((c) => (
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
                    <th>Bezirke</th>
                    <th>Kategorien</th>
                    <th>Verzeichnis</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => {
                    const profilePath = memberProfilePath(m);
                    return (
                      <tr key={m.uid} data-testid="member-row">
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${m.displayName || m.email} auswählen`}
                            checked={selected.has(m.uid)}
                            onChange={() => toggleSelected(m.uid)}
                          />
                        </td>
                        <td>{m.displayName || '–'}</td>
                        <td>{m.username || '–'}</td>
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
                        <td>{m.directoryRegions.join(', ') || '–'}</td>
                        <td>{m.directoryCategories.join(', ') || '–'}</td>
                        <td>
                          {m.listedInDirectory ? (m.directoryHidden ? 'Versteckt' : 'Ja') : 'Nein'}
                        </td>
                        <td className="members-actions">
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
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            await updateMember(editing.uid, draft);
            setEditing(null);
          }}
        />
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
