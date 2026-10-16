import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Search, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAdminMembers } from '../hooks/useAdminMembers';
import { useRegionModerators } from '../hooks/useRegionModerators';
import { useRegions } from '../hooks/useRegions';
import { filterMembers, sortMembers } from '../utils/members';
import { COUNTRY_LABELS, REGION_SLUGS, STATIC_REGIONS } from '../utils/regions';
import { getStaffAccess, moderatorErrorMessage } from '../utils/staffRoles';
import ConfirmDialog from './ConfirmDialog';
import './ModerationTab.css';

const MAX_SEARCH_RESULTS = 8;

function regionName(id) {
  return STATIC_REGIONS.find((r) => r.id === id)?.name || id;
}

function personLabel(person) {
  return person?.displayName || person?.email || 'Unbekannte Person';
}

// Why a member cannot be picked as a new moderator (null = selectable).
function blockedReason(member, { currentUid, moderatorUids }) {
  if (member.uid === currentUid) return 'Das bist du';
  if (member.staffRole === 'Admin') return 'Super-Admin';
  if (member.staffRole === 'RegionModerator' || moderatorUids.has(member.uid)) {
    return 'Schon Moderator:in';
  }
  return null;
}

function RegionChips({ regionIds }) {
  return (
    <ul className="moderation-chips" aria-label="Regionen">
      {regionIds.map((id) => (
        <li key={id} className="moderation-chip">
          {regionName(id)}
        </li>
      ))}
    </ul>
  );
}

