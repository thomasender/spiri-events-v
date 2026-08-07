import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import './FeedbackButton.css';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [pageContext, setPageContext] = useState({ pageUrl: '', pageTitle: '' });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateContext = () => {
      setPageContext({
        pageUrl: window.location.href,
        pageTitle: document.title || '',
      });
    };
    updateContext();
    window.addEventListener('popstate', updateContext);
    window.addEventListener('hashchange', updateContext);
    return () => {
      window.removeEventListener('popstate', updateContext);
      window.removeEventListener('hashchange', updateContext);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Feedback geben"
        aria-haspopup="dialog"
        data-testid="feedback-fab"
      >
        <MessageSquare size={22} aria-hidden="true" />
        <span className="feedback-fab-label">Feedback</span>
      </button>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        pageUrl={pageContext.pageUrl}
        pageTitle={pageContext.pageTitle}
      />
    </>
  );
}
