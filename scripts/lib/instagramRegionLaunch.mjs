// Pure helpers for scripts/instagram-region-launch.mjs (unit-tested in
// tests/lib/instagramRegionAccountScript.spec.ts). Plan semantics:
// functions/src/instagram/instagramRegionLaunch.ts.
import { assertRegionId } from './instagramRegionAccount.mjs';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
// ISO with an explicit offset or Z, so the start can never be read in the wrong zone.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Every field of the plan and of the drip's progress (cleared together). */
export const LAUNCH_FIELDS = [
  'launchStartAt',
  'launchDays',
  'launchWindowStart',
  'launchWindowEnd',
  'launchTimezone',
  'launchStartedAt',
  'launchEventIds',
  'launchTotal',
  'launchCursor',
  'launchPosted',
  'launchFinishedAt',
  'launchRemaining',
  'launchLeaseUntil',
];

export function parseLaunchArgs(argv) {
  const out = {
    regionId: '',
    action: '',
    start: '',
    days: 3,
    windowStart: '08:00',
    windowEnd: '20:00',
    timezone: 'Europe/Berlin',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--show' || a === '--set' || a === '--clear') {
      if (out.action) throw new Error('Nur eine Aktion: --show, --set oder --clear.');
      out.action = a.slice(2);
    } else if (a === '--start') out.start = argv[++i] ?? '';
    else if (a === '--days') out.days = Number(argv[++i]);
    else if (a === '--window') {
      const [from, to] = String(argv[++i] ?? '').split('-');
      out.windowStart = from ?? '';
      out.windowEnd = to ?? '';
    } else if (a === '--tz') out.timezone = argv[++i] ?? '';
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) throw new Error(`Unbekannte Option ${a}`);
    else if (!out.regionId) out.regionId = a;
    else throw new Error(`Unerwartetes Argument ${a}`);
  }
  assertRegionId(out.regionId);
  if (!out.action) out.action = 'show';
  return out;
}

/** Plan fields to write for --set; throws on anything invalid. */
export function buildLaunchPlanFields(args) {
  if (!ISO_WITH_ZONE.test(args.start)) {
    throw new Error('--start braucht Datum, Uhrzeit und Zeitzone, z.B. 2026-11-25T12:00+01:00');
  }
  const startAt = new Date(args.start);
  if (Number.isNaN(startAt.getTime())) throw new Error(`Ungültiger Start: ${args.start}`);
  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 14) {
    throw new Error('--days muss eine ganze Zahl von 1 bis 14 sein.');
  }
  if (!TIME.test(args.windowStart) || !TIME.test(args.windowEnd)) {
    throw new Error('--window im Format HH:MM-HH:MM, z.B. 08:00-20:00');
  }
  if (args.windowStart >= args.windowEnd)
    throw new Error('Das Fenster muss vor Mitternacht enden.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: args.timezone });
  } catch {
    throw new Error(`Unbekannte Zeitzone: ${args.timezone}`);
  }
  return {
    launchStartAt: startAt,
    launchDays: args.days,
    launchWindowStart: args.windowStart,
    launchWindowEnd: args.windowEnd,
    launchTimezone: args.timezone,
  };
}

const iso = (v) =>
  v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null;

/** Human-readable plan + progress of a region doc. Never includes the token. */
export function describeLaunch(regionId, data) {
  if (!data) return `instagram_private/region_${regionId} existiert nicht.`;
  const lines = [`Region ${regionId}: Account ${data.enabled === true ? 'AKTIV' : 'AUS'}`];
  if (!data.launchStartAt) {
    lines.push('Kein Launch-Plan gesetzt.');
    return lines.join('\n');
  }
  lines.push(
    `Start: ${iso(data.launchStartAt)} | Tage: ${data.launchDays ?? 3} | Fenster: ${data.launchWindowStart ?? '08:00'}-${data.launchWindowEnd ?? '20:00'} (${data.launchTimezone ?? 'Zeitzone der Region'})`
  );
  if (!data.launchStartedAt) {
    lines.push('Noch nicht gestartet (Backlog wird beim ersten Lauf nach dem Start festgelegt).');
  } else {
    const total = data.launchTotal ?? 0;
    const cursor = data.launchCursor ?? 0;
    lines.push(
      `Gestartet: ${iso(data.launchStartedAt)} | Backlog: ${total} | bearbeitet: ${cursor} | gepostet/versucht: ${data.launchPosted ?? 0} | offen: ${data.launchRemaining ?? total - cursor}`
    );
  }
  if (data.launchFinishedAt) lines.push(`Beendet: ${iso(data.launchFinishedAt)}`);
  return lines.join('\n');
}
