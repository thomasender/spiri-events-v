import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, ShieldCheck, Pencil, Trash2, ImageOff, Image } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEventMessages } from '../hooks/useEventMessages';
import { getStaffAccess, messageAuthorRole } from '../utils/staffRoles';
import RichTextEditorLazy from './RichTextEditorLazy';
import RichTextView from './RichTextView';
import { isHtmlEmpty, messageToHtml, MAX_MESSAGE_LENGTH } from '../utils/sanitize';
import './EventMessages.css';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function instagramNoTextTemplate(name) {
  const greeting = name ? `Hallo ${escapeHtml(name)},` : 'Hallo,';
  return [
    `<p>${greeting}</p>`,
    '<p>damit wir dein Event auf Instagram posten können, lade bitte für Instagram ein separates Bild hoch, das keinen Text beinhaltet. Der Grund hierfür ist, dass wir beim Instagram-Post bereits Text über dein Bild legen. Du kannst die Vorschau für den Instagram-Post oben sehen.</p>',
    '<p>Bei Fragen wende dich gerne direkt über diesen Chat an uns.</p>',
    '<p>Liebe Grüße,<br>Dein Admin-Team</p>',
  ].join('');
}

export function defaultPhotoTemplate(name) {
  const greeting = name ? `Hallo ${escapeHtml(name)},` : 'Hallo,';
  return [
    `<p>${greeting}</p>`,
    '<p>für dein Event ist aktuell ein Standardfoto hinterlegt. Möchtest du das wirklich so lassen? Erfahrungsgemäß werden Events deutlich öfter angeschaut, wenn sie ein eigenes Foto haben.</p>',
    '<p>Du kannst jederzeit ein eigenes Foto hochladen. Wenn wir in den nächsten 2 Tagen nichts von dir hören, verwenden wir das Standardfoto und geben dein Event so frei.</p>',
    '<p>Bei Fragen wende dich gerne direkt über diesen Chat an uns.</p>',
    '<p>Liebe Grüße,<br>Dein Admin-Team</p>',
  ].join('');
}

