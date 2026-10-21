import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import EmailVerificationModal from '../components/EmailVerificationModal';
import Conversation from '../components/messenger/Conversation';
import ThreadList from '../components/messenger/ThreadList';
import ErrorPage from './ErrorPage';
import { useAuth } from '../hooks/useAuth';
import { useMessengerAccess } from '../hooks/useChatSettings';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useMemberInfos } from '../hooks/useMemberInfo';
import { useMyDmSetting, useThreads } from '../hooks/useMessenger';
import { DM_RETENTION_DAYS, otherUid } from '../utils/messenger';
import './MessengerPage.css';

function Inbox({ activeUid }) {
  const { user } = useAuth();
  const me = user.uid;
  const { threads, loading } = useThreads(true);
  const { statusOf } = useOnlineStatus();
  const infos = useMemberInfos(threads.map((t) => otherUid(t, me)));
  const { allow, loaded, update } = useMyDmSetting();
  const [saving, setSaving] = useState(false);

  const toggle = async (e) => {
    setSaving(true);
    try {
      await update(e.target.checked);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="messenger-inbox" aria-label="Postfach">
      <h1 className="messenger-title">
        <Mail size={24} aria-hidden="true" /> Postfach
      </h1>
      <label className="messenger-setting">
        <input
          type="checkbox"
          checked={allow}
          disabled={!loaded || saving}
          onChange={toggle}
          data-testid="messenger-allow"
        />
        <span>Ich nehme Privatnachrichten an</span>
      </label>
      <ThreadList
        threads={threads}
        infos={infos}
        me={me}
        activeUid={activeUid}
        statusOf={statusOf}
        loading={loading}
      />
      <p className="messenger-hint">
        Privatnachrichten sehen nur ihr beiden. Sie werden nach {DM_RETENTION_DAYS} Tagen
        automatisch gelöscht.
      </p>
    </aside>
  );
}

export default function MessengerPage() {
  const { user, loading: authLoading } = useAuth();
  const { available, loading: settingsLoading } = useMessengerAccess();
  const { uid: activeUid } = useParams();
  const [verifyOpen, setVerifyOpen] = useState(false);

  if (authLoading || settingsLoading) return <div className="loading-spinner"></div>;
  if (!available) return <ErrorPage type="not-found" redirectSeconds={5} />;
  if (!user.emailVerified) {
    return (
      <div className="page-container messenger-page">
        <div className="chat-state chat-unverified" data-testid="messenger-unverified">
          <p>Bitte bestätige zuerst deine E-Mail-Adresse, um Privatnachrichten zu nutzen.</p>
          <button type="button" className="btn btn-primary" onClick={() => setVerifyOpen(true)}>
            E-Mail bestätigen
          </button>
          <EmailVerificationModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
        </div>
      </div>
    );
  }
  if (activeUid === user.uid) return <Navigate to="/postfach" replace />;

  return (
    <>
      <SeoMeta title="Postfach" path="/postfach" noindex />
      <div
        className={`page-container messenger-page${activeUid ? ' messenger-page--open' : ''}`}
        data-testid="messenger-page"
      >
        <Inbox activeUid={activeUid} />
        {activeUid ? (
          <Conversation key={activeUid} other={activeUid} />
        ) : (
          <section className="messenger-placeholder" data-testid="messenger-placeholder">
            <p>Wähle links eine Unterhaltung aus.</p>
          </section>
        )}
      </div>
    </>
  );
}
