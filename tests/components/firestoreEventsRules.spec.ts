import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const RULES_PATH = resolve(__dirname, '../../firestore.rules');

function readFirestoreRules(): string {
  return readFileSync(RULES_PATH, 'utf8');
}

function extractEventsCreateBlock(rules: string): string | null {
  const block = rules.split(/match \/events\/\{eventId\}/)[1] ?? '';
  const split = block.split(/allow update:/)[0] ?? '';
  const allowCreate = split.match(/allow create:[\s\S]*?;/);
  return allowCreate ? allowCreate[0] : null;
}

describe('Firestore events rules (hGxrS6gp)', () => {
  it('matches the /events/{eventId} collection', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/match \/events\/\{eventId\}/);
  });

  it('requires every new event to start as pending or draft', () => {
    const rules = readFirestoreRules();
    const allowCreate = extractEventsCreateBlock(rules);
    expect(allowCreate, 'expected to find events allow create block').toBeTruthy();
    expect(allowCreate!).toMatch(/status.*in.*\['pending',\s*'draft'\]/);
  });

  it('applies the pending/draft restriction to admins as well', () => {
    const rules = readFirestoreRules();
    const allowCreate = extractEventsCreateBlock(rules);
    expect(allowCreate, 'expected to find events allow create block').toBeTruthy();

    const roleCheckAtTopLevel = /isAdminOrEmulatorAdmin\(\)\s*\|\|\s*\(\s*isAuthenticated/.test(
      allowCreate!
    );
    expect(roleCheckAtTopLevel).toBe(true);

    const statusCheckApplies = /status in \['pending', 'draft'\]/.test(allowCreate!);
    expect(statusCheckApplies).toBe(true);

    const roleLine = allowCreate!.match(/isAdminOrEmulatorAdmin[\s\S]*?;/);
    const statusLine = allowCreate!.match(/status in \['pending', 'draft'\]/);
    expect(roleLine).toBeTruthy();
    expect(statusLine).toBeTruthy();
    expect((statusLine!.index ?? 0) > (roleLine!.index ?? 0)).toBe(true);
  });
});
