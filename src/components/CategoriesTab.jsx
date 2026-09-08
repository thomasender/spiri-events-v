import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  AlertTriangle,
  Inbox,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { useAllEvents } from '../hooks/useEvents';
import CategoryEditDialog from './CategoryEditDialog';
import ConfirmDialog from './ConfirmDialog';
import './CategoriesTab.css';

// Admin tab: full CRUD over the categories registry. Lists every category
// in the admin-defined order with its color swatch, edit/delete actions,
// and a count of approved events currently using the category (so admins
// see the blast radius before deleting or renaming). Categories can be
// reordered via up/down buttons (keyboard-accessible) or by dragging the
// row onto another row (mouse-only, since native HTML5 DnD has no keyboard
// equivalent on its own).
export default function CategoriesTab() {
  const {
    categories,
    loading,
    error,
    nameExists,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  } = useCategoryRegistry();
  const { events } = useAllEvents();

  const [editing, setEditing] = useState(null); // { mode, id, name, color }
  const [deleting, setDeleting] = useState(null); // category

  // Local view of the order. Starts in sync with the registry; when the admin
  // reorders we apply the change locally first so the UI updates instantly,
  // then write the new ordering to Firestore. Resets whenever the registry
  // changes (e.g. another admin reorders, a category is added or deleted)
  // so we never show a stale local order on top of fresh server data.
  const [pendingOrder, setPendingOrder] = useState(null);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    setPendingOrder(null);
  }, [categories]);

  const orderedCategories = useMemo(() => {
    if (!pendingOrder) return categories;
    const byId = new Map(categories.map((cat) => [cat.id, cat]));
    const reordered = pendingOrder.map((id) => byId.get(id)).filter(Boolean);
    const reorderedIds = new Set(pendingOrder);
    // Append any categories the registry knows about but the pending order
    // doesn't mention yet (e.g. one was just added in another tab).
    for (const cat of categories) {
      if (!reorderedIds.has(cat.id)) reordered.push(cat);
    }
    return reordered;
  }, [categories, pendingOrder]);

  const eventCountByCategory = useMemo(() => {
    const counts = new Map();
    for (const e of events) {
      if (e.status !== 'approved' || !e.category) continue;
      counts.set(e.category, (counts.get(e.category) || 0) + 1);
    }
    return counts;
  }, [events]);

  const handleAdd = useCallback(() => {
    setEditing({ mode: 'create', id: null, name: '', color: '#c48e6a' });
  }, []);

  const handleEdit = useCallback((category) => {
    setEditing({
      mode: 'edit',
      id: category.id,
      name: category.name,
      color: category.color,
    });
  }, []);

  const handleSave = useCallback(
    async ({ name, color }) => {
      if (!editing) return;
      if (editing.mode === 'create') {
        await addCategory({ name, color });
      } else {
        await updateCategory(editing.id, { name, color });
      }
    },
    [editing, addCategory, updateCategory]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteCategory(deleting.id);
      setDeleting(null);
    } catch (err) {
      console.error('Category delete failed:', err);
      setDeleting(null);
    }
  }, [deleting, deleteCategory]);

  // Persist the new ordering to Firestore. Caller passes the full list of
  // ids in their desired top-to-bottom order; we apply it locally so the
  // UI updates immediately, then commit. Any failure (e.g. permission
  // denied) reverts to the registry's view via the categories useEffect.
  const persistOrder = useCallback(
    async (newOrder) => {
      setPendingOrder(newOrder);
      setReordering(true);
      try {
        await reorderCategories(newOrder);
      } catch (err) {
        console.error('Category reorder failed:', err);
        setPendingOrder(null);
      } finally {
        setReordering(false);
      }
    },
    [reorderCategories]
  );

  const moveCategory = useCallback(
    async (id, direction) => {
      if (reordering) return;
      const currentOrder = (pendingOrder || categories).map((cat) => cat.id);
      const idx = currentOrder.indexOf(id);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
      const newOrder = [...currentOrder];
      [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
      await persistOrder(newOrder);
    },
    [pendingOrder, categories, reordering, persistOrder]
  );

  // Native HTML5 drag-and-drop. The whole row is draggable so touch / mobile
  // long-press also works; the GripVertical icon is a visual affordance,
  // not the sole drag handle.
  const draggedIdRef = useRef(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState('before'); // 'before' | 'after'

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
    // Only clear when leaving the row entirely (not when crossing child
    // elements), otherwise the drop indicator flickers mid-drag.
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
      const currentOrder = (pendingOrder || categories).map((cat) => cat.id);
      const fromIdx = currentOrder.indexOf(draggedId);
      const toIdx = currentOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      // After removing the dragged item, the target's index may have shifted.
      const adjustedTargetIdx = newOrder.indexOf(targetId);
      const insertAt = dropPosition === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
      newOrder.splice(insertAt, 0, draggedId);
      await persistOrder(newOrder);
    },
    [pendingOrder, categories, reordering, persistOrder, dropPosition]
  );

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDropTargetId(null);
  }, []);

  if (loading) {
    return <div className="loading-spinner" data-testid="categories-tab-loading" />;
  }

  if (error) {
    return (
      <div className="categories-tab-error" role="alert" data-testid="categories-tab-error">
        Kategorien konnten nicht geladen werden: {error}
      </div>
    );
  }

  return (
    <div className="categories-tab" data-testid="categories-tab">
      <div className="categories-tab-toolbar">
        <p className="categories-tab-description">
          Verwalte hier alle Kategorien, die im Kalender als Filter-Chips und auf Events angezeigt
          werden. Neue Kategorien entstehen automatisch, sobald ein Event mit einem neuen
          Kategorienamen genehmigt wird — du kannst sie hier aber jederzeit anlegen, umbenennen,
          löschen oder per Pfeil-Button / Drag &amp; Drop umsortieren. Die hier festgelegte
          Reihenfolge wird im Kalender als Filter-Reihenfolge übernommen.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAdd}
          data-testid="categories-tab-add"
        >
          <Plus size={18} aria-hidden="true" />
          <span>Neue Kategorie</span>
        </button>
      </div>

      {orderedCategories.length === 0 ? (
        <div className="categories-tab-empty" data-testid="categories-tab-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>Noch keine Kategorien</h2>
          <p>Lege die erste Kategorie an, damit Events im Kalender zugeordnet werden können.</p>
        </div>
      ) : (
        <ul className="categories-tab-list" data-testid="categories-tab-list">
          {orderedCategories.map((category, index) => {
            const count = eventCountByCategory.get(category.name) || 0;
            const isFirst = index === 0;
            const isLast = index === orderedCategories.length - 1;
            const showDropBefore = dropTargetId === category.id && dropPosition === 'before';
            const showDropAfter = dropTargetId === category.id && dropPosition === 'after';
            return (
              <li
                key={category.id}
                className={`category-row${reordering ? ' category-row--busy' : ''}`}
                draggable={!reordering}
                onDragStart={(e) => handleDragStart(e, category.id)}
                onDragOver={(e) => handleDragOver(e, category.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, category.id)}
                onDragEnd={handleDragEnd}
                data-testid="category-row"
                data-category-id={category.id}
                data-drop-before={showDropBefore || undefined}
                data-drop-after={showDropAfter || undefined}
              >
                <span
                  className="category-row-drag-handle"
                  aria-hidden="true"
                  data-testid="category-row-drag-handle"
                >
                  <GripVertical size={18} />
                </span>
                <span
                  className="category-row-swatch"
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                  data-testid="category-row-swatch"
                />
                <div className="category-row-info">
                  <span className="category-row-name" data-testid="category-row-name">
                    <Tag size={14} aria-hidden="true" />
                    {category.name}
                  </span>
                  <span className="category-row-meta" data-testid="category-row-meta">
                    {count} Event{count === 1 ? '' : 's'} · {category.color.toUpperCase()}
                  </span>
                </div>
                <div className="category-row-reorder">
                  <button
                    type="button"
                    className="category-row-reorder-btn"
                    onClick={() => moveCategory(category.id, 'up')}
                    disabled={isFirst || reordering}
                    aria-label={`Kategorie ${category.name} nach oben verschieben`}
                    title="Nach oben"
                    data-testid="category-row-up"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="category-row-reorder-btn"
                    onClick={() => moveCategory(category.id, 'down')}
                    disabled={isLast || reordering}
                    aria-label={`Kategorie ${category.name} nach unten verschieben`}
                    title="Nach unten"
                    data-testid="category-row-down"
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="category-row-actions">
                  <button
                    type="button"
                    className="category-row-action"
                    onClick={() => handleEdit(category)}
                    aria-label={`Kategorie ${category.name} bearbeiten`}
                    data-testid="category-row-edit"
                  >
                    <Pencil size={16} aria-hidden="true" />
                    <span>Bearbeiten</span>
                  </button>
                  <button
                    type="button"
                    className="category-row-action category-row-action--danger"
                    onClick={() => setDeleting(category)}
                    aria-label={`Kategorie ${category.name} löschen`}
                    data-testid="category-row-delete"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Löschen</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CategoryEditDialog
        open={Boolean(editing)}
        mode={editing?.mode || 'create'}
        initialName={editing?.name || ''}
        initialColor={editing?.color || '#c48e6a'}
        nameExists={nameExists}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="Kategorie löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (eventCountByCategory.get(deleting.name) || 0) > 0 ? (
          <>
            <p>
              <AlertTriangle
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: 'middle', marginRight: 6 }}
              />
              <strong>„{deleting.name}“</strong> wird aktuell von{' '}
              {eventCountByCategory.get(deleting.name)} Event
              {eventCountByCategory.get(deleting.name) === 1 ? '' : 's'} verwendet.
            </p>
            <p>
              Beim Löschen verlieren diese Events ihre Kategorie-Zuordnung. Du kannst die Kategorie
              stattdessen umbenennen oder die Farbe anpassen.
            </p>
          </>
        ) : (
          <p>Soll die Kategorie „{deleting?.name}“ wirklich gelöscht werden?</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
