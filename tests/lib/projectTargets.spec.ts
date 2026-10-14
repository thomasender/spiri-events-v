import { describe, it, expect } from 'vitest';
import {
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
  assertInitializedProject,
  assertStagingCredentials,
  assertUnambiguousEnv,
  realTargetFor,
  resolvePromoteTarget,
  resolveSeedRegionsTarget,
} from '../../src/utils/projectTargets.js';
import {
  STAGING_SEED_USERS,
  buildUserProfileDocs,
  passwordFromBytes,
  resolveSeedUsersOptions,
} from '../../src/utils/stagingSeedUsers.js';

describe('realTargetFor', () => {
  it('knows exactly production and staging', () => {
    expect(realTargetFor(PROD_PROJECT_ID)).toBe('production');
    expect(realTargetFor(STAGING_PROJECT_ID)).toBe('staging');
    for (const id of ['', 'demo-x', 'tribe-vbg-staging ', 'spirieventsvbg-dev', undefined]) {
      expect(() => realTargetFor(id as string)).toThrow(/Unbekanntes Projekt/);
    }
  });
});

describe('assertUnambiguousEnv', () => {
  it('refuses emulator hosts and a different default project', () => {
    expect(() =>
      assertUnambiguousEnv(STAGING_PROJECT_ID, { FIREBASE_AUTH_EMULATOR_HOST: 'x:1' })
    ).toThrow(/unklares Ziel/);
    expect(() =>
      assertUnambiguousEnv(STAGING_PROJECT_ID, { GOOGLE_CLOUD_PROJECT: PROD_PROJECT_ID })
    ).toThrow(/unklares Ziel/);
    expect(() =>
      assertUnambiguousEnv(STAGING_PROJECT_ID, { GCLOUD_PROJECT: STAGING_PROJECT_ID })
    ).not.toThrow();
    expect(() => assertUnambiguousEnv(PROD_PROJECT_ID, {})).not.toThrow();
  });
});

describe('assertStagingCredentials', () => {
  it('accepts plain ADC (no GOOGLE_APPLICATION_CREDENTIALS)', () => {
    expect(() => assertStagingCredentials({})).not.toThrow();
  });

  it('never uses the production key', () => {
    expect(() =>
      assertStagingCredentials({ credentialsPath: '/repo/scripts/service-account.json' })
    ).toThrow(/Produktions-Schluessel/);
    expect(() =>
      assertStagingCredentials({
        credentialsPath: '/keys/other.json',
        credentialsJson: { type: 'service_account', project_id: PROD_PROJECT_ID },
      })
    ).toThrow(/Service-Account/);
  });

  it('allows a staging service account or user credentials file', () => {
    expect(() =>
      assertStagingCredentials({
        credentialsPath: '/keys/staging.json',
        credentialsJson: { type: 'service_account', project_id: STAGING_PROJECT_ID },
      })
    ).not.toThrow();
    expect(() =>
      assertStagingCredentials({
        credentialsPath: '/home/u/.config/gcloud/application_default_credentials.json',
        credentialsJson: { type: 'authorized_user' },
      })
    ).not.toThrow();
  });
});

describe('assertInitializedProject', () => {
  it('throws on a mismatch', () => {
    expect(() => assertInitializedProject(STAGING_PROJECT_ID, STAGING_PROJECT_ID)).not.toThrow();
    expect(() => assertInitializedProject(PROD_PROJECT_ID, STAGING_PROJECT_ID)).toThrow();
    expect(() => assertInitializedProject(undefined, STAGING_PROJECT_ID)).toThrow();
  });
});

