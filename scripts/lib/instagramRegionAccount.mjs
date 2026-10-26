// Pure helpers for scripts/instagram-set-region-account.mjs (unit-tested in
// tests/lib/instagramRegionAccountScript.spec.ts).
export const TOKEN_LIFETIME_DAYS = 60;
export const GRAPH_ME_URL = 'https://graph.instagram.com/v23.0/me';

/** Region ids end up in a Firestore path: lowercase letters, digits and dashes only. */
export function assertRegionId(regionId) {
  if (typeof regionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(regionId)) {
    throw new Error(`Ungültige regionId: ${JSON.stringify(regionId)}`);
  }
  if (regionId === 'vorarlberg') {
    throw new Error(
      'vorarlberg nutzt die globalen Secrets IG_ACCESS_TOKEN / IG_USER_ID und wird hier nicht gespeichert.'
    );
  }
  return regionId;
}

/** Validates the /me response and returns the Instagram user id (and username). */
export function parseMeResponse(body, expectedUserId) {
  const userId = String(body?.user_id ?? body?.id ?? '');
  if (!userId) throw new Error('Antwort von /me enthält keine user_id.');
  if (expectedUserId && String(expectedUserId) !== userId) {
    throw new Error(
      `Der Token gehört zu user_id ${userId}, nicht zu der angegebenen ${expectedUserId}.`
    );
  }
  return { userId, username: typeof body?.username === 'string' ? body.username : '' };
}

/** Fields written to instagram_private/region_{id}; `enabled` only when decided. */
export function buildAccountFields({ userId, accessToken, now, enabled }) {
  const fields = {
    userId,
    accessToken,
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_DAYS * 86_400_000),
    refreshedAt: now,
    tokenRefreshError: null,
  };
  if (typeof enabled === 'boolean') fields.enabled = enabled;
  return fields;
}

export function parseArgs(argv) {
  const out = { regionId: '', userId: '', enable: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user-id') out.userId = argv[++i] ?? '';
    else if (a === '--enable') out.enable = true;
    else if (a === '--disable') out.enable = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) throw new Error(`Unbekannte Option ${a}`);
    else if (!out.regionId) out.regionId = a;
    else throw new Error(`Unerwartetes Argument ${a}`);
  }
  return out;
}
