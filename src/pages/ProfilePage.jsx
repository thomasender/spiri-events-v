import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useRegion } from '../hooks/useRegion';
import ProfileForm from '../components/ProfileForm';
import ChangeEmailForm from '../components/ChangeEmailForm';
import NotificationPreferencesCard from '../components/NotificationPreferencesCard';
import InstagramConsentCard from '../components/InstagramConsentCard';
import DeleteAccountSection from '../components/DeleteAccountSection';
import { RegionPickButton } from '../components/RegionSwitcher';
import SeoMeta from '../components/SeoMeta';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, role, changeEmail, deleteAccount, isGoogleUser } = useAuth();
  const { profile, notificationPreferences, loading: profileLoading, save } = useProfile(user?.uid);
  const isAdmin = role === 'Admin';
  // Dark launch: no region card at all while there is nothing to switch between
  // (an empty card with only the hint text looked broken).
  const canPickRegion = useRegion().regions.length >= 2;

  const handleProfileSave = async (updates) => {
    const newSlug = await save(updates);
    return newSlug;
  };

  const handlePreferencesSave = async (updates) => {
    await save(updates);
  };

  if (!user) {
    return (
      <>
        <SeoMeta title="Mein Profil" path="/profil" noindex />
        <div className="loading-spinner" data-testid="profile-loading" />
      </>
    );
  }

  if (profileLoading) {
    return (
      <>
        <SeoMeta title="Mein Profil" path="/profil" noindex />
        <div className="loading-spinner" data-testid="profile-loading" />
      </>
    );
  }

  return (
    <div className="profile-page" data-testid="profile-page">
      <SeoMeta title="Mein Profil" path="/profil" noindex />
      <div className="profile-container">
        <div className="profile-header">
          <h1>Mein Profil</h1>
          <p>Verwalte deine persönlichen Daten und dein Konto.</p>
        </div>

        <ProfileForm profile={profile} uid={user.uid} onSave={handleProfileSave} />

        {!isAdmin && canPickRegion && (
          <section className="profile-card" data-testid="profile-region">
            <h2 className="profile-card-title">Ort und Umkreis</h2>
            <p className="profile-card-hint">
              Wähle deinen Ort und einen Umkreis. Wir zeigen dir die Events in deiner Nähe und
              merken uns die Auswahl für dein Konto.
            </p>
            <RegionPickButton testId="profile-region-pick" />
          </section>
        )}

        <NotificationPreferencesCard
          preferences={notificationPreferences}
          isAdmin={isAdmin}
          onSave={handlePreferencesSave}
        />

        <InstagramConsentCard
          checked={profile?.instagramConsentDefault === true}
          onSave={handlePreferencesSave}
        />

        <ChangeEmailForm
          currentEmail={user.email}
          onChangeEmail={(newEmail, password) => changeEmail(newEmail, password)}
          isGoogleUser={isGoogleUser}
        />

        <DeleteAccountSection
          onDelete={(password) => deleteAccount(password)}
          isGoogleUser={isGoogleUser}
        />
      </div>
    </div>
  );
}
