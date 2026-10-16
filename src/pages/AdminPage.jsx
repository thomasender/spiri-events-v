import { useMemo, useState } from 'react';
import { useLocation, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Mail,
  MessageSquare,
  PlusCircle,
  FileText,
  Trash2,
  ClipboardCheck,
  Tag,
  Palette,
  Users,
  Heart,
  Contact,
  Instagram,
  BarChart3,
  ShieldCheck,
  Info,
  MapPin,
} from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import EventList from '../components/EventList';
import DraftsTab from '../components/DraftsTab';
import ReviewTab from '../components/ReviewTab';
import TrashTab from '../components/TrashTab';
import MessagesTab from '../components/MessagesTab';
import FeedbackTab from '../components/FeedbackTab';
import CategoriesTab from '../components/CategoriesTab';
import ThemeTab from '../components/ThemeTab';
import HelpersTab from '../components/HelpersTab';
import DonorsTab from '../components/DonorsTab';
import MembersTab from '../components/MembersTab';
import InstagramTab from '../components/InstagramTab';
import AnalyticsTab from '../components/AnalyticsTab';
import ModerationTab from '../components/ModerationTab';
import RegionsTab from '../components/RegionsTab';
import RegionAboutTab from '../components/RegionAboutTab';
import NoAccess from '../components/NoAccess';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import EmailVerificationModal from '../components/EmailVerificationModal';
import EventStatusMismatchBanner from '../components/EventStatusMismatchBanner';
import { useAuth } from '../hooks/useAuth';
import { useEvents, usePendingEvents } from '../hooks/useEvents';
import { useHasMessages, useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount, useHasFeedback } from '../hooks/useFeedbackList';
import { useTrashedEventsCount } from '../hooks/useTrashedEventsCount';
import { ADMIN_TABS, allowedAdminTabs, getStaffAccess } from '../utils/staffRoles';
import './AdminPage.css';

