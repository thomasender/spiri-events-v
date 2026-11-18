import { describe, it, expect } from 'vitest';
import {
  CONSENT_WORDING_VERSION,
  DELETE_FIELD,
  OUTREACH_DOC_ID,
  PREVIEW_TOKEN_TTL_MS,
  IMPORT_RETENTION_MS,
  buildImportPreview,
  createPreviewLinkHandler,
  decideConsent,
  getImportPreviewHandler,
  hashPreviewToken,
  generatePreviewToken,
  isImportDataExpired,
  outreachRefusal,
  parseConsentInput,
  planConsent,
  planOrganizerPurge,
  resolveOutreachRecipient,
  sendOutreachMailHandler,
  submitImportConsentHandler,
  type CandidateDoc,
  type ConsentPlan,
  type CuratedEvent,
  type ImportAuditEntry,
  type ImportDeps,
  type OrganizerRecord,
  type OutreachLog,
  type Patch,
} from '../../functions/src/importConsent';
import { copyConsentedImages, importImagePaths } from '../../functions/src/importImages';
import { blocklistId } from '../../functions/src/eventImport';
import type { OutreachMail } from '../../functions/src/importOutreachMail';
import { CONSENT_WORDING_VERSION as CLIENT_WORDING_VERSION } from '../../src/utils/importConsent';

type Doc = Record<string, unknown>;

const NOW = Date.UTC(2026, 10, 18, 10, 0, 0);
const TOKEN = 'T'.repeat(43);
const OTHER_TOKEN = 'U'.repeat(43);

const baseOrganizer = (over: Partial<OrganizerRecord> = {}): OrganizerRecord => ({
  id: 'org1',
  name: 'Yogaverein Tirol',
  website: 'https://www.yoga-tirol.at',
  contactEmail: 'info@yoga-tirol.at',
  legalForm: 'verein',
  regionId: 'tirol',
  consent: 'asked',
  syncMode: 'curated_once',
  previewTokenHash: hashPreviewToken(TOKEN),
  previewTokenExpiresAtMs: NOW + PREVIEW_TOKEN_TTL_MS,
  deleteAfterMs: NOW + IMPORT_RETENTION_MS,
  consentRecord: null,
  ...over,
});

const curation = {
  organizerRef: 'org1',
  sourceUrl: 'https://www.yoga-tirol.at/kakao',
  importedAt: 1,
  claimable: true,
};
const baseEvents = (): CuratedEvent[] => [
  {
    id: 'ev1',
    data: {
      title: 'Kakaozeremonie',
      date: '2026-12-05',
      time: '18:00',
      place: 'Studio',
      city: 'Innsbruck',
      contribution: 'fee',
      fee: 20,
      link: 'https://www.yoga-tirol.at/kakao',
      category: 'Zeremonie',
      description: '<p>Ein Abend mit &amp; Kakao</p>',
      status: 'pending',
      slug: 'kakaozeremonie',
      createdBy: 'curator',
      organizer: { name: 'Yogaverein Tirol', email: '' },
      curation,
    },
  },
  {
    id: 'ev2',
    data: { title: 'Alt', date: '2026-11-01', status: 'trashed', curation },
  },
];
const baseCandidates = (): CandidateDoc[] => [
  {
    id: 'c1',
    data: {
      organizerRef: 'org1',
      eventId: 'ev1',
      sourceUrl: 'https://www.yoga-tirol.at/kakao',
      imageUrl: 'https://www.yoga-tirol.at/img/kakao.jpg',
      rawExtract: { title: 'Kakaozeremonie' },
      status: 'published',
    },
  },
];

