import { describe, it, expect } from 'vitest';
import {
  CLAIM_CHUNK_SIZE,
  approveClaimRequestHandler,
  blocklistLookupIds,
  chunk,
  claimCuratedEventsHandler,
  claimProofFor,
  claimRefusal,
  emailDomainOf,
  eventClaimPatch,
  findCuratedMatchesHandler,
  isFreeMailDomain,
  isPreviewTokenExpired,
  listMyClaimableEventsHandler,
  parseClaimInput,
  type ClaimAuditEntry,
  type ClaimDeps,
  type ClaimTransaction,
  type ClaimUser,
  type DocRecord,
} from '../../functions/src/eventImportClaim';
import {
  blocklistId,
  claimTitleSimilarity,
  hashPreviewToken,
} from '../../functions/src/eventImport';

type Doc = Record<string, unknown>;

const NOW = new Date('2026-11-18T10:00:00Z');
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345';
const CURATOR = 'curator';

const organizer = (over: Doc = {}): Doc => ({
  name: 'Yogaverein Tirol',
  website: 'https://www.yoga-tirol.at/events',
  contactEmail: 'info@yoga-tirol.at',
  legalForm: 'verein',
  regionId: 'tirol',
  consent: 'asked',
  syncMode: 'curated_once',
  previewTokenHash: hashPreviewToken(TOKEN),
  previewTokenExpiresAt: new Date('2026-12-01T00:00:00Z'),
  ...over,
});

const curatedEvent = (over: Doc = {}, curation: Doc = {}): Doc => ({
  title: 'Kakaozeremonie',
  date: '2026-12-05',
  regionId: 'tirol',
  status: 'pending',
  createdBy: CURATOR,
  organizer: { name: 'Yogaverein Tirol', email: '' },
  curation: {
    organizerRef: 'org1',
    sourceUrl: 'https://yoga-tirol.at/kakao',
    importedAt: NOW,
    claimable: true,
    ...curation,
  },
  ...over,
});

function setPath(target: Doc, path: string, value: unknown) {
  const parts = path.split('.');
  let obj = target;
  for (const p of parts.slice(0, -1)) {
    obj[p] = { ...((obj[p] as Doc) ?? {}) };
    obj = obj[p] as Doc;
  }
  obj[parts[parts.length - 1]] = value;
}

interface WorldInit {
  organizers?: Record<string, Doc>;
  events?: Record<string, Doc>;
  users?: Record<string, Partial<ClaimUser>>;
  blocklist?: string[];
  roles?: Record<string, Doc>;
  requests?: Record<string, Doc>;
  failAfterTransactions?: number;
}

