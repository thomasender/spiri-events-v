import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import ProfileForm from '../components/ProfileForm';
import ChangeEmailForm from '../components/ChangeEmailForm';
import DeleteAccountSection from '../components/DeleteAccountSection';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, changeEmail, deleteAccount } = useAuth();
  const { profile, loading: profileLoading, save } = useProfile(user?.uid);

  if (!user) {
    return <div className="loading-spinner" data-testid="profile-loading" />;
  }

  if (profileLoading) {
    return <div className="loading-spinner" data-testid="profile-loading" />;
  }

  return (
    <div className="profile-page" data-testid="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <h1>Mein Profil</h1>
          <p>Verwalte deine persönlichen Daten und dein Konto.</p>
        </div>

        <ProfileForm profile={profile} uid={user.uid} onSave={save} />

        <ChangeEmailForm
          currentEmail={user.email}
          onChangeEmail={(newEmail, password) => changeEmail(newEmail, password)}
        />

        <DeleteAccountSection onDelete={(password) => deleteAccount(password)} />
      </div>
    </div>
  );
}
