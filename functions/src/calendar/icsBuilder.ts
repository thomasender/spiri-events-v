/**
 * iCalendar (RFC 5545) output for the public calendar feed and the "add to
 * calendar" download. Pure functions, no Firebase imports.
 *
 * Only public event fields are used (title, time, place, description, the
 * organizer's display name, the public contact text `kontakt`, link back to
 * the event page). The organizer's account e-mail never goes in here.
 *
 * Times are written as floating local times (no TZID) together with
 * X-WR-TIMEZONE: the events are in-person events in Vorarlberg, so a start
 * of 18:00 should read 18:00 on the viewer's calendar wherever they are, and
 * we do not have to ship a VTIMEZONE block.
 */

import { stripHtml } from '../instagram/instagramContent';

export const SITE_URL = 'https://www.thetribe.at';
const UID_DOMAIN = 'thetribe.at';
const MAX_DESCRIPTION = 1500;
const DEFAULT_DURATION_MINUTES = 60;

export interface IcsEvent {
  id: string;
  slug?: unknown;
  title?: unknown;
  /** Start day of this occurrence, YYYY-MM-DD. */
  date: string;
  endDate?: unknown;
  time?: unknown;
  endTime?: unknown;
  place?: unknown;
  bezirk?: unknown;
  isOnline?: unknown;
  category?: unknown;
  description?: unknown;
  organizer?: unknown;
  kontakt?: unknown;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks (as \n). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line at 75 octets (UTF-8 safe: never splits a character). */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function compactDay(iso: string): string {
  return iso.replace(/-/g, '');
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function parseClock(value: unknown): { h: number; m: number } | null {
  const match = CLOCK.exec(str(value));
  return match ? { h: Number(match[1]), m: Number(match[2]) } : null;
}

function floating(day: string, h: number, m: number): string {
  return `${compactDay(day)}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
}

/** Adds minutes to a wall-clock time, rolling the day over when needed. */
function plusMinutes(day: string, h: number, m: number, minutes: number) {
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return { day: addDays(day, dayShift), h: Math.floor(rest / 60), m: rest % 60 };
}

function timeLines(event: IcsEvent): string[] {
  const start = parseClock(event.time);
  const lastDay =
    ISO_DAY.test(str(event.endDate)) && str(event.endDate) > event.date
      ? str(event.endDate)
      : event.date;

  if (!start) {
    // No usable start time: an all-day event; DTEND is exclusive.
    return [
      `DTSTART;VALUE=DATE:${compactDay(event.date)}`,
      `DTEND;VALUE=DATE:${compactDay(addDays(lastDay, 1))}`,
    ];
  }

  const end = parseClock(event.endTime);
  let endDay = lastDay;
  let endH: number;
  let endM: number;
  const startsAt = event.date + String(start.h).padStart(2, '0') + String(start.m).padStart(2, '0');
  if (end && lastDay + String(end.h).padStart(2, '0') + String(end.m).padStart(2, '0') > startsAt) {
    endH = end.h;
    endM = end.m;
  } else if (lastDay !== event.date) {
    endH = 23;
    endM = 59;
  } else {
    const fallback = plusMinutes(event.date, start.h, start.m, DEFAULT_DURATION_MINUTES);
    endDay = fallback.day;
    endH = fallback.h;
    endM = fallback.m;
  }
  return [
    `DTSTART:${floating(event.date, start.h, start.m)}`,
    `DTEND:${floating(endDay, endH, endM)}`,
  ];
}

export function eventPageUrl(event: Pick<IcsEvent, 'id' | 'slug'>): string {
  return `${SITE_URL}/event/${str(event.slug) || event.id}`;
}

function location(event: IcsEvent): string {
  if (event.isOnline === true || event.isOnline === 'true') return 'Online';
  const place = str(event.place);
  const bezirk = str(event.bezirk);
  if (place && bezirk && !place.toLowerCase().includes(bezirk.toLowerCase())) {
    return `${place}, ${bezirk}`;
  }
  return place || bezirk;
}

function organizerName(event: IcsEvent): string {
  const o = event.organizer;
  if (!o || typeof o !== 'object') return '';
  const { name, firstName, lastName } = o as Record<string, unknown>;
  return str(name) || [str(firstName), str(lastName)].filter(Boolean).join(' ');
}

function description(event: IcsEvent): string {
  const text = stripHtml(event.description)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const clipped =
    text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text;
  const parts = [clipped];
  const organizer = organizerName(event);
  if (organizer) parts.push(`Veranstalter: ${organizer}`);
  const kontakt = stripHtml(event.kontakt).trim();
  if (kontakt) parts.push(`Kontakt: ${kontakt}`);
  const link = `Mehr Infos: ${eventPageUrl(event)}`;
  parts.push(link);
  return parts.filter(Boolean).join('\n\n');
}

function utcStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildVEvent(event: IcsEvent, now: Date): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}-${event.date}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...timeLines(event),
    `SUMMARY:${escapeText(str(event.title) || 'Event')}`,
  ];
  const where = location(event);
  if (where) lines.push(`LOCATION:${escapeText(where)}`);
  lines.push(`DESCRIPTION:${escapeText(description(event))}`);
  lines.push(`URL:${eventPageUrl(event)}`);
  const category = str(event.category);
  if (category) lines.push(`CATEGORIES:${escapeText(category)}`);
  lines.push('END:VEVENT');
  return lines;
}

export interface CalendarOptions {
  /** Region name in PRODID ("Events <name>"); default Vorarlberg. */
  productName?: string;
  /** IANA zone for X-WR-TIMEZONE; default Europe/Vienna. */
  timezone?: string;
}

export function buildCalendar(
  events: IcsEvent[],
  name: string,
  now: Date = new Date(),
  options: CalendarOptions = {}
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//thetribe.at//Events ${(options.productName ?? 'Vorarlberg').replace(/[^\p{L}\p{N} .-]/gu, '')}//DE`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${options.timezone ?? 'Europe/Vienna'}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events.flatMap((event) => buildVEvent(event, now)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
