import { useState, useMemo, useCallback } from 'react';
import { Plus, Pencil, Trash2, Tag, AlertTriangle, Inbox } from 'lucide-react';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { useAllEvents } from '../hooks/useEvents';
import CategoryEditDialog from './CategoryEditDialog';
import ConfirmDialog from './ConfirmDialog';
import './CategoriesTab.css';

// Admin tab: full CRUD over the categories registry. Lists every category
// alphabetically with its color swatch, edit/delete actions, and a count of
// approved events currently using the category (so admins see the blast
// radius before deleting or renaming).
export default function CategoriesTab() {
  const { categories, loading, error, nameExists, addCategory, updateCategory, deleteCategory } =
    useCategoryRegistry();
  const { events } = useAllEvents();

  const [editing, setEditing] = useState(null); // { mode, id, name, color }
  const [deleting, setDeleting] = useState(null); // category

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
          Kategorienamen genehmigt wird — du kannst sie hier aber jederzeit anlegen, umbenennen oder
          löschen.
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

      {categories.length === 0 ? (
        <div className="categories-tab-empty" data-testid="categories-tab-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>Noch keine Kategorien</h2>
          <p>Lege die erste Kategorie an, damit Events im Kalender zugeordnet werden können.</p>
        </div>
      ) : (
        <ul className="categories-tab-list" data-testid="categories-tab-list">
          {categories.map((category) => {
            const count = eventCountByCategory.get(category.name) || 0;
            return (
              <li
                key={category.id}
                className="category-row"
                data-testid="category-row"
                data-category-id={category.id}
              >
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
