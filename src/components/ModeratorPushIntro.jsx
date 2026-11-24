import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import './ModeratorPushIntro.css';

// What the person sees for the push state of THIS device (usePushDevice / pushSupportState).
const STATE_NOTES = {
  'ios-tab': {
    testId: 'mod-push-ios',
    text: 'Auf dem iPhone und iPad klappt das nur in der App: Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Öffne die Seite danach über das neue Symbol und folge den Schritten unten.',
  },
  active: {
    testId: 'mod-push-active',
    text: 'Push ist auf diesem Gerät schon eingeschaltet. Du bist startklar!',
  },
  denied: {
    testId: 'mod-push-denied',
    text: 'Dein Browser blockiert gerade Benachrichtigungen für diese Seite. Erlaube sie in den Browser-Einstellungen, dann kannst du Push einschalten.',
  },
  unsupported: {
    testId: 'mod-push-unsupported',
    text: 'Dieser Browser kann leider keine Push-Benachrichtigungen empfangen. Am Handy klappt es meist mit Chrome (Android) oder Safari (iPhone).',
  },
};

// Short introduction after the signature (Trello 801): how a new Moderator:in gets
// push messages on the phone, so a new event waiting for review does not go unnoticed.
// `pushState` is the state of usePushDevice; 'disabled' (no VAPID key) shows nothing.
export default function ModeratorPushIntro({ pushState }) {
  if (!pushState || pushState === 'disabled') return null;
  const note = STATE_NOTES[pushState];
  const canEnable = pushState === 'available' || pushState === 'ios-tab';

  return (
    <section className="mod-push" data-testid="mod-push-intro">
      <h2 className="mod-push-title">
        <BellRing size={18} aria-hidden="true" /> Nichts verpassen: Push aufs Handy
      </h2>
      <p className="mod-push-text">
        Sobald ein Event auf Freigabe wartet, kann dein Handy dich direkt informieren. So geht’s in
        einer Minute:
      </p>
      {note && (
        <p className="mod-push-note" data-testid={note.testId}>
          {note.text}
        </p>
      )}
      {canEnable && (
        <ol className="mod-push-steps">
          <li>
            Öffne dein Profil (Button unten) und gehe zu <strong>Benachrichtigungen</strong>.
          </li>
          <li>
            Schalte <strong>Push auf diesem Gerät</strong> ein und tippe auf{' '}
            <strong>Erlauben</strong>, wenn dein Handy fragt.
          </li>
          <li>Fertig. Die Hinweise für neue Events zur Prüfung sind dann gleich mit an.</li>
        </ol>
      )}
      {pushState !== 'unsupported' && pushState !== 'active' && (
        <Link to="/profil" className="btn btn-secondary" data-testid="mod-push-to-profile">
          Push im Profil einschalten
        </Link>
      )}
    </section>
  );
}
