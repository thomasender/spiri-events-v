/**
 * Pure scheduling logic for per-event Instagram stories: every event gets its
 * own story shortly before it starts. A scheduled function calls
 * runEventStories() every few minutes; this file decides which events are due.
 * All I/O is injected through StoryDeps (see ./instagramStory.ts).
 *
 * Rules:
 * - due time = start - LEAD_MINUTES, never later than LATEST_DUE (19:00) of the
 *   event's day, and events whose due time would be before OPEN_HOUR (08:00)
 *   are posted the evening before at EVENING_BEFORE (18:00)
 * - nothing is posted outside [OPEN_HOUR, CLOSE_HOUR) Vienna time
 * - an event is posted once (instagram_posts doc id) and never after its start
 * - at most MAX_STORIES_PER_DAY stories per Vienna day, MAX_PER_RUN per run
 */

import { type CarouselEvent, isCarouselEligible } from './instagramCarousel';
import {
  postStoryGroup,
  type StoryDeps,
  type StoryGroup,
  type StoryResult,
} from './instagramStory';
import { VIENNA_TZ, viennaToday } from './instagramPublish';
import type { CarouselBezirk } from './instagramCarousel';

export const LEAD_MINUTES = 120;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
export const LATEST_DUE = '19:00';
export const EVENING_BEFORE = '18:00';
export const MAX_STORIES_PER_DAY = 8;
export const MAX_PER_RUN = 2;

const TIME = /^(\d{1,2}):(\d{2})$/;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Wall-clock minutes since the epoch for a Vienna date + "HH:MM". Plain
 * arithmetic on the wall clock (no timezone maths), so comparisons between two
 * Vienna times stay correct except for the hour that a DST change skips.
 */
function wallMinutes(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const match = TIME.exec(time);
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;
  return Date.UTC(y, m - 1, d, hours, minutes) / 60_000;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Current Vienna calendar day and wall-clock minutes. */
export function viennaWallNow(now: Date): { day: string; minutes: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIENNA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const day = viennaToday(now);
  const hour = get('hour');
  return { day, minutes: wallMinutes(day, '00:00') + hour * 60 + get('minute'), hour };
}

export interface DueTimes {
  /** wall-clock minutes at which the story becomes due */
  due: number;
  /** wall-clock minutes of the event start */
  start: number;
}

/** When the story of an event on `date` at `time` becomes due; null without a valid start time. */
export function storyDueTimes(date: string, time: unknown): DueTimes | null {
  const t = asString(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME.test(t)) return null;
  const start = wallMinutes(date, t);
  const target = start - LEAD_MINUTES;
  const due =
    target < wallMinutes(date, `${OPEN_HOUR}:00`)
      ? wallMinutes(addDays(date, -1), EVENING_BEFORE)
      : Math.min(target, wallMinutes(date, LATEST_DUE));
  return { due, start };
}

export function eventStoryPostId(eventId: string, date: string): string {
  return `story_event_${eventId}_${date}`;
}

/** "Heute" for an event today, "Morgen" for tomorrow. */
export function storyHeadingFor(date: string, today: string): string {
  return date === today ? 'Heute' : 'Morgen';
}

export interface DueEvent {
  event: CarouselEvent;
  date: string;
  due: number;
}

/** Eligible events whose story is due right now, earliest due time first. */
export function findDueEvents(events: CarouselEvent[], now: Date): DueEvent[] {
  const wall = viennaWallNow(now);
  if (wall.hour < OPEN_HOUR || wall.hour >= CLOSE_HOUR) return [];
  const result: DueEvent[] = [];
  for (const event of events) {
    const date = asString(event.date);
    if (!event.id || !isCarouselEligible(event, { start: date, end: date })) continue;
    const times = storyDueTimes(date, event.time);
    if (!times) continue;
    if (wall.minutes >= times.due && wall.minutes < times.start) {
      result.push({ event, date, due: times.due });
    }
  }
  return result.sort((a, b) => a.due - b.due);
}

export type EventStoryOutcome =
  | { status: 'disabled' | 'outside-hours' | 'daily-cap' }
  | { status: 'done'; results: StoryResult[] };

/** Posts the stories that are due now. Safe to call every few minutes. */
export async function runEventStories(deps: StoryDeps): Promise<EventStoryOutcome> {
  const log = deps.log ?? (() => undefined);
  const now = (deps.now ?? (() => new Date()))();
  const wall = viennaWallNow(now);
  if (wall.hour < OPEN_HOUR || wall.hour >= CLOSE_HOUR) return { status: 'outside-hours' };
  if (!(await deps.isEnabled())) {
    log('Instagram posting disabled via app_settings/instagram; skipping event stories');
    return { status: 'disabled' };
  }

  const events = await deps.listEvents({ start: wall.day, end: addDays(wall.day, 1) });
  const due = findDueEvents(events, now);
  if (due.length === 0) return { status: 'done', results: [] };

  let postedToday = deps.countStoriesPostedOn ? await deps.countStoriesPostedOn(wall.day) : 0;
  if (postedToday >= MAX_STORIES_PER_DAY) {
    log('Daily story cap reached; not posting', { postedToday });
    return { status: 'daily-cap' };
  }

  const results: StoryResult[] = [];
  for (const { event, date } of due) {
    if (results.length >= MAX_PER_RUN || postedToday >= MAX_STORIES_PER_DAY) break;
    const postId = eventStoryPostId(event.id ?? '', date);
    const group: StoryGroup = {
      bezirk: asString(event.bezirk) as CarouselBezirk,
      part: 1,
      parts: 1,
      events: [event],
      city: asString(event.city) || undefined,
    };
    const result = await postStoryGroup(deps, group, date, postId, {
      kind: 'event',
      postedDay: wall.day,
      heading: storyHeadingFor(date, wall.day),
    });
    // Duplicates were posted by an earlier run and do not count against this run.
    if (result.outcome !== 'duplicate') {
      results.push(result);
      postedToday += 1;
    }
  }
  return { status: 'done', results };
}
