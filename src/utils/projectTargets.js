// Which real Firebase projects the admin scripts may talk to, and the guards
// around that choice. Pure (no Firebase imports) so Vitest covers it.
//
// Exactly two real projects exist: production and the disposable staging
// project. Everything else is refused, and an environment that points
// somewhere else (emulator host variables, a different default project, the
// production service-account key for a staging run) aborts instead of being
// silently ignored.

export const PROD_PROJECT_ID = 'spirieventsvbg';
export const STAGING_PROJECT_ID = 'tribe-vbg-staging';
export const REAL_PROJECT_IDS = Object.freeze([PROD_PROJECT_ID, STAGING_PROJECT_ID]);

const EMULATOR_ENV_KEYS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'];
const PROJECT_ENV_KEYS = ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT'];

/** 'production' | 'staging' for an allowlisted project id; throws otherwise. */
export function realTargetFor(projectId) {
  if (projectId === PROD_PROJECT_ID) return 'production';
  if (projectId === STAGING_PROJECT_ID) return 'staging';
  throw new Error(
    `Unbekanntes Projekt "${projectId}" (nur ${PROD_PROJECT_ID} oder ${STAGING_PROJECT_ID} erlaubt)`
  );
}

/**
 * Throws when the environment contradicts a run against the real project
 * `projectId`: an emulator host is set, or GCLOUD_PROJECT /
 * GOOGLE_CLOUD_PROJECT names a different project.
 */
export function assertUnambiguousEnv(projectId, env = {}) {
  for (const key of EMULATOR_ENV_KEYS) {
    if (env[key]) {
      throw new Error(
        `${key} ist gesetzt, aber --project ${projectId} verlangt: unklares Ziel, Abbruch`
      );
    }
  }
  for (const key of PROJECT_ENV_KEYS) {
    if (env[key] && env[key] !== projectId) {
      throw new Error(
        `${key}=${env[key]} ist gesetzt, aber --project ${projectId} verlangt: unklares Ziel, Abbruch`
      );
    }
  }
}

/**
 * Staging runs use the user's Application Default Credentials. They must never
 * pick up the production key (scripts/service-account.json) through
 * GOOGLE_APPLICATION_CREDENTIALS. `credentialsJson` is the parsed file that
 * variable points at (null when unset or unreadable).
 */
export function assertStagingCredentials({ credentialsPath = null, credentialsJson = null } = {}) {
  if (!credentialsPath) return;
  if (/(^|[\\/])service-account\.json$/.test(credentialsPath)) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS zeigt auf ${credentialsPath} (Produktions-Schluessel); ` +
        'fuer Staging die Variable entfernen und ADC (gcloud auth application-default login) nutzen'
    );
  }
  const keyProject = credentialsJson?.project_id;
  if (credentialsJson?.type === 'service_account' && keyProject !== STAGING_PROJECT_ID) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS ist ein Service-Account von "${keyProject}", nicht von ${STAGING_PROJECT_ID}: Abbruch`
    );
  }
}

/** Throws unless the initialized client really talks to `expected`. */
export function assertInitializedProject(actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `Initialisiertes Projekt "${actual}" ist nicht das erwartete "${expected}": Abbruch vor dem Schreiben`
    );
  }
}

/**
 * Target of scripts/promote-admin.mjs.
 *  - `--emulator`: emulator (project namespace spirieventsvbg), unchanged
 *  - no flag: production via scripts/service-account.json, unchanged
 *  - `--project spirieventsvbg`: the same production path, spelled out
 *  - `--project tribe-vbg-staging`: staging with ADC
 */
export function resolvePromoteTarget({ emulator = false, project = null } = {}, env = {}) {
  if (emulator && project !== null) throw new Error('--emulator und --project schliessen sich aus');
  if (emulator) return { target: 'emulator', projectId: PROD_PROJECT_ID };
  if (project === null) return { target: 'production', projectId: PROD_PROJECT_ID };
  const target = realTargetFor(project);
  assertUnambiguousEnv(project, env);
  return { target, projectId: project };
}

/**
 * Target of scripts/seed-regions.mjs: emulator by default, `--prod` (legacy)
 * or `--project spirieventsvbg` for production, `--project tribe-vbg-staging`
 * for staging. Unknown options are refused.
 */
export function resolveSeedRegionsTarget(argv, env = {}) {
  const args = [...argv];
  let project = null;
  let prodFlag = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--prod') prodFlag = true;
    else if (arg === '--project') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error('--project braucht einen Wert');
      project = value;
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (prodFlag && project !== null && project !== PROD_PROJECT_ID) {
    throw new Error('--prod und --project widersprechen sich');
  }
  if (prodFlag) project = PROD_PROJECT_ID;
  if (project === null) return { target: 'emulator', projectId: PROD_PROJECT_ID };
  const target = realTargetFor(project);
  assertUnambiguousEnv(project, env);
  return { target, projectId: project };
}
