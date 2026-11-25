import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, X } from 'lucide-react';
import RichTextView from './RichTextView';
import { useAuth } from '../hooks/useAuth';
import { useFaqs } from '../hooks/useFaqs';
import { useMessengerAccess } from '../hooks/useChatSettings';
import { callable } from '../lib/firebase';
import { FAQ_EVENT_GUIDE_QUESTION } from '../utils/faqs';
import {
  MODERATOR_GUIDELINES,
  MODERATOR_GUIDELINES_HEADING,
} from '../utils/moderatorGuidelinesText';
import './ConfirmDialog.css';
import './ModerationGuidanceNotice.css';

// Notice for moderators / admins while they review a pending event (Trello Hzf5ctgC):
// "Leitlinien" opens the FAQ article about which events fit as a popup, "frage um Hilfe"
// opens a Postfach conversation with a Super-Admin. Closing it only lasts until the next
// visit (plain component state).
export default function ModerationGuidanceNotice() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { faqs } = useFaqs();
  const { available: messengerOpen } = useMessengerAccess();
  const [dismissed, setDismissed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');

  if (dismissed) return null;

  const guide = faqs.find((faq) => faq.question === FAQ_EVENT_GUIDE_QUESTION);

  const askForHelp = async () => {
    setAsking(true);
    setAskError('');
    try {
      const result = await callable('getSuperAdminContacts')({});
      const uid = (result?.data?.uids ?? []).find((id) => id !== user?.uid);
      if (!uid) throw new Error('no super admin');
      navigate(`/postfach/${uid}`);
    } catch (err) {
      console.warn('getSuperAdminContacts failed:', err?.code || err);
      setAskError('Das hat gerade nicht geklappt. Bitte versuche es später noch einmal.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <aside className="moderation-guidance" data-testid="moderation-guidance">
      <div className="moderation-guidance-icon" aria-hidden="true">
        <HelpCircle size={20} />
      </div>
      <p className="moderation-guidance-text">
        Du bist dir nicht sicher, ob das Event zu uns passt? Dann schau dir unsere{' '}
        <button
          type="button"
          className="moderation-guidance-link"
          onClick={() => setGuideOpen(true)}
          data-testid="moderation-guidance-open"
        >
          Leitlinien
        </button>{' '}
        an. Wenn du dir immer noch unsicher bist,{' '}
        {messengerOpen ? (
          <button
            type="button"
            className="moderation-guidance-link"
            onClick={askForHelp}
            disabled={asking}
            data-testid="moderation-guidance-help"
          >
            frage um Hilfe
          </button>
        ) : (
          'frage das Admin-Team um Hilfe'
        )}
        .
        {askError && (
          <span className="moderation-guidance-error" role="alert">
            {' '}
            {askError}
          </span>
        )}
      </p>
      <button
        type="button"
        className="moderation-guidance-close"
        onClick={() => setDismissed(true)}
        aria-label="Hinweis schließen"
        data-testid="moderation-guidance-close"
      >
        <X size={16} />
      </button>

      {guideOpen &&
        createPortal(
          <div
            className="confirm-overlay fade-enter"
            onClick={() => setGuideOpen(false)}
            data-testid="moderation-guidance-overlay"
          >
            <div
              className="confirm-dialog moderation-guidance-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="moderation-guidance-title"
              data-testid="moderation-guidance-dialog"
            >
              <button
                type="button"
                className="confirm-close"
                onClick={() => setGuideOpen(false)}
                aria-label="Schließen"
              >
                <X size={20} />
              </button>
              <h2 id="moderation-guidance-title">{FAQ_EVENT_GUIDE_QUESTION}</h2>
              {guide ? (
                <RichTextView html={guide.answerHtml} className="faq-answer" />
              ) : (
                <p>Die Leitlinien konnten gerade nicht geladen werden.</p>
              )}
              <section
                className="moderation-guidance-internal"
                data-testid="moderation-guidance-internal"
              >
                <h3>{MODERATOR_GUIDELINES_HEADING}</h3>
                <ul>
                  {MODERATOR_GUIDELINES.map(({ title, text }) => (
                    <li key={title}>
                      <strong>{title}:</strong> {text}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}
