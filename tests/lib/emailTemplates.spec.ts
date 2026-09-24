import { describe, it, expect } from 'vitest';
import {
  buildEmailPayload,
  buildSubmittedPayload,
  buildChangesRequestedPayload,
  buildPublishedPayload,
  buildPublishedShareUrls,
  buildDeletedPayload,
  buildPasswordResetPayload,
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
    expect(payload.html).toContain(`${APP_BASE_URL}/admin?tab=review#evt1`);
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

function byChannelUrl(channel, url, title) {
  const encodedUrl = encodeURIComponent(url);
  if (channel === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  if (channel === 'whatsapp') return `https://wa.me/?text=${encodedUrl}`;
  if (channel === 'telegram')
    return `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}`;
  throw new Error(`unknown channel ${channel}`);
}

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

  it('includes a "share" section that encourages the owner to spread the event', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    expect(payload.html).toContain('Hilf mit, dein Event zu verbreiten');
    expect(payload.text).toContain('Hilf mit, dein Event zu verbreiten');
  });

  it('renders share buttons for Facebook, WhatsApp and Telegram in the HTML', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    expect(payload.html).toContain('Über Facebook teilen');
    expect(payload.html).toContain('Über WhatsApp teilen');
    expect(payload.html).toContain('Über Telegram teilen');
  });

  it('builds correctly encoded share URLs for each channel', () => {
    const shareLinks = buildPublishedShareUrls(baseEvent);
    const byChannel = Object.fromEntries(shareLinks.map((entry) => [entry.channelId, entry.url]));
    const expectedUrl = `${APP_BASE_URL}/event/konzert-im-dom`;
    expect(byChannel.facebook).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(expectedUrl)}`
    );
    expect(byChannel.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(expectedUrl)}`);
    expect(byChannel.telegram).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(expectedUrl)}&text=${encodeURIComponent(baseEvent.title)}`
    );
  });

  it('embeds each share URL in the HTML body', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    const expectedUrl = `${APP_BASE_URL}/event/konzert-im-dom`;
    expect(payload.html).toContain(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(expectedUrl)}`
    );
    expect(payload.html).toContain(`https://wa.me/?text=${encodeURIComponent(expectedUrl)}`);
    expect(payload.html).toContain(
      `https://t.me/share/url?url=${encodeURIComponent(expectedUrl)}&text=${encodeURIComponent(baseEvent.title)}`
    );
  });

  it('lists each share URL in the plain text body', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    const expectedUrl = `${APP_BASE_URL}/event/konzert-im-dom`;
    expect(payload.text).toContain(`Facebook: ${byChannelUrl('facebook', expectedUrl)}`);
    expect(payload.text).toContain(`WhatsApp: ${byChannelUrl('whatsapp', expectedUrl)}`);
    expect(payload.text).toContain(
      `Telegram: ${byChannelUrl('telegram', expectedUrl, baseEvent.title)}`
    );
  });

  it('shows the direct event URL prominently so it can be copied or forwarded', () => {
    const payload = buildPublishedPayload({ event: baseEvent, recipient: 'maria@example.com' });
    const expectedUrl = `${APP_BASE_URL}/event/konzert-im-dom`;
    expect(payload.html).toContain('Direkter Link zum Event');
    expect(payload.html).toContain(`href="${expectedUrl}"`);
    expect(payload.html).toContain(`>${expectedUrl}</a>`);
    expect(payload.text).toContain(`Direkter Link zum Event: ${expectedUrl}`);
  });

  it('escapes the event title when it contains HTML in the share CTA copy', () => {
    const payload = buildPublishedPayload({
      event: { ...baseEvent, title: '<script>alert("xss")</script>' },
      recipient: 'maria@example.com',
    });
    expect(payload.html).not.toContain('<script>alert("xss")</script>');
    expect(payload.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('still renders the share section when the event has no slug (falls back to the home URL)', () => {
    const payload = buildPublishedPayload({
      event: { ...baseEvent, slug: null },
      recipient: 'maria@example.com',
    });
    const fallbackUrl = `${APP_BASE_URL}/`;
    expect(payload.html).toContain('Direkter Link zum Event');
    expect(payload.html).toContain(`href="${fallbackUrl}"`);
    expect(payload.html).toContain(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fallbackUrl)}`
    );
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

describe('buildPasswordResetPayload', () => {
  const buttonUrl = `${APP_BASE_URL}/auth-action?mode=resetPassword&oobCode=abc123`;

  it('uses a German subject and the recipient address', () => {
    const payload = buildPasswordResetPayload({
      recipient: 'peter@example.com',
      buttonUrl,
    });
    expect(payload.subject).toBe('Passwort zurücksetzen für tribe Vorarlberg');
    expect(payload.to).toBe('peter@example.com');
  });

  it('includes the branded reset link in both the button and the fallback copy', () => {
    const payload = buildPasswordResetPayload({
      recipient: 'peter@example.com',
      buttonUrl,
    });
    const escapedUrl = buttonUrl.replace(/&/g, '&amp;');
    expect(payload.html).toContain(`href="${escapedUrl}"`);
    expect(payload.html).toContain('Neues Passwort vergeben');
    expect(payload.html).toContain('Direkter Link, falls der Button nicht funktioniert');
    expect(payload.text).toContain(buttonUrl);
  });

  it('uses the auth footer (no notification-settings link) and still shows the support address', () => {
    const payload = buildPasswordResetPayload({
      recipient: 'peter@example.com',
      buttonUrl,
    });
    expect(payload.html).toContain('admin@thetribe.at');
    expect(payload.text).toContain('admin@thetribe.at');
    expect(payload.html).not.toContain('Benachrichtigungseinstellungen anpassen');
    expect(payload.text).not.toContain('Benachrichtigungseinstellungen anpassen');
    expect(payload.html).not.toContain('Event eingereicht');
    expect(payload.text).not.toContain('Event eingereicht');
  });

  it('matches the brand identity (fonts, logo, primary button color)', () => {
    const payload = buildPasswordResetPayload({
      recipient: 'peter@example.com',
      buttonUrl,
    });
    expect(payload.html).toContain(`${APP_BASE_URL}/logo-mark.svg`);
    expect(payload.html).toContain("'Nunito Sans'");
    expect(payload.html).toContain("'Cormorant Garamond'");
    expect(payload.html).toContain('background:#c48e6a');
  });

  it('escapes HTML in the buttonUrl so a tampered link cannot inject markup', () => {
    const evilUrl = `${APP_BASE_URL}/auth-action?mode=resetPassword&oobCode=<script>x</script>`;
    const payload = buildPasswordResetPayload({
      recipient: 'peter@example.com',
      buttonUrl: evilUrl,
    });
    expect(payload.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(payload.html).not.toMatch(/href="[^"]*<script/);
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
      expect(p.html).toContain('admin@thetribe.at');
      expect(p.text).toContain('admin@thetribe.at');
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

describe('email brand identity', () => {
  const event = {
    id: 'evt-brand',
    title: 'Markentreue',
    slug: 'markentreue',
    organizer: {
      firstName: 'Anna',
      lastName: 'Müller',
      email: 'anna@example.com',
      photoURL: null,
    },
  };

  const allPayloads = () => [
    buildEmailPayload('submitted', {
      event,
      recipient: 'a@x.com',
      context: { submitterName: 'Anna' },
    }),
    buildEmailPayload('changes_requested', {
      event,
      recipient: 'a@x.com',
      context: { messageId: 'm', authorName: 'A', text: 'Bitte anpassen.' },
    }),
    buildEmailPayload('published', { event, recipient: 'a@x.com' }),
    buildEmailPayload('deleted', { event, recipient: 'a@x.com' }),
  ];

  it('uses Nunito Sans as the body font and Cormorant Garamond as the heading font', () => {
    for (const p of allPayloads()) {
      expect(p.html).toContain("'Nunito Sans'");
      expect(p.html).toContain("'Cormorant Garamond'");
      expect(p.html).not.toMatch(/font-family:\s*Inter/);
    }
  });

  it('loads the brand fonts via Google Fonts so email clients render the right typography', () => {
    for (const p of allPayloads()) {
      expect(p.html).toContain('https://fonts.googleapis.com/css2?family=Cormorant+Garamond');
      expect(p.html).toContain('family=Nunito+Sans');
    }
  });

  it('uses the terracotta accent (#c48e6a) for the primary action buttons', () => {
    const payloadsWithButtons = [
      buildEmailPayload('submitted', {
        event,
        recipient: 'a@x.com',
        context: { submitterName: 'Anna' },
      }),
      buildEmailPayload('changes_requested', {
        event,
        recipient: 'a@x.com',
        context: { messageId: 'm', authorName: 'A', text: 'Bitte anpassen.' },
      }),
      buildEmailPayload('published', { event, recipient: 'a@x.com' }),
    ];
    for (const p of payloadsWithButtons) {
      expect(p.html).toContain('background:#c48e6a');
      expect(p.html).toContain('color:#ffffff');
    }
  });

  it('uses the cream page background (#f4f2f0) and the warm border (#e2dcd2)', () => {
    for (const p of allPayloads()) {
      expect(p.html).toContain('background:#f4f2f0');
      expect(p.html).toContain('#e2dcd2');
    }
  });

  it('shows the tribe logo and brand name in the email header', () => {
    for (const p of allPayloads()) {
      expect(p.html).toContain(`${APP_BASE_URL}/logo-mark.svg`);
      expect(p.html).toContain('tribe Vorarlberg');
    }
  });

  it('renders the published email heading as a typography-rich h1', () => {
    const payload = buildEmailPayload('published', { event, recipient: 'a@x.com' });
    expect(payload.html).toMatch(
      /<h1[^>]*font-family:'Cormorant Garamond'[^>]*>Dein Event ist live<\/h1>/
    );
  });
});
