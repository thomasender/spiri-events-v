// Shared REST helpers for scripts/promote-admin.mjs and
// scripts/seed-staging-users.mjs: Auth (Identity Toolkit) and Firestore via
// plain REST instead of firebase-admin, because firebase-admin pulls in
// jwks-rsa which currently fails under ESM (see scripts/export-firestore.mjs
// for the same workaround).
//
// Three targets:
//   emulator    fixed admin token "owner", hosts passed in by the caller
//   production  signed JWT from scripts/service-account.json (unchanged path)
//   staging     the user's Application Default Credentials via
//               google-auth-library, never scripts/service-account.json
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';
import { REGION_MODERATOR_ROLE, SUPER_ADMIN_ROLE } from '../../src/utils/staffRoles.js';
import {
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
  assertInitializedProject,
  assertStagingCredentials,
} from '../../src/utils/projectTargets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SERVICE_ACCOUNT_PATH = join(ROOT, 'scripts/service-account.json');
export const DEFAULT_EMULATOR_HOSTS = Object.freeze({
  auth: '127.0.0.1:9199',
  firestore: '127.0.0.1:8181',
});

const SCOPES = [
  'https://www.googleapis.com/auth/identitytoolkit',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/datastore',
];

function base64urlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function serviceAccountToken(cred, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlEncode(
    JSON.stringify({
      iss: cred.client_email,
      sub: cred.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: scopes,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(cred.private_key, 'base64');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

async function adcTokenProvider() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
  let credentialsJson = null;
  if (credentialsPath) {
    try {
      credentialsJson = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    } catch {
      credentialsJson = null;
    }
  }
  assertStagingCredentials({ credentialsPath, credentialsJson });
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: SCOPES });
  return async () => {
    const token = await auth.getAccessToken();
    if (!token) throw new Error('Kein ADC-Token (gcloud auth application-default login?)');
    return token;
  };
}

const stringArray = (values) => ({
  arrayValue: { values: values.map((v) => ({ stringValue: v })) },
});

/**
 * Plain JS value -> Firestore REST value. Supports what the scripts write:
 * strings, booleans, null, Date (timestamp), arrays and plain objects.
 */
export function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestoreValue(v)])),
      },
    };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

export const toFirestoreFields = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFirestoreValue(v)]));

/**
 * @param {{ target: 'emulator' | 'production' | 'staging', projectId?: string,
 *           emulatorHosts?: { auth: string, firestore: string } }} options
 */
