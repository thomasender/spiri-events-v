import { describe, it, expect, vi } from 'vitest';
import {
  AdminEventMailDeps,
  AuthUserLike,
  RegionInfo,
  RoutedRecipient,
  StaffDocEntry,
  buildRegionalAdminRecipients,
  eventMailRegionId,
  mailRegionLabel,
  moderatorUidsForRegion,
  regionContactEmail,
  resolveOwnerRegionContact,
  sendSubmittedAdminMail,
} from '../../functions/src/adminEventRouting';
import {
  ADMIN_EVENT_EMAILS_ENABLED,
  buildAdminRecipientList,
} from '../../functions/src/notifications';
import { buildSubmittedPayload } from '../../functions/src/emailTemplates';

// Staff of the fake project: two Super-Admins, moderators for Tirol, Bayern,
// Tirol+Wien, a disabled Tirol moderator, one without email, a doc without
// Auth account, and one malformed moderator doc.
const STAFF: StaffDocEntry[] = [
  { uid: 'mod-tirol', data: { role: 'RegionModerator', regionIds: ['tirol'] } },
  { uid: 'mod-tirol-wien', data: { role: 'RegionModerator', regionIds: ['wien', 'tirol'] } },
  { uid: 'mod-bayern', data: { role: 'RegionModerator', regionIds: ['bayern'] } },
  { uid: 'mod-vbg', data: { role: 'RegionModerator', regionIds: ['vorarlberg'] } },
  { uid: 'mod-disabled', data: { role: 'RegionModerator', regionIds: ['steiermark'] } },
  { uid: 'mod-noemail', data: { role: 'RegionModerator', regionIds: ['steiermark'] } },
  { uid: 'mod-ghost', data: { role: 'RegionModerator', regionIds: ['steiermark'] } },
  { uid: 'mod-bad', data: { role: 'RegionModerator', regionIds: 'tirol' } },
];

const AUTH: Record<string, AuthUserLike> = {
  'mod-tirol': { uid: 'mod-tirol', email: 'tirol@mod.at' },
  'mod-tirol-wien': { uid: 'mod-tirol-wien', email: 'tw@mod.at' },
  'mod-bayern': { uid: 'mod-bayern', email: 'bayern@mod.de' },
  'mod-vbg': { uid: 'mod-vbg', email: 'vbg@mod.at' },
  'mod-disabled': { uid: 'mod-disabled', email: 'off@mod.at', disabled: true },
  'mod-noemail': { uid: 'mod-noemail', email: null },
  'mod-bad': { uid: 'mod-bad', email: 'bad@mod.at' },
};

const SUPER_ADMINS = [
  { uid: 'admin-1', email: 'peter@thetribe.at' },
  { uid: 'admin-2', email: 'thomas@thetribe.at' },
];

const ONE_ACTIVE: RegionInfo[] = [
  { id: 'vorarlberg', name: 'Vorarlberg', active: true, contactEmail: '' },
  { id: 'tirol', name: 'Tirol', active: false, contactEmail: 'tirol@thetribe.at' },
  { id: 'steiermark', name: 'Steiermark', active: false, contactEmail: 'not an address' },
  { id: 'bayern', name: 'Bayern', active: false, contactEmail: 'BAYERN@mod.de' },
];

const TWO_ACTIVE: RegionInfo[] = ONE_ACTIVE.map((r) =>
  r.id === 'bayern' ? { ...r, active: true } : r
);

const INBOX = 'admin@thetribe.at';

function makeDeps(overrides: Partial<AdminEventMailDeps> = {}) {
  const sent: { to: string; regionLabel: string | null }[] = [];
  const deps = {
    loadSuperAdmins: vi.fn(async () => SUPER_ADMINS),
    loadModeratorDocs: vi.fn(async () => STAFF),
    loadAuthUsers: vi.fn(async (uids: string[]) =>
      uids.map((uid) => AUTH[uid]).filter((u): u is AuthUserLike => !!u)
    ),
    loadRegions: vi.fn(async () => ONE_ACTIVE),
    filterByPreferences: vi.fn(async (r: RoutedRecipient[]) => r),
    send: vi.fn(async (to: string, regionLabel: string | null) => {
      sent.push({ to, regionLabel });
      return true;
    }),
    warn: vi.fn(),
    ...overrides,
  };
  return { deps, sent };
}