function makeWorld(init: WorldInit = {}) {
  const organizers = new Map(Object.entries(init.organizers ?? { org1: organizer() }));
  const events = new Map(Object.entries(init.events ?? {}));
  const requests = new Map(Object.entries(init.requests ?? {}));
  const users = new Map(
    Object.entries(
      init.users ?? {
        claimer: { email: 'info@yoga-tirol.at', emailVerified: true, displayName: 'Anna' },
      }
    ).map(([uid, u]) => [uid, { uid, ...u } as ClaimUser])
  );
  const blocklist = new Set(init.blocklist ?? []);
  const audit: ClaimAuditEntry[] = [];
  const txWrites: number[] = [];
  let transactions = 0;

  const deps: ClaimDeps = {
    now: () => NOW,
    enforceRateLimit: () => {},
    readRoleDoc: async (uid) => (init.roles ?? {})[uid] ?? null,
    getUser: async (uid) => users.get(uid) ?? null,
    getCuratorUid: async () => CURATOR,
    getOrganizer: async (id) => organizers.get(id) ?? null,
    findOrganizerByTokenHash: async (hash) => {
      for (const [id, data] of organizers) if (data.previewTokenHash === hash) return { id, data };
      return null;
    },
    findOrganizersByEmail: async (email) =>
      [...organizers]
        .filter(([, d]) => d.contactEmail === email)
        .map(([id, data]) => ({ id, data })),
    existingBlocklistIds: async (ids) => ids.filter((id) => blocklist.has(id)),
    listOrganizerEventIds: async (orgId) =>
      [...events]
        .filter(([, e]) => (e.curation as Doc | undefined)?.organizerRef === orgId)
        .map(([id]) => id),
    listClaimableEventsOf: async (orgId) =>
      [...events]
        .filter(([, e]) => {
          const c = e.curation as Doc | undefined;
          return c?.organizerRef === orgId && c?.claimable === true;
        })
        .map(([id, data]) => ({ id, data })),
    listClaimableEventsOn: async (date) =>
      [...events]
        .filter(([, e]) => e.date === date && (e.curation as Doc | undefined)?.claimable === true)
        .map(([id, data]) => ({ id, data })),
    runTransaction: async (fn) => {
      if (init.failAfterTransactions !== undefined && transactions >= init.failAfterTransactions) {
        throw new Error('simulated crash');
      }
      transactions += 1;
      const writes: Array<() => void> = [];
      const tx: ClaimTransaction = {
        getOrganizer: async (id) => structuredClone(organizers.get(id) ?? null),
        getEvents: async (ids) =>
          ids
            .filter((id) => events.has(id))
            .map((id): DocRecord => ({ id, data: structuredClone(events.get(id) as Doc) })),
        updateOrganizer: (id, patch) =>
          writes.push(() => organizers.set(id, { ...organizers.get(id), ...patch })),
        updateEvent: (id, patch) =>
          writes.push(() => {
            const next = structuredClone(events.get(id) as Doc);
            for (const [k, v] of Object.entries(patch)) setPath(next, k, v);
            events.set(id, next);
          }),
        addAuditEntry: (entry) => writes.push(() => audit.push(entry)),
      };
      const result = await fn(tx);
      txWrites.push(writes.length);
      writes.forEach((w) => w());
      return result;
    },
    getClaimRequest: async (id) => requests.get(id) ?? null,
    createClaimRequest: async (id, data) => {
      requests.set(id, data);
    },
    updateClaimRequest: async (id, patch) => {
      requests.set(id, { ...requests.get(id), ...patch });
    },
    addAuditEntry: async (entry) => {
      audit.push(entry);
    },
  };
  return { deps, organizers, events, requests, users, audit, txWrites };
}

const call = (uid: string | null, data: unknown = {}) => ({
  auth: uid ? { uid } : null,
  data,
});

// ── Pure helpers ──────────────────────────────────────────────────────────

