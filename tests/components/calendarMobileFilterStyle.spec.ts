import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// jsdom applies no CSS, so the mobile "Alle"/region-name/"Keine" buttons next to
// "Bezirk" / "Landkreis" can only be pinned in the stylesheet: the phone media
// query hides every `.filter-quick-actions` and must hand them back inside the
// "Mehr Filter" accordion.
const css = fs
  .readFileSync(path.join(__dirname, '../../src/pages/CalendarPage.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('CalendarPage mobile filter styles', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));

  it('shows the quick actions of the Bezirk filter on phones', () => {
    expect(mobile).toMatch(
      /\.filter-accordion-body \.filter-header \.filter-quick-actions\s*\{[^}]*display:\s*flex/
    );
  });

  it('snaps the chip rows to the padding edge so the first chip stays aligned', () => {
    expect(mobile).toMatch(/scroll-padding-inline:\s*var\(--space-2\)/);
  });
});
