import { useEffect, useMemo, useRef, useState } from 'react';
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
  MailCheck,
  ChevronDown,
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
import MailgunTab from '../components/MailgunTab';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import EmailVerificationModal from '../components/EmailVerificationModal';
import EventStatusMismatchBanner from '../components/EventStatusMismatchBanner';
import { useAuth } from '../hooks/useAuth';
import { useEvents, usePendingEvents } from '../hooks/useEvents';
import { useHasMessages, useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount, useHasFeedback } from '../hooks/useFeedbackList';
import { useTrashedEventsCount } from '../hooks/useTrashedEventsCount';
import './AdminPage.css';

// Tabs are grouped into drop-down menus (QhQJFz04). `id` is the ?tab= value.
const TAB_GROUPS = [
  {
    id: 'events-group',
    label: 'Events',
    Icon: CalendarDays,
    tabs: [
      { id: 'events', label: 'Meine Events', Icon: CalendarDays },
      { id: 'drafts', label: 'Entwürfe', Icon: FileText },
      { id: 'review', label: 'Review', Icon: ClipboardCheck },
      { id: 'feedback', label: 'Feedback', Icon: MessageSquare },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    Icon: Users,
    tabs: [
      { id: 'members', label: 'Mitglieder', Icon: Contact },
      { id: 'helpers', label: 'Helfer', Icon: Users },
      { id: 'donors', label: 'Spender', Icon: Heart },
      { id: 'categories', label: 'Kategorien', Icon: Tag },
    ],
  },
  {
    id: 'communication',
    label: 'Kommunikation',
    Icon: Mail,
    tabs: [
      { id: 'messages', label: 'Nachrichten', Icon: Mail },
      { id: 'instagram', label: 'Instagram', Icon: Instagram },
      { id: 'mailgun', label: 'E-Mail-Versand', Icon: MailCheck },
    ],
  },
  {
    id: 'settings',
    label: 'Dashboard & Einstellungen',
    Icon: BarChart3,
    tabs: [
      { id: 'analytics', label: 'Statistik', Icon: BarChart3 },
      { id: 'theme', label: 'Theme', Icon: Palette },
      { id: 'trash', label: 'Papierkorb', Icon: Trash2 },
    ],
  },
];

const PANELS = {
  events: EventList,
  drafts: DraftsTab,
  review: ReviewTab,
  messages: MessagesTab,
  feedback: FeedbackTab,
  trash: TrashTab,
  categories: CategoriesTab,
  theme: ThemeTab,
  helpers: HelpersTab,
  donors: DonorsTab,
  members: MembersTab,
  instagram: InstagramTab,
  analytics: AnalyticsTab,
  mailgun: MailgunTab,
};

const VALID_TABS = new Set([
  'events',
  'drafts',
  'review',
  'messages',
  'feedback',
  'trash',
  'categories',
  'theme',
  'helpers',
  'donors',
  'members',
  'instagram',
  'analytics',
  'mailgun',
]);

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, canCreateEvents } = useAuth();
  const isAdmin = role === 'Admin';
  const { count: unreadCount } = useUnreadMessageCount();
  const { hasMessages } = useHasMessages();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
  const { hasFeedback } = useHasFeedback(isAdmin);
  const { count: trashedCount } = useTrashedEventsCount(isAdmin);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events } = useEvents(user);
  const { pendingEvents } = usePendingEvents();

  const draftCount = useMemo(() => events.filter((e) => e.status === 'draft').length, [events]);
  const hashEventId = useMemo(() => {
    const hash = location.hash.replace(/^#/, '').trim();
    return hash || null;
  }, [location.hash]);
  const reviewCount = useMemo(() => (isAdmin ? pendingEvents.length : 0), [isAdmin, pendingEvents]);

  const visibleTabs = useMemo(() => {
    return {
      events: true,
      drafts: draftCount > 0,
      review: isAdmin,
      messages: hasMessages,
      feedback: isAdmin && hasFeedback,
      trash: trashedCount > 0,
      categories: isAdmin,
      theme: isAdmin,
      helpers: isAdmin,
      donors: isAdmin,
      members: isAdmin,
      instagram: isAdmin,
      analytics: isAdmin,
      mailgun: isAdmin,
    };
  }, [draftCount, hasMessages, isAdmin, hasFeedback, trashedCount]);

  const rawTab = searchParams.get('tab');
  const activeTab = useMemo(() => {
    if (rawTab && VALID_TABS.has(rawTab) && visibleTabs[rawTab]) return rawTab;
    return 'events';
  }, [rawTab, visibleTabs]);

  const [openGroup, setOpenGroup] = useState(null);
  const tabsRef = useRef(null);

  useEffect(() => {
    if (!openGroup) return undefined;
    const onPointerDown = (e) => {
      if (tabsRef.current && !tabsRef.current.contains(e.target)) setOpenGroup(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openGroup]);

  // Red signal counts per tab; a group shows the sum of its tabs.
  const badges = {
    drafts: { count: draftCount, label: `${draftCount} Entwurf${draftCount > 1 ? 'e' : ''}` },
    review: { count: reviewCount, label: `${reviewCount} zu prüfende Events` },
    messages: { count: unreadCount, label: `${unreadCount} ungelesene Nachrichten` },
    feedback: {
      count: isAdmin ? unreadFeedbackCount : 0,
      label: `${unreadFeedbackCount} ungelesenes Feedback`,
    },
  };
  const formatCount = (n) => (n > 9 ? '9+' : n);

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

      <div
        className="admin-page-tabs"
        role="tablist"
        aria-label="Verwaltungs-Bereiche"
        ref={tabsRef}
      >
        {TAB_GROUPS.map((group) => {
          const tabs = group.tabs.filter((t) => visibleTabs[t.id]);
          if (tabs.length === 0) return null;
          const isOpen = openGroup === group.id;
          const isActive = tabs.some((t) => t.id === activeTab);
          const groupCount = tabs.reduce((sum, t) => sum + (badges[t.id]?.count || 0), 0);
          return (
            <div key={group.id} className="admin-page-group">
              <button
                type="button"
                className={`admin-page-tab admin-page-group-toggle${isActive ? ' admin-page-tab--active' : ''}`}
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
                data-testid={`admin-group-${group.id}`}
              >
                <group.Icon size={16} aria-hidden="true" />
                <span>{group.label}</span>
                {groupCount > 0 && (
                  <span
                    className="admin-page-tab-badge"
                    data-testid={`admin-group-${group.id}-badge`}
                    aria-label={`${groupCount} Hinweise`}
                  >
                    {formatCount(groupCount)}
                  </span>
                )}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="admin-page-group-menu" hidden={!isOpen}>
                {tabs.map((t) => {
                  const badge = badges[t.id];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t.id}
                      aria-controls={`admin-tab-${t.id}`}
                      id={`admin-tab-${t.id}-btn`}
                      className={`admin-page-group-item${activeTab === t.id ? ' admin-page-group-item--active' : ''}`}
                      onClick={() => {
                        setOpenGroup(null);
                        if (t.id === 'theme') navigate('/admin/theme-editor');
                        else setTab(t.id);
                      }}
                      data-testid={`admin-tab-${t.id}`}
                    >
                      <t.Icon size={16} aria-hidden="true" />
                      <span>{t.label}</span>
                      {badge && badge.count > 0 && (
                        <span
                          className="admin-page-tab-badge"
                          data-testid={`admin-tab-${t.id}-badge`}
                          aria-label={badge.label}
                        >
                          {formatCount(badge.count)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {Object.entries(PANELS).map(([id, Panel]) =>
        visibleTabs[id] ? (
          <div
            key={id}
            role="tabpanel"
            id={`admin-tab-${id}`}
            aria-labelledby={`admin-tab-${id}-btn`}
            hidden={activeTab !== id}
          >
            {activeTab === id && <Panel />}
          </div>
        ) : null
      )}

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </div>
  );
}
