import { useCallback, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Inbox,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useFaqs } from '../hooks/useFaqs';
import { faqTopicSuggestions, groupFaqsByTopic, moveFaqInTopic, moveFaqTopic } from '../utils/faqs';
import FaqEditDialog from './FaqEditDialog';
import ConfirmDialog from './ConfirmDialog';
import './FaqTab.css';

// Admin tab "FAQ" (Super-Admins only): questions and answers of the public
// /faq page. Platform-wide, no region. Entries are grouped by topic as on the
// page; arrows move a question inside its topic or a whole topic.
export default function FaqTab() {
  const { faqs, loading, error, canEdit, addFaq, updateFaq, deleteFaq, reorderFaqs } = useFaqs({
    includeDrafts: true,
  });

  const [editing, setEditing] = useState(null); // { mode, faq }
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState(null);

  const groups = useMemo(() => groupFaqsByTopic(faqs), [faqs]);
  const topicSuggestions = useMemo(() => faqTopicSuggestions(faqs), [faqs]);

  const handleSave = useCallback(
    async (fields) => {
      if (!editing) return;
      if (editing.mode === 'create') {
        await addFaq(fields);
      } else {
        await updateFaq(editing.faq.id, fields);
      }
      setEditing(null);
    },
    [editing, addFaq, updateFaq]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteFaq(deleting.id);
      setDeleting(null);
      setDeleteError(null);
    } catch (err) {
      console.error('FAQ delete failed:', err);
      setDeleting(null);
      setDeleteError('Die Frage konnte nicht gelöscht werden. Bitte versuche es erneut.');
    }
  }, [deleting, deleteFaq]);

  const persistOrder = useCallback(
    async (orderedIds) => {
      if (!orderedIds || reordering) return;
      setReordering(true);
      setReorderError(null);
      try {
        await reorderFaqs(orderedIds);
      } catch (err) {
        console.error('FAQ reorder failed:', err);
        setReorderError('Die Reihenfolge konnte nicht gespeichert werden.');
      } finally {
        setReordering(false);
      }
    },
    [reorderFaqs, reordering]
  );

  if (loading) {
    return <div className="loading-spinner" data-testid="faq-tab-loading" />;
  }

  if (error) {
    return (
      <div className="faq-tab-error" role="alert" data-testid="faq-tab-error">
        FAQs konnten nicht geladen werden: {error}
      </div>
    );
  }

  return (
    <div className="faq-tab" data-testid="faq-tab">
      <div className="faq-tab-toolbar">
        <p className="faq-tab-description">
          Hier verwaltest du die Fragen und Antworten der öffentlichen{' '}
          <a href="/faq" target="_blank" rel="noopener noreferrer">
            FAQ-Seite <ExternalLink size={12} aria-hidden="true" />
          </a>
          . Fragen mit demselben Thema stehen zusammen. Entwürfe (nicht veröffentlicht) sieht nur
          die Verwaltung.
        </p>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing({ mode: 'create', faq: null })}
            data-testid="faq-tab-add"
          >
            <Plus size={18} aria-hidden="true" />
            <span>Neue Frage</span>
          </button>
        )}
      </div>

      {(deleteError || reorderError) && (
        <p className="faq-tab-error" role="alert" data-testid="faq-tab-action-error">
          {deleteError || reorderError}
        </p>
      )}

      {groups.length === 0 ? (
        <div className="faq-tab-empty" data-testid="faq-tab-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>Noch keine Fragen</h2>
          <p>Solange hier nichts veröffentlicht ist, zeigt die FAQ-Seite einen Hinweis.</p>
        </div>
      ) : (
        groups.map((group, groupIndex) => (
          <section key={group.anchor} className="faq-tab-group" data-testid="faq-tab-group">
            <div className="faq-tab-group-header">
              <h3 className="faq-tab-group-title" data-testid="faq-tab-group-title">
                {group.topic}
              </h3>
              {canEdit && groups.length > 1 && (
                <div className="faq-tab-reorder">
                  <button
                    type="button"
                    className="faq-tab-reorder-btn"
                    onClick={() => persistOrder(moveFaqTopic(groups, group.topic, 'up'))}
                    disabled={groupIndex === 0 || reordering}
                    aria-label={`Thema ${group.topic} nach oben verschieben`}
                    data-testid="faq-tab-topic-up"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="faq-tab-reorder-btn"
                    onClick={() => persistOrder(moveFaqTopic(groups, group.topic, 'down'))}
                    disabled={groupIndex === groups.length - 1 || reordering}
                    aria-label={`Thema ${group.topic} nach unten verschieben`}
                    data-testid="faq-tab-topic-down"
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            <ul className="faq-tab-list">
              {group.items.map((faq, index) => (
                <li
                  key={faq.id}
                  className={`faq-tab-row${reordering ? ' faq-tab-row--busy' : ''}`}
                  data-testid="faq-tab-row"
                  data-faq-id={faq.id}
                >
                  <div className="faq-tab-row-info">
                    <span className="faq-tab-row-question" data-testid="faq-tab-row-question">
                      {faq.question}
                    </span>
                    {faq.published !== true && (
                      <span className="faq-tab-row-draft" data-testid="faq-tab-row-draft">
                        Entwurf
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="faq-tab-reorder">
                      <button
                        type="button"
                        className="faq-tab-reorder-btn"
                        onClick={() => persistOrder(moveFaqInTopic(groups, faq.id, 'up'))}
                        disabled={index === 0 || reordering}
                        aria-label={`${faq.question} nach oben verschieben`}
                        data-testid="faq-tab-row-up"
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="faq-tab-reorder-btn"
                        onClick={() => persistOrder(moveFaqInTopic(groups, faq.id, 'down'))}
                        disabled={index === group.items.length - 1 || reordering}
                        aria-label={`${faq.question} nach unten verschieben`}
                        data-testid="faq-tab-row-down"
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {canEdit && (
                    <div className="faq-tab-row-actions">
                      <button
                        type="button"
                        className="faq-tab-row-action"
                        onClick={() => setEditing({ mode: 'edit', faq })}
                        aria-label={`Frage ${faq.question} bearbeiten`}
                        data-testid="faq-tab-row-edit"
                      >
                        <Pencil size={16} aria-hidden="true" />
                        <span>Bearbeiten</span>
                      </button>
                      <button
                        type="button"
                        className="faq-tab-row-action faq-tab-row-action--danger"
                        onClick={() => setDeleting(faq)}
                        aria-label={`Frage ${faq.question} löschen`}
                        data-testid="faq-tab-row-delete"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span>Löschen</span>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <FaqEditDialog
        open={Boolean(editing)}
        mode={editing?.mode || 'create'}
        faq={editing?.faq || null}
        topicSuggestions={topicSuggestions}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="Frage löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (
          <>
            <p>
              <AlertTriangle size={16} aria-hidden="true" className="faq-tab-warning-icon" />
              Soll <strong>&bdquo;{deleting.question}&ldquo;</strong> wirklich gelöscht werden?
            </p>
            <p>Diese Aktion lässt sich nicht rückgängig machen.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
