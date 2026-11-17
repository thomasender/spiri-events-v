import { describe, it, expect } from 'vitest';
import {
  classifyContact,
  confirmationMarkerId,
  pickOrganizerEmail,
  registrationClosedReason,
  shouldPurgeRegistrations,
  validateEventRegistration,
} from '../../functions/src/eventRegistrationLogic';
import {
  buildEventRegistrationConfirmationPayload,
  buildEventRegistrationOrganizerPayload,
} from '../../functions/src/emailTemplates';
import { renderEmail } from '../../functions/src/sendVerificationEmail';

describe('validateEventRegistration', () => {
  it('normalises a valid registration', () => {
    expect(
      validateEventRegistration({
        eventId: 'e1',
        name: '  Anna   Muster ',
        contact: ' Anna@Example.com ',
        occurrenceDate: '2026-12-01',
      })
    ).toEqual({
      eventId: 'e1',
      name: 'Anna Muster',
      contact: 'anna@example.com',
      contactType: 'email',
      occurrenceDate: '2026-12-01',
    });
  });

  it('accepts a phone number and drops a malformed date', () => {
    const input = validateEventRegistration({
      eventId: 'e1',
      name: 'Ben',
      contact: '+43  664 1234567',
      occurrenceDate: 'morgen',
    });
    expect(input.contactType).toBe('phone');
    expect(input.contact).toBe('+43 664 1234567');
    expect(input.occurrenceDate).toBeNull();
  });

  it('rejects missing fields, bad contacts, paths and the honeypot', () => {
    const base = { eventId: 'e1', name: 'Anna', contact: 'anna@example.com' };
    expect(() => validateEventRegistration({ ...base, name: 'A' })).toThrow(/name/);
    expect(() => validateEventRegistration({ ...base, contact: 'abc' })).toThrow(/email/);
    expect(() => validateEventRegistration({ ...base, eventId: 'a/b' })).toThrow(/event/);
    expect(() => validateEventRegistration({ ...base, website: 'spam' })).toThrow();
    expect(() => validateEventRegistration(null)).toThrow();
  });

  it('classifies contacts like the client does', () => {
    expect(classifyContact('12345')).toBeNull();
    expect(classifyContact('0664/123 45 67')?.contactType).toBe('phone');
  });
});

describe('registrationClosedReason', () => {
  const event = { status: 'approved', date: '2026-11-20', recurrence: 'none' };
  it('is open for a published upcoming event', () => {
    expect(registrationClosedReason(event, '2026-11-16')).toBeNull();
  });
  it('names why registration is closed', () => {
    expect(registrationClosedReason(null, '2026-11-16')).toBe('not_found');
    expect(registrationClosedReason({ ...event, status: 'pending' }, '2026-11-16')).toBe(
      'not_approved'
    );
    expect(registrationClosedReason({ ...event, cancelled: true }, '2026-11-16')).toBe('cancelled');
    expect(registrationClosedReason(event, '2026-11-21')).toBe('past');
  });
});

describe('pickOrganizerEmail', () => {
  it('prefers the account, then the organizer e-mail, then the Kontakt field', () => {
    expect(
      pickOrganizerEmail({ accountEmail: 'acc@x.at', organizerEmail: 'org@x.at', kontakt: '' })
    ).toBe('acc@x.at');
    expect(pickOrganizerEmail({ accountEmail: null, organizerEmail: 'org@x.at' })).toBe('org@x.at');
    expect(pickOrganizerEmail({ kontakt: 'Tel 0664 123, mail: info@studio.at' })).toBe(
      'info@studio.at'
    );
    expect(pickOrganizerEmail({ kontakt: '0664 1234567' })).toBeNull();
  });
});

describe('confirmationMarkerId', () => {
  it('is the same for one address regardless of case and never contains it', () => {
    const id = confirmationMarkerId('Anna@Example.com');
    expect(id).toBe(confirmationMarkerId(' anna@example.com'));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('anna');
  });
});