function ModeratorDialog({ mode, moderator, moderatorUids, currentUid, onSave, onClose }) {
  const isAdd = mode === 'add';
  const { regions } = useRegions();
  const { members, loading: membersLoading, error: membersError } = useAdminMembers(isAdd);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(isAdd ? null : moderator);
  const [regionIds, setRegionIds] = useState(isAdd ? [] : moderator.regionIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const results = useMemo(() => {
    if (!isAdd || !search.trim()) return [];
    return sortMembers(filterMembers(members, { search }), 'displayName', 'asc').slice(
      0,
      MAX_SEARCH_RESULTS
    );
  }, [isAdd, members, search]);

  const activeById = useMemo(() => new Map(regions.map((r) => [r.id, r.active])), [regions]);

  const toggleRegion = (id) =>
    setRegionIds((prev) =>
      prev.includes(id)
        ? prev.filter((r) => r !== id)
        : REGION_SLUGS.filter((r) => r === id || prev.includes(r))
    );

  const canSave = Boolean(selected) && regionIds.length > 0 && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selected, regionIds);
    } catch (err) {
      setError(moderatorErrorMessage(err));
      setSaving(false);
    }
  };

  const titleId = 'moderation-dialog-title';

  return (
    <div className="moderation-dialog-backdrop" role="presentation">
      <form
        className="moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        data-testid="moderation-dialog"
      >
        <h2 id={titleId}>{isAdd ? 'Moderator:in hinzufügen' : 'Regionen ändern'}</h2>

        {isAdd ? (
          <div className="moderation-person-picker">
            <label className="moderation-search">
              <span>Person suchen</span>
              <span className="moderation-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={firstFieldRef}
                  type="search"
                  placeholder="Name, Benutzername oder E-Mail"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected(null);
                  }}
                />
              </span>
            </label>
            {membersLoading && <p className="moderation-hint">Mitglieder werden geladen …</p>}
            {membersError && (
              <p className="moderation-error" role="alert">
                Die Mitglieder konnten nicht geladen werden. Bitte schließe das Fenster und versuche
                es erneut.
              </p>
            )}
            {!membersLoading && !membersError && search.trim() && results.length === 0 && (
              <p className="moderation-hint">Keine passende Person gefunden.</p>
            )}
            {selected ? (
              <p className="moderation-selected" data-testid="moderation-selected-person">
                Ausgewählt: <strong>{personLabel(selected)}</strong>
                {selected.email && selected.displayName ? ` (${selected.email})` : ''}
              </p>
            ) : (
              results.length > 0 && (
                <ul className="moderation-results" aria-label="Suchergebnisse">
                  {results.map((m) => {
                    const reason = blockedReason(m, { currentUid, moderatorUids });
                    return (
                      <li key={m.uid}>
                        <button
                          type="button"
                          className="moderation-result"
                          disabled={Boolean(reason)}
                          onClick={() => setSelected(m)}
                        >
                          <span className="moderation-result-name">{personLabel(m)}</span>
                          {m.email && m.displayName && (
                            <span className="moderation-result-email">{m.email}</span>
                          )}
                          {reason && <span className="moderation-result-tag">{reason}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        ) : (
          <p className="moderation-hint">
            Für <strong>{personLabel(moderator)}</strong>
            {moderator.email && moderator.displayName ? ` (${moderator.email})` : ''}
          </p>
        )}

        <fieldset className="moderation-regions">
          <legend>Regionen</legend>
          {REGION_SLUGS.map((id, index) => {
            const country = STATIC_REGIONS.find((r) => r.id === id)?.country;
            const prevCountry = STATIC_REGIONS[index - 1]?.country;
            return (
              <Fragment key={id}>
                {country !== prevCountry && (
                  <span className="moderation-country">{COUNTRY_LABELS[country]}</span>
                )}
                <label className="moderation-check">
                  <input
                    ref={!isAdd && index === 0 ? firstFieldRef : undefined}
                    type="checkbox"
                    checked={regionIds.includes(id)}
                    onChange={() => toggleRegion(id)}
                  />
                  <span>
                    {regionName(id)}
                    {activeById.get(id) === false && (
                      <span className="moderation-inactive"> (noch nicht freigeschaltet)</span>
                    )}
                  </span>
                </label>
              </Fragment>
            );
          })}
        </fieldset>
        {regionIds.length === 0 && (
          <p className="moderation-hint">
            {isAdd
              ? 'Wähle mindestens eine Region.'
              : 'Mindestens eine Region muss ausgewählt bleiben. Um die Rolle ganz wegzunehmen, nutze „Rolle entziehen“.'}
          </p>
        )}

        {error && (
          <p className="moderation-error" role="alert">
            {error}
          </p>
        )}

        <div className="moderation-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Super-Admin tab: who moderates which region. Changes go through the
// callables adminSetRegionModerator / adminListRegionModerators, which check
// the role again on the server and keep an audit log.
export default function ModerationTab() {
  const { user, role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const { moderators, loading, error, reload, setRegions } = useRegionModerators(isSuperAdmin);
  const [dialog, setDialog] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(null);
  const [notice, setNotice] = useState(null);

  const moderatorUids = useMemo(() => new Set(moderators.map((m) => m.uid)), [moderators]);

  if (!isSuperAdmin) return null;

  const save = async (person, regionIds) => {
    const result = await setRegions(person.uid, regionIds);
    setDialog(null);
    setNotice(
      result?.changed === false
        ? `Für ${personLabel(person)} war schon alles so eingestellt.`
        : `Gespeichert: ${personLabel(person)} moderiert ${regionIds.map(regionName).join(', ')}.`
    );
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await setRegions(revokeTarget.uid, []);
      setNotice(`${personLabel(revokeTarget)} ist keine Moderator:in mehr.`);
      setRevokeTarget(null);
    } catch (err) {
      setRevokeError(moderatorErrorMessage(err));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="moderation-tab" data-testid="moderation-tab">
      <div className="moderation-header">
        <p className="moderation-intro">
          Regions-Moderator:innen prüfen die Events, Nachrichten und Verzeichnis-Einträge ihrer
          Regionen. Einstellungen der Seite (Kategorien, Theme, Instagram, Statistik) sehen sie
          nicht.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setNotice(null);
            setDialog({ mode: 'add' });
          }}
          data-testid="moderation-add"
        >
          <UserPlus size={16} aria-hidden="true" />
          <span>Moderator:in hinzufügen</span>
        </button>
      </div>

      {notice && (
        <p className="moderation-notice" role="status">
          {notice}
        </p>
      )}

      {loading && <p className="moderation-hint">Moderator:innen werden geladen …</p>}
      {!loading && error && (
        <div className="moderation-error" role="alert">
          {moderatorErrorMessage(error)}{' '}
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Erneut versuchen
          </button>
        </div>
      )}
      {!loading && !error && moderators.length === 0 && (
        <div className="moderation-empty" data-testid="moderation-empty">
          <ShieldCheck size={32} aria-hidden="true" />
          <p>Noch keine Regions-Moderator:innen. Füge die erste Person hinzu.</p>
        </div>
      )}
      {!loading && !error && moderators.length > 0 && (
        <ul className="moderation-list" aria-label="Moderator:innen">
          {moderators.map((m) => (
            <li key={m.uid} className="moderation-card" data-testid="moderation-row">
              <div className="moderation-card-person">
                <span className="moderation-card-name">{personLabel(m)}</span>
                {m.email && m.displayName && (
                  <span className="moderation-card-email">{m.email}</span>
                )}
                {m.disabled && <span className="moderation-result-tag">Konto gesperrt</span>}
              </div>
              <RegionChips regionIds={m.regionIds} />
              <div className="moderation-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setNotice(null);
                    setDialog({ mode: 'edit', moderator: m });
                  }}
                  aria-label={`Regionen von ${personLabel(m)} ändern`}
                >
                  <Pencil size={14} aria-hidden="true" />
                  <span>Regionen ändern</span>
                </button>
                <button
                  type="button"
                  className="btn btn-subtle-danger btn-sm"
                  onClick={() => {
                    setNotice(null);
                    setRevokeError(null);
                    setRevokeTarget(m);
                  }}
                  aria-label={`Rolle von ${personLabel(m)} entziehen`}
                >
                  <UserMinus size={14} aria-hidden="true" />
                  <span>Rolle entziehen</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <ModeratorDialog
          mode={dialog.mode}
          moderator={dialog.moderator}
          moderatorUids={moderatorUids}
          currentUid={user?.uid}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        danger
        title="Rolle entziehen?"
        confirmLabel="Rolle entziehen"
        cancelLabel="Abbrechen"
        onConfirm={revoke}
        onCancel={() => setRevokeTarget(null)}
        loading={revoking}
      >
        <p>
          {personLabel(revokeTarget)} kann danach keine Events mehr freigeben und sieht die
          Verwaltung nur noch wie alle anderen Mitglieder.
        </p>
        {revokeError && (
          <p className="moderation-error" role="alert">
            {revokeError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
