import { describe, expect, it } from 'vitest';
import sharp from '../../functions/node_modules/sharp';
import {
  CAPTION_MAX_LENGTH,
  FORMAT_DIMENSIONS,
  BASE_HASHTAGS,
  buildCaption,
  buildHashtags,
  toHashtag,
  buildEventImageModel,
  normalizeInstagramHandle,
  formatEventDate,
  formatEventTime,
  formatLocation,
  IMAGE_TITLE_FALLBACK,
  resolveCategoryColor,
  stripHtml,
  truncateTitle,
} from '../../functions/src/instagram/instagramContent';
import { renderEventImage } from '../../functions/src/instagram/instagramImage';

describe('instagram content', () => {
  const imageTitle = (title: string) => buildEventImageModel({ title }).title;

  it('strips leading and mid-title emoji from the image title', () => {
    expect(imageTitle('✨ Traumasensible Yogalehrer Ausbildung')).toBe(
      'Traumasensible Yogalehrer Ausbildung'
    );
    expect(imageTitle('Kakao 🌿 Zeremonie ❤️ Abend')).toBe('Kakao Zeremonie Abend');
    expect(imageTitle('Heilkreis 🇦🇹 1️⃣ 👍🏽')).toBe('Heilkreis 1');
  });

  it('strips ZWJ sequences completely', () => {
    expect(imageTitle('Paare 👩‍❤️‍👨 Retreat')).toBe('Paare Retreat');
    expect(imageTitle('👨‍👩‍👧‍👦 Familientag')).toBe('Familientag');
  });

  it('falls back to a non-empty title when only emoji are given', () => {
    expect(imageTitle('✨🌿')).toBe(IMAGE_TITLE_FALLBACK);
  });

  it('strips emoji from the image location but keeps place text', () => {
    const model = buildEventImageModel({ title: 'X', place: '📍 Café Süß', bezirk: 'Bregenz' });
    expect(model.location).toBe('Café Süß, Bregenz');
  });

  it('keeps umlauts, ß, digits and punctuation intact', () => {
    const t = 'Schöne Grüße – Fußbad & Tanz: 3x, 10-12 Uhr. Äpfel Öl Über';
    expect(imageTitle(t)).toBe(t);
  });

  it('keeps emoji in the caption', () => {
    const caption = buildCaption({ title: '✨ Kakao', date: '2026-10-17', place: 'Café 🌿' });
    expect(caption).toContain('✨ Kakao');
    expect(caption).toContain('📍 Café 🌿');
  });

  it('shortens long titles at a word boundary and leaves short ones alone', () => {
    expect(truncateTitle('Yoga am Morgen')).toBe('Yoga am Morgen');
    const long = 'Cacao Zeremonie und Soundhealing Abend im Rheintal mit Live Musik und Tanz';
    const result = truncateTitle(long, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('…')).toBe(true);
    expect(long.startsWith(result.slice(0, -1))).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });

  it('formats single-day, multi-day and invalid dates in German', () => {
    expect(formatEventDate('2026-10-17')).toBe('Sa, 17 Okt');
    expect(formatEventDate('2026-10-17', '2026-10-18')).toBe('Sa, 17 Okt – So, 18 Okt');
    expect(formatEventDate('2026-10-17', '2026-10-17')).toBe('Sa, 17 Okt');
    expect(formatEventDate('kaputt')).toBe('');
    expect(formatEventDate(undefined)).toBe('');
  });

  it('formats times with and without an end time', () => {
    expect(formatEventTime('18:00')).toBe('18:00 Uhr');
    expect(formatEventTime('18:00', '20:30')).toBe('18:00 – 20:30 Uhr');
    expect(formatEventTime('', '20:30')).toBe('');
  });

  it('builds the location from place and bezirk, or "Online"', () => {
    expect(formatLocation({ place: 'Studio Lotus', bezirk: 'Dornbirn' })).toBe(
      'Studio Lotus, Dornbirn'
    );
    expect(formatLocation({ place: 'Dornbirn Messe', bezirk: 'Dornbirn' })).toBe('Dornbirn Messe');
    expect(formatLocation({ place: '', bezirk: 'Feldkirch' })).toBe('Feldkirch');
    expect(formatLocation({ place: 'Studio', isOnline: true })).toBe('Online');
    expect(formatLocation({ place: 'Studio', isOnline: 'true' })).toBe('Online');
  });

  it('prefers the live category registry over the bundled defaults', () => {
    expect(resolveCategoryColor('Tanz')).toBe('#8a6d2f');
    expect(resolveCategoryColor('Tanz', { Tanz: '#112233' })).toBe('#112233');
    expect(resolveCategoryColor('Unbekannt')).toBe('#605e5e');
    expect(resolveCategoryColor(undefined)).toBe('#605e5e');
  });

  it('turns an event without image into a model that triggers the fallback layout', () => {
    const model = buildEventImageModel({ title: 'Kakao', category: 'Yoga', imageUrl: null });
    expect(model.imageUrl).toBeNull();
    expect(model.color).toBe('#c48e6a');
  });

  it('strips HTML from rich-text descriptions', () => {
    expect(
      stripHtml('<p>Hallo <strong>Welt</strong></p><p>Zweiter&nbsp;Absatz &amp; mehr</p>')
    ).toBe('Hallo Welt\nZweiter Absatz & mehr');
  });

  it('keeps captions within Instagram’s 2200 character limit, even for huge descriptions', () => {
    const caption = buildCaption({
      title: 'Cacao Zeremonie',
      date: '2026-10-17',
      time: '18:00',
      place: 'Studio Lotus',
      bezirk: 'Dornbirn',
      category: 'Soundhealing',
      slug: 'cacao-zeremonie',
      description: `<p>${'Ein sehr langer Beschreibungstext. '.repeat(400)}</p>`,
    });
    expect(caption.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(caption).toContain('Cacao Zeremonie');
    expect(caption).toContain('https://www.thetribe.at/event/cacao-zeremonie');
    expect(caption).toContain('#soundhealing');
  });

  it('keeps the line breaks of the description in the caption', () => {
    const caption = buildCaption({
      title: 'Kakao',
      date: '2026-10-17',
      description: '<p>Erste Zeile<br>Zweite Zeile</p><p>Neuer Absatz</p>',
    });
    expect(caption).toContain('Erste Zeile\nZweite Zeile\nNeuer Absatz');
  });

  it('builds a caption for a bare-minimum event without empty sections', () => {
    const caption = buildCaption({ title: 'Kakao', date: '2026-10-17' });
    expect(caption).toContain('Kakao');
    expect(caption).not.toMatch(/\n\n\n/);
    expect(caption).not.toContain('undefined');
  });
});

describe('instagram image rendering', () => {
  it.each([
    ['feed', 1080, 1350],
    ['story', 1080, 1920],
    ['carousel', 1080, 1350],
  ] as const)(
    'renders a %s as a %ix%i JPEG, with and without a source image',
    async (format, w, h) => {
      expect(FORMAT_DIMENSIONS[format]).toEqual({ width: w, height: h });
      const event = {
        title: 'Kakao',
        date: '2026-10-17',
        category: 'Yoga',
        imageUrl: 'https://x/y',
      };
      const photo = await sharp({
        create: { width: 900, height: 1600, channels: 3, background: '#336699' },
      })
        .png()
        .toBuffer();

      for (const fetchImage of [
        async () => photo,
        async () => {
          throw new Error('404'); // broken upload -> fallback layout, not a failure
        },
      ]) {
        const jpeg = await renderEventImage(event, format, { fetchImage });
        const meta = await sharp(jpeg).metadata();
        expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', w, h]);
      }
    }
  );
});

describe('normalizeInstagramHandle', () => {
  it.each([
    ['@kakao.maria', '@kakao.maria'],
    ['kakao_maria', '@kakao_maria'],
    ['  @@Maria ', '@Maria'],
    ['instagram.com/maria', '@maria'],
    ['https://www.instagram.com/maria/', '@maria'],
    ['https://instagram.com/maria.yoga?igsh=abc123', '@maria.yoga'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeInstagramHandle(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '@',
    'maria yoga',
    'maria!',
    'a'.repeat(31),
    'https://facebook.com/maria',
    'https://www.instagram.com/',
    null,
    undefined,
    42,
  ])('rejects %s', (input) => {
    expect(normalizeInstagramHandle(input)).toBeNull();
  });
});

describe('buildCaption organizer tag', () => {
  const ev = { title: 'Kakao', date: '2026-10-17', slug: 'kakao' };

  it('adds a mention when a handle is given', () => {
    expect(buildCaption(ev, 'maria')).toContain('@maria');
  });

  it('adds no mention without a handle or with an invalid one', () => {
    expect(buildCaption(ev)).not.toContain('@');
    expect(buildCaption(ev, null)).not.toContain('@');
    expect(buildCaption(ev, 'not valid!')).not.toContain('@');
  });

  it('stays within the caption limit with a handle', () => {
    const long = { ...ev, description: 'x '.repeat(5000) };
    expect(buildCaption(long, '@maria').length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(buildCaption(long, '@maria')).toContain('@maria');
  });
});

describe('toHashtag', () => {
  it.each([
    ['Dornbirn', '#dornbirn'],
    ['Soundhealing', '#soundhealing'],
    ['Körperarbeit', '#koerperarbeit'],
    ['Straße Übung Ärger Öl', '#strasseuebungaergeroel'],
    ['Café Crème', '#cafecreme'],
    ['Yoga & Bewegung', '#yogabewegung'],
  ])('%s -> %s', (input, expected) => {
    expect(toHashtag(input)).toBe(expected);
  });

  it('returns null for empty or symbol-only input', () => {
    expect(toHashtag('')).toBeNull();
    expect(toHashtag('  & - ✨ ')).toBeNull();
    expect(toHashtag(undefined)).toBeNull();
  });
});

describe('buildHashtags / caption hashtags', () => {
  it('puts Bezirk, category, curated extras and the base set in that order', () => {
    expect(buildHashtags({ bezirk: 'Dornbirn', category: 'Soundhealing' })).toEqual([
      '#dornbirn',
      '#soundhealing',
      '#klangreise',
      '#klangschalen',
      ...BASE_HASHTAGS,
    ]);
  });

  it('uses #online instead of a Bezirk for online events', () => {
    for (const ev of [
      { isOnline: true, bezirk: 'Bregenz', category: 'Yoga' },
      { bezirk: '', category: 'Yoga' },
      { bezirk: 'Online', category: 'Yoga' },
    ]) {
      const tags = buildHashtags(ev);
      expect(tags[0]).toBe('#online');
      expect(tags).not.toContain('#bregenz');
    }
  });

  it('de-duplicates case-insensitively', () => {
    const tags = buildHashtags({ bezirk: 'Vorarlberg', category: 'Meditation' });
    const lower = tags.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(tags.filter((t) => t === '#vorarlberg')).toHaveLength(1);
    expect(tags.filter((t) => t === '#meditation')).toHaveLength(1);
  });

  it('caps the number of hashtags', () => {
    expect(buildHashtags({ bezirk: 'Dornbirn', category: 'Yoga' }, 3)).toEqual([
      '#dornbirn',
      '#yoga',
      '#yogavorarlberg',
    ]);
    expect(buildHashtags({ bezirk: 'Dornbirn', category: 'Tanz' }).length).toBeLessThanOrEqual(12);
  });

  it('skips missing category and works for unknown categories', () => {
    expect(buildHashtags({ bezirk: 'Bludenz' })).toEqual(['#bludenz', ...BASE_HASHTAGS]);
    expect(buildHashtags({ bezirk: 'Bludenz', category: 'Neu & Anders' })).toContain('#neuanders');
  });

  it('ends the caption with the full hashtag line even with a huge description', () => {
    const ev = {
      title: 'Cacao',
      date: '2026-10-17',
      bezirk: 'Feldkirch',
      category: 'Soundhealing',
      slug: 'cacao',
      description: `<p>${'Langer Text. '.repeat(600)}</p>`,
    };
    const caption = buildCaption(ev);
    expect(caption.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(caption.endsWith(buildHashtags(ev).join(' '))).toBe(true);
    expect(caption).toContain('#feldkirch #soundhealing #klangreise');
  });
});
