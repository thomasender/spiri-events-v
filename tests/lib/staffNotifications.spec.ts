import { describe, it, expect } from 'vitest';
import {
  APPLICATION_REMINDER_AFTER_MS,
  applicationNotifications,
  buildApplicationReminderMail,
  canInviteApplicant,
  inviteRegionIdFor,
  isReminderDue,
  newModeratorNotifications,
  reminderNotifications,
  staffRecipients,
  type ApplicationRecord,
} from '../../functions/src/staffNotifications';
import {
  applicantInviteButton,
  applicantInviteErrorMessage,
  staffNotificationRegionLabel,
  staffNotificationText,
} from '../../src/utils/staffNotifications';

const docs = [
  { uid: 'boss', data: { role: 'Admin' } },
  { uid: 'boss2', data: { role: 'Admin' } },
  { uid: 'tiMod', data: { role: 'RegionModerator', regionIds: ['tirol'] } },
  { uid: 'both', data: { role: 'RegionModerator', regionIds: ['tirol', 'vorarlberg'] } },
  { uid: 'vbgMod', data: { role: 'RegionModerator', regionIds: ['vorarlberg'] } },
  { uid: 'broken', data: { role: 'RegionModerator', regionIds: ['mars'] } },
  { uid: 'user', data: { role: 'User' } },
  // A second doc for the same uid (cannot happen in Firestore) must not double the note.
  { uid: 'boss', data: { role: 'Admin' } },
];

const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const app = (over: Partial<ApplicationRecord> = {}): ApplicationRecord => ({
  name: 'Maria',
  email: 'maria@x.at',
  message: 'Hallo',
  regionId: 'tirol',
  hasPhoto: false,
  status: 'open',
  createdAtMs: NOW - APPLICATION_REMINDER_AFTER_MS,
  reminderSentAtMs: null,
  ...over,
});

describe('staffRecipients', () => {
  it('Super-Admins plus the moderators of the region, each once', () => {
    expect(staffRecipients(docs, ['tirol'])).toEqual({
      superAdminUids: ['boss', 'boss2'],
      moderatorUids: ['tiMod', 'both'],
    });
  });

  it('without region only the Super-Admins', () => {
    expect(staffRecipients(docs, null)).toEqual({
      superAdminUids: ['boss', 'boss2'],
      moderatorUids: [],
    });
    expect(staffRecipients(docs, [])).toEqual(staffRecipients(docs, null));
  });

  it('several regions: a moderator of two of them is listed once; exclusions are left out', () => {
    const r = staffRecipients(docs, ['tirol', 'vorarlberg'], ['both']);
    expect(r.moderatorUids).toEqual(['tiMod', 'vbgMod']);
  });
});

describe('notes per event', () => {
  it('a new application: one note per recipient with the right audience, no duplicates', () => {
    const notes = applicationNotifications(docs, 'a1', app());
    expect(notes.map((n) => [n.recipientUid, n.audience])).toEqual([
      ['boss', 'superAdmin'],
      ['boss2', 'superAdmin'],
      ['tiMod', 'moderator'],
      ['both', 'moderator'],
    ]);
    expect(new Set(notes.map((n) => n.recipientUid)).size).toBe(notes.length);
    expect(notes[0]).toMatchObject({
      kind: 'application',
      applicationId: 'a1',
      name: 'Maria',
      email: 'maria@x.at',
      regionIds: ['tirol'],
    });
  });

  it('an application without region reaches only the Super-Admins', () => {
    const notes = applicationNotifications(docs, 'a1', app({ regionId: null }));
    expect(notes.map((n) => n.recipientUid)).toEqual(['boss', 'boss2']);
    expect(notes[0].regionIds).toEqual([]);
  });

  it('the reminder goes to the Super-Admins only', () => {
    expect(reminderNotifications(docs, 'a1', app()).map((n) => [n.recipientUid, n.kind])).toEqual([
      ['boss', 'applicationReminder'],
      ['boss2', 'applicationReminder'],
    ]);
  });

  it('a new moderator: confirmation for Super-Admins, chat-group reminder for colleagues', () => {
    const notes = newModeratorNotifications(docs, {
      uid: 'tiMod',
      name: 'Maria',
      regionIds: ['tirol'],
      applicationId: null,
    });
    expect(notes.map((n) => [n.recipientUid, n.audience])).toEqual([
      ['boss', 'superAdmin'],
      ['boss2', 'superAdmin'],
      ['both', 'moderator'],
    ]);
  });
});