export default function EventMessages({ eventId, eventOwnerUid = null, organizerName, onReady }) {
  const { user, role, staffRegionIds } = useAuth();
  const { messages, loading, sending, sendMessage, editMessage, deleteMessage, markAsRead } =
    useEventMessages(eventId, { ownerUid: eventOwnerUid });
  // Super-Admins, and moderators on someone else's event, write as the team.
  const writesAsStaff =
    messageAuthorRole(
      getStaffAccess(role, staffRegionIds),
      Boolean(user && eventOwnerUid && eventOwnerUid === user.uid)
    ) === 'Admin';
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const listRef = useRef(null);
  const markedRef = useRef(new Set());
  const wasLoadingRef = useRef(true);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return undefined;
    }
    if (!wasLoadingRef.current) return undefined;
    wasLoadingRef.current = false;
    const handle = window.requestAnimationFrame(() => {
      onReadyRef.current?.();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [loading]);

  useEffect(() => {
    if (!user || messages.length === 0) return;
    messages.forEach((msg) => {
      if (
        msg.authorUid !== user.uid &&
        msg.readByRecipient !== true &&
        !markedRef.current.has(msg.id)
      ) {
        markedRef.current.add(msg.id);
        markAsRead(msg.id);
      }
    });
  }, [messages, user, markAsRead]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isHtmlEmpty(text)) return;
    try {
      await sendMessage(text);
      setText('');
    } catch (err) {
      setError(err.message || 'Nachricht konnte nicht gesendet werden.');
    }
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(messageToHtml(msg.text));
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditError('');
  };

  const handleDelete = async (msg) => {
    if (!window.confirm('Diese Nachricht wirklich löschen?')) return;
    setError('');
    try {
      await deleteMessage(msg.id);
      if (editingId === msg.id) cancelEdit();
    } catch (err) {
      setError(err.message || 'Nachricht konnte nicht gelöscht werden.');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (isHtmlEmpty(editText)) return;
    setSavingEdit(true);
    setEditError('');
    try {
      await editMessage(editingId, editText);
      cancelEdit();
    } catch (err) {
      setEditError(err.message || 'Nachricht konnte nicht gespeichert werden.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <section
      className="event-messages"
      id="event-messages"
      data-testid="event-messages"
      aria-label="Nachrichten"
    >
      <header className="event-messages-header">
        <MessageSquare size={20} aria-hidden="true" />
        <h2>Nachrichten</h2>
        {writesAsStaff && (
          <span className="event-messages-hint">
            <ShieldCheck size={14} aria-hidden="true" />
            Admin-Nachricht
          </span>
        )}
      </header>

      <div className="event-messages-thread" ref={listRef} data-testid="event-messages-thread">
        {loading ? (
          <div className="event-messages-empty">Nachrichten werden geladen…</div>
        ) : messages.length === 0 ? (
          <div className="event-messages-empty">
            Noch keine Nachrichten. Schreibe die erste Nachricht, falls du etwas klären möchtest.
          </div>
        ) : (
          <ul className="event-messages-list">
            {messages.map((msg) => {
              const isMine = msg.authorUid === user?.uid;
              // Admins may edit every admin message, whoever wrote it.
              const canEdit = isMine || (role === 'Admin' && msg.authorRole === 'Admin');
              const isAdmin = msg.authorRole === 'Admin';
              const canDelete = isMine || (role === 'Admin' && isAdmin);
              return (
                <li
                  key={msg.id}
                  className={[
                    'event-message',
                    isMine ? 'event-message--mine' : 'event-message--theirs',
                    isAdmin ? 'event-message--admin' : 'event-message--user',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid="event-message"
                >
                  <div className="event-message-meta">
                    <span className="event-message-author">
                      {isAdmin ? 'Admin' : msg.authorName || 'Veranstalter'}
                    </span>
                    <span className="event-message-time">{formatTime(msg.createdAt)}</span>
                  </div>
                  {editingId === msg.id ? (
                    <form className="event-message-edit" onSubmit={handleSaveEdit}>
                      <RichTextEditorLazy
                        value={editText}
                        onChange={setEditText}
                        maxLength={MAX_MESSAGE_LENGTH}
                        testId="event-message-edit-input"
                        eventId={eventId}
                      />
                      <div className="event-messages-composer-footer">
                        {editError && <span className="event-messages-error">{editError}</span>}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={cancelEdit}
                          data-testid="event-message-edit-cancel"
                        >
                          Abbrechen
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={savingEdit || isHtmlEmpty(editText)}
                          data-testid="event-message-edit-save"
                        >
                          {savingEdit ? 'Wird gespeichert…' : 'Speichern'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <RichTextView html={messageToHtml(msg.text)} className="event-message-text" />
                      {(msg.editedAt || canEdit || canDelete) && (
                        <div className="event-message-footer">
                          {msg.editedAt && (
                            <span
                              className="event-message-edited"
                              data-testid="event-message-edited"
                            >
                              (bearbeitet)
                            </span>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className="event-message-edit-btn"
                              onClick={() => startEdit(msg)}
                              data-testid="event-message-edit"
                            >
                              <Pencil size={12} aria-hidden="true" />
                              Bearbeiten
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="event-message-edit-btn"
                              onClick={() => handleDelete(msg)}
                              data-testid="event-message-delete"
                            >
                              <Trash2 size={12} aria-hidden="true" />
                              Löschen
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form className="event-messages-composer" onSubmit={handleSubmit}>
        <RichTextEditorLazy
          value={text}
          onChange={setText}
          placeholder={
            writesAsStaff
              ? 'Beschreibe, was am Event geändert werden soll…'
              : 'Schreibe eine Antwort an das Admin-Team…'
          }
          maxLength={MAX_MESSAGE_LENGTH}
          testId="event-message-input"
          eventId={eventId}
        />
        <div className="event-messages-composer-footer">
          {error && <span className="event-messages-error">{error}</span>}
          {role === 'Admin' && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm event-messages-template-btn"
                onClick={() => setText(instagramNoTextTemplate(organizerName))}
                data-testid="event-message-template-instagram"
              >
                <ImageOff size={16} aria-hidden="true" />
                <span>Vorlage: Instagram-Bild ohne Text</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm event-messages-template-btn"
                onClick={() => setText(defaultPhotoTemplate(organizerName))}
                data-testid="event-message-template-default-photo"
              >
                <Image size={16} aria-hidden="true" />
                <span>Vorlage: Standardfoto</span>
              </button>
            </>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={sending || isHtmlEmpty(text)}
            data-testid="event-message-send"
          >
            <Send size={16} aria-hidden="true" />
            <span>{sending ? 'Wird gesendet…' : 'Senden'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