// In-memory Firestore stand-in for the handlers.
function makeWorld({
  organizer = baseOrganizer(),
  events = baseEvents(),
  candidates = baseCandidates(),
  roles = { admin: { role: 'Admin' } } as Record<string, Doc>,
  blocklist = [] as string[],
  outreach = null as OutreachLog | null,
  projectId = 'tribe-vbg-staging',
  mailFails = false,
  curatorUid = 'curator' as string | null,
  takenSlugs = [] as string[],
} = {}) {
  const organizers = new Map<string, OrganizerRecord & Doc>([[organizer.id, { ...organizer }]]);
  const eventDocs = new Map(events.map((e) => [e.id, { ...e.data }] as [string, Doc]));
  const candidateDocs = new Map(candidates.map((c) => [c.id, { ...c.data }] as [string, Doc]));
  const blocked = new Set(blocklist);
  const views: Array<{ organizerId: string; view: Doc }> = [];
  const audit: ImportAuditEntry[] = [];
  const mails: OutreachMail[] = [];
  const plans: ConsentPlan[] = [];
  const imageCopies: unknown[] = [];
  let outreachLog: OutreachLog | null = outreach;
  let tokens = 0;

  const applyPatch = (target: Doc, patch: Patch) => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let obj = target;
      for (const part of parts.slice(0, -1)) {
        obj[part] = { ...((obj[part] as Doc) ?? {}) };
        obj = obj[part] as Doc;
      }
      const last = parts[parts.length - 1];
      if (value === DELETE_FIELD) delete obj[last];
      else obj[last] = value;
    }
  };
  const recordOf = (o: Doc): OrganizerRecord => ({
    ...(o as unknown as OrganizerRecord),
    previewTokenExpiresAtMs:
      o.previewTokenExpiresAt instanceof Date
        ? (o.previewTokenExpiresAt as Date).getTime()
        : (o.previewTokenExpiresAtMs as number | null),
    consentRecord: (o.consentRecord as OrganizerRecord['consentRecord']) ?? null,
  });

  const deps: ImportDeps = {
    now: () => NOW,
    generateToken: () => (++tokens === 1 ? OTHER_TOKEN : 'V'.repeat(43)),
    siteOrigin: 'https://tribe-vbg-staging.web.app',
    projectId,
    readRoleDoc: async (uid) => roles[uid] ?? null,
    enforceRateLimit: () => {},
    getOrganizer: async (id) => (organizers.has(id) ? recordOf(organizers.get(id)!) : null),
    findOrganizerByTokenHash: async (hash) => {
      const found = [...organizers.values()].find((o) => o.previewTokenHash === hash);
      return found ? recordOf(found) : null;
    },
    updateOrganizer: async (id, patch) => applyPatch(organizers.get(id)!, patch),
    listCuratedEvents: async (id) =>
      [...eventDocs.entries()]
        .filter(([, d]) => (d.curation as Doc | undefined)?.organizerRef === id)
        .map(([eid, d]) => ({ id: eid, data: { ...d } })),
    listCandidates: async (id) =>
      [...candidateDocs.entries()]
        .filter(([, d]) => d.organizerRef === id)
        .map(([cid, d]) => ({ id: cid, data: { ...d } })),
    logPreviewView: async (organizerId, view) => {
      views.push({ organizerId, view: view as unknown as Doc });
    },
    addAuditEntry: async (entry) => {
      audit.push(entry);
    },
    getCuratorUid: async () => curatorUid,
    resolveApprovalSlug: async (_id, slug) => (takenSlugs.includes(slug) ? `${slug}-2` : slug),
    applyConsentPlan: async (plan) => {
      plans.push(plan);
      applyPatch(organizers.get(plan.organizerId)!, plan.organizerPatch);
      for (const { id, patch } of plan.eventUpdates) applyPatch(eventDocs.get(id)!, patch);
      for (const { id, patch } of plan.candidateUpdates) applyPatch(candidateDocs.get(id)!, patch);
      for (const id of plan.eventDeletes) eventDocs.delete(id);
      for (const entry of plan.blocklist) blocked.add(entry.id);
    },
    copyConsentedImages: async (items) => {
      imageCopies.push(...items);
      return { copied: items.length, failed: 0 };
    },
    existingBlocklistIds: async (ids) => ids.filter((id) => blocked.has(id)),
    getOutreach: async () => outreachLog,
    claimOutreach: async (_id, log) => {
      if (outreachLog && outreachLog.status !== 'failed') return false;
      outreachLog = { ...log };
      return true;
    },
    updateOutreach: async (_id, patch) => {
      outreachLog = { ...(outreachLog as OutreachLog), ...patch };
    },
    sendMail: async (mail) => {
      if (mailFails) throw new Error('mailgun down');
      mails.push(mail);
      return { id: '<msg-1@mg.thetribe.at>' };
    },
    regionNameOf: (id) => (id === 'tirol' ? 'Tirol' : null),
  };
  return {
    deps,
    organizers,
    eventDocs,
    candidateDocs,
    blocked,
    views,
    audit,
    mails,
    plans,
    imageCopies,
    outreach: () => outreachLog,
  };
}