describe('isReminderDue', () => {
  it('after three days, only while open, only once', () => {
    expect(isReminderDue(app(), NOW)).toBe(true);
    expect(isReminderDue(app({ createdAtMs: NOW - APPLICATION_REMINDER_AFTER_MS + 1 }), NOW)).toBe(
      false
    );
    expect(isReminderDue(app({ status: 'invited' }), NOW)).toBe(false);
    expect(isReminderDue(app({ status: 'done' }), NOW)).toBe(false);
    expect(isReminderDue(app({ reminderSentAtMs: NOW - 1 }), NOW)).toBe(false);
    // createdAt not written yet (server timestamp pending): never due.
    expect(isReminderDue(app({ createdAtMs: 0 }), NOW)).toBe(false);
  });

  it('the reminder mail names the person and links to the admin area', () => {
    const mail = buildApplicationReminderMail(app(), 'Tirol', 'https://x.test/admin?tab=team');
    expect(mail.subject).toBe('Erinnerung: Bewerbung von Maria ist noch offen');
    expect(mail.text).toContain('maria@x.at');
    expect(mail.text).toContain('https://x.test/admin?tab=team');
  });
});

describe('who may invite an applicant', () => {
  const superAdmin = { kind: 'superAdmin' } as const;
  const tiMod = { kind: 'regionModerator', regionIds: ['tirol'] } as const;

  it('Super-Admins always, moderators only in their own region, nobody else', () => {
    expect(canInviteApplicant(superAdmin, 'tirol')).toBe(true);
    expect(canInviteApplicant(superAdmin, null)).toBe(true);
    expect(canInviteApplicant(tiMod, 'tirol')).toBe(true);
    expect(canInviteApplicant(tiMod, 'vorarlberg')).toBe(false);
    expect(canInviteApplicant(tiMod, null)).toBe(false);
    expect(canInviteApplicant(null, 'tirol')).toBe(false);
  });

  it('the region is the application’s; only a Super-Admin fills in a missing one', () => {
    expect(inviteRegionIdFor(tiMod, 'tirol', 'vorarlberg')).toBe('tirol');
    expect(inviteRegionIdFor(superAdmin, 'tirol', 'vorarlberg')).toBe('tirol');
    expect(inviteRegionIdFor(superAdmin, null, 'vorarlberg')).toBe('vorarlberg');
    expect(inviteRegionIdFor(superAdmin, null, 'mars')).toBeNull();
    expect(inviteRegionIdFor(tiMod, null, 'tirol')).toBeNull();
  });
});

describe('client texts of the team notes', () => {
  const nameOf = (id: string) => ({ tirol: 'Tirol', vorarlberg: 'Vorarlberg' })[id] ?? id;

  it('no region names with one active region (dark launch)', () => {
    const note = { kind: 'newModerator', name: 'Maria', regionIds: ['tirol'] };
    expect(staffNotificationRegionLabel(note, { multiRegion: false, nameOf })).toBeNull();
    expect(staffNotificationRegionLabel(note, { multiRegion: true, nameOf })).toBe('Tirol');
    expect(
      staffNotificationRegionLabel({ ...note, regionIds: [] }, { multiRegion: true, nameOf })
    ).toBe('ohne bestimmte Region');
    expect(staffNotificationText(note).title).toBe('Neue:r Moderator:in');
    expect(staffNotificationText(note, 'Tirol').title).toBe('Neue:r Moderator:in für Tirol');
  });

  it('applications remind of the team chat group; reminders do not', () => {
    expect(staffNotificationText({ kind: 'application', name: 'Maria' }).hint).toMatch(
      /WhatsApp, Signal oder Telegram/
    );
    expect(staffNotificationText({ kind: 'applicationReminder', name: 'Maria' }).hint).toBeNull();
    expect(
      staffNotificationText({ kind: 'newModerator', name: 'Maria', audience: 'superAdmin' }).hint
    ).toBeNull();
  });

  it('the invite button and its errors', () => {
    expect(applicantInviteButton('open', 'Maria')).toEqual({
      disabled: false,
      label: 'Jetzt Maria als Moderator hinzufügen',
    });
    expect(applicantInviteButton('done', 'Maria')).toEqual({
      disabled: true,
      label: 'Maria ist schon Moderator:in',
    });
    expect(applicantInviteButton(null, 'Maria').disabled).toBe(true);
    expect(
      applicantInviteErrorMessage({
        code: 'functions/failed-precondition',
        message: 'Already a moderator.',
      })
    ).toBe('Diese Person ist schon Moderator:in.');
    expect(applicantInviteErrorMessage({ code: 'functions/permission-denied' })).toMatch(/Region/);
  });
});