describe('claim helpers', () => {
  it('hashPreviewToken is a sha256 hex of the token', () => {
    expect(hashPreviewToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('claimTitleSimilarity ignores case, accents and punctuation', () => {
    expect(claimTitleSimilarity('Kakaozeremonie', 'kakaozeremonie!')).toBe(1);
    expect(claimTitleSimilarity('Kakao-Zeremonie am See', 'Kakaozeremonie am See')).toBe(1);
    expect(claimTitleSimilarity('Kakaozeremonie im Dezember', 'Kakaozeremonie')).toBeGreaterThan(
      0.6
    );
    expect(claimTitleSimilarity('Kakaozeremonie', 'Yin Yoga für Anfänger')).toBeLessThan(0.3);
    expect(claimTitleSimilarity('', 'x')).toBe(0);
  });

  it('emailDomainOf and isFreeMailDomain', () => {
    expect(emailDomainOf(' Info@Yoga-Tirol.AT ')).toBe('yoga-tirol.at');
    expect(emailDomainOf('nope')).toBe('');
    for (const d of ['gmail.com', 'gmx.at', 'gmx.de', 'web.de', 'outlook.com', 'icloud.com']) {
      expect(isFreeMailDomain(d)).toBe(true);
    }
    expect(isFreeMailDomain('mail.gmx.at')).toBe(true);
    expect(isFreeMailDomain('proton.me')).toBe(true);
    expect(isFreeMailDomain('yoga-tirol.at')).toBe(false);
  });

  it('claimProofFor: token, exact e-mail, domain, none', () => {
    const org = organizer();
    expect(claimProofFor({ organizer: org, email: 'x@y.z', tokenMatched: true })).toBe('token');
    expect(claimProofFor({ organizer: org, email: 'INFO@yoga-tirol.at' })).toBe('email');
    expect(claimProofFor({ organizer: org, email: 'anna@yoga-tirol.at' })).toBe('domain');
    expect(claimProofFor({ organizer: org, email: 'anna@events.yoga-tirol.at' })).toBe('domain');
    expect(claimProofFor({ organizer: org, email: 'anna@other.at' })).toBe('none');
    expect(claimProofFor({ organizer: org, email: '' })).toBe('none');
  });

  it('free-mail domains never match by domain, an exact free-mail contact still does', () => {
    const org = organizer({ website: 'https://gmail.com', contactEmail: 'yogaverein@gmail.com' });
    expect(claimProofFor({ organizer: org, email: 'someone@gmail.com' })).toBe('none');
    expect(claimProofFor({ organizer: org, email: 'yogaverein@gmail.com' })).toBe('email');
    const gmx = organizer({ website: 'https://yoga.at', contactEmail: 'info@gmx.at' });
    expect(claimProofFor({ organizer: gmx, email: 'mallory@gmx.at' })).toBe('none');
  });

  it('claimRefusal: curator, declined, blocked, already claimed', () => {
    const base = { uid: 'u', curatorUid: CURATOR, blocked: false };
    expect(claimRefusal({ ...base, organizer: organizer() })).toBeNull();
    expect(claimRefusal({ ...base, uid: CURATOR, organizer: organizer() })).toBe('curator');
    expect(claimRefusal({ ...base, organizer: organizer({ consent: 'declined' }) })).toBe(
      'declined'
    );
    expect(claimRefusal({ ...base, organizer: organizer({ syncMode: 'declined' }) })).toBe(
      'declined'
    );
    expect(claimRefusal({ ...base, blocked: true, organizer: organizer() })).toBe('blocked');
    expect(claimRefusal({ ...base, organizer: organizer({ linkedUid: 'other' }) })).toBe(
      'already-claimed'
    );
    expect(claimRefusal({ ...base, organizer: organizer({ linkedUid: 'u' }) })).toBeNull();
  });

  it('blocklistLookupIds covers address, its domain and the website domain', () => {
    const ids = blocklistLookupIds({
      email: 'info@yoga-tirol.at',
      website: 'https://www.events.yoga-tirol.at',
    });
    expect(ids).toContain(blocklistId('info@yoga-tirol.at'));
    expect(ids).toContain(blocklistId('yoga-tirol.at'));
    expect(ids).toContain(blocklistId('events.yoga-tirol.at'));
    expect(ids).not.toContain(blocklistId('at'));
  });

  it('isPreviewTokenExpired', () => {
    expect(isPreviewTokenExpired(organizer(), NOW.getTime())).toBe(false);
    expect(
      isPreviewTokenExpired(
        organizer({ previewTokenExpiresAt: new Date('2026-11-01') }),
        NOW.getTime()
      )
    ).toBe(true);
    expect(isPreviewTokenExpired(organizer({ previewTokenExpiresAt: null }), NOW.getTime())).toBe(
      false
    );
  });

  it('eventClaimPatch moves only curator-owned curated events and is idempotent', () => {
    const args = {
      uid: 'u',
      email: 'a@b.at',
      organizerName: 'Verein',
      curatorUid: CURATOR,
      now: NOW,
    };
    expect(eventClaimPatch(curatedEvent(), args)).toEqual({
      createdBy: 'u',
      'organizer.name': 'Yogaverein Tirol',
      'organizer.email': 'a@b.at',
      'curation.claimable': false,
      'curation.claimedAt': NOW,
      'curation.claimedBy': 'u',
    });
    expect(
      eventClaimPatch(curatedEvent({ organizer: { name: '', email: '' } }), args)?.[
        'organizer.name'
      ]
    ).toBe('Verein');
    expect(
      eventClaimPatch(curatedEvent({ createdBy: 'u' }, { claimable: false, claimedBy: 'u' }), args)
    ).toBeNull();
    expect(eventClaimPatch(curatedEvent({ createdBy: 'someone-else' }), args)).toBeNull();
    expect(eventClaimPatch({ title: 'not curated', createdBy: CURATOR }, args)).toBeNull();
  });

  it('chunk and input parsing', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parseClaimInput({})).toEqual({ organizerId: null, token: null });
    expect(() => parseClaimInput({ token: 'short' })).toThrow();
    expect(() => parseClaimInput({ organizerId: '../x' })).toThrow();
  });
});

// ── claimCuratedEventsHandler ─────────────────────────────────────────────

describe('claimCuratedEventsHandler', () => {
  const twoEvents = {
    e1: curatedEvent(),
    e2: curatedEvent({ title: 'Yin Yoga', date: '2026-12-06' }),
    other: curatedEvent({}, { organizerRef: 'org2' }),
    own: { title: 'Fremd', createdBy: 'someone' },
  };

  it('needs a signed-in account with a confirmed address', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: { claimer: { email: 'info@yoga-tirol.at', emailVerified: false } },
    });
    await expect(claimCuratedEventsHandler(call(null), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(claimCuratedEventsHandler(call('claimer'), w.deps)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'email-not-verified' },
    });
    expect(w.events.get('e1')?.createdBy).toBe(CURATOR);
  });

  it('token path: claims all events of the organizer in one transaction, with audit entry', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: { claimer: { email: 'anna@gmail.com', emailVerified: true } },
    });
    const result = await claimCuratedEventsHandler(call('claimer', { token: TOKEN }), w.deps);
    expect(result).toMatchObject({
      status: 'claimed',
      eventCount: 2,
      organizers: [{ organizerId: 'org1', name: 'Yogaverein Tirol', eventCount: 2 }],
    });
    for (const id of ['e1', 'e2']) {
      const ev = w.events.get(id) as Doc;
      expect(ev.createdBy).toBe('claimer');
      expect(ev.organizer).toEqual({ name: 'Yogaverein Tirol', email: 'anna@gmail.com' });
      expect(ev.curation).toMatchObject({ claimable: false, claimedBy: 'claimer', claimedAt: NOW });
      // Claiming is not consent: status and consentAt stay.
      expect(ev.status).toBe('pending');
      expect((ev.curation as Doc).consentAt).toBeUndefined();
    }
    expect(w.events.get('other')?.createdBy).toBe(CURATOR);
    expect(w.events.get('own')?.createdBy).toBe('someone');
    expect(w.organizers.get('org1')).toMatchObject({
      consent: 'claimed',
      syncMode: 'self_managed',
      linkedUid: 'claimer',
      claimedAt: NOW,
    });
    expect(w.txWrites).toEqual([4]); // organizer + 2 events + audit, one transaction
    expect(w.audit).toEqual([
      expect.objectContaining({
        action: 'claimCuratedEvents',
        actorUid: 'claimer',
        targetUid: 'claimer',
        organizerId: 'org1',
        proof: 'token',
        via: 'self',
        eventCount: 2,
      }),
    ]);
  });

  it('token path keeps an already recorded consent untouched', async () => {
    const w = makeWorld({
      organizers: { org1: organizer({ consent: 'manual_ok', consentRecord: { at: 1 } }) },
      events: { e1: curatedEvent({ status: 'approved' }, { consentAt: NOW }) },
    });
    await claimCuratedEventsHandler(call('claimer', { token: TOKEN }), w.deps);
    const ev = w.events.get('e1') as Doc;
    expect(ev.status).toBe('approved');
    expect((ev.curation as Doc).consentAt).toEqual(NOW);
    expect(w.organizers.get('org1')?.consentRecord).toEqual({ at: 1 });
  });

  it('refuses an unknown or expired token', async () => {
    const w = makeWorld({
      organizers: { org1: organizer({ previewTokenExpiresAt: new Date('2026-11-01') }) },
      events: twoEvents,
    });
    await expect(
      claimCuratedEventsHandler(call('claimer', { token: 'x'.repeat(30) }), w.deps)
    ).rejects.toMatchObject({ code: 'not-found', details: { reason: 'invalid-token' } });
    await expect(
      claimCuratedEventsHandler(call('claimer', { token: TOKEN }), w.deps)
    ).rejects.toMatchObject({ details: { reason: 'token-expired' } });
    expect(w.audit).toEqual([]);
  });

  it('exact verified e-mail (any case) claims without organizerId', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: { claimer: { email: 'INFO@yoga-tirol.at', emailVerified: true } },
    });
    const result = await claimCuratedEventsHandler(call('claimer'), w.deps);
    expect(result).toMatchObject({ status: 'claimed', eventCount: 2 });
    expect(w.audit[0]).toMatchObject({ proof: 'email' });
  });

  it('exact e-mail with organizerId claims; a domain match only creates a request', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: {
        claimer: { email: 'info@yoga-tirol.at', emailVerified: true },
        colleague: { email: 'anna@yoga-tirol.at', emailVerified: true },
      },
    });
    const domain = await claimCuratedEventsHandler(
      call('colleague', { organizerId: 'org1' }),
      w.deps
    );
    expect(domain).toEqual({
      status: 'requested',
      requestId: 'org1_colleague',
      proof: 'domain',
      alreadyRequested: false,
    });
    expect(w.requests.get('org1_colleague')).toMatchObject({
      uid: 'colleague',
      organizerId: 'org1',
      status: 'pending',
      proof: 'domain',
      createdAt: NOW,
    });
    expect(w.events.get('e1')?.createdBy).toBe(CURATOR);
    // A second call does not create a second request.
    expect(
      await claimCuratedEventsHandler(call('colleague', { organizerId: 'org1' }), w.deps)
    ).toMatchObject({ status: 'requested', alreadyRequested: true });

    const exact = await claimCuratedEventsHandler(call('claimer', { organizerId: 'org1' }), w.deps);
    expect(exact).toMatchObject({ status: 'claimed', eventCount: 2 });
  });

  it('a free-mail address without proof creates a request, never a claim', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: { mallory: { email: 'mallory@gmx.at', emailVerified: true } },
    });
    expect(
      await claimCuratedEventsHandler(call('mallory', { organizerId: 'org1' }), w.deps)
    ).toMatchObject({ status: 'requested', proof: 'none' });
    // Without organizerId there is nothing to find for this address.
    await expect(claimCuratedEventsHandler(call('mallory'), w.deps)).rejects.toMatchObject({
      code: 'not-found',
      details: { reason: 'no-organizer' },
    });
    expect(w.events.get('e1')?.createdBy).toBe(CURATOR);
  });

  it('refuses declined and blocklisted organizers', async () => {
    const declined = makeWorld({
      organizers: { org1: organizer({ consent: 'declined' }) },
      events: twoEvents,
    });
    await expect(
      claimCuratedEventsHandler(call('claimer', { token: TOKEN }), declined.deps)
    ).rejects.toMatchObject({ details: { reason: 'declined' } });

    const blocked = makeWorld({ events: twoEvents, blocklist: [blocklistId('yoga-tirol.at')] });
    await expect(claimCuratedEventsHandler(call('claimer'), blocked.deps)).rejects.toMatchObject({
      details: { reason: 'blocked' },
    });
    expect(blocked.events.get('e1')?.createdBy).toBe(CURATOR);
  });

  it('refuses an organizer claimed by another account, with a clear reason', async () => {
    const w = makeWorld({
      organizers: { org1: organizer({ linkedUid: 'first', consent: 'claimed' }) },
      events: twoEvents,
    });
    await expect(
      claimCuratedEventsHandler(call('claimer', { token: TOKEN }), w.deps)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'already-claimed' },
    });
  });

  it('refuses the curator account itself', async () => {
    const w = makeWorld({
      events: twoEvents,
      users: { [CURATOR]: { email: 'info@yoga-tirol.at', emailVerified: true } },
    });
    await expect(claimCuratedEventsHandler(call(CURATOR), w.deps)).rejects.toMatchObject({
      code: 'permission-denied',
      details: { reason: 'curator' },
    });
  });

  it('a repeated claim is idempotent: no second audit entry, nothing rewritten', async () => {
    const w = makeWorld({ events: twoEvents });
    await claimCuratedEventsHandler(call('claimer'), w.deps);
    const again = await claimCuratedEventsHandler(call('claimer', { token: TOKEN }), w.deps);
    expect(again).toMatchObject({ status: 'claimed', eventCount: 0 });
    expect(w.audit).toHaveLength(1);
    expect(w.txWrites).toEqual([4, 0]);
  });

  it('chunks large organizers and resumes after an interrupted claim', async () => {
    const total = CLAIM_CHUNK_SIZE * 2 + 5;
    const events: Record<string, Doc> = {};
    for (let i = 0; i < total; i += 1) events[`e${i}`] = curatedEvent({ title: `E ${i}` });
    const w = makeWorld({ events, failAfterTransactions: 2 });
    await expect(claimCuratedEventsHandler(call('claimer'), w.deps)).rejects.toThrow(
      'simulated crash'
    );
    // First chunk with organizer + audit, second chunk; the third never ran.
    expect(w.txWrites).toEqual([CLAIM_CHUNK_SIZE + 2, CLAIM_CHUNK_SIZE]);
    const owned = () => [...w.events.values()].filter((e) => e.createdBy === 'claimer').length;
    expect(owned()).toBe(CLAIM_CHUNK_SIZE * 2);

    // Same deps, without the crash: the repeat finishes the rest only.
    const resumed = makeWorld({
      events: Object.fromEntries(w.events),
      organizers: Object.fromEntries(w.organizers),
    });
    const result = await claimCuratedEventsHandler(call('claimer'), resumed.deps);
    expect(result).toMatchObject({ status: 'claimed', eventCount: 5 });
    expect(resumed.txWrites).toEqual([0, 0, 5]);
    expect([...resumed.events.values()].every((e) => e.createdBy === 'claimer')).toBe(true);
    expect(resumed.audit).toEqual([]);
    for (const n of w.txWrites) expect(n).toBeLessThanOrEqual(500);
  });
});

