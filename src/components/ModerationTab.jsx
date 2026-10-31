import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link2,
  Mail,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAdminMembers } from '../hooks/useAdminMembers';
import { useRegionModerators } from '../hooks/useRegionModerators';
import { useModeratorInvites } from '../hooks/useModeratorInvites';
import { useRegions } from '../hooks/useRegions';
import { filterMembers, sortMembers } from '../utils/members';
import { COUNTRY_LABELS, REGION_SLUGS, STATIC_REGIONS, isPopulated } from '../utils/regions';
import { getStaffAccess, moderatorErrorMessage } from '../utils/staffRoles';
import ConfirmDialog from './ConfirmDialog';
import './ModerationTab.css';

const MAX_SEARCH_RESULTS = 8;

// Current names come from the merged register (a renamed region shows its new name).
function regionName(id, regions = STATIC_REGIONS) {
  return regions.find((r) => r.id === id)?.name || id;
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
  const { regions } = useRegions();
  return (
    <ul className="moderation-chips" aria-label="Regionen">
      {regionIds.map((id) => (
        <li key={id} className="moderation-chip">
          {regionName(id, regions)}
        </li>
      ))}
    </ul>
  );
}

// Region tick boxes of the moderator and invitation dialogs. Regions without districts
// in the register are not offered; one already chosen stays visible so it can be removed.
function RegionFieldset({ regionIds, onChange, firstFieldRef }) {
  const { regions } = useRegions();
  const activeById = useMemo(() => new Map(regions.map((r) => [r.id, r.active])), [regions]);
  const choiceIds = useMemo(() => {
    const populated = new Set(regions.filter(isPopulated).map((r) => r.id));
    return REGION_SLUGS.filter((id) => populated.has(id) || regionIds.includes(id));
  }, [regions, regionIds]);

  const toggleRegion = (id) =>
    onChange((prev) =>
      prev.includes(id)
        ? prev.filter((r) => r !== id)
        : REGION_SLUGS.filter((r) => r === id || prev.includes(r))
    );

  return (
    <fieldset className="moderation-regions">
      <legend>Regionen</legend>
      {choiceIds.map((id, index) => {
        const country = regions.find((r) => r.id === id)?.country;
        const prevCountry = regions.find((r) => r.id === choiceIds[index - 1])?.country;
        return (
          <Fragment key={id}>
            {country !== prevCountry && (
              <span className="moderation-country">{COUNTRY_LABELS[country]}</span>
            )}
            <label className="moderation-check">
              <input
                ref={index === 0 ? firstFieldRef : undefined}
                type="checkbox"
                checked={regionIds.includes(id)}
                onChange={() => toggleRegion(id)}
              />
              <span>
                {regionName(id, regions)}
                {activeById.get(id) === false && (
                  <span className="moderation-inactive"> (noch nicht freigeschaltet)</span>
                )}
              </span>
            </label>
          </Fragment>
        );
      })}
    </fieldset>
  );
}

function ModeratorDialog({ mode, moderator, moderatorUids, currentUid, onSave, onClose }) {
  const isAdd = mode === 'add';
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

        <RegionFieldset
          regionIds={regionIds}
          onChange={setRegionIds}
          firstFieldRef={!isAdd ? firstFieldRef : undefined}
        />
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function inviteAdminErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const message = String(err?.message || '');
  if (code === 'invalid-argument' && /email/i.test(message)) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  }
  if (code === 'invalid-argument' && /at least one region/i.test(message)) {
    return 'Wähle mindestens eine Region.';
  }
  if (code === 'failed-precondition' && /own role/i.test(message)) {
    return 'Dich selbst kannst du nicht einladen.';
  }
  if (code === 'not-found') return 'Diese Einladung gibt es nicht mehr.';
  return moderatorErrorMessage(err);
}

function formatDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// "Per E-Mail einladen": address + regions, then the result (mail sent or not) with
// the link to copy.
function InviteDialog({ onInvite, onClose }) {
  const [email, setEmail] = useState('');
  const [regionIds, setRegionIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
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

  const trimmed = email.trim();
  const canSave = EMAIL_PATTERN.test(trimmed) && regionIds.length > 0 && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await onInvite(trimmed, regionIds));
    } catch (err) {
      setError(inviteAdminErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const titleId = 'moderation-invite-title';

  return (
    <div className="moderation-dialog-backdrop" role="presentation">
      <form
        className="moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        data-testid="moderation-invite-dialog"
      >
        <h2 id={titleId}>Per E-Mail einladen</h2>
        {result ? (
          <>
            <p
              className={result.emailSent ? 'moderation-notice' : 'moderation-error'}
              role="status"
              data-testid="moderation-invite-result"
            >
              {result.emailSent
                ? `Die Einladung ist unterwegs an ${trimmed}. Sie gilt bis ${formatDay(result.expiresAt)}.`
                : `Die E-Mail an ${trimmed} konnte nicht gesendet werden. Kopiere den Link und schick ihn selbst.`}
            </p>
            <div className="moderation-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => setCopied(await copyText(result.inviteUrl))}
              >
                <Link2 size={16} aria-hidden="true" />
                <span>{copied ? 'Link kopiert' : 'Link kopieren'}</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Fertig
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="moderation-hint">
              Die Person bekommt eine E-Mail mit einem Link zu einer kurzen Einführung. Sobald sie
              diese abgeschlossen und unterschrieben hat, ist sie Moderator:in der gewählten
              Regionen. Der Link gilt 14 Tage.
            </p>
            <label className="moderation-search">
              <span>E-Mail-Adresse</span>
              <input
                ref={firstFieldRef}
                type="email"
                className="moderation-email-input"
                placeholder="name@beispiel.at"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <RegionFieldset regionIds={regionIds} onChange={setRegionIds} />
            {regionIds.length === 0 && (
              <p className="moderation-hint">Wähle mindestens eine Region.</p>
            )}
            {error && (
              <p className="moderation-error" role="alert">
                {error}
              </p>
            )}
            <div className="moderation-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canSave}>
                <Send size={16} aria-hidden="true" />
                <span>{saving ? 'Wird gesendet …' : 'Einladung senden'}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

// Open invitations with "Link kopieren", "Erneut senden" and "Widerrufen". Only the
// hash of a link is stored, so a link is known only right after it was made; for
// older invitations "Link kopieren" makes a new one (the mailed link stops working).
function InviteList({ invites, links, busyId, onCopy, onResend, onRevoke }) {
  return (
    <section className="moderation-invites" aria-labelledby="moderation-invites-title">
      <h3 id="moderation-invites-title" className="moderation-invites-title">
        Offene Einladungen
      </h3>
      <ul className="moderation-list" aria-label="Offene Einladungen">
        {invites.map((inv) => (
          <li key={inv.inviteId} className="moderation-card" data-testid="moderation-invite-row">
            <div className="moderation-card-person">
              <span className="moderation-card-name">
                <Mail size={14} aria-hidden="true" /> {inv.email}
              </span>
              <span className="moderation-card-email">
                {inv.expired
                  ? 'Abgelaufen'
                  : `Wartet auf Annahme · gültig bis ${formatDay(inv.expiresAt)}`}
              </span>
            </div>
            <RegionChips regionIds={inv.regionIds} />
            <div className="moderation-card-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onCopy(inv)}
                disabled={busyId === inv.inviteId}
                aria-label={`Link für ${inv.email} kopieren`}
              >
                <Link2 size={14} aria-hidden="true" />
                <span>{links[inv.inviteId] ? 'Link kopieren' : 'Neuen Link kopieren'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onResend(inv)}
                disabled={busyId === inv.inviteId}
                aria-label={`Einladung an ${inv.email} erneut senden`}
              >
                <Send size={14} aria-hidden="true" />
                <span>Erneut senden</span>
              </button>
              <button
                type="button"
                className="btn btn-subtle-danger btn-sm"
                onClick={() => onRevoke(inv)}
                disabled={busyId === inv.inviteId}
                aria-label={`Einladung an ${inv.email} widerrufen`}
              >
                <X size={14} aria-hidden="true" />
                <span>Widerrufen</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
  const { regions } = useRegions();
  const invitesApi = useModeratorInvites(isSuperAdmin);
  // Links made in this visit, by invite id (only the hash is stored on the server).
  const [links, setLinks] = useState({});
  const [busyInviteId, setBusyInviteId] = useState(null);
  const [revokeInvite, setRevokeInvite] = useState(null);
  const [newLinkInvite, setNewLinkInvite] = useState(null);

  const moderatorUids = useMemo(() => new Set(moderators.map((m) => m.uid)), [moderators]);

  if (!isSuperAdmin) return null;

  const save = async (person, regionIds) => {
    const result = await setRegions(person.uid, regionIds);
    setDialog(null);
    setNotice(
      result?.changed === false
        ? `Für ${personLabel(person)} war schon alles so eingestellt.`
        : `Gespeichert: ${personLabel(person)} moderiert ${regionIds.map((id) => regionName(id, regions)).join(', ')}.`
    );
  };

  const createInvite = async (email, regionIds, options) => {
    const result = await invitesApi.invite(email, regionIds, options);
    setLinks((prev) => ({ ...prev, [result.inviteId]: result.inviteUrl }));
    return result;
  };

  const runInviteAction = async (inv, action) => {
    setNotice(null);
    setBusyInviteId(inv.inviteId);
    try {
      await action();
    } catch (err) {
      setNotice(inviteAdminErrorMessage(err));
    } finally {
      setBusyInviteId(null);
    }
  };

  const copyInviteLink = (inv) => {
    if (!links[inv.inviteId]) {
      setNewLinkInvite(inv);
      return;
    }
    runInviteAction(inv, async () => {
      const ok = await copyText(links[inv.inviteId]);
      setNotice(ok ? `Link für ${inv.email} kopiert.` : `Link: ${links[inv.inviteId]}`);
    });
  };

  const makeNewLink = () => {
    const inv = newLinkInvite;
    setNewLinkInvite(null);
    runInviteAction(inv, async () => {
      const result = await createInvite(inv.email, inv.regionIds, { sendEmail: false });
      const ok = await copyText(result.inviteUrl);
      setNotice(
        ok
          ? `Neuer Link für ${inv.email} kopiert.`
          : `Neuer Link für ${inv.email}: ${result.inviteUrl}`
      );
    });
  };

  const resendInvite = (inv) =>
    runInviteAction(inv, async () => {
      const result = await createInvite(inv.email, inv.regionIds);
      setNotice(
        result.emailSent
          ? `Die Einladung wurde erneut an ${inv.email} gesendet.`
          : `Die E-Mail an ${inv.email} konnte nicht gesendet werden. Nutze „Link kopieren“.`
      );
    });

  const confirmRevokeInvite = () => {
    const inv = revokeInvite;
    setRevokeInvite(null);
    runInviteAction(inv, async () => {
      await invitesApi.revoke(inv.inviteId);
      setNotice(`Die Einladung an ${inv.email} wurde widerrufen.`);
    });
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
        <div className="moderation-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setNotice(null);
              setDialog({ mode: 'invite' });
            }}
            data-testid="moderation-invite"
          >
            <Mail size={16} aria-hidden="true" />
            <span>Per E-Mail einladen</span>
          </button>
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

      {invitesApi.invites.length > 0 && (
        <InviteList
          invites={invitesApi.invites}
          links={links}
          busyId={busyInviteId}
          onCopy={copyInviteLink}
          onResend={resendInvite}
          onRevoke={(inv) => {
            setNotice(null);
            setRevokeInvite(inv);
          }}
        />
      )}

      {dialog?.mode === 'invite' && (
        <InviteDialog
          onInvite={(email, regionIds) => createInvite(email, regionIds)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog && dialog.mode !== 'invite' && (
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

      <ConfirmDialog
        isOpen={Boolean(revokeInvite)}
        danger
        title="Einladung widerrufen?"
        confirmLabel="Widerrufen"
        cancelLabel="Abbrechen"
        onConfirm={confirmRevokeInvite}
        onCancel={() => setRevokeInvite(null)}
      >
        <p>Der Link an {revokeInvite?.email} funktioniert danach nicht mehr.</p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={Boolean(newLinkInvite)}
        title="Neuen Link erzeugen?"
        confirmLabel="Neuen Link kopieren"
        cancelLabel="Abbrechen"
        onConfirm={makeNewLink}
        onCancel={() => setNewLinkInvite(null)}
      >
        <p>
          Aus Sicherheitsgründen speichern wir Links nicht. Ein neuer Link für{' '}
          {newLinkInvite?.email} ersetzt den bisherigen: Der Link aus der E-Mail funktioniert danach
          nicht mehr.
        </p>
      </ConfirmDialog>
    </div>
  );
}
