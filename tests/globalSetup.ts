import { spawn } from 'child_process';

const AUTH_URL = 'http://127.0.0.1:9199';
const FIRESTORE_PROBE =
  'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/events?pageSize=1';

async function reachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    // Any answer means the emulator is alive; 400/404 are fine.
    return response.status > 0;
  } catch {
    return false;
  }
}

function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], { stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`))
    );
    child.on('error', reject);
  });
}

export default async function globalSetup() {
  // Probe Auth *and* Firestore. The old version only checked Auth, so a
  // degraded Firestore emulator (alive as a process, not answering queries)
  // meant a 30s wait followed by a confusing cascade of failures. Both probes
  // are capped at 3s, so a bad setup is reported almost immediately.
  const [authOk, firestoreOk] = await Promise.all([
    reachable(AUTH_URL),
    reachable(FIRESTORE_PROBE),
  ]);

  if (!authOk || !firestoreOk) {
    const detail = [
      `  Auth      (:9199)  ${authOk ? 'OK' : 'NOT RESPONDING'}`,
      `  Firestore (:8181)  ${firestoreOk ? 'OK' : 'NOT RESPONDING'}`,
    ].join('\n');

    const hint =
      authOk && !firestoreOk
        ? 'The Firestore emulator has most likely degraded under load.\n' +
          'Restart it:  pkill -f cloud-firestore-emulator && npm run emulators:start'
        : 'Start them in a separate terminal:  npm run emulators:start';

    // Fail loudly instead of running the whole suite against a dead backend.
    throw new Error(`Firebase emulators are not usable.\n${detail}\n\n${hint}\n`);
  }

  console.log('Emulators are up. Seeding test data...');
  await runScript('scripts/seed-test-events.mjs');
  await runScript('scripts/import-test-users.mjs');
}