const approve = (over: Doc = {}) => ({
  token: TOKEN,
  action: 'approve_once',
  scopes: { event: true, images: false, persons: false },
  wordingVersion: CONSENT_WORDING_VERSION,
  ...over,
});

async function expectCode(promise: Promise<unknown>, code: string, reason?: string) {
  const err = (await promise.then(
    () => null,
    (e) => e
  )) as { code?: string; details?: { reason?: string }; message?: string } | null;
  expect(err, 'expected an error').not.toBeNull();
  expect(err?.code).toBe(code);
  if (reason) expect(err?.details?.reason).toBe(reason);
  return err;
}

describe('preview token', () => {
  it('is 43 random base64url characters and only its sha256 is compared', () => {
    const a = generatePreviewToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generatePreviewToken()).not.toBe(a);
    expect(hashPreviewToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPreviewToken(a)).not.toContain(a);
  });

  it('wrong, malformed and expired tokens get one and the same generic error', async () => {
    const expired = makeWorld({
      organizer: baseOrganizer({ previewTokenExpiresAtMs: NOW - 1 }),
    });
    const fine = makeWorld();
    const errors = await Promise.all([
      expectCode(getImportPreviewHandler({ data: { token: OTHER_TOKEN } }, fine.deps), 'not-found'),
      expectCode(getImportPreviewHandler({ data: { token: 'short' } }, fine.deps), 'not-found'),
      expectCode(getImportPreviewHandler({ data: {} }, fine.deps), 'not-found'),
      expectCode(getImportPreviewHandler({ data: { token: TOKEN } }, expired.deps), 'not-found'),
      expectCode(
        submitImportConsentHandler({ data: approve({ token: OTHER_TOKEN }) }, fine.deps),
        'not-found'
      ),
    ]);
    expect(new Set(errors.map((e) => e?.message)).size).toBe(1);
    expect(fine.views).toHaveLength(0);
  });

  it('createPreviewLink: Super-Admin only, stores the hash, never replaces a valid link silently', async () => {
    const w = makeWorld({
      organizer: baseOrganizer({ previewTokenHash: null, previewTokenExpiresAtMs: null }),
    });
    await expectCode(
      createPreviewLinkHandler({ auth: { uid: 'mod' }, data: { organizerId: 'org1' } }, w.deps),
      'permission-denied'
    );
    await expectCode(
      createPreviewLinkHandler({ data: { organizerId: 'org1' } }, w.deps),
      'unauthenticated'
    );
    const result = await createPreviewLinkHandler(
      { auth: { uid: 'admin' }, data: { organizerId: 'org1' } },
      w.deps
    );
    expect(result.url).toBe(`https://tribe-vbg-staging.web.app/vorschau/${OTHER_TOKEN}`);
    expect(result.expiresAt).toBe(new Date(NOW + PREVIEW_TOKEN_TTL_MS).toISOString());
    const stored = w.organizers.get('org1')!;
    expect(stored.previewTokenHash).toBe(hashPreviewToken(OTHER_TOKEN));
    expect(JSON.stringify(stored)).not.toContain(OTHER_TOKEN);
    await expectCode(
      createPreviewLinkHandler({ auth: { uid: 'admin' }, data: { organizerId: 'org1' } }, w.deps),
      'failed-precondition',
      'link-exists'
    );
    const again = await createPreviewLinkHandler(
      { auth: { uid: 'admin' }, data: { organizerId: 'org1', regenerate: true } },
      w.deps
    );
    expect(again.url).not.toBe(result.url);
    expect(w.audit.map((a) => a.action)).toEqual(['importPreviewLink', 'importPreviewLink']);
  });
});

