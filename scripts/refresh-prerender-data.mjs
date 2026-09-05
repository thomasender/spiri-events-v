#!/usr/bin/env node
/**
 * Refresh data-export/firestore-export/events.json from the running Firestore
 * emulator (or production Firestore when FIRESTORE_EMULATOR_HOST is unset).
 *
 * Usage:
 *   1. Start the emulators with production data imported:
 *        firebase emulators:start --import ./data-export
 *   2. Run:
 *        node scripts/refresh-prerender-data.mjs
 *   3. Commit the updated data-export/firestore-export/events.json.
 *
 * When FIRESTORE_EMULATOR_HOST is unset and a service-account.json is
 * available at scripts/service-account.json, the script falls back to
 * fetching from production via the Admin SDK.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_FILE = join(ROOT, 'data-export', 'firestore-export', 'events.json')
const SERVICE_ACCOUNT = join(__dirname, 'service-account.json')

function pad2(n) {
  return String(n).padStart(2, '0')
}

function firestoreToEmulatorExport(docSnap) {
  const out = { id: docSnap.id }
  for (const [key, value] of Object.entries(docSnap.data())) {
    out[key] = firestoreValueToEmulator(value)
  }
  return out
}

function firestoreValueToEmulator(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) }
    return { doubleValue: value }
  }
  if (typeof value === 'boolean') return { booleanValue: value ? 'true' : 'false' }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return value.map(firestoreValueToEmulator)
  if (typeof value === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(value)) {
      fields[k] = firestoreValueToEmulator(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

async function main() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const projectId = process.env.GCLOUD_PROJECT || 'spirieventsvbg'

  let adminApp, adminDb
  if (emulatorHost) {
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost
    const admin = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    adminApp = admin.initializeApp({ projectId }, `refresh-prerender-${Date.now()}`)
    adminDb = getFirestore(adminApp)
    console.log(`Connected to emulator at ${emulatorHost}, project ${projectId}`)
  } else if (existsSync(SERVICE_ACCOUNT)) {
    const admin = await import('firebase-admin/app')
    const { getFirestore, cert } = await import('firebase-admin/firestore')
    const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT, 'utf8'))
    adminApp = admin.initializeApp(
      { credential: cert(serviceAccount), projectId },
      `refresh-prerender-${Date.now()}`
    )
    adminDb = getFirestore(adminApp)
    console.log(`Connected to production Firestore, project ${projectId}`)
  } else {
    console.error('Neither FIRESTORE_EMULATOR_HOST nor scripts/service-account.json is available.')
    console.error('Start the emulator first, or drop a service-account.json next to this file.')
    process.exit(1)
  }

  const { collection, getDocs } = await import('firebase-admin/firestore')
  const snap = await getDocs(collection(adminDb, 'events'))
  const events = snap.docs.map(firestoreToEmulatorExport)
  writeFileSync(OUT_FILE, JSON.stringify(events, null, 2))
  console.log(`Wrote ${events.length} events to ${OUT_FILE}`)
  console.log('')
  console.log('Next: review the diff and commit if it looks right:')
  console.log(`  git diff data-export/firestore-export/events.json`)
}

main().catch(err => {
  console.error('Refresh failed:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})