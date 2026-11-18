import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync(join(__dirname, '../../firebase.json'), 'utf8'));
const csp: string = config.hosting.headers
  .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
  .find((h: { key: string }) => h.key === 'Content-Security-Policy').value;

const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))!
    .split(/\s+/)
    .slice(1);

describe('Content-Security-Policy', () => {
  it('allows the reCAPTCHA sources App Check needs', () => {
    expect(directive('script-src')).toEqual(
      expect.arrayContaining([
        'https://www.google.com/recaptcha/',
        'https://www.gstatic.com/recaptcha/',
      ])
    );
    expect(directive('frame-src')).toEqual(
      expect.arrayContaining([
        'https://www.google.com/recaptcha/',
        'https://recaptcha.google.com/recaptcha/',
      ])
    );
    expect(directive('connect-src')).toContain('https://www.google.com/recaptcha/');
  });

  it('does not open script-src to everything', () => {
    const scripts = directive('script-src');
    expect(scripts).not.toContain('*');
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts.every((s) => !/^https:\/\/\*\./.test(s))).toBe(true);
  });
});

describe('Permissions-Policy', () => {
  const policy: string = config.hosting.headers
    .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
    .find((h: { key: string }) => h.key === 'Permissions-Policy').value;
  const features = Object.fromEntries(
    policy.split(',').map((f) => f.trim().split('=') as [string, string])
  );

  it('allows geolocation for our own pages only ("Meinen Standort verwenden")', () => {
    expect(features.geolocation).toBe('(self)');
  });

  it('keeps camera, microphone and payment blocked', () => {
    expect(features.camera).toBe('()');
    expect(features.microphone).toBe('()');
    expect(features.payment).toBe('()');
  });
});

describe('private previews: event import and pre-entries (/vorschau/**)', () => {
  const rule = config.hosting.headers.find(
    (h: { source: string }) => h.source === '/vorschau/**'
  ) as { headers: { key: string; value: string }[] };
  const header = (key: string) => rule.headers.find((h) => h.key === key)?.value;

  it('is never indexed, never cached and sends no referrer', () => {
    expect(header('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(header('Cache-Control')).toBe('private, no-store');
    expect(header('Referrer-Policy')).toBe('no-referrer');
  });

  it('is not listed in the prerender / sitemap', () => {
    const prerender = readFileSync(join(__dirname, '../../scripts/prerender.mjs'), 'utf8');
    expect(prerender).not.toContain('vorschau');
    expect(prerender).not.toContain('datenschutz-import');
  });
});
