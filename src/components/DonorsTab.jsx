import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Heart,
  Inbox,
  ArrowUp,
  ArrowDown,
  GripVertical,
  AlertTriangle,
} from 'lucide-react';
import { useDonors } from '../hooks/useDonors';
import DonorEditDialog from './DonorEditDialog';
import ConfirmDialog from './ConfirmDialog';
import './DonorsTab.css';

function formatAmount(value) {
  if (value == null) return '';
  return value.toFixed(2).replace('.', ',');
}

function donorLabel(donor) {
  if (donor.name && donor.name.trim()) return donor.name;
  return 'Anonym';
}

function donorSubLabel(donor) {
  const parts = [];
  if (donor.amount != null) parts.push(`${formatAmount(donor.amount)} €`);
  if (donor.frequency === 'monthly') parts.push('monatlich');
  else if (donor.frequency === 'one-time') parts.push('einmalig');
  return parts.join(' · ');
}

// Admin tab: manage the list of previous donors shown on the public "Über
// uns" page. Admins add entries manually after the donor has opted in to
// being listed — privacy note is reinforced in the empty state and the
// dialog ("Anonym" toggle).
export default function DonorsTab() {
  const { donors, loading, error, isAdmin, addDonor, updateDonor, deleteDonor, reorderDonors } =
    useDonors();

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [pendingOrder, setPendingOrder] = useState(null);
  const [reordering, setReordering] = useState(false);

  const orderedDonors = useMemo(() => {
    if (!pendingOrder) return donors;
    const byId = new Map(donors.map((d) => [d.id, d]));
    const reordered = pendingOrder.map((id) => byId.get(id)).filter(Boolean);
    const reorderedIds = new Set(pendingOrder);
    for (const d of donors) {
      if (!reorderedIds.has(d.id)) reordered.push(d);
    }
    return reordered;
  }, [donors, pendingOrder]);

  const handleAdd = useCallback(() => {
    setEditing({ mode: 'create', donor: null });
  }, []);

  const handleEdit = useCallback((donor) => {
    setEditing({ mode: 'edit', donor });
  }, []);

  const handleSave = useCallback(
    async (payload) => {
      if (!editing) return;
      if (editing.mode === 'create') {
        await addDonor(payload);
      } else {
        await updateDonor(editing.donor.id, payload);
      }
      setEditing(null);
    },
    [editing, addDonor, updateDonor]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteDonor(deleting.id);
      setDeleting(null);
    } catch (err) {
      console.error('Donor delete failed:', err);
      setDeleting(null);
    }
  }, [deleting, deleteDonor]);

  const persistOrder = useCallback(
    async (newOrder) => {
      setPendingOrder(newOrder);
      setReordering(true);
      try {
        await reorderDonors(newOrder);
      } catch (err) {
        console.error('Donor reorder failed:', err);
      } finally {
        setReordering(false);
      }
    },
    [reorderDonors]
  );

  const moveDonor = useCallback(
    async (id, direction) => {
      if (reordering) return;
      const currentOrder = (pendingOrder || donors).map((d) => d.id);
      const idx = currentOrder.indexOf(id);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
      const newOrder = [...currentOrder];
      [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
      await persistOrder(newOrder);
    },
    [pendingOrder, donors, reordering, persistOrder]
  );

  const draggedIdRef = useRef(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState('before');

  const handleDragStart = useCallback((e, id) => {
    draggedIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}
  }, []);

  const handleDragOver = useCallback((e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    setDropTargetId(id);
    setDropPosition(e.clientY < midpoint ? 'before' : 'after');
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetId(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e, targetId) => {
      e.preventDefault();
      const draggedId = draggedIdRef.current || e.dataTransfer.getData('text/plain');
      draggedIdRef.current = null;
      setDropTargetId(null);
      if (!draggedId || draggedId === targetId || reordering) return;
      const currentOrder = (pendingOrder || donors).map((d) => d.id);
      const fromIdx = currentOrder.indexOf(draggedId);
      const toIdx = currentOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      const adjustedTargetIdx = newOrder.indexOf(targetId);
      const insertAt = dropPosition === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
      newOrder.splice(insertAt, 0, draggedId);
      await persistOrder(newOrder);
    },
    [pendingOrder, donors, reordering, persistOrder, dropPosition]
  );

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDropTargetId(null);
  }, []);

  if (loading) {
    return <div className="loading-spinner" data-testid="donors-tab-loading" />;
  }

  if (error) {
    return (
      <div className="donors-tab-error" role="alert" data-testid="donors-tab-error">
        Spender konnten nicht geladen werden: {error}
      </div>
    );
  }

  return (
    <div className="donors-tab" data-testid="donors-tab">
      <div className="donors-tab-toolbar">
        <p className="donors-tab-description">
          Hier verwaltest du die Liste der bisherigen Spender:innen auf der öffentlichen „Über
          uns-Seite. Füge einen Eintrag erst hinzu, wenn die Person ausdrücklich zugestimmt hat,
          namentlich genannt zu werden — Spender:innen können anonym oder namentlich erscheinen, mit
          oder ohne Betrag.
        </p>
        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAdd}
            data-testid="donors-tab-add"
          >
            <Plus size={18} aria-hidden="true" />
            <span>Neuer Spender</span>
          </button>
        )}
      </div>

      {orderedDonors.length === 0 ? (
        <div className="donors-tab-empty" data-testid="donors-tab-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>Noch keine Spender</h2>
          <p>
            Sobald du Spender:innen hinzufügst, erscheinen sie auf der „Über uns-Seite unter dem
            Spenden-Block.
          </p>
        </div>
      ) : (
        <ul className="donors-tab-list" data-testid="donors-tab-list">
          {orderedDonors.map((donor, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedDonors.length - 1;
            const showDropBefore = dropTargetId === donor.id && dropPosition === 'before';
            const showDropAfter = dropTargetId === donor.id && dropPosition === 'after';
            const subLabel = donorSubLabel(donor);
            const isAnonymous = !donor.name;
            return (
              <li
                key={donor.id}
                className={`donor-row${reordering ? ' donor-row--busy' : ''}`}
                draggable={isAdmin && !reordering}
                onDragStart={isAdmin ? (e) => handleDragStart(e, donor.id) : undefined}
                onDragOver={isAdmin ? (e) => handleDragOver(e, donor.id) : undefined}
                onDragLeave={isAdmin ? handleDragLeave : undefined}
                onDrop={isAdmin ? (e) => handleDrop(e, donor.id) : undefined}
                onDragEnd={isAdmin ? handleDragEnd : undefined}
                data-testid="donor-row"
                data-donor-id={donor.id}
                data-drop-before={showDropBefore || undefined}
                data-drop-after={showDropAfter || undefined}
              >
                <span
                  className="donor-row-drag-handle"
                  aria-hidden="true"
                  data-testid="donor-row-drag-handle"
                >
                  <GripVertical size={18} />
                </span>
                <div className="donor-row-info">
                  <span className="donor-row-name" data-testid="donor-row-name">
                    <Heart size={14} aria-hidden="true" />
                    {donorLabel(donor)}
                    {isAnonymous && (
                      <span className="donor-row-tag" data-testid="donor-row-anonymous-tag">
                        anonym
                      </span>
                    )}
                  </span>
                  {subLabel && (
                    <span className="donor-row-meta" data-testid="donor-row-meta">
                      {subLabel}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="donor-row-reorder">
                    <button
                      type="button"
                      className="donor-row-reorder-btn"
                      onClick={() => moveDonor(donor.id, 'up')}
                      disabled={isFirst || reordering}
                      aria-label={`${donorLabel(donor)} nach oben verschieben`}
                      data-testid="donor-row-up"
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="donor-row-reorder-btn"
                      onClick={() => moveDonor(donor.id, 'down')}
                      disabled={isLast || reordering}
                      aria-label={`${donorLabel(donor)} nach unten verschieben`}
                      data-testid="donor-row-down"
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                {isAdmin && (
                  <div className="donor-row-actions">
                    <button
                      type="button"
                      className="donor-row-action"
                      onClick={() => handleEdit(donor)}
                      aria-label={`Spender ${donorLabel(donor)} bearbeiten`}
                      data-testid="donor-row-edit"
                    >
                      <Pencil size={16} aria-hidden="true" />
                      <span>Bearbeiten</span>
                    </button>
                    <button
                      type="button"
                      className="donor-row-action donor-row-action--danger"
                      onClick={() => setDeleting(donor)}
                      aria-label={`Spender ${donorLabel(donor)} löschen`}
                      data-testid="donor-row-delete"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span>Löschen</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DonorEditDialog
        open={Boolean(editing)}
        mode={editing?.mode || 'create'}
        donor={editing?.donor || null}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="Spender löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (
          <>
            <p>
              <AlertTriangle
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: 'middle', marginRight: 6 }}
              />
              Soll der Eintrag für <strong>&bdquo;{donorLabel(deleting)}&ldquo;</strong> wirklich
              aus der Spenderliste entfernt werden?
            </p>
            <p>Diese Aktion lässt sich nicht rückgängig machen.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
