import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// For users with an unverified e-mail the header's "Event erstellen" is a
// <button class="nav-link nav-link--disabled nav-link--create">.
// `.nav-link--disabled` (EmailVerificationBanner.css) sets a transparent
// background with the same specificity as `.nav-link--create` and loads
// later, so without a combined rule the orange call to action turns white.

const css = fs
  .readFileSync(path.join(__dirname, '../../src/components/Header.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsFor(selector: string): string {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  return rules
    .filter(([, selectors]) =>
      selectors
        .split(',')
        .map((s) => s.trim())
        .includes(selector)
    )
    .map(([, , body]) => body)
    .join(';');
}

describe('header "Event erstellen" while e-mail is unverified', () => {
  it('keeps the orange background on the locked button', () => {
    const body = declarationsFor('.nav-link--create.nav-link--disabled');
    expect(body).toMatch(/background(-color)?:\s*var\(--accent-primary\)/);
    expect(body).toMatch(/color:\s*#fff/);
  });
});
