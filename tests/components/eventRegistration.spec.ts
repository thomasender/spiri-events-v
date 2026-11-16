import { describe, it, expect, beforeEach } from 'vitest';
import {
  PENDING_REGISTRATION_KEY,
  canRegisterForEvent,
  clearPendingRegistration,
  contactType,
  readPendingRegistration,
  registrationErrorMessage,
  savePendingRegistration,
  validateRegistrationForm,
} from '../../src/lib/eventRegistration';

describe('contactType', () => {
  it('accepts e-mail addresses and phone numbers', () => {
    expect(contactType('anna@example.com')).toBe('email');
    expect(contactType(' +43 664 1234567 ')).toBe('phone');
    expect(contactType('0664/123 45 67')).toBe('phone');
  });

  it('rejects everything else', () => {
    expect(contactType('')).toBeNull();
    expect(contactType('anna@')).toBeNull();
    expect(contactType('12345')).toBeNull();
    expect(contactType('ruf mich an')).toBeNull();
    expect(contactType('1234567890123456')).toBeNull();
  });
});

describe('validateRegistrationForm', () => {
  it('passes with a name and either contact', () => {
    expect(validateRegistrationForm({ name: 'Anna', contact: 'anna@example.com' })).toEqual({});
    expect(validateRegistrationForm({ name: 'Anna', contact: '+43 664 1234567' })).toEqual({});
  });

  it('asks for a name and a contact', () => {
    const errors = validateRegistrationForm({ name: ' ', contact: '' });
    expect(errors.name).toBe('Bitte gib deinen Namen an.');
    expect(errors.contact).toBe('Bitte gib deine E-Mail-Adresse oder Telefonnummer an.');
    expect(validateRegistrationForm({ name: 'Anna', contact: 'abc' }).contact).toMatch(/gültige/);
  });
});

describe('canRegisterForEvent', () => {
  const event = { id: 'e1', status: 'approved', date: '2026-11-20', recurrence: 'none' };

  it('is open for published, upcoming events', () => {
    expect(canRegisterForEvent(event, '2026-11-16')).toBe(true);
    expect(canRegisterForEvent(event, '2026-11-20')).toBe(true);
  });

  it('is closed for drafts, cancelled and past events', () => {
    expect(canRegisterForEvent({ ...event, status: 'pending' }, '2026-11-16')).toBe(false);
    expect(canRegisterForEvent({ ...event, cancelled: true }, '2026-11-16')).toBe(false);
    expect(canRegisterForEvent(event, '2026-11-21')).toBe(false);
    expect(canRegisterForEvent(null, '2026-11-16')).toBe(false);
  });
});

describe('pending guest registration', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips through sessionStorage', () => {
    savePendingRegistration({ eventId: 'e1', eventTitle: 'Yoga', name: 'Ben', email: 'b@x.at' });
    expect(readPendingRegistration()).toEqual({
      eventId: 'e1',
      eventTitle: 'Yoga',
      name: 'Ben',
      email: 'b@x.at',
    });
    clearPendingRegistration();
    expect(readPendingRegistration()).toBeNull();
  });

  it('ignores broken or incomplete entries', () => {
    sessionStorage.setItem(PENDING_REGISTRATION_KEY, '{not json');
    expect(readPendingRegistration()).toBeNull();
    sessionStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify({ name: 'Ben' }));
    expect(readPendingRegistration()).toBeNull();
  });
});

describe('registrationErrorMessage', () => {
  it('explains the callable error codes in German', () => {
    expect(registrationErrorMessage({ code: 'functions/failed-precondition' })).toMatch(
      /keine Anmeldung/
    );
    expect(registrationErrorMessage({ code: 'functions/invalid-argument' })).toMatch(/überprüfe/);
    expect(registrationErrorMessage(new Error('x'))).toMatch(/nicht gesendet/);
  });
});
