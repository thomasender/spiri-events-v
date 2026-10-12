#!/usr/bin/env node
// Read-only GA4 realtime report (last 30 min) via the Analytics Data API.
//
// Auth: impersonates a read-only service account through gcloud, so no key
// file is needed. The account must be a "Betrachter" on the GA property and
// your gcloud user needs roles/iam.serviceAccountTokenCreator on it.
//
//   node scripts/ga-realtime.mjs                 # events + pages
//   node scripts/ga-realtime.mjs --json          # machine readable
//   node scripts/ga-realtime.mjs --dimension=eventName,unifiedScreenName
import { execFileSync } from 'node:child_process';

const PROPERTY = process.env.GA_PROPERTY_ID || '529962266';
const SA = process.env.GA_READER_SA || 'ga-reader@spirieventsvbg.iam.gserviceaccount.com';

function token() {
  return execFileSync(
    'gcloud',
    [
      'auth',
      'print-access-token',
      `--impersonate-service-account=${SA}`,
      '--scopes=https://www.googleapis.com/auth/analytics.readonly',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

/** @returns {Promise<Array<Record<string, string>>>} one object per row */
export async function realtime(dimensions = ['eventName'], metrics = ['eventCount']) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
      }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`GA Data API ${res.status}: ${body.error?.message ?? 'unknown'}`);
  return (body.rows ?? []).map((row) => {
    const out = {};
    dimensions.forEach((d, i) => (out[d] = row.dimensionValues[i].value));
    metrics.forEach((m, i) => (out[m] = row.metricValues[i].value));
    return out;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const dimArg = process.argv.find((a) => a.startsWith('--dimension='));
  const dims = dimArg ? dimArg.split('=')[1].split(',') : ['eventName'];
  const rows = await realtime(dims);
  if (json) console.log(JSON.stringify(rows, null, 2));
  else console.table(rows);
}
