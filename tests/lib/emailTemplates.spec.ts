import { describe, it, expect } from 'vitest';
import {
  buildEmailPayload,
  buildSubmittedPayload,
  buildChangesRequestedPayload,
  buildPublishedPayload,
  buildDeletedPayload,
  escapeHtml,
  notificationSettingsUrl,
  APP_BASE_URL,
} from '../../functions/src/emailTemplates';

describe('escapeHtml', () => {
  it('escapes &, <, >, ", and \'', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    );
  });

  it('passes through plain text unchanged', () => {
    expect(escapeHtml('Hallo Welt')).toBe('Hallo Welt');
  });

  it('escapes embedded HTML in admin messages', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('buildSubmittedPayload', () => {
  const baseEvent = {
    id: 'evt1',
    title: 'Meditation im Park',
    slug: 'meditation-im-park',
    organizer: {
      firstName: 'Anna',
      lastName: 'Müller',
      email: 'anna@example.com',
      photoURL: null,
    },
  };

  it('produces a German subject line with the event title', () => {
    const payload = buildSubmittedPayload({
      event: baseEvent,
      context: { submitterName: 'Anna Müller' },
      recipient: 'admin@example.com',
    });
    expect(payload.subject).toBe('Neuer Event-Vorschlag: Meditation im Park');
    expect(payload.to).toBe('admin@example.com');
  });

  it('includes the admin review link with the event id anchor', () => {
    const payload = buildSubmittedPayload({
      event: baseEvent,
      context: { submitterName: 'Anna Müller' },
      recipient: 'admin@example.com',
    });
    expect(payload.html).toContain(`${APP_BASE_URL}/admin/review#evt1`);
    expect(payload.html).toContain('Im Review ansehen');
  });

  it('includes the submitter name', () => {
    const payload = buildSubmittedPayload({
      event: baseEvent,
      context: { submitterName: 'Anna Müller' },
      recipient: 'admin@example.com',
    });
    expect(payload.html).toContain('Anna Müller');
    expect(payload.text).toContain('Anna Müller');
  });

  it('falls back to "Ein Mitglied" when the submitter name is empty', () => {
    const payload = buildSubmittedPayload({
      event: baseEvent,
      context: { submitterName: '' },
      recipient: 'admin@example.com',
    });
    expect(payload.html).toContain('Ein Mitglied');
    expect(payload.text).toContain('Ein Mitglied');
  });

  it('renders both an HTML and a plain text version', () => {
    const payload = buildSubmittedPayload({
      event: baseEvent,
      context: { submitterName: 'Anna Müller' },
      recipient: 'admin@example.com',
    });
    expect(payload.html).toContain('<!doctype html>');
    expect(payload.html).toContain('<html lang="de">');
    expect(payload.text).not.toContain('<');
  });
});

describe('buildChangesRequestedPayload', () => {
  const baseEvent = {
    id: 'evt2',
    title: 'Yogaklasse',
    slug: 'yogaklasse',
    organizer: {
      firstName: 'Peter',
      lastName: 'Mathis',
      email: 'peter@example.com',
      photoURL: null,
    },
  };

  it('addresses the recipient by name when available', () => {
    const payload = buildChangesRequestedPayload({
      event: baseEvent,
      context: {
        messageId: 'msg1',
        authorName: 'Anna',
        text: 'Bitte genauer beschreiben.',
      },
      recipient: 'peter@example.com',
    });
    expect(payload.html).toContain('Hallo Peter Mathis,');
    expect(payload.text).toContain('Hallo Peter Mathis,');
  });

  it('falls back to a generic greeting when the organizer name is missing', () => {
    const payload = buildChangesRequestedPayload({
      event: { ...baseEvent, organizer: null },
      context: {
        messageId: 'msg1',
        authorName: 'Anna',
        text: 'Bitte genauer beschreiben.',
      },
      recipient: 'peter@example.com',
    });
    expect(payload.html).toContain('Hallo,');
  });

  it('inlines the admin message text and escapes HTML in it', () => {
    const payload = buildChangesRequestedPayload({
      event: baseEvent,
      context: {
        messageId: 'msg1',
        authorName: 'Anna',
        text: '<script>alert("xss")</script>',
      },
      recipient: 'peter@example.com',
    });
    expect(payload.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(payload.text).toContain('<script>alert("xss")</script>');
  });

  it('uses the public event URL and the German subject line', () => {
    const payload = buildChangesRequestedPayload({
      event: baseEvent,
      context: { messageId: 'msg1', authorName: 'Anna', text: 'Bitte anpassen.' },
      recipient: 'peter@example.com',
    });
    expect(payload.subject).toBe('Änderungen gewünscht: Yogaklasse');
    expect(payload.html).toContain(`${APP_BASE_URL}/event/yogaklasse`);
    expect(payload.html).toContain('Event bearbeiten');
  });

  it('falls back to "Das tribe-Team" when the author name is missing', () => {
    const payload = buildChangesRequestedPayload({
      event: baseEvent,
      context: { messageId: 'msg1', authorName: '', text: 'Bitte anpassen.' },
      recipient: 'peter@example.com',
    });
    expect(payload.html).toContain('Das tribe-Team');
  });
});

describe('buildPublishedPayload', () => {
  const baseEvent = {
    id: 'evt3',
    title: 'Konzert im Dom',
    slug: 'konzert-im-dom',
    organizer: {
      firstName: 'Maria',
      lastName: 'Hofer',
      email: 'maria@example.com',
      photoURL: null,
    },
  };

  it('addresses the owner by name and uses the public URL', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    expect(payload.subject).toBe('Dein Event ist live: Konzert im Dom');
    expect(payload.html).toContain('Hallo Maria Hofer,');
    expect(payload.html).toContain(`${APP_BASE_URL}/event/konzert-im-dom`);
  });

  it('falls back to a generic greeting when the organizer name is missing', () => {
    const payload = buildPublishedPayload({
      event: { ...baseEvent, organizer: null },
      recipient: 'maria@example.com',
    });
    expect(payload.html).toContain('Hallo,');
  });
});

describe('buildDeletedPayload', () => {
  const baseEvent = {
    id: 'evt4',
    title: 'Workshop Achtsamkeit',
    slug: null,
    organizer: {
      firstName: 'Lukas',
      lastName: 'Weber',
      email: 'lukas@example.com',
      photoURL: null,
    },
  };

  it('mentions the trash and uses the German subject line', () => {
    const payload = buildDeletedPayload({ event: baseEvent, recipient: 'lukas@example.com' });
    expect(payload.subject).toBe('Dein Event wurde gelöscht: Workshop Achtsamkeit');
    expect(payload.html).toContain('Papierkorb');
    expect(payload.text).toContain('Papierkorb');
  });

  it('points users to the Verwaltungs-Bereich, not the Admin-Bereich', () => {
    const payload = buildDeletedPayload({ event: baseEvent, recipient: 'lukas@example.com' });
    expect(payload.html).toContain('Verwaltungs-Bereich');
    expect(payload.text).toContain('Verwaltungs-Bereich');
    expect(payload.html).not.toContain('Admin-Bereich');
    expect(payload.text).not.toContain('Admin-Bereich');
  });

  it('falls back to a generic greeting when the organizer name is missing', () => {
    const payload = buildDeletedPayload({
      event: { ...baseEvent, organizer: null },
      recipient: 'lukas@example.com',
    });
    expect(payload.html).toContain('Hallo,');
  });
});

describe('buildEmailPayload dispatcher', () => {
  const event = {
    id: 'evt5',
    title: 'Sonstiges',
    slug: 'sonstiges',
    organizer: {
      firstName: 'Anna',
      lastName: 'Müller',
      email: 'anna@example.com',
      photoURL: null,
    },
  };

  it('dispatches each notification type to the right builder', () => {
    expect(
      buildEmailPayload('submitted', {
        event,
        recipient: 'x@example.com',
        context: { submitterName: 'Anna' },
      }).subject
    ).toMatch(/^Neuer Event-Vorschlag/);

    expect(
      buildEmailPayload('changes_requested', {
        event,
        recipient: 'x@example.com',
        context: { messageId: 'm', authorName: 'A', text: 'hi' },
      }).subject
    ).toMatch(/^Änderungen gewünscht/);

    expect(buildEmailPayload('published', { event, recipient: 'x@example.com' }).subject).toMatch(
      /^Dein Event ist live/
    );

    expect(buildEmailPayload('deleted', { event, recipient: 'x@example.com' }).subject).toMatch(
      /^Dein Event wurde gelöscht/
    );
  });
});

describe('payloads share a common footer', () => {
  const event = {
    id: 'evt6',
    title: 'Sonstiges',
    slug: 'sonstiges',
    organizer: {
      firstName: 'Anna',
      lastName: 'Müller',
      email: 'anna@example.com',
      photoURL: null,
    },
  };

  it('every payload has the support contact footer', () => {
    const payloads = [
      buildEmailPayload('submitted', {
        event,
        recipient: 'a@x.com',
        context: { submitterName: 'Anna' },
      }),
      buildEmailPayload('changes_requested', {
        event,
        recipient: 'a@x.com',
        context: { messageId: 'm', authorName: 'A', text: 'hi' },
      }),
      buildEmailPayload('published', { event, recipient: 'a@x.com' }),
      buildEmailPayload('deleted', { event, recipient: 'a@x.com' }),
    ];
    for (const p of payloads) {
      expect(p.html).toContain('events@thetribe.at');
      expect(p.text).toContain('events@thetribe.at');
    }
  });

  it('every payload links to the notification settings page', () => {
    const payloads = [
      buildEmailPayload('submitted', {
        event,
        recipient: 'a@x.com',
        context: { submitterName: 'Anna' },
      }),
      buildEmailPayload('changes_requested', {
        event,
        recipient: 'a@x.com',
        context: { messageId: 'm', authorName: 'A', text: 'hi' },
      }),
      buildEmailPayload('published', { event, recipient: 'a@x.com' }),
      buildEmailPayload('deleted', { event, recipient: 'a@x.com' }),
    ];
    const settingsUrl = notificationSettingsUrl();
    for (const p of payloads) {
      expect(p.html).toContain(settingsUrl);
      expect(p.html).toContain('Benachrichtigungseinstellungen anpassen');
      expect(p.text).toContain(settingsUrl);
      expect(p.text).toContain('Benachrichtigungseinstellungen anpassen');
    }
  });
});

describe('notificationSettingsUrl', () => {
  it('points at the profile page on the production host', () => {
    expect(notificationSettingsUrl()).toBe(`${APP_BASE_URL}/profil`);
  });
});
