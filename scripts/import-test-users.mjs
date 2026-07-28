#!/usr/bin/env node
const AUTH_EMULATOR = 'http://127.0.0.1:9199';
const PROJECT_ID = 'spirieventsvbg';

const TEST_USERS = [
  {
    email: 'admin@dev.local',
    password: 'devpassword123',
    displayName: 'Dev Admin',
    role: 'Admin',
  },
  {
    email: 'user@dev.local',
    password: 'devpassword123',
    displayName: 'Dev User',
    role: 'User',
  },
  {
    email: 'admin@test.com',
    password: 'testpassword123',
    displayName: 'Test Admin',
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

  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      displayName: user.displayName,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error?.message === 'EMAIL_EXISTS') {
      console.log(`  Already exists, skipping`);
      return null;
    }
    console.error(`  Error: ${JSON.stringify(data)}`);
    return null;
  }

  console.log(`  Created: ${data.localId}`);
  return data.localId;
}

async function updateUserRole(uid, role) {
  console.log(`  Setting role to ${role}...`);

  const url = `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts:update`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify({ role }),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`  Error updating role: ${JSON.stringify(data)}`);
    return false;
  }

  console.log(`  Role set successfully`);
  return true;
}

async function main() {
  console.log('Creating test users in Auth Emulator...');
  console.log(`Emulator: ${AUTH_EMULATOR}`);
  console.log('');

  const uidMap = {};
  for (const user of TEST_USERS) {
    const uid = await createUser(user);
    if (uid && user.role) {
      await updateUserRole(uid, user.role);
      uidMap[user.email] = uid;
    }
  }

  console.log('\nDone! Test users created:');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email} / ${user.password} (${user.role})`);
  }
  console.log('\nUIDs for reference:');
  for (const [email, uid] of Object.entries(uidMap)) {
    console.log(`  ${email}: ${uid}`);
  }
  console.log('\nRefresh: http://127.0.0.1:4040/auth');
}

main().catch(console.error);
