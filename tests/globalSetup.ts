import { spawn } from 'child_process';
import { waitFor } from './utils/wait-for.js';

async function checkEmulatorsRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:9199');
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

async function runSeedScript(): Promise<void> {
  console.log('Running seed script...');

  return new Promise((resolve, reject) => {
    const seed = spawn('node', ['scripts/seed-test-events.mjs'], {
      stdio: 'inherit',
      shell: true,
    });

    seed.on('close', (code) => {
      if (code === 0) {
        console.log('Seed script completed successfully.');
        resolve();
      } else {
        reject(new Error(`Seed script exited with code ${code}`));
      }
    });

    seed.on('error', reject);
  });
}

async function runImportUsersScript(): Promise<void> {
  console.log('Running import test users script...');

  return new Promise((resolve, reject) => {
    const importUsers = spawn('node', ['scripts/import-test-users.mjs'], {
      stdio: 'inherit',
      shell: true,
    });

    importUsers.on('close', (code) => {
      if (code === 0) {
        console.log('Import users script completed successfully.');
        resolve();
      } else {
        reject(new Error(`Import users script exited with code ${code}`));
      }
    });

    importUsers.on('error', reject);
  });
}

export default async function globalSetup() {
  console.log('Checking if Firebase emulators are running...');

  const running = await checkEmulatorsRunning();

  if (!running) {
    console.log('Emulators not running. Please start them with: firebase emulators:start --import ./data-export');
    console.log('Skipping seed data setup.');
    return;
  }

  console.log('Emulators are running. Seeding test data...');

  try {
    await waitFor('http://127.0.0.1:8181', { timeout: 30000 });
    await runSeedScript();
    await runImportUsersScript();
  } catch (error) {
    console.error('Failed to seed test data:', error);
    throw error;
  }
}
