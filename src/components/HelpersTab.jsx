import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Inbox,
  ArrowUp,
  ArrowDown,
  GripVertical,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useHelpers } from '../hooks/useHelpers';
import HelperEditDialog from './HelperEditDialog';
import ConfirmDialog from './ConfirmDialog';
import './HelpersTab.css';

// Admin tab: manage the "Helfer" (helpers) registry shown on the public
// "Über uns" page. Each helper is one of the people who keep the tribe
// running — web hosting, photography, event hosting, etc. Admins can add,
// edit, delete and reorder helpers.
export default function HelpersTab() {
  const {
    helpers,
    loading,
    error,
    isAdmin,
    addHelper,
    updateHelper,
    deleteHelper,
    reorderHelpers,
  } = useHelpers();

  const [editing, setEditing] = useState(null); // { mode, helper }
  const [deleting, setDeleting] = useState(null);

  const [pendingOrder, setPendingOrder] = useState(null);
  const [reordering, setReordering] = useState(false);

  const orderedHelpers = useMemo(() => {
    if (!pendingOrder) return helpers;
    const byId = new Map(helpers.map((h) => [h.id, h]));
    const reordered = pendingOrder.map((id) => byId.get(id)).filter(Boolean);
    const reorderedIds = new Set(pendingOrder);
    for (const h of helpers) {
      if (!reorderedIds.has(h.id)) reordered.push(h);
    }
    return reordered;
  }, [helpers, pendingOrder]);

  const handleAdd = useCallback(() => {
    setEditing({ mode: 'create', helper: null });
  }, []);

  const handleEdit = useCallback((helper) => {
    setEditing({ mode: 'edit', helper });
  }, []);

  const handleSave = useCallback(
    async (payload) => {
      if (!editing) return;
      if (editing.mode === 'create') {
        await addHelper(payload);
      } else {
        await updateHelper(editing.helper.id, payload);
      }
      setEditing(null);
    },
    [editing, addHelper, updateHelper]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteHelper(deleting.id);
      setDeleting(null);
    } catch (err) {
      console.error('Helper delete failed:', err);
      setDeleting(null);
    }
  }, [deleting, deleteHelper]);

  const persistOrder = useCallback(
    async (newOrder) => {
      setPendingOrder(newOrder);
      setReordering(true);
      try {
        await reorderHelpers(newOrder);
      } catch (err) {
        console.error('Helper reorder failed:', err);
      } finally {
        setReordering(false);
      }
    },
    [reorderHelpers]
  );

  const moveHelper = useCallback(
    async (id, direction) => {
      if (reordering) return;
      const currentOrder = (pendingOrder || helpers).map((h) => h.id);
      const idx = currentOrder.indexOf(id);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
      const newOrder = [...currentOrder];
      [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
      await persistOrder(newOrder);
    },
    [pendingOrder, helpers, reordering, persistOrder]
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
      const currentOrder = (pendingOrder || helpers).map((h) => h.id);
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
    [pendingOrder, helpers, reordering, persistOrder, dropPosition]
  );

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDropTargetId(null);
  }, []);

  if (loading) {
    return <div className="loading-spinner" data-testid="helpers-tab-loading" />;
  }

  if (error) {
    return (
      <div className="helpers-tab-error" role="alert" data-testid="helpers-tab-error">
        Helfer konnten nicht geladen werden: {error}
      </div>
    );
  }

  return (
    <div className="helpers-tab" data-testid="helpers-tab">
      <div className="helpers-tab-toolbar">
        <p className="helpers-tab-description">
          Hier verwaltest du die Liste der Menschen, die tribe Vorarlberg unterstützen —
          Fotograf:innen, Helfer:innen bei Events, Webhosting und mehr. Diese Liste erscheint auf
          der öffentlichen „Über uns-Seite, damit sich alle sehen und willkommen fühlen können.
          Reihenfolge, Fotos und Kurzbeschreibungen sind frei wählbar.
        </p>
        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAdd}
            data-testid="helpers-tab-add"
          >
            <Plus size={18} aria-hidden="true" />
            <span>Neuer Helfer</span>
          </button>
        )}
      </div>

      {orderedHelpers.length === 0 ? (
        <div className="helpers-tab-empty" data-testid="helpers-tab-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>Noch keine Helfer</h2>
          <p>Lege den ersten Helfer an, damit die Liste auf der „Über uns-Seite erscheinen kann.</p>
        </div>
      ) : (
        <ul className="helpers-tab-list" data-testid="helpers-tab-list">
          {orderedHelpers.map((helper, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedHelpers.length - 1;
            const showDropBefore = dropTargetId === helper.id && dropPosition === 'before';
            const showDropAfter = dropTargetId === helper.id && dropPosition === 'after';
            return (
              <li
                key={helper.id}
                className={`helper-row${reordering ? ' helper-row--busy' : ''}`}
                draggable={isAdmin && !reordering}
                onDragStart={isAdmin ? (e) => handleDragStart(e, helper.id) : undefined}
                onDragOver={isAdmin ? (e) => handleDragOver(e, helper.id) : undefined}
                onDragLeave={isAdmin ? handleDragLeave : undefined}
                onDrop={isAdmin ? (e) => handleDrop(e, helper.id) : undefined}
                onDragEnd={isAdmin ? handleDragEnd : undefined}
                data-testid="helper-row"
                data-helper-id={helper.id}
                data-drop-before={showDropBefore || undefined}
                data-drop-after={showDropAfter || undefined}
              >
                <span
                  className="helper-row-drag-handle"
                  aria-hidden="true"
                  data-testid="helper-row-drag-handle"
                >
                  <GripVertical size={18} />
                </span>
                <div className="helper-row-photo-wrap" aria-hidden="true">
                  {helper.photoURL ? (
                    <img src={helper.photoURL} alt="" className="helper-row-photo" loading="lazy" />
                  ) : (
                    <span className="helper-row-photo-placeholder">
                      {helper.name?.slice(0, 1)?.toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>
                <div className="helper-row-info">
                  <span className="helper-row-name" data-testid="helper-row-name">
                    <Users size={14} aria-hidden="true" />
                    {helper.name}
                  </span>
                  {helper.description && (
                    <span className="helper-row-description" data-testid="helper-row-description">
                      {helper.description}
                    </span>
                  )}
                  <span className="helper-row-meta" data-testid="helper-row-meta">
                    {helper.profileSlug && (
                      <span className="helper-row-meta-pill">Profil: {helper.profileSlug}</span>
                    )}
                    {helper.website && (
                      <span className="helper-row-meta-pill">
                        <ExternalLink size={12} aria-hidden="true" />
                        Website
                      </span>
                    )}
                  </span>
                </div>
                {isAdmin && (
                  <div className="helper-row-reorder">
                    <button
                      type="button"
                      className="helper-row-reorder-btn"
                      onClick={() => moveHelper(helper.id, 'up')}
                      disabled={isFirst || reordering}
                      aria-label={`${helper.name} nach oben verschieben`}
                      data-testid="helper-row-up"
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="helper-row-reorder-btn"
                      onClick={() => moveHelper(helper.id, 'down')}
                      disabled={isLast || reordering}
                      aria-label={`${helper.name} nach unten verschieben`}
                      data-testid="helper-row-down"
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                {isAdmin && (
                  <div className="helper-row-actions">
                    <button
                      type="button"
                      className="helper-row-action"
                      onClick={() => handleEdit(helper)}
                      aria-label={`Helfer ${helper.name} bearbeiten`}
                      data-testid="helper-row-edit"
                    >
                      <Pencil size={16} aria-hidden="true" />
                      <span>Bearbeiten</span>
                    </button>
                    <button
                      type="button"
                      className="helper-row-action helper-row-action--danger"
                      onClick={() => setDeleting(helper)}
                      aria-label={`Helfer ${helper.name} löschen`}
                      data-testid="helper-row-delete"
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

      <HelperEditDialog
        open={Boolean(editing)}
        mode={editing?.mode || 'create'}
        helper={editing?.helper || null}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="Helfer löschen?"
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
              Soll <strong>&bdquo;{deleting.name}&ldquo;</strong> wirklich aus der Helferliste
              entfernt werden?
            </p>
            <p>Diese Aktion lässt sich nicht rückgängig machen.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