// ── approveClaimRequestHandler ────────────────────────────────────────────

describe('approveClaimRequestHandler', () => {
  const pending = {
    org1_colleague: {
      uid: 'colleague',
      organizerId: 'org1',
      userEmail: 'anna@yoga-tirol.at',
      proof: 'domain',
      status: 'pending',
      createdAt: NOW,
    },
  };
  const world = (over: WorldInit = {}) =>
    makeWorld({
      events: { e1: curatedEvent() },
      users: { colleague: { email: 'anna@yoga-tirol.at', emailVerified: true } },
      roles: { admin: { role: 'Admin' }, mod: { role: 'RegionModerator', regionIds: ['tirol'] } },
      requests: structuredClone(pending),
      ...over,
    });

  it('is Super-Admin only', async () => {
    const w = world();
    const data = { requestId: 'org1_colleague', approve: true };
    await expect(approveClaimRequestHandler(call(null, data), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    for (const uid of ['mod', 'colleague']) {
      await expect(approveClaimRequestHandler(call(uid, data), w.deps)).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
    expect(w.events.get('e1')?.createdBy).toBe(CURATOR);
  });

  it('approving claims the events for the requester and logs the admin as actor', async () => {
    const w = world();
    const result = await approveClaimRequestHandler(
      call('admin', { requestId: 'org1_colleague', approve: true }),
      w.deps
    );
    expect(result).toEqual({ requestId: 'org1_colleague', status: 'approved', eventCount: 1 });
    expect(w.events.get('e1')).toMatchObject({
      createdBy: 'colleague',
      organizer: { email: 'anna@yoga-tirol.at' },
    });
    expect(w.organizers.get('org1')).toMatchObject({ linkedUid: 'colleague', consent: 'claimed' });
    expect(w.requests.get('org1_colleague')).toMatchObject({
      status: 'approved',
      decidedBy: 'admin',
    });
    expect(w.audit).toEqual([
      expect.objectContaining({
        actorUid: 'admin',
        targetUid: 'colleague',
        via: 'request',
        requestId: 'org1_colleague',
        proof: 'domain',
      }),
    ]);
  });

  it('rejecting changes nothing on the events and blocks a new request', async () => {
    const w = world();
    expect(
      await approveClaimRequestHandler(
        call('admin', { requestId: 'org1_colleague', approve: false }),
        w.deps
      )
    ).toMatchObject({ status: 'rejected' });
    expect(w.events.get('e1')?.createdBy).toBe(CURATOR);
    expect(w.audit[0]).toMatchObject({ action: 'rejectClaimRequest' });
    expect(
      await claimCuratedEventsHandler(call('colleague', { organizerId: 'org1' }), w.deps)
    ).toEqual({ status: 'request-rejected', requestId: 'org1_colleague' });
    await expect(
      approveClaimRequestHandler(
        call('admin', { requestId: 'org1_colleague', approve: true }),
        w.deps
      )
    ).rejects.toMatchObject({ details: { reason: 'request-decided' } });
  });

  it('still refuses when the organizer was claimed by someone else meanwhile', async () => {
    const w = world({ organizers: { org1: organizer({ linkedUid: 'first' }) } });
    await expect(
      approveClaimRequestHandler(
        call('admin', { requestId: 'org1_colleague', approve: true }),
        w.deps
      )
    ).rejects.toMatchObject({ details: { reason: 'already-claimed' } });
    expect(w.requests.get('org1_colleague')?.status).toBe('pending');
  });
});

// ── listMyClaimableEventsHandler / findCuratedMatchesHandler ──────────────

describe('listMyClaimableEventsHandler', () => {
  it('lists titles and dates of the events waiting for the exact address only', async () => {
    const w = makeWorld({
      events: {
        e2: curatedEvent({ title: 'Yin Yoga', date: '2026-12-06' }),
        e1: curatedEvent(),
        trashed: curatedEvent({ status: 'trashed' }),
        other: curatedEvent({}, { organizerRef: 'org2' }),
      },
    });
    expect(await listMyClaimableEventsHandler(call('claimer'), w.deps)).toEqual({
      events: [
        { title: 'Kakaozeremonie', date: '2026-12-05' },
        { title: 'Yin Yoga', date: '2026-12-06' },
      ],
      total: 2,
    });
  });

  it('is empty for unverified, domain-only, declined or foreign-claimed organizers', async () => {
    const events = { e1: curatedEvent() };
    const unverified = makeWorld({
      events,
      users: { claimer: { email: 'info@yoga-tirol.at', emailVerified: false } },
    });
    expect((await listMyClaimableEventsHandler(call('claimer'), unverified.deps)).total).toBe(0);
    const domain = makeWorld({
      events,
      users: { claimer: { email: 'anna@yoga-tirol.at', emailVerified: true } },
    });
    expect((await listMyClaimableEventsHandler(call('claimer'), domain.deps)).total).toBe(0);
    const declined = makeWorld({
      events,
      organizers: { org1: organizer({ consent: 'declined' }) },
    });
    expect((await listMyClaimableEventsHandler(call('claimer'), declined.deps)).total).toBe(0);
    const taken = makeWorld({ events, organizers: { org1: organizer({ linkedUid: 'x' }) } });
    expect((await listMyClaimableEventsHandler(call('claimer'), taken.deps)).total).toBe(0);
  });
});

describe('findCuratedMatchesHandler', () => {
  const events = {
    e1: curatedEvent(),
    zurich: curatedEvent({ regionId: 'zuerich' }, { organizerRef: 'org2' }),
    claimed: curatedEvent({ createdBy: 'someone' }, { claimable: false }),
    otherDay: curatedEvent({ date: '2026-12-24' }),
  };
  const users = { member: { email: 'member@gmail.com', emailVerified: true } };

  it('returns same-date, similar-title events of the region, without contact data', async () => {
    const w = makeWorld({ events, users });
    const { matches } = await findCuratedMatchesHandler(
      call('member', { title: 'Kakao Zeremonie', date: '2026-12-05', regionId: 'tirol' }),
      w.deps
    );
    expect(matches).toEqual([{ organizerId: 'org1', title: 'Kakaozeremonie', date: '2026-12-05' }]);
    expect(JSON.stringify(matches)).not.toContain('@');
  });

  it('finds the own organizer in another region, nothing for dissimilar titles', async () => {
    const w = makeWorld({
      events,
      organizers: { org1: organizer(), org2: organizer({ contactEmail: 'member@gmail.com' }) },
      users,
    });
    const own = await findCuratedMatchesHandler(
      call('member', { title: 'Kakaozeremonie', date: '2026-12-05', regionId: 'berlin' }),
      w.deps
    );
    expect(own.matches.map((m) => m.organizerId)).toEqual(['org2']);
    const none = await findCuratedMatchesHandler(
      call('member', { title: 'Tanzabend', date: '2026-12-05', regionId: 'tirol' }),
      w.deps
    );
    expect(none.matches).toEqual([]);
  });

  it('returns at most three and nothing for unverified accounts; validates input', async () => {
    const many: Record<string, Doc> = {};
    for (let i = 0; i < 6; i += 1) many[`e${i}`] = curatedEvent({ title: `Kakaozeremonie ${i}` });
    const w = makeWorld({ events: many, users });
    const data = { title: 'Kakaozeremonie', date: '2026-12-05', regionId: 'tirol' };
    expect((await findCuratedMatchesHandler(call('member', data), w.deps)).matches).toHaveLength(3);
    const unverified = makeWorld({
      events: many,
      users: { member: { email: 'member@gmail.com', emailVerified: false } },
    });
    expect(
      (await findCuratedMatchesHandler(call('member', data), unverified.deps)).matches
    ).toEqual([]);
    await expect(
      findCuratedMatchesHandler(call('member', { title: 'x', date: '2026-12-05' }), w.deps)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(findCuratedMatchesHandler(call(null, data), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
