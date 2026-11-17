// System account "Dein Tribe" (Trello 6afb1116, docs/pre-entries.md): owns every
// pre-entered event until the organizer takes it over. Nobody signs in with it.
// KEEP IN SYNC with functions/src/systemAccount.ts (tests/lib/preEntries.spec.ts).
export const SYSTEM_UID = 'system-dein-tribe';
export const SYSTEM_USERNAME = 'dein-tribe';
export const SYSTEM_DISPLAY_NAME = 'Dein Tribe';

export function isSystemUid(uid) {
  return uid === SYSTEM_UID;
}

/**
 * users/{SYSTEM_UID} and users/{SYSTEM_UID}/publicProfile/data for the seed
 * script. Visible profile page (/dein-tribe), never in the directory.
 */
export function buildSystemProfileDocs({ now, isNew }) {
  const bio =
    'Wir sind das Team hinter Tribe. Unter diesem Namen tragen wir Events vorab ein, ' +
    'die wir in der Region entdeckt haben. Sobald die Veranstalter:innen ihr Event ' +
    'übernehmen, erscheint es in ihrem eigenen Profil.';
  // Only fields of PUBLIC_PROFILE_FIELDS (src/utils/profile.js) go public.
  const shared = {
    displayName: SYSTEM_DISPLAY_NAME,
    slug: SYSTEM_USERNAME,
    bio,
    website: '',
    photoURL: null,
    listedInDirectory: false,
    updatedAt: now,
  };
  return {
    privateDoc: {
      ...shared,
      contact: '',
      notifyNewsletter: false,
      systemAccount: true,
      ...(isNew ? { createdAt: now } : {}),
    },
    publicDoc: { ...shared },
  };
}

/**
 * Options of scripts/seed-dein-tribe.mjs. Dry run unless `--apply`. Real
 * projects only from the allowlist (src/utils/projectTargets.js), and only
 * with an unambiguous environment; `--emulator` for local tests.
 */
export function resolveSeedDeinTribeOptions(
  argv,
  { env = {}, realTargetFor, assertUnambiguousEnv }
) {
  const args = [...argv];
  const opts = { apply: false, emulator: false, projectId: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--emulator') opts.emulator = true;
    else if (arg === '--project') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error('--project braucht einen Wert');
      opts.projectId = value;
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (opts.emulator) {
    if (opts.projectId) throw new Error('--emulator und --project schliessen sich aus');
    return {
      ...opts,
      target: 'emulator',
      emulatorHosts: {
        auth: env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199',
        firestore: env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181',
      },
    };
  }
  if (!opts.projectId) throw new Error('--project <id> oder --emulator angeben');
  const target = realTargetFor(opts.projectId);
  assertUnambiguousEnv(opts.projectId, env);
  return { ...opts, target };
}