describe('getImportPreview', () => {
  it('returns only the organizer’s public-shaped events and logs the view without IP', async () => {
    const w = makeWorld();
    const preview = await getImportPreviewHandler(
      { data: { token: TOKEN }, rawRequest: { headers: { 'x-forwarded-for': '1.2.3.4' } } },
      w.deps
    );
    expect(preview.organizer).toEqual({
      name: 'Yogaverein Tirol',
      website: 'https://www.yoga-tirol.at',
    });
    expect(preview.wordingVersion).toBe(CONSENT_WORDING_VERSION);
    expect(preview.events).toHaveLength(1); // the trashed one is not shown
    const [event] = preview.events;
    expect(event).toMatchObject({
      key: 'e1',
      title: 'Kakaozeremonie',
      description: 'Ein Abend mit & Kakao',
      imageUrl: 'https://www.yoga-tirol.at/img/kakao.jpg',
      published: false,
    });
    const json = JSON.stringify(preview);
    for (const secret of ['info@yoga-tirol.at', 'ev1', 'org1', 'curator', 'c1', 'organizerRef']) {
      expect(json).not.toContain(secret);
    }
    expect(w.views).toHaveLength(1);
    expect(w.views[0].view).toEqual({
      at: new Date(NOW),
      imageUrls: ['https://www.yoga-tirol.at/img/kakao.jpg'],
      eventCount: 1,
    });
    expect(JSON.stringify(w.views)).not.toContain('1.2.3.4');
  });

  it('drops image URLs that are not on the organizer’s own site', () => {
    const candidates = baseCandidates();
    candidates[0].data.imageUrl = 'https://scontent.cdninstagram.com/x.jpg';
    const preview = buildImportPreview(baseOrganizer(), baseEvents(), candidates);
    expect(preview.events[0].imageUrl).toBeNull();
  });

  it('shows no events once the organizer declined', () => {
    const preview = buildImportPreview(baseOrganizer({ consent: 'declined' }), baseEvents(), []);
    expect(preview.events).toEqual([]);
  });
});

describe('consent input and state machine', () => {
  it('requires the event scope for an approval and the current wording version', () => {
    expect(() => parseConsentInput(approve({ scopes: { event: false } }))).toThrow(/required/);
    expect(() => parseConsentInput(approve({ wordingVersion: '2025-old' }))).toThrow(/outdated/);
    expect(() => parseConsentInput(approve({ action: 'publish_all' }))).toThrow(/Unknown action/);
    expect(() => parseConsentInput(approve({ scopes: { event: 'yes' } }))).toThrow(/true or false/);
    expect(
      parseConsentInput(approve({ action: 'decline', scopes: { event: true } })).scopes
    ).toEqual({
      event: false,
      images: false,
      persons: false,
    });
  });

  it('declined and claimed are final; repeating the same decision changes nothing', () => {
    const scopes = { event: true, images: false, persons: false };
    const org = (consent: OrganizerRecord['consent'], over: Partial<OrganizerRecord> = {}) =>
      baseOrganizer({ consent, ...over });
    expect(decideConsent(org('declined'), 'approve_once', scopes)).toEqual({
      kind: 'refuse',
      reason: 'declined',
    });
    expect(decideConsent(org('declined'), 'decline', scopes)).toEqual({ kind: 'unchanged' });
    expect(decideConsent(org('claimed'), 'decline', scopes)).toEqual({
      kind: 'refuse',
      reason: 'claimed',
    });
    const ok = org('manual_ok', { consentRecord: { scopes } });
    expect(decideConsent(ok, 'approve_once', scopes)).toEqual({ kind: 'unchanged' });
    expect(decideConsent(ok, 'approve_once', { ...scopes, images: true })).toEqual({
      kind: 'apply',
    });
    expect(decideConsent(ok, 'approve_sync', scopes)).toEqual({ kind: 'apply' });
    expect(decideConsent(ok, 'decline', scopes)).toEqual({ kind: 'apply' });
    expect(
      decideConsent(org('asked', { syncMode: 'self_managed' }), 'self_manage', scopes)
    ).toEqual({ kind: 'unchanged' });
  });

  it('only approvals with the event scope move pending events to approved', () => {
    const plan = planConsent({
      organizer: baseOrganizer(),
      events: baseEvents(),
      candidates: baseCandidates(),
      input: {
        action: 'self_manage',
        scopes: { event: false, images: false, persons: false },
        wordingVersion: CONSENT_WORDING_VERSION,
      },
      now: new Date(NOW),
      curatorUid: 'curator',
    });
    expect(plan.eventUpdates).toEqual([]);
    expect(plan.organizerPatch.syncMode).toBe('self_managed');
    expect(plan.organizerPatch.consent).toBeUndefined();
  });
});

