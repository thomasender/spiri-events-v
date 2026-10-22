import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useOnboardingAccess } from '../hooks/useChatSettings';
import {
  isOnboardingDismissed,
  needsOnboarding,
  setOnboardingDismissed,
} from '../utils/onboarding';
import ProfileOnboarding from './ProfileOnboarding';
import './ProfileOnboarding.css';

// Mounted once in the app layout. Behind the flag app_settings/onboarding it opens
// the wizard once for a verified member whose photo or description is missing; after
// "Schließen" a slim banner offers it again.
export default function ProfileOnboardingGate() {
  const { user } = useAuth();
  const { available } = useOnboardingAccess();
  if (!user || !user.emailVerified || !available) return null;
  return <GateInner user={user} />;
}

function GateInner({ user }) {
  const { profile, loading, save } = useProfile(user.uid);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);
  const autoChecked = useRef(false);
  const incomplete = !loading && needsOnboarding(profile);

  // Decide once, when the profile has loaded, whether to open on its own.
  useEffect(() => {
    if (loading || autoChecked.current) return;
    autoChecked.current = true;
    if (needsOnboarding(profile) && !isOnboardingDismissed(user.uid)) setOpen(true);
  }, [loading, profile, user.uid]);

  const close = () => {
    setOnboardingDismissed(user.uid);
    setOpen(false);
  };

  // The profile page has the full form already.
  if (pathname.startsWith('/profil')) return null;

  return (
    <>
      {open && (
        <ProfileOnboarding
          profile={profile}
          uid={user.uid}
          defaultName={user.displayName || ''}
          onSave={save}
          onClose={close}
        />
      )}
      {!open && incomplete && !bannerHidden && (
        <div className="onboarding-banner" role="status" data-testid="onboarding-banner">
          <Sparkles size={20} aria-hidden="true" />
          <p className="onboarding-banner-text">
            Dein Profil ist noch nicht ganz fertig. Mit Foto und Beschreibung findet dich die
            Community leichter.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOpen(true)}
            data-testid="onboarding-banner-open"
          >
            Profil vervollständigen
          </button>
          <button
            type="button"
            className="onboarding-banner-close"
            aria-label="Hinweis ausblenden"
            onClick={() => setBannerHidden(true)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