const VALID_TABS = new Set(ADMIN_TABS);

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, staffRegionIds, loading: authLoading, canCreateEvents } = useAuth();
  // Super-Admin: every tab. Regions-Moderator:in: Review, Nachrichten,
  // Papierkorb and Mitglieder of her regions (plus her own events). Everyone
  // else: their own events. A tab outside the list is blocked for the URL
  // too, with a "Kein Zugriff" state instead of the content.
  const access = getStaffAccess(role, staffRegionIds);
  const isAdmin = access.isSuperAdmin;
  const allowedTabs = useMemo(
    () => allowedAdminTabs({ isSuperAdmin: isAdmin, isRegionModerator: access.isRegionModerator }),
    [isAdmin, access.isRegionModerator]
  );
  const { count: unreadCount } = useUnreadMessageCount();
  const { hasMessages } = useHasMessages();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
  const { hasFeedback } = useHasFeedback(isAdmin);
  const { count: trashedCount } = useTrashedEventsCount();
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events } = useEvents(user);
  const { pendingEvents } = usePendingEvents();

  const draftCount = useMemo(() => events.filter((e) => e.status === 'draft').length, [events]);
  const hashEventId = useMemo(() => {
    const hash = location.hash.replace(/^#/, '').trim();
    return hash || null;
  }, [location.hash]);
  const canReview = allowedTabs.has('review');
  const reviewCount = useMemo(
    () => (canReview ? pendingEvents.length : 0),
    [canReview, pendingEvents]
  );

  const visibleTabs = useMemo(() => {
    return {
      events: true,
      drafts: draftCount > 0,
      review: canReview,
      messages: hasMessages,
      feedback: isAdmin && hasFeedback,
      trash: trashedCount > 0,
      categories: isAdmin,
      theme: isAdmin,
      helpers: isAdmin,
      donors: isAdmin,
      members: allowedTabs.has('members'),
      instagram: isAdmin,
      analytics: isAdmin,
      moderation: isAdmin,
      regions: isAdmin,
      about: allowedTabs.has('about'),
    };
  }, [draftCount, hasMessages, isAdmin, canReview, allowedTabs, hasFeedback, trashedCount]);

  const rawTab = searchParams.get('tab');
  // A known tab this role may not open: wait for the role, then say so.
  const forbiddenTab = Boolean(rawTab && VALID_TABS.has(rawTab) && !allowedTabs.has(rawTab));
  const activeTab = useMemo(() => {
    if (forbiddenTab) return authLoading ? 'loading' : 'no-access';
    if (rawTab && VALID_TABS.has(rawTab) && visibleTabs[rawTab]) return rawTab;
    return 'events';
  }, [rawTab, visibleTabs, forbiddenTab, authLoading]);

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

      {hashEventId && <EventStatusMismatchBanner key={hashEventId} eventId={hashEventId} />}

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
        {visibleTabs.review && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'review'}
            aria-controls="admin-tab-review"
            id="admin-tab-review-btn"
            className={`admin-page-tab${activeTab === 'review' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('review')}
            data-testid="admin-tab-review"
          >
            <ClipboardCheck size={16} aria-hidden="true" />
            <span>Review</span>
            {reviewCount > 0 && (
              <span
                className="admin-page-tab-badge"
                data-testid="admin-tab-review-badge"
                aria-label={`${reviewCount} ausstehende Genehmigung${reviewCount > 1 ? 'en' : ''}`}
              >
                {reviewCount > 9 ? '9+' : reviewCount}
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
        {visibleTabs.categories && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'categories'}
            aria-controls="admin-tab-categories"
            id="admin-tab-categories-btn"
            className={`admin-page-tab${activeTab === 'categories' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('categories')}
            data-testid="admin-tab-categories"
          >
            <Tag size={16} aria-hidden="true" />
            <span>Kategorien</span>
          </button>
        )}
        {visibleTabs.theme && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'theme'}
            aria-controls="admin-tab-theme"
            id="admin-tab-theme-btn"
            className={`admin-page-tab${activeTab === 'theme' ? ' admin-page-tab--active' : ''}`}
            onClick={() => navigate('/admin/theme-editor')}
            data-testid="admin-tab-theme"
          >
            <Palette size={16} aria-hidden="true" />
            <span>Theme</span>
          </button>
        )}
        {visibleTabs.helpers && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'helpers'}
            aria-controls="admin-tab-helpers"
            id="admin-tab-helpers-btn"
            className={`admin-page-tab${activeTab === 'helpers' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('helpers')}
            data-testid="admin-tab-helpers"
          >
            <Users size={16} aria-hidden="true" />
            <span>Helfer</span>
          </button>
        )}
        {visibleTabs.donors && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'donors'}
            aria-controls="admin-tab-donors"
            id="admin-tab-donors-btn"
            className={`admin-page-tab${activeTab === 'donors' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('donors')}
            data-testid="admin-tab-donors"
          >
            <Heart size={16} aria-hidden="true" />
            <span>Spender</span>
          </button>
        )}
        {visibleTabs.members && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'members'}
            aria-controls="admin-tab-members"
            id="admin-tab-members-btn"
            className={`admin-page-tab${activeTab === 'members' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('members')}
            data-testid="admin-tab-members"
          >
            <Contact size={16} aria-hidden="true" />
            <span>Mitglieder</span>
          </button>
        )}
        {visibleTabs.instagram && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'instagram'}
            aria-controls="admin-tab-instagram"
            id="admin-tab-instagram-btn"
            className={`admin-page-tab${activeTab === 'instagram' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('instagram')}
            data-testid="admin-tab-instagram"
          >
            <Instagram size={16} aria-hidden="true" />
            <span>Instagram</span>
          </button>
        )}
        {visibleTabs.analytics && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analytics'}
            aria-controls="admin-tab-analytics"
            id="admin-tab-analytics-btn"
            className={`admin-page-tab${activeTab === 'analytics' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('analytics')}
            data-testid="admin-tab-analytics"
          >
            <BarChart3 size={16} aria-hidden="true" />
            <span>Statistik</span>
          </button>
        )}
        {visibleTabs.moderation && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'moderation'}
            aria-controls="admin-tab-moderation"
            id="admin-tab-moderation-btn"
            className={`admin-page-tab${activeTab === 'moderation' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('moderation')}
            data-testid="admin-tab-moderation"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Moderation</span>
          </button>
        )}
        {visibleTabs.regions && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'regions'}
            aria-controls="admin-tab-regions"
            id="admin-tab-regions-btn"
            className={`admin-page-tab${activeTab === 'regions' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('regions')}
            data-testid="admin-tab-regions"
          >
            <MapPin size={16} aria-hidden="true" />
            <span>Regionen</span>
          </button>
        )}
        {visibleTabs.about && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'about'}
            aria-controls="admin-tab-about"
            id="admin-tab-about-btn"
            className={`admin-page-tab${activeTab === 'about' ? ' admin-page-tab--active' : ''}`}
            onClick={() => setTab('about')}
            data-testid="admin-tab-about"
          >
            <Info size={16} aria-hidden="true" />
            <span>Über uns</span>
          </button>
        )}
      </div>

      {activeTab === 'loading' && <div className="loading-spinner"></div>}
      {activeTab === 'no-access' && (
        <NoAccess message="Diesen Bereich der Verwaltung kannst du mit deinem Konto nicht öffnen. Wenn du glaubst, dass das ein Fehler ist, melde dich bitte beim Team." />
      )}

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
      {visibleTabs.review && (
        <div
          role="tabpanel"
          id="admin-tab-review"
          aria-labelledby="admin-tab-review-btn"
          hidden={activeTab !== 'review'}
        >
          {activeTab === 'review' && <ReviewTab />}
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
      {visibleTabs.categories && (
        <div
          role="tabpanel"
          id="admin-tab-categories"
          aria-labelledby="admin-tab-categories-btn"
          hidden={activeTab !== 'categories'}
        >
          {activeTab === 'categories' && <CategoriesTab />}
        </div>
      )}
      {visibleTabs.theme && (
        <div
          role="tabpanel"
          id="admin-tab-theme"
          aria-labelledby="admin-tab-theme-btn"
          hidden={activeTab !== 'theme'}
        >
          {activeTab === 'theme' && <ThemeTab />}
        </div>
      )}
      {visibleTabs.helpers && (
        <div
          role="tabpanel"
          id="admin-tab-helpers"
          aria-labelledby="admin-tab-helpers-btn"
          hidden={activeTab !== 'helpers'}
        >
          {activeTab === 'helpers' && <HelpersTab />}
        </div>
      )}
      {visibleTabs.donors && (
        <div
          role="tabpanel"
          id="admin-tab-donors"
          aria-labelledby="admin-tab-donors-btn"
          hidden={activeTab !== 'donors'}
        >
          {activeTab === 'donors' && <DonorsTab />}
        </div>
      )}
      {visibleTabs.members && (
        <div
          role="tabpanel"
          id="admin-tab-members"
          aria-labelledby="admin-tab-members-btn"
          hidden={activeTab !== 'members'}
        >
          {activeTab === 'members' && <MembersTab />}
        </div>
      )}

      {visibleTabs.instagram && (
        <div
          role="tabpanel"
          id="admin-tab-instagram"
          aria-labelledby="admin-tab-instagram-btn"
          hidden={activeTab !== 'instagram'}
        >
          {activeTab === 'instagram' && <InstagramTab />}
        </div>
      )}

      {visibleTabs.analytics && (
        <div
          role="tabpanel"
          id="admin-tab-analytics"
          aria-labelledby="admin-tab-analytics-btn"
          hidden={activeTab !== 'analytics'}
        >
          {activeTab === 'analytics' && <AnalyticsTab />}
        </div>
      )}

      {visibleTabs.moderation && (
        <div
          role="tabpanel"
          id="admin-tab-moderation"
          aria-labelledby="admin-tab-moderation-btn"
          hidden={activeTab !== 'moderation'}
        >
          {activeTab === 'moderation' && <ModerationTab />}
        </div>
      )}

      {visibleTabs.regions && (
        <div
          role="tabpanel"
          id="admin-tab-regions"
          aria-labelledby="admin-tab-regions-btn"
          hidden={activeTab !== 'regions'}
        >
          {activeTab === 'regions' && <RegionsTab />}
        </div>
      )}

      {visibleTabs.about && (
        <div
          role="tabpanel"
          id="admin-tab-about"
          aria-labelledby="admin-tab-about-btn"
          hidden={activeTab !== 'about'}
        >
          {activeTab === 'about' && <RegionAboutTab />}
        </div>
      )}

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </div>
  );
}