describe('submitImportConsent', () => {
  it('approve_once: consent record, consentAt, approval bookkeeping like the admin UI, idempotent', async () => {
    const w = makeWorld({ takenSlugs: ['kakaozeremonie'] });
    const result = await submitImportConsentHandler({ data: approve() }, w.deps);
    expect(result).toEqual({
      consent: 'manual_ok',
      syncMode: 'curated_once',
      changed: true,
      approvedEvents: 1,
      imagesCopied: 0,
    });
    const org = w.organizers.get('org1')!;
    expect(org.consentRecord).toEqual({
      at: new Date(NOW),
      wordingVersion: CONSENT_WORDING_VERSION,
      scopes: { event: true, images: false, persons: false },
      action: 'approve_once',
    });
    expect(org.deleteAfter).toBeNull();
    const ev = w.eventDocs.get('ev1')!;
    expect(ev).toMatchObject({
      status: 'approved',
      approvedBy: 'curator',
      approvedAt: new Date(NOW),
      slug: 'kakaozeremonie-2',
    });
    expect((ev.curation as Doc).consentAt).toEqual(new Date(NOW));
    expect(w.eventDocs.get('ev2')!.status).toBe('trashed');
    expect(w.imageCopies).toEqual([]);
    expect(w.audit).toHaveLength(1);
    expect(w.audit[0]).toMatchObject({
      action: 'importConsent',
      consentAction: 'approve_once',
      approvedEvents: 1,
    });

    const again = await submitImportConsentHandler({ data: approve() }, w.deps);
    expect(again.changed).toBe(false);
    expect(w.plans).toHaveLength(1);
    expect(w.audit).toHaveLength(1);
  });

  it('approve_sync with images copies only the organizer’s own images', async () => {
    const w = makeWorld();
    const result = await submitImportConsentHandler(
      {
        data: approve({
          action: 'approve_sync',
          scopes: { event: true, images: true, persons: true },
        }),
      },
      w.deps
    );
    expect(result).toMatchObject({
      consent: 'sync_ok',
      syncMode: 'sync_consented',
      imagesCopied: 1,
    });
    expect(w.imageCopies).toEqual([
      {
        eventId: 'ev1',
        imageUrl: 'https://www.yoga-tirol.at/img/kakao.jpg',
        sourceUrl: 'https://www.yoga-tirol.at/kakao',
      },
    ]);
  });

  it('without the event scope nothing is approved and nothing is written', async () => {
    const w = makeWorld();
    await expectCode(
      submitImportConsentHandler(
        { data: approve({ scopes: { event: false, images: true } }) },
        w.deps
      ),
      'invalid-argument',
      'event-scope-required'
    );
    expect(w.plans).toHaveLength(0);
    expect(w.eventDocs.get('ev1')!.status).toBe('pending');
  });

  it('decline: blocklist hashes, events deleted, candidates stripped, contact address removed; idempotent and final', async () => {
    const w = makeWorld();
    const result = await submitImportConsentHandler(
      { data: { token: TOKEN, action: 'decline', wordingVersion: CONSENT_WORDING_VERSION } },
      w.deps
    );
    expect(result).toMatchObject({ consent: 'declined', syncMode: 'declined', changed: true });
    expect([...w.blocked].sort()).toEqual(
      [blocklistId('info@yoga-tirol.at'), blocklistId('yoga-tirol.at')].sort()
    );
    expect(w.eventDocs.size).toBe(0);
    const c1 = w.candidateDocs.get('c1')!;
    expect(c1).toMatchObject({ status: 'rejected', imageUrl: null, eventId: null });
    expect(c1.rawExtract).toBeUndefined();
    const org = w.organizers.get('org1')!;
    expect(org.contactEmail).toBeNull();
    expect(JSON.stringify(org)).not.toContain('info@yoga-tirol.at');
    expect((org.consentRecord as Doc).action).toBe('decline');

    const again = await submitImportConsentHandler(
      { data: { token: TOKEN, action: 'decline', wordingVersion: CONSENT_WORDING_VERSION } },
      w.deps
    );
    expect(again.changed).toBe(false);
    await expectCode(
      submitImportConsentHandler({ data: approve() }, w.deps),
      'failed-precondition',
      'declined'
    );
  });

  it('a later decline withdraws an approval', async () => {
    const w = makeWorld();
    await submitImportConsentHandler({ data: approve() }, w.deps);
    expect(w.eventDocs.get('ev1')!.status).toBe('approved');
    await submitImportConsentHandler(
      { data: { token: TOKEN, action: 'decline', wordingVersion: CONSENT_WORDING_VERSION } },
      w.deps
    );
    expect(w.eventDocs.has('ev1')).toBe(false);
    expect(w.organizers.get('org1')!.consent).toBe('declined');
  });

  it('self_manage only notes the intent', async () => {
    const w = makeWorld();
    const result = await submitImportConsentHandler(
      { data: { token: TOKEN, action: 'self_manage', wordingVersion: CONSENT_WORDING_VERSION } },
      w.deps
    );
    expect(result).toMatchObject({ consent: 'asked', syncMode: 'self_managed', approvedEvents: 0 });
    expect(w.eventDocs.get('ev1')!.status).toBe('pending');
    expect(w.organizers.get('org1')!.selfManageRequestedAt).toEqual(new Date(NOW));
  });
});

