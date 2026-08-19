import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const RULES_PATH = resolve(__dirname, '../../firestore.rules');

function readFirestoreRules(): string {
  return readFileSync(RULES_PATH, 'utf8');
}

function extractFeedbackAllowlist(rules: string): string[] | null {
  const match = rules.match(
    /match \/feedback\/\{feedbackId\}\s*\{[\s\S]*?allow create:[^;]*?keys\(\)\.hasOnly\(\s*\[([^\]]+)\]/
  );
  if (!match) return null;
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

describe('Firestore feedback rules', () => {
  it('matches the /feedback/{feedbackId} collection', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/match \/feedback\/\{feedbackId\}/);
  });

  it('allows anonymous creation of feedback', () => {
    const rules = readFirestoreRules();
    const block = rules.split(/match \/feedback\/\{feedbackId\}/)[1] ?? '';
    const allowCreate = block.match(/allow create:[\s\S]*?;/);
    expect(allowCreate).toBeTruthy();
    expect(allowCreate![0]).not.toMatch(/request\.auth/);
  });

  it('allows the full set of fields the useFeedback hook writes', () => {
    const expectedFields = [
      'description',
      'name',
      'email',
      'screenshotUrl',
      'screenshotFailed',
      'pageUrl',
      'pageTitle',
      'userAgent',
      'userId',
      'status',
      'createdAt',
    ];

    const rules = readFirestoreRules();
    const allowlist = extractFeedbackAllowlist(rules);
    expect(allowlist, 'expected to find feedback create allowlist').toBeTruthy();

    for (const field of expectedFields) {
      expect(allowlist, `rules should allow ${field}`).toContain(field);
    }
  });

  it('restricts feedback read to admins', () => {
    const rules = readFirestoreRules();
    const block = rules.split(/match \/feedback\/\{feedbackId\}/)[1] ?? '';
    const allowRead = block.match(/allow read:[\s\S]*?;/);
    expect(allowRead).toBeTruthy();
    expect(allowRead![0]).toMatch(/isAdminOrEmulatorAdmin|isAdmin/);
  });
});
