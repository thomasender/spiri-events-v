import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreEntryBanner from '../../src/components/PreEntryBanner';
import {
  DAY_MS,
  DEFAULT_TEMPLATES,
  buildPreEntrySettingsDoc,
  buildTemplateValues,
  derivePreEntryStatus,
  fillTemplate,
  filterRows,
  isExpiringSoon,
  isReminderDue,
  parsePreEntrySettings,
  previewBanner,
  sortRows,
  suggestedTemplate,
  unknownPlaceholders,
  wasEditedAfterClaim,
  whatsappLink,
} from '../../src/utils/preEntries';
import { redactSecretPath } from '../../src/lib/analytics';

const NOW = Date.UTC(2026, 10, 17, 10, 0, 0);
const settings = parsePreEntrySettings({ mode: 'all' });

type Row = Record<string, unknown>;
const row = (over: Row = {}): Row => ({
  eventId: 'e1',
  status: 'contacted',
  createdBy: 'mod',
  createdByName: 'Mo',
  createdAtMs: NOW - 5 * DAY_MS,
  expiresAtMs: NOW + 9 * DAY_MS,
  lastContactAtMs: NOW - 5 * DAY_MS,
  lastReactionAtMs: null,
  contactAttempts: [{ channel: 'email' }],
  contact: { name: 'Studio Klang', contactPerson: 'Lena', email: 'lena@x.at' },
  event: {
    title: 'Klangreise',
    date: '2026-12-05',
    time: '18:00',
    place: 'Klangraum',
    city: 'Dornbirn',
    category: 'Klang',
    excerpt: 'Eine Reise',
    status: 'draft',
    ownedBySystem: true,
    slug: 'klangreise',
  },
  ...over,
});

describe('message templates', () => {
  it('fills every placeholder of the built-in first request', () => {
    const values = buildTemplateValues({
      row: row(),
      links: { preview: 'https://t.at/vorschau/abc' },
      moderatorName: 'Mo',
      now: NOW,
      origin: 'https://t.at',
    });
    const text = fillTemplate(DEFAULT_TEMPLATES.initial.text, values);
    expect(text).toContain('Hallo Lena,');
    expect(text).toContain('„Klangreise“ am 05.12.2026 in Klangraum, Dornbirn');
    expect(text).toContain('https://t.at/vorschau/abc');
    expect(text).toContain('noch 9 Tage');
    expect(text).toContain('https://t.at/datenschutz#vorab-eintraege');
    expect(text).toContain('Liebe Grüße\nMo');
    expect(text).not.toMatch(/\{[a-z_]+\}/);
  });

  it('keeps unknown placeholders visible and empties known ones without value', () => {
    expect(fillTemplate('{tippfehler} {organisation}!', { organisation: '' })).toBe(
      '{tippfehler} !'
    );
    expect(unknownPlaceholders('Hallo {ansprechperson} {name}')).toEqual(['name']);
  });

  it('falls back to the built-in text for an empty override', () => {
    const s = parsePreEntrySettings({ templates: { reminder: { subject: '', text: ' ' } } });
    expect(s.templates.reminder).toEqual(DEFAULT_TEMPLATES.reminder);
    const custom = parsePreEntrySettings({
      templates: { reminder: { text: 'Hi {ansprechperson}' } },
    });
    expect(custom.templates.reminder.text).toBe('Hi {ansprechperson}');
    expect(custom.templates.reminder.subject).toBe(DEFAULT_TEMPLATES.reminder.subject);
  });

  it('suggests the template that fits the situation', () => {
    expect(suggestedTemplate(row({ contactAttempts: [] }), settings, NOW)).toBe('initial');
    expect(suggestedTemplate(row(), settings, NOW)).toBe('reminder');
    expect(suggestedTemplate(row({ expiresAtMs: NOW + DAY_MS }), settings, NOW)).toBe('expiring');
    expect(suggestedTemplate(row({ status: 'published' }), settings, NOW)).toBe('published');
  });
});

describe('wa.me link', () => {
  it('builds Click-to-Chat links from international and Austrian national numbers', () => {
    expect(whatsappLink('+43 664 1234567', 'Hallo du')).toBe(
      'https://wa.me/436641234567?text=Hallo%20du'
    );
    expect(whatsappLink('0043 664 1234567', '')).toBe('https://wa.me/436641234567');
    expect(whatsappLink('0664/1234567', 'x')).toBe('https://wa.me/436641234567?text=x');
    expect(whatsappLink('+49 151 2345678', 'x')).toBe('https://wa.me/491512345678?text=x');
    expect(whatsappLink('123', 'x')).toBeNull();
    expect(whatsappLink('', 'x')).toBeNull();
  });
});