describe('outreach mail', () => {
  const send = (w: ReturnType<typeof makeWorld>, data: Doc = {}) =>
    sendOutreachMailHandler(
      {
        auth: { uid: 'admin' },
        data: { organizerId: 'org1', testRecipient: 'tester@thetribe.at', ...data },
      },
      w.deps
    );
  const fresh = (over: Partial<OrganizerRecord> = {}) =>
    makeWorld({
      organizer: baseOrganizer({
        consent: 'none',
        previewTokenHash: null,
        previewTokenExpiresAtMs: null,
        deleteAfterMs: null,
        ...over,
      }),
    });

  it('never uses the real address outside production; [TEST] subject; one mail only', async () => {
    const w = fresh();
    await expectCode(
      send(w, { testRecipient: undefined }),
      'failed-precondition',
      'test-recipient-required'
    );
    expect(w.mails).toHaveLength(0);
    const result = await send(w);
    expect(result).toMatchObject({ sent: true, to: 'tester@thetribe.at', test: true });
    expect(w.mails).toHaveLength(1);
    expect(w.mails[0].to).toBe('tester@thetribe.at');
    expect(w.mails[0].subject.startsWith('[TEST] ')).toBe(true);
    expect(w.mails[0].text).toContain(`/vorschau/${OTHER_TOKEN}`);
    expect(w.mails[0].text).toContain(`/vorschau/${OTHER_TOKEN}?aktion=ablehnen`);
    expect(w.outreach()).toMatchObject({
      status: 'sent',
      messageId: '<msg-1@mg.thetribe.at>',
      test: true,
      templateVersion: '2026-11-v1',
    });
    const org = w.organizers.get('org1')!;
    expect(org.consent).toBe('asked');
    expect(org.deleteAfter).toEqual(new Date(NOW + IMPORT_RETENTION_MS));
    expect(org.previewTokenHash).toBe(hashPreviewToken(OTHER_TOKEN));

    await expectCode(send(w), 'failed-precondition', 'already-sent');
    expect(w.mails).toHaveLength(1);
  });

  it('is switched off on production', async () => {
    const w = makeWorld({
      projectId: 'spirieventsvbg',
      organizer: baseOrganizer({ consent: 'none' }),
    });
    await expectCode(send(w), 'failed-precondition', 'disabled-in-production');
    expect(w.mails).toHaveLength(0);
  });

  it('refuses blocklisted, contacted, individual (unless force), address-less organizers', async () => {
    const blocked = makeWorld({
      organizer: baseOrganizer({ consent: 'none' }),
      blocklist: [blocklistId('yoga-tirol.at')],
    });
    await expectCode(send(blocked), 'failed-precondition', 'blocklisted');
    await expectCode(send(fresh({ consent: 'asked' })), 'failed-precondition', 'consent-not-none');
    await expectCode(send(fresh({ legalForm: 'individual' })), 'failed-precondition', 'individual');
    await expect(send(fresh({ legalForm: 'individual' }), { force: true })).resolves.toMatchObject({
      sent: true,
    });
    await expectCode(send(fresh({ contactEmail: null })), 'failed-precondition', 'no-contact');
    const sent = makeWorld({
      organizer: baseOrganizer({ consent: 'none' }),
      outreach: { status: 'sent', templateVersion: 'x', test: true },
    });
    await expectCode(send(sent), 'failed-precondition', 'already-sent');
    await expectCode(
      sendOutreachMailHandler(
        { auth: { uid: 'mod' }, data: { organizerId: 'org1' } },
        fresh().deps
      ),
      'permission-denied'
    );
  });

  it('a failed send is logged and may be retried', async () => {
    const w = makeWorld({ organizer: baseOrganizer({ consent: 'none' }), mailFails: true });
    await expectCode(send(w), 'internal');
    expect(w.outreach()).toMatchObject({ status: 'failed', error: 'mailgun down' });
    expect(w.organizers.get('org1')!.consent).toBe('none');
    expect(
      outreachRefusal(baseOrganizer({ consent: 'none' }), {
        blocked: false,
        outreachExists: false,
        eventCount: 1,
        force: false,
      })
    ).toBeNull();
  });

  it('resolveOutreachRecipient: real address only on production with the switch on', () => {
    const base = { contactEmail: 'info@x.at' };
    expect(
      resolveOutreachRecipient({
        ...base,
        projectId: 'tribe-vbg-staging',
        testRecipient: 'info@x.at ',
      })
    ).toEqual({ ok: true, to: 'info@x.at', test: true });
    expect(
      resolveOutreachRecipient({ ...base, projectId: undefined, testRecipient: null })
    ).toEqual({ ok: false, reason: 'test-recipient-required' });
    expect(
      resolveOutreachRecipient({ ...base, projectId: 'demo-rules', testRecipient: 'nope' })
    ).toEqual({ ok: false, reason: 'bad-test-recipient' });
    expect(
      resolveOutreachRecipient({
        ...base,
        projectId: 'spirieventsvbg',
        testRecipient: null,
        productionEnabled: true,
      })
    ).toEqual({ ok: true, to: 'info@x.at', test: false });
    expect(
      resolveOutreachRecipient({
        ...base,
        projectId: 'spirieventsvbg',
        testRecipient: 't@x.at',
        productionEnabled: true,
      })
    ).toEqual({ ok: true, to: 't@x.at', test: true });
  });

  it('uses a fixed outreach doc id, so there can only ever be one', () => {
    expect(OUTREACH_DOC_ID).toBe('mail');
  });
});

