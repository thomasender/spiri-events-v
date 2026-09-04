import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CalendarDays, Mail, MessageSquare, PlusCircle, FileText, Trash2 } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import EventList from '../components/EventList';
import DraftsTab from '../components/DraftsTab';
import TrashTab from '../components/TrashTab';
import MessagesTab from '../components/MessagesTab';
import FeedbackTab from '../components/FeedbackTab';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import EmailVerificationModal from '../components/EmailVerificationModal';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { useHasMessages, useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount, useHasFeedback } from '../hooks/useFeedbackList';
import { useTrashedEventsCount } from '../hooks/useTrashedEventsCount';
import './AdminPage.css';

const VALID_TABS = new Set(['events', 'drafts', 'messages', 'feedback', 'trash']);

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role, canCreateEvents } = useAuth();
  const isAdmin = role === 'Admin';
  const { count: unreadCount } = useUnreadMessageCount();
  const { hasMessages } = useHasMessages();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
  const { hasFeedback } = useHasFeedback(isAdmin);
  const { count: trashedCount } = useTrashedEventsCount(isAdmin);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events } = useEvents(user);

  const draftCount = useMemo(() => events.filter((e) => e.status === 'draft').length, [events]);

  const visibleTabs = useMemo(() => {
    return {
      events: true,
      drafts: draftCount > 0,
      messages: hasMessages,
      feedback: isAdmin && hasFeedback,
      trash: trashedCount > 0,
    };
  }, [draftCount, hasMessages, isAdmin, hasFeedback, trashedCount]);

  const rawTab = searchParams.get('tab');
  const activeTab = useMemo(() => {
    if (rawTab && VALID_TABS.has(rawTab) && visibleTabs[rawTab]) return rawTab;
    return 'events';
  }, [rawTab, visibleTabs]);

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
      <SeoMeta title="Verwaltung" path="/admin" noindex />
      <header className="admin-page-header">
        <div>
          <h1>Verwaltung</h1>
          <p>Verwalte deine Events und Nachrichten</p>
        </div>
        {canCreateEvents ? (
          <Link to="/admin/new" className="btn btn-primary">
            <PlusCircle size={18} aria-hidden="true" />
            <span>Neues Event</span>
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-disabled"
            onClick={() => setVerificationModalOpen(true)}
            title="Bitte bestätige zuerst deine E-Mail-Adresse."
            data-testid="new-event-locked"
          >
            <PlusCircle size={18} aria-hidden="true" />
            <span>Neues Event</span>
          </button>
        )}
      </header>

      {!canCreateEvents && <EmailVerificationBanner />}

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
        {visibleTabs.drafts && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'drafts'}
            aria-controls="admin-tab-drafts"
            id="admin-tab-drafts-btn"
            className={`admin-page-tab${activeTab === 'drafts' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('drafts')}
            data-testid="admin-tab-drafts"
          >
            <FileText size={16} aria-hidden="true" />
            <span>Entwürfe</span>
            {draftCount > 0 && (
              <span
                className="admin-page-tab-badge"
                data-testid="admin-tab-drafts-badge"
                aria-label={`${draftCount} Entwurf${draftCount > 1 ? 'e' : ''}`}
              >
                {draftCount > 9 ? '9+' : draftCount}
              </span>
            )}
          </button>
        )}
        {visibleTabs.messages && (
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
        )}
        {visibleTabs.feedback && (
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
        )}
        {visibleTabs.trash && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'trash'}
            aria-controls="admin-tab-trash"
            id="admin-tab-trash-btn"
            className={`admin-page-tab${activeTab === 'trash' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('trash')}
            data-testid="admin-tab-trash"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>Papierkorb</span>
          </button>
        )}
      </div>

      <div
        role="tabpanel"
        id="admin-tab-events"
        aria-labelledby="admin-tab-events-btn"
        hidden={activeTab !== 'events'}
      >
        {activeTab === 'events' && <EventList />}
      </div>
      {visibleTabs.drafts && (
        <div
          role="tabpanel"
          id="admin-tab-drafts"
          aria-labelledby="admin-tab-drafts-btn"
          hidden={activeTab !== 'drafts'}
        >
          {activeTab === 'drafts' && <DraftsTab />}
        </div>
      )}
      {visibleTabs.messages && (
        <div
          role="tabpanel"
          id="admin-tab-messages"
          aria-labelledby="admin-tab-messages-btn"
          hidden={activeTab !== 'messages'}
        >
          {activeTab === 'messages' && <MessagesTab />}
        </div>
      )}
      {visibleTabs.feedback && (
        <div
          role="tabpanel"
          id="admin-tab-feedback"
          aria-labelledby="admin-tab-feedback-btn"
          hidden={activeTab !== 'feedback'}
        >
          {activeTab === 'feedback' && <FeedbackTab />}
        </div>
      )}
      {visibleTabs.trash && (
        <div
          role="tabpanel"
          id="admin-tab-trash"
          aria-labelledby="admin-tab-trash-btn"
          hidden={activeTab !== 'trash'}
        >
          {activeTab === 'trash' && <TrashTab />}
        </div>
      )}

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </div>
  );
}
