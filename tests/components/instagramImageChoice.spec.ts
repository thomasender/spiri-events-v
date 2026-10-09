import { describe, expect, it } from 'vitest';
import {
  COVER_SOURCE,
  INSTAGRAM_UPLOAD_SOURCE,
  buildInstagramImageCandidates,
  extractDescriptionImageUrls,
  resolveInstagramImage,
} from '../../src/utils/instagramImageChoice';

const A = 'https://firebasestorage.googleapis.com/a.jpg';
const B = 'https://firebasestorage.googleapis.com/b.jpg';

describe('extractDescriptionImageUrls', () => {
  it('returns distinct web image URLs in order and skips data/blob sources', () => {
    const html = `<p>Hallo</p><img src="${A}"><p><img src="data:image/png;base64,xx"></p><img src="${B}"><img src="${A}"><img src="blob:x">`;
    expect(extractDescriptionImageUrls(html)).toEqual([A, B]);
  });

  it('returns nothing for empty or image-free descriptions', () => {
    expect(extractDescriptionImageUrls('')).toEqual([]);
    expect(extractDescriptionImageUrls('<p>Text</p>')).toEqual([]);
    expect(extractDescriptionImageUrls(undefined)).toEqual([]);
  });
});

describe('buildInstagramImageCandidates', () => {
  it('lists the cover photo first, then the description images', () => {
    const candidates = buildInstagramImageCandidates({
      coverPreview: 'blob:cover',
      description: `<img src="${A}">`,
    });
    expect(candidates.map((c) => [c.source, c.previewUrl])).toEqual([
      [COVER_SOURCE, 'blob:cover'],
      [A, A],
    ]);
  });

  it('adds the extra Instagram photo after the other photos', () => {
    const candidates = buildInstagramImageCandidates({
      coverPreview: 'blob:cover',
      description: `<img src="${A}">`,
      instagramPreview: 'blob:insta',
    });
    expect(candidates.map((c) => c.source)).toEqual([COVER_SOURCE, A, INSTAGRAM_UPLOAD_SOURCE]);
    expect(
      resolveInstagramImage({ source: INSTAGRAM_UPLOAD_SOURCE }, { instagramUploadUrl: B })?.url
    ).toBe(B);
  });

  it('is empty without any photo', () => {
    expect(buildInstagramImageCandidates({ coverPreview: '', description: '<p>x</p>' })).toEqual(
      []
    );
  });
});

describe('resolveInstagramImage', () => {
  it('uses the uploaded cover URL for the cover photo', () => {
    expect(
      resolveInstagramImage(
        { source: COVER_SOURCE, focalPoint: { x: 0.2, y: 0.7 }, zoom: 1.5 },
        { coverUrl: B }
      )
    ).toEqual({ url: B, focalPoint: { x: 0.2, y: 0.7 }, zoom: 1.5 });
  });

  it('keeps a description image URL and clamps zoom and focal point', () => {
    expect(resolveInstagramImage({ source: A, focalPoint: { x: 3, y: -1 }, zoom: 10 })).toEqual({
      url: A,
      focalPoint: { x: 1, y: 0 },
      zoom: 3,
    });
    expect(resolveInstagramImage({ source: A })).toEqual({
      url: A,
      focalPoint: { x: 0.5, y: 0.5 },
      zoom: 1,
    });
  });

  it('returns null when there is nothing usable to store', () => {
    expect(resolveInstagramImage(null)).toBeNull();
    expect(resolveInstagramImage({ source: COVER_SOURCE })).toBeNull();
    expect(resolveInstagramImage({ source: 'blob:x' })).toBeNull();
  });
});
