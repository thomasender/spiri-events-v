import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CalendarDays, Mail, MessageSquare, PlusCircle } from 'lucide-react';
import EventList from '../components/EventList';
import MessagesTab from '../components/MessagesTab';
import FeedbackTab from '../components/FeedbackTab';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount } from '../hooks/useFeedbackList';
import './AdminPage.css';

const VALID_TABS = new Set(['events', 'messages', 'feedback']);

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { count: unreadCount } = useUnreadMessageCount();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount();

  const rawTab = searchParams.get('tab');
  const activeTab = useMemo(() => {
    if (rawTab && VALID_TABS.has(rawTab)) return rawTab;
    return 'events';
  }, [rawTab]);

  const setTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'events') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Verwaltung</h1>
          <p>Verwalte deine Events und Nachrichten</p>
        </div>
        <Link to="/admin/new" className="btn btn-primary">
          <PlusCircle size={18} aria-hidden="true" />
          <span>Neues Event</span>
        </Link>
      </header>

      <div className="admin-page-tabs" role="tablist" aria-label="Verwaltungs-Bereiche">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'events'}
          aria-controls="admin-tab-events"
          id="admin-tab-events-btn"
          className={`admin-page-tab${activeTab === 'events' ? ' admin-page-tab--active' : ''}`}
          onClick={() => setTab('events')}
          data-testid="admin-tab-events"
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>Meine Events</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'messages'}
          aria-controls="admin-tab-messages"
          id="admin-tab-messages-btn"
          className={`admin-page-tab${activeTab === 'messages' ? ' admin-page-tab--active' : ''}`}
          onClick={() => setTab('messages')}
          data-testid="admin-tab-messages"
        >
          <Mail size={16} aria-hidden="true" />
          <span>Nachrichten</span>
          {unreadCount > 0 && (
            <span
              className="admin-page-tab-badge"
              data-testid="admin-tab-messages-badge"
              aria-label={`${unreadCount} ungelesene Nachrichten`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'feedback'}
          aria-controls="admin-tab-feedback"
          id="admin-tab-feedback-btn"
          className={`admin-page-tab${activeTab === 'feedback' ? ' admin-page-tab--active' : ''}`}
          onClick={() => setTab('feedback')}
          data-testid="admin-tab-feedback"
        >
          <MessageSquare size={16} aria-hidden="true" />
          <span>Feedback</span>
          {unreadFeedbackCount > 0 && (
            <span
              className="admin-page-tab-badge"
              data-testid="admin-tab-feedback-badge"
              aria-label={`${unreadFeedbackCount} neues Feedback`}
            >
              {unreadFeedbackCount > 9 ? '9+' : unreadFeedbackCount}
            </span>
          )}
        </button>
      </div>

      <div
        role="tabpanel"
        id="admin-tab-events"
        aria-labelledby="admin-tab-events-btn"
        hidden={activeTab !== 'events'}
      >
        {activeTab === 'events' && <EventList />}
      </div>
      <div
        role="tabpanel"
        id="admin-tab-messages"
        aria-labelledby="admin-tab-messages-btn"
        hidden={activeTab !== 'messages'}
      >
        {activeTab === 'messages' && <MessagesTab />}
      </div>
      <div
        role="tabpanel"
        id="admin-tab-feedback"
        aria-labelledby="admin-tab-feedback-btn"
        hidden={activeTab !== 'feedback'}
      >
        {activeTab === 'feedback' && <FeedbackTab />}
      </div>
    </div>
  );
}
