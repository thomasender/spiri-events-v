import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default Playwright storageState: analytics-consent=denied for the dev origin,
 * so the cookie banner never covers anything in a test. The role states created
 * by auth.setup.ts inherit it because that setup context starts from this file.
 */
export const CONSENT_STORAGE_STATE = path.resolve(__dirname, '..', '.auth', 'consent-denied.json');

export function writeConsentStorageState(): void {
  fs.mkdirSync(path.dirname(CONSENT_STORAGE_STATE), { recursive: true });
  const value = JSON.stringify({ value: 'denied', timestamp: Date.now() });
  fs.writeFileSync(
    CONSENT_STORAGE_STATE,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5180',
          localStorage: [{ name: 'analytics-consent', value }],
        },
      ],
    })
  );
}