export async function createAdminRestClient({
  target,
  projectId,
  emulatorHosts = DEFAULT_EMULATOR_HOSTS,
}) {
  let getToken;
  let quotaProject = null;
  if (target === 'emulator') {
    // The emulators accept the fixed admin token "owner".
    getToken = async () => 'owner';
    projectId = projectId ?? PROD_PROJECT_ID;
  } else if (target === 'production') {
    if (!existsSync(SERVICE_ACCOUNT_PATH)) {
      throw new Error('scripts/service-account.json not found');
    }
    const cred = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    // Unchanged: without an explicit projectId the key decides.
    if (projectId) assertInitializedProject(cred.project_id, projectId);
    projectId = cred.project_id;
    const cache = new Map();
    getToken = async (scopes = SCOPES.join(' ')) => {
      if (!cache.has(scopes)) cache.set(scopes, await serviceAccountToken(cred, scopes));
      return cache.get(scopes);
    };
  } else if (target === 'staging') {
    assertInitializedProject(projectId, STAGING_PROJECT_ID);
    const provider = await adcTokenProvider();
    getToken = () => provider();
    // User ADC needs a quota project for Identity Toolkit / Firestore REST.
    quotaProject = STAGING_PROJECT_ID;
  } else {
    throw new Error(`Unknown target ${target}`);
  }

  const authBase =
    target === 'emulator'
      ? `http://${emulatorHosts.auth}/identitytoolkit.googleapis.com`
      : 'https://identitytoolkit.googleapis.com';
  const docRoot = `projects/${projectId}/databases/(default)/documents`;
  const firestoreBase =
    target === 'emulator'
      ? `http://${emulatorHosts.firestore}/v1/${docRoot}`
      : `https://firestore.googleapis.com/v1/${docRoot}`;

  async function request(url, { method = 'POST', body, scopes } = {}) {
    const token = await getToken(scopes);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (quotaProject) headers['x-goog-user-project'] = quotaProject;
    return fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const authScopes =
    'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform';
  const firestoreScopes = 'https://www.googleapis.com/auth/datastore';

  async function ok(response, what) {
    if (!response.ok)
      throw new Error(`${what} failed: ${response.status} ${await response.text()}`);
    return response.json();
  }

  /** { uid, claims, emailVerified } or null. */
  async function lookupUser(email) {
    // `accounts:lookup` without a project requires a Firebase ID token. Use
    // `accounts:query` instead — it lists users (paginated, but 200 at a time
    // is enough for admin scripts) and accepts the Bearer token.
    let nextPageToken;
    do {
      const payload = await ok(
        await request(`${authBase}/v1/projects/${projectId}/accounts:query`, {
          scopes: authScopes,
          // The Auth emulator does not implement `limit` (returns everything).
          body:
            target === 'emulator'
              ? { returnUserInfo: true }
              : { returnUserInfo: true, limit: 200, nextPageToken },
        }),
        'Auth query'
      );
      const user = (payload.userInfo || []).find((u) => u.email === email);
      if (user) {
        let claims = {};
        try {
          claims = user.customAttributes ? JSON.parse(user.customAttributes) : {};
        } catch {
          claims = {};
        }
        return { uid: user.localId, claims, emailVerified: Boolean(user.emailVerified) };
      }
      nextPageToken = payload.nextPageToken;
    } while (nextPageToken);
    return null;
  }

  /** Creates an Auth user (admin endpoint) and returns its uid. */
  async function createUser({ email, password, displayName, emailVerified = false }) {
    const payload = await ok(
      await request(`${authBase}/v1/projects/${projectId}/accounts`, {
        scopes: authScopes,
        body: { email, password, displayName, emailVerified },
      }),
      'Auth create user'
    );
    return payload.localId;
  }

  /** accounts:update; `claims` replaces the custom claims when given. */
  async function updateUser(uid, { password, displayName, emailVerified, claims } = {}) {
    const body = { localId: uid };
    if (password !== undefined) body.password = password;
    if (displayName !== undefined) body.displayName = displayName;
    if (emailVerified !== undefined) body.emailVerified = emailVerified;
    if (claims !== undefined) body.customAttributes = JSON.stringify(claims);
    await ok(
      await request(`${authBase}/v1/projects/${projectId}/accounts:update`, {
        scopes: authScopes,
        body,
      }),
      'Auth update user'
    );
  }

  async function setCustomClaim(uid, claims) {
    await updateUser(uid, { claims });
  }

  async function readAdminDoc(uid) {
    const response = await request(`${firestoreBase}/admin_users/${uid}`, {
      method: 'GET',
      scopes: firestoreScopes,
    });
    if (response.status === 404) return null;
    const { fields = {} } = await ok(response, 'Firestore read');
    return {
      role: fields.role?.stringValue,
      regionIds: fields.regionIds
        ? (fields.regionIds.arrayValue?.values ?? []).map((v) => v.stringValue)
        : undefined,
    };
  }

  async function writeSuperAdminDoc(uid, email) {
    await ok(
      await request(`${firestoreBase}/admin_users/${uid}`, {
        method: 'PATCH',
        scopes: firestoreScopes,
        body: {
          fields: {
            role: { stringValue: SUPER_ADMIN_ROLE },
            email: { stringValue: email },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        },
      }),
      'Firestore write'
    );
  }

  /** Atomic commit of REST `writes` (names are made absolute here). */
  async function commit(writes) {
    const absolute = writes.map((w) => {
      const key = w.update ? 'update' : 'delete';
      if (key === 'delete') return { ...w, delete: `${docRoot}/${w.delete}` };
      return { ...w, update: { ...w.update, name: `${docRoot}/${w.update.name}` } };
    });
    await ok(
      await request(`${firestoreBase}:commit`, {
        scopes: firestoreScopes,
        body: { writes: absolute },
      }),
      'Firestore commit'
    );
  }

  async function writeModeratorDoc(uid, email, regionIds, before, actor) {
    const now = new Date().toISOString();
    const fields = {
      role: { stringValue: REGION_MODERATOR_ROLE },
      regionIds: stringArray(regionIds),
      email: { stringValue: email },
      updatedAt: { timestampValue: now },
      updatedBy: { stringValue: actor },
    };
    const audit = {
      action: { stringValue: before ? 'updateRegionModerator' : 'grantRegionModerator' },
      actorUid: { stringValue: actor },
      targetUid: { stringValue: uid },
      targetEmail: { stringValue: email },
      before: before
        ? {
            mapValue: {
              fields: {
                role: { stringValue: REGION_MODERATOR_ROLE },
                regionIds: stringArray(before),
              },
            },
          }
        : { nullValue: null },
      after: {
        mapValue: {
          fields: {
            role: { stringValue: REGION_MODERATOR_ROLE },
            regionIds: stringArray(regionIds),
          },
        },
      },
      createdAt: { timestampValue: now },
    };
    // One commit: the role doc and its audit entry are written together.
    await commit([
      { update: { name: `admin_users/${uid}`, fields } },
      {
        update: { name: `admin_audit_log/promote-${uid}-${Date.now()}`, fields: audit },
        currentDocument: { exists: false },
      },
    ]);
  }

  return {
    target,
    projectId,
    lookupUser,
    createUser,
    updateUser,
    setCustomClaim,
    readAdminDoc,
    writeSuperAdminDoc,
    writeModeratorDoc,
    commit,
  };
}