async function recipientsFor(
  eventData: unknown,
  overrides: Partial<AdminEventMailDeps> = {},
  inbox: string | null = null
) {
  const { deps, sent } = makeDeps(overrides);
  const result = await sendSubmittedAdminMail({
    enabled: true,
    eventData,
    submittedInbox: inbox,
    deps,
  });
  return { result, sent, deps, emails: sent.map((s) => s.to) };
}

describe('admin event emails are switched off (Trello 8ioEr9T1)', () => {
  it('ADMIN_EVENT_EMAILS_ENABLED stays false', () => {
    expect(ADMIN_EVENT_EMAILS_ENABLED).toBe(false);
  });

  it('with the flag off nothing is read and nothing is sent, for any region', async () => {
    for (const eventData of [{}, { regionId: 'tirol' }, { regionId: 'bayern', isOnline: true }]) {
      const { deps } = makeDeps();
      const result = await sendSubmittedAdminMail({
        enabled: ADMIN_EVENT_EMAILS_ENABLED,
        eventData,
        submittedInbox: INBOX,
        deps,
      });
      expect(result).toMatchObject({ enabled: false, recipients: [], sent: 0 });
      for (const fn of Object.values(deps)) expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('recipients of "new event submitted" once re-enabled', () => {
  it('region without moderator and without contactEmail: Super-Admins (+ inbox) as before', async () => {
    // Vorarlberg has a moderator in STAFF; use one without any.
    const { emails, result } = await recipientsFor(
      { regionId: 'vorarlberg' },
      { loadModeratorDocs: vi.fn(async () => []) },
      INBOX
    );
    expect(emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', INBOX]);
    // Same list the old (region-blind) path produced.
    expect(result.recipients).toEqual(buildAdminRecipientList(SUPER_ADMINS, INBOX));
  });

  it('region with moderators: Super-Admins + exactly that region’s moderators + contactEmail', async () => {
    const { emails } = await recipientsFor({ regionId: 'tirol' });
    expect(emails).toEqual([
      'peter@thetribe.at',
      'thomas@thetribe.at',
      'tirol@mod.at',
      'tw@mod.at',
      'tirol@thetribe.at',
    ]);
  });

  it('never mails moderators of other regions', async () => {
    const { emails } = await recipientsFor({ regionId: 'wien' });
    expect(emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', 'tw@mod.at']);
    expect(emails).not.toContain('tirol@mod.at');
    expect(emails).not.toContain('vbg@mod.at');
  });

  it('an event without regionId counts as Vorarlberg', async () => {
    expect(eventMailRegionId({})).toBe('vorarlberg');
    const { emails } = await recipientsFor({ title: 'Altes Event' });
    expect(emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', 'vbg@mod.at']);
  });

  it('an online event goes by its regionId', async () => {
    const { emails } = await recipientsFor({ isOnline: true, regionId: 'tirol' });
    expect(emails).toContain('tirol@mod.at');
    expect(emails).not.toContain('vbg@mod.at');
  });

  it('Bayern: its moderator, contact address deduplicated case-insensitively', async () => {
    const { emails } = await recipientsFor({ regionId: 'bayern' });
    // contactEmail BAYERN@mod.de == the moderator's address.
    expect(emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', 'bayern@mod.de']);
  });

  it('a moderator who is also a Super-Admin or the inbox gets one mail and keeps the admin uid', async () => {
    const { result } = await recipientsFor(
      { regionId: 'tirol' },
      {
        loadAuthUsers: vi.fn(async () => [
          { uid: 'mod-tirol', email: 'Peter@TheTribe.at' },
          { uid: 'mod-tirol-wien', email: 'ADMIN@thetribe.at' },
        ]),
        loadRegions: vi.fn(async () => [
          { id: 'tirol', name: 'Tirol', active: false, contactEmail: 'thomas@thetribe.at' },
        ]),
      },
      INBOX
    );
    expect(result.recipients).toEqual([
      { uid: 'admin-1', email: 'peter@thetribe.at' },
      { uid: 'admin-2', email: 'thomas@thetribe.at' },
      { email: INBOX },
    ]);
  });

  it('skips disabled, email-less and deleted moderator accounts without failing', async () => {
    const { emails, deps } = await recipientsFor({ regionId: 'steiermark' });
    // contactEmail "not an address" is ignored as well.
    expect(emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at']);
    expect(deps.warn).toHaveBeenCalledWith(
      'Some region moderators have no usable email and are skipped',
      { regionId: 'steiermark', skipped: 3 }
    );
  });

  it('falls back to Super-Admins when moderators or regions cannot be read', async () => {
    const boom = vi.fn(async () => {
      throw new Error('firestore down');
    });
    const a = await recipientsFor({ regionId: 'tirol' }, { loadModeratorDocs: boom });
    expect(a.emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', 'tirol@thetribe.at']);
    const b = await recipientsFor({ regionId: 'tirol' }, { loadAuthUsers: boom });
    expect(b.emails).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', 'tirol@thetribe.at']);
    const c = await recipientsFor({ regionId: 'tirol' }, { loadRegions: boom });
    expect(c.emails).toEqual([
      'peter@thetribe.at',
      'thomas@thetribe.at',
      'tirol@mod.at',
      'tw@mod.at',
    ]);
    expect(c.sent.every((s) => s.regionLabel === null)).toBe(true);
  });

  it('respects the per-person unsubscribe (notifyOnSubmitted) via the preference filter', async () => {
    const { emails, result } = await recipientsFor(
      { regionId: 'tirol' },
      {
        filterByPreferences: vi.fn(async (r: RoutedRecipient[]) =>
          r.filter((x) => x.uid !== 'mod-tirol')
        ),
      }
    );
    expect(emails).not.toContain('tirol@mod.at');
    expect(result.sent).toBe(emails.length);
  });

  it('counts only delivered mails; one failing address does not stop the others', async () => {
    const { result, deps } = await recipientsFor(
      { regionId: 'tirol' },
      { send: vi.fn(async (to: string) => to !== 'tirol@mod.at') }
    );
    expect(result.recipients).toHaveLength(5);
    expect(deps.send).toHaveBeenCalledTimes(5);
    expect(result.sent).toBe(4);
  });

  it('names the region only while more than one region is active', async () => {
    const single = await recipientsFor({ regionId: 'bayern' });
    expect(single.sent.every((s) => s.regionLabel === null)).toBe(true);
    const multi = await recipientsFor(
      { regionId: 'bayern' },
      { loadRegions: vi.fn(async () => TWO_ACTIVE) }
    );
    expect(multi.sent.every((s) => s.regionLabel === 'Bayern')).toBe(true);
  });
});

describe('pure helpers', () => {
  it('moderatorUidsForRegion ignores Super-Admins, malformed docs and unknown regions', () => {
    const docs: StaffDocEntry[] = [
      ...STAFF,
      { uid: 'admin-1', data: { role: 'Admin' } },
      { uid: 'legacy', data: {} },
    ];
    expect(moderatorUidsForRegion(docs, 'tirol')).toEqual(['mod-tirol', 'mod-tirol-wien']);
    expect(moderatorUidsForRegion(docs, 'mars')).toEqual([]);
    expect(moderatorUidsForRegion(docs, 'oesterreich')).toEqual([]);
  });

  it('regionContactEmail accepts only plausible addresses', () => {
    expect(regionContactEmail({ id: 'tirol', contactEmail: ' tirol@thetribe.at ' })).toBe(
      'tirol@thetribe.at'
    );
    for (const contactEmail of ['', '   ', 'kein', 'a@b', 'a b@c.at', 'a@b.at, c@d.at', null]) {
      expect(regionContactEmail({ id: 'tirol', contactEmail })).toBeNull();
    }
    expect(regionContactEmail(null)).toBeNull();
  });

  it('mailRegionLabel', () => {
    expect(mailRegionLabel(ONE_ACTIVE, 'vorarlberg')).toBeNull();
    expect(mailRegionLabel(TWO_ACTIVE, 'tirol')).toBe('Tirol');
    expect(mailRegionLabel(TWO_ACTIVE, 'wien')).toBeNull();
    expect(mailRegionLabel([], 'tirol')).toBeNull();
  });

  it('buildRegionalAdminRecipients keeps admins and inbox first', () => {
    expect(
      buildRegionalAdminRecipients({
        superAdmins: SUPER_ADMINS,
        moderators: [{ uid: 'm', email: 'm@x.at' }],
        submittedInbox: INBOX,
        contactEmail: 'c@x.at',
      }).map((r) => r.email)
    ).toEqual(['peter@thetribe.at', 'thomas@thetribe.at', INBOX, 'm@x.at', 'c@x.at']);
  });
});

describe('"new event submitted" mail text', () => {
  const event = { id: 'ev1', title: 'Yoga am See' };

  it('without a region (one active region) is exactly the old mail', () => {
    const base = buildSubmittedPayload({
      event,
      context: { submitterName: 'Anna' },
      recipient: 'a@b.at',
    });
    expect(base.subject).toBe('Neuer Event-Vorschlag: Yoga am See');
    expect(
      base.text.startsWith(
        'Hallo,\n\nAnna hat ein neues Event zur Prüfung eingereicht:\nYoga am See\n\n' +
          'Im Review ansehen: https://www.thetribe.at/admin?tab=review#ev1\n--\n'
      )
    ).toBe(true);
    expect(base.html).not.toContain('Region');
    for (const regionName of [null, undefined, '', '  ']) {
      expect(
        buildSubmittedPayload({
          event,
          context: { submitterName: 'Anna', regionName },
          recipient: 'a@b.at',
        })
      ).toEqual(base);
    }
  });

  it('with several active regions names the region in subject and body', () => {
    const p = buildSubmittedPayload({
      event,
      context: { submitterName: 'Anna', regionName: 'Bayern' },
      recipient: 'a@b.at',
    });
    expect(p.subject).toBe('Neuer Event-Vorschlag (Bayern): Yoga am See');
    expect(p.text).toContain('Yoga am See\nRegion: Bayern\n\nIm Review ansehen:');
    expect(p.html).toContain('Region: Bayern');
  });
});

describe('resolveOwnerRegionContact (owner mails)', () => {
  const tirol = { regionId: 'tirol' };

  it('is null with one active region, without even using the contact', async () => {
    expect(await resolveOwnerRegionContact(tirol, async () => ONE_ACTIVE)).toBeNull();
  });

  it('returns the contact address of the event region when several are active', async () => {
    expect(await resolveOwnerRegionContact(tirol, async () => TWO_ACTIVE)).toBe(
      'tirol@thetribe.at'
    );
    expect(await resolveOwnerRegionContact({ regionId: 'bayern' }, async () => TWO_ACTIVE)).toBe(
      'BAYERN@mod.de'
    );
  });

  it('treats events without regionId as Vorarlberg (no contact set there)', async () => {
    expect(await resolveOwnerRegionContact({}, async () => TWO_ACTIVE)).toBeNull();
  });

  it('is null for a region without contactEmail or with an invalid address', async () => {
    expect(
      await resolveOwnerRegionContact({ regionId: 'vorarlberg' }, async () => TWO_ACTIVE)
    ).toBeNull();
    expect(
      await resolveOwnerRegionContact({ regionId: 'steiermark' }, async () => TWO_ACTIVE)
    ).toBeNull();
  });

  it('is null when the region doc is missing', async () => {
    expect(
      await resolveOwnerRegionContact({ regionId: 'wien' }, async () => TWO_ACTIVE)
    ).toBeNull();
  });

  it('never throws when regions cannot be read', async () => {
    const warn = vi.fn();
    const result = await resolveOwnerRegionContact(
      tirol,
      async () => {
        throw new Error('boom');
      },
      warn
    );
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
