#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AUTH_EMULATOR = 'http://127.0.0.1:9199';
const PROJECT_ID = 'spirieventsvbg';

const TEST_USERS = [
  {
    email: 'admin@test.local',
    password: 'Test123!',
    displayName: 'Admin User',
    role: 'Admin',
  },
  {
    email: 'user@test.local',
    password: 'Test123!',
    displayName: 'Test User',
    role: 'User',
  },
];

async function createUser(user) {
  console.log(`Creating user: ${user.email}...`);

  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      customAttributes: JSON.stringify({ role: user.role }),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`  Error: ${JSON.stringify(data)}`);
    return null;
  }

  console.log(`  Created: ${data.localId}`);
  return data.localId;
}

async function updateUserRole(uid, role) {
  console.log(`  Setting role to ${role}...`);

  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify({ role }),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`  Error updating role: ${JSON.stringify(data)}`);
  }
}

async function main() {
  console.log('Creating test users in Auth Emulator...');
  console.log('Emulator: ' + AUTH_EMULATOR);
  console.log('');

  for (const user of TEST_USERS) {
    const uid = await createUser(user);
    if (uid && user.role) {
      await updateUserRole(uid, user.role);
    }
  }

  console.log('\nDone! Test users created:');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email} / ${user.password} (${user.role})`);
  }
  console.log('\nRefresh: http://127.0.0.1:4040/auth');
}

main().catch(console.error);