describe('purge of unanswered organizers', () => {
  it('only none/asked organizers after deleteAfter', () => {
    expect(isImportDataExpired({ consent: 'asked', deleteAfterMs: NOW }, NOW)).toBe(true);
    expect(isImportDataExpired({ consent: 'none', deleteAfterMs: NOW - 1 }, NOW)).toBe(true);
    expect(isImportDataExpired({ consent: 'asked', deleteAfterMs: NOW + 1 }, NOW)).toBe(false);
    expect(isImportDataExpired({ consent: 'asked', deleteAfterMs: null }, NOW)).toBe(false);
    for (const consent of ['manual_ok', 'sync_ok', 'declined', 'claimed'] as const) {
      expect(isImportDataExpired({ consent, deleteAfterMs: NOW - 1 }, NOW)).toBe(false);
    }
  });

  it('deletes candidates, never-public events, contact data and the token; keeps a tombstone', () => {
    const events = baseEvents();
    events.push({ id: 'ev3', data: { status: 'approved', curation } });
    const plan = planOrganizerPurge(baseOrganizer(), events, baseCandidates(), new Date(NOW));
    expect(plan.candidateDeletes).toEqual(['c1']);
    expect(plan.eventDeletes).toEqual(['ev1', 'ev2']);
    expect(plan.organizerPatch).toMatchObject({
      contactEmail: null,
      previewTokenHash: null,
      previewTokenExpiresAt: null,
      deleteAfter: null,
    });
    expect(plan.organizerPatch).not.toHaveProperty('name');
    expect(plan.organizerPatch).not.toHaveProperty('consent');
    expect(plan.deletePreviewViews).toBe(true);
  });
});

