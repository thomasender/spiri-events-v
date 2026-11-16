import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { callable } from '../lib/firebase';
import { useMembershipAccess, useOwnMembership } from '../hooks/useMembership';
import {
  formatEuro,
  formatMembershipDate,
  isMembershipRunning,
  membershipErrorMessage,
} from '../utils/clubMembership';
import ConfirmDialog from './ConfirmDialog';

// "Pioniere-Mitgliedschaft" in the profile (Trello 6af620c0): status, amount and,
// clearly visible, "Mitgliedschaft kündigen". Shown to members always, to everybody
// else only while the sign-up is open for them (flag app_settings/membership).
export default function PioniereMembershipCard({ uid }) {
  const access = useMembershipAccess();
  const { membership, loading } = useOwnMembership(uid);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (loading || access.loading) return null;
  const running = isMembershipRunning(membership);
  if (!running && !access.visible) return null;

  const cancel = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await callable('cancelMembership')({});
      setNotice(
        result.data?.status === 'cancelled' && result.data.paidUntil
          ? `Deine Mitgliedschaft ist gekündigt. Sie läuft noch bis ${formatMembershipDate(result.data.paidUntil)}, es wird nichts mehr abgebucht.`
          : 'Deine Mitgliedschaft ist beendet. Danke, dass du dabei warst!'
      );
      setConfirming(false);
    } catch (err) {
      setError(membershipErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const amount = typeof membership?.amount === 'number' ? formatEuro(membership.amount) : '';
  const until = formatMembershipDate(membership?.paidUntil);

  return (
    <section className="profile-card" id="pioniere" data-testid="profile-pioniere">
      <h2 className="profile-card-title">
        <Sprout size={20} aria-hidden="true" /> Pioniere-Mitgliedschaft
      </h2>

      {membership?.status === 'active' && (
        <>
          <p className="profile-card-hint" data-testid="pioniere-status">
            Du bist Pionier:in
            {amount ? ` mit ${amount} im Monat` : ''}.
            {membership.source === 'web' && until ? ` Nächste Abbuchung am ${until}.` : ''} Danke,
            dass du den Tribe mitträgst!
          </p>
          <button
            type="button"
            className="btn btn-subtle-danger"
            onClick={() => setConfirming(true)}
            data-testid="pioniere-cancel"
          >
            Mitgliedschaft kündigen
          </button>
        </>
      )}

      {membership?.status === 'cancelled' && running && (
        <p className="profile-card-hint" data-testid="pioniere-status">
          Gekündigt. Deine Mitgliedschaft läuft noch bis {until}, es wird nichts mehr abgebucht.
        </p>
      )}

      {!running && (
        <>
          <p className="profile-card-hint" data-testid="pioniere-status">
            {membership?.status === 'pending'
              ? 'Deine Anmeldung ist begonnen, die Zahlung ist aber noch nicht bestätigt. Wurde sie abgebrochen, kannst du es noch einmal versuchen.'
              : 'Werde Vereinsmitglied und trage den Tribe mit. Den monatlichen Beitrag wählst du selbst.'}
          </p>
          <Link to="/pioniere" className="btn btn-primary" data-testid="pioniere-join">
            Pionier:in werden
          </Link>
        </>
      )}

      {notice && (
        <p className="profile-card-hint" role="status">
          {notice}
        </p>
      )}
      {error && !confirming && (
        <p className="profile-card-hint" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        isOpen={confirming}
        title="Mitgliedschaft kündigen?"
        confirmLabel="Ja, kündigen"
        cancelLabel="Nein, Mitglied bleiben"
        onConfirm={cancel}
        onCancel={() => setConfirming(false)}
        loading={busy}
        danger
      >
        <p>
          {membership?.source === 'web'
            ? 'Es wird nichts mehr abgebucht. Deine Mitgliedschaft läuft bis zum Ende des bezahlten Monats.'
            : 'Deine Mitgliedschaft endet sofort.'}
        </p>
        {error && <p role="alert">{error}</p>}
      </ConfirmDialog>
    </section>
  );
}
