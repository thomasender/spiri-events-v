import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from '../../src/config/brand.js';

// The platform is called "Dein Tribe" (or just "Tribe"); the old name "The Tribe"
// must not come back into anything users read: pages, legal texts, mails,
// Instagram captions and images, prerendered HTML.
const ROOT = resolve(__dirname, '../..');
const SCAN = ['src', 'functions/src', 'scripts', 'public', 'index.html'];
const EXTENSIONS = /\.(jsx?|tsx?|mjs|cjs|html|txt|json|md)$/;

// Comments that quote the old name on purpose.
const ALLOWLIST = new Set(['src/utils/moderatorOnboardingText.js']);

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) =>
    name === 'node_modules' || name === 'data' ? [] : files(join(path, name))
  );
}

const sources = SCAN.flatMap(files)
  .filter((f) => EXTENSIONS.test(f))
  .map((f) => relative(ROOT, join(ROOT, f)));

describe('brand name', () => {
  it('is "Dein Tribe"', () => {
    expect(BRAND_NAME).toBe('Dein Tribe');
  });

  it('no user-facing source still says "The Tribe"', () => {
    expect(sources.length).toBeGreaterThan(100);
    const hits = sources
      .filter((f) => !ALLOWLIST.has(f))
      .filter((f) => /\bThe Tribe\b/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('Instagram texts and images show the new domain, not thetribe.at', () => {
    const dir = 'functions/src/instagram';
    const hits = files(dir).filter((f) => {
      const text = readFileSync(join(ROOT, f), 'utf8');
      // Display text only: "thetribe.at" not part of a URL (https://…) or mail address, or the old hashtag.
      return /(?<![/@.])(www\.)?thetribe\.at|#thetribe/.test(text);
    });
    expect(hits).toEqual([]);
  });
});
