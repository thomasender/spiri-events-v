#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const AUTH_EMULATOR = 'http://127.0.0.1:9199';
const PROJECT_ID = 'spirieventsvbg';

process.env.AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIREBASE_PROJECT_ID = PROJECT_ID;

initializeApp({
  projectId: PROJECT_ID,
});

const auth = getAuth();

const TEST_USERS = [
  {
    email: 'admin@test.com',
    password: 'testpassword123',
    displayName: 'Admin User',
    role: 'Admin',
  },
  {
    email: 'user@test.local',
    password: 'testpassword123',
    displayName: 'Test User',
    role: 'User',
  },
  {
    email: 'mathis.aut@gmail.com',
    password: 'testpassword123',
    displayName: 'Mathis Aut',
    role: 'Admin',
  },
];

async function createUser(user) {
  console.log(`Creating user: ${user.email}...`);

  try {
    const record = await auth.createUser({
      email: user.email,
      password: user.password,
      displayName: user.displayName,
    });

    console.log(`  Created: ${record.uid}`);

    if (user.role) {
      await auth.setCustomUserClaims(record.uid, { role: user.role });
      console.log(`  Set role to: ${user.role}`);
    }

    return record.uid;
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Creating test users in Auth Emulator...');
  console.log(`Emulator: ${AUTH_EMULATOR}`);
  console.log('');

  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('\nDone! Test users created:');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email} / ${user.password} (${user.role})`);
  }
  console.log('\nRefresh: http://127.0.0.1:4040/auth');
}

main().catch(console.error);
