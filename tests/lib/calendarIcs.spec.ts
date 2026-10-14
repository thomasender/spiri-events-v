import { describe, it, expect } from 'vitest';
import {
  buildCalendar,
  buildVEvent,
  escapeText,
  foldLine,
  type IcsEvent,
} from '../../functions/src/calendar/icsBuilder';

const NOW = new Date('2026-10-12T10:00:00Z');

function ev(over: Partial<IcsEvent> = {}): IcsEvent {
  return {
    id: 'e1',
    slug: 'kakao-20261014',
    title: 'Kakao Zeremonie',
    date: '2026-10-14',
    time: '18:00',
    endTime: '20:30',
    place: 'Studio Eins',
    bezirk: 'Dornbirn',
    category: 'Sonstiges',
    description: '<p>Ein <b>schöner</b> Abend.</p>',
    ...over,
  };
}

const lines = (event: IcsEvent) => buildVEvent(event, NOW);

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('organizer and contact', () => {
  const unfold = (event: IcsEvent) => buildCalendar([event], 'x', NOW).replace(/\r\n /g, '');

  it('puts organizer name and contact into the description of feed and single downloads', () => {
    const out = unfold(
      ev({
        organizer: { firstName: 'Anna', lastName: 'Muster', email: 'secret@example.com' },
        kontakt: 'anna@example.com; Tel 0664 123',
        description: '<p>Zeile eins</p><p>Zeile zwei</p>',
      })
    );
    expect(out).toContain('Veranstalter: Anna Muster');
    expect(out).toContain('Kontakt: anna@example.com\\; Tel 0664 123');
    expect(out).toContain('Zeile eins\\nZeile zwei\\n\\nVeranstalter');
    expect(out).not.toContain('secret@example.com');
  });
});

describe('foldLine', () => {
  it('keeps short lines and folds long ones at 75 octets with a leading space', () => {
    expect(foldLine('SHORT')).toBe('SHORT');
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`).split('\r\n');
    expect(folded.length).toBeGreaterThan(2);
    expect(Buffer.byteLength(folded[0])).toBeLessThanOrEqual(75);
    for (const part of folded.slice(1)) {
      expect(part.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    }
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(`SUMMARY:${'x'.repeat(200)}`);
  });

  it('never splits a multi-byte character', () => {
    const text = `SUMMARY:${'ä'.repeat(120)}`;
    const unfolded = foldLine(text)
      .split('\r\n')
      .map((p, i) => (i ? p.slice(1) : p))
      .join('');
    expect(unfolded).toBe(text);
  });
});

describe('buildVEvent', () => {
  it('writes floating start/end, location, link and a stable UID', () => {
    const out = lines(ev());
    expect(out).toContain('UID:e1-2026-10-14@thetribe.at');
    expect(out).toContain('DTSTART:20261014T180000');
    expect(out).toContain('DTEND:20261014T203000');
    expect(out).toContain('SUMMARY:Kakao Zeremonie');
    expect(out).toContain('LOCATION:Studio Eins\\, Dornbirn');
    expect(out).toContain('URL:https://www.thetribe.at/event/kakao-20261014');
    expect(out.find((l) => l.startsWith('DESCRIPTION:'))).toContain('Ein schöner Abend.');
    expect(out.find((l) => l.startsWith('DESCRIPTION:'))).toContain(
      'Mehr Infos: https://www.thetribe.at/event/kakao-20261014'
    );
  });

  it('uses one hour when there is no end time, rolling past midnight', () => {
    expect(lines(ev({ endTime: undefined }))).toContain('DTEND:20261014T190000');
    const late = lines(ev({ time: '23:30', endTime: undefined }));
    expect(late).toContain('DTEND:20261015T003000');
  });

  it('writes an all-day event with an exclusive end when there is no time', () => {
    const out = lines(ev({ time: undefined, endTime: undefined }));
    expect(out).toContain('DTSTART;VALUE=DATE:20261014');
    expect(out).toContain('DTEND;VALUE=DATE:20261015');
  });

  it('spans multi-day events', () => {
    const timed = lines(ev({ endDate: '2026-10-16', endTime: '12:00' }));
    expect(timed).toContain('DTSTART:20261014T180000');
    expect(timed).toContain('DTEND:20261016T120000');
    const allDay = lines(ev({ time: undefined, endTime: undefined, endDate: '2026-10-16' }));
    expect(allDay).toContain('DTEND;VALUE=DATE:20261017');
  });

  it('marks online events and falls back to the event id for the link', () => {
    const out = lines(ev({ isOnline: true, slug: undefined }));
    expect(out).toContain('LOCATION:Online');
    expect(out).toContain('URL:https://www.thetribe.at/event/e1');
  });

  it('truncates very long descriptions', () => {
    const out = lines(ev({ description: `<p>${'wort '.repeat(1000)}</p>` }));
    expect(out.find((l) => l.startsWith('DESCRIPTION:'))!.length).toBeLessThan(1700);
  });
});

describe('buildCalendar', () => {
  it('produces a CRLF calendar with header, events and no private account fields', () => {
    const text = buildCalendar(
      [
        {
          ...ev(),
          // Fields that must never end up in the output
          ...({
            organizer: { firstName: 'Anna', lastName: 'Muster', email: 'owner@example.com' },
            createdBy: 'uid-123',
          } as object),
        },
      ],
      'Events Vorarlberg',
      NOW
    );
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('X-WR-TIMEZONE:Europe/Vienna');
    expect(text).toContain('DTSTAMP:20261012T100000Z');
    expect(text).not.toMatch(/uid-123|owner@example\.com/i);
    expect(text.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
    expect(text).toContain('PRODID:-//thetribe.at//Events Vorarlberg//DE\r\n');
  });

  it('names the calendar after the region and uses its time zone', () => {
    const text = buildCalendar([ev()], 'Events Allgäu – thetribe.at', NOW, {
      productName: 'Allgäu',
      timezone: 'Europe/Berlin',
    });
    expect(text).toContain('PRODID:-//thetribe.at//Events Allgäu//DE');
    expect(text).toContain('X-WR-CALNAME:Events Allgäu – thetribe.at');
    expect(text).toContain('X-WR-TIMEZONE:Europe/Berlin');
  });
});
