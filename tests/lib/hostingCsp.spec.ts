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