describe('shouldPurgeRegistrations', () => {
  it('purges once the last date has passed', () => {
    const event = { date: '2026-11-20', endDate: '2026-11-22', recurrence: 'none' };
    expect(shouldPurgeRegistrations(event, '2026-11-22')).toBe(false);
    expect(shouldPurgeRegistrations(event, '2026-11-23')).toBe(true);
    expect(shouldPurgeRegistrations({}, '2026-11-23')).toBe(false);
  });
});

describe('registration mails (payload only, nothing is sent)', () => {
  it('tells the organizer who registered and how to reach them', () => {
    const payload = buildEventRegistrationOrganizerPayload({
      recipient: 'org@x.at',
      recipientName: 'Olga',
      event: { title: 'Klangreise <live>', slug: 'klangreise', time: '19:30' },
      attendeeName: 'Anna',
      contact: '+43 664 1234567',
      contactType: 'phone',
      occurrenceDate: '2026-11-21',
      now: new Date('2026-11-17T11:00:00Z'),
    });
    expect(payload.to).toBe('org@x.at');
    expect(payload.subject).toBe('Neue Anmeldung: Klangreise <live>');
    expect(payload.text).toContain('Name: Anna');
    expect(payload.text).toContain('Telefon: +43 664 1234567');
    expect(payload.text).toContain('diese Woche am Samstagabend um 19:30 Uhr');
    expect(payload.html).toContain('<strong>diese Woche am Samstagabend um 19:30 Uhr</strong>');
    expect(payload.text).toContain('https://www.thetribe.at/event/klangreise');
    expect(payload.html).toContain('Klangreise &lt;live&gt;');
    expect(payload.html).toContain('href="tel:+436641234567"');
    expect(payload.text).not.toContain('Benachrichtigungseinstellungen');
  });

  it('confirms the registration to the guest', () => {
    const payload = buildEventRegistrationConfirmationPayload({
      recipient: 'anna@example.com',
      attendeeName: 'Anna',
      event: { title: 'Klangreise', slug: 'klangreise' },
    });
    expect(payload.to).toBe('anna@example.com');
    expect(payload.subject).toBe('Deine Anmeldung: Klangreise');
    expect(payload.text).toContain('Hallo Anna,');
    expect(payload.text).toContain('Pro Event schicken wir dir nur eine Bestätigung.');
  });

  it('names the chosen date colloquially in the guest confirmation, only the day without a time', () => {
    const now = new Date('2026-11-17T11:00:00Z');
    const base = { recipient: 'anna@example.com', attendeeName: 'Anna', now };
    const withTime = buildEventRegistrationConfirmationPayload({
      ...base,
      event: { title: 'Klangreise', slug: 'klangreise', time: '19:30' },
      occurrenceDate: '2026-11-17',
    });
    expect(withTime.text).toContain('zu „Klangreise“ heute Dienstagabend um 19:30 Uhr.');
    expect(withTime.html).toContain('<strong>heute Dienstagabend um 19:30 Uhr</strong>');
    const dayOnly = buildEventRegistrationConfirmationPayload({
      ...base,
      event: { title: 'Klangreise', slug: 'klangreise' },
      occurrenceDate: '2026-11-24',
    });
    expect(dayOnly.text).toContain('zu „Klangreise“ am Dienstag, 24. November.');
  });

  it('names the event in the account confirmation mail only when given', () => {
    const base = { displayName: 'Ben', buttonUrl: 'https://www.thetribe.at/x', appName: 'Tribe' };
    expect(renderEmail(base).text).not.toContain('Anmeldung');
    const withEvent = renderEmail({ ...base, eventTitle: 'Klangreise' });
    expect(withEvent.text).toContain('Deine Anmeldung für „Klangreise“');
    expect(withEvent.html).toContain('<strong>Klangreise</strong>');
  });
});
