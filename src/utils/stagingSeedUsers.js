// Pure core of scripts/seed-staging-users.mjs: the three staging test accounts,
// option parsing (staging only, or the emulator for tests) and the profile docs
// for the normal user. No Firebase imports, so Vitest covers it.
import { splitProfileData } from './profile.js';
import { REGION_MODERATOR_ROLE, SUPER_ADMIN_ROLE, parseModeratorRegions } from './staffRoles.js';
import { STAGING_PROJECT_ID, assertUnambiguousEnv } from './projectTargets.js';

export const MIN_PASSWORD_LENGTH = 12;
export const DEFAULT_EMULATOR_HOSTS = Object.freeze({
  auth: '127.0.0.1:9199',
  firestore: '127.0.0.1:8181',
});

export const STAGING_SEED_USERS = Object.freeze([
  {
    key: 'admin',
    email: 'admin@staging.test',
    displayName: 'Staging Super-Admin',
    role: SUPER_ADMIN_ROLE,
  },
  {
    key: 'moderator',
    email: 'moderator@staging.test',
    displayName: 'Staging Regions-Moderatorin',
    role: REGION_MODERATOR_ROLE,
    // Canonical REGION_SLUGS order, validated.
    regionIds: parseModeratorRegions('steiermark,innerschweiz'),
  },
  {
    key: 'user',
    email: 'user@staging.test',
    displayName: 'Staging Testuser',
    role: null,
    slug: 'staging-testuser',
  },
]);

/**
 * CLI options. The project is hard-coded to tribe-vbg-staging; `--project`
 * is accepted only with exactly that id. `--emulator` runs against the local
 * emulators (project namespace tribe-vbg-staging there; hosts from
 * FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST or the defaults).
 */
export function resolveSeedUsersOptions(argv, { env = {} } = {}) {
  const args = [...argv];
  const opts = { emulator: false, password: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--emulator') opts.emulator = true;
    else if (arg === '--project' || arg === '--password') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${arg} braucht einen Wert`);
      if (arg === '--project' && value !== STAGING_PROJECT_ID) {
        throw new Error(
          `Projekt "${value}" verweigert: seed-staging-users schreibt nur nach ${STAGING_PROJECT_ID}`
        );
      }
      if (arg === '--password') opts.password = value;
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (opts.password !== null && opts.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`--password muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`);
  }
  if (opts.emulator) {
    return {
      ...opts,
      target: 'emulator',
      projectId: STAGING_PROJECT_ID,
      emulatorHosts: {
        auth: env.FIREBASE_AUTH_EMULATOR_HOST || DEFAULT_EMULATOR_HOSTS.auth,
        firestore: env.FIRESTORE_EMULATOR_HOST || DEFAULT_EMULATOR_HOSTS.firestore,
      },
    };
  }
  assertUnambiguousEnv(STAGING_PROJECT_ID, env);
  return { ...opts, target: 'staging', projectId: STAGING_PROJECT_ID };
}

const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Password from `bytes` (>= 18 random bytes, 6 bits each: >= 108 bits). */
export function passwordFromBytes(bytes) {
  if (!bytes || bytes.length < 18) throw new Error('need at least 18 random bytes');
  // 256 % 64 === 0, so `b % 64` is unbiased.
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % 64]).join('');
}

/**
 * users/{uid} and users/{uid}/publicProfile/data for the normal user, in the
 * shape the app writes on sign-up (seedProfileDoc in src/hooks/useAuth.js).
 * `createdAt` only for a new account, so a re-run keeps the original one.
 */
export function buildUserProfileDocs({ email, displayName, slug }, { now, isNew }) {
  const privatePayload = {
    displayName,
    bio: '',
    website: '',
    contact: email,
    photoURL: null,
    slug,
    notifyNewsletter: false,
    ...(isNew ? { createdAt: now } : {}),
    updatedAt: now,
  };
  const { publicDoc } = splitProfileData(privatePayload);
  return { privateDoc: privatePayload, publicDoc: { ...publicDoc, updatedAt: now } };
}