describe('copyConsentedImages', () => {
  const item = {
    eventId: 'ev1',
    imageUrl: 'https://www.yoga-tirol.at/img/kakao.jpg',
    sourceUrl: 'https://www.yoga-tirol.at/kakao',
  };
  const deps = (over: Partial<Parameters<typeof copyConsentedImages>[1]> = {}) => {
    const uploads: string[] = [];
    const updates: Array<[string, Doc]> = [];
    const logs: string[] = [];
    return {
      uploads,
      updates,
      logs,
      deps: {
        now: () => NOW,
        fetchImage: async () => Buffer.from('img'),
        convert: async () => ({ full: Buffer.from('f'), thumb: Buffer.from('t') }),
        upload: async (path: string) => {
          uploads.push(path);
          return `https://firebasestorage.googleapis.com/${path}`;
        },
        updateEvent: async (id: string, patch: Doc) => {
          updates.push([id, patch]);
        },
        log: (m: string) => logs.push(m),
        ...over,
      },
    };
  };

  it('stores full image and thumbnail under events/{id}/ and sets the event fields', async () => {
    const d = deps();
    expect(await copyConsentedImages([item], d.deps)).toEqual({ copied: 1, failed: 0 });
    const paths = importImagePaths('ev1', NOW);
    expect(d.uploads).toEqual([paths.full, paths.thumb]);
    expect(paths.full.startsWith('events/ev1/')).toBe(true);
    expect(d.updates[0][1]).toMatchObject({
      imageUrl: `https://firebasestorage.googleapis.com/${paths.full}`,
      imageThumbUrl: `https://firebasestorage.googleapis.com/${paths.thumb}`,
      rightsConfirmed: true,
    });
  });

  it('skips foreign hosts and survives a failing download', async () => {
    const d = deps({ fetchImage: async () => Promise.reject(new Error('HTTP 404')) });
    const result = await copyConsentedImages(
      [item, { ...item, imageUrl: 'https://evil.example/x.jpg' }],
      d.deps
    );
    expect(result).toEqual({ copied: 0, failed: 2 });
    expect(d.updates).toEqual([]);
  });
});

describe('client copy', () => {
  it('uses the same consent wording version as the backend', () => {
    expect(CLIENT_WORDING_VERSION).toBe(CONSENT_WORDING_VERSION);
  });
});
