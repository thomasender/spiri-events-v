import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const warn = vi.hoisted(() => vi.fn());
// functions/ has its own node_modules; mock the copy that functions/src/appCheck.ts resolves.
vi.mock('../../functions/node_modules/firebase-functions', () => ({ logger: { warn } }));

import {
  APP_CHECK_EXEMPT_FUNCTIONS,
  ENFORCE_APP_CHECK,
  appCheckOptions,
  logMissingAppCheck,
} from '../../functions/src/appCheck';

const SRC = join(__dirname, '../../functions/src');
const source = (file: string) => readFileSync(join(SRC, file), 'utf8');

describe('logMissingAppCheck', () => {
  beforeEach(() => warn.mockClear());

  it('logs the function name when there is no verified token', () => {
    logMissingAppCheck('someCallable', {});
    expect(warn).toHaveBeenCalledWith('callable without app check', { name: 'someCallable' });
  });

  it('stays quiet when the request carries a verified token', () => {
    logMissingAppCheck('someCallable', { app: { appId: 'x' } });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('appCheckOptions', () => {
  it('observes only by default and enforces when switched on', () => {
    expect(ENFORCE_APP_CHECK).toBe(false);
    expect(appCheckOptions()).toEqual({});
    expect(appCheckOptions(true)).toEqual({ enforceAppCheck: true });
  });
});

describe('App Check coverage of the Cloud Functions', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

  it('wires every browser-facing callable into App Check', () => {
    for (const file of files.filter((f) => f !== 'appCheck.ts')) {
      const text = source(file);
      const callables = (text.match(/export const \w+ = onCall\(/g) ?? []).length;
      if (callables === 0) continue;
      expect(
        (text.match(/\.\.\.appCheckOptions\(\)/g) ?? []).length,
        `${file}: every onCall needs ...appCheckOptions()`
      ).toBe(callables);
      expect(
        (text.match(/logMissingAppCheck\(/g) ?? []).length,
        `${file}: every onCall needs logMissingAppCheck()`
      ).toBe(callables);
    }
  });

  it('never enforces on functions whose callers cannot send tokens', () => {
    expect([...APP_CHECK_EXEMPT_FUNCTIONS]).toEqual(['mollieWebhook', 'calendarFeed']);
    for (const file of ['mollieWebhook.ts', 'calendarFeed.ts']) {
      const text = source(file);
      expect(text).not.toMatch(/enforceAppCheck|appCheckOptions/);
    }
  });
});