describe('status in the overview', () => {
  it('derives expired, editing and taken over', () => {
    expect(derivePreEntryStatus(row(), NOW)).toBe('contacted');
    expect(derivePreEntryStatus(row({ expiresAtMs: NOW }), NOW)).toBe('expired');
    expect(derivePreEntryStatus(row({ status: 'draft' }), NOW)).toBe('draft');
    expect(derivePreEntryStatus(row({ status: 'published', expiresAtMs: 0 }), NOW)).toBe(
      'published'
    );
    const claimed = row({ status: 'claimed' });
    expect(derivePreEntryStatus(claimed, NOW)).toBe('editing');
    expect(derivePreEntryStatus({ ...claimed, event: { status: 'approved' } }, NOW)).toBe(
      'claimed'
    );
  });

  it('recommends a reminder after reminderDays without a reaction', () => {
    expect(isReminderDue(row(), settings, NOW)).toBe(true);
    expect(isReminderDue(row({ lastContactAtMs: NOW - 3 * DAY_MS }), settings, NOW)).toBe(false);
    expect(isReminderDue(row({ lastReactionAtMs: NOW - DAY_MS }), settings, NOW)).toBe(false);
    expect(isReminderDue(row({ status: 'draft' }), settings, NOW)).toBe(false);
    expect(isReminderDue(row(), { reminderDays: 7 }, NOW)).toBe(false);
  });

  it('warns two days before the link expires', () => {
    expect(isExpiringSoon(row({ expiresAtMs: NOW + 2 * DAY_MS }), NOW)).toBe(true);
    expect(isExpiringSoon(row({ expiresAtMs: NOW + 3 * DAY_MS }), NOW)).toBe(false);
    expect(isExpiringSoon(row({ status: 'published', expiresAtMs: NOW + DAY_MS }), NOW)).toBe(
      false
    );
  });

  it('marks events the organizer changed after the takeover', () => {
    expect(wasEditedAfterClaim({ claimedAtMs: 1000, event: { updatedAtMs: 1000 } })).toBe(false);
    expect(wasEditedAfterClaim({ claimedAtMs: 1000, event: { updatedAtMs: 100000 } })).toBe(true);
  });
});

describe('overview filters', () => {
  const rows = [
    row({ eventId: 'a', createdBy: 'mod', createdAtMs: Date.UTC(2026, 10, 1, 9) }),
    row({
      eventId: 'b',
      createdBy: 'other',
      status: 'published',
      createdAtMs: Date.UTC(2026, 10, 10, 9),
      contact: { name: 'Yoga Haus' },
    }),
    row({
      eventId: 'c',
      createdBy: 'mod',
      status: 'published',
      event: { title: 'Kreis', ownedBySystem: false },
      createdAtMs: Date.UTC(2026, 10, 12, 9),
    }),
  ];
  const ids = (list: Row[]) => list.map((r) => r.eventId);
  const ctx = { uid: 'mod', now: NOW, settings };

  it('filters by status, moderator, "nur meine", "Noch bei Dein Tribe", period and text', () => {
    expect(ids(filterRows(rows, { status: 'published' }, ctx))).toEqual(['b', 'c']);
    expect(ids(filterRows(rows, { moderator: 'other' }, ctx))).toEqual(['b']);
    expect(ids(filterRows(rows, { mine: true }, ctx))).toEqual(['a', 'c']);
    expect(ids(filterRows(rows, { stillWithSystem: true }, ctx))).toEqual(['b']);
    expect(ids(filterRows(rows, { from: '2026-11-05', to: '2026-11-11' }, ctx))).toEqual(['b']);
    expect(ids(filterRows(rows, { search: 'yoga' }, ctx))).toEqual(['b']);
    expect(ids(filterRows(rows, { reminderOnly: true }, ctx))).toEqual(['a']);
  });

  it('sorts newest first by default, or by the link expiry', () => {
    expect(ids(sortRows(rows, 'created', NOW))).toEqual(['c', 'b', 'a']);
    const exp = [row({ eventId: 'x', expiresAtMs: 5 }), row({ eventId: 'y', expiresAtMs: 2 })];
    expect(ids(sortRows(exp, 'expires', NOW))).toEqual(['y', 'x']);
  });
});

describe('preview banner', () => {
  it('counts down and gets urgent from two days on', () => {
    const calm = previewBanner(NOW + 5 * DAY_MS, NOW)!;
    expect(calm.urgent).toBe(false);
    expect(calm.text).toMatch(
      /^Diese Vorschau ist noch 5 Tage gültig \(bis \d{2}\.\d{2}\.\)\. Danach wird der Entwurf gelöscht\.$/
    );
    expect(previewBanner(NOW + 2 * DAY_MS, NOW)!.urgent).toBe(true);
    expect(previewBanner(NOW + DAY_MS - 1, NOW)!.text).toContain('noch 1 Tag gültig');
    expect(previewBanner(NOW - 1, NOW)).toMatchObject({ expired: true });
  });

  it('renders highlighted when little time is left', () => {
    const { rerender } = render(<PreEntryBanner expiresAtMs={NOW + 6 * DAY_MS} now={NOW} />);
    expect(screen.getByTestId('pre-entry-banner')).toHaveAttribute('data-urgent', 'false');
    expect(screen.getByTestId('pre-entry-banner')).toHaveTextContent('noch 6 Tage');
    rerender(<PreEntryBanner expiresAtMs={NOW + DAY_MS} now={NOW} />);
    expect(screen.getByTestId('pre-entry-banner')).toHaveAttribute('data-urgent', 'true');
    expect(screen.getByTestId('pre-entry-banner')).toHaveClass('pre-entry-banner--urgent');
  });
});

describe('analytics', () => {
  it('never sends the token of a preview link', () => {
    expect(redactSecretPath('/vorschau/abcDEF_123')).toBe('/vorschau');
    expect(redactSecretPath('/event/x')).toBe('/event/x');
  });
});

describe('settings doc', () => {
  it('stores only changed templates and valid whole numbers', () => {
    const form = {
      ...parsePreEntrySettings({ mode: 'all' }),
      validDays: '21',
      reminderDays: 99,
      autoDeleteDays: '0',
    };
    form.templates = {
      ...form.templates,
      reminder: { ...form.templates.reminder, text: 'Hallo {ansprechperson}!' },
    };
    expect(buildPreEntrySettingsDoc(form)).toEqual({
      mode: 'all',
      validDays: 21,
      reminderDays: 4,
      autoDeleteDays: 0,
      templates: {
        reminder: { subject: DEFAULT_TEMPLATES.reminder.subject, text: 'Hallo {ansprechperson}!' },
      },
    });
    expect(buildPreEntrySettingsDoc({ mode: 'x' }).mode).toBe('off');
  });
});
