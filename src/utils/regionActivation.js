// Texts for the "Regionen" admin tab (switching regions on/off). The rules
// themselves live on the server: functions/src/regionActivation.ts.

/**
 * German sentences for the activation conditions that are not met.
 * `unmet` is the list from the server ('moderators', 'events').
 */
export function unmetConditionTexts(
  { unmet = [], upcomingEventCount = 0 } = {},
  minUpcomingEvents = 15
) {
  const texts = [];
  if (unmet.includes('moderators')) texts.push('Es fehlt mindestens ein:e Moderator:in.');
  if (unmet.includes('events')) {
    texts.push(`Nur ${upcomingEventCount} von ${minUpcomingEvents} kommenden Events.`);
  }
  return texts;
}

/** The server refused an activation because conditions are unmet (details), else null. */
export function unmetFromError(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const details = err?.details;
  if (code !== 'failed-precondition' || details?.reason !== 'conditions-unmet') return null;
  return {
    unmet: Array.isArray(details.unmet) ? details.unmet : [],
    moderatorCount: Number(details.moderatorCount) || 0,
    upcomingEventCount: Number(details.upcomingEventCount) || 0,
    minUpcomingEvents: Number(details.minUpcomingEvents) || 15,
  };
}

/** Plain German message for a failed adminSetRegionActive / adminListRegionActivation call. */
export function regionActivationErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  switch (code) {
    case 'failed-precondition':
      if (err?.details?.reason === 'permanent-region') {
        return 'Vorarlberg bleibt immer aktiv und kann nicht deaktiviert werden.';
      }
      if (err?.details?.reason === 'no-districts') {
        return 'Diese Region hat noch keine Landkreise / Bezirke. Ordne ihr zuerst im Tab „Zuordnung“ welche zu.';
      }
      return 'Die Voraussetzungen für diese Region sind nicht erfüllt.';
    case 'not-found':
      return 'Diese Region ist noch nicht eingerichtet. Bitte melde dich beim Technik-Team.';
    case 'invalid-argument':
      return 'Diese Region gibt es nicht.';
    case 'permission-denied':
      return 'Nur Super-Admins können Regionen freischalten oder deaktivieren.';
    case 'unauthenticated':
      return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
      return 'Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}
