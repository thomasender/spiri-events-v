import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import ProfileForm from '../components/ProfileForm';
import ChangeEmailForm from '../components/ChangeEmailForm';
import NotificationPreferencesCard from '../components/NotificationPreferencesCard';
import DeleteAccountSection from '../components/DeleteAccountSection';
import SeoMeta from '../components/SeoMeta';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, role, changeEmail, deleteAccount, isGoogleUser } = useAuth();
  const { profile, notificationPreferences, loading: profileLoading, save } = useProfile(user?.uid);
  const isAdmin = role === 'Admin';
  const navigate = useNavigate();

  const handleProfileSave = async (updates) => {
    const newSlug = await save(updates);
    if (newSlug) {
      window.setTimeout(() => navigate(`/${newSlug}`), 1500);
    }
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

        <NotificationPreferencesCard
          preferences={notificationPreferences}
          isAdmin={isAdmin}
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
