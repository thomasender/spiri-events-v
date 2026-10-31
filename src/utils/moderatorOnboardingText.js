// Texts of the moderator onboarding wizard (/einladung, Trello 6ae5aa68), taken from
// the ticket. "The Tribe" of the original is replaced by "Tribe <Region>".
//
// The version and the consent ids are stored with the signature. KEEP IN SYNC with
// ONBOARDING_TEXT_VERSION / REQUIRED_CONSENTS in functions/src/moderatorInvites.ts
// (tests/lib/moderatorInvites.spec.ts compares both). Bump the version whenever the
// meaning of a text changes, so it is clear what someone agreed to.
export const MODERATOR_ONBOARDING_TEXT_VERSION = 1;
export const MODERATOR_ONBOARDING_CONSENTS = ['haltung', 'richtlinien', 'pruefung'];

export const SIGNATURE_MIN = 2;
export const SIGNATURE_MAX = 80;

/** "Tribe Tirol", "Tribe Tirol und Tribe Wien", "Tribe A, Tribe B und Tribe C". */
export function tribeNames(regionNames = []) {
  const names = regionNames.map((name) => `Tribe ${name}`);
  if (names.length <= 1) return names[0] ?? 'Tribe';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

/**
 * The wizard steps. `consent` = the id the person must tick on this step (null = none);
 * `consentLabel` is the text next to the tick box. `tribe` is tribeNames(...).
 */
export function moderatorOnboardingSteps(tribe) {
  return [
    {
      id: 'willkommen',
      short: 'Willkommen',
      title: `Willkommen im Team vom ${tribe}! ❤️`,
      paragraphs: [
        'Danke, dass du deine Zeit und Energie ehrenamtlich zur Verfügung stellst. Mit deinem Beitrag hilfst du, einen Raum zu schaffen, in dem Menschen zusammenfinden, sich inspirieren und gemeinsam wachsen können.',
      ],
      highlight:
        'Du bist nicht einfach dafür da, Events zu kontrollieren. Du bist Teil einer Gemeinschaft, die du mitgestaltest und mitträgst.',
      consent: null,
    },
    {
      id: 'haltung',
      short: 'Haltung',
      title: 'Unsere gemeinsame Haltung',
      items: [
        {
          label: 'Diene der Gemeinschaft',
          text: 'Handle im Sinne des gemeinsamen Ganzen, nicht nach persönlichen Vorlieben.',
        },
        {
          label: 'Begegne Menschen liebevoll',
          text: 'Hinter jedem Event steht ein Mensch, der etwas beitragen möchte.',
        },
        {
          label: 'Achte auch auf dich selbst',
          text: 'Du musst nicht alles sofort erledigen. Dein ehrenamtlicher Beitrag soll Freude machen, nicht zur Belastung werden.',
        },
        {
          label: 'Bleib offen und wohlwollend',
          text: 'Unterschiedliche Wege, Perspektiven und Ausdrucksformen dürfen Platz haben.',
        },
        {
          label: 'Vertraue deiner Intuition',
          text: 'Wenn du unsicher bist, frage lieber nach, statt vorschnell zu entscheiden.',
        },
      ],
      consent: 'haltung',
      consentLabel: 'Diese Haltung trage ich mit.',
    },
    {
      id: 'richtlinien',
      short: 'OK oder nicht?',
      title: 'Was ist OK – und was nicht?',
      groups: [
        {
          tone: 'ok',
          title: '🟢 OK – gerne genehmigen',
          items: [
            'Workshops, Seminare, Retreats und Veranstaltungen mit bewusstem, ganzheitlichem oder gemeinschaftsförderndem Charakter.',
            'Yoga, Meditation, Breathwork, Musik, Tanz, Naturerlebnisse, Persönlichkeitsentwicklung und ähnliche Angebote.',
            'Kommerzielle Veranstaltungen und kostenpflichtige Angebote.',
            'Events von Einzelpersonen, Vereinen und Unternehmen.',
            'Unterschiedliche spirituelle, kulturelle und philosophische Zugänge.',
            'Veranstaltungen, die einen echten Mehrwert für unsere Gemeinschaft bieten.',
          ],
        },
        {
          tone: 'not-ok',
          title: '🔴 NICHT OK – ablehnen',
          items: [
            `Veranstaltungen ohne erkennbaren Bezug zum ${tribe} und unserer Gemeinschaft.`,
            'Reine Werbung, Produktverkauf oder kommerzielle Eigenwerbung ohne tatsächliches Event.',
            'Events ohne regionalen Bezug zu unserem Veranstaltungskalender. Auslandsretreats gehören beispielsweise ins Veranstalterverzeichnis, nicht in den lokalen Eventkalender.',
            'Irreführende, offensichtlich falsche oder unvollständige Angaben.',
            'Diskriminierende, menschenverachtende, gewaltverherrlichende oder anderweitig schädliche Inhalte.',
            'Inhalte, die offensichtlich gegen geltendes Recht oder Rechte Dritter verstoßen.',
          ],
        },
      ],
      consent: 'richtlinien',
      consentLabel: 'Ich entscheide nach diesen Richtlinien.',
    },
    {
      id: 'pruefung',
      short: 'Prüfen',
      title: 'Vor jeder Freigabe kurz prüfen',
      checklist: [
        'Ist das Event thematisch passend?',
        'Sind Titel, Beschreibung, Datum und Ort verständlich und vollständig?',
        'Gibt es einen nachvollziehbaren Veranstalter und eine Kontakt- oder Anmeldemöglichkeit?',
        'Ist das Bild passend und für die Veröffentlichung geeignet?',
      ],
      tips: [
        { label: 'Wenn etwas fehlt', text: 'Lieber kurz nachfragen, statt sofort abzulehnen.' },
        { label: 'Wenn du unsicher bist', text: 'Hol dir eine zweite Meinung aus dem Team.' },
      ],
      consent: 'pruefung',
      consentLabel: 'Ich schaue mir jedes Event vor der Freigabe kurz so an.',
    },
    {
      id: 'erinnerung',
      short: 'Erinnerung',
      title: 'Eine letzte Erinnerung',
      paragraphs: [
        'Wir sind keine Richter und müssen nicht über die Angebote oder Lebenswege anderer Menschen urteilen.',
        'Wir halten gemeinsam einen Raum, in dem Vielfalt, Vertrauen, Achtsamkeit und Verbindung wachsen dürfen.',
      ],
      highlight:
        'Sei klar in deinen Entscheidungen, weich in deinem Herzen und liebevoll mit dir selbst.',
      closing: `Danke, dass du den ${tribe} mit deiner Zeit, deiner Aufmerksamkeit und deinem Herzen bereicherst.`,
      signoff: `Von Herzen – dein ${tribe} Team ❤️`,
      consent: null,
    },
    {
      id: 'unterschrift',
      short: 'Unterschrift',
      title: 'Fast geschafft!',
      paragraphs: [
        `Mit deinem Namen bestätigst du, dass du beim ${tribe} im Sinne dieser Einführung moderieren möchtest. Danach kannst du sofort loslegen.`,
      ],
      consent: null,
    },
  ];
}

/** User-facing message for an error of getModeratorInvite / acceptModeratorInvite. */
export function inviteErrorMessage(err, inviteEmail) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const message = String(err?.message || '');
  switch (code) {
    case 'not-found':
      return /uid/i.test(message)
        ? 'Dein Konto wurde nicht gefunden. Bitte melde dich erneut an.'
        : 'Diese Einladung gibt es nicht. Bitte prüfe den Link aus der E-Mail.';
    case 'invalid-argument':
      if (/link/i.test(message)) {
        return 'Dieser Einladungslink ist unvollständig. Bitte öffne ihn direkt aus der E-Mail.';
      }
      if (/name/i.test(message)) return 'Bitte unterschreibe mit deinem Namen.';
      return 'Bitte bestätige alle Punkte und unterschreibe mit deinem Namen.';
    case 'permission-denied':
      return inviteEmail
        ? `Diese Einladung gilt für ${inviteEmail}. Bitte melde dich mit ${inviteEmail} an.`
        : 'Diese Einladung gilt für eine andere E-Mail-Adresse.';
    case 'failed-precondition':
      if (/expired/i.test(message)) {
        return 'Diese Einladung ist abgelaufen. Bitte frag nach einer neuen Einladung.';
      }
      if (/revoked/i.test(message)) return 'Diese Einladung wurde zurückgezogen.';
      if (/used/i.test(message)) return 'Diese Einladung wurde schon angenommen.';
      if (/outdated/i.test(message)) {
        return 'Die Texte wurden inzwischen aktualisiert. Bitte lade die Seite neu und geh die Schritte noch einmal durch.';
      }
      if (/Super-Admin/i.test(message)) {
        return 'Du bist bereits Super-Admin und brauchst diese Einladung nicht.';
      }
      return 'Diese Einladung kann nicht mehr angenommen werden.';
    case 'resource-exhausted':
      return 'Das waren gerade viele Versuche. Bitte warte ein paar Minuten.';
    case 'unauthenticated':
      return 'Bitte melde dich an, um die Einladung anzunehmen.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
      return 'Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}
