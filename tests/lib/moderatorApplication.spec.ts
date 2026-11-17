// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MESSAGE_MAX,
  PHOTO_MAX_BYTES,
  buildModeratorApplicationEmail,
  sniffImageType,
  storeModeratorApplication,
  validateModeratorApplication,
  type ApplicationDeps,
} from '../../functions/src/moderatorApplication';
import { sendMailgunMessage } from '../../functions/src/mailgun';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

const valid = {
  name: 'Maria Muster',
  email: 'Maria@Example.at',
  message: 'Ich lebe seit Jahren in Tirol und kenne viele Veranstalter:innen.',
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return null;
};

describe('validateModeratorApplication', () => {
  it('accepts a minimal application and normalises it', () => {
    expect(validateModeratorApplication({ ...valid, name: '  Maria Muster ' })).toEqual({
      name: 'Maria Muster',
      email: 'maria@example.at',
      message: valid.message,
      regionId: null,
      photo: null,
    });
  });

  it('keeps a known region and rejects an unknown one', () => {
    expect(validateModeratorApplication({ ...valid, regionId: 'tirol' }).regionId).toBe('tirol');
    expect(code(() => validateModeratorApplication({ ...valid, regionId: 'mars' }))).toBe(
      'invalid-argument'
    );
  });

  it('rejects missing or invalid name, e-mail and message', () => {
    for (const bad of [
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(81) },
      { ...valid, email: 'nope' },
      { ...valid, message: 'zu kurz' },
      { ...valid, message: 'x'.repeat(MESSAGE_MAX + 1) },
      null,
      'text',
    ]) {
      expect(code(() => validateModeratorApplication(bad))).toBe('invalid-argument');
    }
  });

  it('rejects the honeypot field when it is filled in', () => {
    expect(code(() => validateModeratorApplication({ ...valid, website: 'http://spam' }))).toBe(
      'invalid-argument'
    );
    expect(validateModeratorApplication({ ...valid, website: '' }).name).toBe('Maria Muster');
  });

  it('accepts JPEG, PNG and WebP photos by their bytes, not by a declared type', () => {
    for (const [bytes, type, ext] of [
      [JPEG, 'image/jpeg', 'jpg'],
      [PNG, 'image/png', 'png'],
      [WEBP, 'image/webp', 'webp'],
    ] as const) {
      const app = validateModeratorApplication({
        ...valid,
        photoBase64: bytes.toString('base64'),
        photoMimeType: 'text/html',
      });
      expect(app.photo).toMatchObject({ contentType: type, filename: `bewerbung.${ext}` });
    }
  });

  it('rejects non-images, oversized photos and non-string photo data', () => {
    const html = Buffer.from('<script>alert(1)</script>').toString('base64');
    expect(code(() => validateModeratorApplication({ ...valid, photoBase64: html }))).toBe(
      'invalid-argument'
    );
    const big = Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES)]).toString('base64');
    expect(code(() => validateModeratorApplication({ ...valid, photoBase64: big }))).toBe(
      'invalid-argument'
    );
    expect(code(() => validateModeratorApplication({ ...valid, photoBase64: 5 }))).toBe(
      'invalid-argument'
    );
  });

  it('sniffImageType knows the three formats and nothing else', () => {
    expect(sniffImageType(JPEG)?.contentType).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('buildModeratorApplicationEmail', () => {
  it('names person, region and photo', () => {
    const app = validateModeratorApplication({
      ...valid,
      regionId: 'innerschweiz',
      photoBase64: JPEG.toString('base64'),
    });
    const { subject, text, html } = buildModeratorApplicationEmail(app);
    expect(subject).toBe('Bewerbung als Moderator:in: Maria Muster (Innerschweiz)');
    expect(text).toContain('Antwort an: maria@example.at');
    expect(text).toContain('Foto: siehe Anhang');
    expect(html).toContain('src="cid:bewerbung.jpg"');
  });

  it('escapes user input in the HTML', () => {
    const app = validateModeratorApplication({
      ...valid,
      name: 'Eve <script>x</script>',
      message: 'Hallo <img src=x onerror=alert(1)> und mehr Text damit es lang genug ist',
    });
    const { html } = buildModeratorApplicationEmail(app);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;script&#62;');
  });

  it('works without region and photo', () => {
    const { subject, text, html } = buildModeratorApplicationEmail(
      validateModeratorApplication(valid)
    );
    expect(subject).toContain('keine bestimmte Region');
    expect(text).toContain('Foto: keines');
    expect(html).not.toContain('cid:');
  });
});

describe('storeModeratorApplication (6afc59ed)', () => {
  function world({ mailFails = false } = {}) {
    const saved: Array<{ id: string; app: unknown; notes: Array<{ recipientUid: string }> }> = [];
    const mails: Array<{ to: string; replyTo: string; inlineImages: unknown[] }> = [];
    const deps: ApplicationDeps = {
      loadStaffDocs: async () => [
        { uid: 'boss', data: { role: 'Admin' } },
        { uid: 'tiMod', data: { role: 'RegionModerator', regionIds: ['tirol'] } },
        { uid: 'vbgMod', data: { role: 'RegionModerator', regionIds: ['vorarlberg'] } },
      ],
      newApplicationId: () => 'app1',
      saveApplication: async (id, app, notes) => {
        saved.push({ id, app, notes });
      },
      getSuperAdminEmails: async () => ['boss@tribe.at'],
      sendMail: async (mail) => {
        if (mailFails) throw new Error('mailgun down');
        mails.push(mail);
      },
    };
    return { deps, saved, mails };
  }

  it('stores the application, notes the region team and mails only the Super-Admins', async () => {
    const w = world();
    const app = validateModeratorApplication({
      ...valid,
      regionId: 'tirol',
      photoBase64: JPEG.toString('base64'),
    });
    expect(await storeModeratorApplication(app, w.deps)).toEqual({
      applicationId: 'app1',
      mailed: 1,
    });
    expect(w.saved[0].app).toEqual({
      name: 'Maria Muster',
      email: 'maria@example.at',
      message: valid.message,
      regionId: 'tirol',
      hasPhoto: true,
    });
    expect(w.saved[0].notes.map((n) => n.recipientUid)).toEqual(['boss', 'tiMod']);
    // admin@thetribe.at is no longer a recipient; the photo stays a mail attachment.
    expect(w.mails.map((m) => m.to)).toEqual(['boss@tribe.at']);
    expect(w.mails[0].replyTo).toBe('maria@example.at');
    expect(w.mails[0].inlineImages).toHaveLength(1);
  });

  it('keeps the application when the mail fails', async () => {
    const w = world({ mailFails: true });
    const result = await storeModeratorApplication(validateModeratorApplication(valid), w.deps);
    expect(result.mailed).toBe(0);
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0].notes.map((n) => n.recipientUid)).toEqual(['boss']);
  });
});

describe('sendMailgunMessage with inline images', () => {
  afterEach(() => vi.unstubAllGlobals());

  const input = {
    apiKey: 'k',
    domain: 'mg.example.at',
    from: 'Tribe <noreply@mg.example.at>',
    to: 'admin@thetribe.at',
    subject: 'S',
    text: 'T',
    html: '<p>H</p>',
    replyTo: 'maria@example.at',
  };
  const okResponse = () =>
    new Response(JSON.stringify({ id: '<1@mg>', message: 'Queued' }), { status: 200 });

  it('sends multipart with the image when there is one', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await sendMailgunMessage('https://api.eu.mailgun.net/v3', {
      ...input,
      inlineImages: [{ filename: 'bewerbung.jpg', contentType: 'image/jpeg', data: JPEG }],
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('to')).toBe('admin@thetribe.at');
    expect(form.get('h:Reply-To')).toBe('maria@example.at');
    expect((form.get('inline') as File).name).toBe('bewerbung.jpg');
    // multipart: the runtime sets the Content-Type with its boundary itself
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('keeps the urlencoded body without images (unchanged behaviour)', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await sendMailgunMessage('https://api.eu.mailgun.net/v3', input);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(typeof init.body).toBe('string');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });
});
