import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import './FeedbackButton.css';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPageUrl(window.location.href);
  }, [location.pathname, location.search, location.hash]);

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
      <FeedbackModal open={open} onClose={() => setOpen(false)} pageUrl={pageUrl} />
    </>
  );
}