describe('resolvePromoteTarget (promote-admin.mjs)', () => {
  it('keeps the emulator and the default production path', () => {
    expect(resolvePromoteTarget({ emulator: true })).toEqual({
      target: 'emulator',
      projectId: PROD_PROJECT_ID,
    });
    expect(resolvePromoteTarget({})).toEqual({ target: 'production', projectId: PROD_PROJECT_ID });
  });

  it('accepts only the two real project ids', () => {
    expect(resolvePromoteTarget({ project: STAGING_PROJECT_ID })).toEqual({
      target: 'staging',
      projectId: STAGING_PROJECT_ID,
    });
    expect(resolvePromoteTarget({ project: PROD_PROJECT_ID }).target).toBe('production');
    expect(() => resolvePromoteTarget({ project: 'other' })).toThrow(/Unbekanntes Projekt/);
    expect(() => resolvePromoteTarget({ emulator: true, project: STAGING_PROJECT_ID })).toThrow();
    expect(() =>
      resolvePromoteTarget(
        { project: STAGING_PROJECT_ID },
        { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' }
      )
    ).toThrow(/unklares Ziel/);
  });
});

describe('resolveSeedRegionsTarget (seed-regions.mjs)', () => {
  it('emulator by default, --prod still production', () => {
    expect(resolveSeedRegionsTarget([])).toEqual({
      target: 'emulator',
      projectId: PROD_PROJECT_ID,
    });
    expect(resolveSeedRegionsTarget(['--prod'])).toEqual({
      target: 'production',
      projectId: PROD_PROJECT_ID,
    });
    expect(resolveSeedRegionsTarget(['--project', PROD_PROJECT_ID]).target).toBe('production');
  });

  it('accepts staging and refuses anything else', () => {
    expect(resolveSeedRegionsTarget(['--project', STAGING_PROJECT_ID])).toEqual({
      target: 'staging',
      projectId: STAGING_PROJECT_ID,
    });
    expect(() => resolveSeedRegionsTarget(['--project', 'x'])).toThrow(/Unbekanntes Projekt/);
    expect(() => resolveSeedRegionsTarget(['--project'])).toThrow();
    expect(() => resolveSeedRegionsTarget(['--prod', '--project', STAGING_PROJECT_ID])).toThrow();
    expect(() => resolveSeedRegionsTarget(['--staging'])).toThrow(/Unbekannte Option/);
    expect(() =>
      resolveSeedRegionsTarget(['--prod'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' })
    ).toThrow(/unklares Ziel/);
  });
});

describe('seed-staging-users options', () => {
  it('targets staging only', () => {
    expect(resolveSeedUsersOptions([], { env: {} })).toMatchObject({
      target: 'staging',
      projectId: STAGING_PROJECT_ID,
      password: null,
    });
    expect(resolveSeedUsersOptions(['--project', STAGING_PROJECT_ID], { env: {} }).target).toBe(
      'staging'
    );
    expect(() => resolveSeedUsersOptions(['--project', PROD_PROJECT_ID], { env: {} })).toThrow(
      /verweigert/
    );
    expect(() => resolveSeedUsersOptions(['--project', 'demo-x'], { env: {} })).toThrow(
      /verweigert/
    );
    expect(() =>
      resolveSeedUsersOptions([], { env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' } })
    ).toThrow(/unklares Ziel/);
    expect(() => resolveSeedUsersOptions(['--prod'], { env: {} })).toThrow(/Unbekannte Option/);
  });

  it('--emulator uses the staging namespace and env hosts', () => {
    expect(
      resolveSeedUsersOptions(['--emulator'], {
        env: { FIRESTORE_EMULATOR_HOST: 'h:1', FIREBASE_AUTH_EMULATOR_HOST: 'h:2' },
      })
    ).toMatchObject({
      target: 'emulator',
      projectId: STAGING_PROJECT_ID,
      emulatorHosts: { firestore: 'h:1', auth: 'h:2' },
    });
  });

  it('--password needs at least 12 characters', () => {
    expect(() => resolveSeedUsersOptions(['--password', 'short'], { env: {} })).toThrow();
    expect(resolveSeedUsersOptions(['--password', 'a-long-password'], { env: {} }).password).toBe(
      'a-long-password'
    );
  });
});

describe('seed-staging-users accounts', () => {
  it('has the three accounts with the expected roles', () => {
    expect(STAGING_SEED_USERS.map((u) => [u.email, u.role])).toEqual([
      ['admin@staging.test', 'Admin'],
      ['moderator@staging.test', 'RegionModerator'],
      ['user@staging.test', null],
    ]);
    expect(STAGING_SEED_USERS[1].regionIds).toEqual(['steiermark', 'allgaeu']);
  });

  it('builds the sign-up shaped profile docs, createdAt only for new accounts', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const user = STAGING_SEED_USERS[2];
    const fresh = buildUserProfileDocs(user, { now, isNew: true });
    expect(fresh.privateDoc).toMatchObject({
      displayName: 'Staging Testuser',
      contact: 'user@staging.test',
      slug: 'staging-testuser',
      createdAt: now,
      updatedAt: now,
    });
    // E-mail (contact) and notifyNewsletter stay private.
    expect(fresh.publicDoc).toEqual({
      displayName: 'Staging Testuser',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'staging-testuser',
      updatedAt: now,
    });
    expect(buildUserProfileDocs(user, { now, isNew: false }).privateDoc).not.toHaveProperty(
      'createdAt'
    );
  });

  it('generates long random passwords', () => {
    const bytes = Uint8Array.from({ length: 18 }, (_, i) => i * 14);
    const pw = passwordFromBytes(bytes);
    expect(pw).toHaveLength(18);
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(() => passwordFromBytes(new Uint8Array(8))).toThrow();
  });
});
