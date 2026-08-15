#!/usr/bin/env node
const AUTH_EMULATOR = 'http://127.0.0.1:9199';
const PROJECT_ID = 'spirieventsvbg';

const TEST_USERS = [
  {
    email: 'admin@dev.local',
    password: 'devpassword123',
    displayName: 'Dev Admin',
    role: 'Admin',
    emailVerified: true,
  },
  {
    email: 'user@dev.local',
    password: 'devpassword123',
    displayName: 'Dev User',
    role: 'User',
    emailVerified: true,
  },
  {
    email: 'admin@test.com',
    password: 'testpassword123',
    displayName: 'Test Admin',
    role: 'Admin',
    emailVerified: true,
  },
  {
    email: 'user@test.local',
    password: 'testpassword123',
    displayName: 'Test User',
    role: 'User',
    emailVerified: true,
  },
  {
    email: 'mathis.aut@gmail.com',
    password: 'testpassword123',
    displayName: 'Mathis Aut',
    role: 'Admin',
    emailVerified: true,
  },
  {
    email: 'unverified@test.local',
    password: 'testpassword123',
    displayName: 'Test Unverified',
    role: 'User',
    emailVerified: false,
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
      console.log(`  Already exists, will refresh flags`);
      return null;
    }
    console.error(`  Error: ${JSON.stringify(data)}`);
    return null;
  }

  console.log(`  Created: ${data.localId}`);
  return data.localId;
}

async function updateUserFlags(user, uid) {
  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`;

  const customAttributes = user.role ? JSON.stringify({ role: user.role }) : undefined;

  const payload = { localId: uid };
  if (typeof user.emailVerified === 'boolean') {
    payload.emailVerified = user.emailVerified;
  }
  if (customAttributes) {
    payload.customAttributes = customAttributes;
  }

  console.log(`  Setting flags (role=${user.role || '-'}, emailVerified=${user.emailVerified})...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`  Error updating flags: ${JSON.stringify(data)}`);
    return false;
  }

  return uid;
}

async function resolveUid(email) {
  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({ localId: [], email: [email] }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error(`  Lookup error: ${JSON.stringify(data)}`);
    return null;
  }
  const user = data?.users?.[0];
  return user?.localId ?? null;
}

async function main() {
  console.log('Creating test users in Auth Emulator...');
  console.log(`Emulator: ${AUTH_EMULATOR}`);
  console.log('');

  const uidMap = {};
  for (const user of TEST_USERS) {
    const createdUid = await createUser(user);

    let uid = createdUid;
    if (!uid) {
      uid = await resolveUid(user.email);
      if (!uid) {
        console.error(`  Could not determine uid for ${user.email}, skipping`);
        continue;
      }
    }

    const updatedUid = await updateUserFlags(user, uid);
    if (updatedUid) {
      uidMap[user.email] = updatedUid;
    }
  }

  console.log('\nDone! Test users configured:');
  for (const user of TEST_USERS) {
    console.log(
      `  ${user.email} / ${user.password} (role=${user.role}, emailVerified=${user.emailVerified})`
    );
  }
  console.log('\nUIDs for reference:');
  for (const [email, uid] of Object.entries(uidMap)) {
    console.log(`  ${email}: ${uid}`);
  }
  console.log('\nRefresh: http://127.0.0.1:4040/auth');
}

main().catch(console.error);
